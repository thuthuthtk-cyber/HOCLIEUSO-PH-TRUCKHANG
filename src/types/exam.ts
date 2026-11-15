import type { Timestamp } from 'firebase/firestore';

export const PRIMARY_EXAM_SUBJECTS = [
  'Toán',
  'Tiếng Việt',
  'Tiếng Anh',
  'Tự nhiên và Xã hội',
  'Khoa học',
  'Lịch sử và Địa lí',
  'Tin học',
  'Công nghệ',
  'Đạo đức',
  'Âm nhạc',
  'Mĩ thuật',
  'Hoạt động trải nghiệm',
] as const;

export type PrimaryExamSubject = (typeof PRIMARY_EXAM_SUBJECTS)[number];

export type ExamGradeLevel = '1' | '2' | '3' | '4' | '5';

export const EXAM_GRADE_LEVELS: { value: ExamGradeLevel; label: string }[] = [
  { value: '1', label: 'Khối 1' },
  { value: '2', label: 'Khối 2' },
  { value: '3', label: 'Khối 3' },
  { value: '4', label: 'Khối 4' },
  { value: '5', label: 'Khối 5' },
];

export const EXAM_PERIODS = [
  'Giữa học kì I',
  'Cuối học kì I',
  'Giữa học kì II',
  'Cuối năm học',
] as const;

export type ExamPeriod = (typeof EXAM_PERIODS)[number];

export type ExamDurationMinutes = 35 | 40;

export const EXAM_DURATIONS: ExamDurationMinutes[] = [35, 40];

export interface CognitiveLevelRatio {
  /** Tỷ lệ % Mức 1 (Nhận biết, nhắc lại kiến thức/kĩ năng đã học) */
  muc1_NhanBiet: number;
  /** Tỷ lệ % Mức 2 (Kết nối, sắp xếp thông tin, giải quyết vấn đề tương tự) */
  muc2_KetNoi: number;
  /** Tỷ lệ % Mức 3 (Vận dụng kiến thức/kĩ năng vào tình huống mới, thực tiễn) */
  muc3_VanDung: number;
}

export const AVAILABLE_MULTIPLE_CHOICE_TYPES = [
  'Khoanh tròn chữ cái (A, B, C, D)',
  'Điền khuyết',
  'Nối cột',
  'Đúng / Sai',
] as const;

export type MultipleChoiceType = (typeof AVAILABLE_MULTIPLE_CHOICE_TYPES)[number];

export interface ExamConfig {
  monHoc: PrimaryExamSubject | string;
  khoiLop: ExamGradeLevel;
  thoiDiemKiemTra: ExamPeriod;
  thoiGianLamBai: ExamDurationMinutes;
  chuDeKienThuc: string[];
  tyLeMucDo: CognitiveLevelRatio;
  soCauTracNghiem: number;
  soCauTuLuan: number;
  cacDangTracNghiem: string[];
  namHoc?: string;
  boSach?: string;
  yeuCauBoSung?: string;
}

export interface MatrixCellAllocation {
  /** Số câu Trắc nghiệm khách quan */
  tnSoCau: number;
  /** Điểm Trắc nghiệm khách quan */
  tnDiem: number;
  /** Số câu Tự luận */
  tlSoCau: number;
  /** Điểm Tự luận */
  tlDiem: number;
}

export interface MatrixRow {
  id: string;
  /** Mạch kiến thức / Chủ đề */
  machKienThuc: string;
  /** Mức 1: Nhận biết */
  muc1: MatrixCellAllocation;
  /** Mức 2: Kết nối / Thông hiểu */
  muc2: MatrixCellAllocation;
  /** Mức 3: Vận dụng */
  muc3: MatrixCellAllocation;
  /** Tổng số câu của mạch kiến thức */
  tongSoCau: number;
  /** Tổng điểm của mạch kiến thức */
  tongDiem: number;
  /** Tỷ lệ % điểm của mạch kiến thức (trên tổng 10 điểm) */
  tyLePhanTram: number;
}

export interface MatrixSummaryTotals {
  muc1TnSoCau: number;
  muc1TnDiem: number;
  muc1TlSoCau: number;
  muc1TlDiem: number;
  muc2TnSoCau: number;
  muc2TnDiem: number;
  muc2TlSoCau: number;
  muc2TlDiem: number;
  muc3TnSoCau: number;
  muc3TnDiem: number;
  muc3TlSoCau: number;
  muc3TlDiem: number;
  tongTnSoCau: number;
  tongTnDiem: number;
  tongTlSoCau: number;
  tongTlDiem: number;
  tongSoCau: number;
  tongDiem: number;
  tongTyLePhanTram: number;
}

export type CognitiveLevel = 'Mức 1' | 'Mức 2' | 'Mức 3';

export type ExamQuestionFormat =
  | 'Trắc nghiệm 4 lựa chọn'
  | 'Đúng-Sai'
  | 'Nối'
  | 'Điền khuyết'
  | 'Tự luận';

export interface QuestionCompetencyDetail {
  soThuTuCau: number;
  mucDo: CognitiveLevel;
  hinhThuc: ExamQuestionFormat;
  nangLucCanDat: string;
}

export interface SpecificationRow {
  id: string;
  /** Mạch kiến thức / Chủ đề */
  machKienThuc: string;
  /** Đơn vị kiến thức và Yêu cầu cần đạt (YCCĐ) theo GDPT 2018 */
  donViKienThuc: string;
  muc1_SoCau: number;
  muc2_SoCau: number;
  muc3_SoCau: number;
  /** Mô tả chi tiết năng lực học sinh cần đạt ở từng câu */
  moTaChiTietTheoCau: QuestionCompetencyDetail[];
}

export interface ExamQuestion {
  soThuTu: number;
  mucDo: CognitiveLevel;
  hinhThuc: ExamQuestionFormat;
  machKienThuc: string;
  noiDungCauHoi: string;
  /** Các phương án lựa chọn (A, B, C, D hoặc các mệnh đề Đúng-Sai) */
  cacLuaChon?: string[];
  /** Cột A nếu câu hỏi thuộc dạng Nối */
  cotBenTrai?: string[];
  /** Cột B nếu câu hỏi thuộc dạng Nối */
  cotBenPhai?: string[];
  /** Đáp án chi tiết */
  dapAnChiTiet: string;
  /** Hướng dẫn chấm điểm / Biểu điểm chi tiết */
  huongDanCham: string;
  /** Điểm tối đa của câu hỏi */
  diem: number;
}

export interface GeneratedExamPackage {
  tieuDeDeThi: string;
  maTran: MatrixRow[];
  banDacTa: SpecificationRow[];
  deKiemTra: ExamQuestion[];
  tongDiem: number;
}

export type ExamRecordStatus = 'nhap' | 'daLuu' | 'chiaSeKho';

export interface ExamRecord {
  id: string;
  tieuDe: string;
  config: ExamConfig;
  maTran: MatrixRow[];
  banDacTa: SpecificationRow[];
  deKiemTra: ExamQuestion[];
  tongDiem: number;
  nguoiTaoUid: string;
  nguoiTaoTen: string;
  toKhoi: string;
  chiaSeKho: boolean;
  trangThai: ExamRecordStatus;
  materialId?: string;
  ngayTao: Timestamp | null;
  ngayCapNhat: Timestamp | null;
}

export interface SaveExamInput {
  tieuDe: string;
  config: ExamConfig;
  maTran: MatrixRow[];
  banDacTa: SpecificationRow[];
  deKiemTra: ExamQuestion[];
  tongDiem: number;
  toKhoi: string;
  chiaSeKho: boolean;
  trangThai: ExamRecordStatus;
  materialId?: string;
}
