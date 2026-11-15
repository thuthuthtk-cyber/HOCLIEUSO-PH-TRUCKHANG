import React, { useState } from 'react';
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  BookOpen,
  Eye,
  EyeOff,
  HelpCircle,
  Lock,
  Mail,
  ShieldCheck,
  X,
} from 'lucide-react';
import { auth } from '../config/firebase';
import { useToast } from '../components/ToastContext';
import { SetupGuideContent } from '../components/SetupGuideContent';
import heroImg from '../assets/images/login_school_hero_1794612960229.jpg';

export function LoginView() {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMsg('Vui lòng nhập đầy đủ Email và Mật khẩu.');
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      showToast('Đăng nhập thành công.', 'success');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setErrorMsg('Email hoặc mật khẩu chưa chính xác. Vui lòng kiểm tra lại.');
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg('Tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau ít phút.');
      } else if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          'Phương thức đăng nhập Email/Mật khẩu chưa được bật trong Firebase Console (Authentication → Sign-in method).'
        );
      } else {
        setErrorMsg('Không thể đăng nhập. Vui lòng kiểm tra kết nối mạng hoặc cấu hình Firebase.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    const targetEmail = resetEmail.trim();
    if (!targetEmail) {
      showToast('Vui lòng nhập email để nhận liên kết đặt lại mật khẩu.', 'warning');
      return;
    }
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      showToast('Đã gửi email hướng dẫn đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.', 'success');
      setResetMode(false);
    } catch {
      showToast(
        'Không thể gửi email đặt lại mật khẩu. Kiểm tra lại địa chỉ email hoặc liên hệ Quản trị viên.',
        'error'
      );
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Cột trái: Nhận diện trường học & ảnh minh họa thư viện */}
      <div className="relative lg:w-1/2 xl:w-[54%] min-h-[260px] lg:min-h-screen bg-teal-900 overflow-hidden flex flex-col justify-between">
        <img
          src={heroImg}
          alt="Thư viện và góc học tập Trường Tiểu học Quang Hưng"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/45 to-teal-950/60"
        />

        <div className="relative z-10 p-6 sm:p-10">
          <div className="inline-flex items-center gap-3 text-white">
            <div className="w-11 h-11 rounded-xl bg-teal-600/90 border border-white/20 flex items-center justify-center">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-teal-100">
                Trường Tiểu học Quang Hưng
              </p>
              <p className="text-base font-bold tracking-tight">Phân hiệu Trực Khang</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 p-6 sm:p-10 max-w-xl">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight [text-wrap:balance]">
            Kho Học Liệu Số
          </h1>
          <p className="mt-3 text-base sm:text-lg text-slate-100 leading-relaxed">
            Không gian lưu trữ, thẩm định và chia sẻ bài giảng điện tử, giáo án, đề kiểm tra và video dạy học dùng chung cho toàn thể cán bộ, giáo viên nhà trường.
          </p>
        </div>
      </div>

      {/* Cột phải: Biểu mẫu đăng nhập */}
      <div className="flex-1 flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-14 bg-white">
        <div className="w-full max-w-md mx-auto">
          <div className="mb-8">
            <h2 className="text-2xl sm:text-[28px] font-bold text-slate-900">
              {resetMode ? 'Đặt lại mật khẩu' : 'Đăng nhập hệ thống'}
            </h2>
            <p className="mt-2 text-[15px] text-slate-600">
              {resetMode
                ? 'Nhập email tài khoản nhà trường cấp để nhận liên kết khôi phục mật khẩu.'
                : 'Sử dụng tài khoản Email và Mật khẩu do Quản trị viên nhà trường cấp.'}
            </p>
          </div>

          {!resetMode ? (
            <form onSubmit={handleLogin} className="space-y-5">
              {errorMsg && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm font-medium text-rose-800"
                >
                  {errorMsg}
                </div>
              )}

              <div>
                <label
                  htmlFor="login-email"
                  className="block text-sm font-semibold text-slate-800 mb-1.5"
                >
                  Địa chỉ Email
                </label>
                <div className="relative">
                  <Mail className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="giaovien@quanghung.edu.vn"
                    className="w-full min-h-[48px] pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="login-password"
                    className="block text-sm font-semibold text-slate-800"
                  >
                    Mật khẩu
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      setResetMode(true);
                    }}
                    className="text-sm font-semibold text-teal-700 hover:text-teal-800 hover:underline"
                  >
                    Quên mật khẩu?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu"
                    className="w-full min-h-[48px] pl-11 pr-12 py-2.5 rounded-xl border border-slate-300 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-slate-500 hover:text-slate-800"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[50px] px-5 py-3 rounded-xl bg-teal-700 text-white text-base font-bold hover:bg-teal-800 transition-colors disabled:opacity-60"
              >
                {submitting ? 'Đang đăng nhập...' : 'Đăng nhập vào Kho Học Liệu'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <label
                  htmlFor="reset-email"
                  className="block text-sm font-semibold text-slate-800 mb-1.5"
                >
                  Email tài khoản
                </label>
                <div className="relative">
                  <Mail className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="giaovien@quanghung.edu.vn"
                    className="w-full min-h-[48px] pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 text-base text-slate-900 focus:outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setResetMode(false)}
                  className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50"
                >
                  Quay lại
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-teal-700 text-white font-bold hover:bg-teal-800 disabled:opacity-60"
                >
                  {resetLoading ? 'Đang gửi...' : 'Gửi email khôi phục'}
                </button>
              </div>
            </form>
          )}

          {/* Ghi chú bảo mật nội bộ */}
          <div className="mt-8 pt-6 border-t border-slate-200 space-y-3">
            <div className="flex items-start gap-2.5 text-sm text-slate-600">
              <ShieldCheck className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
              <p>
                Hệ thống nội bộ trường học, không hỗ trợ tự đăng ký công khai. Thầy/cô chưa có tài khoản vui lòng liên hệ Ban giám hiệu hoặc Nhân viên thư viện - thiết bị.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-800 hover:underline"
            >
              <HelpCircle className="w-4 h-4" />
              Hướng dẫn cấu hình Firebase cho Quản trị viên lần đầu
            </button>
          </div>
        </div>
      </div>

      {/* Modal hướng dẫn cấu hình Firebase */}
      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                Hướng dẫn thiết lập Firebase &amp; Triển khai Vercel
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <SetupGuideContent />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
