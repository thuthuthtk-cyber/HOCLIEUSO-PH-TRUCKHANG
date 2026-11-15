import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  convertMillimetersToTwip,
} from 'docx';
import { calculateMatrixTotals } from '../services/aiExamGeneratorService';
import type {
  ExamConfig,
  ExamQuestion,
  MatrixRow,
  SpecificationRow,
} from '../types/exam';
import { triggerBlobDownload } from './qrExport';

export interface ExamExportBundle {
  tieuDe: string;
  config: ExamConfig;
  maTran: MatrixRow[];
  banDacTa: SpecificationRow[];
  deKiemTra: ExamQuestion[];
}

const FONT_NAME = 'Times New Roman';
const COLOR_DARK = '0F172A';
const COLOR_MUTED = '334155';
const HEADER_SHADING = 'E5E7EB';
const TOTAL_SHADING = 'F1F5F9';

const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '334155' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '334155' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '334155' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '334155' },
};

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const CELL_MARGINS = {
  top: 80,
  bottom: 80,
  left: 90,
  right: 90,
};

function formatScoreVi(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded},0` : String(rounded).replace('.', ',');
}

function getDateFileStamp(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function makeRun(
  text: string,
  options?: {
    bold?: boolean;
    italics?: boolean;
    size?: number;
    color?: string;
  }
): TextRun {
  return new TextRun({
    text,
    font: FONT_NAME,
    bold: options?.bold ?? false,
    italics: options?.italics ?? false,
    size: options?.size ?? 24, // 12pt default
    color: options?.color ?? COLOR_DARK,
  });
}

function makeParagraph(
  children: TextRun[],
  options?: {
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    spacingBefore?: number;
    spacingAfter?: number;
    pageBreakBefore?: boolean;
  }
): Paragraph {
  return new Paragraph({
    alignment: options?.alignment ?? AlignmentType.LEFT,
    spacing: {
      before: options?.spacingBefore ?? 0,
      after: options?.spacingAfter ?? 80,
      line: 276,
    },
    pageBreakBefore: options?.pageBreakBefore ?? false,
    children,
  });
}

function makeTableCell(
  paragraphs: Paragraph[],
  widthDxa: number,
  options?: {
    colSpan?: number;
    rowSpan?: number;
    shading?: string;
    verticalAlign?:
      | typeof VerticalAlign.TOP
      | typeof VerticalAlign.CENTER
      | typeof VerticalAlign.BOTTOM;
  }
): TableCell {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    columnSpan: options?.colSpan,
    rowSpan: options?.rowSpan,
    borders: TABLE_BORDERS,
    margins: CELL_MARGINS,
    verticalAlign: options?.verticalAlign ?? VerticalAlign.CENTER,
    shading: options?.shading
      ? { type: ShadingType.CLEAR, fill: options.shading, color: 'auto' }
      : undefined,
    children: paragraphs,
  });
}

function buildOfficialSchoolHeader(
  titleText: string,
  subtitleText: string,
  pageBreakBefore = false
): (Paragraph | Table)[] {
  // Khổ A4 rộng 210mm, lề trái/phải 15mm => vùng nội dung rộng 180mm (~10206 twips)
  const leftWidth = 4800;
  const rightWidth = 5406;

  const headerTable = new Table({
    width: { size: leftWidth + rightWidth, type: WidthType.DXA },
    columnWidths: [leftWidth, rightWidth],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: leftWidth, type: WidthType.DXA },
            borders: NO_BORDERS,
            children: [
              makeParagraph(
                [makeRun('TRƯỜNG TIỂU HỌC QUANG HƯNG', { bold: true, size: 22 })],
                { alignment: AlignmentType.CENTER, spacingAfter: 30 }
              ),
              makeParagraph(
                [makeRun('PHÂN HIỆU TRỰC KHANG', { bold: true, size: 22 })],
                { alignment: AlignmentType.CENTER, spacingAfter: 30 }
              ),
              makeParagraph([makeRun('-------------------', { size: 20, color: COLOR_MUTED })], {
                alignment: AlignmentType.CENTER,
                spacingAfter: 0,
              }),
            ],
          }),
          new TableCell({
            width: { size: rightWidth, type: WidthType.DXA },
            borders: NO_BORDERS,
            children: [
              makeParagraph(
                [
                  makeRun('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', {
                    bold: true,
                    size: 22,
                  }),
                ],
                { alignment: AlignmentType.CENTER, spacingAfter: 30 }
              ),
              makeParagraph(
                [makeRun('Độc lập - Tự do - Hạnh phúc', { bold: true, size: 22 })],
                { alignment: AlignmentType.CENTER, spacingAfter: 30 }
              ),
              makeParagraph([makeRun('---------------------------', { size: 20, color: COLOR_MUTED })], {
                alignment: AlignmentType.CENTER,
                spacingAfter: 0,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const blocks: (Paragraph | Table)[] = [];
  if (pageBreakBefore) {
    blocks.push(
      new Paragraph({
        pageBreakBefore: true,
        spacing: { before: 0, after: 0 },
        children: [],
      })
    );
  }
  blocks.push(headerTable);
  blocks.push(
    makeParagraph([makeRun(titleText, { bold: true, size: 28 })], {
      alignment: AlignmentType.CENTER,
      spacingBefore: 180,
      spacingAfter: 60,
    })
  );
  blocks.push(
    makeParagraph([makeRun(subtitleText, { bold: true, size: 24, color: COLOR_MUTED })], {
      alignment: AlignmentType.CENTER,
      spacingAfter: 140,
    })
  );

  return blocks;
}

function buildMatrixSection(bundle: ExamExportBundle): (Paragraph | Table)[] {
  const { config, maTran } = bundle;
  const totals = calculateMatrixTotals(maTran);

  // Tổng bề rộng 10206 twips (180mm), gồm 17 cột:
  // TT(1) + Mạch(1) + Mức1(TN câu, TN điểm, TL câu, TL điểm = 4) + Mức2(4) + Mức3(4) + Tổng(Số câu, Điểm = 2) + Tỷ lệ %(1)
  const matrixCols = [
    420,  // 0: TT
    2106, // 1: Mạch kiến thức
    450, 480, 450, 480, // 2..5: Mức 1 (TN câu, TN điểm, TL câu, TL điểm)
    450, 480, 450, 480, // 6..9: Mức 2
    450, 480, 450, 480, // 10..13: Mức 3
    540, 560, // 14..15: Tổng (Số câu, Điểm)
    600,  // 16: Tỷ lệ %
  ]; // Sum = 10206

  const headerTop = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      makeTableCell(
        [makeParagraph([makeRun('TT', { bold: true, size: 19 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })],
        matrixCols[0],
        { rowSpan: 3, shading: HEADER_SHADING }
      ),
      makeTableCell(
        [makeParagraph([makeRun('Mạch kiến thức / Chủ đề', { bold: true, size: 19 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })],
        matrixCols[1],
        { rowSpan: 3, shading: HEADER_SHADING }
      ),
      makeTableCell(
        [makeParagraph([makeRun('Mức 1 (Nhận biết)', { bold: true, size: 19 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })],
        matrixCols[2] + matrixCols[3] + matrixCols[4] + matrixCols[5],
        { colSpan: 4, shading: HEADER_SHADING }
      ),
      makeTableCell(
        [makeParagraph([makeRun('Mức 2 (Kết nối)', { bold: true, size: 19 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })],
        matrixCols[6] + matrixCols[7] + matrixCols[8] + matrixCols[9],
        { colSpan: 4, shading: HEADER_SHADING }
      ),
      makeTableCell(
        [makeParagraph([makeRun('Mức 3 (Vận dụng)', { bold: true, size: 19 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })],
        matrixCols[10] + matrixCols[11] + matrixCols[12] + matrixCols[13],
        { colSpan: 4, shading: HEADER_SHADING }
      ),
      makeTableCell(
        [makeParagraph([makeRun('Tổng', { bold: true, size: 19 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })],
        matrixCols[14] + matrixCols[15],
        { colSpan: 2, rowSpan: 2, shading: HEADER_SHADING }
      ),
      makeTableCell(
        [makeParagraph([makeRun('Tỷ lệ (%)', { bold: true, size: 19 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })],
        matrixCols[16],
        { rowSpan: 3, shading: HEADER_SHADING }
      ),
    ],
  });

  const headerMid = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      makeTableCell([makeParagraph([makeRun('TNKQ', { bold: true, size: 18 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], matrixCols[2] + matrixCols[3], { colSpan: 2, shading: HEADER_SHADING }),
      makeTableCell([makeParagraph([makeRun('TL', { bold: true, size: 18 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], matrixCols[4] + matrixCols[5], { colSpan: 2, shading: HEADER_SHADING }),
      makeTableCell([makeParagraph([makeRun('TNKQ', { bold: true, size: 18 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], matrixCols[6] + matrixCols[7], { colSpan: 2, shading: HEADER_SHADING }),
      makeTableCell([makeParagraph([makeRun('TL', { bold: true, size: 18 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], matrixCols[8] + matrixCols[9], { colSpan: 2, shading: HEADER_SHADING }),
      makeTableCell([makeParagraph([makeRun('TNKQ', { bold: true, size: 18 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], matrixCols[10] + matrixCols[11], { colSpan: 2, shading: HEADER_SHADING }),
      makeTableCell([makeParagraph([makeRun('TL', { bold: true, size: 18 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], matrixCols[12] + matrixCols[13], { colSpan: 2, shading: HEADER_SHADING }),
    ],
  });

  const subLabels = [
    'Câu', 'Đ', 'Câu', 'Đ',
    'Câu', 'Đ', 'Câu', 'Đ',
    'Câu', 'Đ', 'Câu', 'Đ',
    'Câu', 'Điểm',
  ];

  const headerSub = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: subLabels.map((lbl, idx) =>
      makeTableCell(
        [makeParagraph([makeRun(lbl, { bold: true, size: 18 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })],
        matrixCols[idx + 2],
        { shading: HEADER_SHADING }
      )
    ),
  });

  const numCell = (val: string, width: number, bold = false, shading?: string) =>
    makeTableCell(
      [makeParagraph([makeRun(val, { bold, size: 19 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })],
      width,
      { shading }
    );

  const dataRows = maTran.map((row, idx) => {
    const showCount = (n: number) => (n > 0 ? String(n) : '');
    const showScore = (n: number) => (n > 0 ? formatScoreVi(n) : '');
    return new TableRow({
      cantSplit: true,
      children: [
        numCell(String(idx + 1), matrixCols[0]),
        makeTableCell(
          [makeParagraph([makeRun(row.machKienThuc, { size: 20 })], { spacingAfter: 0 })],
          matrixCols[1]
        ),
        numCell(showCount(row.muc1.tnSoCau), matrixCols[2]),
        numCell(showScore(row.muc1.tnDiem), matrixCols[3]),
        numCell(showCount(row.muc1.tlSoCau), matrixCols[4]),
        numCell(showScore(row.muc1.tlDiem), matrixCols[5]),
        numCell(showCount(row.muc2.tnSoCau), matrixCols[6]),
        numCell(showScore(row.muc2.tnDiem), matrixCols[7]),
        numCell(showCount(row.muc2.tlSoCau), matrixCols[8]),
        numCell(showScore(row.muc2.tlDiem), matrixCols[9]),
        numCell(showCount(row.muc3.tnSoCau), matrixCols[10]),
        numCell(showScore(row.muc3.tnDiem), matrixCols[11]),
        numCell(showCount(row.muc3.tlSoCau), matrixCols[12]),
        numCell(showScore(row.muc3.tlDiem), matrixCols[13]),
        numCell(String(row.tongSoCau), matrixCols[14], true),
        numCell(formatScoreVi(row.tongDiem), matrixCols[15], true),
        numCell(`${Math.round(row.tyLePhanTram)}%`, matrixCols[16], true),
      ],
    });
  });

  const totalRow = new TableRow({
    cantSplit: true,
    children: [
      makeTableCell(
        [makeParagraph([makeRun('Tổng cộng', { bold: true, size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })],
        matrixCols[0] + matrixCols[1],
        { colSpan: 2, shading: TOTAL_SHADING }
      ),
      numCell(String(totals.muc1TnSoCau), matrixCols[2], true, TOTAL_SHADING),
      numCell(formatScoreVi(totals.muc1TnDiem), matrixCols[3], true, TOTAL_SHADING),
      numCell(String(totals.muc1TlSoCau), matrixCols[4], true, TOTAL_SHADING),
      numCell(formatScoreVi(totals.muc1TlDiem), matrixCols[5], true, TOTAL_SHADING),
      numCell(String(totals.muc2TnSoCau), matrixCols[6], true, TOTAL_SHADING),
      numCell(formatScoreVi(totals.muc2TnDiem), matrixCols[7], true, TOTAL_SHADING),
      numCell(String(totals.muc2TlSoCau), matrixCols[8], true, TOTAL_SHADING),
      numCell(formatScoreVi(totals.muc2TlDiem), matrixCols[9], true, TOTAL_SHADING),
      numCell(String(totals.muc3TnSoCau), matrixCols[10], true, TOTAL_SHADING),
      numCell(formatScoreVi(totals.muc3TnDiem), matrixCols[11], true, TOTAL_SHADING),
      numCell(String(totals.muc3TlSoCau), matrixCols[12], true, TOTAL_SHADING),
      numCell(formatScoreVi(totals.muc3TlDiem), matrixCols[13], true, TOTAL_SHADING),
      numCell(String(totals.tongSoCau), matrixCols[14], true, TOTAL_SHADING),
      numCell(formatScoreVi(totals.tongDiem), matrixCols[15], true, TOTAL_SHADING),
      numCell('100%', matrixCols[16], true, TOTAL_SHADING),
    ],
  });

  return [
    ...buildOfficialSchoolHeader(
      'I. MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ',
      `Môn: ${config.monHoc} · Lớp ${config.khoiLop} · ${config.thoiDiemKiemTra} · Năm học: ${config.namHoc || '2026 - 2027'}`,
      false
    ),
    makeParagraph(
      [
        makeRun(
          `Tỷ lệ nhận thức (Thông tư 27/2020): Mức 1 (${config.tyLeMucDo.muc1_NhanBiet}%) · Mức 2 (${config.tyLeMucDo.muc2_KetNoi}%) · Mức 3 (${config.tyLeMucDo.muc3_VanDung}%) · Thời gian: ${config.thoiGianLamBai} phút.`,
          { italics: true, size: 22, color: COLOR_MUTED }
        ),
      ],
      { alignment: AlignmentType.CENTER, spacingAfter: 120 }
    ),
    new Table({
      width: { size: 10206, type: WidthType.DXA },
      columnWidths: matrixCols,
      rows: [headerTop, headerMid, headerSub, ...dataRows, totalRow],
    }),
  ];
}

function buildSpecificationSection(bundle: ExamExportBundle): (Paragraph | Table)[] {
  const { config, banDacTa } = bundle;
  // Tổng bề rộng 10206 twips: TT(500), Mạch(1800), Đơn vị/YCCĐ(2600), M1(600), M2(600), M3(600), Mô tả chi tiết(3506)
  const specCols = [500, 1800, 2600, 600, 600, 600, 3506];

  const headerTop = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      makeTableCell([makeParagraph([makeRun('TT', { bold: true, size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], specCols[0], { rowSpan: 2, shading: HEADER_SHADING }),
      makeTableCell([makeParagraph([makeRun('Mạch kiến thức', { bold: true, size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], specCols[1], { rowSpan: 2, shading: HEADER_SHADING }),
      makeTableCell([makeParagraph([makeRun('Đơn vị kiến thức / Yêu cầu cần đạt (GDPT 2018)', { bold: true, size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], specCols[2], { rowSpan: 2, shading: HEADER_SHADING }),
      makeTableCell([makeParagraph([makeRun('Số câu hỏi theo mức độ', { bold: true, size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], specCols[3] + specCols[4] + specCols[5], { colSpan: 3, shading: HEADER_SHADING }),
      makeTableCell([makeParagraph([makeRun('Mô tả chi tiết năng lực cần đạt ở từng câu', { bold: true, size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], specCols[6], { rowSpan: 2, shading: HEADER_SHADING }),
    ],
  });

  const headerSub = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      makeTableCell([makeParagraph([makeRun('Mức 1', { bold: true, size: 19 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], specCols[3], { shading: HEADER_SHADING }),
      makeTableCell([makeParagraph([makeRun('Mức 2', { bold: true, size: 19 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], specCols[4], { shading: HEADER_SHADING }),
      makeTableCell([makeParagraph([makeRun('Mức 3', { bold: true, size: 19 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], specCols[5], { shading: HEADER_SHADING }),
    ],
  });

  const dataRows = banDacTa.map((row, idx) => {
    const detailParagraphs =
      row.moTaChiTietTheoCau.length > 0
        ? row.moTaChiTietTheoCau.map((det) =>
            makeParagraph(
              [
                makeRun(`• Câu ${det.soThuTuCau} (${det.mucDo} - ${det.hinhThuc}): `, {
                  bold: true,
                  size: 20,
                }),
                makeRun(det.nangLucCanDat, { size: 20 }),
              ],
              { spacingAfter: 40 }
            )
          )
        : [makeParagraph([makeRun('Đáp ứng chuẩn YCCĐ theo chương trình GDPT 2018.', { size: 20 })], { spacingAfter: 0 })];

    return new TableRow({
      cantSplit: true,
      children: [
        makeTableCell([makeParagraph([makeRun(String(idx + 1), { size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], specCols[0]),
        makeTableCell([makeParagraph([makeRun(row.machKienThuc, { bold: true, size: 20 })], { spacingAfter: 0 })], specCols[1]),
        makeTableCell([makeParagraph([makeRun(row.donViKienThuc, { size: 20 })], { spacingAfter: 0 })], specCols[2]),
        makeTableCell([makeParagraph([makeRun(row.muc1_SoCau > 0 ? String(row.muc1_SoCau) : '-', { size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], specCols[3]),
        makeTableCell([makeParagraph([makeRun(row.muc2_SoCau > 0 ? String(row.muc2_SoCau) : '-', { size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], specCols[4]),
        makeTableCell([makeParagraph([makeRun(row.muc3_SoCau > 0 ? String(row.muc3_SoCau) : '-', { size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], specCols[5]),
        makeTableCell(detailParagraphs, specCols[6]),
      ],
    });
  });

  return [
    ...buildOfficialSchoolHeader(
      'II. BẢN ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KÌ',
      `Môn: ${config.monHoc} · Lớp ${config.khoiLop} · ${config.thoiDiemKiemTra} · Thời gian: ${config.thoiGianLamBai} phút`,
      true
    ),
    new Table({
      width: { size: 10206, type: WidthType.DXA },
      columnWidths: specCols,
      rows: [headerTop, headerSub, ...dataRows],
    }),
  ];
}

function buildOfficialExamPaperSection(bundle: ExamExportBundle): (Paragraph | Table)[] {
  const { config, deKiemTra, tieuDe } = bundle;

  // Khung thông tin học sinh + Điểm + Lời phê giáo viên
  const studentInfoTable = new Table({
    width: { size: 10206, type: WidthType.DXA },
    columnWidths: [6400, 3806],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          makeTableCell(
            [
              makeParagraph([
                makeRun('Họ và tên học sinh: ', { bold: true, size: 24 }),
                makeRun('.................................................................', { size: 24 }),
              ]),
              makeParagraph([
                makeRun(`Lớp: ${config.khoiLop}.....    `, { bold: true, size: 24 }),
                makeRun(`Môn: ${config.monHoc}    `, { size: 24 }),
                makeRun(`Thời gian: ${config.thoiGianLamBai} phút`, { size: 24 }),
              ], { spacingAfter: 0 }),
            ],
            6400
          ),
          makeTableCell(
            [
              makeParagraph([makeRun('ĐIỂM', { bold: true, size: 22 })], {
                alignment: AlignmentType.CENTER,
                spacingAfter: 60,
              }),
              makeParagraph([makeRun('Bằng số: ..........   Bằng chữ: ................', { size: 20 })], {
                alignment: AlignmentType.CENTER,
                spacingAfter: 0,
              }),
            ],
            3806
          ),
        ],
      }),
      new TableRow({
        cantSplit: true,
        children: [
          makeTableCell(
            [
              makeParagraph(
                [
                  makeRun('Lời phê của giáo viên: ', { bold: true, size: 22 }),
                  makeRun(
                    '..........................................................................................................................',
                    { size: 22 }
                  ),
                ],
                { spacingAfter: 40 }
              ),
              makeParagraph(
                [
                  makeRun(
                    '...........................................................................................................................................................',
                    { size: 22 }
                  ),
                ],
                { spacingAfter: 0 }
              ),
            ],
            10206,
            { colSpan: 2 }
          ),
        ],
      }),
    ],
  });

  const blocks: (Paragraph | Table)[] = [
    ...buildOfficialSchoolHeader(
      'III. ĐỀ KIỂM TRA CHÍNH THỨC',
      `${tieuDe} (${config.thoiDiemKiemTra} · Thời gian làm bài: ${config.thoiGianLamBai} phút)`,
      true
    ),
    studentInfoTable,
    makeParagraph([makeRun('NỘI DUNG ĐỀ BÀI', { bold: true, size: 26 })], {
      alignment: AlignmentType.CENTER,
      spacingBefore: 180,
      spacingAfter: 120,
    }),
  ];

  let hasTracNghiemHeader = false;
  let hasTuLuanHeader = false;

  for (const q of deKiemTra) {
    const isTuLuan = q.hinhThuc === 'Tự luận' || q.hinhThuc.toLowerCase().includes('tự luận');
    if (!isTuLuan && !hasTracNghiemHeader) {
      hasTracNghiemHeader = true;
      blocks.push(
        makeParagraph([makeRun('I. PHẦN TRẮC NGHIỆM', { bold: true, size: 24 })], {
          spacingBefore: 120,
          spacingAfter: 80,
        })
      );
    } else if (isTuLuan && !hasTuLuanHeader) {
      hasTuLuanHeader = true;
      blocks.push(
        makeParagraph([makeRun('II. PHẦN TỰ LUẬN', { bold: true, size: 24 })], {
          spacingBefore: 180,
          spacingAfter: 80,
        })
      );
    }

    blocks.push(
      makeParagraph(
        [
          makeRun(`Câu ${q.soThuTu} (${formatScoreVi(q.diem)} điểm): `, {
            bold: true,
            size: 24,
          }),
          makeRun(q.noiDungCauHoi, { size: 24 }),
        ],
        { spacingBefore: 100, spacingAfter: 60 }
      )
    );

    if (q.cacLuaChon && q.cacLuaChon.length > 0) {
      q.cacLuaChon.forEach((opt) => {
        blocks.push(
          makeParagraph([makeRun(`    ${opt}`, { size: 24 })], {
            spacingAfter: 40,
          })
        );
      });
    }

    if (q.hinhThuc === 'Nối' && (q.cotBenTrai?.length || q.cotBenPhai?.length)) {
      const leftItems = q.cotBenTrai || [];
      const rightItems = q.cotBenPhai || [];
      const rowCount = Math.max(leftItems.length, rightItems.length);
      const matchRows: TableRow[] = [
        new TableRow({
          cantSplit: true,
          children: [
            makeTableCell(
              [makeParagraph([makeRun('Cột A', { bold: true, size: 22 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })],
              5103,
              { shading: HEADER_SHADING }
            ),
            makeTableCell(
              [makeParagraph([makeRun('Cột B', { bold: true, size: 22 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })],
              5103,
              { shading: HEADER_SHADING }
            ),
          ],
        }),
      ];

      for (let i = 0; i < rowCount; i += 1) {
        matchRows.push(
          new TableRow({
            cantSplit: true,
            children: [
              makeTableCell([makeParagraph([makeRun(leftItems[i] || '', { size: 22 })], { spacingAfter: 0 })], 5103),
              makeTableCell([makeParagraph([makeRun(rightItems[i] || '', { size: 22 })], { spacingAfter: 0 })], 5103),
            ],
          })
        );
      }

      blocks.push(
        new Table({
          width: { size: 10206, type: WidthType.DXA },
          columnWidths: [5103, 5103],
          rows: matchRows,
        })
      );
    }

    if (q.hinhThuc === 'Tự luận') {
      blocks.push(
        makeParagraph([makeRun('Bài làm:', { italics: true, size: 22, color: COLOR_MUTED })], {
          spacingAfter: 40,
        })
      );
      for (let line = 0; line < 3; line += 1) {
        blocks.push(
          makeParagraph(
            [
              makeRun(
                '..........................................................................................................................................................',
                { size: 22, color: COLOR_MUTED }
              ),
            ],
            { spacingAfter: 40 }
          )
        );
      }
    }
  }

  return blocks;
}

function buildAnswerKeySection(bundle: ExamExportBundle): (Paragraph | Table)[] {
  const { config, deKiemTra } = bundle;
  const cols = [650, 1450, 3556, 3550, 1000]; // Sum = 10206

  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      makeTableCell([makeParagraph([makeRun('Câu', { bold: true, size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], cols[0], { shading: HEADER_SHADING }),
      makeTableCell([makeParagraph([makeRun('Mức độ / Dạng', { bold: true, size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], cols[1], { shading: HEADER_SHADING }),
      makeTableCell([makeParagraph([makeRun('Đáp án chính xác', { bold: true, size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], cols[2], { shading: HEADER_SHADING }),
      makeTableCell([makeParagraph([makeRun('Hướng dẫn chấm chi tiết', { bold: true, size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], cols[3], { shading: HEADER_SHADING }),
      makeTableCell([makeParagraph([makeRun('Biểu điểm', { bold: true, size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], cols[4], { shading: HEADER_SHADING }),
    ],
  });

  const dataRows = deKiemTra.map(
    (q) =>
      new TableRow({
        cantSplit: true,
        children: [
          makeTableCell([makeParagraph([makeRun(`Câu ${q.soThuTu}`, { bold: true, size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], cols[0]),
          makeTableCell(
            [
              makeParagraph([makeRun(q.mucDo, { bold: true, size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 20 }),
              makeParagraph([makeRun(q.hinhThuc, { size: 19, color: COLOR_MUTED })], { alignment: AlignmentType.CENTER, spacingAfter: 0 }),
            ],
            cols[1]
          ),
          makeTableCell([makeParagraph([makeRun(q.dapAnChiTiet, { size: 20 })], { spacingAfter: 0 })], cols[2]),
          makeTableCell([makeParagraph([makeRun(q.huongDanCham, { size: 20 })], { spacingAfter: 0 })], cols[3]),
          makeTableCell([makeParagraph([makeRun(`${formatScoreVi(q.diem)} điểm`, { bold: true, size: 20 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })], cols[4]),
        ],
      })
  );

  const totalScore = deKiemTra.reduce((sum, q) => sum + q.diem, 0);
  const totalRow = new TableRow({
    cantSplit: true,
    children: [
      makeTableCell(
        [makeParagraph([makeRun('Tổng điểm toàn bài', { bold: true, size: 22 })], { alignment: AlignmentType.RIGHT, spacingAfter: 0 })],
        cols[0] + cols[1] + cols[2] + cols[3],
        { colSpan: 4, shading: TOTAL_SHADING }
      ),
      makeTableCell(
        [makeParagraph([makeRun(`${formatScoreVi(totalScore)} điểm`, { bold: true, size: 22 })], { alignment: AlignmentType.CENTER, spacingAfter: 0 })],
        cols[4],
        { shading: TOTAL_SHADING }
      ),
    ],
  });

  return [
    ...buildOfficialSchoolHeader(
      'IV. ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM (BIỂU ĐIỂM)',
      `Môn: ${config.monHoc} · Lớp ${config.khoiLop} · ${config.thoiDiemKiemTra}`,
      true
    ),
    new Table({
      width: { size: 10206, type: WidthType.DXA },
      columnWidths: cols,
      rows: [headerRow, ...dataRows, totalRow],
    }),
    makeParagraph(
      [
        makeRun(
          'Ghi chú: Điểm toàn bài làm tròn đến 0,5 hoặc theo quy định đánh giá định kì hiện hành của Thông tư 27/2020/TT-BGDĐT.',
          { italics: true, size: 20, color: COLOR_MUTED }
        ),
      ],
      { spacingBefore: 140, spacingAfter: 0 }
    ),
  ];
}

export async function exportExamToWord(bundle: ExamExportBundle): Promise<string> {
  if (!bundle.maTran.length || !bundle.deKiemTra.length) {
    throw new Error('Hồ sơ đề kiểm tra chưa đầy đủ dữ liệu để xuất tệp Word.');
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297),
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: convertMillimetersToTwip(15),
              bottom: convertMillimetersToTwip(15),
              left: convertMillimetersToTwip(15),
              right: convertMillimetersToTwip(15),
            },
          },
        },
        children: [
          ...buildMatrixSection(bundle),
          ...buildSpecificationSection(bundle),
          ...buildOfficialExamPaperSection(bundle),
          ...buildAnswerKeySection(bundle),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safeSubject = bundle.config.monHoc
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const fileName = `De-kiem-tra-${safeSubject}-lop-${bundle.config.khoiLop}-${getDateFileStamp()}.docx`;
  triggerBlobDownload(blob, fileName);
  return fileName;
}
