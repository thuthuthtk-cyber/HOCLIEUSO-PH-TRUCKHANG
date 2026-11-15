import { GoogleGenAI } from '@google/genai';

export const PRIMARY_SERVER_TEXT_MODEL = 'gemini-4-hydrogen';
export const FALLBACK_SERVER_TEXT_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
] as const;

export function getServerGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('Máy chủ chưa cấu hình biến môi trường GEMINI_API_KEY.');
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

export function extractServerGeminiErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'Lỗi kết nối Gemini API.');
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
    // Keep raw error message
  }
  return raw;
}
