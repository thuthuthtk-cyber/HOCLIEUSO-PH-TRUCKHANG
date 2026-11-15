import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../config/firebase';
import type { LearningMaterial, MaterialStatus, UserProfile } from '../types/hocLieu';
import {
  PPT_MASCOT_LIBRARY,
  PPT_STYLE_LIBRARY,
  getPptStyleById,
  type PptGradeLevel,
  type PptGenerationConfig,
  type PptOutlineResponse,
  type PptSlideItem,
  type PptStyleId,
  type SavedPptConfig,
  type SavedPptSlideData,
  type SlideImageStatus,
  type SlideVisualMotif,
} from '../types/ppt';
import { buildTeacherApiHeaders } from '../utils/ssoAuth';
import { generateSyncedMascotSlideArt } from '../utils/slideMascotArt';

export const PPT_IMAGE_MAX_CONCURRENCY = 3;
export const PPT_IMAGE_TIMEOUT_MS = 45_000;
export const PPT_IMAGE_MAX_RETRIES = 2;

const ALLOWED_GRADES: PptGradeLevel[] = ['1', '2', '3', '4', '5'];

function sanitizeMascotIds(raw: string[]): string[] {
  const validIds = new Set(PPT_MASCOT_LIBRARY.map((m) => m.id));
  const unique = Array.from(new Set(raw.filter((id) => validIds.has(id)))).slice(0, 2);
  return unique.length > 0 ? unique : [PPT_MASCOT_LIBRARY[0].id];
}

export async function generatePptOutline(
  config: PptGenerationConfig
): Promise<PptOutlineResponse> {
  const monHoc = (config.monHoc || '').trim().slice(0, 80);
  const khoiLop = (config.khoiLop || '').trim() as PptGradeLevel;
  const tenBaiHoc = (config.tenBaiHoc || '').trim().slice(0, 180);
  const soSlideRaw = Number(config.soSlide ?? 6);
  const soSlide = Number.isFinite(soSlideRaw)
    ? Math.min(10, Math.max(4, Math.round(soSlideRaw)))
    : 6;
  const yeuCauBoSung = (config.yeuCauBoSung || '').trim().slice(0, 500);

  if (!monHoc) {
    throw new Error('Vui lòng chọn môn học.');
  }
  if (!ALLOWED_GRADES.includes(khoiLop)) {
    throw new Error('Vui lòng chọn khối lớp từ 1 đến 5.');
  }
  if (tenBaiHoc.length < 2) {
    throw new Error('Vui lòng nhập tên bài học / chủ đề bài giảng.');
  }

  const mascotIds = sanitizeMascotIds(config.mascotIds || []);
  const headers = await buildTeacherApiHeaders();

  const res = await fetch('/api/generate-ppt', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      monHoc,
      khoiLop,
      tenBaiHoc,
      soSlide,
      yeuCauBoSung,
      mascotIds,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as Partial<PptOutlineResponse> & {
    error?: string;
  };

  if (!res.ok) {
    throw new Error(
      data.error || `Không thể tạo dàn ý bài giảng PPT (mã lỗi ${res.status}).`
    );
  }

  if (!Array.isArray(data.slides) || data.slides.length === 0) {
    throw new Error('Máy chủ chưa sinh được danh sách slide. Vui lòng thử lại.');
  }

  return data as PptOutlineResponse;
}

export interface SlideImageRequestParams {
  scenePrompt: string;
  slideTitle: string;
  monHoc: string;
  khoiLop: string;
  styleId: PptStyleId;
  sharedStylePrompt: string;
  mascotIds: string[];
  visualMotif?: SlideVisualMotif;
  slideNumber?: number;
}

export function buildFinalSlideImagePrompt(params: SlideImageRequestParams): string {
  const stylePreset =
    PPT_STYLE_LIBRARY.find((s) => s.id === params.styleId) ?? PPT_STYLE_LIBRARY[0];
  const globalStyle = params.sharedStylePrompt.trim() || stylePreset.stylePrompt;

  const mascots = sanitizeMascotIds(params.mascotIds || [])
    .map((id) => PPT_MASCOT_LIBRARY.find((m) => m.id === id)?.promptDesc)
    .filter((v): v is string => Boolean(v));

  const mascotClause =
    mascots.length > 0
      ? `FIXED RECURRING CHARACTERS (keep exact same appearance, clothing, colors, and proportions in every slide): ${mascots.join(' together with ')}.`
      : '';

  return [
    `SHARED VISUAL STYLE: ${globalStyle}.`,
    mascotClause,
    `EDUCATIONAL SCENE TO ILLUSTRATE (Vietnamese primary school Grade ${params.khoiLop}, subject ${params.monHoc}, slide topic "${params.slideTitle}"): ${params.scenePrompt || params.slideTitle}.`,
    `STRICT MANDATORY CONSTRAINTS:`,
    `- ZERO TEXT: Strictly no text, no letters, no words, no alphabet characters, no captions, no speech bubbles, no chalk writing, no book titles anywhere in the image.`,
    `- ZERO NUMBERS: Strictly no numbers, no digits, no clocks with numbers, no math formulas or symbols.`,
    `- CLEAN BACKGROUND: Bright, clean, uncluttered soft background with balanced breathing room suitable for an educational presentation slide.`,
    `- AUDIENCE: Warm, cheerful, culturally appropriate, completely safe and friendly for Vietnamese primary school students (ages 6 to 11).`,
    `- FORMAT: Wide 16:9 landscape composition with clear focal subject on a clean backdrop.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function requestSingleSlideImage(
  params: SlideImageRequestParams,
  externalSignal?: AbortSignal
): Promise<{ imageDataUrl: string; modelUsed: string }> {
  if (externalSignal?.aborted) {
    throw new DOMException('Đã hủy tác vụ sinh ảnh.', 'AbortError');
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, PPT_IMAGE_TIMEOUT_MS);

  const onExternalAbort = () => {
    controller.abort();
  };
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const headers = await buildTeacherApiHeaders();
    const res = await fetch('/api/generate-ppt-image', {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        scenePrompt: params.scenePrompt,
        slideTitle: params.slideTitle,
        monHoc: params.monHoc,
        khoiLop: params.khoiLop,
        styleId: params.styleId,
        sharedStylePrompt: params.sharedStylePrompt,
        mascotIds: sanitizeMascotIds(params.mascotIds || []),
      }),
    });

    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        imageDataUrl?: string;
        modelUsed?: string;
      };
      if (data.imageDataUrl) {
        return {
          imageDataUrl: data.imageDataUrl,
          modelUsed: data.modelUsed || 'gemini-image',
        };
      }
    }
  } catch (err) {
    if (externalSignal?.aborted && !timedOut) {
      throw new DOMException('Đã hủy tác vụ sinh ảnh.', 'AbortError');
    }
    if (err instanceof DOMException && err.name === 'AbortError' && !timedOut) {
      throw err;
    }
    // Fall through cleanly to Canvas 16:9 Mascot Slide Art fallback
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }

  const fallbackArtUrl = generateSyncedMascotSlideArt({
    styleId: params.styleId,
    mascotIds: sanitizeMascotIds(params.mascotIds || []),
    visualMotif: params.visualMotif || 'book',
    slideNumber: params.slideNumber || 1,
  });

  if (fallbackArtUrl) {
    return {
      imageDataUrl: fallbackArtUrl,
      modelUsed: 'mascot-canvas-16x9',
    };
  }

  throw new Error('Không thể tạo ảnh minh họa cho slide.');
}

export async function generateImageWithRetry(
  params: SlideImageRequestParams,
  options?: {
    maxRetries?: number;
    signal?: AbortSignal;
    onAttempt?: (attempt: number, maxAttempts: number) => void;
  }
): Promise<{ imageDataUrl: string; modelUsed: string; retriesUsed: number }> {
  const maxRetries = options?.maxRetries ?? PPT_IMAGE_MAX_RETRIES;
  const maxAttempts = maxRetries + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (options?.signal?.aborted) {
      throw new DOMException('Đã hủy tác vụ sinh ảnh.', 'AbortError');
    }

    options?.onAttempt?.(attempt, maxAttempts);

    try {
      const result = await requestSingleSlideImage(params, options?.signal);
      return {
        ...result,
        retriesUsed: attempt - 1,
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      lastError = err;
      if (attempt < maxAttempts) {
        const delayMs = 900 * attempt;
        await new Promise<void>((resolve, reject) => {
          const timeoutId = window.setTimeout(resolve, delayMs);
          if (options?.signal) {
            const abortWait = () => {
              window.clearTimeout(timeoutId);
              reject(new DOMException('Đã hủy tác vụ sinh ảnh.', 'AbortError'));
            };
            options.signal.addEventListener('abort', abortWait, { once: true });
          }
        });
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Không thể tạo ảnh sau nhiều lần thử.');
}

export interface BatchImageProgress {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  active: number;
}

export async function generateSlideImagesInParallel(params: {
  slides: PptSlideItem[];
  monHoc: string;
  khoiLop: string;
  sharedStylePrompt: string;
  mascotIds: string[];
  signal?: AbortSignal;
  onSlidePatch: (
    slideId: string,
    patch: {
      imageStatus: SlideImageStatus;
      imageDataUrl?: string | null;
      imageError?: string;
      retryCount?: number;
      isCustomUpload?: boolean;
    }
  ) => void;
  onProgress: (progress: BatchImageProgress) => void;
}): Promise<void> {
  const {
    slides,
    monHoc,
    khoiLop,
    sharedStylePrompt,
    mascotIds,
    signal,
    onSlidePatch,
    onProgress,
  } = params;

  const total = slides.length;
  let completed = 0;
  let succeeded = 0;
  let failed = 0;
  let active = 0;
  let nextIndex = 0;

  const emitProgress = () => {
    onProgress({ total, completed, succeeded, failed, active });
  };

  for (const slide of slides) {
    onSlidePatch(slide.id, {
      imageStatus: 'queued',
      imageError: undefined,
      retryCount: 0,
    });
  }
  emitProgress();

  async function worker(): Promise<void> {
    while (true) {
      if (signal?.aborted) return;
      const idx = nextIndex;
      nextIndex += 1;
      if (idx >= slides.length) return;

      const slide = slides[idx];
      active += 1;
      onSlidePatch(slide.id, {
        imageStatus: 'generating',
        imageError: undefined,
        retryCount: 0,
      });
      emitProgress();

      try {
        const res = await generateImageWithRetry(
          {
            scenePrompt: slide.imageScenePrompt,
            slideTitle: slide.title,
            monHoc,
            khoiLop,
            styleId: slide.styleId,
            sharedStylePrompt,
            mascotIds,
            visualMotif: slide.visualMotif,
            slideNumber: slide.slideNumber,
          },
          {
            maxRetries: PPT_IMAGE_MAX_RETRIES,
            signal,
            onAttempt: (attempt) => {
              if (attempt > 1) {
                onSlidePatch(slide.id, {
                  imageStatus: 'retrying',
                  retryCount: attempt - 1,
                });
              }
            },
          }
        );

        succeeded += 1;
        completed += 1;
        active = Math.max(0, active - 1);
        onSlidePatch(slide.id, {
          imageStatus: 'ready',
          imageDataUrl: res.imageDataUrl,
          imageError: undefined,
          retryCount: res.retriesUsed,
          isCustomUpload: false,
        });
        emitProgress();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          active = Math.max(0, active - 1);
          emitProgress();
          return;
        }
        failed += 1;
        completed += 1;
        active = Math.max(0, active - 1);
        const msg = err instanceof Error ? err.message : 'Lỗi sinh ảnh minh họa.';
        onSlidePatch(slide.id, {
          imageStatus: 'error',
          imageDataUrl: null,
          imageError: msg,
          retryCount: PPT_IMAGE_MAX_RETRIES,
        });
        emitProgress();
      }
    }
  }

  const workerCount = Math.min(PPT_IMAGE_MAX_CONCURRENCY, total);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

export async function readCustomSlideImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WEBP).');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Không đọc được tệp ảnh từ máy tính.'));
    reader.readAsDataURL(file);
  });

  // Normalize to clean PNG/JPEG via canvas capped at 1280px wide so PptxGenJS embeds reliably
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxWidth = 1280;
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const targetW = Math.max(1, Math.round(img.width * scale));
      const targetH = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

function buildCompactSlidesData(slides: PptSlideItem[], defaultStyleId: PptStyleId): SavedPptSlideData[] {
  return slides.slice(0, 20).map((s, idx) => ({
    slideNumber: idx + 1,
    title: (s.title || `Slide ${idx + 1}`).trim().slice(0, 200),
    bullets: (s.bullets || []).map((b) => String(b || '').trim().slice(0, 400)).filter(Boolean).slice(0, 8),
    keyTakeaway: (s.keyTakeaway || '').trim().slice(0, 400),
    speakerNotes: (s.speakerNotes || '').trim().slice(0, 800),
    imageScenePrompt: (s.imageScenePrompt || '').trim().slice(0, 500),
    visualMotif: s.visualMotif || 'book',
    styleId: s.styleId || defaultStyleId,
  }));
}

function getDefaultSavedPptStatus(profile: UserProfile): MaterialStatus {
  if (profile.vaiTro === 'quanTri' || profile.role === 'ADMIN') return 'chiaSeToanTruong';
  if (profile.vaiTro === 'toTruong' || profile.role === 'TO_TRUONG') return 'daDuyet';
  return 'nhap';
}

export async function savePptDeckToSystem(params: {
  profile: UserProfile;
  existingMaterialId?: string | null;
  deckTitle: string;
  subtitle: string;
  tenBaiHoc: string;
  monHoc: string;
  khoiLop: PptGradeLevel;
  styleId: PptStyleId;
  mascotIds: string[];
  slides: PptSlideItem[];
}): Promise<string> {
  const {
    profile,
    existingMaterialId,
    deckTitle,
    subtitle,
    tenBaiHoc,
    monHoc,
    khoiLop,
    styleId,
    mascotIds,
    slides,
  } = params;

  const cleanTitle = (deckTitle || tenBaiHoc || 'Bài giảng PPT AI').trim().slice(0, 200);
  const cleanLesson = (tenBaiHoc || cleanTitle).trim().slice(0, 200);
  const stylePreset = getPptStyleById(styleId);
  const slidesData = buildCompactSlidesData(slides, styleId);
  const pptConfig: SavedPptConfig = {
    subtitle: (subtitle || `Môn ${monHoc} · Lớp ${khoiLop}`).trim().slice(0, 250),
    styleId,
    mascotIds: mascotIds.slice(0, 2),
  };

  const targetRef = existingMaterialId
    ? doc(db, 'materials', existingMaterialId)
    : doc(collection(db, 'materials'));
  const path = `materials/${targetRef.id}`;

  const sanitizedFileBase = cleanTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-_]/g, '')
    .trim()
    .replace(/\s+/g, '_') || 'Bai_giang_PPT_AI';

  const moTa = `Bài giảng PPT AI gồm ${slidesData.length} slide · Môn ${monHoc} · Lớp ${khoiLop} · Phong cách ${stylePreset.name}.`;
  const tags = [
    'bai-giang-ppt-ai',
    monHoc.toLowerCase().slice(0, 45),
    `khoi-${khoiLop}`,
  ].slice(0, 10);

  try {
    const existingSnap = existingMaterialId ? await getDoc(targetRef) : null;

    if (existingSnap?.exists()) {
      const existingData = existingSnap.data() as Partial<LearningMaterial>;
      const nextStatus: MaterialStatus =
        profile.vaiTro === 'quanTri'
          ? existingData.trangThai || 'chiaSeToanTruong'
          : profile.vaiTro === 'toTruong'
            ? 'daDuyet'
            : existingData.trangThai === 'tuChoi' || existingData.trangThai === 'nhap'
              ? existingData.trangThai
              : 'nhap';

      const updatePayload: Record<string, unknown> = {
        tieuDe: cleanTitle,
        tenBaiHoc: cleanLesson,
        moTa,
        monHoc,
        khoiLop,
        loai: 'Bài giảng PPT AI',
        the: tags,
        loaiNguon: 'pptAi',
        url: `https://kho-hoc-lieu.local/ppt-ai/${targetRef.id}`,
        tenTep: `${sanitizedFileBase}_Lop${khoiLop}.pptx`.slice(0, 255),
        kichThuocTep: 0,
        duongDanStorage: '',
        toKhoi: profile.toKhoi || 'Tổ Chuyên Môn',
        trangThai: nextStatus,
        lyDoTuChoi: '',
        slidesData,
        pptConfig,
        ngayCapNhat: serverTimestamp(),
      };

      if (profile.vaiTro === 'toTruong' && nextStatus === 'daDuyet') {
        updatePayload.ngayDuyet = serverTimestamp();
        updatePayload.nguoiDuyetUid = profile.uid;
        updatePayload.nguoiDuyetTen = profile.hoTen?.trim() || 'Tổ trưởng / BGH';
      }

      await setDoc(targetRef, updatePayload, { merge: true });
      return targetRef.id;
    }

    const initialStatus = getDefaultSavedPptStatus(profile);
    const isAutoApproved = initialStatus === 'daDuyet' || initialStatus === 'chiaSeToanTruong';
    const actorName = profile.hoTen?.trim() || 'Giáo viên';

    await setDoc(targetRef, {
      tieuDe: cleanTitle,
      tenBaiHoc: cleanLesson,
      moTa,
      monHoc,
      khoiLop,
      loai: 'Bài giảng PPT AI',
      the: tags,
      loaiNguon: 'pptAi',
      url: `https://kho-hoc-lieu.local/ppt-ai/${targetRef.id}`,
      tenTep: `${sanitizedFileBase}_Lop${khoiLop}.pptx`.slice(0, 255),
      kichThuocTep: 0,
      duongDanStorage: '',
      nguoiDangUid: profile.uid,
      nguoiDangTen: actorName,
      toKhoi: profile.toKhoi || 'Tổ Chuyên Môn',
      trangThai: initialStatus,
      lyDoTuChoi: '',
      luotXem: 0,
      luotTai: 0,
      ngayTao: serverTimestamp(),
      ngayCapNhat: serverTimestamp(),
      ngayDuyet: isAutoApproved ? serverTimestamp() : null,
      nguoiDuyetUid: isAutoApproved ? profile.uid : '',
      nguoiDuyetTen: isAutoApproved ? actorName : '',
      isSample: false,
      slidesData,
      pptConfig,
    });

    return targetRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function reconstructSlidesFromSavedMaterial(
  material: LearningMaterial
): PptSlideItem[] {
  const defaultStyleId: PptStyleId = material.pptConfig?.styleId || 'hoat_hinh_3d';
  const rawList = Array.isArray(material.slidesData) ? material.slidesData : [];
  return rawList.map((s, idx) => ({
    id: `${material.id}-slide-${idx + 1}`,
    slideNumber: s.slideNumber || idx + 1,
    title: s.title || `Slide ${idx + 1}`,
    bullets: Array.isArray(s.bullets) ? s.bullets : [],
    keyTakeaway: s.keyTakeaway || '',
    speakerNotes: s.speakerNotes || '',
    imageScenePrompt: s.imageScenePrompt || '',
    visualMotif: s.visualMotif || 'book',
    styleId: s.styleId || defaultStyleId,
    imageStatus: 'removed',
    imageDataUrl: null,
  }));
}
