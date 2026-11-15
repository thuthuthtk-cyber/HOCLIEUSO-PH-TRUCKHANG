import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileEdit,
  FileText,
  Gamepad2,
  Globe,
  Link2,
  Link2Off,
  Loader2,
  Presentation,
  QrCode,
  Square,
} from 'lucide-react';
import { STATUS_LABELS, type LearningMaterial, type MaterialStatus } from '../types/hocLieu';
import { formatDateVi, formatFileSize } from '../lib/utils';
import { buildStudentGameUrl, copyTextToClipboard } from '../utils/shareCode';
import { reconstructSlidesFromSavedMaterial } from '../services/aiPptService';
import { exportDeckToPptx } from '../utils/pptExport';
import { useToast } from './ToastContext';

interface HocLieuCardProps {
  material: LearningMaterial;
  onView: (material: LearningMaterial) => void;
  onDownload: (material: LearningMaterial) => void;
  onExportQr?: (material: LearningMaterial) => void;
  canToggleShareLink?: boolean;
  onToggleShareLink?: (material: LearningMaterial) => void;
  togglingShare?: boolean;
  selected?: boolean;
  onToggleSelect?: (material: LearningMaterial) => void;
  showStatus?: boolean;
  actions?: React.ReactNode;
}

export function StatusIndicator({ status }: { status: MaterialStatus }) {
  switch (status) {
    case 'chiaSeToanTruong':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-800 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200 whitespace-nowrap">
          <Globe className="w-3.5 h-3.5 shrink-0" />
          {STATUS_LABELS[status]}
        </span>
      );
    case 'daDuyet':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          {STATUS_LABELS[status]}
        </span>
      );
    case 'choDuyet':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          {STATUS_LABELS[status]}
        </span>
      );
    case 'tuChoi':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-800 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200 whitespace-nowrap">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {STATUS_LABELS[status]}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 whitespace-nowrap">
          <FileEdit className="w-3.5 h-3.5 shrink-0" />
          {STATUS_LABELS[status]}
        </span>
      );
  }
}

export function HocLieuCard({
  material,
  onView,
  onDownload,
  onExportQr,
  canToggleShareLink = false,
  onToggleShareLink,
  togglingShare = false,
  selected = false,
  onToggleSelect,
  showStatus = true,
  actions,
}: HocLieuCardProps) {
  const { showToast } = useToast();
  const [downloadingPpt, setDownloadingPpt] = useState(false);
  const gradeLabel = material.khoiLop === 'Dùng chung' ? 'Dùng chung' : `Khối ${material.khoiLop}`;
  const isAiGame = material.loaiNguon === 'troChoi';
  const isPptAi =
    material.loaiNguon === 'pptAi' || material.loai === 'Bài giảng PPT AI';
  const studentUrl =
    isAiGame && material.maChiaSe
      ? buildStudentGameUrl(material.maChiaSe)
      : material.url;
  const shareEnabled = material.chiaSeLink === true;

  async function handleDownloadSavedPpt() {
    setDownloadingPpt(true);
    try {
      const slides = reconstructSlidesFromSavedMaterial(material);
      const fileName = await exportDeckToPptx({
        deckTitle: material.tieuDe,
        subtitle:
          material.pptConfig?.subtitle || `Môn ${material.monHoc} · ${gradeLabel}`,
        monHoc: material.monHoc,
        khoiLop: material.khoiLop === 'Dùng chung' ? '3' : material.khoiLop,
        defaultStyleId: material.pptConfig?.styleId || 'hoat_hinh_3d',
        slides,
      });
      onDownload(material);
      showToast(`Đã tải xuống ${fileName}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể xuất file PowerPoint.';
      showToast(`Lỗi xuất PPTX: ${msg}`, 'error');
    } finally {
      setDownloadingPpt(false);
    }
  }

  async function handleCopyGameLink() {
    const ok = await copyTextToClipboard(studentUrl);
    if (ok) {
      showToast('Đã sao chép link học sinh vào bộ nhớ tạm.', 'success');
    } else {
      showToast('Không thể sao chép liên kết tự động.', 'error');
    }
  }

  return (
    <article
      className={`flex flex-col justify-between bg-white rounded-2xl border p-5 transition-colors ${
        selected
          ? 'border-teal-600 ring-2 ring-teal-600/15'
          : 'border-slate-200 hover:border-teal-300'
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2 text-xs font-medium text-slate-500">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-teal-700 font-semibold">{material.monHoc}</span>
            <span aria-hidden="true">·</span>
            <span>{gradeLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{material.loai}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {material.isSample && (
              <span className="text-[11px] font-semibold text-slate-500">Dữ liệu mẫu</span>
            )}
            {onToggleSelect && (
              <button
                type="button"
                onClick={() => onToggleSelect(material)}
                aria-label={selected ? 'Bỏ chọn học liệu' : 'Chọn học liệu để xuất mã QR'}
                aria-pressed={selected}
                title={selected ? 'Bỏ chọn xuất phiếu QR' : 'Chọn vào danh sách xuất phiếu QR'}
                className={`p-1 rounded-lg transition-colors ${
                  selected
                    ? 'text-teal-700 bg-teal-50 hover:bg-teal-100'
                    : 'text-slate-400 hover:text-teal-700 hover:bg-slate-100'
                }`}
              >
                {selected ? (
                  <CheckSquare className="w-4 h-4" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>

        <h3 className="mt-2.5 text-[18px] font-bold text-slate-900 leading-snug line-clamp-2">
          <button
            type="button"
            onClick={() => onView(material)}
            className="text-left hover:text-teal-700 transition-colors focus-visible:outline-2 focus-visible:outline-teal-700 rounded"
          >
            {material.tieuDe}
          </button>
        </h3>

        {material.tenBaiHoc && (
          <p className="mt-1.5 text-xs font-semibold text-teal-800 truncate">
            Bài học: {material.tenBaiHoc}
          </p>
        )}

        <p className="mt-2 text-[15px] text-slate-600 leading-relaxed line-clamp-2">
          {material.moTa || 'Chưa có mô tả chi tiết cho học liệu này.'}
        </p>

        {material.the.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-2.5 gap-y-1 text-xs font-medium text-slate-500">
            {material.the.slice(0, 5).map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        )}

        {material.trangThai === 'tuChoi' && material.lyDoTuChoi && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
            <span className="font-semibold">Lý do cần sửa: </span>
            {material.lyDoTuChoi}
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {showStatus ? <StatusIndicator status={material.trangThai} /> : <span />}
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            {isPptAi ? (
              <>
                <Presentation className="w-3.5 h-3.5 text-teal-700" />
                <span>
                  Bài giảng PPT AI ({material.slidesData?.length || 0} slide)
                </span>
              </>
            ) : isAiGame ? (
              <>
                <Gamepad2 className="w-3.5 h-3.5 text-teal-700" />
                <span>
                  Trò chơi AI{material.dangTroChoi ? ` (${material.dangTroChoi})` : ''}
                </span>
              </>
            ) : material.loaiNguon === 'tep' ? (
              <>
                <FileText className="w-3.5 h-3.5 text-teal-700" />
                <span>Tệp ({formatFileSize(material.kichThuocTep)})</span>
              </>
            ) : (
              <>
                <Link2 className="w-3.5 h-3.5 text-teal-700" />
                <span>Liên kết ngoài</span>
              </>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="truncate max-w-[65%]">
            <span className="font-semibold text-slate-700">{material.nguoiDangTen}</span>
            <span aria-hidden="true"> · </span>
            <span>{material.toKhoi}</span>
            <span aria-hidden="true"> · </span>
            <span className="tabular-nums">{formatDateVi(material.ngayTao)}</span>
          </div>
          <div className="flex items-center gap-3 tabular-nums font-mono text-xs text-slate-600">
            <span className="inline-flex items-center gap-1" title="Lượt xem">
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              {material.luotXem}
            </span>
            {onExportQr ? (
              <button
                type="button"
                onClick={() => onExportQr(material)}
                title="Lượt tải (bấm để tải về / xuất phiếu Mã QR)"
                className="inline-flex items-center gap-1 hover:text-teal-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                {material.luotTai}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1" title="Lượt tải">
                <Download className="w-3.5 h-3.5 text-slate-400" />
                {material.luotTai}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => onView(material)}
            className="flex-1 min-w-[124px] min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 transition-colors whitespace-nowrap"
          >
            {isPptAi ? (
              <>
                <Presentation className="w-4 h-4 shrink-0" />
                Xem & trình chiếu
              </>
            ) : isAiGame ? (
              <>
                <Gamepad2 className="w-4 h-4 shrink-0" />
                Chơi thử
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 shrink-0" />
                Xem học liệu
              </>
            )}
          </button>

          {isPptAi && material.slidesData && material.slidesData.length > 0 ? (
            <button
              type="button"
              disabled={downloadingPpt}
              onClick={() => void handleDownloadSavedPpt()}
              className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-orange-200 bg-orange-50 text-orange-800 text-sm font-semibold hover:bg-orange-100 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {downloadingPpt ? (
                <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
              ) : (
                <Download className="w-4 h-4 shrink-0" />
              )}
              Tải .pptx
            </button>
          ) : (
            (!isAiGame || shareEnabled) && (
              <a
                href={studentUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={material.loaiNguon === 'tep' ? material.tenTep || true : undefined}
                onClick={() => onDownload(material)}
                className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                {material.loaiNguon === 'tep' ? (
                  <>
                    <Download className="w-4 h-4 shrink-0 text-teal-700" />
                    Tải về
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4 shrink-0 text-teal-700" />
                    {isAiGame ? 'Mở link học sinh' : 'Mở liên kết'}
                  </>
                )}
              </a>
            )
          )}

          {onExportQr && (
            <button
              type="button"
              onClick={() => onExportQr(material)}
              title="Xuất phiếu học liệu kèm Mã QR"
              className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-teal-200 bg-teal-50 text-teal-800 text-sm font-semibold hover:bg-teal-100 transition-colors whitespace-nowrap"
            >
              <QrCode className="w-4 h-4 shrink-0" />
              Tải về / Mã QR
            </button>
          )}
        </div>

        {isAiGame && material.maChiaSe && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyGameLink}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              Sao chép link học sinh
            </button>

            {canToggleShareLink && onToggleShareLink ? (
              <button
                type="button"
                disabled={togglingShare}
                onClick={() => onToggleShareLink(material)}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-60 ${
                  shareEnabled
                    ? 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
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
            ) : (
              !shareEnabled && (
                <span className="text-xs font-medium text-slate-500">
                  Link học sinh đang tắt
                </span>
              )
            )}
          </div>
        )}

        {actions && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">{actions}</div>
        )}
      </div>
    </article>
  );
}

