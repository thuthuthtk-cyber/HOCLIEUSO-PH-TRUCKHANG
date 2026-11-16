import { ConfirmDialog } from './ConfirmDialog';
import { HocLieuForm } from './HocLieuForm';
import { MaterialPreviewModal } from './MaterialPreviewModal';
import { DigitalResourcePortal } from './portal/DigitalResourcePortal';
import { ExamGeneratorWorkspace } from './exam/ExamGeneratorWorkspace';
import { LessonPlanGeneratorWorkspace } from './lesson/LessonPlanGeneratorWorkspace';
import { PptGeneratorWorkspace } from './ppt/PptGeneratorWorkspace';
import { AdminView } from '../views/AdminView';
import { AiGameCreatorView } from '../views/AiGameCreatorView';
import { ApprovalQueueView } from '../views/ApprovalQueueView';
import { LibraryView } from '../views/LibraryView';
import { MyMaterialsView } from '../views/MyMaterialsView';
import { ProfileView } from '../views/ProfileView';
import type { useKhoHocLieu } from '../hooks/useKhoHocLieu';
import { canManageGameShareLink } from '../utils/shareCode';

type KhoHocLieuState = ReturnType<typeof useKhoHocLieu>;

export function MainWorkspace({ state }: { state: KhoHocLieuState }) {
  const { profile } = state;
  if (!profile) return null;
  const canModerate = profile.vaiTro === 'toTruong' || profile.vaiTro === 'quanTri';

  if (state.view === 'portal') {
    return (
      <div className="flex-1 min-w-0 flex flex-col bg-slate-100">
        <DigitalResourcePortal profile={profile} />
      </div>
    );
  }

  return (
    <>
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
        {state.view === 'library' && (
          <LibraryView
            profile={profile}
            materials={state.materials}
            subjects={state.effectiveSubjects}
            departments={state.effectiveDepartments}
            loading={state.materialsLoading}
            onViewMaterial={state.handleViewMaterial}
            onDownloadMaterial={state.handleDownloadMaterial}
            onToggleShareLink={state.handleToggleShareLink}
            togglingShareId={state.togglingShareId}
            onNavigateUpload={() => state.navigateTo('upload')}
            onAdminRemoveMaterial={state.setDeleteTarget}
          />
        )}
        {state.view === 'myMaterials' && (
          <MyMaterialsView
            profile={profile}
            materials={state.myMaterials}
            loading={state.materialsLoading}
            onViewMaterial={state.handleViewMaterial}
            onDownloadMaterial={state.handleDownloadMaterial}
            onToggleShareLink={state.handleToggleShareLink}
            togglingShareId={state.togglingShareId}
            onEditMaterial={(m) => {
              state.setEditingMaterial(m);
              state.setView('upload');
            }}
            onDeleteMaterial={state.setDeleteTarget}
            onSubmitDraft={state.handleSubmitDraft}
            onNavigateUpload={() => state.navigateTo('upload')}
          />
        )}
        {state.view === 'upload' && (
          <HocLieuForm
            profile={profile}
            subjects={state.effectiveSubjects}
            departments={state.effectiveDepartments}
            editingMaterial={state.editingMaterial}
            onCancel={() => {
              state.setEditingMaterial(null);
              state.setView(state.editingMaterial ? 'myMaterials' : 'library');
            }}
            onSuccess={(publishedImmediately) => {
              state.setEditingMaterial(null);
              state.setView(publishedImmediately ? 'library' : 'myMaterials');
            }}
          />
        )}
        {state.view === 'aiGame' && (
          <AiGameCreatorView
            profile={profile}
            subjects={state.effectiveSubjects}
            departments={state.effectiveDepartments}
            onSavedNavigate={(target) => state.navigateTo(target)}
          />
        )}
        {state.view === 'aiPpt' && (
          <PptGeneratorWorkspace
            profile={profile}
            subjects={state.effectiveSubjects}
          />
        )}
        {state.view === 'examGenerator' && (
          <ExamGeneratorWorkspace
            profile={profile}
            onSavedNavigate={(target) => state.navigateTo(target)}
          />
        )}
        {state.view === 'lessonPlanGenerator' && (
          <LessonPlanGeneratorWorkspace
            profile={profile}
            onSavedNavigate={(target) => state.navigateTo(target)}
          />
        )}
        {state.view === 'approval' && canModerate && (
          <ApprovalQueueView
            profile={profile}
            materials={state.materials}
            departments={state.effectiveDepartments}
            loading={state.materialsLoading}
            onViewMaterial={state.handleViewMaterial}
            onDownloadMaterial={state.handleDownloadMaterial}
            onToggleShareLink={state.handleToggleShareLink}
            togglingShareId={state.togglingShareId}
          />
        )}
        {state.view === 'admin' && profile.vaiTro === 'quanTri' && (
          <AdminView
            profile={profile}
            users={state.allUsers}
            materials={state.materials}
            subjects={state.effectiveSubjects}
            departments={state.effectiveDepartments}
          />
        )}
        {state.view === 'profile' && <ProfileView profile={profile} />}
      </main>

      <MaterialPreviewModal
        material={state.previewMaterial}
        onClose={() => state.setPreviewMaterial(null)}
        onDownload={state.handleDownloadMaterial}
        canToggleShareLink={
          state.previewMaterial
            ? canManageGameShareLink(profile, state.previewMaterial)
            : false
        }
        onToggleShareLink={state.handleToggleShareLink}
        togglingShare={state.togglingShareId === state.previewMaterial?.id}
      />

      <ConfirmDialog
        open={Boolean(state.deleteTarget)}
        danger
        loading={state.deleting}
        title="Xác nhận xóa học liệu?"
        message={`Bạn có chắc muốn xóa học liệu "${state.deleteTarget?.tieuDe}"? Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa học liệu"
        onConfirm={state.handleConfirmDelete}
        onCancel={() => state.setDeleteTarget(null)}
      />
    </>
  );
}
