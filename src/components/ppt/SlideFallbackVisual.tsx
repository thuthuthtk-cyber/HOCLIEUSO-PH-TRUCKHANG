import {
  Award,
  BookOpen,
  Compass,
  Leaf,
  Lightbulb,
  Puzzle,
  Sparkles,
  Users,
} from 'lucide-react';
import { getPptStyleById, type PptStyleId, type SlideVisualMotif } from '../../types/ppt';

interface SlideFallbackVisualProps {
  styleId: PptStyleId;
  motif: SlideVisualMotif;
  isError?: boolean;
  errorMessage?: string;
}

const MOTIF_ICON_MAP: Record<SlideVisualMotif, typeof BookOpen> = {
  book: BookOpen,
  sparkles: Sparkles,
  lightbulb: Lightbulb,
  compass: Compass,
  puzzle: Puzzle,
  award: Award,
  users: Users,
  leaf: Leaf,
};

const MOTIF_LABEL_MAP: Record<SlideVisualMotif, string> = {
  book: 'Khám phá kiến thức',
  sparkles: 'Điểm nhấn bài học',
  lightbulb: 'Ý tưởng sáng tạo',
  compass: 'Định hướng thực hành',
  puzzle: 'Hoạt động luyện tập',
  award: 'Mục tiêu cần đạt',
  users: 'Thảo luận nhóm',
  leaf: 'Liên hệ thực tế',
};

export function SlideFallbackVisual({
  styleId,
  motif,
  isError = false,
  errorMessage,
}: SlideFallbackVisualProps) {
  const stylePreset = getPptStyleById(styleId);
  const Icon = MOTIF_ICON_MAP[motif] || BookOpen;
  const motifLabel = MOTIF_LABEL_MAP[motif] || 'Minh họa bài học';

  return (
    <div
      className={`relative w-full h-full overflow-hidden rounded-xl border ${stylePreset.theme.previewCardClass} flex flex-col items-center justify-center p-4 text-center select-none`}
    >
      {/* Decorative geometric circles */}
      <div
        className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-45"
        style={{ backgroundColor: `#${stylePreset.theme.accentSoftHex}` }}
      />
      <div
        className="absolute -bottom-8 -left-8 w-28 h-28 rounded-full opacity-25"
        style={{ backgroundColor: `#${stylePreset.theme.headerBgHex}` }}
      />
      <div
        className="absolute top-4 left-5 w-8 h-8 rounded-lg rotate-12 opacity-30"
        style={{ backgroundColor: `#${stylePreset.theme.accentHex}` }}
      />

      <div
        className="relative z-10 w-16 h-16 rounded-2xl shadow-sm border-2 flex items-center justify-center mb-2.5 bg-white"
        style={{ borderColor: `#${stylePreset.theme.accentHex}` }}
      >
        <Icon
          className="w-8 h-8"
          style={{ color: `#${stylePreset.theme.headerBgHex}` }}
        />
      </div>

      <p
        className="relative z-10 text-sm font-extrabold"
        style={{ color: `#${stylePreset.theme.titleColorHex}` }}
      >
        {motifLabel}
      </p>
      <p className="relative z-10 text-xs text-slate-600 mt-0.5 max-w-[230px]">
        {isError
          ? 'Ảnh AI chưa tạo được — đang dùng hình khối thay thế'
          : 'Khung hình khối minh họa thay thế'}
      </p>
      {isError && errorMessage && (
        <p
          className="relative z-10 mt-1.5 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800 line-clamp-2 max-w-[240px]"
          title={errorMessage}
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
