import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  MessageSquareText,
  MonitorPlay,
} from 'lucide-react';
import type { LearningMaterial } from '../../types/hocLieu';
import { getPptStyleById } from '../../types/ppt';
import { reconstructSlidesFromSavedMaterial } from '../../services/aiPptService';
import { SlideFallbackVisual } from './SlideFallbackVisual';

interface SavedPptViewerProps {
  material: LearningMaterial;
}

export function SavedPptViewer({ material }: SavedPptViewerProps) {
  const slides = reconstructSlidesFromSavedMaterial(material);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'presenter' | 'overview'>('presenter');

  if (slides.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-600">
        Bài giảng PPT AI này chưa có dữ liệu slide để trình chiếu.
      </div>
    );
  }

  const safeIndex = Math.min(activeIndex, slides.length - 1);
  const activeSlide = slides[safeIndex];
  const slideStyle = getPptStyleById(
    activeSlide.styleId || material.pptConfig?.styleId || 'hoat_hinh_3d'
  );
  const gradeLabel =
    material.khoiLop === 'Dùng chung' ? 'Dùng chung' : `Lớp ${material.khoiLop}`;

  return (
    <div className="p-4 sm:p-5 space-y-4 bg-white">
      {/* Top control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-xs font-bold text-teal-800">
            <MonitorPlay className="w-3.5 h-3.5" />
            {slides.length} slide · Phong cách {slideStyle.name}
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setViewMode('presenter')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              viewMode === 'presenter'
                ? 'bg-white text-teal-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MonitorPlay className="w-3.5 h-3.5" />
            Trình chiếu từng slide
          </button>
          <button
            type="button"
            onClick={() => setViewMode('overview')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              viewMode === 'overview'
                ? 'bg-white text-teal-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Xem toàn bộ ({slides.length})
          </button>
        </div>
      </div>

      {viewMode === 'presenter' ? (
        <div className="space-y-3">
          {/* Interactive 16:9 Slide Stage */}
          <div
            className={`rounded-2xl border border-slate-200 p-4 sm:p-5 ${slideStyle.theme.previewBgClass}`}
          >
            <div
              className={`rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${slideStyle.theme.previewHeaderClass}`}
            >
              <h3 className="text-base sm:text-lg font-extrabold text-white leading-snug">
                {activeSlide.title}
              </h3>
              <span
                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold shrink-0 ${slideStyle.theme.previewAccentClass}`}
              >
                Slide {safeIndex + 1}/{slides.length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-4 items-stretch">
              <div
                className={`md:col-span-6 rounded-xl border p-4 flex flex-col justify-between gap-3 ${slideStyle.theme.previewCardClass}`}
              >
                <div className="space-y-2.5">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-md border text-[11px] font-extrabold uppercase tracking-wide ${slideStyle.theme.previewBadgeClass}`}
                  >
                    {safeIndex === 0
                      ? `${material.monHoc} · ${gradeLabel}`
                      : 'Nội dung trọng tâm'}
                  </span>
                  <ul className="space-y-2">
                    {activeSlide.bullets.map((bullet, bIdx) => (
                      <li
                        key={bIdx}
                        className="flex items-start gap-2 text-sm text-slate-800 leading-relaxed"
                      >
                        <span
                          className="w-2 h-2 rounded-full mt-2 shrink-0"
                          style={{ backgroundColor: `#${slideStyle.theme.accentHex}` }}
                        />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {activeSlide.keyTakeaway && (
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs font-bold ${slideStyle.theme.previewBadgeClass}`}
                  >
                    Ghi nhớ: {activeSlide.keyTakeaway}
                  </div>
                )}
              </div>

              <div
                className={`md:col-span-6 rounded-xl border p-3 flex flex-col justify-between gap-2 ${slideStyle.theme.previewCardClass}`}
              >
                <div className="aspect-video w-full rounded-xl overflow-hidden bg-slate-100">
                  <SlideFallbackVisual
                    styleId={activeSlide.styleId}
                    motif={activeSlide.visualMotif}
                  />
                </div>
                <p className="text-[11px] text-slate-500 text-center">
                  Bấm <span className="font-bold text-slate-700">Tải lại file PowerPoint (.pptx)</span> bên dưới để xuất đầy đủ bố cục 16:9
                </p>
              </div>
            </div>
          </div>

          {/* Speaker notes */}
          {activeSlide.speakerNotes && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 flex items-start gap-2.5">
              <MessageSquareText className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900">Ghi chú giảng dạy: </span>
                {activeSlide.speakerNotes}
              </div>
            </div>
          )}

          {/* Slide Navigation Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              disabled={safeIndex === 0}
              onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
              Slide trước
            </button>

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {slides.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  className={`min-w-[34px] h-8 px-2 rounded-lg text-xs font-bold transition-colors ${
                    idx === safeIndex
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={safeIndex === slides.length - 1}
              onClick={() => setActiveIndex((i) => Math.min(slides.length - 1, i + 1))}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            >
              Slide tiếp
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
          {slides.map((s, idx) => {
            const st = getPptStyleById(s.styleId);
            return (
              <div
                key={s.id}
                onClick={() => {
                  setActiveIndex(idx);
                  setViewMode('presenter');
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveIndex(idx);
                    setViewMode('presenter');
                  }
                }}
                className={`cursor-pointer rounded-xl border p-3.5 transition-all hover:ring-2 hover:ring-teal-600/30 ${st.theme.previewBgClass} border-slate-200`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold ${st.theme.previewHeaderClass}`}
                  >
                    Slide {idx + 1}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Bấm để trình chiếu
                  </span>
                </div>
                <h4 className="text-sm font-extrabold text-slate-900 line-clamp-1 mb-1.5">
                  {s.title}
                </h4>
                <ul className="space-y-1">
                  {s.bullets.slice(0, 3).map((b, bIdx) => (
                    <li key={bIdx} className="text-xs text-slate-700 line-clamp-1">
                      • {b}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
