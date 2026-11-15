import React, { useState } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { BookOpenCheck, KeyRound, Save, User } from 'lucide-react';
import { auth } from '../config/firebase';
import { updateUserProfileFields } from '../services/userService';
import { ROLE_LABELS, type UserProfile } from '../types/hocLieu';
import { useToast } from '../components/ToastContext';
import { SetupGuideContent } from '../components/SetupGuideContent';

export function ProfileView({ profile }: { profile: UserProfile }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'account' | 'guide'>('account');

  const [hoTen, setHoTen] = useState(profile.hoTen);
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);
  const [passError, setPassError] = useState('');

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    const clean = hoTen.trim();
    if (clean.length < 2) {
      showToast('Họ tên phải có ít nhất 2 ký tự.', 'warning');
      return;
    }
    setSavingName(true);
    try {
      await updateUserProfileFields(profile.uid, { hoTen: clean.slice(0, 120) });
      showToast('Đã cập nhật họ tên thành công.', 'success');
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPassError('');

    if (newPassword.length < 6) {
      setPassError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError('Mật khẩu xác nhận không trùng khớp.');
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) return;

    setChangingPass(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Đổi mật khẩu thành công.', 'success');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setPassError('Mật khẩu hiện tại chưa chính xác.');
      } else {
        setPassError('Không thể đổi mật khẩu. Vui lòng kiểm tra lại.');
      }
    } finally {
      setChangingPass(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Thông tin cá nhân
        </h1>
        <p className="mt-1 text-[15px] text-slate-600">
          Xem hồ sơ công tác, đổi mật khẩu tài khoản hoặc tra cứu tài liệu hướng dẫn cấu hình hệ thống.
        </p>
      </div>

      <div className="inline-flex p-1.5 bg-slate-100 rounded-2xl gap-1">
        <button
          type="button"
          onClick={() => setTab('account')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tab === 'account' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <User className="w-4 h-4" />
          Hồ sơ &amp; Mật khẩu
        </button>
        <button
          type="button"
          onClick={() => setTab('guide')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tab === 'guide' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BookOpenCheck className="w-4 h-4" />
          Hướng dẫn Firebase &amp; Vercel
        </button>
      </div>

      {tab === 'account' ? (
        <div className="space-y-6">
          {/* Thông tin tài khoản */}
          <form
            onSubmit={handleSaveName}
            className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5"
          >
            <h2 className="text-lg font-bold text-slate-900">Hồ sơ giáo viên</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="p-name" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Họ và tên
                </label>
                <input
                  id="p-name"
                  type="text"
                  required
                  value={hoTen}
                  onChange={(e) => setHoTen(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 text-base focus:outline-none focus:border-teal-700"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Email đăng nhập
                </label>
                <input
                  type="text"
                  disabled
                  value={profile.email}
                  className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-base text-slate-600"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Vai trò phân quyền
                </label>
                <input
                  type="text"
                  disabled
                  value={ROLE_LABELS[profile.vaiTro]}
                  className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-base text-slate-700 font-semibold"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Tổ khối công tác
                </label>
                <input
                  type="text"
                  disabled
                  value={profile.toKhoi}
                  className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-base text-slate-700 font-semibold"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingName}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {savingName ? 'Đang lưu...' : 'Cập nhật họ tên'}
              </button>
            </div>
          </form>

          {/* Đổi mật khẩu */}
          <form
            onSubmit={handleChangePassword}
            className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
          >
            <div className="flex items-center gap-2.5">
              <KeyRound className="w-5 h-5 text-teal-700" />
              <h2 className="text-lg font-bold text-slate-900">Đổi mật khẩu</h2>
            </div>

            {passError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm font-medium text-rose-800">
                {passError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="p-cur" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Mật khẩu hiện tại
                </label>
                <input
                  id="p-cur"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 text-base focus:outline-none focus:border-teal-700"
                />
              </div>

              <div>
                <label htmlFor="p-new" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Mật khẩu mới
                </label>
                <input
                  id="p-new"
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 text-base focus:outline-none focus:border-teal-700"
                />
              </div>

              <div>
                <label htmlFor="p-conf" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Xác nhận mật khẩu mới
                </label>
                <input
                  id="p-conf"
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 text-base focus:outline-none focus:border-teal-700"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={changingPass}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-60"
              >
                {changingPass ? 'Đang cập nhật...' : 'Đổi mật khẩu'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <SetupGuideContent />
        </div>
      )}
    </div>
  );
}
