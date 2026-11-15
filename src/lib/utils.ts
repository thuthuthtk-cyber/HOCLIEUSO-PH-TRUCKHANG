import type { Timestamp } from 'firebase/firestore';

export function normalizeVietnamese(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

export function formatDateVi(ts: Timestamp | Date | null | undefined): string {
  if (!ts) return '—';
  try {
    const date = ts instanceof Date ? ts : ts.toDate();
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return '—';
  }
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface PreviewSource {
  kind: 'youtube' | 'gdrive' | 'image' | 'video' | 'pdf' | 'external';
  embedUrl: string;
  label: string;
}

export function resolvePreviewSource(
  url: string,
  loaiNguon: 'tep' | 'lienKet' | 'troChoi' | 'pptAi',
  tenTep?: string
): PreviewSource {
  const cleanUrl = url.trim();
  const lower = cleanUrl.toLowerCase();
  const fileLower = (tenTep || '').toLowerCase();

  // YouTube
  const ytMatch = cleanUrl.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch && ytMatch[1]) {
    return {
      kind: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`,
      label: 'Video YouTube',
    };
  }

  // Google Drive / Docs / Slides / Sheets
  const gdriveFileMatch = cleanUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gdriveFileMatch && gdriveFileMatch[1]) {
    return {
      kind: 'gdrive',
      embedUrl: `https://drive.google.com/file/d/${gdriveFileMatch[1]}/preview`,
      label: 'Google Drive',
    };
  }

  const gdocsMatch = cleanUrl.match(/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/);
  if (gdocsMatch && gdocsMatch[2]) {
    return {
      kind: 'gdrive',
      embedUrl: `https://docs.google.com/${gdocsMatch[1]}/d/${gdocsMatch[2]}/preview`,
      label: 'Google Docs / Slides',
    };
  }

  // Image
  if (
    /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(lower) ||
    /\.(png|jpg|jpeg|webp|gif)$/i.test(fileLower)
  ) {
    return { kind: 'image', embedUrl: cleanUrl, label: 'Hình ảnh' };
  }

  // Video
  if (/\.(mp4|webm|mov)(\?|$)/i.test(lower) || /\.(mp4|webm|mov)$/i.test(fileLower)) {
    return { kind: 'video', embedUrl: cleanUrl, label: 'Video trực tiếp' };
  }

  // PDF
  if (/\.pdf(\?|$)/i.test(lower) || /\.pdf$/i.test(fileLower)) {
    return { kind: 'pdf', embedUrl: cleanUrl, label: 'Tài liệu PDF' };
  }

  return {
    kind: 'external',
    embedUrl: cleanUrl,
    label: loaiNguon === 'tep' ? 'Tệp đính kèm' : 'Liên kết học liệu',
  };
}

export function detectLinkProviderName(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('drive.google.com') || lower.includes('docs.google.com')) return 'Google Drive';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'YouTube';
  if (lower.includes('canva.com')) return 'Canva';
  if (lower.includes('onedrive.live.com') || lower.includes('sharepoint.com')) return 'OneDrive';
  if (lower.includes('quizizz.com') || lower.includes('kahoot')) return 'Bài tập tương tác';
  return 'Liên kết web';
}

export function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = 'QH#';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
