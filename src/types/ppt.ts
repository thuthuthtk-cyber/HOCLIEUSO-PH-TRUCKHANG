export type PptStyleId = 'hoat_hinh_3d' | 'mau_nuoc' | 'flat_design' | 'truyen_tranh';

export type PptGradeLevel = '1' | '2' | '3' | '4' | '5';

export interface PptStyleTheme {
  bgHex: string;
  headerBgHex: string;
  accentHex: string;
  accentSoftHex: string;
  cardBgHex: string;
  cardBorderHex: string;
  titleColorHex: string;
  textColorHex: string;
  mutedColorHex: string;
  previewBgClass: string;
  previewHeaderClass: string;
  previewCardClass: string;
  previewAccentClass: string;
  previewBadgeClass: string;
}

export interface PptStylePreset {
  id: PptStyleId;
  name: string;
  shortDesc: string;
  stylePrompt: string;
  theme: PptStyleTheme;
}

export interface PptMascotPreset {
  id: string;
  name: string;
  shortDesc: string;
  promptDesc: string;
  emoji: string;
}

export type SlideVisualMotif =
  | 'book'
  | 'sparkles'
  | 'lightbulb'
  | 'compass'
  | 'puzzle'
  | 'award'
  | 'users'
  | 'leaf';

export type SlideImageStatus =
  | 'idle'
  | 'queued'
  | 'generating'
  | 'retrying'
  | 'ready'
  | 'error'
  | 'removed';

export interface PptSlideItem {
  id: string;
  slideNumber: number;
  title: string;
  bullets: string[];
  keyTakeaway: string;
  speakerNotes: string;
  imageScenePrompt: string;
  visualMotif: SlideVisualMotif;
  styleId: PptStyleId;
  imageStatus: SlideImageStatus;
  imageDataUrl: string | null;
  imageError?: string;
  retryCount?: number;
  isCustomUpload?: boolean;
}

export interface PptGenerationConfig {
  monHoc: string;
  khoiLop: PptGradeLevel;
  tenBaiHoc: string;
  soSlide: number;
  yeuCauBoSung: string;
  styleId: PptStyleId;
  sharedStylePrompt: string;
  mascotIds: string[];
}

export interface PptOutlineResponse {
  deckTitle: string;
  subtitle: string;
  slides: Array<{
    slideNumber: number;
    title: string;
    bullets: string[];
    keyTakeaway: string;
    speakerNotes: string;
    imageScenePrompt: string;
    visualMotif: SlideVisualMotif;
  }>;
}

export interface SavedPptSlideData {
  slideNumber: number;
  title: string;
  bullets: string[];
  keyTakeaway: string;
  speakerNotes: string;
  imageScenePrompt: string;
  visualMotif: SlideVisualMotif;
  styleId: PptStyleId;
}

export interface SavedPptConfig {
  subtitle: string;
  styleId: PptStyleId;
  mascotIds: string[];
}

export const PPT_GRADE_LEVELS: { value: PptGradeLevel; label: string }[] = [
  { value: '1', label: 'Lớp 1' },
  { value: '2', label: 'Lớp 2' },
  { value: '3', label: 'Lớp 3' },
  { value: '4', label: 'Lớp 4' },
  { value: '5', label: 'Lớp 5' },
];

export const PPT_SLIDE_COUNTS = [5, 6, 8, 10] as const;

export const PPT_STYLE_LIBRARY: PptStylePreset[] = [
  {
    id: 'hoat_hinh_3d',
    name: 'Hoạt hình 3D dễ thương',
    shortDesc: 'Khối 3D mềm mại, ánh sáng ấm áp, sinh động như phim hoạt hình thiếu nhi',
    stylePrompt:
      'Cute 3D animated Pixar-inspired children book illustration, soft volumetric studio lighting, smooth rounded forms, warm joyful pastel and vibrant colors, high visual polish',
    theme: {
      bgHex: 'FFFBF5',
      headerBgHex: '0F766E',
      accentHex: 'F97316',
      accentSoftHex: 'FFEDD5',
      cardBgHex: 'FFFFFF',
      cardBorderHex: 'FED7AA',
      titleColorHex: '134E4A',
      textColorHex: '1E293B',
      mutedColorHex: '64748B',
      previewBgClass: 'bg-[#FFFBF5]',
      previewHeaderClass: 'bg-teal-700 text-white',
      previewCardClass: 'bg-white border-orange-200',
      previewAccentClass: 'bg-orange-500 text-white',
      previewBadgeClass: 'bg-orange-100 text-orange-800 border-orange-200',
    },
  },
  {
    id: 'mau_nuoc',
    name: 'Màu nước',
    shortDesc: 'Nét cọ màu nước nhẹ nhàng, trong trẻo, giàu chất thơ và gần gũi',
    stylePrompt:
      'Soft hand-painted watercolor storybook illustration on textured cream paper, luminous translucent washes, delicate gentle brushwork, warm soothing child-friendly tones',
    theme: {
      bgHex: 'F8FBF8',
      headerBgHex: '047857',
      accentHex: '0EA5E9',
      accentSoftHex: 'E0F2FE',
      cardBgHex: 'FFFFFF',
      cardBorderHex: 'A7F3D0',
      titleColorHex: '064E3B',
      textColorHex: '1E293B',
      mutedColorHex: '475569',
      previewBgClass: 'bg-[#F8FBF8]',
      previewHeaderClass: 'bg-emerald-700 text-white',
      previewCardClass: 'bg-white border-emerald-200',
      previewAccentClass: 'bg-sky-500 text-white',
      previewBadgeClass: 'bg-sky-100 text-sky-800 border-sky-200',
    },
  },
  {
    id: 'flat_design',
    name: 'Flat Design',
    shortDesc: 'Hình khối phẳng hiện đại, màu sắc rõ ràng, tối giản dễ quan sát trên máy chiếu',
    stylePrompt:
      'Clean modern vector flat design children educational illustration, crisp geometric silhouettes, balanced bright color blocks, minimal soft shading, neat uncluttered composition',
    theme: {
      bgHex: 'F8FAFC',
      headerBgHex: '1D4ED8',
      accentHex: 'F59E0B',
      accentSoftHex: 'FEF3C7',
      cardBgHex: 'FFFFFF',
      cardBorderHex: 'BFDBFE',
      titleColorHex: '1E3A8A',
      textColorHex: '0F172A',
      mutedColorHex: '475569',
      previewBgClass: 'bg-slate-50',
      previewHeaderClass: 'bg-blue-700 text-white',
      previewCardClass: 'bg-white border-blue-200',
      previewAccentClass: 'bg-amber-500 text-white',
      previewBadgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    },
  },
  {
    id: 'truyen_tranh',
    name: 'Truyện tranh',
    shortDesc: 'Nét vẽ truyện tranh tươi vui, biểu cảm sinh động, tạo hứng thú cho học sinh',
    stylePrompt:
      'Cheerful modern children comic book illustration, clean expressive dark ink outlines, vibrant cel-shaded colors, lively friendly poses, sunny classroom storybook mood',
    theme: {
      bgHex: 'FFFDF4',
      headerBgHex: 'C2410C',
      accentHex: '2563EB',
      accentSoftHex: 'DBEAFE',
      cardBgHex: 'FFFFFF',
      cardBorderHex: 'FDE68A',
      titleColorHex: '7C2D12',
      textColorHex: '1E293B',
      mutedColorHex: '475569',
      previewBgClass: 'bg-[#FFFDF4]',
      previewHeaderClass: 'bg-orange-700 text-white',
      previewCardClass: 'bg-white border-amber-200',
      previewAccentClass: 'bg-blue-600 text-white',
      previewBadgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    },
  },
];

export const PPT_MASCOT_LIBRARY: PptMascotPreset[] = [
  {
    id: 'be_na',
    name: 'Bé Na (Học sinh nữ)',
    shortDesc: 'Cô bé tiểu học Việt Nam buộc tóc hai bên, áo trắng khăn quàng đỏ',
    promptDesc:
      'a cheerful Vietnamese primary school girl mascot named Be Na with neat twin-ponytail black hair, bright smiling eyes, wearing a crisp white school shirt, navy skirt, and a red pioneer scarf',
    emoji: '👧',
  },
  {
    id: 'be_bo',
    name: 'Bé Bo (Học sinh nam)',
    shortDesc: 'Cậu bé tiểu học Việt Nam đeo kính tròn, năng động, khăn quàng đỏ',
    promptDesc:
      'a friendly Vietnamese primary school boy mascot named Be Bo with neat short black hair, cute round glasses, wearing a clean white school shirt, navy shorts, and a red pioneer scarf',
    emoji: '👦',
  },
  {
    id: 'cu_meo',
    name: 'Cú Mèo Thông Thái',
    shortDesc: 'Chú cú nhỏ đeo kính tròn màu vàng ấm, thân thiện dẫn dắt bài học',
    promptDesc:
      'a cute little golden-brown wise owl mascot wearing tiny round glasses and a small teal ribbon bow tie, cheerful big eyes, friendly teacher helper pose',
    emoji: '🦉',
  },
  {
    id: 'tho_trang',
    name: 'Thỏ Bông Đáng Yêu',
    shortDesc: 'Chú thỏ trắng tai dài đeo ba lô vàng nhỏ xinh, thích khám phá',
    promptDesc:
      'an adorable fluffy white bunny mascot with soft pink inner ears wearing a cheerful little yellow school backpack and smiling warmly',
    emoji: '🐰',
  },
  {
    id: 'soc_nau',
    name: 'Sóc Nâu Năng Động',
    shortDesc: 'Chú sóc nâu đuôi xù mặc áo gile xanh dương, nhanh nhẹn ham học',
    promptDesc:
      'a lively little brown squirrel mascot with a fluffy tail wearing a cute sky-blue vest and smiling cheerfully',
    emoji: '🐿️',
  },
];

export function getPptStyleById(styleId: PptStyleId): PptStylePreset {
  return PPT_STYLE_LIBRARY.find((s) => s.id === styleId) ?? PPT_STYLE_LIBRARY[0];
}
