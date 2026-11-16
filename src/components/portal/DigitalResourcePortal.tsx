import React, { useEffect, useState } from 'react';
import { ExternalLink, Globe, RotateCcw, Save, Settings, Shield } from 'lucide-react';
import type { UserProfile } from '../../types/hocLieu';
import { getEffectiveUser } from '../../utils/ssoAuth';
import { useToast } from '../ToastContext';

export const DEFAULT_RESOURCE_PORTAL_URL = 'https://hoclieuso-ph-truckhang.vercel.app/';
const STORAGE_KEY_PORTAL_URL = 'khl_digital_resource_portal_url_v2';

interface DigitalResourcePortalProps {
  profile?: UserProfile;
}

export function DigitalResourcePortal({ profile }: DigitalResourcePortalProps) {
  const { showToast } = useToast();
  const effectiveUser = getEffectiveUser();
  const isAdmin =
    profile?.vaiTro === 'quanTri' ||
    profile?.role === 'ADMIN' ||
    effectiveUser.role === 'admin';

  const [portalUrl, setPortalUrl] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_RESOURCE_PORTAL_URL;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY_PORTAL_URL);
      if (
        !saved ||
        saved.includes('ais-dev') ||
        saved.includes('ai-studio') ||
        saved.includes('googleusercontent') ||
        saved.includes('run.app')
      ) {
        window.localStorage.setItem(STORAGE_KEY_PORTAL_URL, DEFAULT_RESOURCE_PORTAL_URL);
        return DEFAULT_RESOURCE_PORTAL_URL;
      }
      return saved.trim() || DEFAULT_RESOURCE_PORTAL_URL;
    } catch {
      return DEFAULT_RESOURCE_PORTAL_URL;
    }
  });

  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [tempUrl, setTempUrl] = useState<string>(portalUrl);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY_PORTAL_URL);
      if (
        !saved ||
        saved.includes('ais-dev') ||
        saved.includes('ai-studio') ||
        saved.includes('googleusercontent') ||
        saved.includes('run.app')
      ) {
        window.localStorage.setItem(STORAGE_KEY_PORTAL_URL, DEFAULT_RESOURCE_PORTAL_URL);
        setPortalUrl(DEFAULT_RESOURCE_PORTAL_URL);
        setTempUrl(DEFAULT_RESOURCE_PORTAL_URL);
      }
    } catch {
      // ignore
    }
  }, []);

  function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = tempUrl.trim() || DEFAULT_RESOURCE_PORTAL_URL;
    setPortalUrl(cleaned);
    try {
      window.localStorage.setItem(STORAGE_KEY_PORTAL_URL, cleaned);
      showToast('Đã cập nhật đường dẫn Kho Học Liệu Số thành công!', 'success');
    } catch {
      showToast('Không thể lưu vào localStorage.', 'error');
    }
    setShowSettingsModal(false);
  }

  function handleResetDefault() {
    setTempUrl(DEFAULT_RESOURCE_PORTAL_URL);
    setPortalUrl(DEFAULT_RESOURCE_PORTAL_URL);
    try {
      window.localStorage.setItem(STORAGE_KEY_PORTAL_URL, DEFAULT_RESOURCE_PORTAL_URL);
      showToast('Đã khôi phục đường dẫn mặc định thành công!', 'success');
    } catch {
      // ignore
    }
    setShowSettingsModal(false);
  }

  // Construct iframe URL with SSO parameters
  const finalIframeUrl = React.useMemo(() => {
    try {
      const target = portalUrl || DEFAULT_RESOURCE_PORTAL_URL;
      const urlObj = new URL(target.startsWith('http') ? target : `https://${target}`);
      const email = profile?.email || effectiveUser.email;
      const name = profile?.hoTen || effectiveUser.displayName;
      const role = profile?.vaiTro || effectiveUser.role;

      if (email) urlObj.searchParams.set('sso_email', email);
      if (name) urlObj.searchParams.set('sso_name', name);
      if (role) urlObj.searchParams.set('sso_role', role);
      urlObj.searchParams.set('auto_login', 'true');
      return urlObj.toString();
    } catch {
      return `${DEFAULT_RESOURCE_PORTAL_URL}?sso_email=${encodeURIComponent(
        profile?.email || effectiveUser.email
      )}&auto_login=true`;
    }
  }, [portalUrl, profile, effectiveUser]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] lg:h-screen bg-slate-100">
      {/* Top Bar for portal */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-slate-900 truncate">
              Cổng Kho Học Liệu Số &amp; Dạy Học Số
            </h2>
            <p className="text-xs text-slate-500 truncate">
              Liên thông trực tuyến · {portalUrl}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={finalIframeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="hidden sm:inline">Mở tab mới</span>
          </a>

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setTempUrl(portalUrl);
                setShowSettingsModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 transition-colors shadow-sm"
            >
              <Settings className="w-4 h-4" />
              <span>Cài đặt Link Kho Học Liệu</span>
            </button>
          )}
        </div>
      </header>

      {/* Iframe Container */}
      <div className="flex-1 w-full bg-white relative">
        <iframe
          src={finalIframeUrl}
          title="Kho Học Liệu Số & Dạy Học Số"
          className="w-full h-full border-0"
          allow="clipboard-write; camera; microphone; fullscreen"
        />
      </div>

      {/* Settings Modal (Admin only) */}
      {showSettingsModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Cài đặt Link Kho Học Liệu Số
                </h3>
                <p className="text-xs text-slate-500">
                  Cấu hình địa chỉ ứng dụng Kho Học Liệu Số trên trình duyệt (localStorage)
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Đường dẫn (URL) ứng dụng Kho Học Liệu Số
                </label>
                <input
                  type="url"
                  required
                  value={tempUrl}
                  onChange={(e) => setTempUrl(e.target.value)}
                  placeholder="https://hoclieuso-ph-truckhang.vercel.app/"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Hệ thống tự động gắn mã đăng nhập (
                  <code className="font-mono text-teal-800">sso_token</code>,{' '}
                  <code className="font-mono text-teal-800">sso_email</code>,{' '}
                  <code className="font-mono text-teal-800">sso_name</code>,{' '}
                  <code className="font-mono text-teal-800">sso_role</code>) của tài khoản{' '}
                  <span className="font-bold text-slate-800">{profile?.hoTen || effectiveUser.displayName}</span>{' '}
                  vào địa chỉ này.
                </p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleResetDefault}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Mặc định
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-colors shadow-sm"
                  >
                    <Save className="w-4 h-4" />
                    Lưu cấu hình
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
