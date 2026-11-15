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
import type { GeneratedLessonPlan } from '../types/lessonPlan';
import { triggerBlobDownload } from './qrExport';

const FONT_NAME = 'Times New Roman';
const COLOR_DARK = '0F172A';
const COLOR_MUTED = '334155';
const HEADER_SHADING = 'E2E8F0';
const SECTION_SHADING = 'F1F5F9';
const INTEGRATION_SHADING = 'F8FAFC';

// Khổ A4 dọc: 210mm; Lề trái 20mm + Lề phải 15mm => Vùng nội dung rộng 175mm (~9922 twips)
const CONTENT_WIDTH_DXA = 9922;
const COL_GV_DXA = 4961;
const COL_HS_DXA = 4961;

const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '334155' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '334155' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '334155' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '334155' },
};

const CELL_MARGINS = {
  top: 85,
  bottom: 85,
  left: 110,
  right: 110,
};

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
    size: options?.size ?? 26, // 13pt chuẩn văn bản giáo án Tiểu học
    color: options?.color ?? COLOR_DARK,
  });
}

function makeParagraph(
  children: TextRun[],
  options?: {
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    spacingBefore?: number;
    spacingAfter?: number;
    indentLeft?: number;
  }
): Paragraph {
  return new Paragraph({
    alignment: options?.alignment ?? AlignmentType.LEFT,
    spacing: {
      before: options?.spacingBefore ?? 0,
      after: options?.spacingAfter ?? 65,
      line: 276,
    },
    indent: options?.indentLeft ? { left: options.indentLeft } : undefined,
    children,
  });
}

function makeTableCell(
  paragraphs: Paragraph[],
  widthDxa: number,
  options?: {
    colSpan?: number;
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
    borders: TABLE_BORDERS,
    margins: CELL_MARGINS,
    verticalAlign: options?.verticalAlign ?? VerticalAlign.TOP,
    shading: options?.shading
      ? { type: ShadingType.CLEAR, fill: options.shading, color: 'auto' }
      : undefined,
    children: paragraphs,
  });
}

function normalizeLinePrefix(line: string, defaultPrefix = '- '): string {
  const trimmed = line.trim();
  if (!trimmed) return '';
  if (/^[-+*•]/.test(trimmed)) return trimmed;
  return `${defaultPrefix}${trimmed}`;
}

function buildActionParagraphs(lines: string[]): Paragraph[] {
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  if (clean.length === 0) {
    return [makeParagraph([makeRun('- Thực hiện theo hướng dẫn.')], { spacingAfter: 30 })];
  }
  return clean.map((line, idx) =>
    makeParagraph([makeRun(normalizeLinePrefix(line, '- '), { size: 24 })], {
      spacingAfter: idx === clean.length - 1 ? 0 : 45,
    })
  );
}

function buildWeeklyApprovalBlock(plan: GeneratedLessonPlan): (Paragraph | Table)[] {
  const { header } = plan;
  if (!header.hienThiKhungKyDuyet) return [];

  const colW = Math.floor(CONTENT_WIDTH_DXA / 3);
  const colWLast = CONTENT_WIDTH_DXA - colW * 2;

  const metaLines: Paragraph[] = [
    makeParagraph(
      [
        makeRun('Ngày soạn: ', { bold: true, size: 24 }),
        makeRun(header.ngaySoan || '....../....../202...', { size: 24 }),
        makeRun('          ', { size: 24 }),
        makeRun(`TUẦN ${header.tuanSo || '.....'}`, { bold: true, size: 25 }),
      ],
      { spacingAfter: 40 }
    ),
    makeParagraph(
      [
        makeRun('Thời gian thực hiện: ', { bold: true, size: 24 }),
        makeRun(
          header.thoiGianThucHien || 'Từ ngày ....../...... đến ngày ....../....../202...',
          { size: 24 }
        ),
      ],
      { spacingAfter: 90 }
    ),
  ];

  const signTable = new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [colW, colW, colWLast],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          makeTableCell(
            [
              makeParagraph([makeRun('Kí duyệt', { bold: true, size: 24 })], {
                alignment: AlignmentType.CENTER,
                spacingAfter: 0,
              }),
            ],
            colW,
            { shading: SECTION_SHADING, verticalAlign: VerticalAlign.CENTER }
          ),
          makeTableCell(
            [
              makeParagraph([makeRun('Tổ trưởng', { bold: true, size: 24 })], {
                alignment: AlignmentType.CENTER,
                spacingAfter: 0,
              }),
            ],
            colW,
            { shading: SECTION_SHADING, verticalAlign: VerticalAlign.CENTER }
          ),
          makeTableCell(
            [
              makeParagraph([makeRun('Giáo viên', { bold: true, size: 24 })], {
                alignment: AlignmentType.CENTER,
                spacingAfter: 0,
              }),
            ],
            colWLast,
            { shading: SECTION_SHADING, verticalAlign: VerticalAlign.CENTER }
          ),
        ],
      }),
      new TableRow({
        cantSplit: true,
        children: [
          makeTableCell(
            [
              makeParagraph([makeRun('', { size: 24 })], { spacingAfter: 360 }),
              makeParagraph([makeRun('', { size: 24 })], { spacingAfter: 0 }),
            ],
            colW
          ),
          makeTableCell(
            [
              makeParagraph([makeRun('', { size: 24 })], { spacingAfter: 360 }),
              makeParagraph([makeRun('', { size: 24 })], { spacingAfter: 0 }),
            ],
            colW
          ),
          makeTableCell(
            [
              makeParagraph([makeRun('', { size: 24 })], { spacingAfter: 280 }),
              makeParagraph(
                [makeRun(header.tenGiaoVien || '', { bold: true, size: 24 })],
                { alignment: AlignmentType.CENTER, spacingAfter: 0 }
              ),
            ],
            colWLast,
            { verticalAlign: VerticalAlign.BOTTOM }
          ),
        ],
      }),
    ],
  });

  return [
    ...metaLines,
    signTable,
    makeParagraph([makeRun('', { size: 20 })], { spacingAfter: 80 }),
  ];
}

function buildLessonHeaderBlock(plan: GeneratedLessonPlan): Paragraph[] {
  const { header } = plan;
  const isGvChuNhiem = header.loaiGiaoVien === 'GV_CHU_NHIEM';

  if (isGvChuNhiem) {
    return [
      makeParagraph(
        [
          makeRun(
            header.ngayDayLop?.trim()
              ? header.ngayDayLop.trim()
              : 'Thứ ...... ngày ...... tháng ...... năm 202...',
            { italics: true, size: 26 }
          ),
        ],
        { spacingAfter: 50 }
      ),
      makeParagraph(
        [
          makeRun('Tiết: ', { bold: true, size: 26 }),
          makeRun(`${header.tietSo?.trim() || '......'}          `, { size: 26 }),
          makeRun('Môn: ', { bold: true, size: 26 }),
          makeRun(header.monHoc, { bold: true, size: 26 }),
        ],
        { spacingAfter: 50 }
      ),
      makeParagraph(
        [
          makeRun('Bài: ', { bold: true, size: 26 }),
          makeRun(header.tenBaiHoc, { bold: true, size: 27 }),
        ],
        { spacingAfter: 130 }
      ),
    ];
  }

  // Kiểu 1: GV_CHUYEN (Giáo viên dạy nhiều khối lớp / Môn chuyên)
  const titleWithTiet =
    header.tietSo?.trim() && !header.tenBaiHoc.toUpperCase().includes('TIẾT')
      ? `${header.tenBaiHoc.toUpperCase()} (${header.tietSo.trim().toUpperCase()})`
      : header.tenBaiHoc.toUpperCase();

  return [
    makeParagraph(
      [
        makeRun('Môn học: ', { bold: true, size: 26 }),
        makeRun(header.monHoc, { bold: true, size: 26 }),
      ],
      { spacingAfter: 50 }
    ),
    makeParagraph([makeRun(titleWithTiet, { bold: true, size: 28 })], {
      alignment: AlignmentType.CENTER,
      spacingBefore: 40,
      spacingAfter: 70,
    }),
    makeParagraph(
      [
        makeRun('Ngày dạy/lớp: ', { bold: true, size: 25 }),
        makeRun(header.ngayDayLop, { italics: true, size: 25 }),
      ],
      { spacingAfter: 140 }
    ),
  ];
}

function buildSectionBannerRow(title: string, subtitle?: string): TableRow {
  const paragraphs: Paragraph[] = [
    makeParagraph([makeRun(title, { bold: true, size: 24 })], {
      spacingAfter: subtitle ? 30 : 0,
    }),
  ];
  if (subtitle) {
    paragraphs.push(
      makeParagraph([makeRun(subtitle, { italics: true, size: 23, color: COLOR_MUTED })], {
        spacingAfter: 0,
      })
    );
  }
  return new TableRow({
    cantSplit: true,
    children: [
      makeTableCell(paragraphs, CONTENT_WIDTH_DXA, {
        colSpan: 2,
        shading: SECTION_SHADING,
      }),
    ],
  });
}

function buildIntegrationHighlightRow(content?: string): TableRow | null {
  const clean = (content || '').trim();
  if (!clean || /^không\.?$/i.test(clean)) return null;

  const titleLine = /^Nội dung lồng ghép/i.test(clean)
    ? clean
    : `Nội dung lồng ghép, tích hợp: ${clean}`;

  return new TableRow({
    cantSplit: true,
    children: [
      makeTableCell(
        [
          makeParagraph(
            [
              makeRun(titleLine, {
                bold: true,
                italics: false,
                size: 23,
                color: COLOR_DARK,
              }),
            ],
            { spacingAfter: 0 }
          ),
        ],
        CONTENT_WIDTH_DXA,
        { colSpan: 2, shading: INTEGRATION_SHADING }
      ),
    ],
  });
}

function buildTwoColumnActivityRow(
  hoatDongGV: string[],
  hoatDongHS: string[]
): TableRow {
  return new TableRow({
    children: [
      makeTableCell(buildActionParagraphs(hoatDongGV), COL_GV_DXA),
      makeTableCell(buildActionParagraphs(hoatDongHS), COL_HS_DXA),
    ],
  });
}

function buildActivitiesTable(plan: GeneratedLessonPlan): Table {
  const { khoiDong, khamPha, luyenTap, vanDung, luuYHSKT } = plan.hoatDongDayHoc;

  const khamPhaTotal = khamPha.reduce((sum, s) => sum + (s.thoiGianPhut || 7), 0);
  const luyenTapTotal = luyenTap.reduce((sum, s) => sum + (s.thoiGianPhut || 5), 0);

  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        makeTableCell(
          [
            makeParagraph([makeRun('Hoạt động của giáo viên', { bold: true, size: 24 })], {
              alignment: AlignmentType.CENTER,
              spacingAfter: 0,
            }),
          ],
          COL_GV_DXA,
          { shading: HEADER_SHADING, verticalAlign: VerticalAlign.CENTER }
        ),
        makeTableCell(
          [
            makeParagraph([makeRun('Hoạt động của học sinh', { bold: true, size: 24 })], {
              alignment: AlignmentType.CENTER,
              spacingAfter: 0,
            }),
          ],
          COL_HS_DXA,
          { shading: HEADER_SHADING, verticalAlign: VerticalAlign.CENTER }
        ),
      ],
    }),
    // 1. Khởi động
    buildSectionBannerRow(
      `1. Khởi động (${khoiDong.thoiGianPhut} phút)`,
      khoiDong.hinhThucToChuc
    ),
  ];

  const kdIntRow = buildIntegrationHighlightRow(khoiDong.noiDungTichHopLongGhep);
  if (kdIntRow) rows.push(kdIntRow);
  rows.push(buildTwoColumnActivityRow(khoiDong.hoatDongGV, khoiDong.hoatDongHS));

  // 2. Khám phá
  rows.push(
    new TableRow({
      cantSplit: true,
      children: [
        makeTableCell(
          [
            makeParagraph(
              [makeRun(`2. Khám phá (${khamPhaTotal} phút)`, { bold: true, size: 25 })],
              { spacingAfter: 0 }
            ),
          ],
          CONTENT_WIDTH_DXA,
          { colSpan: 2, shading: HEADER_SHADING }
        ),
      ],
    })
  );

  khamPha.forEach((step, idx) => {
    const durationLabel = step.thoiGianPhut ? ` (${step.thoiGianPhut} phút)` : '';
    rows.push(
      buildSectionBannerRow(
        `Hoạt động ${idx + 1}: ${step.tenHoatDong}${durationLabel}`,
        step.hinhThucVaDanhGia
      )
    );
    const intRow = buildIntegrationHighlightRow(step.noiDungTichHopLongGhep);
    if (intRow) rows.push(intRow);
    rows.push(buildTwoColumnActivityRow(step.hoatDongGV, step.hoatDongHS));
  });

  // 3. Luyện tập
  rows.push(
    new TableRow({
      cantSplit: true,
      children: [
        makeTableCell(
          [
            makeParagraph(
              [makeRun(`3. Luyện tập (${luyenTapTotal} phút)`, { bold: true, size: 25 })],
              { spacingAfter: 0 }
            ),
          ],
          CONTENT_WIDTH_DXA,
          { colSpan: 2, shading: HEADER_SHADING }
        ),
      ],
    })
  );

  luyenTap.forEach((step, idx) => {
    const durationLabel = step.thoiGianPhut ? ` (${step.thoiGianPhut} phút)` : '';
    rows.push(
      buildSectionBannerRow(
        `Hoạt động ${idx + 1}: ${step.tenHoatDong}${durationLabel}`,
        step.hinhThucVaDanhGia
      )
    );
    const intRow = buildIntegrationHighlightRow(step.noiDungTichHopLongGhep);
    if (intRow) rows.push(intRow);
    rows.push(buildTwoColumnActivityRow(step.hoatDongGV, step.hoatDongHS));
  });

  // 4. Vận dụng
  rows.push(
    buildSectionBannerRow(
      `4. Vận dụng (${vanDung.thoiGianPhut} phút)`,
      vanDung.hinhThucVaDanhGia
    )
  );
  const vdIntRow = buildIntegrationHighlightRow(vanDung.noiDungTichHopLongGhep);
  if (vdIntRow) rows.push(vdIntRow);
  rows.push(buildTwoColumnActivityRow(vanDung.hoatDongGV, vanDung.hoatDongHS));

  // Lưu ý HS khuyết tật học hòa nhập cuối mục III
  const hsktLines = (luuYHSKT || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  rows.push(
    new TableRow({
      cantSplit: true,
      children: [
        makeTableCell(
          [
            makeParagraph(
              [
                makeRun(
                  'Lưu ý: Nếu lớp có HS khuyết tật học hoà nhập (điều chỉnh hoạt động phù hợp):',
                  { bold: true, italics: true, size: 24 }
                ),
              ],
              { spacingAfter: hsktLines.length > 0 ? 45 : 0 }
            ),
            ...(hsktLines.length > 0
              ? hsktLines.map((line, idx) =>
                  makeParagraph([makeRun(line, { size: 23 })], {
                    indentLeft: 160,
                    spacingAfter: idx === hsktLines.length - 1 ? 0 : 35,
                  })
                )
              : [
                  makeParagraph([makeRun('- Không.', { size: 23 })], {
                    indentLeft: 160,
                    spacingAfter: 0,
                  }),
                ]),
          ],
          CONTENT_WIDTH_DXA,
          { colSpan: 2, shading: SECTION_SHADING }
        ),
      ],
    })
  );

  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [COL_GV_DXA, COL_HS_DXA],
    rows,
  });
}

function getDateFileStamp(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function slugifyFilePart(input: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'ke-hoach-bai-day'
  );
}

export async function exportLessonPlanToWord(
  plan: GeneratedLessonPlan
): Promise<string> {
  if (!plan?.header?.tenBaiHoc) {
    throw new Error('Dữ liệu kế hoạch bài dạy chưa đầy đủ để xuất file Word.');
  }

  const nangLucDacThu =
    plan.yeuCauCanDat.nangLucDacThu && plan.yeuCauCanDat.nangLucDacThu.length > 0
      ? plan.yeuCauCanDat.nangLucDacThu
      : plan.yeuCauCanDat.nangLuc;
  const nangLucChung = plan.yeuCauCanDat.nangLucChung || [];

  const children: (Paragraph | Table)[] = [
    ...buildWeeklyApprovalBlock(plan),
    ...buildLessonHeaderBlock(plan),

    // I. YÊU CẦU CẦN ĐẠT
    makeParagraph([makeRun('I. YÊU CẦU CẦN ĐẠT:', { bold: true, size: 26 })], {
      spacingBefore: 40,
      spacingAfter: 65,
    }),
    makeParagraph([makeRun('1. Kiến thức, kĩ năng:', { bold: true, size: 25 })], {
      spacingAfter: 45,
    }),
    ...plan.yeuCauCanDat.kienThucKiNang.map((item) =>
      makeParagraph([makeRun(normalizeLinePrefix(item, '- '), { size: 25 })], {
        indentLeft: 260,
        spacingAfter: 40,
      })
    ),

    makeParagraph([makeRun('2. Năng lực, phẩm chất:', { bold: true, size: 25 })], {
      spacingBefore: 40,
      spacingAfter: 45,
    }),
    makeParagraph(
      [
        makeRun('a) Góp phần hình thành và phát triển các năng lực:', {
          bold: true,
          italics: true,
          size: 25,
        }),
      ],
      { indentLeft: 180, spacingAfter: 40 }
    ),
    ...nangLucDacThu.map((item) =>
      makeParagraph([makeRun(normalizeLinePrefix(item, '- '), { size: 25 })], {
        indentLeft: 320,
        spacingAfter: 40,
      })
    ),
    ...nangLucChung.map((item) =>
      makeParagraph([makeRun(normalizeLinePrefix(item, '- '), { size: 25 })], {
        indentLeft: 320,
        spacingAfter: 40,
      })
    ),
    makeParagraph(
      [
        makeRun('b) Góp phần hình thành và phát triển các phẩm chất chủ yếu:', {
          bold: true,
          italics: true,
          size: 25,
        }),
      ],
      { indentLeft: 180, spacingBefore: 30, spacingAfter: 40 }
    ),
    ...plan.yeuCauCanDat.phamChat.map((item) =>
      makeParagraph([makeRun(normalizeLinePrefix(item, '- '), { size: 25 })], {
        indentLeft: 320,
        spacingAfter: 40,
      })
    ),

    makeParagraph(
      [makeRun('3. Giáo dục tích hợp/lồng ghép (nếu có):', { bold: true, size: 25 })],
      { spacingBefore: 40, spacingAfter: 45 }
    ),
    ...(plan.yeuCauCanDat.giaoDucTichHop.length > 0
      ? plan.yeuCauCanDat.giaoDucTichHop.map((item) =>
          makeParagraph([makeRun(normalizeLinePrefix(item, '- '), { size: 25 })], {
            indentLeft: 260,
            spacingAfter: 40,
          })
        )
      : [
          makeParagraph([makeRun('- Không có nội dung tích hợp.', { italics: true, size: 25 })], {
            indentLeft: 260,
            spacingAfter: 40,
          }),
        ]),

    // II. ĐỒ DÙNG DẠY HỌC
    makeParagraph([makeRun('II. ĐỒ DÙNG DẠY HỌC:', { bold: true, size: 26 })], {
      spacingBefore: 90,
      spacingAfter: 55,
    }),
    makeParagraph(
      [
        makeRun('1. Giáo viên: ', { bold: true, size: 25 }),
        makeRun(plan.doDungDayHoc.giaoVien.join('; '), { size: 25 }),
      ],
      { indentLeft: 200, spacingAfter: 45 }
    ),
    makeParagraph(
      [
        makeRun('2. Học sinh: ', { bold: true, size: 25 }),
        makeRun(plan.doDungDayHoc.hocSinh.join('; '), { size: 25 }),
      ],
      { indentLeft: 200, spacingAfter: 110 }
    ),

    // III. HOẠT ĐỘNG DẠY HỌC
    makeParagraph([makeRun('III. HOẠT ĐỘNG DẠY HỌC:', { bold: true, size: 26 })], {
      spacingBefore: 40,
      spacingAfter: 80,
    }),
    buildActivitiesTable(plan),

    // IV. ĐIỀU CHỈNH SAU BÀI DẠY
    makeParagraph([makeRun('IV. ĐIỀU CHỈNH SAU BÀI DẠY:', { bold: true, size: 26 })], {
      spacingBefore: 140,
      spacingAfter: 55,
    }),
    makeParagraph([makeRun(plan.dieuChinhSauBaiDay, { size: 25 })], {
      indentLeft: 200,
      spacingAfter: 55,
    }),
    makeParagraph(
      [
        makeRun(
          '........................................................................................................................................................................',
          { size: 24, color: COLOR_MUTED }
        ),
      ],
      { indentLeft: 200, spacingAfter: 0 }
    ),
  ];

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
              top: convertMillimetersToTwip(20),
              bottom: convertMillimetersToTwip(20),
              left: convertMillimetersToTwip(20),
              right: convertMillimetersToTwip(15),
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `KHBD-${slugifyFilePart(plan.header.monHoc)}-${slugifyFilePart(
    plan.header.tenBaiHoc
  )}-${getDateFileStamp()}.docx`;
  triggerBlobDownload(blob, fileName);
  return fileName;
}
