import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { GoogleGenAI, Type } from '@google/genai';
import {
  PPT_MASCOT_LIBRARY,
  PPT_STYLE_LIBRARY,
  type PptGradeLevel,
  type PptOutlineResponse,
  type PptStyleId,
  type SlideVisualMotif,
} from '../src/types/ppt';

const ALLOWED_GRADES: PptGradeLevel[] = ['1', '2', '3', '4', '5'];
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

class HttpStatusError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface FirebaseRuntimeConfig {
  projectId: string;
  databaseId: string;
}

interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

let certCache: CertCache | null = null;

function getFirebaseConfig(): FirebaseRuntimeConfig {
  let fileProjectId = '';
  let fileDatabaseId = '';

  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
        projectId?: string;
        firestoreDatabaseId?: string;
      };
      fileProjectId = raw.projectId || '';
      fileDatabaseId = raw.firestoreDatabaseId || '';
    }
  } catch {
    // Fallback to env vars
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    fileProjectId;
  const databaseId =
    process.env.FIREBASE_DATABASE_ID ||
    process.env.VITE_FIREBASE_DATABASE_ID ||
    fileDatabaseId ||
    '(default)';

  if (!projectId) {
    throw new HttpStatusError(500, 'Thiếu cấu hình Firebase Project ID trên máy chủ.');
  }

  return { projectId, databaseId };
}

function decodeBase64Url(segment: string): Buffer {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && certCache.expiresAt > now) {
    return certCache.certs;
  }

  const response = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!response.ok) {
    throw new HttpStatusError(500, 'Không thể tải chứng chỉ xác thực Firebase.');
  }

  const certs = (await response.json()) as Record<string, string>;
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const ttlMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600 * 1000;

  certCache = {
    certs,
    expiresAt: now + Math.max(ttlMs, 60_000),
  };

  return certs;
}

async function verifyTeacherAuth(
  authHeader: string | undefined,
  cfg: FirebaseRuntimeConfig
): Promise<{ uid: string; idToken: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpStatusError(
      401,
      'Vui lòng đăng nhập tài khoản giáo viên trước khi tạo bài giảng PPT AI.'
    );
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new HttpStatusError(401, 'Firebase ID token không hợp lệ.');
  }

  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(decodeBase64Url(headerB64).toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(decodeBase64Url(payloadB64).toString('utf8')) as {
    aud?: string;
    iss?: string;
    exp?: number;
    sub?: string;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new HttpStatusError(401, 'Thuật toán token không được hỗ trợ.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (
    payload.aud !== cfg.projectId ||
    payload.iss !== `https://securetoken.google.com/${cfg.projectId}` ||
    !payload.exp ||
    payload.exp <= nowSec ||
    !payload.sub
  ) {
    throw new HttpStatusError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  }

  const certs = await getFirebasePublicCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new HttpStatusError(401, 'Không tìm thấy chứng chỉ khóa công khai phù hợp.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  if (!verifier.verify(cert, decodeBase64Url(sigB64))) {
    throw new HttpStatusError(401, 'Chữ ký Firebase ID token không hợp lệ.');
  }

  const profileUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    cfg.projectId
  )}/databases/${encodeURIComponent(cfg.databaseId)}/documents/users/${encodeURIComponent(
    payload.sub
  )}`;
  const profileRes = await fetch(profileUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (profileRes.status === 404 || profileRes.status === 403) {
    throw new HttpStatusError(403, 'Tài khoản chưa được cấp hồ sơ giáo viên hợp lệ.');
  }
  if (!profileRes.ok) {
    throw new HttpStatusError(500, 'Không thể xác minh quyền tài khoản trên Firestore.');
  }

  const doc = (await profileRes.json()) as {
    fields?: { biKhoa?: { booleanValue?: boolean }; vaiTro?: { stringValue?: string } };
  };
  if (doc.fields?.biKhoa?.booleanValue === true) {
    throw new HttpStatusError(403, 'Tài khoản của bạn đang bị khóa.');
  }
  const role = doc.fields?.vaiTro?.stringValue || 'giaoVien';
  if (!['giaoVien', 'toTruong', 'quanTri'].includes(role)) {
    throw new HttpStatusError(403, 'Vai trò tài khoản không có quyền tạo bài giảng AI.');
  }

  return { uid: payload.sub, idToken };
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new HttpStatusError(500, 'Máy chủ chưa cấu hình biến môi trường GEMINI_API_KEY.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

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

function sanitizeStyleId(raw: unknown): PptStyleId {
  const candidate = typeof raw === 'string' ? raw : '';
  const found = PPT_STYLE_LIBRARY.find((s) => s.id === candidate);
  return found ? found.id : PPT_STYLE_LIBRARY[0].id;
}

export async function generatePptOutlineForRequest(
  authHeader: string | undefined,
  body: unknown
): Promise<PptOutlineResponse> {
  const cfg = getFirebaseConfig();
  await verifyTeacherAuth(authHeader, cfg);
  const ai = getGeminiClient();

  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const monHoc = typeof payload.monHoc === 'string' ? payload.monHoc.trim().slice(0, 80) : '';
  const khoiLop = typeof payload.khoiLop === 'string' ? payload.khoiLop.trim() : '';
  const tenBaiHoc =
    typeof payload.tenBaiHoc === 'string' ? payload.tenBaiHoc.trim().slice(0, 180) : '';
  const soSlideRaw = Number(payload.soSlide ?? 6);
  const soSlide = Number.isFinite(soSlideRaw) ? Math.min(10, Math.max(4, Math.round(soSlideRaw))) : 6;
  const yeuCauBoSung =
    typeof payload.yeuCauBoSung === 'string' ? payload.yeuCauBoSung.trim().slice(0, 500) : '';

  if (!monHoc) {
    throw new HttpStatusError(400, 'Vui lòng chọn môn học.');
  }
  if (!ALLOWED_GRADES.includes(khoiLop as PptGradeLevel)) {
    throw new HttpStatusError(400, 'Vui lòng chọn khối lớp từ 1 đến 5.');
  }
  if (tenBaiHoc.length < 2) {
    throw new HttpStatusError(400, 'Vui lòng nhập tên bài học / chủ đề bài giảng.');
  }

  const mascotIds = sanitizeMascotIds(payload.mascotIds);
  const mascotNames = mascotIds
    .map((id) => PPT_MASCOT_LIBRARY.find((m) => m.id === id)?.name)
    .filter(Boolean)
    .join(' và ');

  const prompt = [
    `Hãy thiết kế bộ bài giảng PowerPoint gồm ĐÚNG ${soSlide} slide cho:`,
    `- Môn học: ${monHoc}`,
    `- Khối lớp: Lớp ${khoiLop} (Tiểu học Việt Nam)`,
    `- Tên bài học / chủ đề: ${tenBaiHoc}`,
    `- Nhân vật đồng hành cố định xuất hiện trong minh họa các slide: ${mascotNames}`,
    yeuCauBoSung ? `- Yêu cầu sư phạm bổ sung từ giáo viên: ${yeuCauBoSung}` : '',
    `Lưu ý: Phần imageScenePrompt viết bằng tiếng Anh ngắn gọn rõ ràng, mô tả cảnh minh họa sinh động gắn với ${mascotNames} và nội dung bài học, tuyệt đối không nhắc đến chữ viết hay con số trong tranh.`,
  ]
    .filter(Boolean)
    .join('\n');

  let rawText = '';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction: PPT_OUTLINE_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: PPT_OUTLINE_SCHEMA,
        maxOutputTokens: 6144,
      },
    });
    rawText = response.text || '';
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi kết nối Gemini API.';
    throw new HttpStatusError(502, `Không thể tạo nội dung bài giảng từ AI: ${msg}`);
  }

  let parsed: Record<string, unknown>;
  try {
    const cleaned = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new HttpStatusError(502, 'AI trả về cấu trúc JSON bài giảng chưa hợp lệ. Vui lòng thử lại.');
  }

  const rawSlides = Array.isArray(parsed.slides) ? parsed.slides : [];
  if (rawSlides.length === 0) {
    throw new HttpStatusError(502, 'AI chưa sinh được danh sách slide. Vui lòng thử lại.');
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
          : [`Tìm hiểu nội dung trọng tâm của bài ${tenBaiHoc}.`],
      keyTakeaway: String(
        row.keyTakeaway || 'Ghi nhớ kiến thức trọng tâm và chia sẻ cùng bạn bè.'
      ).trim(),
      speakerNotes: String(
        row.speakerNotes || 'Giáo viên gợi mở cho học sinh quan sát hình ảnh minh họa bên phải.'
      ).trim(),
      imageScenePrompt: String(
        row.imageScenePrompt ||
          `Friendly classroom learning scene for primary school lesson about ${tenBaiHoc}`
      ).trim(),
      visualMotif,
    };
  });

  return {
    deckTitle: String(parsed.deckTitle || tenBaiHoc).trim(),
    subtitle: String(
      parsed.subtitle || `Môn ${monHoc} · Lớp ${khoiLop} · Chương trình GDPT 2018`
    ).trim(),
    slides,
  };
}

export function buildFinalSlideImagePrompt(params: {
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

  const mascots = params.mascotIds
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

export async function generatePptSlideImageForRequest(
  authHeader: string | undefined,
  body: unknown
): Promise<{ imageDataUrl: string; modelUsed: string }> {
  const cfg = getFirebaseConfig();
  await verifyTeacherAuth(authHeader, cfg);
  const ai = getGeminiClient();

  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const scenePrompt =
    typeof payload.scenePrompt === 'string' ? payload.scenePrompt.trim().slice(0, 800) : '';
  const slideTitle =
    typeof payload.slideTitle === 'string' ? payload.slideTitle.trim().slice(0, 200) : '';
  const monHoc = typeof payload.monHoc === 'string' ? payload.monHoc.trim().slice(0, 80) : 'Tiểu học';
  const khoiLop = typeof payload.khoiLop === 'string' ? payload.khoiLop.trim() : '3';
  const styleId = sanitizeStyleId(payload.styleId);
  const sharedStylePrompt =
    typeof payload.sharedStylePrompt === 'string'
      ? payload.sharedStylePrompt.trim().slice(0, 600)
      : '';
  const mascotIds = sanitizeMascotIds(payload.mascotIds);

  if (!scenePrompt && !slideTitle) {
    throw new HttpStatusError(400, 'Thiếu mô tả cảnh minh họa cho slide.');
  }

  const finalPrompt = buildFinalSlideImagePrompt({
    scenePrompt: scenePrompt || slideTitle,
    slideTitle: slideTitle || 'Bài học tiểu học',
    monHoc,
    khoiLop,
    styleId,
    sharedStylePrompt,
    mascotIds,
  });

  const modelsToTry: Array<{ model: string; useImageSize: boolean }> = [
    { model: 'gemini-nano-banana-2.1', useImageSize: true },
    { model: 'gemini-3.1-flash-lite-image', useImageSize: false },
  ];

  let lastErrorMsg = 'Không thể tạo ảnh minh họa từ Gemini API.';

  for (const candidate of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: candidate.model,
        contents: {
          parts: [{ text: finalPrompt }],
        },
        config: {
          imageConfig: candidate.useImageSize
            ? { aspectRatio: '16:9', imageSize: '1K' }
            : { aspectRatio: '16:9' },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          return {
            imageDataUrl: `data:${mime};base64,${part.inlineData.data}`,
            modelUsed: candidate.model,
          };
        }
      }

      lastErrorMsg = `Model ${candidate.model} không trả về dữ liệu hình ảnh.`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastErrorMsg = msg;
      const lower = msg.toLowerCase();
      // If quota/auth/billing error on first model, still try general image model just in case, otherwise propagate
      if (lower.includes('api key') && !lower.includes('permission')) {
        break;
      }
    }
  }

  throw new HttpStatusError(502, `Sinh ảnh thất bại: ${lastErrorMsg}`);
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const existingBody = (req as IncomingMessage & { body?: unknown }).body;
    if (existingBody !== undefined) {
      resolve(existingBody);
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > 64 * 1024) {
        reject(new HttpStatusError(413, 'Dữ liệu yêu cầu quá lớn.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim();
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new HttpStatusError(400, 'Dữ liệu JSON không hợp lệ.'));
      }
    });
    req.on('error', () => reject(new HttpStatusError(400, 'Không đọc được nội dung yêu cầu.')));
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export async function handleGeneratePptNodeRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Phương thức không được hỗ trợ.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const result = await generatePptOutlineForRequest(authHeader, body);
    sendJson(res, 200, result);
  } catch (err) {
    if (err instanceof HttpStatusError) {
      sendJson(res, err.status, { error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Lỗi máy chủ nội bộ.';
    sendJson(res, 500, { error: msg });
  }
}

export async function handleGeneratePptImageNodeRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Phương thức không được hỗ trợ.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const result = await generatePptSlideImageForRequest(authHeader, body);
    sendJson(res, 200, result);
  } catch (err) {
    if (err instanceof HttpStatusError) {
      sendJson(res, err.status, { error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Lỗi máy chủ nội bộ.';
    sendJson(res, 500, { error: msg });
  }
}
