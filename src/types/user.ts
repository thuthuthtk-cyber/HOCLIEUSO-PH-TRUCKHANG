import type { UserRole } from './hocLieu';

export type TeacherRole = 'ADMIN' | 'TO_TRUONG' | 'GIAO_VIEN';

export type TeacherPosition =
  | 'Hiệu trưởng (BGH)'
  | 'Quản trị viên (ADMIN)'
  | 'Tổ trưởng chuyên môn'
  | 'Giáo viên';

export interface Teacher {
  id: string;
  uid?: string;
  maGV: string;
  hoTen: string;
  cccd: string;
  ngaySinh: string;
  email: string;
  soDienThoai: string;
  chucVu: TeacherPosition | string;
  toChuyenMon: string;
  role: TeacherRole;
  biKhoa?: boolean;
  yeuCauDoiMatKhau?: boolean;
}

export type TeacherInput = Omit<Teacher, 'id'>;

export const TEACHER_POSITIONS: TeacherPosition[] = [
  'Hiệu trưởng (BGH)',
  'Quản trị viên (ADMIN)',
  'Tổ trưởng chuyên môn',
  'Giáo viên',
];

export const TEACHER_ROLE_LABELS: Record<TeacherRole, string> = {
  ADMIN: 'Quản trị viên (ADMIN)',
  TO_TRUONG: 'Tổ trưởng chuyên môn',
  GIAO_VIEN: 'Giáo viên',
};

export const DEFAULT_TO_CHUYEN_MON: string[] = [
  'Tổ Ban Giám Hiệu',
  'Tổ Chuyên Môn 1',
  'Tổ Chuyên Môn 2',
  'Tổ Chuyên Môn 3',
  'Tổ Chuyên Môn 4',
  'Tổ Chuyên Môn 5',
  'Tổ Chuyên biệt',
  'Tổ Văn phòng',
];

export function mapTeacherRoleToVaiTro(role: TeacherRole): UserRole {
  if (role === 'ADMIN') return 'quanTri';
  if (role === 'TO_TRUONG') return 'toTruong';
  return 'giaoVien';
}

export function mapVaiTroToTeacherRole(vaiTro?: string): TeacherRole {
  if (vaiTro === 'quanTri') return 'ADMIN';
  if (vaiTro === 'toTruong') return 'TO_TRUONG';
  return 'GIAO_VIEN';
}
