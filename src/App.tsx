import { BookOpen } from 'lucide-react';
import { useKhoHocLieu } from './hooks/useKhoHocLieu';
import { ToastProvider } from './components/ToastContext';
import { Navbar } from './components/Navbar';
import { MainWorkspace } from './components/MainWorkspace';
import { GeminiConfigModal } from './components/GeminiConfigModal';
import { LoginView } from './views/LoginView';
import { PublicGamePlayerView } from './views/PublicGamePlayerView';
import {
  ForcePasswordChangeGate,
  LockedAccountGate,
  MissingProfileGate,
} from './views/OnboardingGates';
import { usePublicGameShareCode } from './utils/shareCode';

function MainApplication() {
  const state = useKhoHocLieu();

  if (!state.isAuthenticated && (!state.authReady || (state.authUser && state.profileLoading))) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 gap-3">
        <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center animate-pulse">
          <BookOpen className="w-5 h-5" />
        </div>
        <p className="text-base font-semibold text-slate-700">Đang tải Kho Học Liệu Số...</p>
      </div>
    );
  }

  if (!state.isAuthenticated || !state.currentUser) return <LoginView />;
  if (!state.profile) {
    if (state.authUser) {
      return <MissingProfileGate authUser={state.authUser} onRefresh={state.refreshProfile} />;
    }
    return <LoginView />;
  }
  if (state.profile.biKhoa) return <LockedAccountGate profile={state.profile} />;
  if (state.profile.yeuCauDoiMatKhau) {
    return <ForcePasswordChangeGate profile={state.profile} onCompleted={state.refreshProfile} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      <Navbar
        profile={state.profile}
        activeView={state.view}
        myMaterialsCount={state.myMaterials.length}
        pendingApprovalCount={state.pendingApprovalCount}
        onNavigate={state.navigateTo}
        onSignOut={state.signOutUser}
        onOpenGeminiConfig={() => state.setGeminiConfigOpen(true)}
      />
      <MainWorkspace state={state} />
      <GeminiConfigModal
        open={state.geminiConfigOpen}
        onClose={() => state.setGeminiConfigOpen(false)}
        profile={state.profile}
      />
    </div>
  );
}

export default function App() {
  const publicShareCode = usePublicGameShareCode();

  if (publicShareCode) {
    return <PublicGamePlayerView shareCode={publicShareCode} />;
  }

  return (
    <ToastProvider>
      <MainApplication />
    </ToastProvider>
  );
}
