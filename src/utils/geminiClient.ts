import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { buildTeacherApiHeaders } from './ssoAuth';

export const PERSONAL_GEMINI_KEY_STORAGE = 'hs_gemini_personal_api_key';
export const GLOBAL_GEMINI_KEY_STORAGE = 'hs_gemini_global_api_key';
export const SELECTED_GEMINI_MODEL_STORAGE = 'hs_gemini_selected_model';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.0-flash';

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
  const modelPref = (preferredModel || 'auto').trim() || 'auto';

  try {
    const headers = await buildTeacherApiHeaders();
    const res = await fetch('/api/test-gemini', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        apiKey: cleanKey,
        model: modelPref,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      workingModel?: string;
      message?: string;
      error?: string;
    };

    if (!res.ok || !data.success) {
      return {
        success: false,
        message:
          data.error ||
          data.message ||
          `Kết nối thất bại (mã lỗi ${res.status}).`,
      };
    }

    const workingModel = data.workingModel || DEFAULT_GEMINI_MODEL;
    const switched = Boolean(
      modelPref && modelPref !== 'auto' && workingModel !== modelPref
    );
    safeStorageSet(SELECTED_GEMINI_MODEL_STORAGE, workingModel);

    return {
      success: true,
      workingModel,
      switchedModel: switched,
      message:
        data.message ||
        (switched
          ? `Kết nối Gemini API qua máy chủ thành công! Đã tự động chuyển sang mô hình khả dụng: ${workingModel}.`
          : `Kết nối Gemini API qua máy chủ thành công! Mô hình ${workingModel} phản hồi tốt.`),
    };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : 'Không thể kết nối tới máy chủ kiểm tra Gemini API.';
    return {
      success: false,
      message: `Kết nối thất bại: ${msg}`,
    };
  }
}
