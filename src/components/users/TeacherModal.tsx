import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, Unlock, X } from 'lucide-react';
import { generateTempPassword } from '../../lib/utils';
import {
  TEACHER_POSITIONS,
  TEACHER_ROLE_LABELS,
  type Teacher,
  type TeacherInput,
  type TeacherPosition,
  type TeacherRole,
} from '../../types/user';

interface TeacherModalProps {
  open: boolean;
  editingTeacher: Teacher | null;
  departmentOptions: string[];
  saving: boolean;
  isSelfEditing?: boolean;
  onClose: () => void;
  onSave: (data: TeacherInput, loginPassword?: string) => Promise<void>;
  onResetPassword?: (teacher: Teacher) => Promise<void>;
}

function inferRoleFromPosition(chucVu: string): TeacherRole {
  if (chucVu === 'Hiệu trưởng (BGH)' || chucVu === 'Quản trị viên (ADMIN)') {
    return 'ADMIN';
  }
  if (chucVu === 'Tổ trưởng chuyên môn') {
    return 'TO_TRUONG';
  }
  return 'GIAO_VIEN';
}

export function TeacherModal({
  open,
  editingTeacher,
  departmentOptions,
  saving,
  isSelfEditing = false,
  onClose,
  onSave,
  onResetPassword,
}: TeacherModalProps) {
  const isEditing = Boolean(editingTeacher);
  const hasLinkedAuth = Boolean(editingTeacher?.uid);

  const [maGV, setMaGV] = useState('');
  const [hoTen, setHoTen] = useState('');
  const [cccd, setCccd] = useState('');
  const [ngaySinh, setNgaySinh] = useState('');
  const [email, setEmail] = useState('');
  const [soDienThoai, setSoDienThoai] = useState('');
  const [chucVu, setChucVu] = useState<string>('Giáo viên');
  const [toChuyenMon, setToChuyenMon] = useState<string>(
    departmentOptions[0] || 'Tổ Chuyên Môn 1 (Khối Lớp 1)'
  );
  const [role, setRole] = useState<TeacherRole>('GIAO_VIEN');
  const [biKhoa, setBiKhoa] = useState(false);

  const [createAuthAccount, setCreateAuthAccount] = useState(true);
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(true);
  const [requireFirstChange, setRequireFirstChange] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setErrorMsg('');

    if (editingTeacher) {
      setMaGV(editingTeacher.maGV || '');
      setHoTen(editingTeacher.hoTen || '');
      setCccd(editingTeacher.cccd || '');
      setNgaySinh(editingTeacher.ngaySinh || '');
      setEmail(editingTeacher.email || '');
      setSoDienThoai(editingTeacher.soDienThoai || '');
      setChucVu(editingTeacher.chucVu || 'Giáo viên');
      setToChuyenMon(
        editingTeacher.toChuyenMon || departmentOptions[0] || 'Tổ Chuyên Môn 1 (Khối Lớp 1)'
      );
      setRole(editingTeacher.role || 'GIAO_VIEN');
      setBiKhoa(Boolean(editingTeacher.biKhoa));
      setCreateAuthAccount(false);
      setLoginPassword('');
      setShowPassword(true);
      setRequireFirstChange(Boolean(editingTeacher.yeuCauDoiMatKhau));
    } else {
      setMaGV('');
      setHoTen('');
      setCccd('');
      setNgaySinh('');
      setEmail('');
      setSoDienThoai('');
      setChucVu('Giáo viên');
      setToChuyenMon(departmentOptions[0] || 'Tổ Chuyên Môn 1 (Khối Lớp 1)');
      setRole('GIAO_VIEN');
      setBiKhoa(false);
      setCreateAuthAccount(true);
      setLoginPassword(generateTempPassword());
      setShowPassword(true);
      setRequireFirstChange(false);
    }
  }, [open, editingTeacher, departmentOptions]);

  if (!open) return null;

  const combinedDeptOptions = Array.from(
    new Set([...departmentOptions, ...(toChuyenMon ? [toChuyenMon] : [])])
  );

  function handlePositionChange(nextPos: string) {
    setChucVu(nextPos);
    if (!isSelfEditing) {
      setRole(inferRoleFromPosition(nextPos));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    if (hoTen.trim().length < 2) {
      setErrorMsg('Vui lòng nhập họ tên giáo viên (tối thiểu 2 ký tự).');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Vui lòng nhập địa chỉ Email hợp lệ.');
      return;
    }

    const cleanPassword = loginPassword.trim();
    if (!isEditing && createAuthAccount && cleanPassword.length < 6) {
      setErrorMsg('Mật khẩu đăng nhập phải có ít nhất 6 ký tự.');
      return;
    }
    if (isEditing && cleanPassword.length > 0 && cleanPassword.length < 6) {
      setErrorMsg('Mật khẩu đăng nhập phải có ít nhất 6 ký tự (hoặc để trống nếu không đổi).');
      return;
    }

    const passwordToApply =
      (!isEditing && createAuthAccount) || (isEditing && cleanPassword.length >= 6)
        ? cleanPassword
        : undefined;

    await onSave(
      {
        maGV: maGV.trim(),
        hoTen: hoTen.trim(),
        cccd: cccd.trim(),
        ngaySinh: ngaySinh.trim(),
        email: email.trim().toLowerCase(),
        soDienThoai: soDienThoai.trim(),
        chucVu: chucVu as TeacherPosition,
        toChuyenMon,
        role,
        biKhoa,
        yeuCauDoiMatKhau: requireFirstChange,
      },
      passwordToApply
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-3 sm:p-5 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="teacher-modal-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-50 text-teal-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="teacher-modal-title" className="text-lg font-bold text-slate-900">
                {isEditing ? 'Chỉnh sửa thông tin giáo viên' : 'Thêm giáo viên mới'}
              </h2>
              <p className="text-xs text-slate-500">
                Phân công đúng Tổ chuyên môn, Chức vụ và cấp Mật khẩu đăng nhập cho giáo viên.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm font-medium text-rose-800">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="tm-magv" className="block text-xs font-semibold text-slate-700 mb-1">
                Mã giáo viên
              </label>
              <input
                id="tm-magv"
                type="text"
                maxLength={30}
                value={maGV}
                onChange={(e) => setMaGV(e.target.value)}
                placeholder="VD: gv-08"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:border-teal-700"
              />
            </div>

            <div>
              <label htmlFor="tm-hoten" className="block text-xs font-semibold text-slate-700 mb-1">
                Họ và tên <span className="text-rose-600">*</span>
              </label>
              <input
                id="tm-hoten"
                type="text"
                required
                maxLength={120}
                value={hoTen}
                onChange={(e) => setHoTen(e.target.value)}
                placeholder="Nguyễn Thị Lan"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-700"
              />
            </div>

            <div>
              <label htmlFor="tm-cccd" className="block text-xs font-semibold text-slate-700 mb-1">
                Số CCCD
              </label>
              <input
                id="tm-cccd"
                type="text"
                maxLength={20}
                value={cccd}
                onChange={(e) => setCccd(e.target.value)}
                placeholder="036190001234"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:border-teal-700"
              />
            </div>

            <div>
              <label htmlFor="tm-ngaysinh" className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày sinh
              </label>
              <input
                id="tm-ngaysinh"
                type="date"
                value={ngaySinh}
                onChange={(e) => setNgaySinh(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-700"
              />
            </div>

            <div>
              <label htmlFor="tm-email" className="block text-xs font-semibold text-slate-700 mb-1">
                Email công tác (dùng đăng nhập) <span className="text-rose-600">*</span>
              </label>
              <input
                id="tm-email"
                type="email"
                required
                disabled={isEditing && hasLinkedAuth}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="lan.nt@quanghung.edu.vn"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:border-teal-700"
              />
            </div>

            <div>
              <label htmlFor="tm-sdt" className="block text-xs font-semibold text-slate-700 mb-1">
                Số điện thoại
              </label>
              <input
                id="tm-sdt"
                type="tel"
                maxLength={20}
                value={soDienThoai}
                onChange={(e) => setSoDienThoai(e.target.value)}
                placeholder="0912345678"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:border-teal-700"
              />
            </div>
          </div>

          {/* Ô nhập Mật khẩu đăng nhập cho giáo viên (hiển thị cả khi Thêm mới & Chỉnh sửa) */}
          <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-teal-800" />
                <span className="text-sm font-bold text-teal-950">
                  {isEditing
                    ? hasLinkedAuth
                      ? 'Tài khoản đăng nhập Firebase Auth (Đã kích hoạt)'
                      : 'Cấp mật khẩu đăng nhập cho giáo viên (Chưa có tài khoản Auth)'
                    : 'Mật khẩu đăng nhập tài khoản giáo viên'}
                </span>
              </div>

              {!isEditing && (
                <label className="flex items-center gap-2 text-xs font-semibold text-teal-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createAuthAccount}
                    onChange={(e) => setCreateAuthAccount(e.target.checked)}
                    className="w-4 h-4 accent-teal-700 rounded"
                  />
                  Tạo tài khoản đăng nhập ngay
                </label>
              )}
            </div>

            {(createAuthAccount || isEditing) && (
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      id="tm-password"
                      type={showPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder={
                        isEditing
                          ? 'Nhập mật khẩu (≥ 6 ký tự, VD: 123456) để cấp tài khoản đăng nhập thử'
                          : 'Nhập mật khẩu đăng nhập (≥ 6 ký tự, VD: 123456)'
                      }
                      className="w-full min-h-[44px] pl-3.5 pr-10 py-2 rounded-xl border border-teal-300 bg-white font-mono text-sm focus:outline-none focus:border-teal-700"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-slate-800"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLoginPassword(generateTempPassword())}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-teal-300 bg-white text-xs font-bold text-teal-800 hover:bg-teal-100 whitespace-nowrap"
                  >
                    Tạo mã ngẫu nhiên
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-teal-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireFirstChange}
                      onChange={(e) => setRequireFirstChange(e.target.checked)}
                      className="w-4 h-4 accent-teal-700 rounded"
                    />
                    Yêu cầu giáo viên đổi mật khẩu khi đăng nhập lần đầu
                  </label>
                </div>

                {isEditing && hasLinkedAuth && (
                  <p className="text-xs text-slate-600">
                    Lưu ý: Nếu email này đã tạo tài khoản trên Firebase Auth trước đó, trình duyệt không thể tự ghi đè mật khẩu cũ — thầy/cô hãy dùng nút{' '}
                    <span className="font-semibold text-slate-800">"Gửi email đặt lại mật khẩu"</span> bên dưới nếu cần đổi mật khẩu.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Phân công Tổ & Chức vụ / Quyền hạn */}
          <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="tm-to" className="block text-xs font-semibold text-slate-700 mb-1">
                Tổ Chuyên Môn <span className="text-rose-600">*</span>
              </label>
              <select
                id="tm-to"
                value={toChuyenMon}
                onChange={(e) => setToChuyenMon(e.target.value)}
                className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:border-teal-700"
              >
                {combinedDeptOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="tm-chucvu" className="block text-xs font-semibold text-slate-700 mb-1">
                Chức vụ <span className="text-rose-600">*</span>
              </label>
              <select
                id="tm-chucvu"
                value={chucVu}
                onChange={(e) => handlePositionChange(e.target.value)}
                className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:border-teal-700"
              >
                {TEACHER_POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="tm-role" className="block text-xs font-semibold text-slate-700 mb-1">
                Quyền hạn hệ thống <span className="text-rose-600">*</span>
              </label>
              <select
                id="tm-role"
                disabled={isSelfEditing}
                value={role}
                onChange={(e) => setRole(e.target.value as TeacherRole)}
                className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 disabled:bg-slate-50 focus:outline-none focus:border-teal-700"
              >
                {(['GIAO_VIEN', 'TO_TRUONG', 'ADMIN'] as TeacherRole[]).map((r) => (
                  <option key={r} value={r}>
                    {TEACHER_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Thao tác bảo mật khi chỉnh sửa giáo viên */}
          {isEditing && editingTeacher && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-wrap items-center justify-between gap-3">
              {!isSelfEditing && (
                <button
                  type="button"
                  onClick={() => setBiKhoa((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold ${
                    biKhoa
                      ? 'border-teal-300 bg-teal-50 text-teal-800'
                      : 'border-rose-300 bg-white text-rose-700 hover:bg-rose-50'
                  }`}
                >
                  {biKhoa ? (
                    <>
                      <Unlock className="w-4 h-4" />
                      Đang tạm khóa (Bấm để mở khóa)
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      Khóa tài khoản này
                    </>
                  )}
                </button>
              )}

              {onResetPassword && (
                <button
                  type="button"
                  onClick={() => onResetPassword(editingTeacher)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <KeyRound className="w-4 h-4" />
                  Gửi email đặt lại mật khẩu
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-100"
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-6 py-2 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-60"
          >
            {saving ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Thêm giáo viên'}
          </button>
        </div>
      </form>
    </div>
  );
}
