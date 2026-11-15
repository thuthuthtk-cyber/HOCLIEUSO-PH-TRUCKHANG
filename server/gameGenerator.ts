import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { GoogleGenAI } from '@google/genai';

export const DAILY_AI_GAME_LIMIT = 20;

export const ALLOWED_GAME_TYPES = [
  'Trắc nghiệm',
  'Ghép đôi',
  'Ô chữ',
  'Kéo thả',
  'Đúng/Sai',
  'Tự do (sáng tạo)',
] as const;

export type ServerGameType = (typeof ALLOWED_GAME_TYPES)[number];

export const ALLOWED_QUESTION_COUNTS = [5, 8, 10, 15] as const;
export type ServerQuestionCount = (typeof ALLOWED_QUESTION_COUNTS)[number];

export const ALLOWED_DIFFICULTIES = ['Dễ', 'Vừa', 'Khó'] as const;
export type ServerDifficulty = (typeof ALLOWED_DIFFICULTIES)[number];

const LESSON_NAME_MAX_LENGTH = 150;
const STANDARD_PROMPT_MAX_LENGTH = 300;
const CREATIVE_PROMPT_MAX_LENGTH = 600;

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
    // Fallback to env vars below
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
    throw new Error('Thiếu cấu hình Firebase Project ID trên máy chủ.');
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
    throw new Error('Không thể tải chứng chỉ xác thực Firebase.');
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

interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  idToken: string;
}

async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string
): Promise<VerifiedFirebaseUser> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Token xác thực không hợp lệ.');
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
    iat?: number;
    sub?: string;
    email?: string;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Thuật toán token không được hỗ trợ.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) {
    throw new Error('Token không thuộc dự án Firebase hiện tại.');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Nguồn phát hành token không hợp lệ.');
  }
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error('Phiên đăng nhập đã hết hạn, vui lòng thử lại.');
  }
  if (payload.iat && payload.iat > nowSec + 300) {
    throw new Error('Thời gian phát hành token không hợp lệ.');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Không xác định được tài khoản người dùng.');
  }

  const certs = await getFirebasePublicCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new Error('Không tìm thấy chứng chỉ khóa công khai phù hợp.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const signature = decodeBase64Url(sigB64);
  if (!verifier.verify(cert, signature)) {
    throw new Error('Chữ ký Firebase ID token không hợp lệ.');
  }

  return {
    uid: payload.sub,
    email: payload.email || '',
    idToken,
  };
}

function getVietnamDateKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function firestoreDocBaseUrl(projectId: string, databaseId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(databaseId)}/documents`;
}

interface FirestoreDocumentResponse {
  name?: string;
  updateTime?: string;
  fields?: Record<
    string,
    {
      stringValue?: string;
      integerValue?: string;
      booleanValue?: boolean;
    }
  >;
}

async function assertActiveTeacherProfile(
  uid: string,
  idToken: string,
  cfg: FirebaseRuntimeConfig
): Promise<void> {
  const url = `${firestoreDocBaseUrl(cfg.projectId, cfg.databaseId)}/users/${encodeURIComponent(
    uid
  )}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (res.status === 404 || res.status === 403) {
    throw new HttpStatusError(403, 'Tài khoản chưa được cấp hồ sơ sử dụng Kho học liệu.');
  }
  if (!res.ok) {
    throw new HttpStatusError(500, 'Không thể kiểm tra quyền tài khoản trên Firestore.');
  }

  const doc = (await res.json()) as FirestoreDocumentResponse;
  if (doc.fields?.biKhoa?.booleanValue === true) {
    throw new HttpStatusError(403, 'Tài khoản của bạn đang bị khóa.');
  }

  const role = doc.fields?.vaiTro?.stringValue || 'giaoVien';
  if (!['giaoVien', 'toTruong', 'quanTri'].includes(role)) {
    throw new HttpStatusError(403, 'Vai trò tài khoản không có quyền tạo trò chơi AI.');
  }
}

async function readDailyQuota(
  uid: string,
  dateKey: string,
  idToken: string,
  cfg: FirebaseRuntimeConfig
): Promise<{ count: number; updateTime?: string }> {
  const quotaId = `${uid}_${dateKey}`;
  const url = `${firestoreDocBaseUrl(
    cfg.projectId,
    cfg.databaseId
  )}/ai_game_quotas/${encodeURIComponent(quotaId)}`;

  try {
    const headers: Record<string, string> = idToken
      ? { Authorization: `Bearer ${idToken}` }
      : {};
    const res = await fetch(url, { headers });

    if (res.status === 404) {
      return { count: 0 };
    }
    if (!res.ok) {
      if (!idToken) return { count: 0 };
      throw new HttpStatusError(500, 'Không thể kiểm tra giới hạn sử dụng hôm nay.');
    }

    const doc = (await res.json()) as FirestoreDocumentResponse;
    const count = Number(doc.fields?.count?.integerValue || '0');
    return { count, updateTime: doc.updateTime };
  } catch (err) {
    if (!idToken) return { count: 0 };
    throw err;
  }
}

async function incrementDailyQuota(
  uid: string,
  dateKey: string,
  idToken: string,
  cfg: FirebaseRuntimeConfig
): Promise<number> {
  const quotaId = `${uid}_${dateKey}`;
  const docPath = `projects/${cfg.projectId}/databases/${cfg.databaseId}/documents/ai_game_quotas/${quotaId}`;
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    cfg.projectId
  )}/databases/${encodeURIComponent(cfg.databaseId)}/documents:commit`;

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await readDailyQuota(uid, dateKey, idToken, cfg);
      if (current.count >= DAILY_AI_GAME_LIMIT) {
        throw new HttpStatusError(
          429,
          `Bạn đã dùng hết ${DAILY_AI_GAME_LIMIT} lượt tạo trò chơi AI trong ngày hôm nay.`
        );
      }

      const nextCount = current.count + 1;
      const writeOp = current.updateTime
        ? {
            update: {
              name: docPath,
              fields: {
                uid: { stringValue: uid },
                date: { stringValue: dateKey },
                count: { integerValue: String(nextCount) },
              },
            },
            updateMask: { fieldPaths: ['count'] },
            updateTransforms: [
              { fieldPath: 'ngayCapNhat', setToServerValue: 'REQUEST_TIME' },
            ],
            currentDocument: { updateTime: current.updateTime },
          }
        : {
            update: {
              name: docPath,
              fields: {
                uid: { stringValue: uid },
                date: { stringValue: dateKey },
                count: { integerValue: String(nextCount) },
              },
            },
            updateTransforms: [
              { fieldPath: 'ngayCapNhat', setToServerValue: 'REQUEST_TIME' },
            ],
            currentDocument: { exists: false },
          };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }

      const res = await fetch(commitUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ writes: [writeOp] }),
      });

      if (res.ok) {
        return nextCount;
      }

      if (res.status === 409 || res.status === 400) {
        continue;
      }

      if (!idToken) {
        return nextCount;
      }

      throw new HttpStatusError(500, 'Không thể cập nhật bộ đếm lượt tạo trò chơi hôm nay.');
    }

    if (!idToken) return 1;
    throw new HttpStatusError(429, 'Yêu cầu đồng thời vượt giới hạn, vui lòng thử lại.');
  } catch (err) {
    if (!idToken && !(err instanceof HttpStatusError && err.status === 429)) {
      return 1;
    }
    throw err;
  }
}

class HttpStatusError extends Error {
  status: number;
  refused: boolean;
  constructor(status: number, message: string, refused = false) {
    super(message);
    this.status = status;
    this.refused = refused;
  }
}

function tryExtractRefusalReason(rawText: string): string | null {
  const trimmed = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { refused?: unknown; reason?: unknown };
      if (parsed && parsed.refused === true) {
        const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
        return (
          reason ||
          'Mô tả trò chơi có nội dung chưa phù hợp với học sinh tiểu học hoặc chưa gắn với mục tiêu học tập. Thầy/cô vui lòng điều chỉnh lại mô tả nhé!'
        );
      }
    } catch {
      // Fallback below if malformed JSON
    }
  }

  const hasHtml = /<!DOCTYPE\s+html|<html[\s>]/i.test(rawText);
  if (!hasHtml && trimmed.length > 0 && trimmed.length < 1200) {
    return trimmed;
  }

  return null;
}

function cleanAndValidateGameHtml(rawText: string): string {
  const refusalReason = tryExtractRefusalReason(rawText);
  if (refusalReason) {
    throw new HttpStatusError(400, refusalReason, true);
  }

  let html = rawText.trim();

  // Remove markdown fences if model wrapped HTML
  html = html
    .replace(/^```(?:html|HTML)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const doctypeIdx = html.search(/<!DOCTYPE\s+html/i);
  const htmlStartIdx = doctypeIdx >= 0 ? doctypeIdx : html.search(/<html[\s>]/i);
  const htmlEndIdx = html.toLowerCase().lastIndexOf('</html>');

  if (htmlStartIdx < 0 || htmlEndIdx < 0) {
    throw new HttpStatusError(
      502,
      'AI trả về mã trò chơi chưa đầy đủ định dạng HTML. Vui lòng bấm Tạo lại.'
    );
  }

  html = html.slice(htmlStartIdx, htmlEndIdx + '</html>'.length);
  if (!/^<!DOCTYPE\s+html/i.test(html)) {
    html = `<!DOCTYPE html>\n${html}`;
  }

  // Strip any external scripts, external stylesheets, font imports, or external images
  html = html.replace(
    /<script\b[^>]*\bsrc\s*=\s*["']https?:\/\/[^"']*["'][^>]*>[\s\S]*?<\/script>/gi,
    ''
  );
  html = html.replace(
    /<link\b[^>]*\bhref\s*=\s*["']https?:\/\/[^"']*["'][^>]*\/?>/gi,
    ''
  );
  html = html.replace(/@import\s+url\([^)]*https?:\/\/[^)]*\)\s*;?/gi, '');

  if (html.length < 500 || html.length > 340_000) {
    throw new HttpStatusError(
      502,
      'Mã HTML trò chơi vượt ngoài giới hạn kích thước cho phép. Vui lòng bấm Tạo lại.'
    );
  }

  return html;
}

const GAME_SYSTEM_INSTRUCTION = `Bạn là chuyên gia sư phạm tiểu học và thiết kế trò chơi giáo dục HTML5 dành cho học sinh tiểu học Việt Nam (lớp 1 đến lớp 5).

QUY TẮC KIỂM DUYỆT AN TOÀN & HỌC TẬP (ƯU TIÊN CAO NHẤT):
- Trước khi tạo trò chơi, hãy kiểm tra cả Tên bài học lẫn Mô tả trò chơi của giáo viên.
- Nếu nội dung chứa yếu tố KHÔNG phù hợp với trẻ em tiểu học (bạo lực, máu me, vũ khí sát thương, kinh dị, 18+, cờ bạc, cá độ, chất kích thích, ngôn từ thô tục, xúc phạm, tự gây hại...) HOẶC hoàn toàn KHÔNG liên quan đến học tập / giáo dục (ví dụ: giao dịch tiền ảo, đánh bạc, tin tức người lớn, tán tỉnh...), BẮT BUỘC TỪ CHỐI tạo trò chơi.
- Khi từ chối, KHÔNG xuất HTML, chỉ trả về DUY NHẤT một chuỗi JSON đúng định dạng:
  {"refused": true, "reason": "Lời từ chối lịch sự, thân thiện bằng tiếng Việt giải thích ngắn gọn và gợi ý giáo viên nhập nội dung gắn với bài học tiểu học."}

QUY TẮC SƯ PHẠM & CHẤT LƯỢNG CÂU HỎI (BẮT BUỘC):
1. Toàn bộ câu hỏi và đáp án PHẢI bám sát đúng "Tên bài học / nội dung kiến thức" và chương trình giáo dục phổ thông tiểu học của Khối lớp đã chọn. Không đi lạc sang kiến thức ngoài bài học hoặc vượt quá phạm vi lớp học.
2. Tạo ĐÚNG "Số câu hỏi" yêu cầu (5, 8, 10 hoặc 15 câu/cặp/hàng/thử thách tương ứng) với độ khó khớp đúng "Mức độ" đã chọn:
   - Dễ: Kiến thức nhận biết trực tiếp, phép tính/từ ngữ cơ bản, quen thuộc.
   - Vừa: Thông hiểu và vận dụng chuẩn trọng tâm bài học.
   - Khó: Vận dụng linh hoạt, có tính suy luận phù hợp học sinh khá giỏi ở đúng khối lớp đó.
3. Mỗi lần nhận yêu cầu (đặc biệt khi giáo viên bấm "Tạo lại"), PHẢI sinh một bộ câu hỏi MỚI hoàn toàn với số liệu, phép tính, từ ngữ, tình huống và ngữ cảnh khác nhau, không lặp lại máy móc.
4. Đáp án đúng phải tuyệt đối chính xác về khoa học và sư phạm. Các đáp án sai CHỈ là phương án gây nhiễu hợp lý (gần đúng hoặc lỗi sai học sinh hay mắc), tuyệt đối không đặt đáp án vô lý quá lộ liễu và không để câu hỏi có nhiều hơn 1 đáp án đúng (với dạng 1 lựa chọn).
5. Lời giải thích sau mỗi lần trả lời phải NGẮN GỌN (1-2 câu), súc tích, thân thiện và thật dễ hiểu với học sinh tiểu học.

QUY TẮC THIẾT KẾ TRÒ CHƠI HTML5:
6. Làm ĐÚNG theo mô tả của giáo viên về cách chơi, luật chơi, nhân vật và bối cảnh. Riêng ở chế độ "Tự do (sáng tạo)", mô tả của giáo viên chỉ dùng để xác định cách chơi và bối cảnh (không yêu cầu giáo viên phải viết sẵn câu hỏi trong mô tả), bạn hãy tự sinh đủ bộ câu hỏi bám sát Tên bài học, Môn học, Khối lớp, Số câu hỏi và Mức độ.
7. Chỉ trả về MỘT tệp HTML tự chứa hoàn chỉnh (bắt đầu bằng <!DOCTYPE html>, kết thúc bằng </html>; toàn bộ CSS nằm trong <style>, toàn bộ JS nằm trong <script>). Không thêm lời dẫn hay bọc markdown.
8. Ngôn ngữ 100% tiếng Việt chuẩn mực, chữ LỚN rõ ràng (nội dung >= 18px, nút bấm >= 48px), màu sắc tươi vui, sinh động, phù hợp lứa tuổi tiểu học.
9. Hỗ trợ chơi tốt bằng CẢ 3 cách: CHUỘT (click/kéo thả), CẢM ỨNG trên điện thoại/máy tính bảng (nút chạm lớn, có nút điều hướng ảo trên màn hình nếu trò chơi cần di chuyển), và BÀN PHÍM (phím mũi tên, Space/Enter hoặc phím 1-4/A-D).
10. Có hiển thị điểm số, thông báo đúng/sai rõ ràng kèm giải thích ngắn dễ hiểu, màn hình tổng kết và nút "Chơi lại" (khi bấm Chơi lại hoặc Tạo lại chơi rất mượt).
11. Tuyệt đối KHÔNG tải tài nguyên bên ngoài (không CDN, không Google Fonts, không link/script/img từ internet); chỉ dùng Unicode/emoji hoặc inline SVG.
12. Tuyệt đối KHÔNG bạo lực, không yếu tố gây sợ hãi (kể cả trò chơi bắn bóng bay hay vượt chướng ngại vật phải dùng hiệu ứng bong bóng/hoa quả/đồ chơi dễ thương, lành mạnh).`;

function buildGamePrompt(params: {
  monHoc: string;
  khoiLop: string;
  tenBaiHoc: string;
  soCauHoi: ServerQuestionCount;
  mucDo: ServerDifficulty;
  dangTroChoi: ServerGameType;
  yeuCau: string;
  generationNonce: string;
}): string {
  const gradeText =
    params.khoiLop === 'Dùng chung'
      ? 'Học sinh tiểu học (dùng chung)'
      : `Lớp ${params.khoiLop} (Tiểu học)`;

  const mechanicsGuide: Record<ServerGameType, string> = {
    'Trắc nghiệm': `Tạo đúng ${params.soCauHoi} câu hỏi trắc nghiệm 4 lựa chọn A/B/C/D bám sát bài "${params.tenBaiHoc}" (hỗ trợ click, chạm và phím 1-4/A-D), có thanh tiến độ 1/${params.soCauHoi}, chấm điểm ngay sau mỗi lần chọn kèm lời giải thích ngắn dễ hiểu và nút Câu tiếp theo.`,
    'Ghép đôi': `Tạo bảng ghép đôi đúng ${params.soCauHoi} cặp thẻ kiến thức thuộc bài "${params.tenBaiHoc}" (câu hỏi - đáp án, phép tính - kết quả, từ - nghĩa...) hỗ trợ chuột, chạm và bàn phím. Chọn đúng phát sáng xanh, hiển thị giải thích ngắn và giữ cặp; chọn sai rung nhẹ và gợi ý ngắn để thử lại.`,
    'Ô chữ': `Tạo trò chơi Ô chữ tiếng Việt gồm đúng ${params.soCauHoi} hàng ngang (hoặc chia thành các lượt hợp lý đủ ${params.soCauHoi} từ khóa) bám sát bài "${params.tenBaiHoc}" với gợi ý rõ ràng; hỗ trợ nhập bàn phím lẫn bấm nút chữ trên màn hình cho cảm ứng, hiển thị giải thích ngắn khi giải đúng mỗi hàng.`,
    'Kéo thả': `Tạo trò chơi Kéo thả gồm đúng ${params.soCauHoi} thẻ nội dung/câu hỏi bám sát bài "${params.tenBaiHoc}" (hỗ trợ cả kéo thả chuột lẫn bấm-chọn-rồi-bấm-ô cho cảm ứng điện thoại và bàn phím), có phản hồi đúng/sai kèm giải thích ngắn dễ hiểu và nút Chơi lại.`,
    'Đúng/Sai': `Tạo đúng ${params.soCauHoi} câu nhận định rõ ràng bám sát bài "${params.tenBaiHoc}" với 2 nút lớn ĐÚNG và SAI (hỗ trợ click, chạm và phím mũi tên / 1-2), chấm điểm ngay và hiện giải thích ngắn thân thiện cho học sinh tiểu học.`,
    'Tự do (sáng tạo)': `Thiết kế gameplay tương tác đúng sát với bối cảnh và cách chơi giáo viên đã mô tả (ví dụ: khám phá kho báu, đua xe, bắn bóng bay, mê cung, nhảy qua chướng ngại, nấu ăn/bán hàng, cứu hộ động vật...). Lồng ghép mượt mà ĐÚNG ${params.soCauHoi} câu hỏi/thử thách kiến thức bám sát bài học "${params.tenBaiHoc}" ở mức độ "${params.mucDo}"; BẮT BUỘC có đủ điều khiển bằng chuột, nút chạm cảm ứng trên màn hình điện thoại và bàn phím, kèm giải thích ngắn mỗi câu.`,
  };

  const extraDescription =
    params.yeuCau.trim() ||
    'Thiết kế giao diện thân thiện, sinh động, phù hợp với học sinh tiểu học.';

  return `Hãy thiết kế trò chơi giáo dục HTML5 tự chứa theo đầy đủ từng thông số sau:
1. Môn học: ${params.monHoc}
2. Khối lớp: ${gradeText}
3. Tên bài học / nội dung kiến thức trọng tâm: ${params.tenBaiHoc}
4. Số câu hỏi: ${params.soCauHoi} câu
5. Mức độ: ${params.mucDo}
6. Dạng trò chơi: ${params.dangTroChoi}
7. Mô tả trò chơi (cách chơi, bối cảnh / yêu cầu bổ sung): ${extraDescription}
8. Mã phiên sinh đề ngẫu nhiên (bắt buộc tạo bộ câu hỏi, số liệu và ngữ cảnh MỚI cho mã này): ${params.generationNonce}

HƯỚNG DẪN CƠ CHẾ CHƠI CẦN ĐÁP ỨNG:
${mechanicsGuide[params.dangTroChoi]}

Lưu ý kiểm tra lại trước khi xuất:
- Kiểm tra tính phù hợp với trẻ em và mục tiêu học tập trước; nếu vi phạm hãy trả JSON từ chối như hệ thống đã quy định.
- Đảm bảo đủ chính xác ${params.soCauHoi} câu hỏi/thử thách, đáp án chuẩn xác, đáp án nhiễu hợp lý, lời giải thích ngắn dễ hiểu.
- Chỉ xuất duy nhất tệp HTML5 tự chứa từ <!DOCTYPE html> đến </html>, hiển thị vừa vặn trên cả điện thoại và máy tính, không dùng alert()/confirm().`;
}

export interface GenerateGameInput {
  monHoc: string;
  khoiLop: string;
  tenBaiHoc: string;
  soCauHoi: ServerQuestionCount;
  mucDo: ServerDifficulty;
  dangTroChoi: ServerGameType;
  yeuCau: string;
}

export interface GenerateGameResult {
  html: string;
  usedToday: number;
  remainingToday: number;
  dailyLimit: number;
}

function extractSsoIdentity(
  headers?: IncomingMessage['headers'],
  body?: unknown
): { ssoEmail: string; ssoUid: string } {
  const rawHeaderEmail = headers?.['x-sso-email'];
  const headerEmail = (
    Array.isArray(rawHeaderEmail) ? rawHeaderEmail[0] : rawHeaderEmail || ''
  ).trim();
  const rawHeaderUid = headers?.['x-sso-uid'];
  const headerUid = (
    Array.isArray(rawHeaderUid) ? rawHeaderUid[0] : rawHeaderUid || ''
  ).trim();

  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const bodyEmail = typeof payload.ssoEmail === 'string' ? payload.ssoEmail.trim() : '';
  const bodyUid = typeof payload.ssoUid === 'string' ? payload.ssoUid.trim() : '';

  return {
    ssoEmail: headerEmail || bodyEmail,
    ssoUid: headerUid || bodyUid,
  };
}

export async function generateAiGameForRequest(
  authHeader: string | undefined,
  body: unknown,
  headers?: IncomingMessage['headers']
): Promise<GenerateGameResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new HttpStatusError(
      500,
      'Máy chủ chưa cấu hình biến môi trường GEMINI_API_KEY.'
    );
  }

  const cfg = getFirebaseConfig();
  const { ssoEmail, ssoUid } = extractSsoIdentity(headers, body);
  let user: VerifiedFirebaseUser;

  if (ssoEmail || !authHeader || !authHeader.startsWith('Bearer ')) {
    user = {
      uid: ssoUid || 'sso_thuthuthtk',
      email: ssoEmail || 'thuthuthtk@gmail.com',
      idToken: '',
    };
  } else {
    const idToken = authHeader.slice('Bearer '.length).trim();
    if (!idToken) {
      user = {
        uid: ssoUid || 'sso_thuthuthtk',
        email: ssoEmail || 'thuthuthtk@gmail.com',
        idToken: '',
      };
    } else {
      try {
        user = await verifyFirebaseIdToken(idToken, cfg.projectId);
        await assertActiveTeacherProfile(user.uid, user.idToken, cfg);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Xác thực người dùng thất bại.';
        throw new HttpStatusError(401, msg);
      }
    }
  }

  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const monHoc = typeof payload.monHoc === 'string' ? payload.monHoc.trim() : '';
  const khoiLop = typeof payload.khoiLop === 'string' ? payload.khoiLop.trim() : '';
  const tenBaiHoc = typeof payload.tenBaiHoc === 'string' ? payload.tenBaiHoc.trim() : '';
  const rawQuestionCount = Number(payload.soCauHoi);
  const mucDo = typeof payload.mucDo === 'string' ? payload.mucDo.trim() : '';
  const dangTroChoi =
    typeof payload.dangTroChoi === 'string' ? payload.dangTroChoi.trim() : '';
  const yeuCau = typeof payload.yeuCau === 'string' ? payload.yeuCau.trim() : '';

  if (!monHoc || monHoc.length > 100) {
    throw new HttpStatusError(400, 'Vui lòng chọn môn học hợp lệ.');
  }
  if (!['1', '2', '3', '4', '5', 'Dùng chung'].includes(khoiLop)) {
    throw new HttpStatusError(400, 'Vui lòng chọn khối lớp hợp lệ.');
  }
  if (tenBaiHoc.length < 2 || tenBaiHoc.length > LESSON_NAME_MAX_LENGTH) {
    throw new HttpStatusError(
      400,
      `Vui lòng nhập Tên bài học / nội dung kiến thức từ 2 đến ${LESSON_NAME_MAX_LENGTH} ký tự.`
    );
  }
  if (!ALLOWED_QUESTION_COUNTS.includes(rawQuestionCount as ServerQuestionCount)) {
    throw new HttpStatusError(400, 'Vui lòng chọn số câu hỏi hợp lệ (5, 8, 10 hoặc 15).');
  }
  if (!ALLOWED_DIFFICULTIES.includes(mucDo as ServerDifficulty)) {
    throw new HttpStatusError(400, 'Vui lòng chọn mức độ hợp lệ (Dễ, Vừa hoặc Khó).');
  }
  if (!ALLOWED_GAME_TYPES.includes(dangTroChoi as ServerGameType)) {
    throw new HttpStatusError(400, 'Vui lòng chọn dạng trò chơi hợp lệ.');
  }

  const isCreative = dangTroChoi === 'Tự do (sáng tạo)';
  const maxPromptLength = isCreative
    ? CREATIVE_PROMPT_MAX_LENGTH
    : STANDARD_PROMPT_MAX_LENGTH;

  if (isCreative && yeuCau.length < 3) {
    throw new HttpStatusError(
      400,
      'Ở dạng Tự do (sáng tạo), vui lòng mô tả cách chơi và bối cảnh trò chơi bạn muốn (ít nhất 3 ký tự).'
    );
  }
  if (yeuCau.length > maxPromptLength) {
    throw new HttpStatusError(
      400,
      `Mô tả / yêu cầu trò chơi tối đa ${maxPromptLength} ký tự.`
    );
  }

  const dateKey = getVietnamDateKey();
  const currentQuota = await readDailyQuota(user.uid, dateKey, user.idToken, cfg);
  if (currentQuota.count >= DAILY_AI_GAME_LIMIT) {
    throw new HttpStatusError(
      429,
      `Bạn đã dùng hết ${DAILY_AI_GAME_LIMIT} lượt tạo trò chơi AI trong ngày hôm nay.`
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const prompt = buildGamePrompt({
    monHoc,
    khoiLop,
    tenBaiHoc,
    soCauHoi: rawQuestionCount as ServerQuestionCount,
    mucDo: mucDo as ServerDifficulty,
    dangTroChoi: dangTroChoi as ServerGameType,
    yeuCau,
    generationNonce: crypto.randomUUID(),
  });

  let rawHtml = '';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction: GAME_SYSTEM_INSTRUCTION,
      },
    });
    rawHtml = response.text || '';
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi kết nối dịch vụ AI.';
    throw new HttpStatusError(502, `Không thể tạo trò chơi từ AI: ${msg}`);
  }

  const html = cleanAndValidateGameHtml(rawHtml);
  const usedToday = await incrementDailyQuota(user.uid, dateKey, user.idToken, cfg);

  return {
    html,
    usedToday,
    remainingToday: Math.max(0, DAILY_AI_GAME_LIMIT - usedToday),
    dailyLimit: DAILY_AI_GAME_LIMIT,
  };
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
        reject(new HttpStatusError(413, 'Dữ liệu gửi lên quá lớn.'));
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

export async function handleGenerateGameNodeRequest(
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
      typeof req.headers.authorization === 'string'
        ? req.headers.authorization
        : undefined;
    const result = await generateAiGameForRequest(authHeader, body, req.headers);
    sendJson(res, 200, result);
  } catch (err) {
    if (err instanceof HttpStatusError) {
      sendJson(res, err.status, {
        error: err.message,
        refused: err.refused || undefined,
      });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Lỗi máy chủ nội bộ.';
    sendJson(res, 500, { error: msg });
  }
}
