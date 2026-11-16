import { GoogleGenAI } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  FALLBACK_SERVER_TEXT_MODELS,
  PRIMARY_SERVER_TEXT_MODEL,
  extractServerGeminiErrorMessage,
  getServerGeminiClient,
} from './geminiServerClient.ts';

function isInvalidApiKeyError(err: unknown): boolean {
  const msg = extractServerGeminiErrorMessage(err).toLowerCase();
  return (
    msg.includes('api key not valid') ||
    msg.includes('api_key_invalid') ||
    msg.includes('invalid api key')
  );
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const existingBody = (req as IncomingMessage & { body?: unknown }).body;
    if (existingBody && typeof existingBody === 'object') {
      resolve(existingBody as Record<string, unknown>);
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes <= 32 * 1024) {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim();
        const parsed = text ? JSON.parse(text) : {};
        resolve(parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
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
    const customApiKey =
      typeof body.apiKey === 'string'
        ? body.apiKey.trim().replace(/[\u200B-\u200D\uFEFF\r\n]/g, '')
        : '';
    const requestedModel =
      typeof body.model === 'string' && body.model.trim() && body.model.trim() !== 'auto'
        ? body.model.trim()
        : '';

    const ai = customApiKey
      ? new GoogleGenAI({ apiKey: customApiKey })
      : getServerGeminiClient();

    const candidates = (
      customApiKey
        ? [
            requestedModel,
            'gemini-3.0-flash',
            'gemini-3-flash-preview',
            'gemini-2.5-flash',
            'gemini-2.0-flash',
          ]
        : [
            PRIMARY_SERVER_TEXT_MODEL,
            ...FALLBACK_SERVER_TEXT_MODELS,
            requestedModel,
            'gemini-3.0-flash',
            'gemini-2.5-flash',
          ]
    )
      .filter((m): m is string => Boolean(m))
      .filter((model, index, arr) => arr.indexOf(model) === index);

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
            message: `Kết nối Gemini API qua máy chủ thành công! Mô hình ${candidateModel} phản hồi tốt.`,
          });
          return;
        }
        lastErrorMsg = 'Mô hình không phản hồi văn bản.';
      } catch (err) {
        lastErrorMsg = extractServerGeminiErrorMessage(err);
        if (!isInvalidApiKeyError(err) && i < candidates.length - 1) {
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
