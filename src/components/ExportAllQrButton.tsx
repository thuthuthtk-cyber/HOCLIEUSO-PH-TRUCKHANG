import { QrCode } from 'lucide-react';

interface ExportAllQrButtonProps {
  count: number;
  onClick: () => void;
}

export function ExportAllQrButton({ count, onClick }: ExportAllQrButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0}
      title={
        count > 0
          ? `Xuất phiếu A4 kèm Mã QR cho toàn bộ ${count} học liệu đang hiển thị`
          : 'Chưa có học liệu nào để xuất'
      }
      className="min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
    >
      <QrCode className="w-4 h-4 shrink-0" />
      <span>Xuất tất cả danh mục &amp; QR</span>
      {count > 0 && (
        <span className="tabular-nums text-xs font-extrabold bg-white/20 px-1.5 py-0.5 rounded-md">
          {count}
        </span>
      )}
    </button>
  );
}
