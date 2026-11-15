import { useMemo, useState } from 'react';
import { FolderPlus, Pencil, RotateCcw, Search, Send, Trash2 } from 'lucide-react';
import {
  MATERIAL_CATEGORIES,
  STATUS_LABELS,
  type LearningMaterial,
  type MaterialStatus,
  type UserProfile,
} from '../types/hocLieu';
import { normalizeVietnamese } from '../lib/utils';
import { canManageGameShareLink } from '../utils/shareCode';
import { HocLieuList } from '../components/HocLieuList';
import { ExportAllQrButton } from '../components/ExportAllQrButton';
import { MaterialExportModal } from '../components/MaterialExportModal';

interface MyMaterialsViewProps {
  profile: UserProfile;
  materials: LearningMaterial[];
  loading: boolean;
  onViewMaterial: (material: LearningMaterial) => void;
  onDownloadMaterial: (material: LearningMaterial) => void;
  onToggleShareLink: (material: LearningMaterial) => void;
  togglingShareId: string | null;
  onEditMaterial: (material: LearningMaterial) => void;
  onDeleteMaterial: (material: LearningMaterial) => void;
  onSubmitDraft: (material: LearningMaterial) => void;
  onNavigateUpload: () => void;
}

const STATUS_TABS: { key: 'all' | MaterialStatus; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'nhap', label: STATUS_LABELS.nhap },
  { key: 'choDuyet', label: STATUS_LABELS.choDuyet },
  { key: 'daDuyet', label: STATUS_LABELS.daDuyet },
  { key: 'chiaSeToanTruong', label: STATUS_LABELS.chiaSeToanTruong },
  { key: 'tuChoi', label: STATUS_LABELS.tuChoi },
];

export function MyMaterialsView({
  profile,
  materials,
  loading,
  onViewMaterial,
  onDownloadMaterial,
  onToggleShareLink,
  togglingShareId,
  onEditMaterial,
  onDeleteMaterial,
  onSubmitDraft,
  onNavigateUpload,
}: MyMaterialsViewProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | MaterialStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [exportAllOpen, setExportAllOpen] = useState(false);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: materials.length };
    for (const m of materials) {
      map[m.trangThai] = (map[m.trangThai] || 0) + 1;
    }
    return map;
  }, [materials]);

  const filtered = useMemo(() => {
    const q = normalizeVietnamese(searchQuery);
    return materials.filter((m) => {
      if (statusFilter !== 'all' && m.trangThai !== statusFilter) return false;
      if (categoryFilter !== 'all' && m.loai !== categoryFilter) return false;
      if (q) {
        const haystack = normalizeVietnamese(
          [m.tieuDe, m.tenBaiHoc || '', m.moTa, m.monHoc, m.loai, ...m.the].join(' ')
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [materials, statusFilter, categoryFilter, searchQuery]);

  const hasActiveFilter = searchQuery.trim() !== '' || categoryFilter !== 'all';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Học liệu của tôi
          </h1>
          <p className="mt-1 text-[15px] text-slate-600">
            Theo dõi trạng thái duyệt, chỉnh sửa bản nháp hoặc học liệu cần bổ sung theo góp ý của Tổ trưởng.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <ExportAllQrButton
            count={filtered.length}
            onClick={() => setExportAllOpen(true)}
          />
          <button
            type="button"
            onClick={onNavigateUpload}
            className="min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
          >
            <FolderPlus className="w-4 h-4" />
            Tải học liệu mới
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm học liệu của tôi theo tiêu đề, tên bài học, môn học, từ khóa..."
              className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700"
            />
          </div>

          <div className="w-full sm:w-56">
            <select
              aria-label="Lọc theo loại học liệu"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-teal-700"
            >
              <option value="all">Tất cả loại học liệu</option>
              {MATERIAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('all');
              }}
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 text-sm font-semibold text-teal-700 hover:bg-slate-100 whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              Đặt lại
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-100 rounded-xl">
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.key;
            const count = counts[tab.key] || 0;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap tabular-nums ${
                  active
                    ? 'bg-white text-teal-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <HocLieuList
        materials={filtered}
        loading={loading}
        emptyTitle="Chưa có học liệu nào trong mục này"
        emptyDescription="Thầy/cô có thể tải lên bài giảng điện tử, giáo án hoặc dán liên kết Google Drive, YouTube để lưu trữ và chia sẻ."
        emptyAction={
          <button
            type="button"
            onClick={onNavigateUpload}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800"
          >
            Tải học liệu lên
          </button>
        }
        onViewMaterial={onViewMaterial}
        onDownloadMaterial={onDownloadMaterial}
        canToggleShareLink={(m) => canManageGameShareLink(profile, m)}
        onToggleShareLink={onToggleShareLink}
        togglingShareId={togglingShareId}
        renderActions={(m) => {
          const canModify =
            m.trangThai === 'nhap' || m.trangThai === 'choDuyet' || m.trangThai === 'tuChoi';

          if (!canModify) {
            return (
              <span className="text-xs text-slate-500">
                Học liệu đã duyệt không thể tự sửa hoặc xóa (liên hệ Tổ trưởng/Quản trị nếu cần thu hồi).
              </span>
            );
          }

          return (
            <>
              {m.trangThai === 'nhap' && (
                <button
                  type="button"
                  onClick={() => onSubmitDraft(m)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  Gửi duyệt
                </button>
              )}
              <button
                type="button"
                onClick={() => onEditMaterial(m)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                {m.trangThai === 'tuChoi' ? 'Sửa & gửi lại' : 'Chỉnh sửa'}
              </button>
              <button
                type="button"
                onClick={() => onDeleteMaterial(m)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition-colors ml-auto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Xóa
              </button>
            </>
          );
        }}
      />

      <MaterialExportModal
        materials={exportAllOpen ? filtered : []}
        onClose={() => setExportAllOpen(false)}
        onExportDownload={(items) => items.forEach((item) => onDownloadMaterial(item))}
      />
    </div>
  );
}
