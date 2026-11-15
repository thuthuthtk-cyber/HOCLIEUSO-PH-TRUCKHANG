import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
  QrCode,
  X,
} from 'lucide-react';
import type { LearningMaterial } from '../types/hocLieu';
import {
  exportMaterialsToExcel,
  exportMaterialsToWord,
} from '../utils/documentExport';
import {
  downloadBatchQrSheetImage,
  downloadSingleQrImage,
  getQrCodeImageUrl,
} from '../utils/qrExport';
import { useToast } from './ToastContext';

interface MaterialExportModalProps {
  materials: LearningMaterial[];
  onClose: () => void;
  onExportDownload?: (materials: LearningMaterial[]) => void;
}

export function MaterialExportModal({
  materials,
  onClose,
  onExportDownload,
}: MaterialExportModalProps) {
  const { showToast } = useToast();
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [downloadingItemId, setDownloadingItemId] = useState<string | null>(null);

  if (materials.length === 0) return null;

  const todayFormatted = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());

  async function handleDownloadAllQr() {
    setDownloadingAll(true);
    try {
      await downloadBatchQrSheetImage(materials);
      onExportDownload?.(materials);
      showToast(
        materials.length === 1
          ? 'Đã tải ảnh Mã QR về máy thành công!'
          : `Đã tải bảng ảnh Mã QR (${materials.length} học liệu) thành công!`,
        'success'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải ảnh Mã QR.';
      showToast(`Lỗi tải ảnh Mã QR: ${msg}`, 'error');
    } finally {
      setDownloadingAll(false);
    }
  }

  async function handleDownloadRowQr(material: LearningMaterial) {
    setDownloadingItemId(material.id);
    try {
      await downloadSingleQrImage(material);
      onExportDownload?.([material]);
      showToast(`Đã tải ảnh Mã QR cho "${material.tieuDe}".`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải ảnh Mã QR.';
      showToast(`Lỗi tải ảnh Mã QR: ${msg}`, 'error');
    } finally {
      setDownloadingItemId(null);
    }
  }

  async function handleExportExcel() {
    setExportingExcel(true);
    try {
      const fileName = await exportMaterialsToExcel(materials);
      onExportDownload?.(materials);
      showToast(`Đã xuất tệp Excel "${fileName}" thành công!`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể xuất tệp Excel.';
      showToast(`Lỗi xuất Excel: ${msg}`, 'error');
    } finally {
      setExportingExcel(false);
    }
  }

  async function handleExportWord() {
    setExportingWord(true);
    try {
      const fileName = await exportMaterialsToWord(materials);
      onExportDownload?.(materials);
      showToast(`Đã xuất tệp Word "${fileName}" thành công!`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể xuất tệp Word.';
      showToast(`Lỗi xuất Word: ${msg}`, 'error');
    } finally {
      setExportingWord(false);
    }
  }

  const anyExportBusy = downloadingAll || exportingExcel || exportingWord;

  return createPortal(
    <div
      id="export-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-3 sm:p-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div
        id="export-modal-shell"
        className="w-full max-w-5xl max-h-[94vh] flex flex-col rounded-2xl bg-slate-100 border border-slate-200 shadow-2xl overflow-hidden"
      >
        {/* Thanh công cụ điều khiển (ẩn khi in) */}
        <div
          data-print-hidden="true"
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-white"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="export-modal-title"
                className="text-lg font-extrabold text-slate-900 truncate"
              >
                Xem trước phiếu học liệu &amp; Mã QR (Khổ A4)
              </h2>
              <p className="text-xs text-slate-600 tabular-nums">
                Đang xuất {materials.length} học liệu · Quét mã QR bằng điện thoại để mở thẳng học liệu
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={anyExportBusy}
              className="min-h-[42px] inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-emerald-700 bg-emerald-50 text-emerald-800 text-sm font-bold hover:bg-emerald-100 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {exportingExcel ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              {exportingExcel ? 'Đang xuất...' : 'Xuất Excel'}
            </button>

            <button
              type="button"
              onClick={handleExportWord}
              disabled={anyExportBusy}
              className="min-h-[42px] inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-sky-700 bg-sky-50 text-sky-800 text-sm font-bold hover:bg-sky-100 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {exportingWord ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              {exportingWord ? 'Đang xuất...' : 'Xuất Word'}
            </button>

            <button
              type="button"
              onClick={handleDownloadAllQr}
              disabled={anyExportBusy}
              className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-teal-700 bg-white text-teal-800 text-sm font-bold hover:bg-teal-50 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {downloadingAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {downloadingAll ? 'Đang tạo ảnh...' : 'Tải ảnh Mã QR'}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng cửa sổ xuất phiếu"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Khung xem trước trang A4 */}
        <div id="export-modal-scroll" className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div
            id="a4-export-sheet"
            className="mx-auto w-full max-w-[794px] bg-white border border-slate-300 shadow-sm rounded-lg p-6 sm:p-9 text-slate-900"
          >
            {/* Quốc hiệu / Tiêu đề trường học chuẩn văn bản */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b-2 border-slate-800">
              <div>
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Trường Tiểu học Quang Hưng · Phân hiệu Trực Khang
                </p>
                <h3 className="mt-1 text-xl font-extrabold text-slate-900">
                  PHIẾU DANH MỤC HỌC LIỆU SỐ KÈM MÃ QR
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  Dùng camera điện thoại hoặc Zalo quét mã QR để mở trực tiếp tài liệu giảng dạy.
                </p>
              </div>
              <div className="text-left sm:text-right text-xs text-slate-600 tabular-nums shrink-0">
                <p>
                  Ngày xuất phiếu: <span className="font-semibold text-slate-900">{todayFormatted}</span>
                </p>
                <p className="mt-0.5">
                  Tổng số học liệu:{' '}
                  <span className="font-bold text-slate-900">{materials.length}</span>
                </p>
              </div>
            </div>

            {/* Bảng 5 cột chuẩn khổ A4 */}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full border-collapse border border-slate-400 text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-900">
                    <th className="border border-slate-400 px-2.5 py-2.5 text-center font-bold w-12">
                      STT
                    </th>
                    <th className="border border-slate-400 px-3 py-2.5 text-left font-bold min-w-[180px]">
                      Tiêu đề học liệu
                    </th>
                    <th className="border border-slate-400 px-3 py-2.5 text-left font-bold w-36">
                      Loại học liệu
                    </th>
                    <th className="border border-slate-400 px-3 py-2.5 text-left font-bold min-w-[160px]">
                      Đường dẫn học liệu
                    </th>
                    <th className="border border-slate-400 px-2.5 py-2.5 text-center font-bold w-[132px]">
                      Mã QR của học liệu
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((item, idx) => {
                    const gradeLabel =
                      item.khoiLop === 'Dùng chung' ? 'Dùng chung' : `Khối ${item.khoiLop}`;
                    const qrSrc = getQrCodeImageUrl(item.url, 150);
                    const isDownloadingRow = downloadingItemId === item.id;

                    return (
                      <tr key={item.id} className="align-middle break-inside-avoid">
                        <td className="border border-slate-400 px-2.5 py-3 text-center font-bold tabular-nums text-slate-800">
                          {idx + 1}
                        </td>

                        <td className="border border-slate-400 px-3 py-3">
                          <div className="font-bold text-slate-900 leading-snug">
                            {item.tieuDe}
                          </div>
                          <div className="mt-1.5 text-xs text-slate-600">
                            <span className="font-semibold text-teal-800">Môn: {item.monHoc}</span>
                            <span aria-hidden="true"> · </span>
                            <span className="font-semibold text-slate-700">{gradeLabel}</span>
                          </div>
                        </td>

                        <td className="border border-slate-400 px-3 py-3 text-slate-800 font-medium">
                          {item.loai}
                        </td>

                        <td className="border border-slate-400 px-3 py-3 text-xs">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-start gap-1 text-teal-800 hover:text-teal-950 underline break-all font-mono leading-relaxed"
                          >
                            <span>{item.url}</span>
                            <ExternalLink
                              data-print-hidden="true"
                              className="w-3 h-3 shrink-0 mt-0.5"
                            />
                          </a>
                        </td>

                        <td className="border border-slate-400 px-2.5 py-2.5 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                            <img
                              src={qrSrc}
                              alt={`Mã QR cho ${item.tieuDe}`}
                              width={100}
                              height={100}
                              referrerPolicy="no-referrer"
                              className="w-[100px] h-[100px] object-contain border border-slate-200 rounded bg-white p-1"
                            />
                            <button
                              type="button"
                              data-print-hidden="true"
                              disabled={isDownloadingRow}
                              onClick={() => handleDownloadRowQr(item)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900 disabled:opacity-50"
                            >
                              {isDownloadingRow ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Download className="w-3 h-3" />
                              )}
                              Tải QR
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>Hệ thống Kho Học Liệu Số · Trường Tiểu học Quang Hưng</span>
              <span className="tabular-nums">Tổng cộng: {materials.length} mục</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
