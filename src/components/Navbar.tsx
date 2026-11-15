import { useState } from 'react';
import {
  BookOpen,
  CheckSquare,
  FileText,
  FolderHeart,
  FolderPlus,
  Gamepad2,
  Library,
  LogOut,
  Menu,
  Presentation,
  Shield,
  Sparkles,
  UserCircle2,
  X,
} from 'lucide-react';
import { ROLE_LABELS, type AppView, type UserProfile } from '../types/hocLieu';

interface NavbarProps {
  profile: UserProfile;
  activeView: AppView;
  myMaterialsCount: number;
  pendingApprovalCount: number;
  onNavigate: (view: AppView) => void;
  onSignOut: () => void;
  onOpenGeminiConfig?: () => void;
}

export function Navbar({
  profile,
  activeView,
  myMaterialsCount,
  pendingApprovalCount,
  onNavigate,
  onSignOut,
  onOpenGeminiConfig,
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const canCreateAiGame =
    profile.vaiTro === 'giaoVien' ||
    profile.vaiTro === 'toTruong' ||
    profile.vaiTro === 'quanTri';

  const navItems: {
    id: AppView;
    label: string;
    icon: typeof Library;
    badge?: number;
    visible: boolean;
  }[] = [
    { id: 'library', label: 'Kho học liệu', icon: Library, visible: true },
    {
      id: 'myMaterials',
      label: 'Học liệu của tôi',
      icon: FolderHeart,
      badge: myMaterialsCount,
      visible: true,
    },
    { id: 'upload', label: 'Tải học liệu lên', icon: FolderPlus, visible: true },
    {
      id: 'aiGame',
      label: 'Tạo trò chơi',
      icon: Gamepad2,
      visible: canCreateAiGame,
    },
    {
      id: 'aiPpt',
      label: 'Tạo bài giảng PPT AI',
      icon: Presentation,
      visible: canCreateAiGame,
    },
    {
      id: 'examGenerator',
      label: 'Tạo đề kiểm tra AI',
      icon: FileText,
      visible: canCreateAiGame,
    },
    {
      id: 'approval',
      label: 'Chờ duyệt',
      icon: CheckSquare,
      badge: pendingApprovalCount,
      visible: profile.vaiTro === 'toTruong' || profile.vaiTro === 'quanTri',
    },
    {
      id: 'admin',
      label: 'Quản trị hệ thống',
      icon: Shield,
      visible: profile.vaiTro === 'quanTri',
    },
    { id: 'profile', label: 'Thông tin cá nhân', icon: UserCircle2, visible: true },
  ];

  function handleSelect(next: AppView) {
    onNavigate(next);
    setMobileMenuOpen(false);
  }

  const SidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="p-5 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-extrabold text-slate-900 leading-tight truncate">
              Kho Học Liệu Số
            </div>
            <div className="text-xs font-medium text-slate-500 truncate">
              TH Quang Hưng · Trực Khang
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3.5 space-y-1 overflow-y-auto" aria-label="Điều hướng chính">
        {navItems
          .filter((item) => item.visible)
          .map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full min-h-[46px] flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-[15px] font-semibold transition-colors ${
                  active
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-mono tabular-nums ${
                      active
                        ? 'bg-teal-800 text-white'
                        : item.id === 'approval'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-3 bg-slate-50/70">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{profile.hoTen}</p>
          <p className="text-xs text-slate-600 truncate">
            {ROLE_LABELS[profile.vaiTro]} · {profile.toKhoi}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenGeminiConfig}
          className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-teal-300 bg-teal-50 text-teal-800 text-sm font-bold hover:bg-teal-100 transition-colors"
        >
          <Sparkles className="w-4 h-4 text-teal-700" />
          Cấu hình Gemini API Key
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-100 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Đăng xuất
        </button>
      </div>
    </div>
  );

  return (
    <>
      <header className="lg:hidden sticky top-0 z-30 h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-slate-900 text-base truncate">
            Kho Học Liệu Số
          </span>
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Mở menu điều hướng"
          className="p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Đóng menu"
              className="absolute top-4 right-3 z-20 p-2 rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
            {SidebarContent}
          </div>
        </div>
      )}

      <aside className="hidden lg:block lg:w-[270px] lg:shrink-0 lg:sticky lg:top-0 lg:h-screen">
        {SidebarContent}
      </aside>
    </>
  );
}
