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

export function saveSsoSessionToStorage(session: SsoSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SSO_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage quota or private mode restrictions
  }
}

export function loadSsoSessionFromStorage(): SsoSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SSO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SsoSession>;
    if (!parsed?.profile?.email || !parsed?.currentUser?.uid) return null;
    return {
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
  } catch {
    return null;
  }
}

export function clearSsoSessionFromStorage(): void {
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
