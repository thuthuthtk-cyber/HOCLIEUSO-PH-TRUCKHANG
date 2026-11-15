import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  FALLBACK_SERVER_TEXT_MODELS,
  PRIMARY_SERVER_TEXT_MODEL,
  extractServerGeminiErrorMessage,
  getServerGeminiClient,
} from './geminiServerClient.ts';

function isModelNotFoundError(err: unknown): boolean {
  const msg = extractServerGeminiErrorMessage(err).toLowerCase();
  return (
    msg.includes('404') ||
    msg.includes('not found') ||
    msg.includes('is not supported') ||
    msg.includes('not_found') ||
    msg.includes('does not exist')
  );
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
    const ai = getServerGeminiClient();
    const candidates = [PRIMARY_SERVER_TEXT_MODEL, ...FALLBACK_SERVER_TEXT_MODELS].filter(
      (model, index, arr) => arr.indexOf(model) === index
    );

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
