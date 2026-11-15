import {
  Building2,
  Mail,
  Pencil,
  Phone,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import type { Teacher } from '../../types/user';

export type DepartmentTone = 'amber' | 'sky' | 'teal' | 'emerald' | 'indigo' | 'violet';

interface DepartmentCardProps {
  title: string;
  description: string;
  tone?: DepartmentTone;
  teachers: Teacher[];
  currentAdminUid?: string;
  onEdit: (teacher: Teacher) => void;
  onDelete: (teacher: Teacher) => void;
}

const TONE_STYLES: Record<
  DepartmentTone,
  {
    headerBg: string;
    headerBorder: string;
    iconBox: string;
    countBadge: string;
  }
> = {
  amber: {
    headerBg: 'bg-amber-50/90',
    headerBorder: 'border-amber-200',
    iconBox: 'bg-amber-100 text-amber-800 border-amber-200',
    countBadge: 'bg-amber-100 text-amber-900 border-amber-200',
  },
  sky: {
    headerBg: 'bg-sky-50/90',
    headerBorder: 'border-sky-200',
    iconBox: 'bg-sky-100 text-sky-800 border-sky-200',
    countBadge: 'bg-sky-100 text-sky-900 border-sky-200',
  },
  teal: {
    headerBg: 'bg-teal-50/90',
    headerBorder: 'border-teal-200',
    iconBox: 'bg-teal-100 text-teal-800 border-teal-200',
    countBadge: 'bg-teal-100 text-teal-900 border-teal-200',
  },
  emerald: {
    headerBg: 'bg-emerald-50/90',
    headerBorder: 'border-emerald-200',
    iconBox: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    countBadge: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  },
  indigo: {
    headerBg: 'bg-indigo-50/90',
    headerBorder: 'border-indigo-200',
    iconBox: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    countBadge: 'bg-indigo-100 text-indigo-900 border-indigo-200',
  },
  violet: {
    headerBg: 'bg-violet-50/90',
    headerBorder: 'border-violet-200',
    iconBox: 'bg-violet-100 text-violet-800 border-violet-200',
    countBadge: 'bg-violet-100 text-violet-900 border-violet-200',
  },
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'GV';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getRoleBadgeStyle(role: Teacher['role']) {
  if (role === 'ADMIN') {
    return {
      wrapper: 'bg-amber-50 text-amber-900 border-amber-200',
      Icon: ShieldAlert,
    };
  }
  if (role === 'TO_TRUONG') {
    return {
      wrapper: 'bg-teal-50 text-teal-900 border-teal-200',
      Icon: ShieldCheck,
    };
  }
  return {
    wrapper: 'bg-slate-100 text-slate-800 border-slate-200',
    Icon: Shield,
  };
}

export function DepartmentCard({
  title,
  description,
  tone = 'teal',
  teachers,
  currentAdminUid,
  onEdit,
  onDelete,
}: DepartmentCardProps) {
  const style = TONE_STYLES[tone];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* Header của Card Tổ */}
      <div
        className={`px-5 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${style.headerBg} ${style.headerBorder}`}
      >
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div
            className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${style.iconBox}`}
          >
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold text-slate-900 leading-snug">{title}</h3>
            {description && (
              <p className="text-sm text-slate-600 leading-snug mt-0.5">{description}</p>
            )}
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold tabular-nums shrink-0 self-start sm:self-center ${style.countBadge}`}
        >
          <Users className="w-3.5 h-3.5" />
          {teachers.length} cán bộ
        </span>
      </div>

      {/* Bảng danh sách giáo viên 4 cột */}
      {teachers.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-500">
          Chưa có cán bộ, giáo viên nào thuộc tổ này.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold tracking-wider uppercase text-slate-500">
                <th className="py-3 pl-5 pr-4">Họ và tên &amp; Định danh</th>
                <th className="py-3 px-4">Thông tin liên hệ</th>
                <th className="py-3 px-4">Thẻ chức vụ &amp; Tổ</th>
                <th className="py-3 pl-4 pr-5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teachers.map((teacher) => {
                const isSelf = currentAdminUid === teacher.id;
                const badge = getRoleBadgeStyle(teacher.role);
                const RoleIcon = badge.Icon;

                return (
                  <tr key={teacher.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Cột 1: Họ và tên & Định danh */}
                    <td className="py-4 pl-5 pr-4 min-w-[260px]">
                      <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-full bg-teal-700 text-white font-bold text-sm flex items-center justify-center shrink-0">
                          {getInitials(teacher.hoTen)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[15px] text-slate-900 truncate">
                              {teacher.hoTen}
                            </span>
                            {isSelf && (
                              <span className="text-xs font-semibold text-teal-700">(Bạn)</span>
                            )}
                            {teacher.biKhoa && (
                              <span className="text-xs font-semibold text-rose-700">· Đang khóa</span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500 tabular-nums font-mono">
                            Mã: {teacher.maGV || '—'} • CCCD: {teacher.cccd || '—'} • NS:{' '}
                            {teacher.ngaySinh || '—'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Cột 2: Thông tin liên hệ */}
                    <td className="py-4 px-4 min-w-[210px]">
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2 text-slate-800">
                          <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[220px]">{teacher.email || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600 tabular-nums">
                          <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>{teacher.soDienThoai || '—'}</span>
                        </div>
                      </div>
                    </td>

                    {/* Cột 3: Thẻ chức vụ & Tổ */}
                    <td className="py-4 px-4 min-w-[220px]">
                      <div className="space-y-1">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold whitespace-nowrap ${badge.wrapper}`}
                        >
                          <RoleIcon className="w-3.5 h-3.5 shrink-0" />
                          {teacher.chucVu || 'Giáo viên'}
                        </span>
                        <div className="text-xs font-medium text-slate-500 pl-1">
                          {teacher.toChuyenMon || 'Chưa phân tổ'}
                        </div>
                      </div>
                    </td>

                    {/* Cột 4: Thao tác */}
                    <td className="py-4 pl-4 pr-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEdit(teacher)}
                          title={`Sửa thông tin ${teacher.hoTen}`}
                          aria-label={`Sửa ${teacher.hoTen}`}
                          className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:text-teal-800 hover:border-teal-300 hover:bg-teal-50 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={isSelf}
                          onClick={() => onDelete(teacher)}
                          title={
                            isSelf
                              ? 'Không thể tự xóa tài khoản của chính mình'
                              : `Xóa ${teacher.hoTen}`
                          }
                          aria-label={`Xóa ${teacher.hoTen}`}
                          className="p-2.5 rounded-xl border border-slate-200 bg-white text-rose-600 hover:text-rose-800 hover:border-rose-300 hover:bg-rose-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
