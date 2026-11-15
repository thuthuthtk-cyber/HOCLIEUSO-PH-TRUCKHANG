import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { extractFirebaseErrorMessage } from '../config/firebase';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface FirebaseAlertState {
  success: boolean;
  title: string;
  detail: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  showFirebaseAlert: (success: boolean, detailOrError?: unknown, customTitle?: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [alertState, setAlertState] = useState<FirebaseAlertState | null>(null);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        removeToast(id);
      }, 4200);
    },
    [removeToast]
  );

  const showFirebaseAlert = useCallback(
    (success: boolean, detailOrError?: unknown, customTitle?: string) => {
      if (success) {
        const title = customTitle?.trim() || 'Đã lưu lên Firebase thành công!';
        const detail =
          typeof detailOrError === 'string' && detailOrError.trim()
            ? detailOrError.trim()
            : 'Dữ liệu đã được ghi nhận vào Cloud Firestore (dự án hoclieuso26-27).';
        setAlertState({
          success: true,
          title,
          detail,
        });
        showToast(title, 'success');
      } else {
        const cleanMsg = extractFirebaseErrorMessage(detailOrError);
        setAlertState({
          success: false,
          title: `Lỗi Firebase: ${cleanMsg}`,
          detail:
            'Thao tác chưa được ghi lên Firestore. Thầy/cô vui lòng kiểm tra lại kết nối, quyền Quản trị hoặc cấu hình Firestore Rules.',
        });
        showToast(`Lỗi Firebase: ${cleanMsg}`, 'error');
      }
    },
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, showFirebaseAlert }}>
      {children}

      {alertState && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="firebase-alert-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`p-3 rounded-xl shrink-0 ${
                  alertState.success
                    ? 'bg-teal-50 text-teal-700'
                    : 'bg-rose-50 text-rose-700'
                }`}
              >
                {alertState.success ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  <AlertCircle className="w-6 h-6" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  id="firebase-alert-title"
                  className={`text-lg font-bold leading-snug break-words ${
                    alertState.success ? 'text-teal-900' : 'text-rose-900'
                  }`}
                >
                  {alertState.title}
                </h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed break-words">
                  {alertState.detail}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setAlertState(null)}
                className={`min-h-[44px] px-6 py-2 rounded-xl text-sm font-bold text-white transition-colors ${
                  alertState.success
                    ? 'bg-teal-700 hover:bg-teal-800'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-[calc(100vw-2rem)] pointer-events-none"
      >
        {toasts.map((toast) => {
          const styles =
            toast.type === 'success'
              ? 'bg-teal-900 text-white border-teal-800'
              : toast.type === 'error'
                ? 'bg-rose-900 text-white border-rose-800'
                : toast.type === 'warning'
                  ? 'bg-amber-900 text-white border-amber-800'
                  : 'bg-slate-900 text-white border-slate-800';

          const Icon =
            toast.type === 'success'
              ? CheckCircle2
              : toast.type === 'error' || toast.type === 'warning'
                ? AlertCircle
                : Info;

          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3.5 rounded-xl border shadow-lg text-sm font-medium transition-all ${styles}`}
            >
              <Icon className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="flex-1 leading-snug">{toast.message}</p>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                aria-label="Đóng thông báo"
                className="p-0.5 rounded-md opacity-80 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast phải được sử dụng bên trong ToastProvider');
  }
  return ctx;
}
