import type { Timestamp } from 'firebase/firestore';

export type AppView =
  | 'library'
  | 'myMaterials'
  | 'upload'
  | 'aiGame'
  | 'aiPpt'
  | 'examGenerator'
  | 'lessonPlanGenerator'
  | 'approval'
  | 'admin'
  | 'profile';

export type UserRole = 'giaoVien' | 'toTruong' | 'quanTri';

export type MaterialStatus =
  | 'nhap'
  | 'choDuyet'
  | 'daDuyet'
  | 'chiaSeToanTruong'
  | 'tuChoi';

import type { SavedPptConfig, SavedPptSlideData } from './ppt';

export type MaterialSourceType = 'tep' | 'lienKet' | 'troChoi' | 'pptAi';

export type GameType =
  | 'Trắc nghiệm'
  | 'Ghép đôi'
  | 'Ô chữ'
  | 'Kéo thả'
  | 'Đúng/Sai'
  | 'Tự do (sáng tạo)';

export const GAME_TYPES: GameType[] = [
  'Trắc nghiệm',
  'Ghép đôi',
  'Ô chữ',
  'Kéo thả',
  'Đúng/Sai',
  'Tự do (sáng tạo)',
];

export type GameQuestionCount = 5 | 8 | 10 | 15;
export const GAME_QUESTION_COUNTS: GameQuestionCount[] = [5, 8, 10, 15];

export type GameDifficulty = 'Dễ' | 'Vừa' | 'Khó';
export const GAME_DIFFICULTIES: GameDifficulty[] = ['Dễ', 'Vừa', 'Khó'];

export type GradeLevel = '1' | '2' | '3' | '4' | '5' | 'Dùng chung';

export type MaterialCategory =
  | 'Bài giảng PPT AI'
  | 'Bài giảng điện tử'
  | 'Giáo án'
  | 'Video'
  | 'Đề kiểm tra'
  | 'Bài tập tương tác'
  | 'Hình ảnh'
  | 'Video tương tác'
  | 'Bài giảng E-learning'
  | 'Khác';

export interface UserProfile {
  uid: string;
  hoTen: string;
  email: string;
  vaiTro: UserRole;
  toKhoi: string;
  role?: 'ADMIN' | 'TO_TRUONG' | 'GIAO_VIEN';
  chucVu?: string;
  toChuyenMon?: string;
  biKhoa: boolean;
  yeuCauDoiMatKhau: boolean;
  ngayTao: Timestamp | null;
  ngayCapNhat: Timestamp | null;
}

export interface LearningMaterial {
  id: string;
  tieuDe: string;
  moTa: string;
  monHoc: string;
  khoiLop: GradeLevel;
  loai: MaterialCategory;
  the: string[];
  loaiNguon: MaterialSourceType;
  url: string;
  tenTep: string;
  kichThuocTep: number;
  duongDanStorage: string;
  nguoiDangUid: string;
  nguoiDangTen: string;
  toKhoi: string;
  trangThai: MaterialStatus;
  lyDoTuChoi: string;
  luotXem: number;
  luotTai: number;
  ngayTao: Timestamp | null;
  ngayCapNhat: Timestamp | null;
  ngayDuyet: Timestamp | null;
  nguoiDuyetUid: string;
  nguoiDuyetTen: string;
  isSample: boolean;
  tenBaiHoc?: string;
  htmlTroChoi?: string;
  maChiaSe?: string;
  chiaSeLink?: boolean;
  dangTroChoi?: string;
  slidesData?: SavedPptSlideData[];
  pptConfig?: SavedPptConfig;
}

export interface MaterialInput {
  tieuDe: string;
  moTa: string;
  monHoc: string;
  khoiLop: GradeLevel;
  loai: MaterialCategory;
  the: string[];
  loaiNguon: MaterialSourceType;
  url: string;
  tenTep: string;
  kichThuocTep: number;
  duongDanStorage: string;
  toKhoi: string;
  trangThai: 'nhap' | 'choDuyet' | 'daDuyet';
  tenBaiHoc?: string;
  htmlTroChoi?: string;
  maChiaSe?: string;
  chiaSeLink?: boolean;
  dangTroChoi?: string;
  slidesData?: SavedPptSlideData[];
  pptConfig?: SavedPptConfig;
}

export interface PublicGameRecord {
  maChiaSe: string;
  materialId: string;
  tieuDe: string;
  monHoc: string;
  khoiLop: GradeLevel;
  dangTroChoi: string;
  htmlTroChoi: string;
  chiaSeLink: boolean;
  nguoiDangUid: string;
  toKhoi: string;
  ngayTao: Timestamp | null;
  ngayCapNhat: Timestamp | null;
}

export interface SubjectItem {
  id: string;
  ten: string;
  thuTu: number;
  kichHoat: boolean;
  isSample: boolean;
  ngayTao: Timestamp | null;
  ngayCapNhat: Timestamp | null;
}

export interface DepartmentItem {
  id: string;
  ten: string;
  moTa: string;
  thuTu: number;
  kichHoat: boolean;
  isSample: boolean;
  ngayTao: Timestamp | null;
  ngayCapNhat: Timestamp | null;
}

export const GRADE_LEVELS: { value: GradeLevel; label: string }[] = [
  { value: '1', label: 'Khối 1' },
  { value: '2', label: 'Khối 2' },
  { value: '3', label: 'Khối 3' },
  { value: '4', label: 'Khối 4' },
  { value: '5', label: 'Khối 5' },
  { value: 'Dùng chung', label: 'Dùng chung nhiều khối' },
];

export const MATERIAL_CATEGORIES: MaterialCategory[] = [
  'Bài giảng PPT AI',
  'Bài giảng điện tử',
  'Giáo án',
  'Video',
  'Đề kiểm tra',
  'Bài tập tương tác',
  'Hình ảnh',
  'Video tương tác',
  'Bài giảng E-learning',
  'Khác',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  giaoVien: 'Giáo viên',
  toTruong: 'Tổ trưởng chuyên môn',
  quanTri: 'Quản trị (BGH / Thư viện)',
};

export const STATUS_LABELS: Record<MaterialStatus, string> = {
  nhap: 'Bản nháp',
  choDuyet: 'Chờ duyệt',
  daDuyet: 'Đã duyệt (Tổ khối)',
  chiaSeToanTruong: 'Chia sẻ toàn trường',
  tuChoi: 'Cần chỉnh sửa (Từ chối)',
};

export const DEFAULT_SUBJECTS: { ten: string; thuTu: number }[] = [
  { ten: 'Toán', thuTu: 1 },
  { ten: 'Tiếng Việt', thuTu: 2 },
  { ten: 'Tiếng Anh', thuTu: 3 },
  { ten: 'Tin học', thuTu: 4 },
  { ten: 'Công nghệ', thuTu: 5 },
  { ten: 'Khoa học', thuTu: 6 },
  { ten: 'Lịch sử và Địa lí', thuTu: 7 },
  { ten: 'Tự nhiên và Xã hội', thuTu: 8 },
  { ten: 'Đạo đức', thuTu: 9 },
  { ten: 'Âm nhạc', thuTu: 10 },
  { ten: 'Mĩ thuật', thuTu: 11 },
  { ten: 'Giáo dục thể chất', thuTu: 12 },
  { ten: 'Hoạt động trải nghiệm', thuTu: 13 },
];

export const DEFAULT_DEPARTMENTS: { ten: string; moTa: string; thuTu: number }[] = [
  { ten: 'Khối 1', moTa: 'Giáo viên chủ nhiệm và giảng dạy lớp 1', thuTu: 1 },
  { ten: 'Khối 2', moTa: 'Giáo viên chủ nhiệm và giảng dạy lớp 2', thuTu: 2 },
  { ten: 'Khối 3', moTa: 'Giáo viên chủ nhiệm và giảng dạy lớp 3', thuTu: 3 },
  { ten: 'Khối 4', moTa: 'Giáo viên chủ nhiệm và giảng dạy lớp 4', thuTu: 4 },
  { ten: 'Khối 5', moTa: 'Giáo viên chủ nhiệm và giảng dạy lớp 5', thuTu: 5 },
  { ten: 'Tổ Văn phòng', moTa: 'Ban giám hiệu, Thư viện - Thiết bị, Văn thư, Kế toán', thuTu: 6 },
  {
    ten: 'Tổ Chuyên biệt',
    moTa: 'Tin học, Anh văn, Âm nhạc, Mĩ thuật, Thể dục',
    thuTu: 7,
  },
];
