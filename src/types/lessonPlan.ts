export type IntegrationCategoryId =
  | 'GDDP'
  | 'STEM'
  | 'ATGT'
  | 'QPAN'
  | 'QCN'
  | 'CDS_NLS_AI'
  | 'CTDDLS'
  | 'BVNN'
  | 'KNS'
  | 'LIEM_CHINH';

export type IntegrationMucDo = 'Bộ phận' | 'Liên hệ' | 'Toàn phần';

export type TeacherLessonPlanType = 'GV_CHUYEN' | 'GV_CHU_NHIEM';

export interface IntegrationCategoryMeta {
  id: IntegrationCategoryId;
  stt: number;
  tenNhom: string;
  canCuPhapLy: string;
  moTa: string;
  goiYMucDoMacDinh: IntegrationMucDo;
  goiYChuDe: string;
}

export const INTEGRATION_CATEGORIES: IntegrationCategoryMeta[] = [
  {
    id: 'GDDP',
    stt: 1,
    tenNhom: 'Nội dung Giáo dục địa phương',
    canCuPhapLy: 'QĐ 302/QĐ-UBND & CV 1394/SGDĐT-GDTH',
    moTa:
      'Tích hợp/liên hệ thực tế lịch sử, văn hóa, truyền thống, danh lam thắng cảnh, làng nghề, con người và môi trường quê hương tại địa phương (Trường TH Quang Hưng, Phân hiệu Trực Khang, Trực Ninh / Tài liệu GDĐP cấp Tiểu học).',
    goiYMucDoMacDinh: 'Liên hệ',
    goiYChuDe:
      'Chủ đề Giáo dục địa phương: Quê hương Quang Hưng - Trực Khang, di tích lịch sử, văn hóa, làng nghề truyền thống và bảo vệ môi trường nông thôn mới.',
  },
  {
    id: 'STEM',
    stt: 2,
    tenNhom: 'Giáo dục STEM / STEAM',
    canCuPhapLy: 'Thông tư 86/2026/TT-BGDĐT & CV 7206/BGDĐT-GDPT',
    moTa:
      'Vận dụng kiến thức liên môn Toán, Tự nhiên và Xã hội/Khoa học, Công nghệ, Tin học, Mĩ thuật để thực hành, chế tạo sản phẩm hoặc giải quyết vấn đề thực tiễn.',
    goiYMucDoMacDinh: 'Bộ phận',
    goiYChuDe:
      'Bài học STEM / STEAM: Thiết kế, chế tạo sản phẩm học tập đơn giản gắn với kiến thức bài học.',
  },
  {
    id: 'ATGT',
    stt: 3,
    tenNhom: 'Giáo dục An toàn giao thông',
    canCuPhapLy: 'Chỉ thị 31/CT-TTg & CV 1362/BGDĐT-GDTH',
    moTa:
      'Hình thành thói quen chấp hành luật giao thông đường bộ, đội mũ bảo hiểm đạt chuẩn, đi bộ và qua đường an toàn trên đường nông thôn/cổng trường.',
    goiYMucDoMacDinh: 'Liên hệ',
    goiYChuDe:
      'An toàn giao thông cổng trường: Đi đúng phần đường, đội mũ bảo hiểm đúng quy cách khi ngồi trên xe máy, xe đạp điện.',
  },
  {
    id: 'QPAN',
    stt: 4,
    tenNhom: 'Giáo dục Quốc phòng và An ninh',
    canCuPhapLy: 'Thông tư 08/2024/TT-BGDĐT',
    moTa:
      'Bồi dưỡng lòng yêu quê hương đất nước, truyền thống anh hùng dân tộc, biển đảo thiêng liêng và ý thức bảo vệ Tổ quốc phù hợp lứa tuổi tiểu học.',
    goiYMucDoMacDinh: 'Liên hệ',
    goiYChuDe:
      'Giáo dục lòng yêu nước, biết ơn anh hùng liệt sĩ, chú bộ đội và bảo vệ chủ quyền biển đảo Việt Nam.',
  },
  {
    id: 'QCN',
    stt: 5,
    tenNhom: 'Giáo dục Quyền con người',
    canCuPhapLy: 'QĐ 4746/QĐ-BGDĐT',
    moTa:
      'Giáo dục quyền và bổn phận của trẻ em: được học tập, bảo vệ, tôn trọng sự khác biệt, bình đẳng và tham gia ý kiến trong gia đình, nhà trường.',
    goiYMucDoMacDinh: 'Bộ phận',
    goiYChuDe:
      'Quyền được học tập, vui chơi, được lắng nghe và bổn phận kính trọng thầy cô, yêu thương bạn bè.',
  },
  {
    id: 'CDS_NLS_AI',
    stt: 6,
    tenNhom: 'Kỹ năng Công dân số, Năng lực số, Trí tuệ nhân tạo AI & An toàn mạng',
    canCuPhapLy: 'TT 02/2025, CV 3632/SGDĐT-GDTH & CV 4152/SGDĐT-GDTrH',
    moTa:
      'Rèn luyện thao tác thiết bị số an toàn, tìm kiếm và kiểm chứng thông tin, bảo mật thông tin cá nhân, ứng xử văn minh trên mạng và làm quen công cụ AI đúng cách.',
    goiYMucDoMacDinh: 'Bộ phận',
    goiYChuDe:
      'Công dân số văn minh: Sử dụng thiết bị số, tài nguyên học liệu số an toàn, bảo vệ dữ liệu cá nhân và sử dụng AI hỗ trợ học tập có kiểm soát.',
  },
  {
    id: 'CTDDLS',
    stt: 7,
    tenNhom: 'Giáo dục chính trị tư tưởng, đạo đức, lối sống, văn hóa học đường',
    canCuPhapLy: 'QĐ 4246/QĐ-BGDĐT',
    moTa:
      'Xây dựng trường học hạnh phúc, nếp sống văn minh, tinh thần đoàn kết, nhân ái, trung thực, nói lời hay làm việc tốt theo 5 điều Bác Hồ dạy.',
    goiYMucDoMacDinh: 'Liên hệ',
    goiYChuDe:
      'Thực hiện 5 điều Bác Hồ dạy, xây dựng tình bạn đẹp, văn hóa giao tiếp lễ phép, thân thiện trong trường học.',
  },
  {
    id: 'BVNN',
    stt: 8,
    tenNhom: 'Giáo dục tiết kiệm, bảo vệ nguồn nước',
    canCuPhapLy: 'QĐ 4670/QĐ-BGDĐT',
    moTa:
      'Nhận thức giá trị tài nguyên nước ngọt, giữ gìn vệ sinh nguồn nước ao hồ, sông ngòi quê hương và thực hành khóa vòi nước, dùng nước tiết kiệm hằng ngày.',
    goiYMucDoMacDinh: 'Liên hệ',
    goiYChuDe:
      'Tiết kiệm nước sạch trong sinh hoạt ở trường và gia đình; giữ gìn nguồn nước sạch nơi em sinh sống.',
  },
  {
    id: 'KNS',
    stt: 9,
    tenNhom: 'Giáo dục Kĩ năng sống',
    canCuPhapLy: 'CV 3797/SGDĐT',
    moTa:
      'Rèn luyện kĩ năng giao tiếp, hợp tác nhóm, quản lí cảm xúc, tự phục vụ và phòng tránh tai nạn thương tích, đuối nước, xâm hại.',
    goiYMucDoMacDinh: 'Bộ phận',
    goiYChuDe:
      'Kĩ năng hợp tác nhóm, tự tin thuyết trình trước lớp và kĩ năng tự bảo vệ bản thân an toàn.',
  },
  {
    id: 'LIEM_CHINH',
    stt: 10,
    tenNhom: 'Giáo dục liêm chính, phòng chống tham nhũng, tiết kiệm chống lãng phí',
    canCuPhapLy: 'QĐ 2907/QĐ-BGDĐT',
    moTa:
      'Giáo dục đức tính thật thà, trung thực trong học tập và thi cử, không gian lận, biết giữ gìn đồ dùng chung và thực hành tiết kiệm điện, giấy, đồ ăn.',
    goiYMucDoMacDinh: 'Liên hệ',
    goiYChuDe:
      'Trung thực trong học tập, giữ gìn tài sản công, tiết kiệm điện nước và đồ dùng học tập hằng ngày.',
  },
];

export interface NlsIndicatorOption {
  code: string;
  label: string;
  description: string;
  grades: LessonPlanGrade[];
}

export const NLS_INDICATOR_LIBRARY: NlsIndicatorOption[] = [
  {
    code: 'NLS 1.1.CB1.a',
    label: 'Khai thác thông tin số đơn giản',
    description: 'Nhận biết, tìm kiếm thông tin học tập đơn giản từ tài nguyên số dưới sự hướng dẫn.',
    grades: ['1', '2', '3'],
  },
  {
    code: 'NLS 3.1.CB1.a',
    label: 'Tạo nội dung số cơ bản (Lớp 1-3)',
    description: 'Tạo và chỉnh sửa nội dung văn bản, hình ảnh, bài trình chiếu đơn giản.',
    grades: ['1', '2', '3'],
  },
  {
    code: 'NLS 5.1.CB1.a',
    label: 'Sử dụng thiết bị số an toàn (Lớp 1-2)',
    description: 'Bật/tắt, thao tác chuột/bàn phím/màn hình đúng tư thế và an toàn điện.',
    grades: ['1', '2'],
  },
  {
    code: 'NLS 5.2.CB1.b',
    label: 'Ứng dụng công cụ số giải quyết nhiệm vụ',
    description: 'Lựa chọn và sử dụng công cụ số quen thuộc để thực hành nhiệm vụ học tập.',
    grades: ['2', '3'],
  },
  {
    code: 'NLS 1.3.CB2.a',
    label: 'Lưu trữ & sắp xếp dữ liệu số (Lớp 4-5)',
    description: 'Lưu trữ, đặt tên và sắp xếp tệp, thư mục học tập khoa học trên thiết bị số.',
    grades: ['4', '5'],
  },
  {
    code: 'NLS 3.1.CB2.a',
    label: 'Phát triển nội dung số đa phương tiện (Lớp 4-5)',
    description: 'Tạo lập, định dạng văn bản, bảng biểu, hình ảnh hoặc slide trình chiếu trực quan.',
    grades: ['4', '5'],
  },
  {
    code: 'NLS 2.1.CB2.a',
    label: 'Giao tiếp & hợp tác an toàn trên môi trường số',
    description: 'Chia sẻ sản phẩm học tập lịch sự, tôn trọng bản quyền và an toàn thông tin cá nhân.',
    grades: ['3', '4', '5'],
  },
  {
    code: 'NLS AI.CB1',
    label: 'Làm quen Trí tuệ nhân tạo AI có kiểm soát',
    description: 'Biết đặt câu hỏi rõ ràng cho AI hỗ trợ học tập và luôn kiểm chứng lại kết quả.',
    grades: ['3', '4', '5'],
  },
];

export const STEAM_STEPS: string[] = [
  'Bước 1: Xác định vấn đề',
  'Bước 2: Nghiên cứu kiến thức nền',
  'Bước 3: Đề xuất & chọn giải pháp',
  'Bước 4: Chế tạo mẫu',
  'Bước 5: Chia sẻ & điều chỉnh',
];

export const GDDP_QUICK_CHIPS: string[] = [
  'Danh lam thắng cảnh, di tích lịch sử văn hóa địa phương',
  'Làng nghề & sản vật quê hương Trực Ninh - Nam Định',
  'Cảnh đẹp trường em - TH Quang Hưng - Phân hiệu Trực Khang',
  'Truyền thống hiếu học & bảo vệ môi trường nông thôn mới',
];

export const SAMPLE_HSKT_NOTE =
  'Lớp 4C có 2 HS khuyết tật trí tuệ (Bảo, Anh); lớp 4D có 1 HS bị hội chứng Down (Đạt)';

export interface IntegrationItem {
  categoryId: IntegrationCategoryId;
  chuDe: string;
  noiDung: string;
  mucDo: IntegrationMucDo;
  diaChiTichHop: string;
}

export type LessonPlanSubject =
  | 'Toán'
  | 'Tiếng Việt'
  | 'Tiếng Anh'
  | 'Tự nhiên và Xã hội'
  | 'Khoa học'
  | 'Lịch sử và Địa lí'
  | 'Tin học'
  | 'Công nghệ'
  | 'Đạo đức'
  | 'Hoạt động trải nghiệm'
  | 'Âm nhạc'
  | 'Mĩ thuật';

export type LessonPlanGrade = '1' | '2' | '3' | '4' | '5';

export type LessonPlanTextbook =
  | 'Kết nối tri thức với cuộc sống'
  | 'Cánh diều'
  | 'Chân trời sáng tạo';

export const LESSON_PLAN_SUBJECTS: LessonPlanSubject[] = [
  'Tin học',
  'Công nghệ',
  'Toán',
  'Tiếng Việt',
  'Tiếng Anh',
  'Tự nhiên và Xã hội',
  'Khoa học',
  'Lịch sử và Địa lí',
  'Đạo đức',
  'Hoạt động trải nghiệm',
  'Âm nhạc',
  'Mĩ thuật',
];

export const LESSON_PLAN_GRADES: LessonPlanGrade[] = ['1', '2', '3', '4', '5'];

export const LESSON_PLAN_TEXTBOOKS: LessonPlanTextbook[] = [
  'Kết nối tri thức với cuộc sống',
  'Cánh diều',
  'Chân trời sáng tạo',
];

export interface LessonPlanConfig {
  loaiGiaoVien?: TeacherLessonPlanType;
  hienThiKhungKyDuyet?: boolean;
  ngaySoan?: string;
  tuanSo?: string;
  thoiGianThucHien?: string;
  tietSo?: string;
  monHoc: LessonPlanSubject;
  khoiLop: LessonPlanGrade;
  boSach: LessonPlanTextbook;
  tenBaiHoc: string;
  ngayDayLop: string;
  selectedIntegrations: IntegrationCategoryId[];
  mucDoGddp?: IntegrationMucDo;
  noiDungGiaoDucDiaPhuong: string;
  maNlsSelected?: string[];
  chiTietNlsAi?: string;
  steamStep?: string;
  noiDungTichHopKhac: string;
  coHocSinhKhuyetTat: boolean;
  ghiChuHSKT: string;
  integrationItems?: IntegrationItem[];
}

export interface LessonPlanStarterActivity {
  thoiGianPhut: number;
  hinhThucToChuc: string;
  hoatDongGV: string[];
  hoatDongHS: string[];
  noiDungTichHopLongGhep?: string;
}

export interface LessonPlanActivityStep {
  tenHoatDong: string;
  thoiGianPhut?: number;
  hinhThucVaDanhGia: string;
  hoatDongGV: string[];
  hoatDongHS: string[];
  noiDungTichHopLongGhep?: string;
}

export interface LessonPlanApplicationActivity {
  thoiGianPhut: number;
  hinhThucVaDanhGia: string;
  hoatDongGV: string[];
  hoatDongHS: string[];
  noiDungTichHopLongGhep?: string;
}

export interface GeneratedLessonPlan {
  header: {
    loaiGiaoVien?: TeacherLessonPlanType;
    monHoc: string;
    khoiLop?: string;
    tenBaiHoc: string;
    ngayDayLop: string;
    tietSo?: string;
    hienThiKhungKyDuyet?: boolean;
    ngaySoan?: string;
    tuanSo?: string;
    thoiGianThucHien?: string;
    tenGiaoVien?: string;
  };
  yeuCauCanDat: {
    kienThucKiNang: string[];
    nangLucDacThu?: string[];
    nangLucChung?: string[];
    nangLuc: string[];
    phamChat: string[];
    giaoDucTichHop: string[];
  };
  doDungDayHoc: {
    giaoVien: string[];
    hocSinh: string[];
  };
  hoatDongDayHoc: {
    khoiDong: LessonPlanStarterActivity;
    khamPha: LessonPlanActivityStep[];
    luyenTap: LessonPlanActivityStep[];
    vanDung: LessonPlanApplicationActivity;
    luuYHSKT: string;
  };
  dieuChinhSauBaiDay: string;
}
