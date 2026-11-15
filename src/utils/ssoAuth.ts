import {
  signInAnonymously,
  signInWithCustomToken,
  type Auth,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import type { UserProfile, UserRole } from '../types/hocLieu';

export const SSO_STORAGE_KEY = 'khl_pk_truc_khang_sso_session';

export interface SsoCurrentUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isSso: true;
  ssoToken?: string;
}

export interface SsoSession {
  currentUser: SsoCurrentUser;
  profile: UserProfile;
  source: 'url_param' | 'iframe' | 'post_message' | 'local_storage';
  savedAt: number;
}

export const DEFAULT_SSO_ADMIN_EMAIL = 'thuthuthtk@gmail.com';
export const DEFAULT_SSO_ADMIN_NAME = 'Nguyễn Thị Thủ';
export const DEFAULT_SSO_ADMIN_DEPT = 'Tổ Chuyên Môn';

export function isEmbeddedInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function sanitizeUid(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  return cleaned || 'sso_user';
}

function normalizeVaiTro(rawRole: unknown, email: string): UserRole {
  const val = String(rawRole || '')
    .trim()
    .toLowerCase();
  if (
    val === 'quantri' ||
    val === 'admin' ||
    val.includes('quản trị') ||
    val.includes('bgh') ||
    val.includes('hiệu trưởng')
  ) {
    return 'quanTri';
  }
  if (val === 'totruong' || val === 'to_truong' || val.includes('tổ trưởng')) {
    return 'toTruong';
  }
  if (email.toLowerCase() === DEFAULT_SSO_ADMIN_EMAIL) {
    return 'quanTri';
  }
  return 'giaoVien';
}

function mapVaiTroToRole(vaiTro: UserRole): 'ADMIN' | 'TO_TRUONG' | 'GIAO_VIEN' {
  if (vaiTro === 'quanTri') return 'ADMIN';
  if (vaiTro === 'toTruong') return 'TO_TRUONG';
  return 'GIAO_VIEN';
}

function mapVaiTroToChucVu(vaiTro: UserRole, rawChucVu?: unknown): string {
  if (typeof rawChucVu === 'string' && rawChucVu.trim()) {
    return rawChucVu.trim();
  }
  if (vaiTro === 'quanTri') return 'Quản trị (BGH / Thư viện)';
  if (vaiTro === 'toTruong') return 'Tổ trưởng chuyên môn';
  return 'Giáo viên';
}

export function buildSsoSessionFromPayload(
  raw: Record<string, unknown> | null | undefined,
  source: SsoSession['source']
): SsoSession {
  const data = raw || {};
  const rawEmail = String(
    data.sso_email ?? data.email ?? ''
  )
    .trim()
    .toLowerCase();
  const email = rawEmail || DEFAULT_SSO_ADMIN_EMAIL;

  const rawName = String(
    data.sso_name ?? data.hoTen ?? data.ho_ten ?? data.fullName ?? data.name ?? ''
  ).trim();
  const hoTen =
    rawName ||
    (email === DEFAULT_SSO_ADMIN_EMAIL
      ? DEFAULT_SSO_ADMIN_NAME
      : email.split('@')[0] || DEFAULT_SSO_ADMIN_NAME);

  const vaiTro = normalizeVaiTro(data.sso_role ?? data.vaiTro ?? data.role, email);
  const role = mapVaiTroToRole(vaiTro);
  const chucVu = mapVaiTroToChucVu(vaiTro, data.chucVu);

  const rawDept = String(
    data.sso_to ?? data.toKhoi ?? data.toChuyenMon ?? data.department ?? ''
  ).trim();
  const toKhoi = rawDept || DEFAULT_SSO_ADMIN_DEPT;

  const rawUid = String(data.sso_uid ?? data.uid ?? '').trim();
  const uid = rawUid ? sanitizeUid(rawUid) : `sso_${sanitizeUid(email)}`;

  const ssoToken =
    typeof (data.sso_token ?? data.token) === 'string'
      ? String(data.sso_token ?? data.token).trim()
      : undefined;

  const profile: UserProfile = {
    uid,
    hoTen,
    email,
    vaiTro,
    role,
    chucVu,
    toKhoi,
    toChuyenMon: toKhoi,
    biKhoa: false,
    yeuCauDoiMatKhau: false,
    ngayTao: null,
    ngayCapNhat: null,
  };

  const currentUser: SsoCurrentUser = {
    uid,
    email,
    displayName: hoTen,
    isSso: true,
    ssoToken,
  };

  return {
    currentUser,
    profile,
    source,
    savedAt: Date.now(),
  };
}

function collectUrlSearchParams(): URLSearchParams {
  const merged = new URLSearchParams();
  if (typeof window === 'undefined') return merged;

  const searchParams = new URLSearchParams(window.location.search);
  searchParams.forEach((v, k) => merged.set(k, v));

  const hash = window.location.hash || '';
  const qIndex = hash.indexOf('?');
  if (qIndex >= 0) {
    const hashParams = new URLSearchParams(hash.slice(qIndex + 1));
    hashParams.forEach((v, k) => {
      if (!merged.has(k)) merged.set(k, v);
    });
  }

  return merged;
}

export function readSsoParamsFromUrl(): {
  matched: boolean;
  payload: Record<string, unknown>;
} {
  if (typeof window === 'undefined') {
    return { matched: false, payload: {} };
  }

  const params = collectUrlSearchParams();
  const ssoEmail = params.get('sso_email') || '';
  const ssoToken = params.get('sso_token') || '';
  const autoLogin = params.get('auto_login') || '';

  const matched =
    Boolean(ssoEmail.trim()) ||
    Boolean(ssoToken.trim()) ||
    autoLogin.toLowerCase() === 'true' ||
    autoLogin === '1';

  return {
    matched,
    payload: {
      sso_email: ssoEmail || params.get('email') || '',
      sso_token: ssoToken || params.get('token') || '',
      sso_name:
        params.get('sso_name') ||
        params.get('hoTen') ||
        params.get('ho_ten') ||
        params.get('name') ||
        '',
      sso_role: params.get('sso_role') || params.get('vaiTro') || params.get('role') || '',
      sso_to:
        params.get('sso_to') ||
        params.get('toKhoi') ||
        params.get('toChuyenMon') ||
        '',
      sso_uid: params.get('sso_uid') || params.get('uid') || '',
    },
  };
}

let latestSsoSession: SsoSession | null = null;

export function saveSsoSessionToStorage(session: SsoSession): void {
  latestSsoSession = session;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SSO_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage quota or private mode restrictions
  }
}

export function loadSsoSessionFromStorage(): SsoSession | null {
  if (typeof window === 'undefined') return latestSsoSession;
  try {
    const raw = window.localStorage.getItem(SSO_STORAGE_KEY);
    if (!raw) return latestSsoSession;
    const parsed = JSON.parse(raw) as Partial<SsoSession>;
    if (!parsed?.profile?.email || !parsed?.currentUser?.uid) return latestSsoSession;
    const hydrated: SsoSession = {
      currentUser: {
        uid: parsed.currentUser.uid,
        email: parsed.currentUser.email ?? parsed.profile.email,
        displayName: parsed.currentUser.displayName ?? parsed.profile.hoTen,
        isSso: true,
        ssoToken: parsed.currentUser.ssoToken,
      },
      profile: {
        ...parsed.profile,
        ngayTao: null,
        ngayCapNhat: null,
      },
      source: 'local_storage',
      savedAt: parsed.savedAt || Date.now(),
    };
    latestSsoSession = hydrated;
    return hydrated;
  } catch {
    return latestSsoSession;
  }
}

export function clearSsoSessionFromStorage(): void {
  latestSsoSession = null;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SSO_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function detectInitialSsoSession(): SsoSession | null {
  const urlCheck = readSsoParamsFromUrl();
  if (urlCheck.matched) {
    const session = buildSsoSessionFromPayload(urlCheck.payload, 'url_param');
    saveSsoSessionToStorage(session);
    return session;
  }

  const stored = loadSsoSessionFromStorage();
  if (stored) {
    return stored;
  }

  if (isEmbeddedInIframe()) {
    const session = buildSsoSessionFromPayload(null, 'iframe');
    saveSsoSessionToStorage(session);
    return session;
  }

  return null;
}

export interface EffectiveUser {
  uid: string;
  email: string;
  displayName: string;
  name: string;
  role: 'admin' | 'toTruong' | 'giaoVien';
  isSso: boolean;
}

export function getEffectiveUser(): EffectiveUser {
  const firebaseUser = auth.currentUser;
  if (firebaseUser && !firebaseUser.isAnonymous) {
    const email = firebaseUser.email || DEFAULT_SSO_ADMIN_EMAIL;
    const name = firebaseUser.displayName || DEFAULT_SSO_ADMIN_NAME;
    return {
      uid: firebaseUser.uid,
      email,
      displayName: name,
      name,
      role: email.toLowerCase() === DEFAULT_SSO_ADMIN_EMAIL ? 'admin' : 'giaoVien',
      isSso: false,
    };
  }

  const sso = latestSsoSession ?? loadSsoSessionFromStorage() ?? detectInitialSsoSession();
  if (sso?.profile) {
    const mappedRole: EffectiveUser['role'] =
      sso.profile.vaiTro === 'quanTri'
        ? 'admin'
        : sso.profile.vaiTro === 'toTruong'
          ? 'toTruong'
          : 'giaoVien';
    return {
      uid: sso.profile.uid || 'sso_thuthuthtk',
      email: sso.profile.email || DEFAULT_SSO_ADMIN_EMAIL,
      displayName: sso.profile.hoTen || DEFAULT_SSO_ADMIN_NAME,
      name: sso.profile.hoTen || DEFAULT_SSO_ADMIN_NAME,
      role: mappedRole,
      isSso: true,
    };
  }

  return {
    uid: 'sso_thuthuthtk',
    email: DEFAULT_SSO_ADMIN_EMAIL,
    displayName: DEFAULT_SSO_ADMIN_NAME,
    name: DEFAULT_SSO_ADMIN_NAME,
    role: 'admin',
    isSso: true,
  };
}

export async function buildTeacherApiHeaders(): Promise<Record<string, string>> {
  const effective = getEffectiveUser();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-SSO-Email': effective.email,
    'X-SSO-Uid': effective.uid,
    'X-SSO-Role': effective.role,
  };

  const firebaseUser = auth.currentUser;
  if (firebaseUser && !firebaseUser.isAnonymous) {
    try {
      const idToken = await firebaseUser.getIdToken();
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }
    } catch {
      // Fallback safely to X-SSO-Email headers
    }
  }

  return headers;
}

export async function attemptSilentFirebaseAuthForSso(
  firebaseAuth: Auth,
  ssoToken?: string
): Promise<boolean> {
  if (firebaseAuth.currentUser) {
    return true;
  }

  const trimmedToken = (ssoToken || '').trim();
  if (trimmedToken && trimmedToken.split('.').length === 3) {
    try {
      await signInWithCustomToken(firebaseAuth, trimmedToken);
      return true;
    } catch {
      // Fallback to anonymous auth below if token is not a Firebase custom token
    }
  }

  try {
    await signInAnonymously(firebaseAuth);
    return true;
  } catch {
    // Silent fallback: Firestore read rules allow reading in SSO iframe mode even without Firebase Auth session
    return false;
  }
}
