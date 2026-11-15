import { useEffect, useState } from 'react';
import type { LearningMaterial, UserProfile } from '../types/hocLieu';

const SHARE_CODE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function canManageGameShareLink(
  profile: UserProfile,
  material: LearningMaterial
): boolean {
  if (material.loaiNguon !== 'troChoi' || !material.maChiaSe) return false;
  if (profile.vaiTro === 'quanTri') return true;
  if (material.nguoiDangUid === profile.uid) return true;
  return profile.vaiTro === 'toTruong' && material.toKhoi === profile.toKhoi;
}

export function generateShareCode(length = 20): string {
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += SHARE_CODE_ALPHABET[randomValues[i] % SHARE_CODE_ALPHABET.length];
  }
  return code;
}

export function isValidShareCodeFormat(code: string): boolean {
  return /^[a-zA-Z0-9]{20}$/.test(code);
}

export function buildStudentGameUrl(maChiaSe: string): string {
  if (typeof window === 'undefined') {
    return `/#/choi/${maChiaSe}`;
  }
  return `${window.location.origin}/#/choi/${maChiaSe}`;
}

export function parsePublicGameHash(hashValue?: string): string | null {
  const rawHash =
    hashValue ?? (typeof window !== 'undefined' ? window.location.hash : '');
  const match = rawHash.match(/^#\/choi\/([a-zA-Z0-9]{20})\/?$/);
  return match ? match[1] : null;
}

export function usePublicGameShareCode(): string | null {
  const [shareCode, setShareCode] = useState<string | null>(() =>
    parsePublicGameHash()
  );

  useEffect(() => {
    const handleHashChange = () => {
      setShareCode(parsePublicGameHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return shareCode;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
