import type { LearningMaterial } from '../types/hocLieu';
import { normalizeVietnamese } from '../lib/utils';

export const QR_API_BASE = 'https://api.qrserver.com/v1/create-qr-code/';

export function getQrCodeImageUrl(targetUrl: string, size = 150): string {
  const cleanUrl = (targetUrl || '').trim();
  const safeSize = Math.max(100, Math.min(500, Math.round(size)));
  return `${QR_API_BASE}?size=${safeSize}x${safeSize}&margin=6&format=png&data=${encodeURIComponent(cleanUrl)}`;
}

export function slugifyFileName(input: string): string {
  const normalized = normalizeVietnamese(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized || 'hoc-lieu';
}

export function triggerBlobDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function loadCorsImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không thể tải ảnh Mã QR từ máy chủ tạo QR.'));
    img.src = src;
  });
}

export async function downloadSingleQrImage(material: LearningMaterial): Promise<void> {
  const qrUrl = getQrCodeImageUrl(material.url, 300);
  const fileName = `ma-qr-${slugifyFileName(material.tieuDe)}.png`;

  const response = await fetch(qrUrl, { mode: 'cors' });
  if (!response.ok) {
    throw new Error(`Máy chủ tạo mã QR trả về mã lỗi ${response.status}`);
  }
  const blob = await response.blob();
  triggerBlobDownload(blob, fileName);
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
): void {
  const words = text.split(/\s+/);
  let line = '';
  let lineCount = 0;

  for (let i = 0; i < words.length; i += 1) {
    const testLine = line ? `${line} ${words[i]}` : words[i];
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && line) {
      lineCount += 1;
      if (lineCount >= maxLines) {
        ctx.fillText(`${line}...`, x, startY + (lineCount - 1) * lineHeight);
        return;
      }
      ctx.fillText(line, x, startY + (lineCount - 1) * lineHeight);
      line = words[i];
    } else {
      line = testLine;
    }
  }

  if (line && lineCount < maxLines) {
    ctx.fillText(line, x, startY + lineCount * lineHeight);
  }
}

export async function downloadBatchQrSheetImage(materials: LearningMaterial[]): Promise<void> {
  if (materials.length === 0) return;
  if (materials.length === 1) {
    await downloadSingleQrImage(materials[0]);
    return;
  }

  const cols = materials.length === 2 ? 2 : 3;
  const rows = Math.ceil(materials.length / cols);
  const cardWidth = 340;
  const cardHeight = 360;
  const gap = 24;
  const paddingX = 40;
  const headerHeight = 96;
  const paddingBottom = 36;

  const canvasWidth = paddingX * 2 + cols * cardWidth + (cols - 1) * gap;
  const canvasHeight = headerHeight + rows * cardHeight + (rows - 1) * gap + paddingBottom;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Trình duyệt không hỗ trợ tạo ảnh PNG.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = '#0f766e';
  ctx.font = '700 22px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText('KHO HỌC LIỆU SỐ - TRƯỜNG TIỂU HỌC QUANG HƯNG', paddingX, 42);

  ctx.fillStyle = '#475569';
  ctx.font = '500 15px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText(`Bảng mã QR truy cập nhanh (${materials.length} học liệu)`, paddingX, 68);

  const loadedImages = await Promise.all(
    materials.map((m) => loadCorsImage(getQrCodeImageUrl(m.url, 220)))
  );

  materials.forEach((m, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = paddingX + col * (cardWidth + gap);
    const y = headerHeight + row * (cardHeight + gap);

    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, cardWidth, cardHeight, 14);
    ctx.fill();
    ctx.stroke();

    const qrSize = 200;
    const qrX = x + (cardWidth - qrSize) / 2;
    const qrY = y + 20;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12);
    ctx.drawImage(loadedImages[index], qrX, qrY, qrSize, qrSize);

    const gradeText = m.khoiLop === 'Dùng chung' ? 'Dùng chung' : `Khối ${m.khoiLop}`;
    ctx.fillStyle = '#0f766e';
    ctx.font = '700 13px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${index + 1}. ${m.monHoc} · ${gradeText}`, x + cardWidth / 2, qrY + qrSize + 28);

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 15px "Plus Jakarta Sans", Arial, sans-serif';
    drawWrappedText(ctx, m.tieuDe, x + cardWidth / 2, qrY + qrSize + 52, cardWidth - 32, 20, 3);
    ctx.textAlign = 'left';
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('Không thể xuất ảnh PNG danh sách mã QR.'));
    }, 'image/png');
  });

  triggerBlobDownload(blob, `bang-ma-qr-hoc-lieu-${materials.length}.png`);
}

export function printExportSheet(): void {
  window.print();
}
