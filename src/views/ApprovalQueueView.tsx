import React, { useMemo, useState } from 'react';
import { CheckCircle2, Globe, X, XCircle } from 'lucide-react';
import { moderateMaterial } from '../services/hocLieuService';
import type { DepartmentItem, LearningMaterial, UserProfile } from '../types/hocLieu';
import { canManageGameShareLink } from '../utils/shareCode';
import { HocLieuList } from '../components/HocLieuList';
import { useToast } from '../components/ToastContext';

interface ApprovalQueueViewProps {
  profile: UserProfile;
  materials: LearningMaterial[];
  departments: DepartmentItem[];
  loading: boolean;
  onViewMaterial: (material: LearningMaterial) => void;
  onDownloadMaterial: (material: LearningMaterial) => void;
  onToggleShareLink: (material: LearningMaterial) => void;
  togglingShareId: string | null;
}

export function ApprovalQueueView({
  profile,
  materials,
  departments,
  loading,
  onViewMaterial,
  onDownloadMaterial,
  onToggleShareLink,
  togglingShareId,
}: ApprovalQueueViewProps) {
  const { showFirebaseAlert } = useToast();
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [rejectTarget, setRejectTarget] = useState<LearningMaterial | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  const scopedMaterials = useMemo(() => {
    return materials.filter((m) => {
      if (profile.vaiTro === 'quanTri') {
        if (deptFilter !== 'all' && m.toKhoi !== deptFilter) return false;
        return true;
      }
      return m.toKhoi === profile.toKhoi;
    });
  }, [materials, profile.toKhoi, profile.vaiTro, deptFilter]);

  const pendingList = useMemo(
    () => scopedMaterials.filter((m) => m.trangThai === 'choDuyet'),
    [scopedMaterials]
  );

  const approvedList = useMemo(
    () => scopedMaterials.filter((m) => m.trangThai === 'daDuyet'),
    [scopedMaterials]
  );

  const displayList = activeTab === 'pending' ? pendingList : approvedList;

  async function handleApprove(
    material: LearningMaterial,
    newStatus: 'daDuyet' | 'chiaSeToanTruong'
  ) {
    setBusyId(material.id);
    try {
      await moderateMaterial(material.id, newStatus, profile);
      showFirebaseAlert(
        true,
        newStatus === 'chiaSeToanTruong'
          ? `Đã duyệt và chia sẻ toàn trường học liệu "${material.tieuDe}".`
          : `Đã duyệt học liệu "${material.tieuDe}" cho ${material.toKhoi}.`
      );
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmReject(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectTarget) return;
    const cleanReason = rejectReason.trim();
    if (cleanReason.length < 3) {
      setRejectError('Vui lòng ghi rõ lý do từ chối để giáo viên biết cách chỉnh sửa.');
      return;
    }

    setBusyId(rejectTarget.id);
    try {
      await moderateMaterial(rejectTarget.id, 'tuChoi', profile, cleanReason);
      showFirebaseAlert(true, `Đã từ chối học liệu "${rejectTarget.tieuDe}" và gửi ghi chú chỉnh sửa.`);
      setRejectTarget(null);
      setRejectReason('');
      setRejectError('');
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Kiểm duyệt học liệu
          </h1>
          <p className="mt-1 text-[15px] text-slate-600">
            {profile.vaiTro === 'quanTri'
              ? 'Quản trị viên có thể duyệt, chia sẻ toàn trường hoặc trả lại học liệu của mọi tổ khối.'
              : `Kiểm duyệt học liệu thuộc ${profile.toKhoi} trước khi đưa vào kho dùng chung.`}
          </p>
        </div>

        {profile.vaiTro === 'quanTri' && (
          <div className="w-full sm:w-64">
            <label htmlFor="approval-dept" className="block text-xs font-semibold text-slate-600 mb-1">
              Lọc theo tổ khối
            </label>
            <select
              id="approval-dept"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-teal-700"
            >
              <option value="all">Tất cả tổ khối</option>
              {departments.map((d) => (
                <option key={d.id} value={d.ten}>
                  {d.ten}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="inline-flex flex-wrap gap-1.5 p-1.5 bg-slate-100 rounded-2xl">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors tabular-nums ${
            activeTab === 'pending'
              ? 'bg-white text-teal-800 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Chờ duyệt ({pendingList.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('approved')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors tabular-nums ${
            activeTab === 'approved'
              ? 'bg-white text-teal-800 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Đã duyệt trong tổ khối ({approvedList.length})
        </button>
      </div>

      <HocLieuList
        materials={displayList}
        loading={loading}
        emptyTitle={
          activeTab === 'pending'
            ? 'Hiện không có học liệu nào đang chờ duyệt'
            : 'Chưa có học liệu nào ở trạng thái Đã duyệt tổ khối'
        }
        emptyDescription={
          activeTab === 'pending'
            ? 'Các học liệu mới do giáo viên gửi lên sẽ xuất hiện tại đây.'
            : 'Thầy/cô có thể chuyển học liệu tốt từ tổ khối sang Chia sẻ toàn trường.'
        }
        onViewMaterial={onViewMaterial}
        onDownloadMaterial={onDownloadMaterial}
        canToggleShareLink={(m) => canManageGameShareLink(profile, m)}
        onToggleShareLink={onToggleShareLink}
        togglingShareId={togglingShareId}
        renderActions={(m) => {
          const isBusy = busyId === m.id;
          return (
            <div className="w-full flex flex-wrap gap-2">
              {m.trangThai === 'choDuyet' && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleApprove(m, 'daDuyet')}
                  className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 disabled:opacity-60 whitespace-nowrap"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Duyệt (Tổ khối)
                </button>
              )}

              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleApprove(m, 'chiaSeToanTruong')}
                className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sky-700 text-white text-xs font-bold hover:bg-sky-800 disabled:opacity-60 whitespace-nowrap"
              >
                <Globe className="w-4 h-4" />
                Chia sẻ toàn trường
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  setRejectTarget(m);
                  setRejectReason('');
                  setRejectError('');
                }}
                className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 text-xs font-bold hover:bg-rose-100 disabled:opacity-60 whitespace-nowrap"
              >
                <XCircle className="w-4 h-4" />
                Từ chối
              </button>
            </div>
          );
        }}
      />

      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleConfirmReject}
            className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-xl p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Từ chối &amp; yêu cầu chỉnh sửa</h3>
                <p className="mt-1 text-sm text-slate-600 line-clamp-2">
                  Học liệu: <span className="font-semibold text-slate-900">{rejectTarget.tieuDe}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {rejectError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
                {rejectError}
              </div>
            )}

            <div>
              <label htmlFor="reject-reason" className="block text-sm font-semibold text-slate-800 mb-1.5">
                Ghi chú lý do từ chối gửi giáo viên <span className="text-rose-600">*</span>
              </label>
              <textarea
                id="reject-reason"
                rows={4}
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ví dụ: Đường link Google Drive chưa mở quyền xem công khai, vui lòng bật quyền xem rồi gửi duyệt lại."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-[15px] focus:outline-none focus:border-teal-700"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={busyId === rejectTarget.id}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-60"
              >
                Xác nhận từ chối
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
