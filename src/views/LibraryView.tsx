import { useMemo, useState } from 'react';
import { FolderPlus, RotateCcw, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import {
  GRADE_LEVELS,
  MATERIAL_CATEGORIES,
  type DepartmentItem,
  type LearningMaterial,
  type SubjectItem,
  type UserProfile,
} from '../types/hocLieu';
import { normalizeVietnamese } from '../lib/utils';
import { canManageGameShareLink } from '../utils/shareCode';
import { HocLieuList } from '../components/HocLieuList';
import { ExportAllQrButton } from '../components/ExportAllQrButton';
import { MaterialExportModal } from '../components/MaterialExportModal';

interface LibraryViewProps {
  profile: UserProfile;
  materials: LearningMaterial[];
  subjects: SubjectItem[];
  departments: DepartmentItem[];
  loading: boolean;
  onViewMaterial: (material: LearningMaterial) => void;
  onDownloadMaterial: (material: LearningMaterial) => void;
  onToggleShareLink: (material: LearningMaterial) => void;
  togglingShareId: string | null;
  onNavigateUpload: () => void;
  onAdminRemoveMaterial: (material: LearningMaterial) => void;
}

export function LibraryView({
  profile,
  materials,
  subjects,
  departments,
  loading,
  onViewMaterial,
  onDownloadMaterial,
  onToggleShareLink,
  togglingShareId,
  onNavigateUpload,
  onAdminRemoveMaterial,
}: LibraryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'school' | 'department'>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);
  const [exportAllOpen, setExportAllOpen] = useState(false);

  const visibleInLibrary = useMemo(() => {
    return materials.filter((m) => {
      if (profile.vaiTro === 'quanTri') {
        return m.trangThai === 'daDuyet' || m.trangThai === 'chiaSeToanTruong';
      }
      if (m.trangThai === 'chiaSeToanTruong') return true;
      if (m.trangThai === 'daDuyet' && m.toKhoi === profile.toKhoi) return true;
      return false;
    });
  }, [materials, profile.toKhoi, profile.vaiTro]);

  const filteredMaterials = useMemo(() => {
    const q = normalizeVietnamese(searchQuery);

    return visibleInLibrary.filter((m) => {
      if (scopeFilter === 'school' && m.trangThai !== 'chiaSeToanTruong') return false;
      if (scopeFilter === 'department' && m.toKhoi !== profile.toKhoi) return false;
      if (gradeFilter !== 'all' && m.khoiLop !== gradeFilter) return false;
      if (subjectFilter !== 'all' && m.monHoc !== subjectFilter) return false;
      if (categoryFilter !== 'all' && m.loai !== categoryFilter) return false;
      if (deptFilter !== 'all' && m.toKhoi !== deptFilter) return false;

      if (q) {
        const haystack = normalizeVietnamese(
          [m.tieuDe, m.tenBaiHoc || '', m.moTa, m.monHoc, m.nguoiDangTen, m.toKhoi, ...m.the].join(' ')
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [
    visibleInLibrary,
    searchQuery,
    scopeFilter,
    gradeFilter,
    subjectFilter,
    categoryFilter,
    deptFilter,
    profile.toKhoi,
  ]);

  const hasActiveFilter =
    searchQuery.trim() !== '' ||
    scopeFilter !== 'all' ||
    gradeFilter !== 'all' ||
    subjectFilter !== 'all' ||
    categoryFilter !== 'all' ||
    deptFilter !== 'all';

  function resetFilters() {
    setSearchQuery('');
    setScopeFilter('all');
    setGradeFilter('all');
    setSubjectFilter('all');
    setCategoryFilter('all');
    setDeptFilter('all');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Kho học liệu dùng chung
          </h1>
          <p className="mt-1 text-[15px] text-slate-600">
            Hiển thị học liệu đã duyệt của{' '}
            <span className="font-semibold text-slate-800">{profile.toKhoi}</span> và học liệu chia sẻ toàn trường.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <ExportAllQrButton
            count={filteredMaterials.length}
            onClick={() => setExportAllOpen(true)}
          />
          <button
            type="button"
            onClick={onNavigateUpload}
            className="min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
          >
            <FolderPlus className="w-4 h-4" />
            Đóng góp học liệu
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên học liệu, tên bài học, môn học, giáo viên, thẻ từ khóa..."
              className="w-full min-h-[48px] pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowFiltersMobile((v) => !v)}
            className="md:hidden min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 text-sm font-semibold"
          >
            <SlidersHorizontal className="w-4 h-4 text-teal-700" />
            {showFiltersMobile ? 'Thu gọn bộ lọc' : 'Mở bộ lọc chi tiết'}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setScopeFilter('all')}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                scopeFilter === 'all'
                  ? 'bg-white text-teal-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả ({visibleInLibrary.length})
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('school')}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                scopeFilter === 'school'
                  ? 'bg-white text-teal-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Chia sẻ toàn trường
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('department')}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                scopeFilter === 'department'
                  ? 'bg-white text-teal-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {profile.toKhoi}
            </button>
          </div>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:text-teal-800"
            >
              <RotateCcw className="w-4 h-4" />
              Đặt lại bộ lọc
            </button>
          )}
        </div>

        <div
          className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 ${
            showFiltersMobile ? 'grid' : 'hidden md:grid'
          }`}
        >
          <div>
            <label htmlFor="filter-grade" className="block text-xs font-semibold text-slate-600 mb-1">
              Khối lớp
            </label>
            <select
              id="filter-grade"
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-teal-700"
            >
              <option value="all">Tất cả khối lớp</option>
              {GRADE_LEVELS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-subject" className="block text-xs font-semibold text-slate-600 mb-1">
              Môn học
            </label>
            <select
              id="filter-subject"
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-teal-700"
            >
              <option value="all">Tất cả môn học</option>
              {subjects
                .filter((s) => s.kichHoat)
                .map((s) => (
                  <option key={s.id} value={s.ten}>
                    {s.ten}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-category" className="block text-xs font-semibold text-slate-600 mb-1">
              Loại học liệu
            </label>
            <select
              id="filter-category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-teal-700"
            >
              <option value="all">Tất cả thể loại</option>
              {MATERIAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-dept" className="block text-xs font-semibold text-slate-600 mb-1">
              Tổ khối
            </label>
            <select
              id="filter-dept"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-teal-700"
            >
              <option value="all">Tất cả tổ khối</option>
              {departments
                .filter((d) => d.kichHoat)
                .map((d) => (
                  <option key={d.id} value={d.ten}>
                    {d.ten}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {!loading && filteredMaterials.length > 0 && (
        <p className="text-sm font-medium text-slate-600 tabular-nums">
          Đang hiển thị <span className="font-bold text-slate-900">{filteredMaterials.length}</span>{' '}
          học liệu
        </p>
      )}

      <HocLieuList
        materials={filteredMaterials}
        loading={loading}
        emptyTitle={
          hasActiveFilter
            ? 'Không tìm thấy học liệu phù hợp với bộ lọc'
            : 'Chưa có học liệu nào được chia sẻ'
        }
        emptyDescription={
          hasActiveFilter
            ? 'Thầy/cô hãy thử thay đổi từ khóa tìm kiếm hoặc đặt lại bộ lọc để xem nhiều kết quả hơn.'
            : 'Thầy/cô có thể bắt đầu đóng góp học liệu đầu tiên hoặc nhờ Quản trị viên tạo dữ liệu mẫu để tham khảo.'
        }
        emptyAction={
          <>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50"
              >
                Xóa bộ lọc
              </button>
            )}
            <button
              type="button"
              onClick={onNavigateUpload}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800"
            >
              Tải học liệu lên ngay
            </button>
          </>
        }
        onViewMaterial={onViewMaterial}
        onDownloadMaterial={onDownloadMaterial}
        canToggleShareLink={(m) => canManageGameShareLink(profile, m)}
        onToggleShareLink={onToggleShareLink}
        togglingShareId={togglingShareId}
        renderActions={
          profile.vaiTro === 'quanTri'
            ? (m) => (
                <button
                  type="button"
                  onClick={() => onAdminRemoveMaterial(m)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Gỡ khỏi kho (Quản trị)
                </button>
              )
            : undefined
        }
      />

      <MaterialExportModal
        materials={exportAllOpen ? filteredMaterials : []}
        onClose={() => setExportAllOpen(false)}
        onExportDownload={(items) => items.forEach((item) => onDownloadMaterial(item))}
      />
    </div>
  );
}
