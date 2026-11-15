import { CheckSquare, Download, QrCode, Square, X } from 'lucide-react';

interface MaterialExportToolbarProps {
  totalVisible: number;
  selectedCount: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  onExportSelected: () => void;
}

export function MaterialExportToolbar({
  totalVisible,
  selectedCount,
  allSelected,
  onToggleSelectAll,
  onClearSelection,
  onExportSelected,
}: MaterialExportToolbarProps) {
  if (totalVisible === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={onToggleSelectAll}
          className="inline-flex items-center gap-2 font-semibold text-slate-700 hover:text-teal-700 transition-colors"
        >
          {allSelected ? (
            <CheckSquare className="w-4 h-4 text-teal-700 shrink-0" />
          ) : (
            <Square className="w-4 h-4 text-slate-400 shrink-0" />
          )}
          <span>{allSelected ? 'Bỏ chọn tất cả' : `Chọn tất cả (${totalVisible})`}</span>
        </button>

        {selectedCount > 0 ? (
          <>
            <span className="text-slate-300" aria-hidden="true">
              |
            </span>
            <span className="font-semibold text-teal-800 tabular-nums">
              Đã chọn {selectedCount} học liệu
            </span>
            <button
              type="button"
              onClick={onClearSelection}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              <X className="w-3.5 h-3.5" />
              Bỏ chọn
            </button>
          </>
        ) : (
          <span className="text-xs text-slate-500">
            Tích chọn nhiều học liệu để ghép chung thành 1 phiếu danh mục &amp; Mã QR.
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onExportSelected}
        className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-teal-700 bg-teal-50 text-teal-800 text-sm font-bold hover:bg-teal-100 transition-colors whitespace-nowrap shrink-0"
      >
        <QrCode className="w-4 h-4 shrink-0" />
        <Download className="w-3.5 h-3.5 shrink-0 -ml-1" />
        {selectedCount > 0
          ? `Xuất danh mục & Mã QR (${selectedCount})`
          : `Xuất danh mục & Mã QR (${totalVisible})`}
      </button>
    </div>
  );
}
