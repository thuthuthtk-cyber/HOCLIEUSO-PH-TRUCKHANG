import { useState } from 'react';
import {
  Calendar,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  Link2,
  Link2Off,
  Loader2,
  User,
  X,
} from 'lucide-react';
import type { LearningMaterial } from '../types/hocLieu';
import {
  detectLinkProviderName,
  formatDateVi,
  formatFileSize,
  resolvePreviewSource,
} from '../lib/utils';
import { buildStudentGameUrl, copyTextToClipboard } from '../utils/shareCode';
import { reconstructSlidesFromSavedMaterial } from '../services/aiPptService';
import { exportDeckToPptx } from '../utils/pptExport';
import { StatusIndicator } from './HocLieuCard';
import { SavedPptViewer } from './ppt/SavedPptViewer';
import { useToast } from './ToastContext';

interface MaterialPreviewModalProps {
  material: LearningMaterial | null;
  onClose: () => void;
  onDownload: (material: LearningMaterial) => void;
  canToggleShareLink?: boolean;
  onToggleShareLink?: (material: LearningMaterial) => void;
  togglingShare?: boolean;
}

export function MaterialPreviewModal({
  material,
  onClose,
  onDownload,
  canToggleShareLink = false,
  onToggleShareLink,
  togglingShare = false,
}: MaterialPreviewModalProps) {
  const { showToast } = useToast();
  const [downloadingPpt, setDownloadingPpt] = useState(false);
  if (!material) return null;

  const isAiGame = material.loaiNguon === 'troChoi';
  const isPptAi =
    material.loaiNguon === 'pptAi' || material.loai === 'Bài giảng PPT AI';
  const studentUrl =
    isAiGame && material.maChiaSe
      ? buildStudentGameUrl(material.maChiaSe)
      : material.url;
  const shareEnabled = material.chiaSeLink === true;
  const preview = resolvePreviewSource(material.url, material.loaiNguon, material.tenTep);
  const gradeLabel = material.khoiLop === 'Dùng chung' ? 'Dùng chung' : `Khối ${material.khoiLop}`;

  async function handleDownloadSavedPpt(target: LearningMaterial) {
    setDownloadingPpt(true);
    try {
      const slides = reconstructSlidesFromSavedMaterial(target);
      const fileName = await exportDeckToPptx({
        deckTitle: target.tieuDe,
        subtitle:
          target.pptConfig?.subtitle || `Môn ${target.monHoc} · ${gradeLabel}`,
        monHoc: target.monHoc,
        khoiLop: target.khoiLop === 'Dùng chung' ? '3' : target.khoiLop,
        defaultStyleId: target.pptConfig?.styleId || 'hoat_hinh_3d',
        slides,
      });
      onDownload(target);
      showToast(`Đã xuất lại file ${fileName}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể xuất file PowerPoint.';
      showToast(`Lỗi xuất PPTX: ${msg}`, 'error');
    } finally {
      setDownloadingPpt(false);
    }
  }

  async function handleCopyStudentUrl() {
    const ok = await copyTextToClipboard(studentUrl);
    if (ok) {
      showToast('Đã sao chép link học sinh vào bộ nhớ tạm.', 'success');
    } else {
      showToast('Không thể sao chép liên kết tự động.', 'error');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
    >
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200 bg-white">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
              <span className="text-teal-700 font-semibold">{material.monHoc}</span>
              <span aria-hidden="true">·</span>
              <span>{gradeLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{material.loai}</span>
              {isAiGame && material.dangTroChoi && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-teal-800 font-semibold">{material.dangTroChoi}</span>
                </>
              )}
            </div>
            <h2
              id="preview-modal-title"
              className="mt-1 text-xl font-bold text-slate-900 leading-snug"
            >
              {material.tieuDe}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng xem trước"
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Khu vực xem trước */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
            {isPptAi && material.slidesData && material.slidesData.length > 0 ? (
              <SavedPptViewer material={material} />
            ) : isAiGame && material.htmlTroChoi ? (
              <iframe
                srcDoc={material.htmlTroChoi}
                title={material.tieuDe}
                sandbox="allow-scripts"
                className="w-full h-[500px] border-0 bg-white"
              />
            ) : preview.kind === 'youtube' || preview.kind === 'gdrive' || preview.kind === 'pdf' ? (
              <div className="aspect-video w-full bg-slate-900">
                <iframe
                  src={preview.embedUrl}
                  title={material.tieuDe}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : preview.kind === 'image' ? (
              <div className="flex items-center justify-center bg-slate-100 p-4 max-h-[460px]">
                <img
                  src={preview.embedUrl}
                  alt={material.tieuDe}
                  referrerPolicy="no-referrer"
                  className="max-h-[420px] w-auto rounded-lg object-contain"
                />
              </div>
            ) : preview.kind === 'video' ? (
              <div className="bg-black">
                <video
                  src={preview.embedUrl}
                  controls
                  className="w-full max-h-[460px] mx-auto"
                >
                  Trình duyệt không hỗ trợ phát video trực tiếp.
                </video>
              </div>
            ) : (
              <div className="p-8 text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-900">
                    {material.loaiNguon === 'tep'
                      ? material.tenTep || 'Tệp học liệu đính kèm'
                      : `Học liệu từ ${detectLinkProviderName(material.url)}`}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 max-w-lg mx-auto">
                    Định dạng này không hỗ trợ nhúng xem trực tiếp trong khung trình duyệt. Thầy/cô vui lòng bấm nút bên dưới để mở hoặc tải về máy.
                  </p>
                </div>
              </div>
            )}
          </div>

          {isAiGame && material.maChiaSe && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-teal-900">
                  Link chia sẻ cho học sinh (mở chơi không cần đăng nhập):
                </p>
                <p className="mt-0.5 text-xs font-mono text-slate-700 truncate">
                  {studentUrl}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyStudentUrl}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-bold hover:bg-teal-800"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Sao chép link học sinh
                </button>
                {canToggleShareLink && onToggleShareLink && (
                  <button
                    type="button"
                    disabled={togglingShare}
                    onClick={() => onToggleShareLink(material)}
                    className={`min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold disabled:opacity-60 ${
                      shareEnabled
                        ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                        : 'border-teal-300 bg-white text-teal-800 hover:bg-teal-50'
                    }`}
                  >
                    {shareEnabled ? (
                      <>
                        <Link2Off className="w-3.5 h-3.5" />
                        Tắt chia sẻ link
                      </>
                    ) : (
                      <>
                        <Link2 className="w-3.5 h-3.5" />
                        Bật chia sẻ link
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Thông tin chi tiết */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-2 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <StatusIndicator status={material.trangThai} />
                {material.the.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-500">
                    {material.the.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                )}
              </div>

              {material.tenBaiHoc && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">
                    Tên bài học / nội dung kiến thức
                  </h3>
                  <p className="mt-1 text-[15px] font-medium text-teal-900">
                    {material.tenBaiHoc}
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-slate-700">Mô tả học liệu</h3>
                <p className="mt-1 text-[15px] text-slate-700 leading-relaxed whitespace-pre-line">
                  {material.moTa || 'Không có mô tả chi tiết.'}
                </p>
              </div>

              {material.trangThai === 'tuChoi' && material.lyDoTuChoi && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
                  <span className="font-semibold">Ghi chú từ Tổ trưởng / Quản trị: </span>
                  {material.lyDoTuChoi}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-sm">
              <div className="flex items-center gap-2.5 text-slate-700">
                <User className="w-4 h-4 text-teal-700 shrink-0" />
                <div>
                  <div className="text-xs text-slate-500">Người đăng</div>
                  <div className="font-semibold text-slate-900">{material.nguoiDangTen}</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 text-slate-700">
                <FolderOpen className="w-4 h-4 text-teal-700 shrink-0" />
                <div>
                  <div className="text-xs text-slate-500">Tổ khối</div>
                  <div className="font-semibold text-slate-900">{material.toKhoi}</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 text-slate-700">
                <Calendar className="w-4 h-4 text-teal-700 shrink-0" />
                <div>
                  <div className="text-xs text-slate-500">Ngày đăng</div>
                  <div className="font-semibold text-slate-900 tabular-nums">
                    {formatDateVi(material.ngayTao)}
                  </div>
                </div>
              </div>

              {material.nguoiDuyetTen && (
                <div className="pt-2 border-t border-slate-200 text-xs text-slate-600">
                  Người duyệt: <span className="font-semibold">{material.nguoiDuyetTen}</span> (
                  <span className="tabular-nums">{formatDateVi(material.ngayDuyet)}</span>)
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 tabular-nums font-mono">
                <span className="inline-flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" /> {material.luotXem} lượt xem
                </span>
                <span className="inline-flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" /> {material.luotTai} lượt tải
                </span>
              </div>

              {material.loaiNguon === 'tep' && (
                <div className="text-xs text-slate-500">
                  Tệp: {material.tenTep} ({formatFileSize(material.kichThuocTep)})
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-100 transition-colors"
          >
            Đóng
          </button>
          {isPptAi && material.slidesData && material.slidesData.length > 0 ? (
            <button
              type="button"
              disabled={downloadingPpt}
              onClick={() => void handleDownloadSavedPpt(material)}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-orange-600 text-white text-sm font-bold hover:bg-orange-700 disabled:opacity-60 transition-colors"
            >
              {downloadingPpt ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang tạo file .pptx...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Tải lại file PowerPoint (.pptx)
                </>
              )}
            </button>
          ) : (
            (!isAiGame || shareEnabled) && (
              <a
                href={studentUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={material.loaiNguon === 'tep' ? material.tenTep || true : undefined}
                onClick={() => onDownload(material)}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 transition-colors"
              >
                {material.loaiNguon === 'tep' ? (
                  <>
                    <Download className="w-4 h-4" />
                    Tải tệp về máy
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    {isAiGame ? 'Mở link học sinh' : 'Mở trong thẻ mới'}
                  </>
                )}
              </a>
            )
          )}
        </div>
      </div>
    </div>
  );
}
