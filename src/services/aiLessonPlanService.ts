import { Type } from '@google/genai';
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../config/firebase';
import type { GradeLevel, LearningMaterial, MaterialStatus, UserProfile } from '../types/hocLieu';
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
} from '../types/lessonPlan';
import { generateTextWithClientGemini } from '../utils/geminiClient';

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
  // Điều chỉnh khéo léo vào Khám phá / Luyện tập sao cho tổng đúng 35 phút
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

export async function generateLessonPlanWithAI(
  config: LessonPlanConfig
): Promise<GeneratedLessonPlan> {
  if (!LESSON_PLAN_SUBJECTS.includes(config.monHoc)) {
    throw new Error('Vui lòng chọn môn học hợp lệ.');
  }
  if (!LESSON_PLAN_GRADES.includes(config.khoiLop)) {
    throw new Error('Vui lòng chọn khối lớp từ 1 đến 5.');
  }
  if (!LESSON_PLAN_TEXTBOOKS.includes(config.boSach)) {
    throw new Error('Vui lòng chọn bộ sách giáo khoa hợp lệ.');
  }
  if (!config.tenBaiHoc || config.tenBaiHoc.trim().length < 2) {
    throw new Error('Vui lòng nhập Tên bài học / Tiết dạy cần soạn.');
  }

  const prompt = buildLessonPlanPrompt(config);

  const { text } = await generateTextWithClientGemini({
    contents: prompt,
    config: {
      systemInstruction: LESSON_PLAN_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: LESSON_PLAN_RESPONSE_SCHEMA,
      maxOutputTokens: 8192,
    },
  });

  let parsed: Record<string, unknown>;
  try {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error(
      'AI trả về định dạng JSON kế hoạch bài dạy chưa hợp lệ. Thầy/cô vui lòng bấm tạo lại.'
    );
  }

  return normalizeGeneratedLessonPlan(parsed, config);
}

export async function saveLessonPlanToSystem(params: {
  profile: UserProfile;
  existingMaterialId?: string | null;
  config: LessonPlanConfig;
  plan: GeneratedLessonPlan;
  sharePublic: boolean;
}): Promise<string> {
  const { profile, existingMaterialId, config, plan, sharePublic } = params;

  const cleanTitle = (
    plan.header.tenBaiHoc ||
    config.tenBaiHoc ||
    'Kế hoạch bài dạy AI'
  )
    .trim()
    .slice(0, 200);

  const targetRef = existingMaterialId
    ? doc(db, 'materials', existingMaterialId)
    : doc(collection(db, 'materials'));
  const path = `materials/${targetRef.id}`;

  const targetStatus: MaterialStatus = sharePublic
    ? profile.vaiTro === 'quanTri' || profile.role === 'ADMIN'
      ? 'chiaSeToanTruong'
      : profile.vaiTro === 'toTruong' || profile.role === 'TO_TRUONG'
        ? 'daDuyet'
        : 'choDuyet'
    : 'nhap';

  const isAutoApproved = targetStatus === 'daDuyet' || targetStatus === 'chiaSeToanTruong';
  const actorName = profile.hoTen?.trim() || 'Giáo viên';

  const integrationSummary = plan.yeuCauCanDat.giaoDucTichHop.join(' | ');
  const moTa = `Kế hoạch bài dạy (CV 2345 · 1 tiết) môn ${config.monHoc} lớp ${config.khoiLop} (${config.boSach}). ${integrationSummary}`.slice(
    0,
    1900
  );

  const sanitizedFileBase =
    cleanTitle
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s-_]/g, '')
      .trim()
      .replace(/\s+/g, '_') || 'KHBD_AI';

  const tags = [
    'khbd-ai',
    'cv-2345',
    config.monHoc.toLowerCase().slice(0, 40),
    `khoi-${config.khoiLop}`,
    ...(config.selectedIntegrations || []).slice(0, 4).map((c) => c.toLowerCase()),
  ].slice(0, 10);

  try {
    const existingSnap = existingMaterialId ? await getDoc(targetRef) : null;

    if (existingSnap?.exists()) {
      const updatePayload: Record<string, unknown> = {
        tieuDe: cleanTitle,
        tenBaiHoc: cleanTitle,
        moTa,
        monHoc: config.monHoc,
        khoiLop: config.khoiLop as GradeLevel,
        loai: 'Giáo án',
        the: tags,
        loaiNguon: 'lienKet',
        url: `https://kho-hoc-lieu.local/khbd-ai/${targetRef.id}`,
        tenTep: `${sanitizedFileBase}_Lop${config.khoiLop}.docx`.slice(0, 255),
        kichThuocTep: 0,
        duongDanStorage: '',
        toKhoi: profile.toKhoi || 'Tổ Chuyên Môn',
        trangThai: targetStatus,
        lyDoTuChoi: '',
        ngayCapNhat: serverTimestamp(),
      };

      if (isAutoApproved) {
        updatePayload.ngayDuyet = serverTimestamp();
        updatePayload.nguoiDuyetUid = profile.uid;
        updatePayload.nguoiDuyetTen = actorName;
      }

      await setDoc(targetRef, updatePayload, { merge: true });
      return targetRef.id;
    }

    await setDoc(targetRef, {
      tieuDe: cleanTitle,
      tenBaiHoc: cleanTitle,
      moTa,
      monHoc: config.monHoc,
      khoiLop: config.khoiLop as GradeLevel,
      loai: 'Giáo án',
      the: tags,
      loaiNguon: 'lienKet',
      url: `https://kho-hoc-lieu.local/khbd-ai/${targetRef.id}`,
      tenTep: `${sanitizedFileBase}_Lop${config.khoiLop}.docx`.slice(0, 255),
      kichThuocTep: 0,
      duongDanStorage: '',
      nguoiDangUid: profile.uid,
      nguoiDangTen: actorName,
      toKhoi: profile.toKhoi || 'Tổ Chuyên Môn',
      trangThai: targetStatus,
      lyDoTuChoi: '',
      luotXem: 0,
      luotTai: 0,
      ngayTao: serverTimestamp(),
      ngayCapNhat: serverTimestamp(),
      ngayDuyet: isAutoApproved ? serverTimestamp() : null,
      nguoiDuyetUid: isAutoApproved ? profile.uid : '',
      nguoiDuyetTen: isAutoApproved ? actorName : '',
      isSample: false,
    });

    return targetRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
