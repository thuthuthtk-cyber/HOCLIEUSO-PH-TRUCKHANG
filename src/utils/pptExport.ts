import PptxGenJS from 'pptxgenjs';
import {
  getPptStyleById,
  type PptSlideItem,
  type PptStyleId,
  type PptStyleTheme,
  type SlideVisualMotif,
} from '../types/ppt';

const MOTIF_VISUAL_LABELS: Record<SlideVisualMotif, { symbol: string; label: string }> = {
  book: { symbol: '📖', label: 'Khám phá kiến thức' },
  sparkles: { symbol: '✨', label: 'Điểm nhấn bài học' },
  lightbulb: { symbol: '💡', label: 'Ý tưởng sáng tạo' },
  compass: { symbol: '🧭', label: 'Định hướng thực hành' },
  puzzle: { symbol: '🧩', label: 'Hoạt động luyện tập' },
  award: { symbol: '🏆', label: 'Mục tiêu cần đạt' },
  users: { symbol: '🤝', label: 'Thảo luận nhóm' },
  leaf: { symbol: '🌱', label: 'Liên hệ thực tế' },
};

function drawGeometricFallbackPanel(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  theme: PptStyleTheme,
  motif: SlideVisualMotif,
  captionText: string
): void {
  const info = MOTIF_VISUAL_LABELS[motif] || MOTIF_VISUAL_LABELS.book;

  // Soft decorative geometric backdrop inside the right visual frame
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 5.26,
    y: 1.44,
    w: 4.14,
    h: 2.52,
    rectRadius: 0.14,
    fill: { color: theme.accentSoftHex },
    line: { color: theme.cardBorderHex, pt: 1.2 },
  });

  // Top-right soft circle
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 8.15,
    y: 1.56,
    w: 1.05,
    h: 1.05,
    fill: { color: theme.cardBgHex, transparency: 35 },
    line: { color: theme.accentHex, pt: 0.8 },
  });

  // Bottom-left soft circle
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 5.44,
    y: 2.95,
    w: 0.85,
    h: 0.85,
    fill: { color: theme.headerBgHex, transparency: 82 },
    line: { color: theme.headerBgHex, pt: 0.5 },
  });

  // Center icon badge
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 6.73,
    y: 1.84,
    w: 1.2,
    h: 1.2,
    fill: { color: theme.cardBgHex },
    line: { color: theme.accentHex, pt: 2 },
  });

  slide.addText(info.symbol, {
    x: 6.73,
    y: 1.92,
    w: 1.2,
    h: 1.05,
    fontSize: 36,
    align: 'center',
    valign: 'middle',
    margin: 0,
  });

  slide.addText(info.label, {
    x: 5.45,
    y: 3.16,
    w: 3.76,
    h: 0.36,
    fontFace: 'Arial',
    fontSize: 13,
    bold: true,
    color: theme.titleColorHex,
    align: 'center',
    valign: 'middle',
    margin: 0,
  });

  slide.addText(captionText, {
    x: 5.45,
    y: 3.52,
    w: 3.76,
    h: 0.3,
    fontFace: 'Arial',
    fontSize: 10,
    color: theme.mutedColorHex,
    align: 'center',
    valign: 'middle',
    margin: 0,
  });
}

function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-_]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return cleaned || 'Bai_giang_AI';
}

export async function exportDeckToPptx(params: {
  deckTitle: string;
  subtitle: string;
  monHoc: string;
  khoiLop: string;
  defaultStyleId: PptStyleId;
  slides: PptSlideItem[];
}): Promise<string> {
  const { deckTitle, subtitle, monHoc, khoiLop, defaultStyleId, slides } = params;
  const pptx = new PptxGenJS();

  pptx.layout = 'LAYOUT_16x9';
  pptx.title = deckTitle;
  pptx.subject = `${monHoc} - Lớp ${khoiLop}`;
  pptx.author = 'Kho Học Liệu Số - Trường Tiểu học Quang Hưng';

  const totalSlides = slides.length;

  for (let i = 0; i < totalSlides; i++) {
    const item = slides[i];
    const stylePreset = getPptStyleById(item.styleId || defaultStyleId);
    const theme = stylePreset.theme;

    const slide = pptx.addSlide();
    slide.background = { color: theme.bgHex };

    // Prominent colored header banner
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 10,
      h: 0.96,
      fill: { color: theme.headerBgHex },
      line: { color: theme.headerBgHex, pt: 0 },
    });

    // Accent strip beneath header
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0.96,
      w: 10,
      h: 0.06,
      fill: { color: theme.accentHex },
      line: { color: theme.accentHex, pt: 0 },
    });

    // Slide index badge on top right
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 8.65,
      y: 0.24,
      w: 1.0,
      h: 0.44,
      rectRadius: 0.12,
      fill: { color: theme.accentHex },
      line: { color: theme.accentHex, pt: 0 },
    });
    slide.addText(`${i + 1}/${totalSlides}`, {
      x: 8.65,
      y: 0.24,
      w: 1.0,
      h: 0.44,
      fontFace: 'Arial',
      fontSize: 12,
      bold: true,
      color: 'FFFFFF',
      align: 'center',
      valign: 'middle',
      margin: 0,
    });

    // Prominent slide title
    slide.addText(item.title || `Slide ${i + 1}`, {
      x: 0.46,
      y: 0.12,
      w: 8.05,
      h: 0.72,
      fontFace: 'Arial',
      fontSize: i === 0 ? 24 : 21,
      bold: true,
      color: 'FFFFFF',
      valign: 'middle',
      margin: 0,
    });

    // LEFT COLUMN: Content Card
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.44,
      y: 1.2,
      w: 4.46,
      h: 3.92,
      rectRadius: 0.12,
      fill: { color: theme.cardBgHex },
      line: { color: theme.cardBorderHex, pt: 1.2 },
    });

    // Small section tag inside left card
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.64,
      y: 1.38,
      w: 2.1,
      h: 0.3,
      rectRadius: 0.08,
      fill: { color: theme.accentSoftHex },
      line: { color: theme.cardBorderHex, pt: 0.5 },
    });
    slide.addText(i === 0 ? `${monHoc.toUpperCase()} · LỚP ${khoiLop}` : 'NỘI DUNG TRỌNG TÂM', {
      x: 0.64,
      y: 1.38,
      w: 2.1,
      h: 0.3,
      fontFace: 'Arial',
      fontSize: 9.5,
      bold: true,
      color: theme.titleColorHex,
      align: 'center',
      valign: 'middle',
      margin: 0,
    });

    // Bullet points on the left
    const bulletRuns = (item.bullets.length > 0 ? item.bullets : [subtitle]).map((b) => ({
      text: b,
      options: {
        bullet: { code: '2022', color: theme.accentHex },
        paraSpaceAfter: 9,
        fontSize: 13.5,
        color: theme.textColorHex,
        fontFace: 'Arial',
      },
    }));

    slide.addText(bulletRuns, {
      x: 0.64,
      y: 1.82,
      w: 4.06,
      h: 2.38,
      valign: 'top',
      margin: 0,
    });

    // Key takeaway callout box at bottom of left card
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.62,
      y: 4.3,
      w: 4.1,
      h: 0.66,
      rectRadius: 0.08,
      fill: { color: theme.accentSoftHex },
      line: { color: theme.accentHex, pt: 1 },
    });
    slide.addText(`Ghi nhớ: ${item.keyTakeaway}`, {
      x: 0.74,
      y: 4.34,
      w: 3.86,
      h: 0.58,
      fontFace: 'Arial',
      fontSize: 10.5,
      bold: true,
      color: theme.titleColorHex,
      valign: 'middle',
      margin: 0,
    });

    // RIGHT COLUMN: Large Illustration Showcase Card
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 5.08,
      y: 1.2,
      w: 4.48,
      h: 3.92,
      rectRadius: 0.12,
      fill: { color: theme.cardBgHex },
      line: { color: theme.cardBorderHex, pt: 1.2 },
    });

    const canEmbedImage =
      Boolean(item.imageDataUrl) &&
      item.imageStatus !== 'error' &&
      item.imageStatus !== 'removed';

    let imageInserted = false;
    if (canEmbedImage && item.imageDataUrl) {
      try {
        // 16:9 image cleanly fitted inside the right frame (4.18" x 2.35")
        slide.addImage({
          data: item.imageDataUrl,
          x: 5.23,
          y: 1.48,
          w: 4.18,
          h: 2.35,
          rounding: true,
        });
        imageInserted = true;
      } catch {
        imageInserted = false;
      }
    }

    if (!imageInserted) {
      drawGeometricFallbackPanel(
        pptx,
        slide,
        theme,
        item.visualMotif,
        'Hình khối minh họa thay thế'
      );
    }

    // Bottom badge strip inside right visual showcase
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 5.26,
      y: 4.12,
      w: 4.12,
      h: 0.76,
      rectRadius: 0.08,
      fill: { color: theme.bgHex },
      line: { color: theme.cardBorderHex, pt: 0.8 },
    });

    slide.addText(
      imageInserted
        ? `Minh họa trực quan · Phong cách ${stylePreset.name}`
        : `Khung hình minh họa · ${stylePreset.name}`,
      {
        x: 5.36,
        y: 4.18,
        w: 3.92,
        h: 0.64,
        fontFace: 'Arial',
        fontSize: 10.5,
        italic: true,
        color: theme.mutedColorHex,
        align: 'center',
        valign: 'middle',
        margin: 0,
      }
    );

    // Footer metadata line
    slide.addText(`${deckTitle} · ${monHoc} Lớp ${khoiLop}`, {
      x: 0.44,
      y: 5.22,
      w: 9.12,
      h: 0.28,
      fontFace: 'Arial',
      fontSize: 9.5,
      color: theme.mutedColorHex,
      margin: 0,
    });

    if (item.speakerNotes) {
      slide.addNotes(item.speakerNotes);
    }
  }

  const fileName = `${sanitizeFileName(deckTitle)}_Lop${khoiLop}.pptx`;
  await pptx.writeFile({ fileName });
  return fileName;
}
