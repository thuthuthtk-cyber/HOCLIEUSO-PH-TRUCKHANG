import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CloudUpload, Copy, RefreshCw, Search, UserPlus } from 'lucide-react';
import {
  activateTeacherAuthAccount,
  addTeacher,
  deleteTeacher,
  getTeachers,
  sendUserPasswordReset,
  subscribeTeachers,
  syncSampleBghTeachers,
  updateTeacher,
} from '../../services/userService';
import { normalizeVietnamese } from '../../lib/utils';
import type { DepartmentItem } from '../../types/hocLieu';
import type { Teacher, TeacherInput } from '../../types/user';
import { useToast } from '../ToastContext';
import { ConfirmDialog } from '../ConfirmDialog';
import { DepartmentCard, type DepartmentTone } from './DepartmentCard';
import { TeacherModal } from './TeacherModal';

interface UserManagementPageProps {
  currentAdminUid: string;
  departments: DepartmentItem[];
}

interface DepartmentSectionDef {
  key: string;
  title: string;
  description: string;
  tone: DepartmentTone;
  aliases: string[];
}

const STANDARD_DEPARTMENTS: DepartmentSectionDef[] = [
  {
    key: 'Tổ Ban Giám Hiệu & Quản Trị Hệ Thống',
    title: 'Tổ Ban Giám Hiệu & Quản Trị Hệ Thống',
    description: 'Hiệu trưởng, Quản trị viên hệ thống, Văn phòng & Thư viện - Thiết bị',
    tone: 'amber',
    aliases: ['Tổ Ban Giám Hiệu & Quản Trị Hệ Thống', 'Tổ Ban Giám Hiệu', 'Tổ Văn phòng'],
  },
  {
    key: 'Tổ Chuyên Môn 1 (Khối Lớp 1)',
    title: 'Tổ Chuyên Môn 1 (Khối Lớp 1)',
    description: 'Giáo viên chủ nhiệm và giảng dạy các lớp Khối 1',
    tone: 'sky',
    aliases: ['Tổ Chuyên Môn 1 (Khối Lớp 1)', 'Tổ Chuyên Môn 1', 'Khối 1'],
  },
  {
    key: 'Tổ Chuyên Môn 2 (Khối Lớp 2)',
    title: 'Tổ Chuyên Môn 2 (Khối Lớp 2)',
    description: 'Giáo viên chủ nhiệm và giảng dạy các lớp Khối 2',
    tone: 'teal',
    aliases: ['Tổ Chuyên Môn 2 (Khối Lớp 2)', 'Tổ Chuyên Môn 2', 'Khối 2'],
  },
  {
    key: 'Tổ Chuyên Môn 3 (Khối Lớp 3)',
    title: 'Tổ Chuyên Môn 3 (Khối Lớp 3)',
    description: 'Giáo viên chủ nhiệm và giảng dạy các lớp Khối 3',
    tone: 'emerald',
    aliases: ['Tổ Chuyên Môn 3 (Khối Lớp 3)', 'Tổ Chuyên Môn 3', 'Khối 3'],
  },
  {
    key: 'Tổ Chuyên Môn 4 (Khối Lớp 4)',
    title: 'Tổ Chuyên Môn 4 (Khối Lớp 4)',
    description: 'Giáo viên chủ nhiệm và giảng dạy các lớp Khối 4',
    tone: 'indigo',
    aliases: ['Tổ Chuyên Môn 4 (Khối Lớp 4)', 'Tổ Chuyên Môn 4', 'Khối 4'],
  },
  {
    key: 'Tổ Chuyên Môn 5 (Khối Lớp 5)',
    title: 'Tổ Chuyên Môn 5 (Khối Lớp 5)',
    description: 'Giáo viên chủ nhiệm và giảng dạy các lớp Khối 5',
    tone: 'sky',
    aliases: ['Tổ Chuyên Môn 5 (Khối Lớp 5)', 'Tổ Chuyên Môn 5', 'Khối 5'],
  },
  {
    key: 'Tổ Chuyên Biệt',
    title: 'Tổ Chuyên Biệt',
    description: 'Tin học, Anh văn, Âm nhạc, Mĩ thuật, Giáo dục thể chất',
    tone: 'violet',
    aliases: ['Tổ Chuyên Biệt', 'Tổ Chuyên biệt'],
  },
];

function resolveGroupKey(rawTo: string, sections: DepartmentSectionDef[]): string {
  const clean = normalizeVietnamese(rawTo);
  for (const sec of sections) {
    if (sec.aliases.some((alias) => normalizeVietnamese(alias) === clean)) {
      return sec.key;
    }
  }
  return rawTo.trim() || 'Chưa phân tổ';
}

export function UserManagementPage({
  currentAdminUid,
  departments,
}: UserManagementPageProps) {
  const { showToast, showFirebaseAlert } = useToast();

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingSample, setSyncingSample] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTo, setSelectedTo] = useState<string>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [createdCredentials, setCreatedCredentials] = useState<{
    hoTen: string;
    email: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTeachers();
      setTeachers(data);
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    } finally {
      setLoading(false);
    }
  }, [showFirebaseAlert]);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeTeachers(
      (data) => {
        setTeachers(data);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        showFirebaseAlert(false, err);
      }
    );
    return () => unsub();
  }, [showFirebaseAlert]);

  const sections = useMemo(() => {
    const base = [...STANDARD_DEPARTMENTS];
    departments.forEach((d) => {
      const norm = normalizeVietnamese(d.ten);
      const exists = base.some((s) =>
        s.aliases.some((alias) => normalizeVietnamese(alias) === norm)
      );
      if (!exists) {
        base.push({
          key: d.ten,
          title: d.ten,
          description: d.moTa || 'Tổ chuyên môn nhà trường',
          tone: 'teal',
          aliases: [d.ten],
        });
      }
    });
    return base;
  }, [departments]);

  const departmentOptions = useMemo(() => sections.map((s) => s.title), [sections]);

  const filteredTeachers = useMemo(() => {
    const q = normalizeVietnamese(searchQuery);
    return teachers.filter((t) => {
      if (selectedTo !== 'all') {
        const groupKey = resolveGroupKey(t.toChuyenMon, sections);
        if (groupKey !== selectedTo) return false;
      }
      if (q) {
        const haystack = normalizeVietnamese(
          `${t.hoTen} ${t.maGV} ${t.cccd} ${t.email} ${t.soDienThoai} ${t.chucVu} ${t.toChuyenMon}`
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [teachers, searchQuery, selectedTo, sections]);

  const groupedCards = useMemo(() => {
    const map = new Map<string, Teacher[]>();
    sections.forEach((s) => map.set(s.key, []));

    filteredTeachers.forEach((t) => {
      const key = resolveGroupKey(t.toChuyenMon, sections);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });

    const result: { key: string; title: string; description: string; tone: DepartmentTone; teachers: Teacher[] }[] = [];

    sections.forEach((s) => {
      if (selectedTo !== 'all' && selectedTo !== s.key) return;
      const list = map.get(s.key) || [];
      if (searchQuery.trim() && list.length === 0) return;
      result.push({
        key: s.key,
        title: s.title,
        description: s.description,
        tone: s.tone,
        teachers: list,
      });
    });

    // Bổ sung các tổ phát sinh ngoài danh sách chuẩn nếu có
    map.forEach((list, key) => {
      if (sections.some((s) => s.key === key)) return;
      if (selectedTo !== 'all' && selectedTo !== key) return;
      if (list.length === 0) return;
      result.push({
        key,
        title: key,
        description: 'Tổ chuyên môn khác',
        tone: 'teal',
        teachers: list,
      });
    });

    return result;
  }, [sections, filteredTeachers, selectedTo, searchQuery]);

  async function handleSaveTeacher(data: TeacherInput, loginPassword?: string) {
    setSaving(true);
    try {
      if (editingTeacher) {
        if (loginPassword && loginPassword.trim().length >= 6) {
          try {
            await activateTeacherAuthAccount(editingTeacher.id, data, loginPassword);
            setCreatedCredentials({
              hoTen: data.hoTen,
              email: data.email,
              password: loginPassword,
            });
            showFirebaseAlert(
              true,
              `Đã cập nhật hồ sơ và cấp mật khẩu đăng nhập cho "${data.hoTen}" (${data.email}). Bạn có thể đăng xuất và đăng nhập thử ngay bằng tài khoản này.`
            );
          } catch (authErr: unknown) {
            const authCode = (authErr as { code?: string })?.code || '';
            if (authCode === 'auth/email-already-in-use') {
              await updateTeacher(editingTeacher.id, data);
              showFirebaseAlert(
                false,
                `Đã lưu thông tin hồ sơ của "${data.hoTen}", nhưng email ${data.email} đã có tài khoản trên Firebase Auth từ trước. Để đổi mật khẩu cho tài khoản đã tồn tại, vui lòng bấm "Gửi email đặt lại mật khẩu".`
              );
              setModalOpen(false);
              setEditingTeacher(null);
              return;
            }
            throw authErr;
          }
        } else {
          await updateTeacher(editingTeacher.id, data);
          showFirebaseAlert(true, `Đã cập nhật hồ sơ giáo viên "${data.hoTen}" lên Firestore.`);
        }
      } else {
        await addTeacher(data, loginPassword);
        if (loginPassword) {
          setCreatedCredentials({
            hoTen: data.hoTen,
            email: data.email,
            password: loginPassword,
          });
        }
        showFirebaseAlert(
          true,
          loginPassword
            ? `Đã thêm giáo viên "${data.hoTen}" (${data.email}) kèm tài khoản đăng nhập. Bạn có thể đăng nhập thử ngay.`
            : `Đã thêm hồ sơ giáo viên "${data.hoTen}" vào ${data.toChuyenMon} trên Firestore.`
        );
      }
      setModalOpen(false);
      setEditingTeacher(null);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/email-already-in-use') {
        showFirebaseAlert(false, 'Email này đã tồn tại trên Firebase Authentication.');
      } else if (code === 'auth/operation-not-allowed') {
        showFirebaseAlert(false, 'Vui lòng bật Email/Password trong Firebase Console → Authentication.');
      } else {
        showFirebaseAlert(false, err);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const removedName = deleteTarget.hoTen;
      await deleteTeacher(deleteTarget.id);
      setDeleteTarget(null);
      await loadTeachers();
      showFirebaseAlert(true, `Đã xóa hồ sơ của "${removedName}" khỏi collection users trên Firestore.`);
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSyncSampleBgh() {
    setSyncingSample(true);
    try {
      const { added, skipped } = await syncSampleBghTeachers();
      await loadTeachers();
      if (added > 0) {
        showFirebaseAlert(
          true,
          `Đã đẩy ${added} cán bộ Ban Giám Hiệu mẫu lên collection users trên Firestore${skipped > 0 ? ` (bỏ qua ${skipped} cán bộ đã tồn tại)` : ''}.`
        );
      } else {
        showToast('3 cán bộ Ban Giám Hiệu mẫu đã có sẵn trên Firestore.', 'info');
      }
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    } finally {
      setSyncingSample(false);
    }
  }

  async function handleResetPassword(teacher: Teacher) {
    try {
      await sendUserPasswordReset(teacher.email);
      showToast(`Đã gửi email đặt lại mật khẩu tới ${teacher.email}.`, 'success');
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    }
  }

  return (
    <div className="space-y-5">
      {/* Thanh công cụ trên cùng */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
        <div className="flex flex-col sm:flex-row flex-1 gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên, mã GV, CCCD, email, SĐT..."
              className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-700"
            />
          </div>

          <select
            aria-label="Lọc theo Tổ chuyên môn"
            value={selectedTo}
            onChange={(e) => setSelectedTo(e.target.value)}
            className="sm:w-72 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 focus:outline-none focus:border-teal-700"
          >
            <option value="all">Tất cả các Tổ ({teachers.length} cán bộ)</option>
            {sections.map((s) => (
              <option key={s.key} value={s.key}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void handleSyncSampleBgh()}
            disabled={syncingSample || loading}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs sm:text-sm font-bold hover:bg-amber-100 inline-flex items-center gap-1.5 disabled:opacity-60 whitespace-nowrap"
          >
            <CloudUpload className="w-4 h-4" />
            {syncingSample ? 'Đang đồng bộ...' : 'Đồng bộ dữ liệu mẫu lên Firebase'}
          </button>
          <button
            type="button"
            onClick={() => void loadTeachers()}
            disabled={loading}
            title="Làm mới danh sách"
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingTeacher(null);
              setModalOpen(true);
            }}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 transition-colors whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            Thêm Giáo Viên
          </button>
        </div>
      </div>

      {/* Hộp thông tin tài khoản mới cấp */}
      {createdCredentials && (
        <div className="p-4 rounded-2xl border border-teal-200 bg-teal-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm text-teal-950">
            <p className="font-bold">
              Đã cấp tài khoản đăng nhập cho {createdCredentials.hoTen}:
            </p>
            <p className="mt-0.5 font-mono text-xs sm:text-sm">
              Email: {createdCredentials.email} · Mật khẩu tạm: {createdCredentials.password}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(
                `Tài khoản Kho Học Liệu Số:\nEmail: ${createdCredentials.email}\nMật khẩu tạm: ${createdCredentials.password}\n(Lần đăng nhập đầu hệ thống yêu cầu đổi mật khẩu mới)`
              );
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-teal-300 text-xs font-bold text-teal-800 hover:bg-teal-100 shrink-0"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Đã sao chép' : 'Sao chép thông tin'}
          </button>
        </div>
      )}

      {/* Danh sách các DepartmentCard */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((n) => (
            <div
              key={n}
              className="h-48 rounded-2xl border border-slate-200 bg-white animate-pulse"
            />
          ))}
        </div>
      ) : groupedCards.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
          <p className="text-lg font-bold text-slate-900">
            Không tìm thấy giáo viên phù hợp
          </p>
          <p className="text-sm text-slate-600">
            Vui lòng thử từ khóa khác hoặc bấm nút "Thêm Giáo Viên" để tạo hồ sơ mới.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedCards.map((group) => (
            <DepartmentCard
              key={group.key}
              title={group.title}
              description={group.description}
              tone={group.tone}
              teachers={group.teachers}
              currentAdminUid={currentAdminUid}
              onEdit={(t) => {
                setEditingTeacher(t);
                setModalOpen(true);
              }}
              onDelete={(t) => setDeleteTarget(t)}
            />
          ))}
        </div>
      )}

      <TeacherModal
        open={modalOpen}
        editingTeacher={editingTeacher}
        departmentOptions={departmentOptions}
        saving={saving}
        isSelfEditing={editingTeacher?.id === currentAdminUid}
        onClose={() => {
          setModalOpen(false);
          setEditingTeacher(null);
        }}
        onSave={handleSaveTeacher}
        onResetPassword={handleResetPassword}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        danger
        loading={deleting}
        title="Xóa hồ sơ giáo viên?"
        message={`Bạn có chắc muốn xóa hồ sơ của "${deleteTarget?.hoTen}" khỏi danh sách nhà trường? Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa hồ sơ"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
