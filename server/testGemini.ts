import type { IncomingMessage, ServerResponse } from 'node:http';
import { GoogleGenAI } from '@google/genai';

const DEFAULT_SERVER_MODEL = 'gemini-4-hydrogen';
const FALLBACK_SERVER_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
] as const;

const DEPRECATED_MODELS = new Set([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-2.0-flash',
  'gemini-2.0-pro',
  'gemini-2.0-flash-thinking',
]);

function cleanApiKey(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\r\n]/g, '');
}

function getModelCandidates(preferredModel: unknown): string[] {
  const raw = typeof preferredModel === 'string' ? preferredModel.trim() : '';
  const normalized =
    !raw || raw === 'auto' || DEPRECATED_MODELS.has(raw) ? DEFAULT_SERVER_MODEL : raw;

  const list: string[] = [normalized];
  for (const m of FALLBACK_SERVER_MODELS) {
    if (!list.includes(m)) {
      list.push(m);
    }
  }
  return list;
}

function extractGeminiErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'Lỗi kết nối Gemini API');
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        error?: { message?: string };
        message?: string;
      };
      const nested = parsed?.error?.message || parsed?.message;
      if (nested && typeof nested === 'string') {
        return nested;
      }
    }
  } catch {
    // Keep raw message if not JSON
  }
  return raw;
}

function isModelNotFoundError(err: unknown): boolean {
  const msg = extractGeminiErrorMessage(err).toLowerCase();
  return (
    msg.includes('404') ||
    msg.includes('not found') ||
    msg.includes('is not supported') ||
    msg.includes('not_found') ||
    msg.includes('does not exist')
  );
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const existingBody = (req as IncomingMessage & { body?: unknown }).body;
    if (existingBody && typeof existingBody === 'object') {
      resolve(existingBody as Record<string, unknown>);
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > 32 * 1024) {
        reject(new Error('Dữ liệu yêu cầu quá lớn.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim();
        resolve(text ? (JSON.parse(text) as Record<string, unknown>) : {});
      } catch {
        reject(new Error('Dữ liệu JSON không hợp lệ.'));
      }
    });
    req.on('error', () => reject(new Error('Không đọc được nội dung yêu cầu.')));
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export async function handleTestGeminiNodeRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { success: false, error: 'Phương thức không được hỗ trợ.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const providedKey = cleanApiKey(body.apiKey);
    const serverKey = cleanApiKey(process.env.GEMINI_API_KEY);
    const activeKey =
      providedKey && providedKey !== 'MY_GEMINI_API_KEY'
        ? providedKey
        : serverKey && serverKey !== 'MY_GEMINI_API_KEY'
          ? serverKey
          : '';

    if (!activeKey) {
      sendJson(res, 400, {
        success: false,
        error: 'Máy chủ chưa được cấu hình GEMINI_API_KEY và chưa có API Key kiểm tra.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey: activeKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const candidates = getModelCandidates(body.model);
    let lastErrorMsg = 'Lỗi kết nối Gemini API';

    for (let i = 0; i < candidates.length; i += 1) {
      const candidateModel = candidates[i];
      try {
        const response = await ai.models.generateContent({
          model: candidateModel,
          contents: 'ping',
        });

        if (response && response.text) {
          sendJson(res, 200, {
            success: true,
            workingModel: candidateModel,
            text: response.text,
            message: `Kết nối Gemini API qua máy chủ thành công! Mô hình ${candidateModel} phản hồi tốt.`,
          });
          return;
        }
        lastErrorMsg = 'Mô hình không phản hồi văn bản.';
      } catch (err) {
        lastErrorMsg = extractGeminiErrorMessage(err);
        if (isModelNotFoundError(err) && i < candidates.length - 1) {
          continue;
        }
        break;
      }
    }

    sendJson(res, 502, {
      success: false,
      error: `Kết nối thất bại: ${lastErrorMsg}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi máy chủ nội bộ.';
    sendJson(res, 500, { success: false, error: msg });
  }
}
