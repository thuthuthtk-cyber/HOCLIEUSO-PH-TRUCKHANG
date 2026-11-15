import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { UserProfile } from '../types/hocLieu';
import {
  PERSONAL_GEMINI_KEY_STORAGE,
  cleanApiKey,
  fetchSchoolGeminiConfig,
  saveGlobalGeminiConfig,
  savePersonalGeminiConfig,
  testGeminiApiKeyDirect,
} from '../utils/geminiClient';
import { useToast } from './ToastContext';

interface GeminiConfigModalProps {
  open: boolean;
  onClose: () => void;
  profile: UserProfile;
}

const MODEL_OPTIONS = [
  { value: 'auto', label: 'Tự động ưu tiên (Mặc định: gemini-2.5-flash)' },
  { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash (Khuyên dùng - Nhanh, ổn định)' },
  { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash (Ổn định, tương thích rộng)' },
  { value: 'gemini-1.5-flash', label: 'gemini-1.5-flash (Dự phòng tương thích)' },
];

export function GeminiConfigModal({ open, onClose, profile }: GeminiConfigModalProps) {
  const { showToast } = useToast();
  const isAdmin = profile.vaiTro === 'quanTri' || profile.role === 'ADMIN';

  const [personalKey, setPersonalKey] = useState('');
  const [globalKey, setGlobalKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('auto');
  const [showPersonalKey, setShowPersonalKey] = useState(false);
  const [showGlobalKey, setShowGlobalKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setTestStatus(null);
    setShowPersonalKey(false);
    setShowGlobalKey(false);

    try {
      const storedPersonal = cleanApiKey(localStorage.getItem(PERSONAL_GEMINI_KEY_STORAGE));
      setPersonalKey(storedPersonal);
    } catch {
      setPersonalKey('');
    }

    let cancelled = false;
    async function loadSchoolConfig() {
      setLoading(true);
      try {
        const cfg = await fetchSchoolGeminiConfig(true);
        if (cancelled) return;
        setGlobalKey(cfg.globalApiKey || '');
        const validValues = new Set(MODEL_OPTIONS.map((m) => m.value));
        setSelectedModel(
          cfg.selectedModel && validValues.has(cfg.selectedModel)
            ? cfg.selectedModel
            : 'auto'
        );
      } catch {
        // Keep current fallback values
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSchoolConfig();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  async function handleSavePersonal(e: React.FormEvent) {
    e.preventDefault();
    setSavingPersonal(true);
    try {
      const cleanPersonal = savePersonalGeminiConfig(personalKey, selectedModel);
      setPersonalKey(cleanPersonal);

      if (isAdmin) {
        const cleanGlobal = cleanApiKey(globalKey);
        setGlobalKey(cleanGlobal);
        try {
          await saveGlobalGeminiConfig({
            globalApiKey: cleanGlobal,
            selectedModel,
            updatedBy: profile.uid,
            updatedByName: profile.hoTen,
          });
        } catch {
          // Local storage save still succeeds even if Firestore write fails offline
        }
      }

      showToast('Đã lưu cấu hình Gemini API Key thành công.', 'success');
      onClose();
    } finally {
      setSavingPersonal(false);
    }
  }

  async function handleSaveGlobalFirestore() {
    if (!isAdmin) {
      showToast('Chỉ Quản trị viên mới có quyền cập nhật khóa dùng chung toàn trường.', 'warning');
      return;
    }
    setSavingGlobal(true);
    try {
      const result = await saveGlobalGeminiConfig({
        globalApiKey: globalKey,
        selectedModel,
        updatedBy: profile.uid,
        updatedByName: profile.hoTen,
      });
      setGlobalKey(result.globalApiKey);
      setSelectedModel(result.selectedModel);
      showToast(
        'Đã lưu Global Gemini API Key & Mô hình lên Firestore thành công.',
        'success'
      );
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
      const cleanPersonal = cleanApiKey(personalKey);
      const cleanGlobal = cleanApiKey(globalKey);
      setPersonalKey(cleanPersonal);
      if (isAdmin) {
        setGlobalKey(cleanGlobal);
      }

      const activeKey = cleanPersonal || cleanGlobal;
      const result = await testGeminiApiKeyDirect(activeKey, selectedModel);

      if (result.success) {
        if (result.workingModel) {
          setSelectedModel(result.workingModel);
        }
        setTestStatus({ success: true, message: result.message });
        showToast(result.message, 'success');
      } else {
        setTestStatus({ success: false, message: result.message });
        showToast(result.message, 'error');
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Không thể kết nối trực tiếp tới Google Gemini API.';
      setTestStatus({ success: false, message: `Kết nối thất bại: ${msg}` });
      showToast(`Kết nối thất bại: ${msg}`, 'error');
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
              <p className="text-xs text-slate-300">
                Kết nối trực tiếp Google Gemini SDK · Cá nhân & Toàn trường
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại cấu hình"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <form onSubmit={handleSavePersonal} className="p-6 space-y-5 overflow-y-auto max-h-[82vh]">
          <p className="text-xs sm:text-sm text-slate-600 bg-teal-50 border border-teal-200 rounded-xl p-3 leading-relaxed">
            Hệ thống ưu tiên gọi trực tiếp Google Gemini API từ trình duyệt theo thứ tự:{' '}
            <strong>Personal API Key</strong> → <strong>Global API Key (Firestore)</strong> →{' '}
            <strong>Environment Key</strong>.
          </p>

          {/* Ô 1: Personal API Key */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-teal-700" />
              Personal Gemini API Key:
            </label>
            <div className="relative">
              <input
                type={showPersonalKey ? 'text' : 'password'}
                value={personalKey}
                onChange={(e) => setPersonalKey(e.target.value)}
                onBlur={() => setPersonalKey((prev) => cleanApiKey(prev))}
                placeholder="AIzaSy..."
                autoComplete="off"
                spellCheck={false}
                className="w-full min-h-[46px] pl-3.5 pr-11 py-2 rounded-xl border border-slate-300 text-sm sm:text-base font-mono focus:outline-none focus:border-teal-700 bg-slate-50/50"
              />
              <button
                type="button"
                onClick={() => setShowPersonalKey((prev) => !prev)}
                aria-label={showPersonalKey ? 'Ẩn Personal API Key' : 'Hiện Personal API Key'}
                title={showPersonalKey ? 'Ẩn khóa API' : 'Hiện khóa API để kiểm tra'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors"
              >
                {showPersonalKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Khóa cá nhân được lưu bảo mật trong localStorage của trình duyệt (ưu tiên số 1, tự động xóa khoảng trắng thừa).
            </p>
          </div>

          {/* Ô 2: Global API Key */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                Global API Key (Khóa dùng chung toàn trường):
              </label>
              <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-xs font-semibold shrink-0">
                {loading ? 'Đang tải...' : isAdmin ? 'Quyền Admin (Chỉnh sửa)' : 'Chỉ xem'}
              </span>
            </div>
            <div className="relative">
              <input
                type={showGlobalKey ? 'text' : 'password'}
                disabled={!isAdmin}
                value={globalKey}
                onChange={(e) => setGlobalKey(e.target.value)}
                onBlur={() => {
                  if (isAdmin) setGlobalKey((prev) => cleanApiKey(prev));
                }}
                placeholder="AIzaSy..."
                autoComplete="off"
                spellCheck={false}
                className={`w-full min-h-[46px] pl-3.5 pr-11 py-2 rounded-xl border border-slate-300 text-sm sm:text-base font-mono focus:outline-none focus:border-teal-700 ${
                  isAdmin ? 'bg-white' : 'bg-slate-100 text-slate-600 cursor-not-allowed'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowGlobalKey((prev) => !prev)}
                aria-label={showGlobalKey ? 'Ẩn Global API Key' : 'Hiện Global API Key'}
                title={showGlobalKey ? 'Ẩn khóa Global API' : 'Hiện khóa Global API để kiểm tra'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors"
              >
                {showGlobalKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Quản trị viên có quyền lưu khóa chung lên Firestore để giáo viên toàn trường dùng ngay không cần nhập lại.
            </p>
          </div>

          {/* Ô 3: Model selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-700" />
                Mô hình AI mặc định:
              </label>
              <span className="text-xs text-slate-500 font-medium">
                {selectedModel === 'auto' ? 'Ưu tiên: gemini-2.5-flash' : selectedModel}
              </span>
            </div>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:border-teal-700"
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              Nếu mô hình đang chọn chưa hỗ trợ trên khóa API, hệ thống tự động chuyển qua{' '}
              <code>gemini-2.5-flash</code> → <code>gemini-2.0-flash</code> → <code>gemini-1.5-flash</code>.
            </p>
          </div>

          {testStatus && (
            <div
              className={`p-3 rounded-xl text-xs font-medium flex items-start gap-2 ${
                testStatus.success
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {testStatus.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              )}
              <span className="break-words">{testStatus.message}</span>
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
                disabled={savingPersonal}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 shadow-xs disabled:opacity-60"
              >
                {savingPersonal ? 'Đang lưu...' : 'Lưu Cấu Hình'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
