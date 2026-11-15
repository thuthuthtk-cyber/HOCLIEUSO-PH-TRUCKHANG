import { GoogleGenAI, type GenerateContentConfig } from '@google/genai';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export const PERSONAL_GEMINI_KEY_STORAGE = 'hs_gemini_personal_api_key';
export const GLOBAL_GEMINI_KEY_STORAGE = 'hs_gemini_global_api_key';
export const SELECTED_GEMINI_MODEL_STORAGE = 'hs_gemini_selected_model';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const FALLBACK_TEXT_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
] as const;

export const CLIENT_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-2.0-flash-preview-image-generation',
] as const;

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
        (legacyData?.globalApiKey as string | undefined)
    );
    const remoteModel = String(
      settingsData?.selectedModel || legacyData?.selectedModel || ''
    ).trim();

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
    safeStorageSet(SELECTED_GEMINI_MODEL_STORAGE, selectedModel.trim() || 'auto');
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
  const cleanModel = (params.selectedModel || 'auto').trim() || 'auto';

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
  const storedModel = safeStorageGet(SELECTED_GEMINI_MODEL_STORAGE).trim();

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
  if (cleanPref && cleanPref !== 'auto') {
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

export function isModelNotFoundError(err: unknown): boolean {
  const msg = extractGeminiErrorMessage(err).toLowerCase();
  return (
    msg.includes('404') ||
    msg.includes('not found') ||
    msg.includes('is not supported') ||
    msg.includes('not_found') ||
    msg.includes('does not exist') ||
    (msg.includes('model') && msg.includes('invalid'))
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
      if (isModelNotFoundError(err) && i < candidates.length - 1) {
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
}): Promise<{ text: string; modelUsed: string } | null> {
  const creds = await resolveActiveGeminiCredentials();
  if (!creds.apiKey) {
    return null;
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
      if (isModelNotFoundError(err) && i < candidates.length - 1) {
        continue;
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
  let lastErrorMsg = 'Không thể sinh ảnh minh họa bằng Gemini API.';

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
      lastErrorMsg = `Model ${model} không trả về dữ liệu hình ảnh.`;
    } catch (err) {
      lastErrorMsg = extractGeminiErrorMessage(err);
      const lower = lastErrorMsg.toLowerCase();
      if (lower.includes('api key not valid') || lower.includes('api_key_invalid')) {
        throw new Error(lastErrorMsg);
      }
    }
  }

  throw new Error(`Sinh ảnh thất bại: ${lastErrorMsg}`);
}
