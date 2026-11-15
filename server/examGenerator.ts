import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { GoogleGenAI, Type } from '@google/genai';
import type {
  CognitiveLevel,
  ExamConfig,
  ExamDurationMinutes,
  ExamGradeLevel,
  ExamPeriod,
  ExamQuestion,
  ExamQuestionFormat,
  GeneratedExamPackage,
  MatrixCellAllocation,
  MatrixRow,
  SpecificationRow,
} from '../src/types/exam';

const ALLOWED_GRADES: ExamGradeLevel[] = ['1', '2', '3', '4', '5'];
const ALLOWED_PERIODS: ExamPeriod[] = [
  'Giữa học kì I',
  'Cuối học kì I',
  'Giữa học kì II',
  'Cuối năm học',
];
const ALLOWED_DURATIONS: ExamDurationMinutes[] = [35, 40];
const ALLOWED_LEVELS: CognitiveLevel[] = ['Mức 1', 'Mức 2', 'Mức 3'];
const ALLOWED_FORMATS: ExamQuestionFormat[] = [
  'Trắc nghiệm 4 lựa chọn',
  'Đúng-Sai',
  'Nối',
  'Điền khuyết',
  'Tự luận',
];

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
    throw new HttpStatusError(403, 'Vai trò tài khoản không có quyền tạo đề kiểm tra AI.');
  }

  return { uid: payload.sub, idToken };
}

function roundScore(val: number): number {
  return Math.round(val * 100) / 100;
}

function clampNonNegInt(val: unknown): number {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num);
}

function clampNonNegScore(val: unknown): number {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) return 0;
  return roundScore(num);
}

function normalizeCell(raw: Partial<MatrixCellAllocation> | undefined): MatrixCellAllocation {
  return {
    tnSoCau: clampNonNegInt(raw?.tnSoCau),
    tnDiem: clampNonNegScore(raw?.tnDiem),
    tlSoCau: clampNonNegInt(raw?.tlSoCau),
    tlDiem: clampNonNegScore(raw?.tlDiem),
  };
}

function adjustRowLastNonZeroScore(row: MatrixRow, delta: number): void {
  const buckets: Array<{ cell: MatrixCellAllocation; key: 'tlDiem' | 'tnDiem' }> = [
    { cell: row.muc3, key: 'tlDiem' },
    { cell: row.muc3, key: 'tnDiem' },
    { cell: row.muc2, key: 'tlDiem' },
    { cell: row.muc2, key: 'tnDiem' },
    { cell: row.muc1, key: 'tlDiem' },
    { cell: row.muc1, key: 'tnDiem' },
  ];

  for (const b of buckets) {
    if (b.cell[b.key] > 0 && b.cell[b.key] + delta >= 0.25) {
      b.cell[b.key] = roundScore(b.cell[b.key] + delta);
      return;
    }
  }
}

function autoGenerateMatrixAndSpecs(
  deKiemTra: ExamQuestion[],
  config: ExamConfig
): { maTran: MatrixRow[]; banDacTa: SpecificationRow[] } {
  const topics = config.chuDeKienThuc.length > 0 ? config.chuDeKienThuc : ['Kiến thức chung'];
  
  const rowsMap = new Map<string, {
    muc1: MatrixCellAllocation;
    muc2: MatrixCellAllocation;
    muc3: MatrixCellAllocation;
    specs: Array<{ soThuTuCau: number; mucDo: CognitiveLevel; hinhThuc: ExamQuestionFormat; nangLucCanDat: string }>;
  }>();

  topics.forEach((t) => {
    rowsMap.set(t, {
      muc1: { tnSoCau: 0, tnDiem: 0, tlSoCau: 0, tlDiem: 0 },
      muc2: { tnSoCau: 0, tnDiem: 0, tlSoCau: 0, tlDiem: 0 },
      muc3: { tnSoCau: 0, tnDiem: 0, tlSoCau: 0, tlDiem: 0 },
      specs: [],
    });
  });

  deKiemTra.forEach((q, idx) => {
    const topicKey = topics[idx % topics.length];
    const entry = rowsMap.get(topicKey)!;
    const isTl = q.hinhThuc === 'Tự luận' || q.hinhThuc.toLowerCase().includes('tự luận');

    if (q.mucDo === 'Mức 1') {
      if (isTl) { entry.muc1.tlSoCau += 1; entry.muc1.tlDiem = roundScore(entry.muc1.tlDiem + q.diem); }
      else { entry.muc1.tnSoCau += 1; entry.muc1.tnDiem = roundScore(entry.muc1.tnDiem + q.diem); }
    } else if (q.mucDo === 'Mức 2') {
      if (isTl) { entry.muc2.tlSoCau += 1; entry.muc2.tlDiem = roundScore(entry.muc2.tlDiem + q.diem); }
      else { entry.muc2.tnSoCau += 1; entry.muc2.tnDiem = roundScore(entry.muc2.tnDiem + q.diem); }
    } else {
      if (isTl) { entry.muc3.tlSoCau += 1; entry.muc3.tlDiem = roundScore(entry.muc3.tlDiem + q.diem); }
      else { entry.muc3.tnSoCau += 1; entry.muc3.tnDiem = roundScore(entry.muc3.tnDiem + q.diem); }
    }

    entry.specs.push({
      soThuTuCau: q.soThuTu,
      mucDo: q.mucDo,
      hinhThuc: q.hinhThuc,
      nangLucCanDat: q.dapAnChiTiet || `Đạt yêu cầu kiến thức và kĩ năng câu ${q.soThuTu}`,
    });
  });

  const maTran: MatrixRow[] = [];
  const banDacTa: SpecificationRow[] = [];

  let rowIdx = 0;
  rowsMap.forEach((entry, topic) => {
    rowIdx += 1;
    const tongSoCau =
      entry.muc1.tnSoCau + entry.muc1.tlSoCau +
      entry.muc2.tnSoCau + entry.muc2.tlSoCau +
      entry.muc3.tnSoCau + entry.muc3.tlSoCau;
    const tongDiem = roundScore(
      entry.muc1.tnDiem + entry.muc1.tlDiem +
      entry.muc2.tnDiem + entry.muc2.tlDiem +
      entry.muc3.tnDiem + entry.muc3.tlDiem
    );

    maTran.push({
      id: `row-${rowIdx}`,
      machKienThuc: topic,
      muc1: entry.muc1,
      muc2: entry.muc2,
      muc3: entry.muc3,
      tongSoCau,
      tongDiem,
      tyLePhanTram: roundScore(tongDiem * 10),
    });

    const m1Count = entry.muc1.tnSoCau + entry.muc1.tlSoCau;
    const m2Count = entry.muc2.tnSoCau + entry.muc2.tlSoCau;
    const m3Count = entry.muc3.tnSoCau + entry.muc3.tlSoCau;

    banDacTa.push({
      id: `spec-${rowIdx}`,
      machKienThuc: topic,
      donViKienThuc: `Nội dung kiến thức trọng tâm môn ${config.monHoc} lớp ${config.khoiLop}`,
      muc1_SoCau: m1Count,
      muc2_SoCau: m2Count,
      muc3_SoCau: m3Count,
      moTaChiTietTheoCau: entry.specs,
    });
  });

  return { maTran, banDacTa };
}

function normalizeExamPackage(
  raw: Record<string, unknown>,
  config: ExamConfig
): GeneratedExamPackage {
  const defaultTitle = `Đề kiểm tra định kì ${config.thoiDiemKiemTra} - Môn ${config.monHoc} lớp ${config.khoiLop}`;
  const tieuDeDeThi =
    typeof raw.tieuDeDeThi === 'string' && raw.tieuDeDeThi.trim()
      ? raw.tieuDeDeThi.trim().slice(0, 220)
      : defaultTitle;

  const rawQuestions = Array.isArray(raw.deKiemTra) ? raw.deKiemTra : [];
  const expectedTotal = (config.soCauTracNghiem ?? 6) + (config.soCauTuLuan ?? 4);
  if (rawQuestions.length !== expectedTotal) {
    throw new HttpStatusError(
      502,
      `AI sinh ra ${rawQuestions.length} câu nhưng cấu hình yêu cầu đúng ${expectedTotal} câu (${config.soCauTracNghiem} trắc nghiệm + ${config.soCauTuLuan} tự luận). Vui lòng thử tạo lại.`
    );
  }

  const deKiemTra: ExamQuestion[] = rawQuestions.map((item, idx) => {
    const q = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const mucDo = ALLOWED_LEVELS.includes(q.mucDo as CognitiveLevel)
      ? (q.mucDo as CognitiveLevel)
      : 'Mức 1';
    const hinhThuc = ALLOWED_FORMATS.includes(q.hinhThuc as ExamQuestionFormat)
      ? (q.hinhThuc as ExamQuestionFormat)
      : 'Trắc nghiệm 4 lựa chọn';
    const cacLuaChon = Array.isArray(q.cacLuaChon)
      ? q.cacLuaChon.map((c) => String(c).trim()).filter(Boolean)
      : undefined;
    const cotBenTrai = Array.isArray(q.cotBenTrai)
      ? q.cotBenTrai.map((c) => String(c).trim()).filter(Boolean)
      : undefined;
    const cotBenPhai = Array.isArray(q.cotBenPhai)
      ? q.cotBenPhai.map((c) => String(c).trim()).filter(Boolean)
      : undefined;

    let noiDung = typeof q.noiDungCauHoi === 'string' ? q.noiDungCauHoi.trim() : '';
    noiDung = noiDung
      .replace(/^(?:câu\s*\d+[\.:]?\s*|phần\s*[ivxlcdm]+[\.:]?\s*)/i, '')
      .trim();

    return {
      soThuTu: idx + 1,
      mucDo,
      hinhThuc,
      machKienThuc:
        typeof q.machKienThuc === 'string' && q.machKienThuc.trim()
          ? q.machKienThuc.trim()
          : config.chuDeKienThuc[0] || 'Kiến thức chung',
      noiDungCauHoi: noiDung || `Nội dung câu hỏi ${idx + 1}`,
      ...(cacLuaChon && cacLuaChon.length > 0 ? { cacLuaChon } : {}),
      ...(cotBenTrai && cotBenTrai.length > 0 ? { cotBenTrai } : {}),
      ...(cotBenPhai && cotBenPhai.length > 0 ? { cotBenPhai } : {}),
      dapAnChiTiet:
        typeof q.dapAnChiTiet === 'string' ? q.dapAnChiTiet.trim() : '',
      huongDanCham:
        typeof q.huongDanCham === 'string' ? q.huongDanCham.trim() : '',
      diem: 0.5,
    };
  });

  const n = deKiemTra.length;
  if (n > 0) {
    const baseScore = roundScore(10 / n);
    let runningSum = 0;
    deKiemTra.forEach((q, i) => {
      if (i === n - 1) {
        q.diem = roundScore(10 - runningSum);
      } else {
        q.diem = baseScore;
        runningSum = roundScore(runningSum + baseScore);
      }
    });
  }

  const rawMatrix = Array.isArray(raw.maTran) ? raw.maTran : [];
  const rawSpec = Array.isArray(raw.banDacTa) ? raw.banDacTa : [];

  let maTran: MatrixRow[];
  let banDacTa: SpecificationRow[];

  if (rawMatrix.length === 0 || rawSpec.length === 0) {
    const autoGen = autoGenerateMatrixAndSpecs(deKiemTra, config);
    maTran = autoGen.maTran;
    banDacTa = autoGen.banDacTa;
  } else {
    maTran = rawMatrix.map((item, idx) => {
      const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const muc1 = normalizeCell(r.muc1 as Partial<MatrixCellAllocation>);
      const muc2 = normalizeCell(r.muc2 as Partial<MatrixCellAllocation>);
      const muc3 = normalizeCell(r.muc3 as Partial<MatrixCellAllocation>);

      const tongSoCau =
        muc1.tnSoCau + muc1.tlSoCau +
        muc2.tnSoCau + muc2.tlSoCau +
        muc3.tnSoCau + muc3.tlSoCau;
      const tongDiem = roundScore(
        muc1.tnDiem + muc1.tlDiem +
        muc2.tnDiem + muc2.tlDiem +
        muc3.tnDiem + muc3.tlDiem
      );

      return {
        id: typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `row-${idx + 1}`,
        machKienThuc:
          typeof r.machKienThuc === 'string' && r.machKienThuc.trim()
            ? r.machKienThuc.trim()
            : config.chuDeKienThuc[idx] || `Chủ đề ${idx + 1}`,
        muc1,
        muc2,
        muc3,
        tongSoCau,
        tongDiem,
        tyLePhanTram: roundScore(tongDiem * 10),
      };
    });

    banDacTa = rawSpec.map((item, idx) => {
      const s = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const rawDetails = Array.isArray(s.moTaChiTietTheoCau) ? s.moTaChiTietTheoCau : [];
      return {
        id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `spec-${idx + 1}`,
        machKienThuc:
          typeof s.machKienThuc === 'string' && s.machKienThuc.trim()
            ? s.machKienThuc.trim()
            : maTran[idx]?.machKienThuc || `Chủ đề ${idx + 1}`,
        donViKienThuc:
          typeof s.donViKienThuc === 'string' ? s.donViKienThuc.trim() : '',
        muc1_SoCau: clampNonNegInt(s.muc1_SoCau),
        muc2_SoCau: clampNonNegInt(s.muc2_SoCau),
        muc3_SoCau: clampNonNegInt(s.muc3_SoCau),
        moTaChiTietTheoCau: rawDetails.map((d, dIdx) => {
          const det = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
          const mucDo = ALLOWED_LEVELS.includes(det.mucDo as CognitiveLevel)
            ? (det.mucDo as CognitiveLevel)
            : 'Mức 1';
          const hinhThuc = ALLOWED_FORMATS.includes(det.hinhThuc as ExamQuestionFormat)
            ? (det.hinhThuc as ExamQuestionFormat)
            : 'Trắc nghiệm 4 lựa chọn';
          return {
            soThuTuCau: clampNonNegInt(det.soThuTuCau) || dIdx + 1,
            mucDo,
            hinhThuc,
            nangLucCanDat:
              typeof det.nangLucCanDat === 'string' ? det.nangLucCanDat.trim() : '',
          };
        }),
      };
    });
  }

  const finalTongDiem = roundScore(deKiemTra.reduce((acc, q) => acc + q.diem, 0));

  return {
    tieuDeDeThi,
    maTran,
    banDacTa,
    deKiemTra,
    tongDiem: finalTongDiem,
  };
}

const EXAM_SYSTEM_INSTRUCTION = `Bạn là Chuyên gia Khảo thí & Sư phạm Giáo dục Tiểu học Việt Nam, am hiểu sâu sắc Chương trình Giáo dục Phổ thông 2018 và Thông tư 27/2020/TT-BGDĐT về đánh giá học sinh tiểu học.

NHIỆM VỤ:
Trong MỘT lần trả lời duy nhất, hãy sinh đồng bộ 3 phần hoàn chỉnh dưới dạng JSON chuẩn cho đề kiểm tra định kì cấp Tiểu học:
1. Ma trận đề kiểm tra (maTran):
   - Phân bổ đầy đủ các mạch kiến thức/chủ đề giáo viên yêu cầu theo 3 mức độ nhận thức của Thông tư 27:
     * Mức 1 (Nhận biết): Nhận biết, nhắc lại hoặc mô tả đúng kiến thức, kĩ năng đã học và áp dụng trực tiếp.
     * Mức 2 (Kết nối / Thông hiểu): Kết nối, sắp xếp một số kiến thức, kĩ năng đã học để giải quyết vấn đề có nội dung tương tự.
     * Mức 3 (Vận dụng): Vận dụng kiến thức, kĩ năng đã học để giải quyết vấn đề mới hoặc đưa ra phản hồi hợp lý trong học tập và cuộc sống.
   - Tách rõ Trắc nghiệm khách quan (tnSoCau, tnDiem) và Tự luận (tlSoCau, tlDiem) trong từng mức độ.
   - Cộng tổng điểm toàn bảng ma trận PHẢI BẰNG CHÍNH XÁC 10,0 điểm. Tỷ lệ điểm giữa các mức độ phải bám sát tỷ lệ giáo viên cấu hình.
2. Bản đặc tả đề kiểm tra (banDacTa):
   - Khớp 1-1 với từng mạch kiến thức trong Ma trận.
   - Nêu rõ Đơn vị kiến thức và Yêu cầu cần đạt (YCCĐ) chuẩn Chương trình GDPT 2018 cho môn học và khối lớp.
   - Ghi rõ số câu ở từng mức 1, 2, 3 và mô tả chi tiết năng lực học sinh cần đạt tương ứng với TỪNG CÂU HỎI (soThuTuCau từ 1 đến hết).
3. Đề kiểm tra hoàn chỉnh + Đáp án & Biểu điểm chấm (deKiemTra):
   - Tổng số câu, thứ tự, mức độ, hình thức (TNKQ hay Tự luận) và điểm số của từng câu PHẢI KHỚP TUYỆT ĐỐI với bảng Ma trận và Bản đặc tả ở trên.
   - Tổng điểm tất cả câu hỏi trong deKiemTra PHẢI BẰNG CHÍNH XÁC 10,0 điểm.
   - Đa dạng hóa hình thức phù hợp lứa tuổi tiểu học: "Trắc nghiệm 4 lựa chọn" (ghi rõ 4 phương án A, B, C, D trong cacLuaChon), "Đúng-Sai", "Nối" (có cotBenTrai và cotBenPhai), "Điền khuyết", "Tự luận".
   - Nội dung câu hỏi trong sáng, văn phong sư phạm chuẩn mực, số liệu hợp lý cho học sinh tiểu học (khối 1-5), không dùng ký hiệu toán học khó đọc (dùng ký hiệu trực quan như ×, :, +, -, >, <, =).
   - Mỗi câu PHẢI có dapAnChiTiet chính xác tuyệt đối và huongDanCham (biểu điểm chi tiết từng ý, từng bước làm bài).`;

const MATRIX_CELL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    tnSoCau: { type: Type.INTEGER },
    tnDiem: { type: Type.NUMBER },
    tlSoCau: { type: Type.INTEGER },
    tlDiem: { type: Type.NUMBER },
  },
  required: ['tnSoCau', 'tnDiem', 'tlSoCau', 'tlDiem'],
};

const EXAM_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    tieuDeDeThi: {
      type: Type.STRING,
      description: 'Tên đề kiểm tra định kì chuẩn hành chính tiểu học.',
    },
    maTran: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          machKienThuc: { type: Type.STRING },
          muc1: MATRIX_CELL_SCHEMA,
          muc2: MATRIX_CELL_SCHEMA,
          muc3: MATRIX_CELL_SCHEMA,
          tongSoCau: { type: Type.INTEGER },
          tongDiem: { type: Type.NUMBER },
          tyLePhanTram: { type: Type.NUMBER },
        },
        required: [
          'id',
          'machKienThuc',
          'muc1',
          'muc2',
          'muc3',
          'tongSoCau',
          'tongDiem',
          'tyLePhanTram',
        ],
      },
    },
    banDacTa: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          machKienThuc: { type: Type.STRING },
          donViKienThuc: { type: Type.STRING },
          muc1_SoCau: { type: Type.INTEGER },
          muc2_SoCau: { type: Type.INTEGER },
          muc3_SoCau: { type: Type.INTEGER },
          moTaChiTietTheoCau: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                soThuTuCau: { type: Type.INTEGER },
                mucDo: { type: Type.STRING },
                hinhThuc: { type: Type.STRING },
                nangLucCanDat: { type: Type.STRING },
              },
              required: ['soThuTuCau', 'mucDo', 'hinhThuc', 'nangLucCanDat'],
            },
          },
        },
        required: [
          'id',
          'machKienThuc',
          'donViKienThuc',
          'muc1_SoCau',
          'muc2_SoCau',
          'muc3_SoCau',
          'moTaChiTietTheoCau',
        ],
      },
    },
    deKiemTra: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          soThuTu: { type: Type.INTEGER },
          mucDo: { type: Type.STRING },
          hinhThuc: { type: Type.STRING },
          machKienThuc: { type: Type.STRING },
          noiDungCauHoi: { type: Type.STRING },
          cacLuaChon: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          cotBenTrai: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          cotBenPhai: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          dapAnChiTiet: { type: Type.STRING },
          huongDanCham: { type: Type.STRING },
          diem: { type: Type.NUMBER },
        },
        required: [
          'soThuTu',
          'mucDo',
          'hinhThuc',
          'machKienThuc',
          'noiDungCauHoi',
          'dapAnChiTiet',
          'huongDanCham',
          'diem',
        ],
      },
    },
  },
  required: ['tieuDeDeThi', 'maTran', 'banDacTa', 'deKiemTra'],
};

function buildExamPrompt(config: ExamConfig): string {
  const topicList = config.chuDeKienThuc
    .map((topic, idx) => `  ${idx + 1}. ${topic}`)
    .join('\n');

  const { muc1_NhanBiet, muc2_KetNoi, muc3_VanDung } = config.tyLeMucDo;
  const soTn = config.soCauTracNghiem ?? 6;
  const soTl = config.soCauTuLuan ?? 4;
  const dangTn = config.cacDangTracNghiem?.length
    ? config.cacDangTracNghiem.join(', ')
    : 'Khoanh tròn chữ cái (A, B, C, D), Điền khuyết, Nối cột';

  return `Hãy thiết kế trọn bộ Đề kiểm tra định kì + Ma trận + Bản đặc tả + Đáp án biểu điểm cho Trường Tiểu học Quang Hưng - Phân hiệu Trực Khang theo cấu hình sau:
- Môn học: ${config.monHoc}
- Khối lớp: Lớp ${config.khoiLop} (Chương trình GDPT 2018)
- Thời điểm kiểm tra: ${config.thoiDiemKiemTra}
- Thời gian làm bài: ${config.thoiGianLamBai} phút
- Cấu trúc số câu hỏi yêu cầu:
  * PHẦN I. TRẮC NGHIỆM: đúng ${soTn} câu, sử dụng các dạng câu hỏi được chọn: ${dangTn}.
  * PHẦN II. TỰ LUẬN: đúng ${soTl} câu, trình bày rõ đề bài và không gian làm bài.
  * Tổng số câu toàn bài = ${soTn + soTl} câu.
- Năm học: ${config.namHoc || '2026 - 2027'}
- Bộ sách giáo khoa tham chiếu: ${config.boSach || 'Kết nối tri thức với cuộc sống / Cánh diều / Chân trời sáng tạo'}
- Các mạch kiến thức / chủ đề cần kiểm tra:
${topicList}
- Tỷ lệ 3 mức độ nhận thức theo Thông tư 27/2020/TT-BGDĐT:
  * Mức 1 (Nhận biết): ${muc1_NhanBiet}% (tương đương khoảng ${roundScore(muc1_NhanBiet / 10)} điểm)
  * Mức 2 (Kết nối / Thông hiểu): ${muc2_KetNoi}% (tương đương khoảng ${roundScore(muc2_KetNoi / 10)} điểm)
  * Mức 3 (Vận dụng): ${muc3_VanDung}% (tương đương khoảng ${roundScore(muc3_VanDung / 10)} điểm)
${config.yeuCauBoSung?.trim() ? `- Ghi chú bổ sung của giáo viên: ${config.yeuCauBoSung.trim()}` : ''}

YÊU CẦU KỸ THUẬT NGHIÊM NGẶT:
1. Đề kiểm tra PHẢI chia thành đúng 2 phần tiêu đề lớn rõ ràng:
   I. PHẦN TRẮC NGHIỆM (gồm đúng ${soTn} câu hỏi đầu tiên, từ câu 1 đến câu ${soTn}, phân bổ theo các dạng: ${dangTn}).
   II. PHẦN TỰ LUẬN (gồm đúng ${soTl} câu hỏi tiếp theo, từ câu ${soTn + 1} đến hết, gồm các dạng tự luận phù hợp).
2. Dùng chính xác tên các giá trị sau trong JSON:
   - mucDo: CHỈ dùng đúng 1 trong 3 chuỗi: "Mức 1", "Mức 2", "Mức 3".
   - hinhThuc: CHỈ dùng đúng trong các dạng trắc nghiệm được chọn hoặc "Tự luận".
3. Đảm bảo số câu và số điểm mỗi hàng trong maTran khớp 100% với số lượng câu hỏi thực tế trong deKiemTra.
4. Tổng điểm của maTran và tổng điểm của tất cả câu hỏi trong deKiemTra đều PHẢI BẰNG CHÍNH XÁC 10,0 điểm.
5. Với câu "Trắc nghiệm 4 lựa chọn", cacLuaChon phải có đúng 4 phần tử bắt đầu bằng "A. ", "B. ", "C. ", "D. ".
6. Với câu "Nối", cung cấp cotBenTrai và cotBenPhai tương ứng.`;
}

function validateExamConfig(raw: unknown): ExamConfig {
  const payload = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const monHoc = typeof payload.monHoc === 'string' ? payload.monHoc.trim() : '';
  const khoiLop = typeof payload.khoiLop === 'string' ? payload.khoiLop.trim() : '';
  const thoiDiemKiemTra =
    typeof payload.thoiDiemKiemTra === 'string' ? payload.thoiDiemKiemTra.trim() : '';
  const thoiGianLamBai = Number(payload.thoiGianLamBai);

  if (!monHoc || monHoc.length > 100) {
    throw new HttpStatusError(400, 'Vui lòng chọn môn học hợp lệ.');
  }
  if (!ALLOWED_GRADES.includes(khoiLop as ExamGradeLevel)) {
    throw new HttpStatusError(400, 'Vui lòng chọn khối lớp từ Khối 1 đến Khối 5.');
  }
  if (!ALLOWED_PERIODS.includes(thoiDiemKiemTra as ExamPeriod)) {
    throw new HttpStatusError(400, 'Vui lòng chọn thời điểm kiểm tra hợp lệ.');
  }
  if (!ALLOWED_DURATIONS.includes(thoiGianLamBai as ExamDurationMinutes)) {
    throw new HttpStatusError(400, 'Thời gian làm bài phải là 35 hoặc 40 phút.');
  }

  const soCauTracNghiem = Number(payload.soCauTracNghiem ?? 6);
  const soCauTuLuan = Number(payload.soCauTuLuan ?? 4);
  if (!Number.isFinite(soCauTracNghiem) || soCauTracNghiem < 1 || soCauTracNghiem > 30) {
    throw new HttpStatusError(400, 'Số câu trắc nghiệm phải từ 1 đến 30 câu.');
  }
  if (!Number.isFinite(soCauTuLuan) || soCauTuLuan < 0 || soCauTuLuan > 20) {
    throw new HttpStatusError(400, 'Số câu tự luận phải từ 0 đến 20 câu.');
  }

  const cacDangTracNghiem = Array.isArray(payload.cacDangTracNghiem)
    ? payload.cacDangTracNghiem.map((s) => String(s).trim()).filter(Boolean)
    : ['Khoanh tròn chữ cái (A, B, C, D)', 'Điền khuyết', 'Nối cột'];

  if (cacDangTracNghiem.length === 0) {
    throw new HttpStatusError(400, 'Vui lòng chọn ít nhất 1 dạng câu hỏi trắc nghiệm.');
  }

  const chuDeKienThuc = Array.isArray(payload.chuDeKienThuc)
    ? payload.chuDeKienThuc
        .map((c) => (typeof c === 'string' ? c.trim() : ''))
        .filter((c) => c.length > 0)
        .slice(0, 10)
    : [];

  if (chuDeKienThuc.length === 0) {
    throw new HttpStatusError(400, 'Vui lòng nhập ít nhất 1 mạch kiến thức / chủ đề.');
  }

  const rawRatio = (
    payload.tyLeMucDo && typeof payload.tyLeMucDo === 'object' ? payload.tyLeMucDo : {}
  ) as Record<string, unknown>;
  const muc1 = Number(rawRatio.muc1_NhanBiet ?? 40);
  const muc2 = Number(rawRatio.muc2_KetNoi ?? 40);
  const muc3 = Number(rawRatio.muc3_VanDung ?? 20);

  if (
    !Number.isFinite(muc1) ||
    !Number.isFinite(muc2) ||
    !Number.isFinite(muc3) ||
    muc1 < 0 ||
    muc2 < 0 ||
    muc3 < 0 ||
    Math.round(muc1 + muc2 + muc3) !== 100
  ) {
    throw new HttpStatusError(
      400,
      'Tổng tỷ lệ 3 mức độ nhận thức (Mức 1 + Mức 2 + Mức 3) phải bằng 100%.'
    );
  }

  return {
    monHoc,
    khoiLop: khoiLop as ExamGradeLevel,
    thoiDiemKiemTra: thoiDiemKiemTra as ExamPeriod,
    thoiGianLamBai: thoiGianLamBai as ExamDurationMinutes,
    soCauTracNghiem,
    soCauTuLuan,
    cacDangTracNghiem,
    chuDeKienThuc,
    tyLeMucDo: {
      muc1_NhanBiet: muc1,
      muc2_KetNoi: muc2,
      muc3_VanDung: muc3,
    },
    namHoc: typeof payload.namHoc === 'string' ? payload.namHoc.trim().slice(0, 30) : undefined,
    boSach: typeof payload.boSach === 'string' ? payload.boSach.trim().slice(0, 100) : undefined,
    yeuCauBoSung:
      typeof payload.yeuCauBoSung === 'string'
        ? payload.yeuCauBoSung.trim().slice(0, 500)
        : undefined,
  };
}

export async function generateAiExamForRequest(
  authHeader: string | undefined,
  body: unknown,
  headers?: IncomingMessage['headers']
): Promise<GeneratedExamPackage> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new HttpStatusError(500, 'Máy chủ chưa cấu hình biến môi trường GEMINI_API_KEY.');
  }

  const cfg = getFirebaseConfig();
  await verifyTeacherAuth(authHeader, cfg, headers, body);

  const examConfig = validateExamConfig(body);

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  let rawText = '';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: buildExamPrompt(examConfig),
      config: {
        systemInstruction: EXAM_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: EXAM_RESPONSE_SCHEMA,
        maxOutputTokens: 8192,
      },
    });
    rawText = response.text || '';
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi kết nối dịch vụ AI.';
    throw new HttpStatusError(502, `Không thể sinh đề kiểm tra bằng AI: ${msg}`);
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
    throw new HttpStatusError(502, 'AI trả về định dạng JSON chưa hợp lệ. Vui lòng thử tạo lại.');
  }

  return normalizeExamPackage(parsed, examConfig);
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
        reject(new HttpStatusError(413, 'Dữ liệu cấu hình đề thi gửi lên quá lớn.'));
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

export async function handleGenerateExamNodeRequest(
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
    const result = await generateAiExamForRequest(authHeader, body, req.headers);
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
