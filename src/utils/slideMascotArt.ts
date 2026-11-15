import {
  getPptStyleById,
  type PptStyleId,
  type SlideVisualMotif,
} from '../types/ppt';

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(0, 0, 32, 0, Math.PI * 2);
  ctx.arc(34, -10, 40, 0, Math.PI * 2);
  ctx.arc(74, 0, 30, 0, Math.PI * 2);
  ctx.arc(36, 12, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  color: string
) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawMascotBeNa(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);

  // Twin ponytails
  ctx.fillStyle = '#1E293B';
  ctx.beginPath();
  ctx.ellipse(-68, -68, 22, 38, -0.35, 0, Math.PI * 2);
  ctx.ellipse(68, -68, 22, 38, 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Red hair ribbons
  ctx.fillStyle = '#EF4444';
  ctx.beginPath();
  ctx.arc(-50, -90, 10, 0, Math.PI * 2);
  ctx.arc(50, -90, 10, 0, Math.PI * 2);
  ctx.fill();

  // Skirt + torso
  ctx.fillStyle = '#1E3A8A';
  drawRoundedRect(ctx, -44, 58, 88, 72, 16);
  ctx.fill();

  // White shirt
  ctx.fillStyle = '#FFFFFF';
  drawRoundedRect(ctx, -46, 0, 92, 70, 22);
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Red Pioneer Scarf (Khan quang do)
  ctx.fillStyle = '#DC2626';
  ctx.beginPath();
  ctx.moveTo(-36, 4);
  ctx.lineTo(0, 44);
  ctx.lineTo(36, 4);
  ctx.lineTo(18, 0);
  ctx.lineTo(0, 22);
  ctx.lineTo(-18, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-4, 34);
  ctx.lineTo(-14, 72);
  ctx.lineTo(-2, 66);
  ctx.lineTo(12, 74);
  ctx.lineTo(4, 34);
  ctx.closePath();
  ctx.fill();

  // Arms waving
  ctx.fillStyle = '#FDBA74';
  ctx.beginPath();
  ctx.ellipse(-60, 24, 14, 28, 0.5, 0, Math.PI * 2);
  ctx.ellipse(60, 16, 14, 28, -0.7, 0, Math.PI * 2);
  ctx.fill();

  // Hair cap
  ctx.fillStyle = '#1E293B';
  ctx.beginPath();
  ctx.arc(0, -68, 56, 0, Math.PI * 2);
  ctx.fill();

  // Face
  ctx.fillStyle = '#FED7AA';
  ctx.beginPath();
  ctx.arc(0, -56, 48, 0, Math.PI * 2);
  ctx.fill();

  // Bangs
  ctx.fillStyle = '#1E293B';
  ctx.beginPath();
  ctx.arc(0, -78, 48, Math.PI, Math.PI * 2);
  ctx.fill();

  // Eyes & smile
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.arc(-16, -54, 5, 0, Math.PI * 2);
  ctx.arc(16, -54, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FDA4AF';
  ctx.beginPath();
  ctx.ellipse(-26, -42, 8, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(26, -42, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#9A3412';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, -44, 14, 0.2, Math.PI - 0.2);
  ctx.stroke();

  ctx.restore();
}

function drawMascotBeBo(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);

  // Navy shorts
  ctx.fillStyle = '#1E3A8A';
  drawRoundedRect(ctx, -40, 60, 80, 66, 14);
  ctx.fill();

  // White shirt
  ctx.fillStyle = '#FFFFFF';
  drawRoundedRect(ctx, -46, 0, 92, 68, 20);
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Red Pioneer Scarf
  ctx.fillStyle = '#DC2626';
  ctx.beginPath();
  ctx.moveTo(-36, 4);
  ctx.lineTo(0, 44);
  ctx.lineTo(36, 4);
  ctx.lineTo(0, 22);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-4, 34);
  ctx.lineTo(-10, 72);
  ctx.lineTo(10, 72);
  ctx.lineTo(4, 34);
  ctx.closePath();
  ctx.fill();

  // Arms
  ctx.fillStyle = '#FDBA74';
  ctx.beginPath();
  ctx.ellipse(-58, 24, 14, 26, 0.4, 0, Math.PI * 2);
  ctx.ellipse(58, 24, 14, 26, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#FED7AA';
  ctx.beginPath();
  ctx.arc(0, -56, 48, 0, Math.PI * 2);
  ctx.fill();

  // Short hair
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.arc(0, -70, 50, Math.PI * 0.92, Math.PI * 2.08);
  ctx.fill();

  // Round glasses
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(-18, -54, 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(18, -54, 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-5, -54);
  ctx.lineTo(5, -54);
  ctx.stroke();

  // Eyes & smile
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.arc(-18, -54, 4.5, 0, Math.PI * 2);
  ctx.arc(18, -54, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#9A3412';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, -40, 13, 0.2, Math.PI - 0.2);
  ctx.stroke();

  ctx.restore();
}

function drawMascotCuMeo(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);

  // Body
  ctx.fillStyle = '#B45309';
  ctx.beginPath();
  ctx.ellipse(0, 12, 62, 76, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wings
  ctx.fillStyle = '#92400E';
  ctx.beginPath();
  ctx.ellipse(-56, 18, 22, 46, 0.25, 0, Math.PI * 2);
  ctx.ellipse(56, 18, 22, 46, -0.25, 0, Math.PI * 2);
  ctx.fill();

  // Cream belly
  ctx.fillStyle = '#FEF3C7';
  ctx.beginPath();
  ctx.ellipse(0, 30, 42, 48, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ear tufts
  ctx.fillStyle = '#92400E';
  ctx.beginPath();
  ctx.moveTo(-48, -42);
  ctx.lineTo(-26, -74);
  ctx.lineTo(-10, -46);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(48, -42);
  ctx.lineTo(26, -74);
  ctx.lineTo(10, -46);
  ctx.closePath();
  ctx.fill();

  // Eye circles
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(-20, -24, 21, 0, Math.PI * 2);
  ctx.arc(20, -24, 21, 0, Math.PI * 2);
  ctx.fill();

  // Glasses
  ctx.strokeStyle = '#0F766E';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(-20, -24, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(20, -24, 22, 0, Math.PI * 2);
  ctx.stroke();

  // Pupils
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.arc(-20, -24, 8, 0, Math.PI * 2);
  ctx.arc(20, -24, 8, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = '#F59E0B';
  ctx.beginPath();
  ctx.moveTo(-10, -10);
  ctx.lineTo(10, -10);
  ctx.lineTo(0, 6);
  ctx.closePath();
  ctx.fill();

  // Teal bowtie
  ctx.fillStyle = '#0D9488';
  ctx.beginPath();
  ctx.moveTo(0, 14);
  ctx.lineTo(-18, 4);
  ctx.lineTo(-18, 24);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 14);
  ctx.lineTo(18, 4);
  ctx.lineTo(18, 24);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawMascotThoTrang(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);

  // Yellow backpack behind
  ctx.fillStyle = '#FACC15';
  drawRoundedRect(ctx, -50, -8, 100, 74, 22);
  ctx.fill();

  // Long ears
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(-20, -96, 15, 42, -0.15, 0, Math.PI * 2);
  ctx.ellipse(20, -96, 15, 42, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FBCFE8';
  ctx.beginPath();
  ctx.ellipse(-20, -94, 8, 28, -0.15, 0, Math.PI * 2);
  ctx.ellipse(20, -94, 8, 28, 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(0, 32, 46, 56, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Head
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(0, -40, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eyes + pink nose
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.arc(-15, -44, 5, 0, Math.PI * 2);
  ctx.arc(15, -44, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#F472B6';
  ctx.beginPath();
  ctx.arc(0, -32, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMascotSocNau(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);

  // Fluffy tail
  ctx.fillStyle = '#9A3412';
  ctx.beginPath();
  ctx.ellipse(58, -10, 34, 62, 0.45, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = '#B45309';
  ctx.beginPath();
  ctx.ellipse(0, 26, 46, 56, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sky blue vest
  ctx.fillStyle = '#0EA5E9';
  drawRoundedRect(ctx, -38, 0, 76, 62, 18);
  ctx.fill();

  // Head
  ctx.fillStyle = '#C2410C';
  ctx.beginPath();
  ctx.arc(0, -42, 42, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  ctx.beginPath();
  ctx.ellipse(-26, -80, 12, 18, -0.2, 0, Math.PI * 2);
  ctx.ellipse(26, -80, 12, 18, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Eyes & smile
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.arc(-14, -46, 5, 0, Math.PI * 2);
  ctx.arc(14, -46, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FDE68A';
  ctx.beginPath();
  ctx.ellipse(0, -32, 18, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMascotById(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  scale: number
) {
  switch (id) {
    case 'be_bo':
      drawMascotBeBo(ctx, x, y, scale);
      break;
    case 'cu_meo':
      drawMascotCuMeo(ctx, x, y, scale);
      break;
    case 'tho_trang':
      drawMascotThoTrang(ctx, x, y, scale);
      break;
    case 'soc_nau':
      drawMascotSocNau(ctx, x, y, scale);
      break;
    case 'be_na':
    default:
      drawMascotBeNa(ctx, x, y, scale);
      break;
  }
}

function drawLearningProp(
  ctx: CanvasRenderingContext2D,
  motif: SlideVisualMotif,
  cx: number,
  cy: number,
  accentHex: string
) {
  ctx.save();
  ctx.translate(cx, cy);

  if (motif === 'lightbulb') {
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(0, -24, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#94A3B8';
    drawRoundedRect(ctx, -20, 18, 40, 22, 8);
    ctx.fill();
  } else if (motif === 'award') {
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.moveTo(-42, -48);
    ctx.lineTo(42, -48);
    ctx.lineTo(26, 12);
    ctx.lineTo(-26, 12);
    ctx.closePath();
    ctx.fill();
    drawRoundedRect(ctx, -18, 12, 36, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#78350F';
    drawRoundedRect(ctx, -36, 36, 72, 18, 6);
    ctx.fill();
  } else if (motif === 'leaf') {
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.ellipse(0, -10, 44, 62, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#065F46';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-18, 36);
    ctx.lineTo(18, -50);
    ctx.stroke();
  } else if (motif === 'puzzle') {
    ctx.fillStyle = `#${accentHex}`;
    drawRoundedRect(ctx, -46, -46, 52, 52, 10);
    ctx.fill();
    ctx.fillStyle = '#38BDF8';
    drawRoundedRect(ctx, 2, -10, 52, 52, 10);
    ctx.fill();
  } else {
    // Open colorful book (no letters, no numbers)
    ctx.fillStyle = `#${accentHex}`;
    drawRoundedRect(ctx, -74, -36, 148, 86, 12);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(ctx, -64, -28, 60, 68, 8);
    ctx.fill();
    drawRoundedRect(ctx, 4, -28, 60, 68, 8);
    ctx.fill();
  }

  ctx.restore();
}

export function generateSyncedMascotSlideArt(params: {
  styleId: PptStyleId;
  mascotIds: string[];
  visualMotif?: SlideVisualMotif;
  slideNumber?: number;
}): string {
  if (typeof document === 'undefined') {
    return '';
  }

  const width = 1280;
  const height = 720;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const preset = getPptStyleById(params.styleId);
  const { theme } = preset;
  const slideIdx = Math.max(1, params.slideNumber || 1);
  const motif = params.visualMotif || 'book';

  // Sky / soft clean backdrop gradient (zero text, zero numbers)
  const skyGrad = ctx.createLinearGradient(0, 0, width, height);
  skyGrad.addColorStop(0, `#${theme.bgHex}`);
  skyGrad.addColorStop(1, `#${theme.accentSoftHex}`);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, height);

  // Soft decorative sun / glowing circle
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.beginPath();
  ctx.arc(slideIdx % 2 === 0 ? 1080 : 200, 140, 86, 0, Math.PI * 2);
  ctx.fill();

  // Clouds
  drawCloud(ctx, 220 + (slideIdx % 3) * 60, 125, 1.1);
  drawCloud(ctx, 880 - (slideIdx % 2) * 80, 165, 0.95);

  // Gentle rolling meadow / classroom floor hills
  ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
  ctx.beginPath();
  ctx.ellipse(360, 690, 560, 180, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(14, 165, 233, 0.13)';
  ctx.beginPath();
  ctx.ellipse(980, 700, 520, 175, 0, 0, Math.PI * 2);
  ctx.fill();

  // Classroom / learning desk card center stage
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  drawRoundedRect(ctx, 180, 480, 920, 150, 36);
  ctx.fill();
  ctx.strokeStyle = `#${theme.cardBorderHex}`;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Sparkle stars around scene
  drawStar(ctx, 150, 260, 20, 9, `#${theme.accentHex}`);
  drawStar(ctx, 1130, 270, 22, 10, '#FBBF24');
  drawStar(ctx, 640, 120, 16, 7, `#${theme.headerBgHex}`);

  // Learning prop on desk (strictly visual, zero text/numbers)
  const uniqueMascots =
    params.mascotIds.length > 0 ? params.mascotIds.slice(0, 2) : ['be_na'];

  if (uniqueMascots.length >= 2) {
    drawMascotById(ctx, uniqueMascots[0], 390, 410, 1.48);
    drawMascotById(ctx, uniqueMascots[1], 890, 415, 1.45);
    drawLearningProp(ctx, motif, 640, 515, theme.accentHex);
  } else {
    drawMascotById(ctx, uniqueMascots[0], 500, 405, 1.62);
    drawLearningProp(ctx, motif, 825, 495, theme.accentHex);
  }

  return canvas.toDataURL('image/png');
}
