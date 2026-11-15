import { Type } from '@google/genai';
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../config/firebase';
import {
  generateImageWithClientGemini,
  generateTextWithClientGemini,
} from '../utils/geminiClient';
import { buildTeacherApiHeaders } from '../utils/ssoAuth';
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

export const PPT_IMAGE_MAX_CONCURRENCY = 3;
export const PPT_IMAGE_TIMEOUT_MS = 45_000;
export const PPT_IMAGE_MAX_RETRIES = 2;

const ALLOWED_MOTIFS: SlideVisualMotif[] = [
  'book',
  'sparkles',
  'lightbulb',
  'compass',
  'puzzle',
  'award',
  'users',
  'leaf',
];

const PPT_OUTLINE_SYSTEM_INSTRUCTION = `Bạn là Chuyên gia Thiết kế Bài giảng Tiểu học Việt Nam (Chương trình GDPT 2018).
Nhiệm vụ của bạn là thiết kế dàn ý bài giảng PowerPoint sinh động, súc tích, dễ dạy trên lớp cho giáo viên tiểu học (lớp 1 đến lớp 5).

QUY TẮC NỘI DUNG SLIDE:
1. Slide 1 là Slide mở đầu / Khởi động giới thiệu tên bài học hấp dẫn.
2. Các slide tiếp theo triển khai logic sư phạm: Khám phá kiến thức -> Thực hành / Luyện tập -> Vận dụng -> Tổng kết / Dặn dò.
3. Mỗi slide có:
   - title: Tiêu đề ngắn gọn, nổi bật (6-12 từ).
   - bullets: 3 đến 4 ý chính súc tích, dễ đọc trên máy chiếu (mỗi ý 8-18 từ, chữ tiếng Việt chuẩn xác, không dài dòng).
   - keyTakeaway: 1 câu ghi nhớ ngắn (hoặc hoạt động tương tác lớp học) ở cuối slide.
   - speakerNotes: Gợi ý lời giảng / câu hỏi gợi mở cho giáo viên khi trình chiếu.
   - imageScenePrompt: Mô tả BẰNG TIẾNG ANH chi tiết cảnh minh họa trực quan phù hợp nội dung slide đó để gửi cho AI vẽ ảnh. CHỈ mô tả cảnh vật, hành động, đồ vật học tập, bối cảnh; TUYỆT ĐỐI KHÔNG yêu cầu vẽ chữ viết, con số, phép tính có ký tự, bảng chữ hay bong bóng thoại.
   - visualMotif: Chọn đúng 1 giá trị trong: book, sparkles, lightbulb, compass, puzzle, award, users, leaf.`;

const PPT_OUTLINE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    deckTitle: { type: Type.STRING },
    subtitle: { type: Type.STRING },
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          slideNumber: { type: Type.INTEGER },
          title: { type: Type.STRING },
          bullets: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          keyTakeaway: { type: Type.STRING },
          speakerNotes: { type: Type.STRING },
          imageScenePrompt: { type: Type.STRING },
          visualMotif: { type: Type.STRING },
        },
        required: [
          'slideNumber',
          'title',
          'bullets',
          'keyTakeaway',
          'speakerNotes',
          'imageScenePrompt',
          'visualMotif',
        ],
      },
    },
  },
  required: ['deckTitle', 'subtitle', 'slides'],
};

function sanitizeMascotIds(raw: unknown): string[] {
  const validIds = new Set(PPT_MASCOT_LIBRARY.map((m) => m.id));
  const list = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string' && validIds.has(item))
    : [];
  const unique = Array.from(new Set(list)).slice(0, 2);
  return unique.length > 0 ? unique : [PPT_MASCOT_LIBRARY[0].id];
}

function buildFinalSlideImagePrompt(params: {
  scenePrompt: string;
  slideTitle: string;
  monHoc: string;
  khoiLop: string;
  styleId: PptStyleId;
  sharedStylePrompt: string;
  mascotIds: string[];
}): string {
  const stylePreset =
    PPT_STYLE_LIBRARY.find((s) => s.id === params.styleId) ?? PPT_STYLE_LIBRARY[0];
  const globalStyle = params.sharedStylePrompt.trim() || stylePreset.stylePrompt;

  const mascots = sanitizeMascotIds(params.mascotIds)
    .map((id) => PPT_MASCOT_LIBRARY.find((m) => m.id === id)?.promptDesc)
    .filter((v): v is string => Boolean(v));

  const mascotClause =
    mascots.length > 0
      ? `FIXED RECURRING CHARACTERS (keep exact same appearance, clothing, colors, and proportions in every slide): ${mascots.join(' together with ')}.`
      : '';

  return [
    `SHARED VISUAL STYLE: ${globalStyle}.`,
    mascotClause,
    `EDUCATIONAL SCENE TO ILLUSTRATE (Vietnamese primary school Grade ${params.khoiLop}, subject ${params.monHoc}, slide topic "${params.slideTitle}"): ${params.scenePrompt}.`,
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

function normalizeClientOutlineResponse(
  rawText: string,
  config: PptGenerationConfig
): PptOutlineResponse {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error('AI trả về cấu trúc JSON bài giảng chưa hợp lệ. Vui lòng thử lại.');
  }

  const rawSlides = Array.isArray(parsed.slides) ? parsed.slides : [];
  if (rawSlides.length === 0) {
    throw new Error('AI chưa sinh được danh sách slide. Vui lòng thử lại.');
  }

  const slides = rawSlides.slice(0, 12).map((item, idx) => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const rawMotif = typeof row.visualMotif === 'string' ? row.visualMotif.trim() : 'book';
    const visualMotif = ALLOWED_MOTIFS.includes(rawMotif as SlideVisualMotif)
      ? (rawMotif as SlideVisualMotif)
      : ALLOWED_MOTIFS[idx % ALLOWED_MOTIFS.length];

    const bullets = Array.isArray(row.bullets)
      ? row.bullets
          .map((b) => String(b ?? '').trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];

    return {
      slideNumber: idx + 1,
      title: String(row.title || `Hoạt động ${idx + 1}`).trim(),
      bullets:
        bullets.length > 0
          ? bullets
          : [`Tìm hiểu nội dung trọng tâm của bài ${config.tenBaiHoc}.`],
      keyTakeaway: String(
        row.keyTakeaway || 'Ghi nhớ kiến thức trọng tâm và chia sẻ cùng bạn bè.'
      ).trim(),
      speakerNotes: String(
        row.speakerNotes || 'Giáo viên gợi mở cho học sinh quan sát hình ảnh minh họa bên phải.'
      ).trim(),
      imageScenePrompt: String(
        row.imageScenePrompt ||
          `Friendly classroom learning scene for primary school lesson about ${config.tenBaiHoc}`
      ).trim(),
      visualMotif,
    };
  });

  return {
    deckTitle: String(parsed.deckTitle || config.tenBaiHoc).trim(),
    subtitle: String(
      parsed.subtitle || `Môn ${config.monHoc} · Lớp ${config.khoiLop} · Chương trình GDPT 2018`
    ).trim(),
    slides,
  };
}

export async function generatePptOutline(
  config: PptGenerationConfig
): Promise<PptOutlineResponse> {
  const mascotIds = sanitizeMascotIds(config.mascotIds);
  const mascotNames = mascotIds
    .map((id) => PPT_MASCOT_LIBRARY.find((m) => m.id === id)?.name)
    .filter(Boolean)
    .join(' và ');
  const soSlide = Number.isFinite(config.soSlide)
    ? Math.min(10, Math.max(4, Math.round(config.soSlide)))
    : 6;

  const prompt = [
    `Hãy thiết kế bộ bài giảng PowerPoint gồm ĐÚNG ${soSlide} slide cho:`,
    `- Môn học: ${config.monHoc}`,
    `- Khối lớp: Lớp ${config.khoiLop} (Tiểu học Việt Nam)`,
    `- Tên bài học / chủ đề: ${config.tenBaiHoc}`,
    `- Nhân vật đồng hành cố định xuất hiện trong minh họa các slide: ${mascotNames}`,
    config.yeuCauBoSung?.trim()
      ? `- Yêu cầu sư phạm bổ sung từ giáo viên: ${config.yeuCauBoSung.trim()}`
      : '',
    `Lưu ý: Phần imageScenePrompt viết bằng tiếng Anh ngắn gọn rõ ràng, mô tả cảnh minh họa sinh động gắn với ${mascotNames} và nội dung bài học, tuyệt đối không nhắc đến chữ viết hay con số trong tranh.`,
  ]
    .filter(Boolean)
    .join('\n');

  const clientRes = await generateTextWithClientGemini({
    contents: prompt,
    config: {
      systemInstruction: PPT_OUTLINE_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: PPT_OUTLINE_SCHEMA,
      maxOutputTokens: 6144,
    },
  });

  if (clientRes !== null) {
    return normalizeClientOutlineResponse(clientRes.text, config);
  }

  // Fallback to backend server route only when no client API key is configured
  const headers = await buildTeacherApiHeaders();
  const response = await fetch('/api/generate-ppt', {
    method: 'POST',
    headers,
    body: JSON.stringify(config),
  });

  const data = (await response.json().catch(() => ({}))) as Partial<PptOutlineResponse> & {
    error?: string;
  };

  if (!response.ok || !Array.isArray(data.slides)) {
    if (response.status === 404) {
      throw new Error(
        'Chưa cấu hình Google Gemini API Key. Thầy/cô vui lòng mở "Cấu hình Gemini API Key" ở menu bên trái để nhập API Key (AIzaSy...).'
      );
    }
    throw new Error(
      data.error || `Không thể tạo dàn ý bài giảng PPT (mã lỗi ${response.status}).`
    );
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
}

function runWithTimeoutAndAbort<T>(
  task: Promise<T>,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (externalSignal?.aborted) {
      reject(new DOMException('Đã hủy tác vụ sinh ảnh.', 'AbortError'));
      return;
    }

    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(new DOMException('Đã hủy tác vụ sinh ảnh.', 'AbortError'));
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      externalSignal?.removeEventListener('abort', onAbort);
      reject(new Error('Hết thời gian chờ sinh ảnh (timeout 45 giây).'));
    }, timeoutMs);

    externalSignal?.addEventListener('abort', onAbort, { once: true });

    task.then(
      (res) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        externalSignal?.removeEventListener('abort', onAbort);
        resolve(res);
      },
      (err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        externalSignal?.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

export async function requestSingleSlideImage(
  params: SlideImageRequestParams,
  externalSignal?: AbortSignal
): Promise<{ imageDataUrl: string; modelUsed: string }> {
  if (externalSignal?.aborted) {
    throw new DOMException('Đã hủy tác vụ sinh ảnh.', 'AbortError');
  }

  const finalPrompt = buildFinalSlideImagePrompt({
    scenePrompt: (params.scenePrompt || params.slideTitle || '').trim(),
    slideTitle: (params.slideTitle || 'Bài học tiểu học').trim(),
    monHoc: params.monHoc || 'Tiểu học',
    khoiLop: params.khoiLop || '3',
    styleId: params.styleId,
    sharedStylePrompt: params.sharedStylePrompt || '',
    mascotIds: params.mascotIds || [],
  });

  const clientImg = await runWithTimeoutAndAbort(
    generateImageWithClientGemini({ prompt: finalPrompt }),
    PPT_IMAGE_TIMEOUT_MS,
    externalSignal
  );

  if (clientImg !== null) {
    return clientImg;
  }

  // Fallback to backend server route only when no client API key is configured
  const headers = await buildTeacherApiHeaders();

  const controller = new AbortController();
  let timedOut = false;

  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, PPT_IMAGE_TIMEOUT_MS);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      window.clearTimeout(timer);
      throw new DOMException('Đã hủy tác vụ sinh ảnh.', 'AbortError');
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const response = await fetch('/api/generate-ppt-image', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    const data = (await response.json().catch(() => ({}))) as {
      imageDataUrl?: string;
      modelUsed?: string;
      error?: string;
    };

    if (!response.ok || !data.imageDataUrl) {
      throw new Error(
        data.error || `Không thể sinh ảnh minh họa (mã lỗi ${response.status}).`
      );
    }

    return {
      imageDataUrl: data.imageDataUrl,
      modelUsed: data.modelUsed || 'gemini-image',
    };
  } catch (err) {
    if (timedOut) {
      throw new Error('Hết thời gian chờ sinh ảnh (timeout 45 giây).');
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
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
