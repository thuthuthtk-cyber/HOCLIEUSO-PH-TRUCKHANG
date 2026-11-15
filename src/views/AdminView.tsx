import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  BookMarked,
  Building2,
  CloudUpload,
  Database,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import {
  clearSampleData,
  createSampleData,
  seedDefaultCatalogs,
  syncSampleMaterialsWithAddDoc,
} from '../services/hocLieuService';
import {
  addDepartment,
  addSubject,
  deleteDepartment,
  deleteSubject,
  syncAllSampleTeachers,
  toggleDepartment,
  toggleSubject,
} from '../services/userService';
import type {
  DepartmentItem,
  LearningMaterial,
  SubjectItem,
  UserProfile,
} from '../types/hocLieu';
import { useToast } from '../components/ToastContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { UserManagementPage } from '../components/users/UserManagementPage';

interface AdminViewProps {
  profile: UserProfile;
  users: UserProfile[];
  materials: LearningMaterial[];
  subjects: SubjectItem[];
  departments: DepartmentItem[];
}

type AdminTab = 'stats' | 'users' | 'subjects' | 'departments';

export function AdminView({
  profile,
  users,
  materials,
  subjects,
  departments,
}: AdminViewProps) {
  const { showToast, showFirebaseAlert } = useToast();
  const [tab, setTab] = useState<AdminTab>('stats');

  const [seeding, setSeeding] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [confirmClearSample, setConfirmClearSample] = useState(false);
  const sampleCount = useMemo(
    () => materials.filter((m) => m.isSample).length,
    [materials]
  );

  const [subjectName, setSubjectName] = useState('');
  const [subjectOrder, setSubjectOrder] = useState(subjects.length + 1);
  const [savingSubject, setSavingSubject] = useState(false);
  const [deleteSubjectTarget, setDeleteSubjectTarget] = useState<SubjectItem | null>(null);

  const [deptName, setDeptName] = useState('');
  const [deptDesc, setDeptDesc] = useState('');
  const [deptOrder, setDeptOrder] = useState(departments.length + 1);
  const [savingDept, setSavingDept] = useState(false);
  const [deleteDeptTarget, setDeleteDeptTarget] = useState<DepartmentItem | null>(null);

  const stats = useMemo(() => {
    const totalViews = materials.reduce((sum, m) => sum + (m.luotXem || 0), 0);
    const totalDownloads = materials.reduce((sum, m) => sum + (m.luotTai || 0), 0);
    const pending = materials.filter((m) => m.trangThai === 'choDuyet').length;
    const schoolWide = materials.filter((m) => m.trangThai === 'chiaSeToanTruong').length;
    const deptApproved = materials.filter((m) => m.trangThai === 'daDuyet').length;

    const byDept = new Map<string, number>();
    departments.forEach((d) => byDept.set(d.ten, 0));
    materials.forEach((m) => {
      byDept.set(m.toKhoi, (byDept.get(m.toKhoi) || 0) + 1);
    });

    return {
      totalMaterials: materials.length,
      pending,
      schoolWide,
      deptApproved,
      totalViews,
      totalDownloads,
      activeUsers: users.filter((u) => !u.biKhoa).length,
      totalUsers: users.length,
      byDept: Array.from(byDept.entries()),
    };
  }, [materials, users, departments]);

  async function handleSeedSample() {
    setSeeding(true);
    try {
      const count = await createSampleData(profile);
      showFirebaseAlert(true, `Đã tạo ${count} học liệu mẫu và danh mục chuẩn lên Firestore.`);
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    } finally {
      setSeeding(false);
    }
  }

  async function handlePushAllSampleToFirebase() {
    setSyncingAll(true);
    try {
      await seedDefaultCatalogs();
      const [teacherRes, materialRes] = await Promise.all([
        syncAllSampleTeachers(),
        syncSampleMaterialsWithAddDoc(profile),
      ]);
      showFirebaseAlert(
        true,
        `Đã gọi addDoc đồng bộ ${teacherRes.added} cán bộ/giáo viên (bỏ qua ${teacherRes.skipped} đã có) và ${materialRes.added} học liệu mẫu (bỏ qua ${materialRes.skipped} đã có) lên Firestore dự án hoclieuso26-27 (database ai-studio-62809f80-8cf7-499a-b81a-d2bc9cce1e73).`,
        'Đã đồng bộ lên Firebase thành công!'
      );
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    } finally {
      setSyncingAll(false);
    }
  }

  async function handleClearSample() {
    setSeeding(true);
    try {
      const count = await clearSampleData();
      setConfirmClearSample(false);
      showFirebaseAlert(
        true,
        count > 0 ? `Đã xóa ${count} học liệu mẫu khỏi Firestore.` : 'Không có dữ liệu mẫu nào để xóa.'
      );
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    } finally {
      setSeeding(false);
    }
  }

  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault();
    const clean = subjectName.trim();
    if (!clean) return;
    setSavingSubject(true);
    try {
      await addSubject(clean, Number(subjectOrder) || 1);
      setSubjectName('');
      setSubjectOrder((v) => v + 1);
      showFirebaseAlert(true, `Đã thêm môn "${clean}" lên Firestore.`);
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    } finally {
      setSavingSubject(false);
    }
  }

  async function handleToggleSubject(s: SubjectItem) {
    try {
      await toggleSubject(s.id, !s.kichHoat);
      showToast(`Đã ${!s.kichHoat ? 'hiện' : 'ẩn'} môn "${s.ten}".`, 'info');
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    }
  }

  async function handleDeleteSubject() {
    if (!deleteSubjectTarget) return;
    try {
      const name = deleteSubjectTarget.ten;
      await deleteSubject(deleteSubjectTarget.id);
      setDeleteSubjectTarget(null);
      showFirebaseAlert(true, `Đã xóa môn "${name}" khỏi Firestore.`);
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    }
  }

  async function handleAddDept(e: React.FormEvent) {
    e.preventDefault();
    const clean = deptName.trim();
    if (!clean) return;
    setSavingDept(true);
    try {
      await addDepartment(clean, deptDesc, Number(deptOrder) || 1);
      setDeptName('');
      setDeptDesc('');
      setDeptOrder((v) => v + 1);
      showFirebaseAlert(true, `Đã thêm tổ khối "${clean}" lên Firestore.`);
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    } finally {
      setSavingDept(false);
    }
  }

  async function handleToggleDept(d: DepartmentItem) {
    try {
      await toggleDepartment(d.id, !d.kichHoat);
      showToast(`Đã ${!d.kichHoat ? 'hiện' : 'ẩn'} "${d.ten}".`, 'info');
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    }
  }

  async function handleDeleteDept() {
    if (!deleteDeptTarget) return;
    try {
      const name = deleteDeptTarget.ten;
      await deleteDepartment(deleteDeptTarget.id);
      setDeleteDeptTarget(null);
      showFirebaseAlert(true, `Đã xóa "${name}" khỏi Firestore.`);
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Quản trị hệ thống
          </h1>
          <p className="mt-1 text-[15px] text-slate-600">
            Quản lý tài khoản giáo viên, danh mục môn học, danh sách tổ khối và theo dõi thống kê kho học liệu.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handlePushAllSampleToFirebase()}
          disabled={syncingAll || seeding}
          className="min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-60 transition-colors shrink-0 shadow-xs"
        >
          <CloudUpload className="w-4 h-4" />
          {syncingAll ? 'Đang đồng bộ lên Firebase...' : 'Đẩy dữ liệu mẫu lên Firebase'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-100 rounded-2xl">
        <button
          type="button"
          onClick={() => setTab('stats')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
            tab === 'stats' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Thống kê &amp; Dữ liệu mẫu
        </button>
        <button
          type="button"
          onClick={() => setTab('users')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
            tab === 'users' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          Tài khoản ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('subjects')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
            tab === 'subjects' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BookMarked className="w-4 h-4" />
          Môn học ({subjects.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('departments')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
            tab === 'departments' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Tổ khối ({departments.length})
        </button>
      </div>

      {tab === 'stats' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <p className="text-sm font-medium text-slate-500">Tổng số học liệu</p>
              <p className="mt-2 text-3xl font-extrabold text-slate-900 tabular-nums">
                {stats.totalMaterials}
              </p>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                Toàn trường: {stats.schoolWide} · Tổ khối: {stats.deptApproved}
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <p className="text-sm font-medium text-slate-500">Đang chờ duyệt</p>
              <p className="mt-2 text-3xl font-extrabold text-amber-700 tabular-nums">
                {stats.pending}
              </p>
              <p className="mt-1 text-xs text-slate-500">Cần Tổ trưởng / Quản trị xem xét</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <p className="text-sm font-medium text-slate-500">Lượt xem / Tải về</p>
              <p className="mt-2 text-3xl font-extrabold text-teal-700 tabular-nums">
                {stats.totalViews} <span className="text-lg font-bold text-slate-400">/</span>{' '}
                {stats.totalDownloads}
              </p>
              <p className="mt-1 text-xs text-slate-500">Tổng tương tác toàn trường</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <p className="text-sm font-medium text-slate-500">Tài khoản giáo viên</p>
              <p className="mt-2 text-3xl font-extrabold text-slate-900 tabular-nums">
                {stats.activeUsers}{' '}
                <span className="text-base font-medium text-slate-400">/ {stats.totalUsers}</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">Đang hoạt động</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Số lượng học liệu theo tổ khối</h2>
            <div className="space-y-3">
              {stats.byDept.map(([name, count]) => {
                const max = Math.max(1, ...stats.byDept.map(([, c]) => c));
                const pct = Math.round((count / max) * 100);
                return (
                  <div key={name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold text-slate-800">{name}</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-600">
                        {count} học liệu
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-teal-700 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-teal-50 text-teal-700 shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Dữ liệu mẫu &amp; Danh mục khởi tạo
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Tạo nhanh 8 học liệu mẫu chuẩn tiểu học (có bài đã duyệt, chờ duyệt và bị từ chối) để tập huấn giáo viên sử dụng. Khi dùng chính thức, bấm nút Xóa dữ liệu mẫu để làm sạch kho.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                disabled={seeding}
                onClick={handleSeedSample}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-60"
              >
                <Sparkles className="w-4 h-4" />
                {seeding ? 'Đang xử lý...' : 'Tạo dữ liệu mẫu xem thử'}
              </button>

              <button
                type="button"
                disabled={seeding || sampleCount === 0}
                onClick={() => setConfirmClearSample(true)}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 text-sm font-bold hover:bg-rose-100 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Xóa dữ liệu mẫu ({sampleCount})
              </button>

              <button
                type="button"
                disabled={seeding}
                onClick={async () => {
                  const res = await seedDefaultCatalogs();
                  showToast(
                    res.subjectsAdded + res.departmentsAdded > 0
                      ? `Đã bổ sung ${res.subjectsAdded} môn học và ${res.departmentsAdded} tổ khối mặc định.`
                      : 'Danh mục môn học và tổ khối đã có sẵn.',
                    'info'
                  );
                }}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50"
              >
                Khởi tạo lại danh mục chuẩn
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <UserManagementPage currentAdminUid={profile.uid} departments={departments} />
      )}

      {tab === 'subjects' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
          <form onSubmit={handleAddSubject} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              required
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="Tên môn học mới (ví dụ: Kỹ năng sống)"
              className="flex-1 min-h-[46px] px-4 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-700"
            />
            <input
              type="number"
              min={1}
              max={999}
              value={subjectOrder}
              onChange={(e) => setSubjectOrder(Number(e.target.value))}
              aria-label="Thứ tự"
              className="w-28 min-h-[46px] px-3 py-2 rounded-xl border border-slate-300 text-sm tabular-nums"
            />
            <button
              type="submit"
              disabled={savingSubject}
              className="min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800"
            >
              <Plus className="w-4 h-4" />
              Thêm môn học
            </button>
          </form>

          <div className="divide-y divide-slate-100 border-t border-slate-200">
            {subjects.map((s) => (
              <div
                key={s.id}
                className="py-3.5 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-slate-400 tabular-nums w-7">
                    #{s.thuTu}
                  </span>
                  <span
                    className={`font-semibold text-[15px] ${
                      s.kichHoat ? 'text-slate-900' : 'text-slate-400 line-through'
                    }`}
                  >
                    {s.ten}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleSubject(s)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {s.kichHoat ? 'Đang hiện (Ẩn đi)' : 'Đang ẩn (Hiện lại)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteSubjectTarget(s)}
                    className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"
                    aria-label={`Xóa môn ${s.ten}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'departments' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
          <form onSubmit={handleAddDept} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <input
              type="text"
              required
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              placeholder="Tên tổ khối mới (ví dụ: Tổ Ngoại ngữ)"
              className="sm:col-span-4 min-h-[46px] px-4 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-700"
            />
            <input
              type="text"
              value={deptDesc}
              onChange={(e) => setDeptDesc(e.target.value)}
              placeholder="Mô tả ngắn (ví dụ: Các môn chuyên biệt...)"
              className="sm:col-span-5 min-h-[46px] px-4 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-700"
            />
            <input
              type="number"
              min={1}
              max={999}
              value={deptOrder}
              onChange={(e) => setDeptOrder(Number(e.target.value))}
              aria-label="Thứ tự"
              className="sm:col-span-1 min-h-[46px] px-3 py-2 rounded-xl border border-slate-300 text-sm tabular-nums"
            />
            <button
              type="submit"
              disabled={savingDept}
              className="sm:col-span-2 min-h-[46px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Thêm tổ khối
            </button>
          </form>

          <div className="divide-y divide-slate-100 border-t border-slate-200">
            {departments.map((d) => (
              <div
                key={d.id}
                className="py-3.5 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <span className="font-mono text-xs text-slate-400 tabular-nums w-7 mt-1">
                    #{d.thuTu}
                  </span>
                  <div>
                    <div
                      className={`font-semibold text-[15px] ${
                        d.kichHoat ? 'text-slate-900' : 'text-slate-400 line-through'
                      }`}
                    >
                      {d.ten}
                    </div>
                    {d.moTa && <p className="text-xs text-slate-500">{d.moTa}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleDept(d)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {d.kichHoat ? 'Đang hiện (Ẩn đi)' : 'Đang ẩn (Hiện lại)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteDeptTarget(d)}
                    className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"
                    aria-label={`Xóa tổ khối ${d.ten}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmClearSample}
        danger
        loading={seeding}
        title="Xóa toàn bộ dữ liệu mẫu?"
        message={`Thao tác này sẽ xóa ${sampleCount} học liệu mẫu ra khỏi kho. Dữ liệu thật do giáo viên đăng tải sẽ được giữ nguyên.`}
        confirmLabel="Xóa dữ liệu mẫu"
        onConfirm={handleClearSample}
        onCancel={() => setConfirmClearSample(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteSubjectTarget)}
        danger
        title="Xóa môn học khỏi danh mục?"
        message={`Bạn có chắc muốn xóa môn "${deleteSubjectTarget?.ten}"? Các học liệu cũ mang tên môn này vẫn giữ nguyên, nhưng giáo viên sẽ không chọn được môn này khi tải bài mới.`}
        confirmLabel="Xóa môn học"
        onConfirm={handleDeleteSubject}
        onCancel={() => setDeleteSubjectTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteDeptTarget)}
        danger
        title="Xóa tổ khối khỏi danh sách?"
        message={`Bạn có chắc muốn xóa "${deleteDeptTarget?.ten}"?`}
        confirmLabel="Xóa tổ khối"
        onConfirm={handleDeleteDept}
        onCancel={() => setDeleteDeptTarget(null)}
      />
    </div>
  );
}
