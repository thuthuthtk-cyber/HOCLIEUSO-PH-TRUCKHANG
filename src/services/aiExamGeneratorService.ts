import { Type } from '@google/genai';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../config/firebase';
import type {
  CognitiveLevel,
  ExamConfig,
  ExamQuestion,
  ExamQuestionFormat,
  ExamRecord,
  GeneratedExamPackage,
  MatrixCellAllocation,
  MatrixRow,
  MatrixSummaryTotals,
  SaveExamInput,
  SpecificationRow,
} from '../types/exam';
import type { LearningMaterial, UserProfile } from '../types/hocLieu';
import { generateTextWithClientGemini } from '../utils/geminiClient';

const ALLOWED_LEVELS: CognitiveLevel[] = ['Mức 1', 'Mức 2', 'Mức 3'];
const ALLOWED_FORMATS: ExamQuestionFormat[] = [
  'Trắc nghiệm 4 lựa chọn',
  'Đúng-Sai',
  'Nối',
  'Điền khuyết',
  'Tự luận',
];

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

export function calculateMatrixTotals(rows: MatrixRow[]): MatrixSummaryTotals {
  const totals: MatrixSummaryTotals = {
    muc1TnSoCau: 0,
    muc1TnDiem: 0,
    muc1TlSoCau: 0,
    muc1TlDiem: 0,
    muc2TnSoCau: 0,
    muc2TnDiem: 0,
    muc2TlSoCau: 0,
    muc2TlDiem: 0,
    muc3TnSoCau: 0,
    muc3TnDiem: 0,
    muc3TlSoCau: 0,
    muc3TlDiem: 0,
    tongTnSoCau: 0,
    tongTnDiem: 0,
    tongTlSoCau: 0,
    tongTlDiem: 0,
    tongSoCau: 0,
    tongDiem: 0,
    tongTyLePhanTram: 0,
  };

  for (const row of rows) {
    totals.muc1TnSoCau += row.muc1.tnSoCau;
    totals.muc1TnDiem += row.muc1.tnDiem;
    totals.muc1TlSoCau += row.muc1.tlSoCau;
    totals.muc1TlDiem += row.muc1.tlDiem;

    totals.muc2TnSoCau += row.muc2.tnSoCau;
    totals.muc2TnDiem += row.muc2.tnDiem;
    totals.muc2TlSoCau += row.muc2.tlSoCau;
    totals.muc2TlDiem += row.muc2.tlDiem;

    totals.muc3TnSoCau += row.muc3.tnSoCau;
    totals.muc3TnDiem += row.muc3.tnDiem;
    totals.muc3TlSoCau += row.muc3.tlSoCau;
    totals.muc3TlDiem += row.muc3.tlDiem;

    totals.tongSoCau += row.tongSoCau;
    totals.tongDiem += row.tongDiem;
  }

  totals.muc1TnDiem = roundScore(totals.muc1TnDiem);
  totals.muc1TlDiem = roundScore(totals.muc1TlDiem);
  totals.muc2TnDiem = roundScore(totals.muc2TnDiem);
  totals.muc2TlDiem = roundScore(totals.muc2TlDiem);
  totals.muc3TnDiem = roundScore(totals.muc3TnDiem);
  totals.muc3TlDiem = roundScore(totals.muc3TlDiem);

  totals.tongTnSoCau = totals.muc1TnSoCau + totals.muc2TnSoCau + totals.muc3TnSoCau;
  totals.tongTnDiem = roundScore(
    totals.muc1TnDiem + totals.muc2TnDiem + totals.muc3TnDiem
  );
  totals.tongTlSoCau = totals.muc1TlSoCau + totals.muc2TlSoCau + totals.muc3TlSoCau;
  totals.tongTlDiem = roundScore(
    totals.muc1TlDiem + totals.muc2TlDiem + totals.muc3TlDiem
  );
  totals.tongDiem = roundScore(totals.tongDiem);
  totals.tongTyLePhanTram = roundScore(totals.tongDiem * 10);

  return totals;
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

function autoGenerateMatrixAndSpecs(
  deKiemTra: ExamQuestion[],
  config: ExamConfig
): { maTran: MatrixRow[]; banDacTa: SpecificationRow[] } {
  const topics = config.chuDeKienThuc.length > 0 ? config.chuDeKienThuc : ['Kiến thức chung'];

  const rowsMap = new Map<
    string,
    {
      muc1: MatrixCellAllocation;
      muc2: MatrixCellAllocation;
      muc3: MatrixCellAllocation;
      specs: Array<{
        soThuTuCau: number;
        mucDo: CognitiveLevel;
        hinhThuc: ExamQuestionFormat;
        nangLucCanDat: string;
      }>;
    }
  >();

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
      if (isTl) {
        entry.muc1.tlSoCau += 1;
        entry.muc1.tlDiem = roundScore(entry.muc1.tlDiem + q.diem);
      } else {
        entry.muc1.tnSoCau += 1;
        entry.muc1.tnDiem = roundScore(entry.muc1.tnDiem + q.diem);
      }
    } else if (q.mucDo === 'Mức 2') {
      if (isTl) {
        entry.muc2.tlSoCau += 1;
        entry.muc2.tlDiem = roundScore(entry.muc2.tlDiem + q.diem);
      } else {
        entry.muc2.tnSoCau += 1;
        entry.muc2.tnDiem = roundScore(entry.muc2.tnDiem + q.diem);
      }
    } else {
      if (isTl) {
        entry.muc3.tlSoCau += 1;
        entry.muc3.tlDiem = roundScore(entry.muc3.tlDiem + q.diem);
      } else {
        entry.muc3.tnSoCau += 1;
        entry.muc3.tnDiem = roundScore(entry.muc3.tnDiem + q.diem);
      }
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
      entry.muc1.tnSoCau +
      entry.muc1.tlSoCau +
      entry.muc2.tnSoCau +
      entry.muc2.tlSoCau +
      entry.muc3.tnSoCau +
      entry.muc3.tlSoCau;
    const tongDiem = roundScore(
      entry.muc1.tnDiem +
        entry.muc1.tlDiem +
        entry.muc2.tnDiem +
        entry.muc2.tlDiem +
        entry.muc3.tnDiem +
        entry.muc3.tlDiem
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
  if (rawQuestions.length === 0) {
    throw new Error('AI chưa sinh được danh sách câu hỏi đề kiểm tra. Vui lòng thử lại.');
  }

  const deKiemTra: ExamQuestion[] = rawQuestions.map((item, idx) => {
    const q = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const mucDo = ALLOWED_LEVELS.includes(q.mucDo as CognitiveLevel)
      ? (q.mucDo as CognitiveLevel)
      : 'Mức 1';
    const hinhThuc = ALLOWED_FORMATS.includes(q.hinhThuc as ExamQuestionFormat)
      ? (q.hinhThuc as ExamQuestionFormat)
      : idx < (config.soCauTracNghiem ?? 6)
        ? 'Trắc nghiệm 4 lựa chọn'
        : 'Tự luận';
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
        muc1.tnSoCau +
        muc1.tlSoCau +
        muc2.tnSoCau +
        muc2.tlSoCau +
        muc3.tnSoCau +
        muc3.tlSoCau;
      const tongDiem = roundScore(
        muc1.tnDiem +
          muc1.tlDiem +
          muc2.tnDiem +
          muc2.tlDiem +
          muc3.tnDiem +
          muc3.tlDiem
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

export async function generateExamPackageWithAI(
  config: ExamConfig
): Promise<GeneratedExamPackage> {
  if (!config.monHoc || !config.chuDeKienThuc?.length) {
    throw new Error('Vui lòng chọn môn học và nhập ít nhất 1 mạch kiến thức.');
  }

  const { text } = await generateTextWithClientGemini({
    contents: buildExamPrompt(config),
    config: {
      systemInstruction: EXAM_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: EXAM_RESPONSE_SCHEMA,
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
    throw new Error('AI trả về định dạng JSON đề kiểm tra chưa hợp lệ. Vui lòng thử lại.');
  }

  return normalizeExamPackage(parsed, config);
}

function sortExamsByNewest(list: ExamRecord[]): ExamRecord[] {
  return [...list].sort((a, b) => {
    const ta = a.ngayTao?.toMillis?.() ?? 0;
    const tb = b.ngayTao?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

export function subscribeExamsForTeacher(
  profile: UserProfile,
  onData: (exams: ExamRecord[]) => void,
  onError: () => void
): Unsubscribe {
  if (profile.vaiTro === 'quanTri') {
    return onSnapshot(
      collection(db, 'exams'),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ExamRecord, 'id'>),
        }));
        onData(sortExamsByNewest(list));
      },
      (err) => {
        onError();
        handleFirestoreError(err, OperationType.LIST, 'exams');
      }
    );
  }

  const buckets = new Map<string, Map<string, ExamRecord>>();
  const syncAll = () => {
    const merged = new Map<string, ExamRecord>();
    buckets.forEach((bucket) => {
      bucket.forEach((item, id) => merged.set(id, item));
    });
    onData(sortExamsByNewest(Array.from(merged.values())));
  };

  const scopedQueries = [
    {
      key: 'mine',
      q: query(collection(db, 'exams'), where('nguoiTaoUid', '==', profile.uid)),
    },
    {
      key: 'shared',
      q: query(collection(db, 'exams'), where('chiaSeKho', '==', true)),
    },
  ];

  const unsubs = scopedQueries.map(({ key, q }) =>
    onSnapshot(
      q,
      (snap) => {
        const map = new Map<string, ExamRecord>();
        snap.docs.forEach((d) => {
          map.set(d.id, { id: d.id, ...(d.data() as Omit<ExamRecord, 'id'>) });
        });
        buckets.set(key, map);
        syncAll();
      },
      (err) => {
        onError();
        handleFirestoreError(err, OperationType.LIST, 'exams');
      }
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function fetchExamsForTeacher(profile: UserProfile): Promise<ExamRecord[]> {
  try {
    if (profile.vaiTro === 'quanTri') {
      const snap = await getDocs(collection(db, 'exams'));
      return sortExamsByNewest(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ExamRecord, 'id'>),
        }))
      );
    }

    const [mineSnap, sharedSnap] = await Promise.all([
      getDocs(query(collection(db, 'exams'), where('nguoiTaoUid', '==', profile.uid))),
      getDocs(query(collection(db, 'exams'), where('chiaSeKho', '==', true))),
    ]);

    const merged = new Map<string, ExamRecord>();
    mineSnap.docs.forEach((d) =>
      merged.set(d.id, { id: d.id, ...(d.data() as Omit<ExamRecord, 'id'>) })
    );
    sharedSnap.docs.forEach((d) =>
      merged.set(d.id, { id: d.id, ...(d.data() as Omit<ExamRecord, 'id'>) })
    );

    return sortExamsByNewest(Array.from(merged.values()));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'exams');
  }
}

export function generateNewExamId(): string {
  return doc(collection(db, 'exams')).id;
}

function sanitizeExamConfigForFirestore(config: ExamConfig): ExamConfig {
  const cleaned: ExamConfig = {
    monHoc: config.monHoc,
    khoiLop: config.khoiLop,
    thoiDiemKiemTra: config.thoiDiemKiemTra,
    thoiGianLamBai: config.thoiGianLamBai,
    chuDeKienThuc: config.chuDeKienThuc,
    tyLeMucDo: config.tyLeMucDo,
    soCauTracNghiem: config.soCauTracNghiem,
    soCauTuLuan: config.soCauTuLuan,
    cacDangTracNghiem: config.cacDangTracNghiem,
  };
  if (config.namHoc) cleaned.namHoc = config.namHoc;
  if (config.boSach) cleaned.boSach = config.boSach;
  if (config.yeuCauBoSung) cleaned.yeuCauBoSung = config.yeuCauBoSung;
  return cleaned;
}

export async function saveExamToFirestore(
  profile: UserProfile,
  input: SaveExamInput,
  examId: string
): Promise<string> {
  const targetId = (examId || '').trim() || generateNewExamId();
  const path = `exams/${targetId}`;
  try {
    const examRef = doc(db, 'exams', targetId);
    const existingSnap = await getDoc(examRef);
    const cleanTitle = input.tieuDe.trim().slice(0, 220);
    const cleanConfig = sanitizeExamConfigForFirestore(input.config);

    if (existingSnap.exists()) {
      const updatePayload: Record<string, unknown> = {
        tieuDe: cleanTitle,
        config: cleanConfig,
        maTran: input.maTran,
        banDacTa: input.banDacTa,
        deKiemTra: input.deKiemTra,
        tongDiem: roundScore(input.tongDiem),
        toKhoi: input.toKhoi || profile.toKhoi || '',
        chiaSeKho: Boolean(input.chiaSeKho),
        trangThai: input.trangThai,
        ngayCapNhat: serverTimestamp(),
      };
      if (input.materialId !== undefined) {
        updatePayload.materialId = input.materialId;
      }
      await setDoc(examRef, updatePayload, { merge: true });
      return targetId;
    }

    const createPayload: Record<string, unknown> = {
      tieuDe: cleanTitle,
      config: cleanConfig,
      maTran: input.maTran,
      banDacTa: input.banDacTa,
      deKiemTra: input.deKiemTra,
      tongDiem: roundScore(input.tongDiem),
      nguoiTaoUid: profile.uid,
      nguoiTaoTen: profile.hoTen?.trim() || 'Giáo viên',
      toKhoi: input.toKhoi || profile.toKhoi || '',
      chiaSeKho: Boolean(input.chiaSeKho),
      trangThai: input.trangThai,
      materialId: input.materialId || '',
      ngayTao: serverTimestamp(),
      ngayCapNhat: serverTimestamp(),
    };

    await setDoc(examRef, createPayload);
    return targetId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateExamInFirestore(
  examId: string,
  updates: Partial<SaveExamInput>
): Promise<void> {
  const path = `exams/${examId}`;
  try {
    const cleanUpdates: Record<string, unknown> = {
      ngayCapNhat: serverTimestamp(),
    };

    if (updates.tieuDe !== undefined) {
      cleanUpdates.tieuDe = updates.tieuDe.trim().slice(0, 220);
    }
    if (updates.config !== undefined) {
      cleanUpdates.config = sanitizeExamConfigForFirestore(updates.config);
    }
    if (updates.maTran !== undefined) cleanUpdates.maTran = updates.maTran;
    if (updates.banDacTa !== undefined) cleanUpdates.banDacTa = updates.banDacTa;
    if (updates.deKiemTra !== undefined) cleanUpdates.deKiemTra = updates.deKiemTra;
    if (updates.tongDiem !== undefined) cleanUpdates.tongDiem = roundScore(updates.tongDiem);
    if (updates.toKhoi !== undefined) cleanUpdates.toKhoi = updates.toKhoi;
    if (updates.chiaSeKho !== undefined) cleanUpdates.chiaSeKho = updates.chiaSeKho;
    if (updates.trangThai !== undefined) cleanUpdates.trangThai = updates.trangThai;
    if (updates.materialId !== undefined) cleanUpdates.materialId = updates.materialId;

    await updateDoc(doc(db, 'exams', examId), cleanUpdates);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteExamFromFirestore(examId: string): Promise<void> {
  const path = `exams/${examId}`;
  try {
    await deleteDoc(doc(db, 'exams', examId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function buildExamLibraryUrl(examId: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://hoclieuso.vn';
  return `${origin}/#/de-kiem-tra/${examId}`;
}

export async function findExistingLibraryMaterialByTitle(
  uid: string,
  tieuDe: string
): Promise<LearningMaterial | null> {
  const path = 'materials';
  const normalizedTarget = tieuDe.trim().slice(0, 200).toLowerCase();
  if (!normalizedTarget) return null;

  try {
    const q = query(collection(db, 'materials'), where('nguoiDangUid', '==', uid));
    const snap = await getDocs(q);
    const matches: LearningMaterial[] = [];

    snap.docs.forEach((d) => {
      const data = d.data() as Omit<LearningMaterial, 'id'>;
      const candidateTitle = String(data.tieuDe || '').trim().toLowerCase();
      if (candidateTitle === normalizedTarget) {
        matches.push({ id: d.id, ...data });
      }
    });

    if (matches.length === 0) return null;

    matches.sort((a, b) => {
      const ta = a.ngayCapNhat?.toMillis?.() ?? a.ngayTao?.toMillis?.() ?? 0;
      const tb = b.ngayCapNhat?.toMillis?.() ?? b.ngayTao?.toMillis?.() ?? 0;
      return tb - ta;
    });

    return matches[0];
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export function canOverwriteLibraryMaterial(
  profile: UserProfile,
  existing: LearningMaterial
): boolean {
  if (profile.vaiTro === 'quanTri') return true;
  if (existing.nguoiDangUid !== profile.uid) return false;
  if (profile.vaiTro === 'toTruong') {
    return (
      existing.toKhoi === profile.toKhoi &&
      ['nhap', 'choDuyet', 'daDuyet', 'tuChoi'].includes(existing.trangThai)
    );
  }
  return ['nhap', 'choDuyet', 'tuChoi'].includes(existing.trangThai);
}

export interface ShareExamOptions {
  targetStatus?: 'choDuyet' | 'daDuyet';
  overwriteMaterialId?: string;
  forceNew?: boolean;
}

export async function shareExamToLibrary(
  profile: UserProfile,
  exam: ExamRecord,
  options: ShareExamOptions = {}
): Promise<string> {
  const targetStatus = options.targetStatus ?? 'choDuyet';
  const cleanTitle = exam.tieuDe.trim().slice(0, 200);
  const moTa = `Bộ đề kiểm tra ${exam.config.thoiDiemKiemTra} môn ${exam.config.monHoc} lớp ${exam.config.khoiLop} (${exam.config.thoiGianLamBai} phút) kèm Ma trận, Bản đặc tả GDPT 2018 và Đáp án biểu điểm.`;
  const tags = [
    'de-kiem-tra-ai',
    exam.config.monHoc.toLowerCase().slice(0, 50),
    `khoi-${exam.config.khoiLop}`,
  ].slice(0, 10);
  const url = buildExamLibraryUrl(exam.id);
  const toKhoi = exam.toKhoi || profile.toKhoi;

  const materialId = options.overwriteMaterialId
    ? options.overwriteMaterialId
    : options.forceNew
      ? doc(collection(db, 'materials')).id
      : exam.materialId || `exam_${exam.id}`;

  const matPath = `materials/${materialId}`;
  const matRef = doc(db, 'materials', materialId);

  try {
    const existingSnap = await getDoc(matRef);

    if (existingSnap.exists()) {
      const existingData = existingSnap.data() as Partial<LearningMaterial>;
      const existingStatus = existingData.trangThai;
      const updatePayload: Record<string, unknown> = {
        tieuDe: cleanTitle,
        moTa,
        monHoc: exam.config.monHoc,
        khoiLop: exam.config.khoiLop,
        loai: 'Đề kiểm tra',
        the: tags,
        loaiNguon: 'lienKet',
        url,
        tenTep: '',
        kichThuocTep: 0,
        duongDanStorage: '',
        toKhoi,
        lyDoTuChoi: '',
        ngayCapNhat: serverTimestamp(),
      };

      if (profile.vaiTro === 'toTruong' && existingStatus === 'daDuyet') {
        updatePayload.trangThai = 'daDuyet';
        updatePayload.ngayDuyet = serverTimestamp();
        updatePayload.nguoiDuyetUid = profile.uid;
        updatePayload.nguoiDuyetTen = profile.hoTen?.trim() || 'Tổ trưởng / BGH';
      } else if (profile.vaiTro === 'quanTri' && existingStatus) {
        updatePayload.trangThai = existingStatus;
      } else {
        updatePayload.trangThai = targetStatus;
      }

      await setDoc(matRef, updatePayload, { merge: true });
    } else {
      const isApprovedNow = targetStatus === 'daDuyet';
      const reviewerName = profile.hoTen?.trim() || 'Tổ trưởng / BGH';
      await setDoc(matRef, {
        tieuDe: cleanTitle,
        moTa,
        monHoc: exam.config.monHoc,
        khoiLop: exam.config.khoiLop,
        loai: 'Đề kiểm tra',
        the: tags,
        loaiNguon: 'lienKet',
        url,
        tenTep: '',
        kichThuocTep: 0,
        duongDanStorage: '',
        nguoiDangUid: profile.uid,
        nguoiDangTen: profile.hoTen?.trim() || 'Giáo viên',
        toKhoi,
        trangThai: targetStatus,
        lyDoTuChoi: '',
        luotXem: 0,
        luotTai: 0,
        ngayTao: serverTimestamp(),
        ngayCapNhat: serverTimestamp(),
        ngayDuyet: isApprovedNow ? serverTimestamp() : null,
        nguoiDuyetUid: isApprovedNow ? profile.uid : '',
        nguoiDuyetTen: isApprovedNow ? reviewerName : '',
        isSample: false,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, matPath);
  }

  await setDoc(
    doc(db, 'exams', exam.id),
    {
      chiaSeKho: true,
      trangThai: 'chiaSeKho',
      materialId,
      ngayCapNhat: serverTimestamp(),
    },
    { merge: true }
  );

  return materialId;
}
