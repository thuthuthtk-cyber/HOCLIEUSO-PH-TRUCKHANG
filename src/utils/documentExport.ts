import ExcelJS from 'exceljs';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
  convertMillimetersToTwip,
} from 'docx';
import type { LearningMaterial } from '../types/hocLieu';
import { getQrCodeImageUrl, triggerBlobDownload } from './qrExport';

interface QrPngAsset {
  bytes: Uint8Array;
  base64: string;
}

function getDateFileStamp(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

async function fetchQrPngAsset(targetUrl: string): Promise<QrPngAsset> {
  const qrUrl = getQrCodeImageUrl(targetUrl, 180);
  const response = await fetch(qrUrl, { mode: 'cors' });
  if (!response.ok) {
    throw new Error(`Không thể tạo mã QR (mã lỗi ${response.status}).`);
  }
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return {
    bytes,
    base64: uint8ArrayToBase64(bytes),
  };
}

async function fetchAllQrAssets(materials: LearningMaterial[]): Promise<QrPngAsset[]> {
  return Promise.all(materials.map((item) => fetchQrPngAsset(item.url)));
}

function formatGradeLabel(khoiLop: LearningMaterial['khoiLop']): string {
  return khoiLop === 'Dùng chung' ? 'Dùng chung' : `Khối ${khoiLop}`;
}

export async function exportMaterialsToExcel(materials: LearningMaterial[]): Promise<string> {
  if (materials.length === 0) {
    throw new Error('Không có học liệu nào để xuất tệp Excel.');
  }

  const qrAssets = await fetchAllQrAssets(materials);
  const resolvedExcel = ExcelJS as unknown as {
    Workbook?: typeof ExcelJS.Workbook;
    default?: { Workbook?: typeof ExcelJS.Workbook };
  };
  const WorkbookCtor = resolvedExcel.Workbook || resolvedExcel.default?.Workbook;
  if (!WorkbookCtor) {
    throw new Error('Không thể khởi tạo trình tạo tệp Excel.');
  }

  const workbook = new WorkbookCtor();
  workbook.creator = 'Kho Học Liệu Số - Trường Tiểu học Quang Hưng';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Danh muc hoc lieu QR', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    },
  });

  sheet.columns = [
    { key: 'stt', width: 7 },
    { key: 'title', width: 34 },
    { key: 'category', width: 22 },
    { key: 'url', width: 38 },
    { key: 'qr', width: 17 },
  ];

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF334155' } },
    left: { style: 'thin', color: { argb: 'FF334155' } },
    bottom: { style: 'thin', color: { argb: 'FF334155' } },
    right: { style: 'thin', color: { argb: 'FF334155' } },
  };

  // 3 dòng tiêu đề trên cùng
  sheet.mergeCells('A1:E1');
  const titleRow = sheet.getRow(1);
  titleRow.height = 28;
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'PHIẾU DANH MỤC HỌC LIỆU SỐ KÈM MÃ QR';
  titleCell.font = { name: 'Times New Roman', size: 15, bold: true, color: { argb: 'FF0F172A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:E2');
  const schoolRow = sheet.getRow(2);
  schoolRow.height = 22;
  const schoolCell = sheet.getCell('A2');
  schoolCell.value = 'Trường Tiểu học Quang Hưng - Phân hiệu Trực Khang';
  schoolCell.font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FF1E293B' } };
  schoolCell.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A3:E3');
  const noteRow = sheet.getRow(3);
  noteRow.height = 20;
  const noteCell = sheet.getCell('A3');
  noteCell.value =
    'Dùng camera điện thoại hoặc Zalo quét mã QR để mở trực tiếp tài liệu giảng dạy.';
  noteCell.font = { name: 'Times New Roman', size: 12, italic: true, color: { argb: 'FF475569' } };
  noteCell.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.getRow(4).height = 10;

  // Dòng tiêu đề bảng (Row 5)
  const headerRowIndex = 5;
  const headerRow = sheet.getRow(headerRowIndex);
  headerRow.height = 30;
  const headers = [
    'STT',
    'Tiêu đề học liệu',
    'Loại học liệu',
    'Đường dẫn học liệu',
    'Mã QR của học liệu',
  ];

  headers.forEach((label, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = label;
    cell.font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  });

  // Dữ liệu từng học liệu
  materials.forEach((item, index) => {
    const rowNumber = headerRowIndex + 1 + index;
    const row = sheet.getRow(rowNumber);
    row.height = 82; // ~109 px để ảnh QR 90x90 px nằm gọn trong ô

    const sttCell = row.getCell(1);
    sttCell.value = index + 1;
    sttCell.font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FF0F172A' } };
    sttCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sttCell.border = thinBorder;

    const gradeLabel = formatGradeLabel(item.khoiLop);
    const titleDataCell = row.getCell(2);
    titleDataCell.value = {
      richText: [
        {
          text: `${item.tieuDe}\n`,
          font: { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FF0F172A' } },
        },
        {
          text: `Môn: ${item.monHoc} · ${gradeLabel}`,
          font: { name: 'Times New Roman', size: 12, italic: false, color: { argb: 'FF0F766E' } },
        },
      ],
    };
    titleDataCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    titleDataCell.border = thinBorder;

    const categoryCell = row.getCell(3);
    categoryCell.value = item.loai;
    categoryCell.font = { name: 'Times New Roman', size: 12, color: { argb: 'FF0F172A' } };
    categoryCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    categoryCell.border = thinBorder;

    const urlCell = row.getCell(4);
    urlCell.value = {
      text: item.url,
      hyperlink: item.url,
    };
    urlCell.font = {
      name: 'Times New Roman',
      size: 12,
      underline: true,
      color: { argb: 'FF0F766E' },
    };
    urlCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    urlCell.border = thinBorder;

    const qrCell = row.getCell(5);
    qrCell.value = '';
    qrCell.alignment = { horizontal: 'center', vertical: 'middle' };
    qrCell.border = thinBorder;

    const imageId = workbook.addImage({
      base64: qrAssets[index].base64,
      extension: 'png',
    });

    sheet.addImage(imageId, {
      tl: { col: 4.14, row: rowNumber - 1 + 0.08 },
      ext: { width: 90, height: 90 },
      editAs: 'oneCell',
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fileName = `Phieu-hoc-lieu-QR-${getDateFileStamp()}.xlsx`;
  triggerBlobDownload(blob, fileName);
  return fileName;
}

export async function exportMaterialsToWord(materials: LearningMaterial[]): Promise<string> {
  if (materials.length === 0) {
    throw new Error('Không có học liệu nào để xuất tệp Word.');
  }

  const qrAssets = await fetchAllQrAssets(materials);

  // A4 dọc: 210mm x 297mm, lề 12mm => vùng nội dung rộng 186mm (~10546 twips)
  const colWidths = [700, 3300, 1700, 3100, 1746];
  const cellBorders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: '334155' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: '334155' },
    left: { style: BorderStyle.SINGLE, size: 4, color: '334155' },
    right: { style: BorderStyle.SINGLE, size: 4, color: '334155' },
  };
  const cellMargins = {
    top: 100,
    bottom: 100,
    left: 110,
    right: 110,
  };

  const headerLabels = [
    'STT',
    'Tiêu đề học liệu',
    'Loại học liệu',
    'Đường dẫn học liệu',
    'Mã QR của học liệu',
  ];

  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headerLabels.map(
      (label, colIndex) =>
        new TableCell({
          width: { size: colWidths[colIndex], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          borders: cellBorders,
          margins: cellMargins,
          shading: {
            type: ShadingType.CLEAR,
            fill: 'E5E7EB',
            color: 'auto',
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: label,
                  bold: true,
                  font: 'Times New Roman',
                  size: 24, // 12pt
                  color: '0F172A',
                }),
              ],
            }),
          ],
        })
    ),
  });

  const dataRows = materials.map((item, idx) => {
    const gradeLabel = formatGradeLabel(item.khoiLop);

    return new TableRow({
      cantSplit: true,
      children: [
        // 1. STT
        new TableCell({
          width: { size: colWidths[0], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          borders: cellBorders,
          margins: cellMargins,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: String(idx + 1),
                  bold: true,
                  font: 'Times New Roman',
                  size: 24,
                  color: '0F172A',
                }),
              ],
            }),
          ],
        }),

        // 2. Tiêu đề học liệu + Môn · Khối
        new TableCell({
          width: { size: colWidths[1], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          borders: cellBorders,
          margins: cellMargins,
          children: [
            new Paragraph({
              spacing: { after: 60 },
              children: [
                new TextRun({
                  text: item.tieuDe,
                  bold: true,
                  font: 'Times New Roman',
                  size: 24,
                  color: '0F172A',
                }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Môn: ${item.monHoc} · ${gradeLabel}`,
                  font: 'Times New Roman',
                  size: 24,
                  color: '0F766E',
                }),
              ],
            }),
          ],
        }),

        // 3. Loại học liệu
        new TableCell({
          width: { size: colWidths[2], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          borders: cellBorders,
          margins: cellMargins,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: item.loai,
                  font: 'Times New Roman',
                  size: 24,
                  color: '0F172A',
                }),
              ],
            }),
          ],
        }),

        // 4. Đường dẫn học liệu (Hyperlink đầy đủ)
        new TableCell({
          width: { size: colWidths[3], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          borders: cellBorders,
          margins: cellMargins,
          children: [
            new Paragraph({
              children: [
                new ExternalHyperlink({
                  link: item.url,
                  children: [
                    new TextRun({
                      text: item.url,
                      font: 'Times New Roman',
                      size: 24,
                      color: '0F766E',
                      underline: { type: UnderlineType.SINGLE },
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),

        // 5. Mã QR (~2.5 cm = 95px)
        new TableCell({
          width: { size: colWidths[4], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          borders: cellBorders,
          margins: cellMargins,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: qrAssets[idx].bytes,
                  transformation: {
                    width: 95,
                    height: 95,
                  },
                  type: 'png',
                }),
              ],
            }),
          ],
        }),
      ],
    });
  });

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
              top: convertMillimetersToTwip(12),
              bottom: convertMillimetersToTwip(12),
              left: convertMillimetersToTwip(12),
              right: convertMillimetersToTwip(12),
            },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: 'PHIẾU DANH MỤC HỌC LIỆU SỐ KÈM MÃ QR',
                bold: true,
                font: 'Times New Roman',
                size: 30, // 15pt
                color: '0F172A',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: 'Trường Tiểu học Quang Hưng - Phân hiệu Trực Khang',
                bold: true,
                font: 'Times New Roman',
                size: 24, // 12pt
                color: '1E293B',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: 'Dùng camera điện thoại hoặc Zalo quét mã QR để mở trực tiếp tài liệu giảng dạy.',
                italics: true,
                font: 'Times New Roman',
                size: 24, // 12pt
                color: '475569',
              }),
            ],
          }),
          new Table({
            width: { size: 10546, type: WidthType.DXA },
            columnWidths: colWidths,
            rows: [headerRow, ...dataRows],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `Phieu-hoc-lieu-QR-${getDateFileStamp()}.docx`;
  triggerBlobDownload(blob, fileName);
  return fileName;
}
