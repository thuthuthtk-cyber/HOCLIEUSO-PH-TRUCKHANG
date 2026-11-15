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
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { UserProfile } from '../types/hocLieu';
import { useToast } from './ToastContext';

interface GeminiConfigModalProps {
  open: boolean;
  onClose: () => void;
  profile: UserProfile;
}

const PERSONAL_GEMINI_KEY_STORAGE = 'hs_gemini_personal_api_key';
const GLOBAL_GEMINI_KEY_STORAGE = 'hs_gemini_global_api_key';
const SELECTED_GEMINI_MODEL_STORAGE = 'hs_gemini_selected_model';

const MODEL_OPTIONS = [
  { value: 'auto', label: 'Tự động ưu tiên (Mặc định máy chủ: gemini-4-hydrogen)' },
  { value: 'gemini-4-hydrogen', label: 'gemini-4-hydrogen (Khuyên dùng - Nhanh, ổn định)' },
  { value: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite (Nhanh, tiết kiệm)' },
  { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash (Tương thích tiêu chuẩn)' },
];

function cleanApiKey(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\r\n]/g, '');
}

function safeStorageGet(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage partitioning / quota errors
  }
}

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

    setPersonalKey(cleanApiKey(safeStorageGet(PERSONAL_GEMINI_KEY_STORAGE)));
    const cachedGlobal = cleanApiKey(safeStorageGet(GLOBAL_GEMINI_KEY_STORAGE));
    const cachedModel = safeStorageGet(SELECTED_GEMINI_MODEL_STORAGE).trim() || 'auto';
    setGlobalKey(cachedGlobal);
    const validValues = new Set(MODEL_OPTIONS.map((m) => m.value));
    setSelectedModel(validValues.has(cachedModel) ? cachedModel : 'auto');

    let cancelled = false;
    async function loadSchoolConfig() {
      setLoading(true);
      try {
        const [settingsRes, legacyRes] = await Promise.allSettled([
          getDoc(doc(db, 'settings', 'ai_config')),
          getDoc(doc(db, 'system_config', 'gemini')),
        ]);
        if (cancelled) return;

        const settingsData =
          settingsRes.status === 'fulfilled' && settingsRes.value.exists()
            ? (settingsRes.value.data() as Record<string, unknown>)
            : null;
        const legacyData =
          legacyRes.status === 'fulfilled' && legacyRes.value.exists()
            ? (legacyRes.value.data() as Record<string, unknown>)
            : null;

        const remoteKey = cleanApiKey(
          (settingsData?.globalApiKey as string | undefined) ||
            (legacyData?.globalApiKey as string | undefined)
        );
        const remoteModel = String(
          settingsData?.selectedModel || legacyData?.selectedModel || ''
        ).trim();

        if (remoteKey) {
          setGlobalKey(remoteKey);
          safeStorageSet(GLOBAL_GEMINI_KEY_STORAGE, remoteKey);
        }
        if (remoteModel && validValues.has(remoteModel)) {
          setSelectedModel(remoteModel);
          safeStorageSet(SELECTED_GEMINI_MODEL_STORAGE, remoteModel);
        }
      } catch {
        // Keep cached values if offline
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

  async function persistGlobalToFirestore(cleanGlobal: string, model: string) {
    const payload = {
      globalApiKey: cleanGlobal,
      selectedModel: model,
      updatedBy: profile.uid || 'sso_admin',
      updatedByName: profile.hoTen || 'Quản trị viên',
      ngayCapNhat: serverTimestamp(),
    };
    await Promise.all([
      setDoc(doc(db, 'settings', 'ai_config'), payload, { merge: true }),
      setDoc(doc(db, 'system_config', 'gemini'), payload, { merge: true }),
    ]);
  }

  async function handleSavePersonal(e: React.FormEvent) {
    e.preventDefault();
    setSavingPersonal(true);
    try {
      const cleanPersonal = cleanApiKey(personalKey);
      setPersonalKey(cleanPersonal);
      safeStorageSet(PERSONAL_GEMINI_KEY_STORAGE, cleanPersonal);
      safeStorageSet(SELECTED_GEMINI_MODEL_STORAGE, selectedModel);

      if (isAdmin) {
        const cleanGlobal = cleanApiKey(globalKey);
        setGlobalKey(cleanGlobal);
        safeStorageSet(GLOBAL_GEMINI_KEY_STORAGE, cleanGlobal);
        try {
          await persistGlobalToFirestore(cleanGlobal, selectedModel);
        } catch {
          // Local save still succeeds if Firestore is offline
        }
      }

      showToast('Đã lưu cấu hình Gemini thành công.', 'success');
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
      const cleanGlobal = cleanApiKey(globalKey);
      setGlobalKey(cleanGlobal);
      safeStorageSet(GLOBAL_GEMINI_KEY_STORAGE, cleanGlobal);
      safeStorageSet(SELECTED_GEMINI_MODEL_STORAGE, selectedModel);
      await persistGlobalToFirestore(cleanGlobal, selectedModel);
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
      const res = await fetch('/api/test-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: activeKey, model: selectedModel }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        workingModel?: string;
        message?: string;
        error?: string;
      };

      if (res.ok && data.success) {
        if (data.workingModel && MODEL_OPTIONS.some((m) => m.value === data.workingModel)) {
          setSelectedModel(data.workingModel);
        }
        const okMessage =
          data.message || 'Kết nối Google Gemini API qua máy chủ thành công! Mô hình phản hồi tốt.';
        setTestStatus({ success: true, message: okMessage });
        showToast(okMessage, 'success');
      } else {
        const errMessage = data.error || 'Kết nối thất bại. Vui lòng kiểm tra lại cấu hình.';
        setTestStatus({ success: false, message: errMessage });
        showToast(errMessage, 'error');
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Không thể kết nối đến máy chủ kiểm tra.';
      setTestStatus({ success: false, message: msg });
      showToast(msg, 'error');
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
                Xử lý AI qua máy chủ ứng dụng · Cá nhân & Toàn trường
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
            Hệ thống tự động xử lý mọi tính năng AI qua máy chủ bằng{' '}
            <strong>Gemini API Key đã cấu hình sẵn</strong> để mọi giáo viên mở ứng dụng đều dùng được ngay.
          </p>

          {/* Ô 1: Personal API Key */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-teal-700" />
              Personal Gemini API Key (tùy chọn):
            </label>
            <div className="relative">
              <input
                type={showPersonalKey ? 'text' : 'password'}
                value={personalKey}
                onChange={(e) => setPersonalKey(e.target.value)}
                onBlur={() => setPersonalKey((prev) => cleanApiKey(prev))}
                placeholder="AIzaSy... (để trống nếu dùng khóa mặc định của máy chủ)"
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
              Lưu cục bộ trong localStorage (tự động xóa khoảng trắng thừa). Nếu để trống, máy chủ tự dùng khóa mặc định của hệ thống.
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
              Quản trị viên có thể lưu cấu hình dùng chung lên Firestore để đồng bộ cho toàn trường.
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
                {selectedModel === 'auto' ? 'Ưu tiên: gemini-4-hydrogen' : selectedModel}
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
              Máy chủ tự động chọn mô hình khả dụng (mặc định{' '}
              <code>gemini-4-hydrogen</code>) để đảm bảo phản hồi ổn định cho mọi giáo viên.
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
