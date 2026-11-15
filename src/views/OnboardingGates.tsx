import React, { useState } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Lock,
  LogOut,
  MailCheck,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { auth, db, firebaseConfig, handleFirestoreError, OperationType } from '../config/firebase';
import type { UserProfile } from '../types/hocLieu';
import { useToast } from '../components/ToastContext';

export function MissingProfileGate({
  authUser,
  onRefresh,
}: {
  authUser: User;
  onRefresh: () => void;
}) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [sendingVerify, setSendingVerify] = useState(false);
  const [checking, setChecking] = useState(false);
  const [emailVerifiedNow, setEmailVerifiedNow] = useState(authUser.emailVerified);

  const isBootstrapEmail = authUser.email === 'thuthuthtk@gmail.com';
  const canBootstrap = isBootstrapEmail && emailVerifiedNow;

  function copyUid() {
    navigator.clipboard.writeText(authUser.uid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('Đã sao chép User UID.', 'success');
  }

  async function handleSendVerification() {
    setSendingVerify(true);
    try {
      await sendEmailVerification(authUser);
      showToast(
        `Đã gửi email xác minh tới ${authUser.email}. Mở Gmail bấm vào liên kết rồi quay lại đây bấm "Kiểm tra lại".`,
        'success'
      );
    } catch {
      showToast('Không thể gửi email xác minh lúc này. Vui lòng thử lại sau ít phút.', 'error');
    } finally {
      setSendingVerify(false);
    }
  }

  async function handleCheckAgain() {
    setChecking(true);
    try {
      await authUser.reload();
      await authUser.getIdToken(true);
      setEmailVerifiedNow(authUser.emailVerified);
    } catch {
      // ignore reload error
    } finally {
      setChecking(false);
      onRefresh();
    }
  }

  async function handleBootstrapAdmin() {
    setBootstrapping(true);
    const path = `users/${authUser.uid}`;
    try {
      await authUser.getIdToken(true);
      await setDoc(doc(db, 'users', authUser.uid), {
        uid: authUser.uid,
        hoTen: authUser.displayName || 'Quản trị viên Nhà trường',
        email: authUser.email || '',
        vaiTro: 'quanTri',
        toKhoi: 'Tổ Văn phòng',
        biKhoa: false,
        yeuCauDoiMatKhau: false,
        ngayTao: serverTimestamp(),
        ngayCapNhat: serverTimestamp(),
      });
      showToast('Đã khởi tạo hồ sơ Quản trị viên thành công.', 'success');
      onRefresh();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setBootstrapping(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-amber-50 text-amber-700 shrink-0">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Tài khoản chưa có hồ sơ phân quyền trong Firestore
            </h1>
            <p className="mt-1.5 text-[15px] text-slate-600 leading-relaxed">
              Bạn đã đăng nhập thành công bằng tài khoản <span className="font-semibold text-slate-900">{authUser.email}</span>, nhưng hệ thống chưa tìm thấy thông tin vai trò và tổ khối trong collection <code className="px-1.5 py-0.5 rounded bg-slate-100 text-xs font-mono">users</code>.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-600 font-medium">User UID của bạn:</span>
            <button
              type="button"
              onClick={copyUid}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-teal-700" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Đã sao chép' : 'Sao chép UID'}
            </button>
          </div>
          <code className="block font-mono text-xs sm:text-sm text-slate-900 break-all bg-white p-2.5 rounded-lg border border-slate-200">
            {authUser.uid}
          </code>
        </div>

        {canBootstrap ? (
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-teal-900">
              Email quản trị ({authUser.email}) đã được xác minh. Bấm nút dưới đây để tự động tạo hồ sơ Quản trị viên:
            </p>
            <button
              type="button"
              onClick={handleBootstrapAdmin}
              disabled={bootstrapping}
              className="min-h-[46px] px-5 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-60"
            >
              {bootstrapping ? 'Đang khởi tạo...' : 'Khởi tạo hồ sơ Quản trị viên ngay'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {isBootstrapEmail && !emailVerifiedNow && (
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 space-y-3">
                <p className="text-sm font-bold text-teal-950">
                  Cách 1 (Nhanh nhất): Xác minh email để tự động khởi tạo Quản trị viên
                </p>
                <p className="text-sm text-teal-900">
                  Tài khoản tạo thủ công trong Firebase Console chưa xác minh email. Bấm nút bên dưới để nhận liên kết xác minh qua Gmail, bấm xác nhận trong email rồi quay lại bấm <strong>Kiểm tra lại</strong>:
                </p>
                <button
                  type="button"
                  onClick={handleSendVerification}
                  disabled={sendingVerify}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-60"
                >
                  <MailCheck className="w-4 h-4" />
                  {sendingVerify ? 'Đang gửi...' : `Gửi email xác minh tới ${authUser.email}`}
                </button>
              </div>
            )}

            <div className="space-y-2.5 text-sm text-slate-700 leading-relaxed">
              <p className="font-bold text-slate-900">
                {isBootstrapEmail
                  ? 'Cách 2: Tự tạo hồ sơ Quản trị viên trong Firebase Console (không cần xác minh email):'
                  : 'Nếu bạn là Quản trị viên đầu tiên (Ban giám hiệu / Thư viện):'}
              </p>
              <ol className="list-decimal pl-5 space-y-1.5">
                <li>
                  Mở <span className="font-semibold">Firebase Console → Firestore</span> (menu bên trái) → chọn đúng database{' '}
                  <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-xs">
                    {firebaseConfig.firestoreDatabaseId || '(default)'}
                  </code>
                  .
                </li>
                <li>
                  Bấm <span className="font-semibold">Start collection</span>, nhập tên collection là{' '}
                  <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-xs">users</code>, và đặt{' '}
                  <span className="font-semibold">Document ID</span> đúng bằng chuỗi UID ở trên.
                </li>
                <li>
                  Thêm đủ các trường: <code className="font-mono text-xs">uid</code> (string),{' '}
                  <code className="font-mono text-xs">hoTen</code> (string),{' '}
                  <code className="font-mono text-xs">email</code> (string),{' '}
                  <code className="font-mono text-xs">vaiTro</code> = <code className="font-mono text-xs">"quanTri"</code>,{' '}
                  <code className="font-mono text-xs">toKhoi</code> = <code className="font-mono text-xs">"Tổ Văn phòng"</code>,{' '}
                  <code className="font-mono text-xs">biKhoa</code> = <code className="font-mono text-xs">false</code> (boolean),{' '}
                  <code className="font-mono text-xs">yeuCauDoiMatKhau</code> = <code className="font-mono text-xs">false</code> (boolean),{' '}
                  <code className="font-mono text-xs">ngayTao</code> (timestamp),{' '}
                  <code className="font-mono text-xs">ngayCapNhat</code> (timestamp).
                </li>
              </ol>
              <p className="text-slate-600 pt-1">
                Nếu bạn là Giáo viên, vui lòng liên hệ Quản trị viên để được cấp hồ sơ trên hệ thống.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
          >
            <LogOut className="w-4 h-4" />
            Đăng xuất
          </button>
          <button
            type="button"
            disabled={checking}
            onClick={handleCheckAgain}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Đang kiểm tra...' : 'Kiểm tra lại'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LockedAccountGate({ profile }: { profile: UserProfile }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 text-center space-y-5">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 text-rose-700 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tài khoản đang tạm khóa</h1>
          <p className="mt-2 text-[15px] text-slate-600 leading-relaxed">
            Xin chào <span className="font-semibold text-slate-900">{profile.hoTen}</span>. Tài khoản của bạn hiện đã bị Quản trị viên tạm khóa quyền truy cập. Vui lòng liên hệ Ban giám hiệu hoặc Thư viện để được hỗ trợ.
          </p>
        </div>
        <button
          type="button"
          onClick={() => signOut(auth)}
          className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800"
        >
          <LogOut className="w-4 h-4" />
          Đăng xuất
        </button>
      </div>
    </div>
  );
}

export function ForcePasswordChangeGate({
  profile,
  onCompleted,
}: {
  profile: UserProfile;
  onCompleted: () => void;
}) {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [needReauth, setNeedReauth] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    if (newPassword.length < 6) {
      setErrorMsg('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không trùng khớp.');
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) return;

    setSaving(true);
    try {
      if (needReauth) {
        if (!currentPassword) {
          setErrorMsg('Vui lòng nhập mật khẩu tạm thời hiện tại để xác thực.');
          setSaving(false);
          return;
        }
        const cred = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, cred);
      }

      await updatePassword(user, newPassword);
      const path = `users/${profile.uid}`;
      try {
        await updateDoc(doc(db, 'users', profile.uid), {
          yeuCauDoiMatKhau: false,
          ngayCapNhat: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }

      showToast('Đổi mật khẩu thành công. Chào mừng thầy/cô vào Kho Học Liệu Số!', 'success');
      onCompleted();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/requires-recent-login') {
        setNeedReauth(true);
        setErrorMsg('Vui lòng nhập mật khẩu tạm thời hiện tại để xác nhận đổi mật khẩu mới.');
      } else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setErrorMsg('Mật khẩu hiện tại chưa chính xác.');
      } else {
        setErrorMsg('Không thể đổi mật khẩu. Vui lòng thử lại.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
        <div className="flex items-start gap-3.5">
          <div className="p-3 rounded-xl bg-teal-50 text-teal-700 shrink-0">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Đổi mật khẩu lần đầu</h1>
            <p className="mt-1 text-[15px] text-slate-600">
              Xin chào <span className="font-semibold text-slate-900">{profile.hoTen}</span>. Để bảo mật tài khoản, thầy/cô vui lòng đặt mật khẩu cá nhân mới trước khi sử dụng.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm font-medium text-rose-800">
              {errorMsg}
            </div>
          )}

          {needReauth && (
            <div>
              <label
                htmlFor="current-temp-pass"
                className="block text-sm font-semibold text-slate-800 mb-1.5"
              >
                Mật khẩu hiện tại (tạm thời)
              </label>
              <input
                id="current-temp-pass"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-base focus:outline-none focus:border-teal-700"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="first-new-pass"
              className="block text-sm font-semibold text-slate-800 mb-1.5"
            >
              Mật khẩu mới (tối thiểu 6 ký tự)
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="first-new-pass"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nhập mật khẩu mới"
                className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-base focus:outline-none focus:border-teal-700"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="first-confirm-pass"
              className="block text-sm font-semibold text-slate-800 mb-1.5"
            >
              Nhập lại mật khẩu mới
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="first-confirm-pass"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Xác nhận mật khẩu mới"
                className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-base focus:outline-none focus:border-teal-700"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
            >
              Đăng xuất
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-h-[46px] px-5 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-60"
            >
              {saving ? 'Đang lưu...' : 'Lưu mật khẩu & Tiếp tục'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
