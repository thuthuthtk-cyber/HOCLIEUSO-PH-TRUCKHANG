import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Type } from '@google/genai';
import {
  INTEGRATION_CATEGORIES,
  LESSON_PLAN_GRADES,
  LESSON_PLAN_SUBJECTS,
  LESSON_PLAN_TEXTBOOKS,
  NLS_INDICATOR_LIBRARY,
  type GeneratedLessonPlan,
  type IntegrationCategoryId,
  type LessonPlanActivityStep,
  type LessonPlanConfig,
} from '../src/types/lessonPlan';
import {
  PRIMARY_SERVER_TEXT_MODEL,
  extractServerGeminiErrorMessage,
  getServerGeminiClient,
} from './geminiServerClient.ts';

class HttpStatusError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface FirebaseRuntimeConfig {
  projectId: string;
  databaseId: string;
}

interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

let certCache: CertCache | null = null;

function getFirebaseConfig(): FirebaseRuntimeConfig {
  let fileProjectId = '';
  let fileDatabaseId = '';

  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
        projectId?: string;
        firestoreDatabaseId?: string;
      };
      fileProjectId = raw.projectId || '';
      fileDatabaseId = raw.firestoreDatabaseId || '';
    }
  } catch {
    // Fallback to env vars
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    fileProjectId;
  const databaseId =
    process.env.FIREBASE_DATABASE_ID ||
    process.env.VITE_FIREBASE_DATABASE_ID ||
    fileDatabaseId ||
    '(default)';

  if (!projectId) {
    throw new HttpStatusError(500, 'Thiếu cấu hình Firebase Project ID trên máy chủ.');
  }

  return { projectId, databaseId };
}

function decodeBase64Url(segment: string): Buffer {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && certCache.expiresAt > now) {
    return certCache.certs;
  }

  const response = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!response.ok) {
    throw new HttpStatusError(500, 'Không thể tải chứng chỉ xác thực Firebase.');
  }

  const certs = (await response.json()) as Record<string, string>;
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const ttlMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600 * 1000;

  certCache = {
    certs,
    expiresAt: now + Math.max(ttlMs, 60_000),
  };

  return certs;
}

function extractSsoIdentity(
  headers?: IncomingMessage['headers'],
  body?: unknown
): { ssoEmail: string; ssoUid: string } {
  const rawHeaderEmail = headers?.['x-sso-email'];
  const headerEmail = (
    Array.isArray(rawHeaderEmail) ? rawHeaderEmail[0] : rawHeaderEmail || ''
  ).trim();
  const rawHeaderUid = headers?.['x-sso-uid'];
  const headerUid = (
    Array.isArray(rawHeaderUid) ? rawHeaderUid[0] : rawHeaderUid || ''
  ).trim();

  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const bodyEmail = typeof payload.ssoEmail === 'string' ? payload.ssoEmail.trim() : '';
  const bodyUid = typeof payload.ssoUid === 'string' ? payload.ssoUid.trim() : '';

  return {
    ssoEmail: headerEmail || bodyEmail,
    ssoUid: headerUid || bodyUid,
  };
}

async function verifyTeacherAuth(
  authHeader: string | undefined,
  cfg: FirebaseRuntimeConfig,
  headers?: IncomingMessage['headers'],
  body?: unknown
): Promise<{ uid: string; idToken: string }> {
  const { ssoEmail, ssoUid } = extractSsoIdentity(headers, body);
  if (ssoEmail || !authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      uid: ssoUid || 'sso_thuthuthtk',
      idToken: '',
    };
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    return {
      uid: ssoUid || 'sso_thuthuthtk',
      idToken: '',
    };
  }

  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new HttpStatusError(401, 'Firebase ID token không hợp lệ.');
  }

  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(decodeBase64Url(headerB64).toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(decodeBase64Url(payloadB64).toString('utf8')) as {
    aud?: string;
    iss?: string;
    exp?: number;
    sub?: string;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new HttpStatusError(401, 'Thuật toán token không được hỗ trợ.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (
    payload.aud !== cfg.projectId ||
    payload.iss !== `https://securetoken.google.com/${cfg.projectId}` ||
    !payload.exp ||
    payload.exp <= nowSec ||
    !payload.sub
  ) {
    throw new HttpStatusError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  }

  const certs = await getFirebasePublicCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new HttpStatusError(401, 'Không tìm thấy chứng chỉ khóa công khai phù hợp.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  if (!verifier.verify(cert, decodeBase64Url(sigB64))) {
    throw new HttpStatusError(401, 'Chữ ký Firebase ID token không hợp lệ.');
  }

  const profileUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    cfg.projectId
  )}/databases/${encodeURIComponent(cfg.databaseId)}/documents/users/${encodeURIComponent(
    payload.sub
  )}`;
  const profileRes = await fetch(profileUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (profileRes.status === 404 || profileRes.status === 403) {
    throw new HttpStatusError(403, 'Tài khoản chưa được cấp hồ sơ giáo viên hợp lệ.');
  }
  if (!profileRes.ok) {
    throw new HttpStatusError(500, 'Không thể xác minh quyền tài khoản trên Firestore.');
  }

  const doc = (await profileRes.json()) as {
    fields?: { biKhoa?: { booleanValue?: boolean }; vaiTro?: { stringValue?: string } };
  };
  if (doc.fields?.biKhoa?.booleanValue === true) {
    throw new HttpStatusError(403, 'Tài khoản của bạn đang bị khóa.');
  }
  const role = doc.fields?.vaiTro?.stringValue || 'giaoVien';
  if (!['giaoVien', 'toTruong', 'quanTri'].includes(role)) {
    throw new HttpStatusError(403, 'Vai trò tài khoản không có quyền soạn kế hoạch bài dạy AI.');
  }

  return { uid: payload.sub, idToken };
}

const LESSON_PLAN_SYSTEM_INSTRUCTION = `Bạn là Chuyên gia Giáo dục Tiểu học Việt Nam, am hiểu sâu sắc Chương trình Giáo dục Phổ thông 2018 và Công văn 2345/BGDĐT-GDTH về xây dựng Kế hoạch bài dạy (Giáo án 1 tiết - 35 phút) đã ký duyệt chuẩn tại Trường Tiểu học Quang Hưng - Phân hiệu Trực Khang (Trực Ninh, Nam Định).

QUY TẮC CHUẨN HÓA VĂN PHONG GIÁO ÁN CỦA TRƯỜNG:
1. Mục I. YÊU CẦU CẦN ĐẠT:
   - \`kienThucKiNang\`: Các gạch đầu dòng ngắn gọn, bắt đầu bằng động từ hành động cụ thể học sinh làm được sau tiết học (VD: "Biết được...", "Thực hiện được...", "Tạo được...").
   - \`nangLucDacThu\` (góp phần hình thành các năng lực đặc thù + năng lực số):
     * Ghi rõ năng lực đặc thù của môn học (VD: "Năng lực Tin học: ...", "Năng lực công nghệ: ...", "Năng lực toán học: ...").
     * Nếu có tích hợp Năng lực số (NLS), BẮT BUỘC ghi rõ mã chỉ báo và mô tả ngay tại đây, ví dụ: "- Năng lực số (NLS 3.1.CB2.a): ...".
   - \`nangLucChung\`: Nêu rõ 3 năng lực chung với biểu hiện gắn bài học: "Tự chủ và tự học", "Giao tiếp và hợp tác", "Giải quyết vấn đề và sáng tạo".
   - \`phamChat\`: Chăm chỉ, Trách nhiệm, Trung thực / Nhân ái (gắn biểu hiện cụ thể trong tiết học).
   - \`giaoDucTichHop\`: Liệt kê từng nội dung tích hợp/lồng ghép đã chọn:
     * VD: "- NLS 3.1.CB2.a (...)"
     * VD: "- Tích hợp Giáo dục địa phương / Văn hóa địa phương (Mức độ Liên hệ/Bộ phận): ..."
     * VD: "- Tích hợp STEAM - Bước ...: ..."
     * Nếu không chọn nội dung tích hợp nào, chỉ ghi đúng 1 phần tử: "Không có nội dung tích hợp.".

2. Mục II. ĐỒ DÙNG DẠY HỌC:
   - Tách rõ \`giaoVien\` (máy tính, ti vi, bài giảng PPT, phiếu học tập, đồ dùng trực quan...) và \`hocSinh\` (SGK, vở, bút, bảng con, thiết bị thực hành...).

3. Mục III. HOẠT ĐỘNG DẠY HỌC (TỔNG THỜI GIAN BẮT BUỘC = 35 PHÚT):
   - Chia đúng 4 phần có tổng thời gian = 35 phút:
     1) \`khoiDong\`: khoảng 4-5 phút.
     2) \`khamPha\`: Gồm ĐÚNG 2 hoạt động (\`Hoạt động 1\` và \`Hoạt động 2\`), tổng khoảng 12-14 phút.
     3) \`luyenTap\`: Gồm ĐÚNG 2 hoạt động (\`Hoạt động 1\` và \`Hoạt động 2\`), tổng khoảng 10-12 phút.
     4) \`vanDung\`: khoảng 5-6 phút.
   - Trường \`hinhThucToChuc\` / \`hinhThucVaDanhGia\` ở mỗi hoạt động phải viết ngắn gọn theo đúng mẫu trường trong ngoặc đơn hoặc câu súc tích:
     "(HS làm việc cá nhân/nhóm đôi/nhóm 4/cả lớp; đánh giá: GV quan sát, nhận xét...)".
   - TẠI HOẠT ĐỘNG CÓ LỒNG GHÉP / TÍCH HỢP (Khám phá, Luyện tập hoặc Vận dụng):
     * Ghi rõ tiêu đề nội dung tích hợp trong trường \`noiDungTichHopLongGhep\` theo cấu trúc:
       "Nội dung lồng ghép, tích hợp: [Tên nội dung tích hợp cụ thể - VD: Giáo dục địa phương / Năng lực số NLS 3.1.CB2.a / STEAM Bước ...]"
     * Đồng thời, trong \`hoatDongGV\` (cột trái) ghi rõ thao tác, câu hỏi gợi mở của GV và trong \`hoatDongHS\` (cột phải) ghi rõ câu trả lời/thực hành của HS cho nội dung lồng ghép đó!
     * Hoạt động nào không lồng ghép thì để \`noiDungTichHopLongGhep = ""\`.

4. Lưu ý học sinh khuyết tật học hòa nhập (\`luuYHSKT\`):
   - Khi lớp CÓ học sinh khuyết tật: AI BẮT BUỘC soạn chi tiết hướng dẫn điều chỉnh vừa sức theo từng hoạt động trên nhiều dòng rõ ràng:
     "- Đối tượng HSKT: [Tóm tắt thông tin HSKT giáo viên đã nhập]
- Khởi động: [Điều chỉnh hoạt động khởi động cho HSKT]
- Khám phá HĐ1, HĐ2: [Điều chỉnh câu hỏi/hỗ trợ bạn cùng bàn hoặc GV hướng dẫn trực tiếp]
- Luyện tập HĐ1, HĐ2: [Giảm nhẹ định mức/giao nhiệm vụ vừa sức cho HSKT]
- Vận dụng: [Khuyến khích chia sẻ theo khả năng]
- Đánh giá HS khuyết tật: Đánh giá theo mức độ tiến bộ cá nhân, động viên khích lệ là chính."
   - Khi không có HSKT: ghi rõ "Lưu ý: Nếu lớp có HS khuyết tật học hòa nhập, GV linh hoạt giảm nhẹ yêu cầu, giao nhiệm vụ vừa sức, bố trí bạn hỗ trợ và đánh giá theo sự tiến bộ cá nhân của HS."`;

const ACTIVITY_STEP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    tenHoatDong: { type: Type.STRING },
    thoiGianPhut: { type: Type.INTEGER },
    hinhThucVaDanhGia: { type: Type.STRING },
    hoatDongGV: { type: Type.ARRAY, items: { type: Type.STRING } },
    hoatDongHS: { type: Type.ARRAY, items: { type: Type.STRING } },
    noiDungTichHopLongGhep: { type: Type.STRING },
  },
  required: [
    'tenHoatDong',
    'thoiGianPhut',
    'hinhThucVaDanhGia',
    'hoatDongGV',
    'hoatDongHS',
    'noiDungTichHopLongGhep',
  ],
};

const LESSON_PLAN_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    header: {
      type: Type.OBJECT,
      properties: {
        monHoc: { type: Type.STRING },
        tenBaiHoc: { type: Type.STRING },
        ngayDayLop: { type: Type.STRING },
      },
      required: ['monHoc', 'tenBaiHoc', 'ngayDayLop'],
    },
    yeuCauCanDat: {
      type: Type.OBJECT,
      properties: {
        kienThucKiNang: { type: Type.ARRAY, items: { type: Type.STRING } },
        nangLucDacThu: { type: Type.ARRAY, items: { type: Type.STRING } },
        nangLucChung: { type: Type.ARRAY, items: { type: Type.STRING } },
        phamChat: { type: Type.ARRAY, items: { type: Type.STRING } },
        giaoDucTichHop: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: [
        'kienThucKiNang',
        'nangLucDacThu',
        'nangLucChung',
        'phamChat',
        'giaoDucTichHop',
      ],
    },
    doDungDayHoc: {
      type: Type.OBJECT,
      properties: {
        giaoVien: { type: Type.ARRAY, items: { type: Type.STRING } },
        hocSinh: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['giaoVien', 'hocSinh'],
    },
    hoatDongDayHoc: {
      type: Type.OBJECT,
      properties: {
        khoiDong: {
          type: Type.OBJECT,
          properties: {
            thoiGianPhut: { type: Type.INTEGER },
            hinhThucToChuc: { type: Type.STRING },
            hoatDongGV: { type: Type.ARRAY, items: { type: Type.STRING } },
            hoatDongHS: { type: Type.ARRAY, items: { type: Type.STRING } },
            noiDungTichHopLongGhep: { type: Type.STRING },
          },
          required: ['thoiGianPhut', 'hinhThucToChuc', 'hoatDongGV', 'hoatDongHS'],
        },
        khamPha: {
          type: Type.ARRAY,
          items: ACTIVITY_STEP_SCHEMA,
        },
        luyenTap: {
          type: Type.ARRAY,
          items: ACTIVITY_STEP_SCHEMA,
        },
        vanDung: {
          type: Type.OBJECT,
          properties: {
            thoiGianPhut: { type: Type.INTEGER },
            hinhThucVaDanhGia: { type: Type.STRING },
            hoatDongGV: { type: Type.ARRAY, items: { type: Type.STRING } },
            hoatDongHS: { type: Type.ARRAY, items: { type: Type.STRING } },
            noiDungTichHopLongGhep: { type: Type.STRING },
          },
          required: [
            'thoiGianPhut',
            'hinhThucVaDanhGia',
            'hoatDongGV',
            'hoatDongHS',
            'noiDungTichHopLongGhep',
          ],
        },
        luuYHSKT: { type: Type.STRING },
      },
      required: ['khoiDong', 'khamPha', 'luyenTap', 'vanDung', 'luuYHSKT'],
    },
    dieuChinhSauBaiDay: { type: Type.STRING },
  },
  required: [
    'header',
    'yeuCauCanDat',
    'doDungDayHoc',
    'hoatDongDayHoc',
    'dieuChinhSauBaiDay',
  ],
};

function sanitizeStringArray(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  const cleaned = raw.map((item) => String(item ?? '').trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : fallback;
}

function clampMinutes(val: unknown, fallback: number): number {
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(20, Math.max(2, Math.round(num)));
}

function balanceTotalMinutesTo35(
  khoiDongMin: number,
  kp1Min: number,
  kp2Min: number,
  lt1Min: number,
  lt2Min: number,
  vanDungMin: number
): [number, number, number, number, number, number] {
  const arr: [number, number, number, number, number, number] = [
    khoiDongMin,
    kp1Min,
    kp2Min,
    lt1Min,
    lt2Min,
    vanDungMin,
  ];
  let sum = arr.reduce((a, b) => a + b, 0);
  const adjustOrder = [1, 3, 2, 4, 5, 0];
  let safety = 0;
  while (sum !== 35 && safety < 50) {
    for (const idx of adjustOrder) {
      if (sum === 35) break;
      if (sum < 35) {
        arr[idx] += 1;
        sum += 1;
      } else if (arr[idx] > 3) {
        arr[idx] -= 1;
        sum -= 1;
      }
    }
    safety += 1;
  }
  return arr;
}

function cleanIntegrationCellText(raw: unknown): string {
  const txt = typeof raw === 'string' ? raw.trim() : '';
  if (!txt || /^không\.?$/i.test(txt)) return '';
  return txt.replace(/^Nội dung lồng ghép,\s*tích hợp(?:\s*\(nếu có\))?\s*:\s*/i, '').trim();
}

function normalizeActivityStep(
  raw: unknown,
  defaultName: string,
  defaultMinutes: number
): LessonPlanActivityStep {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cleanedIntegration = cleanIntegrationCellText(obj.noiDungTichHopLongGhep);

  return {
    tenHoatDong:
      typeof obj.tenHoatDong === 'string' && obj.tenHoatDong.trim()
        ? obj.tenHoatDong.trim()
        : defaultName,
    thoiGianPhut: clampMinutes(obj.thoiGianPhut, defaultMinutes),
    hinhThucVaDanhGia:
      typeof obj.hinhThucVaDanhGia === 'string' && obj.hinhThucVaDanhGia.trim()
        ? obj.hinhThucVaDanhGia.trim()
        : '(HS làm việc nhóm đôi/cá nhân; đánh giá: GV quan sát, nhận xét, tuyên dương)',
    hoatDongGV: sanitizeStringArray(obj.hoatDongGV, [
      '- Tổ chức cho HS thực hiện nhiệm vụ học tập và hỗ trợ kịp thời.',
    ]),
    hoatDongHS: sanitizeStringArray(obj.hoatDongHS, [
      '- Lắng nghe yêu cầu, thực hiện nhiệm vụ và trình bày kết quả.',
    ]),
    noiDungTichHopLongGhep: cleanedIntegration,
  };
}

function buildLessonPlanPrompt(config: LessonPlanConfig): string {
  const selectedIds = new Set<IntegrationCategoryId>(config.selectedIntegrations || []);
  if (config.noiDungGiaoDucDiaPhuong?.trim()) {
    selectedIds.add('GDDP');
  }
  if (
    (config.maNlsSelected && config.maNlsSelected.length > 0) ||
    config.chiTietNlsAi?.trim()
  ) {
    selectedIds.add('CDS_NLS_AI');
  }

  const selectedMetas = INTEGRATION_CATEGORIES.filter((cat) => selectedIds.has(cat.id));

  const nlsDetailList = (config.maNlsSelected || [])
    .map((code) => {
      const found = NLS_INDICATOR_LIBRARY.find((n) => n.code === code);
      return found ? `${found.code} (${found.description})` : code;
    })
    .join('; ');

  const integrationLines = selectedMetas.map((m) => {
    if (m.id === 'GDDP') {
      const level = config.mucDoGddp || 'Liên hệ';
      return `  + [GDDP] Giáo dục địa phương / Văn hóa địa phương — Mức độ: ${level}. Chi tiết: ${
        config.noiDungGiaoDucDiaPhuong?.trim() || m.goiYChuDe
      }`;
    }
    if (m.id === 'CDS_NLS_AI') {
      return `  + [CDS_NLS_AI] Năng lực số & Trí tuệ nhân tạo AI — Chỉ báo đã chọn: ${
        nlsDetailList || 'Tích hợp kỹ năng số phù hợp lứa tuổi'
      }. ${config.chiTietNlsAi?.trim() || ''}`;
    }
    if (m.id === 'STEM') {
      return `  + [STEM/STEAM] Giáo dục STEM / STEAM (${
        config.steamStep || 'Thiết kế/Chế tạo theo quy trình kĩ thuật'
      }).`;
    }
    return `  + [${m.id}] ${m.tenNhom} (${m.canCuPhapLy}) — Mức độ: ${m.goiYMucDoMacDinh}.`;
  });

  const teacherModeText =
    config.loaiGiaoVien === 'GV_CHU_NHIEM'
      ? 'Giáo viên chủ nhiệm (1 tiết dạy trên lớp)'
      : 'Giáo viên dạy nhiều lớp / Môn chuyên (Tin học, Công nghệ, Tiếng Anh, Âm nhạc, Mĩ thuật...)';

  return `Hãy soạn Kế hoạch bài dạy (Giáo án 1 tiết = 35 phút) chuẩn mẫu đã ký duyệt của Trường Tiểu học Quang Hưng - Phân hiệu Trực Khang:

THÔNG TIN CHUNG:
- Kiểu giáo án: ${teacherModeText}
- Môn học: ${config.monHoc} lớp ${config.khoiLop}
- Bộ sách giáo khoa: ${config.boSach}
- Tên bài học & Tiết dạy: ${config.tenBaiHoc.trim()}${
    config.tietSo?.trim() ? ` (${config.tietSo.trim()})` : ''
  }
- Ngày dạy / Lớp: ${config.ngayDayLop.trim() || `Lớp ${config.khoiLop}C; ${config.khoiLop}D`}

NỘI DUNG TÍCH HỢP / LỒNG GHÉP ĐƯỢC CHỌN:
${
  integrationLines.length > 0
    ? integrationLines.join('\n')
    : '  (Không chọn nội dung tích hợp riêng; trong I.3 ghi rõ "Không có nội dung tích hợp.")'
}
${
  config.noiDungTichHopKhac?.trim()
    ? `- Yêu cầu tích hợp bổ sung từ giáo viên: ${config.noiDungTichHopKhac.trim()}`
    : ''
}

HỌC SINH KHUYẾT TẬT HỌC HÒA NHẬP:
- Tình trạng lớp có HSKT: ${config.coHocSinhKhuyetTat ? 'CÓ học sinh khuyết tật học hòa nhập' : 'Không có thông tin HSKT cụ thể'}
${
  config.coHocSinhKhuyetTat
    ? `- Thông tin chi tiết HSKT: ${
        config.ghiChuHSKT?.trim() ||
        'HS khuyết tật trí tuệ / tiếp thu chậm cần điều chỉnh giảm nhẹ'
      }
  => BẮT BUỘC trong \`luuYHSKT\` soạn rõ từng gạch đầu dòng điều chỉnh cụ thể cho từng hoạt động:
     - Đối tượng HSKT: ...
     - Khởi động: ...
     - Khám phá HĐ1, HĐ2: ...
     - Luyện tập HĐ1, HĐ2: ...
     - Vận dụng: ...
     - Đánh giá HS khuyết tật: theo mức độ tiến bộ cá nhân...`
    : ''
}

YÊU CẦU ĐẶC BIỆT:
- Tổng thời gian của Khởi động + Khám phá (HĐ1 + HĐ2) + Luyện tập (HĐ1 + HĐ2) + Vận dụng PHẢI ĐÚNG BẰNG 35 PHÚT.
- Nếu có mã Năng lực số (${nlsDetailList || 'không'}), phải ghi rõ mã và mô tả ở CẢ mục \`nangLucDacThu\` và \`giaoDucTichHop\`.`;
}

function normalizeGeneratedLessonPlan(
  raw: Record<string, unknown>,
  config: LessonPlanConfig
): GeneratedLessonPlan {
  const rawHeader = (
    raw.header && typeof raw.header === 'object' ? raw.header : {}
  ) as Record<string, unknown>;
  const rawYccd = (
    raw.yeuCauCanDat && typeof raw.yeuCauCanDat === 'object' ? raw.yeuCauCanDat : {}
  ) as Record<string, unknown>;
  const rawDoDung = (
    raw.doDungDayHoc && typeof raw.doDungDayHoc === 'object' ? raw.doDungDayHoc : {}
  ) as Record<string, unknown>;
  const rawHd = (
    raw.hoatDongDayHoc && typeof raw.hoatDongDayHoc === 'object' ? raw.hoatDongDayHoc : {}
  ) as Record<string, unknown>;

  const rawKhoiDong = (
    rawHd.khoiDong && typeof rawHd.khoiDong === 'object' ? rawHd.khoiDong : {}
  ) as Record<string, unknown>;
  const rawVanDung = (
    rawHd.vanDung && typeof rawHd.vanDung === 'object' ? rawHd.vanDung : {}
  ) as Record<string, unknown>;

  const rawKhamPha = Array.isArray(rawHd.khamPha) ? rawHd.khamPha : [];
  const kp1 = normalizeActivityStep(rawKhamPha[0], 'Hình thành kiến thức mới (HĐ 1)', 7);
  const kp2 = normalizeActivityStep(rawKhamPha[1], 'Khám phá & mở rộng kiến thức (HĐ 2)', 7);

  const rawLuyenTap = Array.isArray(rawHd.luyenTap) ? rawHd.luyenTap : [];
  const lt1 = normalizeActivityStep(rawLuyenTap[0], 'Thực hành bài tập cơ bản (HĐ 1)', 6);
  const lt2 = normalizeActivityStep(rawLuyenTap[1], 'Thực hành nâng cao / theo nhóm (HĐ 2)', 5);

  const [kdMin, kp1Min, kp2Min, lt1Min, lt2Min, vdMin] = balanceTotalMinutesTo35(
    clampMinutes(rawKhoiDong.thoiGianPhut, 5),
    kp1.thoiGianPhut || 7,
    kp2.thoiGianPhut || 7,
    lt1.thoiGianPhut || 6,
    lt2.thoiGianPhut || 5,
    clampMinutes(rawVanDung.thoiGianPhut, 5)
  );
  kp1.thoiGianPhut = kp1Min;
  kp2.thoiGianPhut = kp2Min;
  lt1.thoiGianPhut = lt1Min;
  lt2.thoiGianPhut = lt2Min;

  const nangLucDacThu = sanitizeStringArray(rawYccd.nangLucDacThu, [
    `Năng lực đặc thù môn ${config.monHoc}: Vận dụng được kiến thức, thao tác chuẩn của bài "${config.tenBaiHoc.trim()}".`,
  ]);
  const nangLucChung = sanitizeStringArray(rawYccd.nangLucChung, [
    'Tự chủ và tự học: Tự giác thực hiện nhiệm vụ học tập được giao.',
    'Giao tiếp và hợp tác: Trao đổi, chia sẻ ý kiến rõ ràng trong nhóm.',
    'Giải quyết vấn đề và sáng tạo: Linh hoạt xử lý tình huống học tập.',
  ]);

  const fallbackIntegrations: string[] = [];
  if (
    config.selectedIntegrations?.includes('GDDP') ||
    config.noiDungGiaoDucDiaPhuong?.trim()
  ) {
    fallbackIntegrations.push(
      `- Tích hợp Giáo dục địa phương (Mức độ ${config.mucDoGddp || 'Liên hệ'}): ${
        config.noiDungGiaoDucDiaPhuong?.trim() ||
        'Liên hệ thực tế quê hương Quang Hưng - Trực Khang gắn với nội dung bài học.'
      }`
    );
  }
  if (config.maNlsSelected && config.maNlsSelected.length > 0) {
    config.maNlsSelected.forEach((code) => {
      const meta = NLS_INDICATOR_LIBRARY.find((n) => n.code === code);
      fallbackIntegrations.push(
        `- ${code}: ${meta?.description || 'Phát triển năng lực số phù hợp cấp Tiểu học.'}`
      );
    });
  }
  if (config.selectedIntegrations?.includes('STEM')) {
    fallbackIntegrations.push(
      `- Tích hợp STEAM (${config.steamStep || 'Theo quy trình kĩ thuật'}): Vận dụng kiến thức tạo sản phẩm thực tiễn.`
    );
  }

  const normalizedHskt =
    typeof rawHd.luuYHSKT === 'string' && rawHd.luuYHSKT.trim()
      ? rawHd.luuYHSKT.trim()
      : config.coHocSinhKhuyetTat
        ? [
            `- Đối tượng HSKT: ${config.ghiChuHSKT?.trim() || 'HS khuyết tật học hòa nhập'}`,
            '- Khởi động: Cho HS tham gia vỗ tay, trả lời câu hỏi gợi mở đơn giản.',
            '- Khám phá HĐ1, HĐ2: GV hướng dẫn trực tiếp từng bước ngắn, bố trí bạn ngồi cạnh hỗ trợ.',
            '- Luyện tập HĐ1, HĐ2: Giao phần nhiệm vụ cơ bản nhất, giảm bớt số lượng yêu cầu.',
            '- Vận dụng: Khuyến khích HS nêu được 1 ý đơn giản hoặc thực hiện thao tác mẫu.',
            '- Đánh giá HS khuyết tật: Đánh giá theo mức độ tiến bộ cá nhân, động viên khích lệ kịp thời.',
          ].join('\n')
        : 'Lưu ý: Nếu lớp có HS khuyết tật học hòa nhập, GV linh hoạt giảm nhẹ yêu cầu, bố trí bạn hỗ trợ và đánh giá theo sự tiến bộ cá nhân của HS.';

  return {
    header: {
      loaiGiaoVien: config.loaiGiaoVien || 'GV_CHUYEN',
      monHoc: `${config.monHoc} lớp ${config.khoiLop}`,
      khoiLop: config.khoiLop,
      tenBaiHoc: (
        (typeof rawHeader.tenBaiHoc === 'string' && rawHeader.tenBaiHoc.trim()) ||
        config.tenBaiHoc.trim()
      ).toUpperCase(),
      ngayDayLop:
        config.ngayDayLop.trim() ||
        (typeof rawHeader.ngayDayLop === 'string' && rawHeader.ngayDayLop.trim()) ||
        `Lớp ${config.khoiLop}C; ${config.khoiLop}D`,
      tietSo: config.tietSo?.trim() || '',
      hienThiKhungKyDuyet: Boolean(config.hienThiKhungKyDuyet),
      ngaySoan: config.ngaySoan?.trim() || '',
      tuanSo: config.tuanSo?.trim() || '',
      thoiGianThucHien: config.thoiGianThucHien?.trim() || '',
    },
    yeuCauCanDat: {
      kienThucKiNang: sanitizeStringArray(rawYccd.kienThucKiNang, [
        `Biết và thực hiện được các yêu cầu cơ bản của bài "${config.tenBaiHoc.trim()}".`,
      ]),
      nangLucDacThu,
      nangLucChung,
      nangLuc: [...nangLucDacThu, ...nangLucChung],
      phamChat: sanitizeStringArray(rawYccd.phamChat, [
        'Chăm chỉ: Tích cực tham gia các hoạt động học tập trên lớp.',
        'Trách nhiệm: Có ý thức hoàn thành nhiệm vụ cá nhân và nhóm; giữ gìn thiết bị, đồ dùng học tập.',
        'Trung thực, nhân ái: Mạnh dạn báo cáo đúng kết quả, biết giúp đỡ bạn bè.',
      ]),
      giaoDucTichHop: sanitizeStringArray(
        rawYccd.giaoDucTichHop,
        fallbackIntegrations.length > 0
          ? fallbackIntegrations
          : ['Không có nội dung tích hợp.']
      ),
    },
    doDungDayHoc: {
      giaoVien: sanitizeStringArray(rawDoDung.giaoVien, [
        `SGK ${config.monHoc} ${config.khoiLop} (${config.boSach}), kế hoạch bài dạy, bài giảng điện tử, máy tính, ti vi.`,
      ]),
      hocSinh: sanitizeStringArray(rawDoDung.hocSinh, [
        `SGK ${config.monHoc} ${config.khoiLop}, vở ghi, đồ dùng học tập cá nhân.`,
      ]),
    },
    hoatDongDayHoc: {
      khoiDong: {
        thoiGianPhut: kdMin,
        hinhThucToChuc:
          typeof rawKhoiDong.hinhThucToChuc === 'string' &&
          rawKhoiDong.hinhThucToChuc.trim()
            ? rawKhoiDong.hinhThucToChuc.trim()
            : '(HS làm việc cả lớp; đánh giá: GV quan sát, nhận xét)',
        hoatDongGV: sanitizeStringArray(rawKhoiDong.hoatDongGV, [
          '- Tổ chức trò chơi/hoạt động khởi động và dẫn dắt vào bài mới.',
        ]),
        hoatDongHS: sanitizeStringArray(rawKhoiDong.hoatDongHS, [
          '- Tham gia khởi động tích cực và nêu dự đoán về nội dung bài học.',
        ]),
        noiDungTichHopLongGhep: cleanIntegrationCellText(rawKhoiDong.noiDungTichHopLongGhep),
      },
      khamPha: [kp1, kp2],
      luyenTap: [lt1, lt2],
      vanDung: {
        thoiGianPhut: vdMin,
        hinhThucVaDanhGia:
          typeof rawVanDung.hinhThucVaDanhGia === 'string' &&
          rawVanDung.hinhThucVaDanhGia.trim()
            ? rawVanDung.hinhThucVaDanhGia.trim()
            : '(HS làm việc cá nhân/chia sẻ trước lớp; đánh giá: GV nhận xét, tuyên dương)',
        hoatDongGV: sanitizeStringArray(rawVanDung.hoatDongGV, [
          '- Giao nhiệm vụ vận dụng kiến thức đã học vào tình huống thực tế và dặn dò HS.',
        ]),
        hoatDongHS: sanitizeStringArray(rawVanDung.hoatDongHS, [
          '- Chia sẻ cách vận dụng vào thực tế gia đình, địa phương và chuẩn bị bài sau.',
        ]),
        noiDungTichHopLongGhep: cleanIntegrationCellText(rawVanDung.noiDungTichHopLongGhep),
      },
      luuYHSKT: normalizedHskt,
    },
    dieuChinhSauBaiDay:
      typeof raw.dieuChinhSauBaiDay === 'string' && raw.dieuChinhSauBaiDay.trim()
        ? raw.dieuChinhSauBaiDay.trim()
        : '........................................................................................................................................................................',
  };
}

function validateLessonPlanConfig(raw: unknown): LessonPlanConfig {
  const payload = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const monHoc = typeof payload.monHoc === 'string' ? payload.monHoc.trim() : '';
  const khoiLop = typeof payload.khoiLop === 'string' ? payload.khoiLop.trim() : '';
  const boSach = typeof payload.boSach === 'string' ? payload.boSach.trim() : '';
  const tenBaiHoc = typeof payload.tenBaiHoc === 'string' ? payload.tenBaiHoc.trim() : '';

  if (!LESSON_PLAN_SUBJECTS.includes(monHoc as LessonPlanConfig['monHoc'])) {
    throw new HttpStatusError(400, 'Vui lòng chọn môn học hợp lệ.');
  }
  if (!LESSON_PLAN_GRADES.includes(khoiLop as LessonPlanConfig['khoiLop'])) {
    throw new HttpStatusError(400, 'Vui lòng chọn khối lớp từ 1 đến 5.');
  }
  if (!LESSON_PLAN_TEXTBOOKS.includes(boSach as LessonPlanConfig['boSach'])) {
    throw new HttpStatusError(400, 'Vui lòng chọn bộ sách giáo khoa hợp lệ.');
  }
  if (tenBaiHoc.length < 2 || tenBaiHoc.length > 220) {
    throw new HttpStatusError(400, 'Vui lòng nhập Tên bài học / Tiết dạy cần soạn.');
  }

  return {
    loaiGiaoVien: payload.loaiGiaoVien === 'GV_CHU_NHIEM' ? 'GV_CHU_NHIEM' : 'GV_CHUYEN',
    hienThiKhungKyDuyet: Boolean(payload.hienThiKhungKyDuyet),
    ngaySoan: typeof payload.ngaySoan === 'string' ? payload.ngaySoan.trim().slice(0, 60) : '',
    tuanSo: typeof payload.tuanSo === 'string' ? payload.tuanSo.trim().slice(0, 20) : '',
    thoiGianThucHien:
      typeof payload.thoiGianThucHien === 'string'
        ? payload.thoiGianThucHien.trim().slice(0, 120)
        : '',
    tietSo: typeof payload.tietSo === 'string' ? payload.tietSo.trim().slice(0, 40) : '',
    monHoc: monHoc as LessonPlanConfig['monHoc'],
    khoiLop: khoiLop as LessonPlanConfig['khoiLop'],
    boSach: boSach as LessonPlanConfig['boSach'],
    tenBaiHoc,
    ngayDayLop:
      typeof payload.ngayDayLop === 'string' ? payload.ngayDayLop.trim().slice(0, 200) : '',
    selectedIntegrations: Array.isArray(payload.selectedIntegrations)
      ? (payload.selectedIntegrations.filter((x) => typeof x === 'string') as IntegrationCategoryId[])
      : [],
    mucDoGddp:
      payload.mucDoGddp === 'Bộ phận' || payload.mucDoGddp === 'Toàn phần'
        ? payload.mucDoGddp
        : 'Liên hệ',
    noiDungGiaoDucDiaPhuong:
      typeof payload.noiDungGiaoDucDiaPhuong === 'string'
        ? payload.noiDungGiaoDucDiaPhuong.trim().slice(0, 1000)
        : '',
    maNlsSelected: Array.isArray(payload.maNlsSelected)
      ? payload.maNlsSelected.filter((x): x is string => typeof x === 'string').slice(0, 10)
      : [],
    chiTietNlsAi:
      typeof payload.chiTietNlsAi === 'string' ? payload.chiTietNlsAi.trim().slice(0, 600) : '',
    steamStep:
      typeof payload.steamStep === 'string' ? payload.steamStep.trim().slice(0, 150) : '',
    noiDungTichHopKhac:
      typeof payload.noiDungTichHopKhac === 'string'
        ? payload.noiDungTichHopKhac.trim().slice(0, 800)
        : '',
    coHocSinhKhuyetTat: Boolean(payload.coHocSinhKhuyetTat),
    ghiChuHSKT:
      typeof payload.ghiChuHSKT === 'string' ? payload.ghiChuHSKT.trim().slice(0, 800) : '',
  };
}

export async function generateLessonPlanForRequest(
  authHeader: string | undefined,
  body: unknown,
  headers?: IncomingMessage['headers']
): Promise<GeneratedLessonPlan> {
  const cfg = getFirebaseConfig();
  await verifyTeacherAuth(authHeader, cfg, headers, body);

  const lessonConfig = validateLessonPlanConfig(body);

  let ai;
  try {
    ai = getServerGeminiClient();
  } catch (err) {
    throw new HttpStatusError(500, extractServerGeminiErrorMessage(err));
  }

  let rawText = '';
  try {
    const response = await ai.models.generateContent({
      model: PRIMARY_SERVER_TEXT_MODEL,
      contents: buildLessonPlanPrompt(lessonConfig),
      config: {
        systemInstruction: LESSON_PLAN_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: LESSON_PLAN_RESPONSE_SCHEMA,
        maxOutputTokens: 8192,
      },
    });
    rawText = response.text || '';
  } catch (err) {
    throw new HttpStatusError(
      502,
      `Không thể soạn Kế hoạch bài dạy bằng AI: ${extractServerGeminiErrorMessage(err)}`
    );
  }

  let parsed: Record<string, unknown>;
  try {
    const cleaned = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new HttpStatusError(
      502,
      'AI trả về định dạng JSON kế hoạch bài dạy chưa hợp lệ. Thầy/cô vui lòng bấm tạo lại.'
    );
  }

  return normalizeGeneratedLessonPlan(parsed, lessonConfig);
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const existingBody = (req as IncomingMessage & { body?: unknown }).body;
    if (existingBody !== undefined) {
      resolve(existingBody);
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > 64 * 1024) {
        reject(new HttpStatusError(413, 'Dữ liệu yêu cầu quá lớn.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim();
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new HttpStatusError(400, 'Dữ liệu JSON không hợp lệ.'));
      }
    });
    req.on('error', () => reject(new HttpStatusError(400, 'Không đọc được nội dung yêu cầu.')));
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export async function handleGenerateLessonPlanNodeRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Phương thức không được hỗ trợ.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const result = await generateLessonPlanForRequest(authHeader, body, req.headers);
    sendJson(res, 200, result);
  } catch (err) {
    if (err instanceof HttpStatusError) {
      sendJson(res, err.status, { error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Lỗi máy chủ nội bộ.';
    sendJson(res, 500, { error: msg });
  }
}
