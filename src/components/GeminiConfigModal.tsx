import React, { useEffect, useState } from 'react';
import { KeyRound, Sparkles, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { UserProfile } from '../types/hocLieu';
import { useToast } from './ToastContext';

interface GeminiConfigModalProps {
  open: boolean;
  onClose: () => void;
  profile: UserProfile;
}

const MODEL_OPTIONS = [
  { value: 'auto', label: 'Tự động ưu tiên (Mặc định: gemini-2.5-flash / Đã nhớ)' },
  { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash (Khuyên dùng - Nhanh, ổn định)' },
  { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash (Chuẩn công thức)' },
  { value: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite (Siêu nhẹ)' },
];

export function GeminiConfigModal({ open, onClose, profile }: GeminiConfigModalProps) {
  const { showToast } = useToast();
  const isAdmin = profile.vaiTro === 'quanTri';

  const [personalKey, setPersonalKey] = useState('');
  const [globalKey, setGlobalKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const storedPersonal = localStorage.getItem('hs_gemini_personal_api_key') || '';
    setPersonalKey(storedPersonal);

    // Fetch global config from Firestore
    async function fetchGlobalConfig() {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'system_config', 'gemini'));
        if (snap.exists()) {
          const data = snap.data();
          if (data.globalApiKey) {
            setGlobalKey(data.globalApiKey);
          }
          if (data.selectedModel) {
            setSelectedModel(data.selectedModel);
          }
        }
      } catch {
        // ignore error if offline or permissions
      } finally {
        setLoading(false);
      }
    }
    void fetchGlobalConfig();
  }, [open]);

  if (!open) return null;

  function handleSavePersonal(e: React.FormEvent) {
    e.preventDefault();
    const clean = personalKey.trim();
    if (clean) {
      localStorage.setItem('hs_gemini_personal_api_key', clean);
    } else {
      localStorage.removeItem('hs_gemini_personal_api_key');
    }
    showToast('Đã lưu Personal Gemini API Key vào trình duyệt.', 'success');
    onClose();
  }

  async function handleSaveGlobalFirestore() {
    if (!isAdmin) {
      showToast('Chỉ Quản trị viên mới có quyền cập nhật khóa dùng chung toàn trường.', 'warning');
      return;
    }
    setSavingGlobal(true);
    try {
      await setDoc(
        doc(db, 'system_config', 'gemini'),
        {
          globalApiKey: globalKey.trim(),
          selectedModel,
          updatedBy: profile.uid,
          updatedByName: profile.hoTen,
          ngayCapNhat: serverTimestamp(),
        },
        { merge: true }
      );
      showToast('Đã lưu Global Gemini API Key & Mô hình lên Firestore thành công.', 'success');
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Lỗi không xác định';
      showToast(`Không thể lưu Global API Key: ${msg}`, 'error');
    } finally {
      setSavingGlobal(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestStatus(null);
    try {
      const activeKey = personalKey.trim() || globalKey.trim();
      const res = await fetch('/api/test-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: activeKey, model: selectedModel }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setTestStatus({ success: true, message: 'Kết nối Google Gemini API thành công! Mô hình phản hồi tốt.' });
        showToast('Kiểm tra kết nối Gemini API thành công!', 'success');
      } else {
        setTestStatus({ success: false, message: data.error || 'Kết nối thất bại. Vui lòng kiểm tra lại API Key.' });
        showToast('Kết nối Gemini API thất bại.', 'error');
      }
    } catch {
      setTestStatus({ success: false, message: 'Không thể kết nối đến máy chủ kiểm tra.' });
      showToast('Lỗi kết nối máy chủ.', 'error');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Cấu Hình Google Gemini API Key</h2>
              <p className="text-xs text-slate-300">Quản lý khóa API cá nhân và khóa dùng chung toàn trường</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <form onSubmit={handleSavePersonal} className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">
          <p className="text-xs sm:text-sm text-slate-600 bg-teal-50 border border-teal-200 rounded-xl p-3">
            Hệ thống tự động sử dụng Environment Gemini Key của máy chủ AI Studio. Bạn có thể nhập <strong>Personal API Key</strong> của riêng mình dưới đây để ưu tiên xử lý cá nhân.
          </p>

          {/* Ô 1: Personal API Key */}
          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-800 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-teal-700" />
              Personal Gemini API Key:
            </label>
            <input
              type="password"
              value={personalKey}
              onChange={(e) => setPersonalKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 text-base font-mono focus:outline-none focus:border-teal-700 bg-slate-50/50"
            />
            <p className="text-xs text-slate-500">
              Khóa cá nhân được lưu bảo mật trong localStorage của trình duyệt (ưu tiên số 1).
            </p>
          </div>

          {/* Ô 2: Global API Key */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                Global API Key (Khóa dùng chung toàn trường):
              </label>
              <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-xs font-semibold">
                {isAdmin ? 'Quyền Admin (Chỉnh sửa)' : 'Chỉ xem'}
              </span>
            </div>
            <input
              type="password"
              disabled={!isAdmin}
              value={globalKey}
              onChange={(e) => setGlobalKey(e.target.value)}
              placeholder="••••••••••••••••••••••••••••••••••••••••"
              className={`w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 text-base font-mono focus:outline-none focus:border-teal-700 ${
                isAdmin ? 'bg-white' : 'bg-slate-100 text-slate-600 cursor-not-allowed'
              }`}
            />
            <p className="text-xs text-slate-500">
              Quản trị viên có quyền cập nhật khóa chung phục vụ thi cử và trình diễn cho toàn trường.
            </p>
          </div>

          {/* Ô 3: Model selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-700" />
                Mô hình AI (Quản trị viên chọn thủ công):
              </label>
              <span className="text-xs text-slate-500 font-medium">Hiện tại: mặc định</span>
            </div>
            <select
              disabled={!isAdmin}
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className={`w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:outline-none focus:border-teal-700 ${
                isAdmin ? 'bg-white' : 'bg-slate-100 cursor-not-allowed'
              }`}
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              Chỉ danh sách các mô hình sinh văn bản mới nhất. Lựa chọn này áp dụng cho toàn bộ tính năng AI.
            </p>
          </div>

          {testStatus && (
            <div
              className={`p-3 rounded-xl text-xs font-medium flex items-start gap-2 ${
                testStatus.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{testStatus.message}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={testing}
                onClick={handleTestConnection}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                {testing ? 'Đang kiểm tra...' : 'Kiểm tra'}
              </button>

              {isAdmin && (
                <button
                  type="button"
                  disabled={savingGlobal}
                  onClick={handleSaveGlobalFirestore}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 inline-flex items-center gap-1.5 disabled:opacity-60 shadow-xs"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {savingGlobal ? 'Đang lưu Global...' : 'Lưu Global Firestore'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="min-h-[40px] px-5 py-2 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 shadow-xs"
              >
                Lưu Cấu Hình
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
