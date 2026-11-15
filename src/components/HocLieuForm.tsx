import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Save,
  Send,
} from 'lucide-react';
import {
  createMaterial,
  updateMaterial,
} from '../services/hocLieuService';
import { isValidHttpUrl } from '../lib/utils';
import {
  GRADE_LEVELS,
  MATERIAL_CATEGORIES,
  type DepartmentItem,
  type GradeLevel,
  type LearningMaterial,
  type MaterialCategory,
  type MaterialInput,
  type SubjectItem,
  type UserProfile,
} from '../types/hocLieu';
import { useToast } from './ToastContext';

interface HocLieuFormProps {
  profile: UserProfile;
  subjects: SubjectItem[];
  departments: DepartmentItem[];
  editingMaterial: LearningMaterial | null;
  onCancel: () => void;
  onSuccess: (publishedImmediately?: boolean) => void;
}

function canInstantApproveMaterial(profile: UserProfile): boolean {
  if (profile.vaiTro === 'toTruong' || profile.vaiTro === 'quanTri') return true;
  if (profile.role === 'TO_TRUONG' || profile.role === 'ADMIN') return true;
  return (
    profile.chucVu === 'Tổ trưởng chuyên môn' ||
    profile.chucVu === 'Hiệu trưởng (BGH)' ||
    profile.chucVu === 'Quản trị viên (ADMIN)'
  );
}

export function HocLieuForm({
  profile,
  subjects,
  departments,
  editingMaterial,
  onCancel,
  onSuccess,
}: HocLieuFormProps) {
  const { showFirebaseAlert } = useToast();
  const isEditing = Boolean(editingMaterial);
  const canInstantApprove = canInstantApproveMaterial(profile);

  const activeSubjects = subjects.filter((s) => s.kichHoat);
  const activeDepartments = departments.filter((d) => d.kichHoat);

  const [tieuDe, setTieuDe] = useState(editingMaterial?.tieuDe || '');
  const [moTa, setMoTa] = useState(editingMaterial?.moTa || '');
  const [monHoc, setMonHoc] = useState(
    editingMaterial?.monHoc || activeSubjects[0]?.ten || 'Toán'
  );
  const [khoiLop, setKhoiLop] = useState<GradeLevel>(editingMaterial?.khoiLop || '1');
  const [loai, setLoai] = useState<MaterialCategory>(
    editingMaterial?.loai || 'Bài giảng điện tử'
  );
  const [toKhoi, setToKhoi] = useState(
    editingMaterial?.toKhoi || profile.toKhoi || profile.toChuyenMon || ''
  );
  const [tagsInput, setTagsInput] = useState(editingMaterial?.the.join(', ') || '');

  const [url, setUrl] = useState(editingMaterial?.url || '');

  const [instantApprove, setInstantApprove] = useState(
    Boolean(canInstantApprove && editingMaterial?.trangThai === 'daDuyet')
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  async function handleSave(targetStatus: 'nhap' | 'choDuyet' | 'daDuyet') {
    setFormError('');

    const cleanTitle = tieuDe.trim();
    if (cleanTitle.length < 2) {
      setFormError('Vui lòng nhập tiêu đề học liệu (tối thiểu 2 ký tự).');
      return;
    }

    const finalUrl = url.trim();
    if (!finalUrl || !isValidHttpUrl(finalUrl)) {
      setFormError(
        'Vui lòng dán đường dẫn học liệu hợp lệ bắt đầu bằng http:// hoặc https:// (ví dụ liên kết Google Drive, YouTube, Canva, Quizizz...).'
      );
      return;
    }

    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim().slice(0, 50))
      .filter(Boolean)
      .slice(0, 10);

    setSubmitting(true);
    try {
      const isEditingAiGame = isEditing && editingMaterial?.loaiNguon === 'troChoi';
      const payload: MaterialInput = {
        tieuDe: cleanTitle,
        moTa,
        monHoc,
        khoiLop,
        loai,
        the: parsedTags,
        loaiNguon: isEditingAiGame ? 'troChoi' : 'lienKet',
        url: isEditingAiGame ? editingMaterial.url : finalUrl,
        tenTep: '',
        kichThuocTep: 0,
        duongDanStorage: '',
        toKhoi,
        trangThai: targetStatus,
        ...(isEditingAiGame
          ? {
              htmlTroChoi: editingMaterial.htmlTroChoi,
              maChiaSe: editingMaterial.maChiaSe,
              chiaSeLink: editingMaterial.chiaSeLink,
              dangTroChoi: editingMaterial.dangTroChoi,
            }
          : {}),
      };

      if (isEditing && editingMaterial) {
        await updateMaterial(editingMaterial.id, payload, profile);
      } else {
        await createMaterial(profile, payload);
      }

      showFirebaseAlert(
        true,
        targetStatus === 'daDuyet'
          ? `Học liệu "${cleanTitle}" đã được duyệt và đăng thẳng lên Kho học liệu của ${toKhoi}.`
          : targetStatus === 'choDuyet'
            ? `Học liệu "${cleanTitle}" đã được lưu lên Firestore và gửi Tổ trưởng duyệt.`
            : `Học liệu "${cleanTitle}" đã được lưu vào Bản nháp trên Firestore.`
      );
      onSuccess(targetStatus === 'daDuyet');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(`Không thể lưu học liệu lên Firebase: ${msg}`);
      showFirebaseAlert(false, err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="p-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          aria-label="Quay lại"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            {isEditing ? 'Chỉnh sửa học liệu' : 'Tải học liệu mới lên kho'}
          </h1>
          <p className="text-[15px] text-slate-600">
            Dán liên kết Google Drive, YouTube, Canva, Quizizz... để lưu trữ và chia sẻ học liệu nhanh chóng.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 space-y-6">
        {formError && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-sm font-medium text-rose-800">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>{formError}</p>
          </div>
        )}

        {editingMaterial?.trangThai === 'tuChoi' && editingMaterial.lyDoTuChoi && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
            <span className="font-bold">Góp ý chỉnh sửa trước đó: </span>
            {editingMaterial.lyDoTuChoi}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="mat-title" className="block text-sm font-semibold text-slate-800 mb-1.5">
              Tiêu đề học liệu <span className="text-rose-600">*</span>
            </label>
            <input
              id="mat-title"
              type="text"
              maxLength={200}
              value={tieuDe}
              onChange={(e) => setTieuDe(e.target.value)}
              placeholder="Ví dụ: Bài giảng Toán 3 - Phép chia hết và phép chia có dư"
              className="w-full min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 text-base text-slate-900 focus:outline-none focus:border-teal-700"
            />
          </div>

          <div>
            <label htmlFor="mat-desc" className="block text-sm font-semibold text-slate-800 mb-1.5">
              Mô tả ngắn nội dung &amp; hướng dẫn sử dụng
            </label>
            <textarea
              id="mat-desc"
              rows={3}
              maxLength={2000}
              value={moTa}
              onChange={(e) => setMoTa(e.target.value)}
              placeholder="Ghi chú ngắn về mục tiêu bài học, bộ sách (Kết nối tri thức / Cánh diều...), lưu ý khi trình chiếu..."
              className="w-full px-4 py-3 rounded-xl border border-slate-300 text-[15px] text-slate-900 focus:outline-none focus:border-teal-700"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mat-subject" className="block text-sm font-semibold text-slate-800 mb-1.5">
                Môn học <span className="text-rose-600">*</span>
              </label>
              <select
                id="mat-subject"
                value={monHoc}
                onChange={(e) => setMonHoc(e.target.value)}
                className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-base text-slate-900 focus:outline-none focus:border-teal-700"
              >
                {activeSubjects.map((s) => (
                  <option key={s.id} value={s.ten}>
                    {s.ten}
                  </option>
                ))}
                {!activeSubjects.some((s) => s.ten === monHoc) && (
                  <option value={monHoc}>{monHoc}</option>
                )}
              </select>
            </div>

            <div>
              <label htmlFor="mat-grade" className="block text-sm font-semibold text-slate-800 mb-1.5">
                Khối lớp <span className="text-rose-600">*</span>
              </label>
              <select
                id="mat-grade"
                value={khoiLop}
                onChange={(e) => setKhoiLop(e.target.value as GradeLevel)}
                className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-base text-slate-900 focus:outline-none focus:border-teal-700"
              >
                {GRADE_LEVELS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="mat-type" className="block text-sm font-semibold text-slate-800 mb-1.5">
                Loại học liệu <span className="text-rose-600">*</span>
              </label>
              <select
                id="mat-type"
                value={loai}
                onChange={(e) => setLoai(e.target.value as MaterialCategory)}
                className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-base text-slate-900 focus:outline-none focus:border-teal-700"
              >
                {MATERIAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="mat-dept" className="block text-sm font-semibold text-slate-800 mb-1.5">
                Tổ khối duyệt bài <span className="text-rose-600">*</span>
              </label>
              <select
                id="mat-dept"
                value={toKhoi}
                onChange={(e) => setToKhoi(e.target.value)}
                className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-base text-slate-900 focus:outline-none focus:border-teal-700"
              >
                {activeDepartments.map((d) => (
                  <option key={d.id} value={d.ten}>
                    {d.ten}
                  </option>
                ))}
                {!activeDepartments.some((d) => d.ten === toKhoi) && (
                  <option value={toKhoi}>{toKhoi}</option>
                )}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="mat-tags" className="block text-sm font-semibold text-slate-800 mb-1.5">
              Thẻ từ khóa (ngăn cách bằng dấu phẩy, tối đa 10 thẻ)
            </label>
            <input
              id="mat-tags"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Ví dụ: toan-3, tuan-12, ket-noi-tri-thuc, tro-choi"
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 text-[15px] text-slate-900 focus:outline-none focus:border-teal-700"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200">
          <div>
            <label htmlFor="mat-url" className="block text-sm font-semibold text-slate-800 mb-1.5">
              {isEditing && editingMaterial?.loaiNguon === 'troChoi'
                ? 'Đường dẫn trò chơi AI dành cho học sinh'
                : 'Đường dẫn học liệu (Google Drive, YouTube, Canva, Quizizz...)'}{' '}
              <span className="text-rose-600">*</span>
            </label>
            <input
              id="mat-url"
              type="url"
              required
              readOnly={isEditing && editingMaterial?.loaiNguon === 'troChoi'}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/... hoặc https://www.youtube.com/watch?v=..."
              className={`w-full min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 text-[15px] focus:outline-none focus:border-teal-700 ${
                isEditing && editingMaterial?.loaiNguon === 'troChoi'
                  ? 'bg-slate-100 text-slate-600 cursor-not-allowed'
                  : 'text-slate-900'
              }`}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              {isEditing && editingMaterial?.loaiNguon === 'troChoi'
                ? 'Đường dẫn trò chơi AI được tạo tự động để học sinh mở chơi không cần đăng nhập.'
                : 'Mẹo: Với Google Drive, thầy/cô nhớ bật chế độ chia sẻ "Bất kỳ ai có đường liên kết đều có thể xem" để đồng nghiệp mở được ngay.'}
            </p>
          </div>
        </div>

        {canInstantApprove && (
          <div className="rounded-xl border border-teal-300 bg-teal-50/80 p-4">
            <label className="flex items-start sm:items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={instantApprove}
                onChange={(e) => setInstantApprove(e.target.checked)}
                className="mt-0.5 sm:mt-0 w-5 h-5 accent-teal-700 rounded cursor-pointer shrink-0"
              />
              <span className="text-[15px] font-bold text-teal-950 leading-snug">
                Xác nhận đã kiểm duyệt bài (Đăng thẳng lên Kho học liệu của tổ)
              </span>
            </label>
            <p className="mt-1 pl-8 text-xs text-teal-800">
              Dành cho Tổ trưởng chuyên môn, Ban Giám Hiệu hoặc Quản trị viên để đăng trực tiếp không cần qua bước Chờ duyệt.
            </p>
          </div>
        )}

        <div className="pt-4 border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="min-h-[48px] px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={() => handleSave('nhap')}
            disabled={submitting}
            className="min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-teal-700 bg-white text-teal-800 text-sm font-bold hover:bg-teal-50 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            Lưu bản nháp
          </button>
          <button
            type="button"
            onClick={() => handleSave(canInstantApprove && instantApprove ? 'daDuyet' : 'choDuyet')}
            disabled={submitting}
            className="min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-60"
          >
            {canInstantApprove && instantApprove ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {submitting
              ? 'Đang lưu...'
              : canInstantApprove && instantApprove
                ? 'Lưu & Duyệt bài ngay'
                : 'Gửi tổ trưởng duyệt'}
          </button>
        </div>
      </div>
    </div>
  );
}
