import { GoogleGenAI, type GenerateContentConfig } from '@google/genai';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export const PERSONAL_GEMINI_KEY_STORAGE = 'hs_gemini_personal_api_key';
export const GLOBAL_GEMINI_KEY_STORAGE = 'hs_gemini_global_api_key';
export const SELECTED_GEMINI_MODEL_STORAGE = 'hs_gemini_selected_model';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.0-flash';
export const FALLBACK_TEXT_MODELS = [
  'gemini-3.0-flash',
  'gemini-3-flash-preview',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
] as const;

export const CLIENT_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-2.0-flash-preview-image-generation',
] as const;

const BLOCKED_CLIENT_MODELS = new Set([
  'gemini-4-hydrogen',
  'gemini-4-argon',
  'gemini-4-carbon',
  'gemini-3.1-flash-lite',
]);

export function cleanApiKey(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\r\n]/g, '');
}

function safeStorageGet(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeStorageSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage partitioning / quota errors
  }
}

export interface StoredSchoolAiConfig {
  globalApiKey: string;
  selectedModel: string;
}

let cachedGlobalConfig: StoredSchoolAiConfig | null = null;

export async function fetchSchoolGeminiConfig(
  forceRefresh = false
): Promise<StoredSchoolAiConfig> {
  if (!forceRefresh && cachedGlobalConfig?.globalApiKey) {
    return cachedGlobalConfig;
  }

  let globalApiKey = cleanApiKey(safeStorageGet(GLOBAL_GEMINI_KEY_STORAGE));
  let selectedModel = safeStorageGet(SELECTED_GEMINI_MODEL_STORAGE).trim() || 'auto';
  if (BLOCKED_CLIENT_MODELS.has(selectedModel)) {
    selectedModel = DEFAULT_GEMINI_MODEL;
  }

  try {
    const [settingsRes, legacyRes] = await Promise.allSettled([
      getDoc(doc(db, 'settings', 'ai_config')),
      getDoc(doc(db, 'system_config', 'gemini')),
    ]);

    const settingsData =
      settingsRes.status === 'fulfilled' && settingsRes.value.exists()
        ? (settingsRes.value.data() as Record<string, unknown>)
        : null;
    const legacyData =
      legacyRes.status === 'fulfilled' && legacyRes.value.exists()
        ? (legacyRes.value.data() as Record<string, unknown>)
        : null;

    const remoteKey = cleanApiKey(
      (settingsData?.globalApiKey as string | undefined) ||
        (settingsData?.apiKey as string | undefined) ||
        (legacyData?.globalApiKey as string | undefined) ||
        (legacyData?.apiKey as string | undefined)
    );
    const rawRemoteModel = String(
      settingsData?.selectedModel || legacyData?.selectedModel || ''
    ).trim();
    const remoteModel = BLOCKED_CLIENT_MODELS.has(rawRemoteModel)
      ? DEFAULT_GEMINI_MODEL
      : rawRemoteModel;

    if (remoteKey) {
      globalApiKey = remoteKey;
      safeStorageSet(GLOBAL_GEMINI_KEY_STORAGE, remoteKey);
    }
    if (remoteModel) {
      selectedModel = remoteModel;
      safeStorageSet(SELECTED_GEMINI_MODEL_STORAGE, remoteModel);
    }
  } catch {
    // Fallback to cached / localStorage values if offline
  }

  cachedGlobalConfig = { globalApiKey, selectedModel };
  return cachedGlobalConfig;
}

export function savePersonalGeminiConfig(
  personalKey: string,
  selectedModel?: string
): string {
  const clean = cleanApiKey(personalKey);
  safeStorageSet(PERSONAL_GEMINI_KEY_STORAGE, clean);
  if (selectedModel) {
    const cleanModel = BLOCKED_CLIENT_MODELS.has(selectedModel.trim())
      ? DEFAULT_GEMINI_MODEL
      : selectedModel.trim() || 'auto';
    safeStorageSet(SELECTED_GEMINI_MODEL_STORAGE, cleanModel);
  }
  return clean;
}

export async function saveGlobalGeminiConfig(params: {
  globalApiKey: string;
  selectedModel: string;
  updatedBy: string;
  updatedByName: string;
}): Promise<{ globalApiKey: string; selectedModel: string }> {
  const cleanGlobal = cleanApiKey(params.globalApiKey);
  const rawModel = (params.selectedModel || 'auto').trim() || 'auto';
  const cleanModel = BLOCKED_CLIENT_MODELS.has(rawModel)
    ? DEFAULT_GEMINI_MODEL
    : rawModel;

  safeStorageSet(GLOBAL_GEMINI_KEY_STORAGE, cleanGlobal);
  safeStorageSet(SELECTED_GEMINI_MODEL_STORAGE, cleanModel);
  cachedGlobalConfig = { globalApiKey: cleanGlobal, selectedModel: cleanModel };

  const payload = {
    globalApiKey: cleanGlobal,
    selectedModel: cleanModel,
    updatedBy: params.updatedBy || 'sso_admin',
    updatedByName: params.updatedByName || 'Quản trị viên',
    ngayCapNhat: serverTimestamp(),
  };

  await Promise.all([
    setDoc(doc(db, 'settings', 'ai_config'), payload, { merge: true }),
    setDoc(doc(db, 'system_config', 'gemini'), payload, { merge: true }),
  ]);

  return { globalApiKey: cleanGlobal, selectedModel: cleanModel };
}

export interface ResolvedGeminiCredentials {
  apiKey: string;
  source: 'personal' | 'global' | 'env' | 'none';
  selectedModel: string;
}

export async function resolveActiveGeminiCredentials(): Promise<ResolvedGeminiCredentials> {
  const personalKey = cleanApiKey(safeStorageGet(PERSONAL_GEMINI_KEY_STORAGE));
  const rawStoredModel = safeStorageGet(SELECTED_GEMINI_MODEL_STORAGE).trim();
  const storedModel = BLOCKED_CLIENT_MODELS.has(rawStoredModel)
    ? DEFAULT_GEMINI_MODEL
    : rawStoredModel;

  if (personalKey) {
    return {
      apiKey: personalKey,
      source: 'personal',
      selectedModel:
        storedModel && storedModel !== 'auto' ? storedModel : DEFAULT_GEMINI_MODEL,
    };
  }

  const schoolConfig = await fetchSchoolGeminiConfig();
  const activeModel =
    (storedModel && storedModel !== 'auto'
      ? storedModel
      : schoolConfig.selectedModel && schoolConfig.selectedModel !== 'auto'
        ? schoolConfig.selectedModel
        : DEFAULT_GEMINI_MODEL) || DEFAULT_GEMINI_MODEL;

  if (schoolConfig.globalApiKey) {
    return {
      apiKey: schoolConfig.globalApiKey,
      source: 'global',
      selectedModel: activeModel,
    };
  }

  const envKey = cleanApiKey(import.meta.env.VITE_GEMINI_API_KEY);
  if (envKey && envKey !== 'MY_GEMINI_API_KEY') {
    return {
      apiKey: envKey,
      source: 'env',
      selectedModel: activeModel,
    };
  }

  return {
    apiKey: '',
    source: 'none',
    selectedModel: activeModel,
  };
}

export function getTextModelCandidates(preferredModel?: string): string[] {
  const cleanPref = (preferredModel || '').trim();
  const list: string[] = [];
  if (cleanPref && cleanPref !== 'auto' && !BLOCKED_CLIENT_MODELS.has(cleanPref)) {
    list.push(cleanPref);
  }
  for (const m of FALLBACK_TEXT_MODELS) {
    if (!list.includes(m)) {
      list.push(m);
    }
  }
  return list;
}

export function extractGeminiErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'Lỗi không xác định');
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        error?: { message?: string; status?: string };
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

function isInvalidApiKeyError(err: unknown): boolean {
  const msg = extractGeminiErrorMessage(err).toLowerCase();
  return (
    msg.includes('api key not valid') ||
    msg.includes('api_key_invalid') ||
    msg.includes('invalid api key')
  );
}

export function isModelFallbackError(err: unknown): boolean {
  if (isInvalidApiKeyError(err)) return false;
  const msg = extractGeminiErrorMessage(err).toLowerCase();
  return (
    msg.includes('404') ||
    msg.includes('not found') ||
    msg.includes('is not supported') ||
    msg.includes('not_found') ||
    msg.includes('does not exist') ||
    msg.includes('not available') ||
    msg.includes('deprecated') ||
    (msg.includes('model') && (msg.includes('invalid') || msg.includes('unsupported')))
  );
}

export interface TestGeminiKeyResult {
  success: boolean;
  message: string;
  workingModel?: string;
  switchedModel?: boolean;
}

export async function testGeminiApiKeyDirect(
  rawKey: string,
  preferredModel?: string
): Promise<TestGeminiKeyResult> {
  const cleanKey = cleanApiKey(rawKey);
  if (!cleanKey) {
    return {
      success: false,
      message:
        'Vui lòng dán Personal Gemini API Key hoặc Global API Key (bắt đầu bằng AIzaSy...) vào ô nhập trước khi kiểm tra.',
    };
  }

  const candidates = getTextModelCandidates(preferredModel);
  const ai = new GoogleGenAI({ apiKey: cleanKey });
  let lastErrorMsg = 'Không thể kết nối tới Google Gemini API.';

  for (let i = 0; i < candidates.length; i += 1) {
    const model = candidates[i];
    try {
      await ai.models.generateContent({
        model,
        contents: 'ping',
      });

      const switched =
        Boolean(preferredModel && preferredModel !== 'auto' && model !== preferredModel);
      safeStorageSet(SELECTED_GEMINI_MODEL_STORAGE, model);

      return {
        success: true,
        workingModel: model,
        switchedModel: switched,
        message: switched
          ? `Kết nối Gemini API thành công! Đã tự động chuyển sang mô hình khả dụng: ${model}.`
          : `Kết nối Gemini API thành công! Mô hình ${model} phản hồi tốt.`,
      };
    } catch (err) {
      lastErrorMsg = extractGeminiErrorMessage(err);
      if (isModelFallbackError(err) && i < candidates.length - 1) {
        continue;
      }
      if (!isInvalidApiKeyError(err) && i < candidates.length - 1 && lastErrorMsg.includes('500')) {
        continue;
      }
      break;
    }
  }

  return {
    success: false,
    message: `Kết nối thất bại: ${lastErrorMsg}`,
  };
}

export async function generateTextWithClientGemini(params: {
  contents: string;
  config?: GenerateContentConfig;
}): Promise<{ text: string; modelUsed: string }> {
  const creds = await resolveActiveGeminiCredentials();
  if (!creds.apiKey) {
    throw new Error(
      'Chưa có Google Gemini API Key. Thầy/cô vui lòng bấm "Cấu hình Gemini API Key" ở menu bên trái để nhập API Key (AIzaSy...) rồi thử lại.'
    );
  }

  const ai = new GoogleGenAI({ apiKey: creds.apiKey });
  const candidates = getTextModelCandidates(creds.selectedModel);
  let lastError: unknown;

  for (let i = 0; i < candidates.length; i += 1) {
    const model = candidates[i];
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });

      if (model !== creds.selectedModel) {
        safeStorageSet(SELECTED_GEMINI_MODEL_STORAGE, model);
      }

      return {
        text: response.text || '',
        modelUsed: model,
      };
    } catch (err) {
      lastError = err;
      if (isInvalidApiKeyError(err)) {
        throw new Error(
          `API Key không hợp lệ (${extractGeminiErrorMessage(err)}). Vui lòng kiểm tra lại trong "Cấu hình Gemini API Key".`
        );
      }
      if (i < candidates.length - 1 && (isModelFallbackError(err) || true)) {
        // Retry with the next valid model if current model is unavailable/unsupported/errors on schema
        if (!isInvalidApiKeyError(err)) {
          continue;
        }
      }
      throw new Error(extractGeminiErrorMessage(err));
    }
  }

  throw new Error(extractGeminiErrorMessage(lastError));
}

export async function generateImageWithClientGemini(params: {
  prompt: string;
}): Promise<{ imageDataUrl: string; modelUsed: string } | null> {
  const creds = await resolveActiveGeminiCredentials();
  if (!creds.apiKey) {
    return null;
  }

  const ai = new GoogleGenAI({ apiKey: creds.apiKey });

  for (const model of CLIENT_IMAGE_MODELS) {
    try {
      const imageConfig: GenerateContentConfig =
        model === 'gemini-2.5-flash-image'
          ? {
              responseModalities: ['IMAGE'],
              imageConfig: { aspectRatio: '16:9' },
            }
          : {
              responseModalities: ['IMAGE', 'TEXT'],
            };

      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [{ text: params.prompt }],
        },
        config: imageConfig,
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          return {
            imageDataUrl: `data:${mime};base64,${part.inlineData.data}`,
            modelUsed: model,
          };
        }
      }
    } catch {
      // Fall through cleanly to next model or Canvas 16:9 mascot fallback
    }
  }

  return null;
}
