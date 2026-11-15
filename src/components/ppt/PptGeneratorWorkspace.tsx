import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CloudUpload,
  Download,
  ImagePlus,
  Loader2,
  Palette,
  Presentation,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  XCircle,
} from 'lucide-react';
import { DEFAULT_SUBJECTS, type SubjectItem, type UserProfile } from '../../types/hocLieu';
import {
  getPptStyleById,
  PPT_GRADE_LEVELS,
  PPT_MASCOT_LIBRARY,
  PPT_SLIDE_COUNTS,
  PPT_STYLE_LIBRARY,
  type PptGradeLevel,
  type PptSlideItem,
  type PptStyleId,
} from '../../types/ppt';
import {
  generateImageWithRetry,
  generatePptOutline,
  generateSlideImagesInParallel,
  PPT_IMAGE_MAX_RETRIES,
  readCustomSlideImageFile,
  savePptDeckToSystem,
  type BatchImageProgress,
} from '../../services/aiPptService';
import { exportDeckToPptx } from '../../utils/pptExport';
import { useToast } from '../ToastContext';
import { SlideFallbackVisual } from './SlideFallbackVisual';

interface PptGeneratorWorkspaceProps {
  profile: UserProfile;
  subjects: SubjectItem[];
}

const SAMPLE_TOPICS = [
  'Phép cộng có nhớ trong phạm vi 100',
  'Từ chỉ sự vật, hoạt động',
  'Vòng tuần hoàn của nước trong tự nhiên',
  'An toàn khi tham gia giao thông',
];

export function PptGeneratorWorkspace({ profile, subjects }: PptGeneratorWorkspaceProps) {
  const { showToast } = useToast();

  const subjectOptions = useMemo(() => {
    const active = subjects.filter((s) => s.kichHoat).map((s) => s.ten);
    return active.length > 0 ? active : DEFAULT_SUBJECTS.map((s) => s.ten);
  }, [subjects]);

  const [monHoc, setMonHoc] = useState<string>(subjectOptions[0] || 'Toán');
  const [khoiLop, setKhoiLop] = useState<PptGradeLevel>('3');
  const [tenBaiHoc, setTenBaiHoc] = useState<string>('');
  const [soSlide, setSoSlide] = useState<number>(6);
  const [yeuCauBoSung, setYeuCauBoSung] = useState<string>('');

  const [styleId, setStyleId] = useState<PptStyleId>('hoat_hinh_3d');
  const [sharedStylePrompt, setSharedStylePrompt] = useState<string>(
    PPT_STYLE_LIBRARY[0].stylePrompt
  );
  const [selectedMascotIds, setSelectedMascotIds] = useState<string[]>(['be_na', 'cu_meo']);

  const [generatingOutline, setGeneratingOutline] = useState<boolean>(false);
  const [generatingImages, setGeneratingImages] = useState<boolean>(false);
  const [exportingPptx, setExportingPptx] = useState<boolean>(false);
  const [savingToSystem, setSavingToSystem] = useState<boolean>(false);
  const [savedMaterialId, setSavedMaterialId] = useState<string | null>(null);
  const [hasSavedNotice, setHasSavedNotice] = useState<boolean>(false);

  const [deckTitle, setDeckTitle] = useState<string>('');
  const [deckSubtitle, setDeckSubtitle] = useState<string>('');
  const [slides, setSlides] = useState<PptSlideItem[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchImageProgress | null>(null);

  const [styleMenuSlideId, setStyleMenuSlideId] = useState<string | null>(null);
  const [singleRegenSlideId, setSingleRegenSlideId] = useState<string | null>(null);

  const batchAbortRef = useRef<AbortController | null>(null);
  const uploadInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function handleSelectStylePreset(nextId: PptStyleId) {
    setStyleId(nextId);
    const preset = getPptStyleById(nextId);
    setSharedStylePrompt(preset.stylePrompt);
  }

  function handleToggleMascot(mascotId: string) {
    setSelectedMascotIds((prev) => {
      if (prev.includes(mascotId)) {
        if (prev.length <= 1) {
          showToast('Cần chọn ít nhất 1 nhân vật mascot cố định.', 'warning');
          return prev;
        }
        return prev.filter((id) => id !== mascotId);
      }
      if (prev.length >= 2) {
        showToast('Chỉ chọn tối đa 2 nhân vật mascot cố định để ảnh đồng bộ nhất.', 'info');
        return [prev[1], mascotId];
      }
      return [...prev, mascotId];
    });
  }

  function patchSlide(slideId: string, patch: Partial<PptSlideItem>) {
    setSlides((prev) => prev.map((s) => (s.id === slideId ? { ...s, ...patch } : s)));
  }

  async function handleGenerateDeck(e: React.FormEvent) {
    e.preventDefault();
    const cleanTopic = tenBaiHoc.trim();
    if (cleanTopic.length < 2) {
      showToast('Vui lòng nhập Tên bài học / Chủ đề bài giảng.', 'error');
      return;
    }

    if (batchAbortRef.current) {
      batchAbortRef.current.abort();
      batchAbortRef.current = null;
    }

    setGeneratingOutline(true);
    setStyleMenuSlideId(null);
    setSavedMaterialId(null);
    setHasSavedNotice(false);

    try {
      const outline = await generatePptOutline({
        monHoc,
        khoiLop,
        tenBaiHoc: cleanTopic,
        soSlide,
        yeuCauBoSung: yeuCauBoSung.trim(),
        styleId,
        sharedStylePrompt: sharedStylePrompt.trim(),
        mascotIds: selectedMascotIds,
      });

      const initialSlides: PptSlideItem[] = outline.slides.map((item, idx) => ({
        id: `slide-${Date.now()}-${idx + 1}`,
        slideNumber: idx + 1,
        title: item.title,
        bullets: item.bullets,
        keyTakeaway: item.keyTakeaway,
        speakerNotes: item.speakerNotes,
        imageScenePrompt: item.imageScenePrompt,
        visualMotif: item.visualMotif,
        styleId,
        imageStatus: 'queued',
        imageDataUrl: null,
        retryCount: 0,
      }));

      setDeckTitle(outline.deckTitle);
      setDeckSubtitle(outline.subtitle);
      setSlides(initialSlides);
      setGeneratingOutline(false);

      // Start parallel image generation (max 3 concurrent, timeout 45s, max 2 retries)
      const abortController = new AbortController();
      batchAbortRef.current = abortController;
      setGeneratingImages(true);

      await generateSlideImagesInParallel({
        slides: initialSlides,
        monHoc,
        khoiLop,
        sharedStylePrompt: sharedStylePrompt.trim(),
        mascotIds: selectedMascotIds,
        signal: abortController.signal,
        onSlidePatch: (slideId, patch) => patchSlide(slideId, patch),
        onProgress: (prog) => setBatchProgress(prog),
      });

      if (!abortController.signal.aborted) {
        showToast('Đã hoàn thành sinh bài giảng PPT AI.', 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi không xác định khi tạo bài giảng.';
      showToast(msg, 'error');
    } finally {
      setGeneratingOutline(false);
      setGeneratingImages(false);
      batchAbortRef.current = null;
    }
  }

  function handleCancelImageBatch() {
    if (batchAbortRef.current) {
      batchAbortRef.current.abort();
      batchAbortRef.current = null;
      setGeneratingImages(false);
      setSlides((prev) =>
        prev.map((s) =>
          s.imageStatus === 'queued' ||
          s.imageStatus === 'generating' ||
          s.imageStatus === 'retrying'
            ? {
                ...s,
                imageStatus: s.imageDataUrl ? 'ready' : 'error',
                imageError: s.imageDataUrl ? undefined : 'Đã dừng tạo ảnh thủ công.',
              }
            : s
        )
      );
      showToast('Đã dừng quá trình sinh ảnh song song.', 'info');
    }
  }

  async function handleRegenerateSingleImage(slide: PptSlideItem, overrideStyleId?: PptStyleId) {
    const targetStyleId = overrideStyleId ?? slide.styleId;
    const targetStylePreset = getPptStyleById(targetStyleId);
    const effectiveStylePrompt =
      overrideStyleId && overrideStyleId !== styleId
        ? targetStylePreset.stylePrompt
        : sharedStylePrompt.trim() || targetStylePreset.stylePrompt;

    setStyleMenuSlideId(null);
    setSingleRegenSlideId(slide.id);

    patchSlide(slide.id, {
      styleId: targetStyleId,
      imageStatus: 'generating',
      imageError: undefined,
      retryCount: 0,
    });

    try {
      const res = await generateImageWithRetry(
        {
          scenePrompt: slide.imageScenePrompt,
          slideTitle: slide.title,
          monHoc,
          khoiLop,
          styleId: targetStyleId,
          sharedStylePrompt: effectiveStylePrompt,
          mascotIds: selectedMascotIds,
        },
        {
          maxRetries: PPT_IMAGE_MAX_RETRIES,
          onAttempt: (attempt) => {
            if (attempt > 1) {
              patchSlide(slide.id, {
                imageStatus: 'retrying',
                retryCount: attempt - 1,
              });
            }
          },
        }
      );

      patchSlide(slide.id, {
        styleId: targetStyleId,
        imageStatus: 'ready',
        imageDataUrl: res.imageDataUrl,
        imageError: undefined,
        retryCount: res.retriesUsed,
        isCustomUpload: false,
      });
      showToast(`Đã cập nhật ảnh minh họa cho Slide ${slide.slideNumber}.`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sinh ảnh thất bại.';
      patchSlide(slide.id, {
        styleId: targetStyleId,
        imageStatus: 'error',
        imageDataUrl: null,
        imageError: msg,
        retryCount: PPT_IMAGE_MAX_RETRIES,
      });
      showToast(`Slide ${slide.slideNumber}: ${msg}. Đã dùng hình khối thay thế.`, 'warning');
    } finally {
      setSingleRegenSlideId((curr) => (curr === slide.id ? null : curr));
    }
  }

  async function handleUploadCustomImage(slide: PptSlideItem, file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await readCustomSlideImageFile(file);
      patchSlide(slide.id, {
        imageDataUrl: dataUrl,
        imageStatus: 'ready',
        imageError: undefined,
        isCustomUpload: true,
      });
      showToast(`Đã tải ảnh riêng lên cho Slide ${slide.slideNumber}.`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể đọc tệp ảnh.';
      showToast(msg, 'error');
    }
  }

  function handleRemoveSlideImage(slide: PptSlideItem) {
    patchSlide(slide.id, {
      imageDataUrl: null,
      imageStatus: 'removed',
      imageError: undefined,
      isCustomUpload: false,
    });
    showToast(
      `Đã xóa ảnh Slide ${slide.slideNumber} và chuyển sang hình khối minh họa.`,
      'info'
    );
  }

  async function handleExportPptx() {
    if (slides.length === 0) return;
    setExportingPptx(true);
    try {
      const fileName = await exportDeckToPptx({
        deckTitle: deckTitle || tenBaiHoc || 'Bai_giang_AI',
        subtitle: deckSubtitle,
        monHoc,
        khoiLop,
        defaultStyleId: styleId,
        slides,
      });
      showToast(`Đã xuất thành công tệp ${fileName}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể tạo file PowerPoint.';
      showToast(`Lỗi xuất PPTX: ${msg}`, 'error');
    } finally {
      setExportingPptx(false);
    }
  }

  async function handleSaveToSystem() {
    if (slides.length === 0 || savingToSystem) return;
    setSavingToSystem(true);
    try {
      const materialId = await savePptDeckToSystem({
        profile,
        existingMaterialId: savedMaterialId,
        deckTitle: deckTitle || tenBaiHoc || 'Bài giảng PPT AI',
        subtitle: deckSubtitle,
        tenBaiHoc: tenBaiHoc || deckTitle,
        monHoc,
        khoiLop,
        styleId,
        mascotIds: selectedMascotIds,
        slides,
      });
      setSavedMaterialId(materialId);
      setHasSavedNotice(true);
      showToast('Đã lưu bài giảng vào hệ thống (Học liệu của tôi)!', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể lưu bài giảng lên Firestore.';
      showToast(`Lỗi lưu bài giảng: ${msg}`, 'error');
    } finally {
      setSavingToSystem(false);
    }
  }

  const readyCount = slides.filter((s) => s.imageStatus === 'ready' && s.imageDataUrl).length;
  const fallbackCount = slides.filter(
    (s) => s.imageStatus === 'error' || s.imageStatus === 'removed'
  ).length;
  const progressPercent =
    batchProgress && batchProgress.total > 0
      ? Math.round((batchProgress.completed / batchProgress.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-teal-700 text-white flex items-center justify-center shrink-0">
            <Presentation className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Tạo bài giảng PPT AI & Sinh ảnh minh họa đồng bộ
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Giáo viên: <span className="font-semibold text-slate-800">{profile.hoTen}</span> · Sinh ảnh 16:9 không chữ, không số, đồng bộ phong cách & nhân vật mascot, xuất chuẩn PowerPoint (.pptx).
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT CONFIGURATION PANEL */}
        <form
          onSubmit={handleGenerateDeck}
          className="xl:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 space-y-5"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Wand2 className="w-5 h-5 text-teal-700" />
            <h2 className="text-lg font-extrabold text-slate-900">Thiết lập bài giảng</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                Môn học *
              </label>
              <select
                value={monHoc}
                onChange={(e) => setMonHoc(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {subjectOptions.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                Khối lớp *
              </label>
              <select
                value={khoiLop}
                onChange={(e) => setKhoiLop(e.target.value as PptGradeLevel)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {PPT_GRADE_LEVELS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              Tên bài học / Chủ đề bài giảng *
            </label>
            <input
              type="text"
              value={tenBaiHoc}
              onChange={(e) => setTenBaiHoc(e.target.value)}
              maxLength={180}
              placeholder="Ví dụ: Phép cộng có nhớ trong phạm vi 100"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              required
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {SAMPLE_TOPICS.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => setTenBaiHoc(topic)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-800 border border-slate-200 transition-colors text-left"
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              Số lượng slide
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PPT_SLIDE_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setSoSlide(count)}
                  className={`py-2 rounded-xl text-sm font-bold border transition-colors ${
                    soSlide === count
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {count} slide
                </button>
              ))}
            </div>
          </div>

          {/* STYLE LIBRARY + SHARED STYLE PROMPT */}
          <div className="space-y-2.5 pt-1 border-t border-slate-100">
            <label className="block text-sm font-bold text-slate-700">
              Thư viện phong cách minh họa *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PPT_STYLE_LIBRARY.map((preset) => {
                const selected = preset.id === styleId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectStylePreset(preset.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      selected
                        ? 'border-teal-700 bg-teal-50/70 ring-1 ring-teal-700'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <span className="text-xs font-extrabold text-slate-900">
                        {preset.name}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: `#${preset.theme.headerBgHex}` }}
                        />
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: `#${preset.theme.accentHex}` }}
                        />
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 line-clamp-2 leading-snug">
                      {preset.shortDesc}
                    </p>
                  </button>
                );
              })}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Câu phong cách chung (tự động ghép vào mọi ảnh)
              </label>
              <textarea
                rows={3}
                value={sharedStylePrompt}
                onChange={(e) => setSharedStylePrompt(e.target.value)}
                maxLength={500}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          {/* FIXED MASCOTS (1-2) */}
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-700">
                Nhân vật Mascot cố định (chọn 1–2)
              </label>
              <span className="text-xs font-semibold text-teal-700">
                Đã chọn {selectedMascotIds.length}/2
              </span>
            </div>
            <div className="space-y-1.5">
              {PPT_MASCOT_LIBRARY.map((mascot) => {
                const active = selectedMascotIds.includes(mascot.id);
                return (
                  <button
                    key={mascot.id}
                    type="button"
                    onClick={() => handleToggleMascot(mascot.id)}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-xl border text-left transition-colors ${
                      active
                        ? 'border-teal-600 bg-teal-50/70'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xl shrink-0" aria-hidden="true">
                      {mascot.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate">{mascot.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{mascot.shortDesc}</p>
                    </div>
                    <span
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                        active
                          ? 'bg-teal-700 border-teal-700 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {active && <Check className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              Yêu cầu sư phạm thêm (không bắt buộc)
            </label>
            <textarea
              rows={2}
              value={yeuCauBoSung}
              onChange={(e) => setYeuCauBoSung(e.target.value)}
              maxLength={400}
              placeholder="Ví dụ: Có hoạt động trò chơi khởi động, ví dụ gần gũi nông thôn Việt Nam..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
            <p className="font-bold text-slate-800">Quy chuẩn sinh ảnh tự động:</p>
            <p>• Không chứa chữ viết, không chứa con số trên ảnh.</p>
            <p>• Nền sạch, tỉ lệ 16:9, thân thiện học sinh tiểu học Việt Nam.</p>
            <p>• Xử lý song song tối đa 3 ảnh, timeout 45s, tự thử lại tối đa 2 lần.</p>
          </div>

          <button
            type="submit"
            disabled={generatingOutline || generatingImages}
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-extrabold text-sm transition-colors"
          >
            {generatingOutline ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Đang lập dàn ý slide bằng AI...
              </>
            ) : generatingImages ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Đang sinh ảnh minh họa (tối đa 3 song song)...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Tạo bài giảng & Sinh ảnh AI
              </>
            )}
          </button>
        </form>

        {/* RIGHT PREVIEW & SLIDE WORKSPACE */}
        <div className="xl:col-span-8 space-y-5">
          {/* Batch progress bar */}
          {batchProgress && (generatingImages || batchProgress.completed > 0) && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {generatingImages ? (
                    <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-teal-700" />
                  )}
                  <span className="text-sm font-extrabold text-slate-900">
                    Tiến trình sinh ảnh minh họa: {batchProgress.completed}/{batchProgress.total} slide ({progressPercent}%)
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="text-emerald-700">Thành công: {readyCount}</span>
                  {fallbackCount > 0 && (
                    <span className="text-amber-700">Thay bằng hình khối: {fallbackCount}</span>
                  )}
                  {generatingImages && (
                    <button
                      type="button"
                      onClick={handleCancelImageBatch}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Dừng sinh ảnh
                    </button>
                  )}
                </div>
              </div>

              <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-teal-600 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {fallbackCount > 0 && !generatingImages && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Một số slide chưa tải được ảnh AI đã tự động dùng hình khối & icon thay thế để không làm gián đoạn bài giảng. Thầy/cô có thể bấm Tạo lại hoặc Tải ảnh khác lên từng slide.
                </p>
              )}
            </div>
          )}

          {/* Deck header + Export button */}
          {slides.length > 0 ? (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <input
                    type="text"
                    value={deckTitle}
                    onChange={(e) => setDeckTitle(e.target.value)}
                    aria-label="Tiêu đề bài giảng"
                    className="w-full text-lg font-extrabold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none py-0.5"
                  />
                  <p className="text-xs text-slate-500">
                    {deckSubtitle} · {slides.length} slide · Bấm trực tiếp vào tiêu đề hoặc nội dung để chỉnh sửa trước khi tải về
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleSaveToSystem}
                    disabled={savingToSystem}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-extrabold transition-colors"
                  >
                    {savingToSystem ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Đang lưu...
                      </>
                    ) : savedMaterialId ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Cập nhật vào hệ thống
                      </>
                    ) : (
                      <>
                        <CloudUpload className="w-4 h-4" />
                        Lưu vào hệ thống
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleExportPptx}
                    disabled={exportingPptx}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-extrabold transition-colors"
                  >
                    {exportingPptx ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Đang đóng gói .pptx...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Tải PowerPoint (.pptx)
                      </>
                    )}
                  </button>
                </div>
              </div>

              {hasSavedNotice && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm font-bold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  Đã lưu bài giảng vào hệ thống (Học liệu của tôi)!
                </div>
              )}

              {/* Slide cards list */}
              <div className="space-y-6">
                {slides.map((slide, idx) => {
                  const slideStyle = getPptStyleById(slide.styleId);
                  const isBusy =
                    slide.imageStatus === 'generating' ||
                    slide.imageStatus === 'retrying' ||
                    singleRegenSlideId === slide.id;

                  return (
                    <div
                      key={slide.id}
                      className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm"
                    >
                      {/* 16:9 Slide Visual Frame */}
                      <div
                        className={`p-4 sm:p-5 ${slideStyle.theme.previewBgClass} border-b border-slate-200`}
                      >
                        {/* Prominent Header */}
                        <div
                          className={`rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${slideStyle.theme.previewHeaderClass}`}
                        >
                          <input
                            type="text"
                            value={slide.title}
                            onChange={(e) =>
                              patchSlide(slide.id, { title: e.target.value })
                            }
                            aria-label={`Tiêu đề Slide ${idx + 1}`}
                            className="flex-1 min-w-0 bg-transparent text-base sm:text-lg font-extrabold text-white placeholder-white/70 border-b border-transparent hover:border-white/40 focus:border-white focus:outline-none"
                          />
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-extrabold shrink-0 ${slideStyle.theme.previewAccentClass}`}
                          >
                            Slide {idx + 1}/{slides.length}
                          </span>
                        </div>

                        {/* 2-Column Body: Text Left + Large 16:9 Image Right */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4 items-stretch">
                          {/* LEFT COLUMN: Structured Text */}
                          <div
                            className={`lg:col-span-6 rounded-xl border p-4 flex flex-col justify-between gap-3 ${slideStyle.theme.previewCardClass}`}
                          >
                            <div className="space-y-2.5">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-md border text-[11px] font-extrabold uppercase tracking-wide ${slideStyle.theme.previewBadgeClass}`}
                              >
                                {idx === 0
                                  ? `${monHoc} · Lớp ${khoiLop}`
                                  : 'Nội dung trọng tâm'}
                              </span>

                              <ul className="space-y-2">
                                {slide.bullets.map((bullet, bIdx) => (
                                  <li key={bIdx} className="flex items-start gap-2">
                                    <span
                                      className="w-2 h-2 rounded-full mt-2 shrink-0"
                                      style={{
                                        backgroundColor: `#${slideStyle.theme.accentHex}`,
                                      }}
                                    />
                                    <textarea
                                      rows={2}
                                      value={bullet}
                                      onChange={(e) => {
                                        const nextBullets = [...slide.bullets];
                                        nextBullets[bIdx] = e.target.value;
                                        patchSlide(slide.id, { bullets: nextBullets });
                                      }}
                                      aria-label={`Ý ${bIdx + 1} của Slide ${idx + 1}`}
                                      className="w-full resize-none text-sm text-slate-800 bg-transparent rounded px-1 py-0.5 border border-transparent hover:border-slate-200 focus:border-teal-600 focus:bg-white focus:outline-none leading-snug"
                                    />
                                  </li>
                                ))}
                              </ul>
                            </div>

                            <div
                              className={`rounded-lg border px-3 py-2 text-xs font-bold ${slideStyle.theme.previewBadgeClass}`}
                            >
                              Ghi nhớ: {slide.keyTakeaway}
                            </div>
                          </div>

                          {/* RIGHT COLUMN: Large 16:9 Visual Showcase */}
                          <div
                            className={`lg:col-span-6 rounded-xl border p-3 flex flex-col justify-between gap-2.5 ${slideStyle.theme.previewCardClass}`}
                          >
                            <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                              {isBusy || slide.imageStatus === 'queued' ? (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-slate-50 text-slate-600 p-4 text-center">
                                  <Loader2 className="w-7 h-7 animate-spin text-teal-700" />
                                  <p className="text-xs font-bold text-slate-800">
                                    {slide.imageStatus === 'retrying'
                                      ? `Đang thử lại lần ${slide.retryCount || 1}/${PPT_IMAGE_MAX_RETRIES}...`
                                      : slide.imageStatus === 'queued'
                                        ? 'Đang chờ trong hàng đợi (tối đa 3 song song)...'
                                        : 'Gemini đang vẽ ảnh minh họa 16:9...'}
                                  </p>
                                </div>
                              ) : slide.imageStatus === 'ready' && slide.imageDataUrl ? (
                                <img
                                  src={slide.imageDataUrl}
                                  alt={`Minh họa ${slide.title}`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <SlideFallbackVisual
                                  styleId={slide.styleId}
                                  motif={slide.visualMotif}
                                  isError={slide.imageStatus === 'error'}
                                  errorMessage={slide.imageError}
                                />
                              )}
                            </div>

                            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 px-1">
                              <span className="font-semibold truncate">
                                Phong cách: {slideStyle.name}
                                {slide.isCustomUpload ? ' (Ảnh tải lên)' : ''}
                              </span>
                              <span>Tỉ lệ 16:9</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* PER-IMAGE CONTROLS BAR */}
                      <div className="px-4 py-3 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 relative">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleRegenerateSingleImage(slide)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-teal-50 hover:border-teal-400 text-xs font-bold text-slate-800 disabled:opacity-50 transition-colors"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                            Tạo lại
                          </button>

                          <div className="relative">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                setStyleMenuSlideId((curr) =>
                                  curr === slide.id ? null : slide.id
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-indigo-50 hover:border-indigo-400 text-xs font-bold text-slate-800 disabled:opacity-50 transition-colors"
                            >
                              <Palette className="w-3.5 h-3.5 text-indigo-600" />
                              Đổi phong cách
                            </button>

                            {styleMenuSlideId === slide.id && (
                              <div className="absolute left-0 bottom-full mb-1.5 z-20 w-56 rounded-xl bg-white border border-slate-200 shadow-lg p-1.5 space-y-1">
                                <p className="px-2 py-1 text-[11px] font-bold text-slate-500">
                                  Chọn phong cách & vẽ lại slide này:
                                </p>
                                {PPT_STYLE_LIBRARY.map((st) => (
                                  <button
                                    key={st.id}
                                    type="button"
                                    onClick={() => handleRegenerateSingleImage(slide, st.id)}
                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left ${
                                      st.id === slide.styleId
                                        ? 'bg-teal-50 text-teal-800 font-bold'
                                        : 'text-slate-700 hover:bg-slate-100'
                                    }`}
                                  >
                                    <span>{st.name}</span>
                                    <span
                                      className="w-3 h-3 rounded-full shrink-0"
                                      style={{ backgroundColor: `#${st.theme.headerBgHex}` }}
                                    />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <input
                            ref={(el) => {
                              uploadInputRefs.current[slide.id] = el;
                            }}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              void handleUploadCustomImage(slide, file);
                            }}
                          />
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => uploadInputRefs.current[slide.id]?.click()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-sky-50 hover:border-sky-400 text-xs font-bold text-slate-800 disabled:opacity-50 transition-colors"
                          >
                            <Upload className="w-3.5 h-3.5 text-sky-600" />
                            Tải ảnh khác lên
                          </button>

                          <button
                            type="button"
                            disabled={isBusy || slide.imageStatus === 'removed'}
                            onClick={() => handleRemoveSlideImage(slide)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-rose-50 hover:border-rose-300 text-xs font-bold text-rose-700 disabled:opacity-40 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Xóa ảnh
                          </button>
                        </div>

                        <p className="text-[11px] text-slate-500 max-w-xs truncate">
                          Lời giảng: {slide.speakerNotes}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center flex flex-col items-center justify-center min-h-[420px]">
              <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mb-4">
                <ImagePlus className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900">
                Chưa có bản xem trước bài giảng PPT
              </h3>
              <p className="text-sm text-slate-600 max-w-md mt-2">
                Thầy/cô chọn môn học, khối lớp, nhập tên bài học, chọn phong cách chung và 1–2 nhân vật mascot cố định ở cột bên trái, sau đó bấm{' '}
                <span className="font-bold text-teal-700">Tạo bài giảng & Sinh ảnh AI</span>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
