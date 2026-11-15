import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  Cpu,
  Download,
  Edit3,
  HeartHandshake,
  Layers,
  Loader2,
  MapPin,
  Save,
  Share2,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import {
  GDDP_QUICK_CHIPS,
  INTEGRATION_CATEGORIES,
  LESSON_PLAN_GRADES,
  LESSON_PLAN_SUBJECTS,
  LESSON_PLAN_TEXTBOOKS,
  NLS_INDICATOR_LIBRARY,
  SAMPLE_HSKT_NOTE,
  STEAM_STEPS,
  type GeneratedLessonPlan,
  type IntegrationCategoryId,
  type IntegrationMucDo,
  type LessonPlanActivityStep,
  type LessonPlanConfig,
  type LessonPlanGrade,
  type LessonPlanSubject,
  type LessonPlanTextbook,
  type TeacherLessonPlanType,
} from '../../types/lessonPlan';
import type { AppView, UserProfile } from '../../types/hocLieu';
import {
  generateLessonPlanWithAI,
  saveLessonPlanToSystem,
} from '../../services/aiLessonPlanService';
import { exportLessonPlanToWord } from '../../utils/lessonPlanWordExport';
import { useToast } from '../ToastContext';

interface LessonPlanGeneratorWorkspaceProps {
  profile: UserProfile;
  onSavedNavigate?: (target: AppView) => void;
}

const QUICK_SUBJECT_CHIPS: LessonPlanSubject[] = [
  'Tin học',
  'Công nghệ',
  'Toán',
  'Tiếng Việt',
];

const OTHER_INTEGRATION_IDS: IntegrationCategoryId[] = [
  'STEM',
  'ATGT',
  'QPAN',
  'QCN',
  'CTDDLS',
  'BVNN',
  'KNS',
  'LIEM_CHINH',
];

const SAMPLE_TOPICS_BY_SUBJECT: Partial<Record<LessonPlanSubject, string[]>> = {
  'Tin học': [
    'Bài 7: Định dạng văn bản trên trang chiếu',
    'Bài 1: Thông tin và quyết định',
    'Bài 5: Tìm kiếm thông tin trên Internet',
  ],
  'Công nghệ': [
    'Bài 3: Làm đồ dùng học tập',
    'Bài 4: Trồng hoa, cây cảnh trong chậu',
  ],
  Toán: [
    'Phép cộng có nhớ trong phạm vi 1000',
    'Diện tích hình chữ nhật, hình vuông',
  ],
  'Tiếng Việt': [
    'Quê hương tươi đẹp',
    'Từ chỉ sự vật, hoạt động',
  ],
};

function linesToArray(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function arrayToLines(items?: string[]): string {
  return (items || []).join('\n');
}

function calcLineRows(items?: string[], minRows = 2): number {
  const count = (items || []).length;
  return Math.max(minRows, Math.min(10, count + 1));
}

export function LessonPlanGeneratorWorkspace({
  profile,
  onSavedNavigate,
}: LessonPlanGeneratorWorkspaceProps) {
  const { showToast, showFirebaseAlert } = useToast();

  // Cấu hình giáo viên & Khung ký duyệt tuần
  const [loaiGiaoVien, setLoaiGiaoVien] = useState<TeacherLessonPlanType>('GV_CHUYEN');
  const [hienThiKhungKyDuyet, setHienThiKhungKyDuyet] = useState<boolean>(false);
  const [ngaySoan, setNgaySoan] = useState<string>('14/11/2026');
  const [tuanSo, setTuanSo] = useState<string>('11');
  const [thoiGianThucHien, setThoiGianThucHien] = useState<string>(
    'Từ ngày 16/11 đến ngày 20/11/2026'
  );

  // Thông tin bài dạy
  const [monHoc, setMonHoc] = useState<LessonPlanSubject>('Tin học');
  const [khoiLop, setKhoiLop] = useState<LessonPlanGrade>('5');
  const [boSach, setBoSach] = useState<LessonPlanTextbook>('Kết nối tri thức với cuộc sống');
  const [tenBaiHoc, setTenBaiHoc] = useState<string>('');
  const [tietSo, setTietSo] = useState<string>('Tiết 1');
  const [ngayDayLop, setNgayDayLop] = useState<string>(
    'Sáng thứ Hai, 16/11/2026 - Lớp: 5D (tiết 3); 5C (tiết 4)'
  );

  // Khung 1: GDĐP
  const [enableGddp, setEnableGddp] = useState<boolean>(true);
  const [mucDoGddp, setMucDoGddp] = useState<IntegrationMucDo>('Liên hệ');
  const [noiDungGddp, setNoiDungGddp] = useState<string>(
    'Liên hệ cảnh đẹp, truyền thống quê hương Trường TH Quang Hưng - Phân hiệu Trực Khang gắn với nội dung bài học.'
  );

  // Khung 2: Năng lực số & AI
  const [enableNls, setEnableNls] = useState<boolean>(true);
  const [showAllNls, setShowAllNls] = useState<boolean>(false);
  const [maNlsSelected, setMaNlsSelected] = useState<string[]>(['NLS 3.1.CB2.a']);
  const [chiTietNlsAi, setChiTietNlsAi] = useState<string>('');

  // Khung 3: Nội dung tích hợp khác (05.2)
  const [otherIntegrations, setOtherIntegrations] = useState<IntegrationCategoryId[]>([]);
  const [steamStep, setSteamStep] = useState<string>(STEAM_STEPS[3]);
  const [noiDungTichHopKhac, setNoiDungTichHopKhac] = useState<string>('');

  // Khung 4: HSKT
  const [coHocSinhKhuyetTat, setCoHocSinhKhuyetTat] = useState<boolean>(false);
  const [ghiChuHSKT, setGhiChuHSKT] = useState<string>('');

  // Trạng thái sinh & lưu
  const [generating, setGenerating] = useState<boolean>(false);
  const [exportingWord, setExportingWord] = useState<boolean>(false);
  const [savingDraft, setSavingDraft] = useState<boolean>(false);
  const [sharingPublic, setSharingPublic] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedMaterialId, setSavedMaterialId] = useState<string | null>(null);
  const [lastSavedMode, setLastSavedMode] = useState<'draft' | 'shared' | null>(null);

  const [generatedPlan, setGeneratedPlan] = useState<GeneratedLessonPlan | null>(null);

  const displayedNlsOptions = useMemo(() => {
    if (showAllNls) return NLS_INDICATOR_LIBRARY;
    return NLS_INDICATOR_LIBRARY.filter(
      (opt) => opt.grades.includes(khoiLop) || maNlsSelected.includes(opt.code)
    );
  }, [khoiLop, maNlsSelected, showAllNls]);

  const otherIntegrationMetas = useMemo(
    () => INTEGRATION_CATEGORIES.filter((c) => OTHER_INTEGRATION_IDS.includes(c.id)),
    []
  );

  const totalMinutes = useMemo(() => {
    if (!generatedPlan) return 0;
    const { khoiDong, khamPha, luyenTap, vanDung } = generatedPlan.hoatDongDayHoc;
    const kpSum = khamPha.reduce((acc, s) => acc + (s.thoiGianPhut || 0), 0);
    const ltSum = luyenTap.reduce((acc, s) => acc + (s.thoiGianPhut || 0), 0);
    return (khoiDong.thoiGianPhut || 0) + kpSum + ltSum + (vanDung.thoiGianPhut || 0);
  }, [generatedPlan]);

  function handleSelectTeacherType(nextType: TeacherLessonPlanType) {
    setLoaiGiaoVien(nextType);
    if (nextType === 'GV_CHU_NHIEM') {
      if (ngayDayLop.includes('Lớp:') || !ngayDayLop.trim()) {
        setNgayDayLop('Thứ Hai ngày 16 tháng 11 năm 2026');
      }
    } else if (ngayDayLop.startsWith('Thứ ') || !ngayDayLop.trim()) {
      setNgayDayLop(`Sáng thứ Hai, 16/11/2026 - Lớp: ${khoiLop}D (tiết 3); ${khoiLop}C (tiết 4)`);
    }
  }

  function handleSelectGrade(grade: LessonPlanGrade) {
    setKhoiLop(grade);
    const matchingCodes = NLS_INDICATOR_LIBRARY.filter((n) => n.grades.includes(grade)).map(
      (n) => n.code
    );
    if (matchingCodes.length > 0 && !maNlsSelected.some((c) => matchingCodes.includes(c))) {
      setMaNlsSelected([matchingCodes[0]]);
    }
  }

  function toggleNlsCode(code: string) {
    setMaNlsSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  function toggleOtherIntegration(id: IntegrationCategoryId) {
    setOtherIntegrations((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function handleAppendGddpChip(chipText: string) {
    setEnableGddp(true);
    setNoiDungGddp((prev) => {
      const clean = prev.trim();
      if (!clean) return chipText;
      if (clean.includes(chipText)) return clean;
      return `${clean}\n- ${chipText}`;
    });
  }

  function buildConfig(): LessonPlanConfig {
    const selectedIntegrations: IntegrationCategoryId[] = [...otherIntegrations];
    if (enableGddp) selectedIntegrations.push('GDDP');
    if (enableNls) selectedIntegrations.push('CDS_NLS_AI');

    return {
      loaiGiaoVien,
      hienThiKhungKyDuyet,
      ngaySoan,
      tuanSo,
      thoiGianThucHien,
      tietSo,
      monHoc,
      khoiLop,
      boSach,
      tenBaiHoc: tenBaiHoc.trim(),
      ngayDayLop: ngayDayLop.trim(),
      selectedIntegrations,
      mucDoGddp,
      noiDungGiaoDucDiaPhuong: enableGddp ? noiDungGddp.trim() : '',
      maNlsSelected: enableNls ? maNlsSelected : [],
      chiTietNlsAi: enableNls ? chiTietNlsAi.trim() : '',
      steamStep: otherIntegrations.includes('STEM') ? steamStep : '',
      noiDungTichHopKhac: noiDungTichHopKhac.trim(),
      coHocSinhKhuyetTat,
      ghiChuHSKT: coHocSinhKhuyetTat ? ghiChuHSKT.trim() : '',
    };
  }

  async function handleGenerate(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setErrorMsg(null);

    if (!tenBaiHoc.trim() || tenBaiHoc.trim().length < 2) {
      const msg = 'Vui lòng nhập Tên bài học / Tiết dạy cần soạn.';
      setErrorMsg(msg);
      showToast(msg, 'error');
      return;
    }

    setGenerating(true);
    try {
      const config = buildConfig();
      const result = await generateLessonPlanWithAI(config);
      result.header.tenGiaoVien = profile.hoTen;
      result.header.loaiGiaoVien = loaiGiaoVien;
      result.header.hienThiKhungKyDuyet = hienThiKhungKyDuyet;
      result.header.ngaySoan = ngaySoan;
      result.header.tuanSo = tuanSo;
      result.header.thoiGianThucHien = thoiGianThucHien;
      result.header.tietSo = tietSo;

      setGeneratedPlan(result);
      setSavedMaterialId(null);
      setLastSavedMode(null);
      showToast('Đã thiết kế xong Kế hoạch bài dạy chuẩn CV 2345 (35 phút)!', 'success');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Không thể tạo Kế hoạch bài dạy bằng AI. Vui lòng thử lại.';
      setErrorMsg(msg);
      showToast(msg, 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function handleExportWord() {
    if (!generatedPlan) return;
    setExportingWord(true);
    try {
      const exportPayload: GeneratedLessonPlan = {
        ...generatedPlan,
        header: {
          ...generatedPlan.header,
          tenGiaoVien: profile.hoTen,
        },
      };
      const fileName = await exportLessonPlanToWord(exportPayload);
      showToast(`Đã xuất tệp Word chuẩn mẫu trường: ${fileName}`, 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Lỗi khi xuất tệp Word (.docx).',
        'error'
      );
    } finally {
      setExportingWord(false);
    }
  }

  async function handleSaveToSystem(sharePublic: boolean) {
    if (!generatedPlan) return;
    if (savingDraft || sharingPublic) return;

    if (sharePublic) setSharingPublic(true);
    else setSavingDraft(true);

    try {
      const materialId = await saveLessonPlanToSystem({
        profile,
        existingMaterialId: savedMaterialId,
        config: buildConfig(),
        plan: {
          ...generatedPlan,
          header: {
            ...generatedPlan.header,
            tenGiaoVien: profile.hoTen,
          },
        },
        sharePublic,
      });

      setSavedMaterialId(materialId);
      setLastSavedMode(sharePublic ? 'shared' : 'draft');

      showToast(
        sharePublic
          ? profile.vaiTro === 'quanTri' || profile.vaiTro === 'toTruong'
            ? 'Đã chia sẻ Kế hoạch bài dạy lên Kho học liệu dùng chung!'
            : 'Đã gửi Kế hoạch bài dạy vào hàng Chờ duyệt để chia sẻ toàn tổ/trường!'
          : 'Đã lưu Kế hoạch bài dạy vào mục Học liệu của tôi!',
        'success'
      );
    } catch (err) {
      showFirebaseAlert(false, err);
    } finally {
      setSavingDraft(false);
      setSharingPublic(false);
    }
  }

  // Helpers chỉnh sửa trực tiếp (inline editing) trên bản xem trước
  function updateHeaderField(
    field: keyof GeneratedLessonPlan['header'],
    value: string | boolean
  ) {
    setGeneratedPlan((prev) =>
      prev
        ? {
            ...prev,
            header: {
              ...prev.header,
              [field]: value,
            },
          }
        : prev
    );
  }

  function updateYccdLines(
    field: 'kienThucKiNang' | 'nangLucDacThu' | 'nangLucChung' | 'phamChat' | 'giaoDucTichHop',
    rawText: string
  ) {
    const arr = linesToArray(rawText);
    setGeneratedPlan((prev) => {
      if (!prev) return prev;
      const nextYccd = {
        ...prev.yeuCauCanDat,
        [field]: arr,
      };
      if (field === 'nangLucDacThu' || field === 'nangLucChung') {
        nextYccd.nangLuc = [
          ...(nextYccd.nangLucDacThu || []),
          ...(nextYccd.nangLucChung || []),
        ];
      }
      return { ...prev, yeuCauCanDat: nextYccd };
    });
  }

  function updateDoDung(field: 'giaoVien' | 'hocSinh', rawText: string) {
    const arr = rawText
      .split(/[\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setGeneratedPlan((prev) =>
      prev
        ? {
            ...prev,
            doDungDayHoc: {
              ...prev.doDungDayHoc,
              [field]: arr,
            },
          }
        : prev
    );
  }

  function updateKhoiDongField(
    field: 'thoiGianPhut' | 'hinhThucToChuc' | 'noiDungTichHopLongGhep' | 'hoatDongGV' | 'hoatDongHS',
    value: string | number
  ) {
    setGeneratedPlan((prev) => {
      if (!prev) return prev;
      const kd = { ...prev.hoatDongDayHoc.khoiDong };
      if (field === 'hoatDongGV' || field === 'hoatDongHS') {
        kd[field] = linesToArray(String(value));
      } else if (field === 'thoiGianPhut') {
        kd.thoiGianPhut = Math.max(1, Number(value) || 4);
      } else {
        kd[field] = String(value);
      }
      return {
        ...prev,
        hoatDongDayHoc: {
          ...prev.hoatDongDayHoc,
          khoiDong: kd,
        },
      };
    });
  }

  function updateActivityStep(
    phase: 'khamPha' | 'luyenTap',
    index: number,
    field: keyof LessonPlanActivityStep,
    value: string | number
  ) {
    setGeneratedPlan((prev) => {
      if (!prev) return prev;
      const list = [...prev.hoatDongDayHoc[phase]];
      const target = { ...list[index] };
      if (field === 'hoatDongGV' || field === 'hoatDongHS') {
        target[field] = linesToArray(String(value));
      } else if (field === 'thoiGianPhut') {
        target.thoiGianPhut = Math.max(1, Number(value) || 5);
      } else {
        target[field] = String(value) as never;
      }
      list[index] = target;
      return {
        ...prev,
        hoatDongDayHoc: {
          ...prev.hoatDongDayHoc,
          [phase]: list,
        },
      };
    });
  }

  function updateVanDungField(
    field: 'thoiGianPhut' | 'hinhThucVaDanhGia' | 'noiDungTichHopLongGhep' | 'hoatDongGV' | 'hoatDongHS',
    value: string | number
  ) {
    setGeneratedPlan((prev) => {
      if (!prev) return prev;
      const vd = { ...prev.hoatDongDayHoc.vanDung };
      if (field === 'hoatDongGV' || field === 'hoatDongHS') {
        vd[field] = linesToArray(String(value));
      } else if (field === 'thoiGianPhut') {
        vd.thoiGianPhut = Math.max(1, Number(value) || 5);
      } else {
        vd[field] = String(value);
      }
      return {
        ...prev,
        hoatDongDayHoc: {
          ...prev.hoatDongDayHoc,
          vanDung: vd,
        },
      };
    });
  }

  const topicSuggestions = SAMPLE_TOPICS_BY_SUBJECT[monHoc] || [];

  return (
    <div className="space-y-6">
      {/* Header giới thiệu phân hệ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-teal-700 text-white flex items-center justify-center shrink-0">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                Soạn Kế Hoạch Bài Dạy (Giáo Án) AI Tích Hợp
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Giáo viên: <span className="font-bold text-slate-800">{profile.hoTen}</span> · Chuẩn Công văn 2345 (1 tiết = 35 phút), tích hợp GDĐP Quang Hưng - Trực Khang, Năng lực số TT 02/2025, Kế hoạch khối 05.2 & HSKT hòa nhập.
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold shrink-0 self-start">
            <Sparkles className="w-4 h-4" />
            Mẫu ký duyệt chuẩn TH Quang Hưng
          </div>
        </div>
      </div>

      {/* Bố cục 2 cột */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* CỘT TRÁI: BIỂU MẪU THIẾT LẬP */}
        <form
          onSubmit={handleGenerate}
          className="xl:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 space-y-5 shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-teal-700" />
              Thiết lập Kế hoạch bài dạy
            </h2>
            <span className="text-xs font-semibold text-slate-500">1 tiết · 35 phút</span>
          </div>

          {/* 1. Kiểu tiêu đề đầu giáo án */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-800">
              Kiểu giáo án theo vị trí giảng dạy
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectTeacherType('GV_CHUYEN')}
                className={`px-3 py-2.5 rounded-xl border text-left transition-all ${
                  loaiGiaoVien === 'GV_CHUYEN'
                    ? 'border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-extrabold">GV dạy nhiều lớp / Môn chuyên</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Tin học, Công nghệ, Tiếng Anh, Âm nhạc...
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleSelectTeacherType('GV_CHU_NHIEM')}
                className={`px-3 py-2.5 rounded-xl border text-left transition-all ${
                  loaiGiaoVien === 'GV_CHU_NHIEM'
                    ? 'border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-extrabold">GV chủ nhiệm</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Mẫu Thứ/ngày/tiết/môn/bài trên lớp
                </div>
              </button>
            </div>
          </div>

          {/* 2. Khung ký duyệt & thông tin tuần */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hienThiKhungKyDuyet}
                onChange={(e) => setHienThiKhungKyDuyet(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <div>
                <span className="text-sm font-bold text-slate-800 block">
                  Kèm khung thông tin tuần & Bảng ký duyệt (3 cột)
                </span>
                <span className="text-xs text-slate-500">
                  Hiển thị Ngày soạn, Tuần, Thời gian thực hiện & Kí duyệt | Tổ trưởng | Giáo viên
                </span>
              </div>
            </label>

            {hienThiKhungKyDuyet && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ngày soạn
                  </label>
                  <input
                    type="text"
                    value={ngaySoan}
                    onChange={(e) => setNgaySoan(e.target.value)}
                    placeholder="VD: 14/11/2026"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tuần số
                  </label>
                  <input
                    type="text"
                    value={tuanSo}
                    onChange={(e) => setTuanSo(e.target.value)}
                    placeholder="VD: 11"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Thời gian thực hiện
                  </label>
                  <input
                    type="text"
                    value={thoiGianThucHien}
                    onChange={(e) => setThoiGianThucHien(e.target.value)}
                    placeholder="VD: Từ ngày 16/11 đến ngày 20/11/2026"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 3. Môn học, Khối lớp, Bộ sách */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">
                Môn học *
              </label>
              <select
                value={monHoc}
                onChange={(e) => setMonHoc(e.target.value as LessonPlanSubject)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {LESSON_PLAN_SUBJECTS.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {QUICK_SUBJECT_CHIPS.map((subj) => (
                  <button
                    key={subj}
                    type="button"
                    onClick={() => setMonHoc(subj)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                      monHoc === subj
                        ? 'bg-teal-700 text-white border-teal-700'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {subj}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  Khối lớp *
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {LESSON_PLAN_GRADES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => handleSelectGrade(g)}
                      className={`py-2 rounded-xl text-sm font-bold border transition-colors ${
                        khoiLop === g
                          ? 'bg-teal-700 text-white border-teal-700'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  Bộ sách giáo khoa
                </label>
                <select
                  value={boSach}
                  onChange={(e) => setBoSach(e.target.value as LessonPlanTextbook)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  {LESSON_PLAN_TEXTBOOKS.map((book) => (
                    <option key={book} value={book}>
                      {book}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold text-slate-800 mb-1">
                  Tên bài học *
                </label>
                <input
                  type="text"
                  required
                  value={tenBaiHoc}
                  onChange={(e) => setTenBaiHoc(e.target.value)}
                  placeholder="VD: Bài 7: Định dạng văn bản trên trang chiếu"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">
                  Tiết dạy
                </label>
                <input
                  type="text"
                  value={tietSo}
                  onChange={(e) => setTietSo(e.target.value)}
                  placeholder="VD: Tiết 1"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>

            {topicSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {topicSuggestions.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => setTenBaiHoc(topic)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-800 border border-slate-200 transition-colors text-left"
                  >
                    + {topic}
                  </button>
                ))}
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">
                {loaiGiaoVien === 'GV_CHUYEN'
                  ? 'Ngày dạy / Lớp (nhiều lớp)'
                  : 'Thứ / Ngày / Tháng / Năm giảng dạy'}
              </label>
              <input
                type="text"
                value={ngayDayLop}
                onChange={(e) => setNgayDayLop(e.target.value)}
                placeholder={
                  loaiGiaoVien === 'GV_CHUYEN'
                    ? 'VD: Sáng thứ Hai, 16/11/2026 - Lớp: 5D (tiết 3); 5C (tiết 4)'
                    : 'VD: Thứ Hai ngày 16 tháng 11 năm 2026'
                }
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          {/* KHUNG 1: GIÁO DỤC ĐỊA PHƯƠNG */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-sm font-extrabold text-emerald-950">
                  1. Giáo dục địa phương / Văn hóa địa phương
                </span>
              </div>
              <input
                type="checkbox"
                checked={enableGddp}
                onChange={(e) => setEnableGddp(e.target.checked)}
                aria-label="Bật tích hợp Giáo dục địa phương"
                className="w-4 h-4 rounded border-emerald-400 text-emerald-700 focus:ring-emerald-600"
              />
            </div>

            {enableGddp && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-emerald-900">Mức độ:</span>
                  {(['Liên hệ', 'Bộ phận', 'Toàn phần'] as IntegrationMucDo[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setMucDoGddp(level)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                        mucDoGddp === level
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {GDDP_QUICK_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleAppendGddpChip(chip)}
                      className="text-[11px] px-2 py-1 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-left transition-colors"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={2}
                  value={noiDungGddp}
                  onChange={(e) => setNoiDungGddp(e.target.value)}
                  placeholder="Nhập nội dung liên hệ quê hương Quang Hưng - Trực Khang..."
                  className="w-full px-3 py-2 rounded-xl border border-emerald-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            )}
          </div>

          {/* KHUNG 2: NĂNG LỰC SỐ & AI (TT 02/2025) */}
          <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-sky-700 shrink-0" />
                <span className="text-sm font-extrabold text-sky-950">
                  2. Năng lực số (TT 02/2025) & Trí tuệ nhân tạo (AI)
                </span>
              </div>
              <input
                type="checkbox"
                checked={enableNls}
                onChange={(e) => setEnableNls(e.target.checked)}
                aria-label="Bật tích hợp Năng lực số và AI"
                className="w-4 h-4 rounded border-sky-400 text-sky-700 focus:ring-sky-600"
              />
            </div>

            {enableNls && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-sky-900">
                    Chọn chỉ báo năng lực số phù hợp (Khối {khoiLop}):
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllNls((v) => !v)}
                    className="text-[11px] font-bold text-sky-700 hover:underline"
                  >
                    {showAllNls ? 'Lọc theo khối' : 'Xem tất cả 8 mã'}
                  </button>
                </div>

                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {displayedNlsOptions.map((opt) => {
                    const checked = maNlsSelected.includes(opt.code);
                    return (
                      <label
                        key={opt.code}
                        className={`flex items-start gap-2 p-2 rounded-xl border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-white border-sky-500 ring-1 ring-sky-500'
                            : 'bg-white/70 border-sky-100 hover:bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleNlsCode(opt.code)}
                          className="mt-0.5 w-3.5 h-3.5 rounded border-sky-400 text-sky-700"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold text-slate-900">
                            {opt.code} · {opt.label}
                          </div>
                          <div className="text-[11px] text-slate-600 leading-snug">
                            {opt.description}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <textarea
                  rows={2}
                  value={chiTietNlsAi}
                  onChange={(e) => setChiTietNlsAi(e.target.value)}
                  placeholder="Gợi ý thêm thao tác số/AI trong tiết học (không bắt buộc)..."
                  className="w-full px-3 py-2 rounded-xl border border-sky-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>
            )}
          </div>

          {/* KHUNG 3: CÁC NỘI DUNG TÍCH HỢP KHÁC (05.2) */}
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-700 shrink-0" />
              <span className="text-sm font-extrabold text-indigo-950">
                3. Các nội dung tích hợp khác (Bảng 05.2)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {otherIntegrationMetas.map((meta) => {
                const checked = otherIntegrations.includes(meta.id);
                return (
                  <label
                    key={meta.id}
                    className={`flex items-start gap-2 p-2 rounded-xl border cursor-pointer transition-colors ${
                      checked
                        ? 'bg-white border-indigo-500 ring-1 ring-indigo-500'
                        : 'bg-white/70 border-indigo-100 hover:bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOtherIntegration(meta.id)}
                      className="mt-0.5 w-3.5 h-3.5 rounded border-indigo-400 text-indigo-700"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 leading-tight">
                        {meta.tenNhom}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {meta.canCuPhapLy}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {otherIntegrations.includes('STEM') && (
              <div className="bg-white rounded-xl border border-indigo-200 p-2.5">
                <label className="block text-xs font-bold text-indigo-900 mb-1">
                  Bước quy trình STEAM lồng ghép:
                </label>
                <select
                  value={steamStep}
                  onChange={(e) => setSteamStep(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-200 text-xs font-semibold text-slate-800"
                >
                  {STEAM_STEPS.map((step) => (
                    <option key={step} value={step}>
                      {step}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <textarea
              rows={2}
              value={noiDungTichHopKhac}
              onChange={(e) => setNoiDungTichHopKhac(e.target.value)}
              placeholder="Ghi chú thêm nội dung lồng ghép riêng của bài (nếu có)..."
              className="w-full px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          {/* KHUNG 4: HỌC SINH KHUYẾT TẬT HỌC HÒA NHẬP */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={coHocSinhKhuyetTat}
                  onChange={(e) => setCoHocSinhKhuyetTat(e.target.checked)}
                  className="w-4 h-4 rounded border-amber-400 text-amber-700 focus:ring-amber-600"
                />
                <span className="text-sm font-extrabold text-amber-950 flex items-center gap-1.5">
                  <HeartHandshake className="w-4 h-4 text-amber-700" />
                  4. Lớp có HS khuyết tật học hòa nhập
                </span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setCoHocSinhKhuyetTat(true);
                  setGhiChuHSKT(SAMPLE_HSKT_NOTE);
                }}
                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 shrink-0"
              >
                Điền mẫu nhanh
              </button>
            </div>

            {coHocSinhKhuyetTat && (
              <textarea
                rows={2}
                value={ghiChuHSKT}
                onChange={(e) => setGhiChuHSKT(e.target.value)}
                placeholder={SAMPLE_HSKT_NOTE}
                className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-600"
              />
            )}
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={generating}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:bg-teal-400 text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            {generating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                AI đang soạn Kế hoạch bài dạy chuẩn CV 2345...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Thiết kế Kế Hoạch Bài Dạy Bằng AI
              </>
            )}
          </button>
        </form>

        {/* CỘT PHẢI: XEM TRƯỚC & CHỈNH SỬA TRỰC TIẾP */}
        <div className="xl:col-span-7 space-y-4">
          {!generatedPlan ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 sm:p-12 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <ClipboardList className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900">
                Chưa có bản Kế hoạch bài dạy nào được tạo
              </h3>
              <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                Thầy/cô chọn môn học, khối lớp, nhập tên bài học và tích chọn các nội dung lồng ghép (GDĐP, Năng lực số TT 02/2025, STEM/KNS, HSKT) ở cột bên trái, sau đó bấm{' '}
                <span className="font-bold text-teal-800">Thiết kế Kế Hoạch Bài Dạy Bằng AI</span>.
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
                <span className="px-2.5 py-1 rounded-lg bg-slate-100">Chuẩn 1 tiết (35 phút)</span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-100">Bảng 2 cột GV / HS</span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-100">Sửa trực tiếp & Xuất Word .docx</span>
              </div>
            </div>
          ) : (
            <>
              {/* Thanh công cụ thao tác */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200">
                      <Clock className="w-3.5 h-3.5" />
                      Tổng thời lượng: {totalMinutes} phút
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                      <Edit3 className="w-3.5 h-3.5" />
                      Bấm trực tiếp vào từng mục bên dưới để sửa
                    </span>
                  </div>

                  {lastSavedMode && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                        <CheckCircle2 className="w-4 h-4" />
                        {lastSavedMode === 'shared'
                          ? 'Đã chia sẻ lên Kho học liệu'
                          : 'Đã lưu vào Học liệu của tôi'}
                      </span>
                      {onSavedNavigate && (
                        <button
                          type="button"
                          onClick={() =>
                            onSavedNavigate(lastSavedMode === 'shared' ? 'library' : 'myMaterials')
                          }
                          className="font-bold text-teal-700 underline hover:text-teal-900"
                        >
                          Mở xem ngay
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleExportWord}
                    disabled={exportingWord}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-bold transition-colors"
                  >
                    {exportingWord ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Tải file Word (.docx)
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveToSystem(false)}
                    disabled={savingDraft || sharingPublic}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-teal-600 bg-teal-50 hover:bg-teal-100 text-teal-900 text-sm font-bold transition-colors disabled:opacity-60"
                  >
                    {savingDraft ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Lưu vào Học liệu của tôi
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveToSystem(true)}
                    disabled={savingDraft || sharingPublic}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold transition-colors disabled:opacity-60"
                  >
                    {sharingPublic ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Share2 className="w-4 h-4" />
                    )}
                    Chia sẻ lên Kho học liệu
                  </button>
                </div>
              </div>

              {/* Trang giấy A4 Xem trước & Chỉnh sửa trực tiếp */}
              <div className="bg-white rounded-2xl border border-slate-300 shadow-sm p-5 sm:p-8 space-y-5 text-slate-900">
                {/* Khung thông tin tuần & ký duyệt 3 cột */}
                {generatedPlan.header.hienThiKhungKyDuyet && (
                  <div className="space-y-3 border-b border-slate-200 pb-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                      <label className="flex items-center gap-1.5">
                        <span className="font-bold shrink-0">Ngày soạn:</span>
                        <input
                          type="text"
                          value={generatedPlan.header.ngaySoan || ''}
                          onChange={(e) => updateHeaderField('ngaySoan', e.target.value)}
                          className="w-full px-2 py-0.5 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                        />
                      </label>
                      <label className="flex items-center gap-1.5">
                        <span className="font-bold shrink-0">TUẦN:</span>
                        <input
                          type="text"
                          value={generatedPlan.header.tuanSo || ''}
                          onChange={(e) => updateHeaderField('tuanSo', e.target.value)}
                          className="w-full px-2 py-0.5 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none font-bold"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 sm:col-span-3">
                        <span className="font-bold shrink-0">Thời gian thực hiện:</span>
                        <input
                          type="text"
                          value={generatedPlan.header.thoiGianThucHien || ''}
                          onChange={(e) => updateHeaderField('thoiGianThucHien', e.target.value)}
                          className="w-full px-2 py-0.5 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-3 border border-slate-400 text-center text-xs">
                      <div className="border-r border-slate-400">
                        <div className="bg-slate-100 font-bold py-1.5 border-b border-slate-400">
                          Kí duyệt
                        </div>
                        <div className="h-14 flex items-end justify-center pb-1 text-slate-400 italic">
                          (BGH)
                        </div>
                      </div>
                      <div className="border-r border-slate-400">
                        <div className="bg-slate-100 font-bold py-1.5 border-b border-slate-400">
                          Tổ trưởng
                        </div>
                        <div className="h-14 flex items-end justify-center pb-1 text-slate-400 italic">
                          (Kí tên)
                        </div>
                      </div>
                      <div>
                        <div className="bg-slate-100 font-bold py-1.5 border-b border-slate-400">
                          Giáo viên
                        </div>
                        <div className="h-14 flex items-end justify-center pb-1.5 font-bold text-slate-900">
                          {profile.hoTen}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tiêu đề đầu giáo án theo GV Chuyên / GV Chủ nhiệm */}
                {generatedPlan.header.loaiGiaoVien === 'GV_CHU_NHIEM' ? (
                  <div className="space-y-1.5 border-b border-slate-200 pb-4">
                    <input
                      type="text"
                      value={generatedPlan.header.ngayDayLop}
                      onChange={(e) => updateHeaderField('ngayDayLop', e.target.value)}
                      className="w-full italic text-sm px-2 py-1 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                    />
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <label className="flex items-center gap-1.5">
                        <span className="font-bold">Tiết:</span>
                        <input
                          type="text"
                          value={generatedPlan.header.tietSo || ''}
                          onChange={(e) => updateHeaderField('tietSo', e.target.value)}
                          className="w-24 px-2 py-0.5 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                        <span className="font-bold">Môn:</span>
                        <input
                          type="text"
                          value={generatedPlan.header.monHoc}
                          onChange={(e) => updateHeaderField('monHoc', e.target.value)}
                          className="w-full font-bold px-2 py-0.5 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                        />
                      </label>
                    </div>
                    <label className="flex items-center gap-1.5 text-base">
                      <span className="font-bold">Bài:</span>
                      <input
                        type="text"
                        value={generatedPlan.header.tenBaiHoc}
                        onChange={(e) => updateHeaderField('tenBaiHoc', e.target.value)}
                        className="w-full font-extrabold px-2 py-0.5 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="space-y-2 border-b border-slate-200 pb-4">
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="font-bold shrink-0">Môn học:</span>
                      <input
                        type="text"
                        value={generatedPlan.header.monHoc}
                        onChange={(e) => updateHeaderField('monHoc', e.target.value)}
                        className="w-full font-bold px-2 py-0.5 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                    <input
                      type="text"
                      value={generatedPlan.header.tenBaiHoc}
                      onChange={(e) => updateHeaderField('tenBaiHoc', e.target.value)}
                      className="w-full text-center text-base sm:text-lg font-extrabold uppercase px-2 py-1 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                    />
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-bold shrink-0">Ngày dạy/lớp:</span>
                      <input
                        type="text"
                        value={generatedPlan.header.ngayDayLop}
                        onChange={(e) => updateHeaderField('ngayDayLop', e.target.value)}
                        className="flex-1 min-w-[220px] italic px-2 py-0.5 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* I. YÊU CẦU CẦN ĐẠT */}
                <section className="space-y-3">
                  <h3 className="text-sm font-extrabold uppercase text-slate-900">
                    I. YÊU CẦU CẦN ĐẠT:
                  </h3>

                  <div className="space-y-1 pl-2">
                    <div className="text-sm font-bold text-slate-900">1. Kiến thức, kĩ năng:</div>
                    <textarea
                      rows={calcLineRows(generatedPlan.yeuCauCanDat.kienThucKiNang, 2)}
                      value={arrayToLines(generatedPlan.yeuCauCanDat.kienThucKiNang)}
                      onChange={(e) => updateYccdLines('kienThucKiNang', e.target.value)}
                      className="w-full text-sm leading-relaxed px-2.5 py-1.5 rounded-lg border border-transparent hover:border-slate-300 focus:border-teal-600 focus:bg-slate-50/50 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-2 pl-2">
                    <div className="text-sm font-bold text-slate-900">2. Năng lực, phẩm chất:</div>

                    <div className="pl-3 space-y-1">
                      <div className="text-sm font-bold italic text-slate-800">
                        a) Góp phần hình thành và phát triển các năng lực:
                      </div>
                      <label className="block text-[11px] font-semibold text-teal-800">
                        Năng lực đặc thù & Năng lực số (mỗi dòng 1 ý):
                      </label>
                      <textarea
                        rows={calcLineRows(generatedPlan.yeuCauCanDat.nangLucDacThu, 2)}
                        value={arrayToLines(
                          generatedPlan.yeuCauCanDat.nangLucDacThu?.length
                            ? generatedPlan.yeuCauCanDat.nangLucDacThu
                            : generatedPlan.yeuCauCanDat.nangLuc
                        )}
                        onChange={(e) => updateYccdLines('nangLucDacThu', e.target.value)}
                        className="w-full text-sm leading-relaxed px-2.5 py-1.5 rounded-lg border border-transparent hover:border-slate-300 focus:border-teal-600 focus:bg-slate-50/50 focus:outline-none"
                      />
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Năng lực chung:
                      </label>
                      <textarea
                        rows={calcLineRows(generatedPlan.yeuCauCanDat.nangLucChung, 3)}
                        value={arrayToLines(generatedPlan.yeuCauCanDat.nangLucChung)}
                        onChange={(e) => updateYccdLines('nangLucChung', e.target.value)}
                        className="w-full text-sm leading-relaxed px-2.5 py-1.5 rounded-lg border border-transparent hover:border-slate-300 focus:border-teal-600 focus:bg-slate-50/50 focus:outline-none"
                      />
                    </div>

                    <div className="pl-3 space-y-1">
                      <div className="text-sm font-bold italic text-slate-800">
                        b) Góp phần hình thành và phát triển các phẩm chất chủ yếu:
                      </div>
                      <textarea
                        rows={calcLineRows(generatedPlan.yeuCauCanDat.phamChat, 2)}
                        value={arrayToLines(generatedPlan.yeuCauCanDat.phamChat)}
                        onChange={(e) => updateYccdLines('phamChat', e.target.value)}
                        className="w-full text-sm leading-relaxed px-2.5 py-1.5 rounded-lg border border-transparent hover:border-slate-300 focus:border-teal-600 focus:bg-slate-50/50 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 pl-2">
                    <div className="text-sm font-bold text-slate-900">
                      3. Giáo dục tích hợp/lồng ghép (nếu có):
                    </div>
                    <textarea
                      rows={calcLineRows(generatedPlan.yeuCauCanDat.giaoDucTichHop, 2)}
                      value={arrayToLines(generatedPlan.yeuCauCanDat.giaoDucTichHop)}
                      onChange={(e) => updateYccdLines('giaoDucTichHop', e.target.value)}
                      className="w-full text-sm leading-relaxed px-2.5 py-1.5 rounded-lg border border-transparent hover:border-slate-300 focus:border-teal-600 focus:bg-slate-50/50 focus:outline-none"
                    />
                  </div>
                </section>

                {/* II. ĐỒ DÙNG DẠY HỌC */}
                <section className="space-y-2">
                  <h3 className="text-sm font-extrabold uppercase text-slate-900">
                    II. ĐỒ DÙNG DẠY HỌC:
                  </h3>
                  <div className="pl-2 space-y-1.5 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="font-bold shrink-0 pt-1">1. Giáo viên:</span>
                      <textarea
                        rows={2}
                        value={generatedPlan.doDungDayHoc.giaoVien.join('; ')}
                        onChange={(e) => updateDoDung('giaoVien', e.target.value)}
                        className="w-full px-2 py-1 rounded-lg border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold shrink-0 pt-1">2. Học sinh:</span>
                      <textarea
                        rows={2}
                        value={generatedPlan.doDungDayHoc.hocSinh.join('; ')}
                        onChange={(e) => updateDoDung('hocSinh', e.target.value)}
                        className="w-full px-2 py-1 rounded-lg border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                  </div>
                </section>

                {/* III. HOẠT ĐỘNG DẠY HỌC (BẢNG 2 CỘT GV / HS) */}
                <section className="space-y-2.5">
                  <h3 className="text-sm font-extrabold uppercase text-slate-900">
                    III. HOẠT ĐỘNG DẠY HỌC:
                  </h3>

                  <div className="border border-slate-400 rounded-lg overflow-hidden text-sm">
                    {/* Header 2 cột */}
                    <div className="grid grid-cols-1 md:grid-cols-2 bg-slate-200 border-b border-slate-400 font-bold text-center">
                      <div className="p-2.5 md:border-r border-slate-400">
                        Hoạt động của giáo viên
                      </div>
                      <div className="p-2.5">Hoạt động của học sinh</div>
                    </div>

                    {/* 1. Khởi động */}
                    <div className="bg-slate-100 border-b border-slate-300 p-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-2 font-bold">
                        <span>
                          1. Khởi động ({generatedPlan.hoatDongDayHoc.khoiDong.thoiGianPhut} phút)
                        </span>
                        <label className="text-xs font-semibold flex items-center gap-1">
                          Phút:
                          <input
                            type="number"
                            min={1}
                            max={15}
                            value={generatedPlan.hoatDongDayHoc.khoiDong.thoiGianPhut}
                            onChange={(e) => updateKhoiDongField('thoiGianPhut', e.target.value)}
                            className="w-12 px-1.5 py-0.5 rounded border border-slate-300 bg-white text-center"
                          />
                        </label>
                      </div>
                      <input
                        type="text"
                        value={generatedPlan.hoatDongDayHoc.khoiDong.hinhThucToChuc}
                        onChange={(e) => updateKhoiDongField('hinhThucToChuc', e.target.value)}
                        className="w-full italic text-xs text-slate-700 bg-transparent px-1.5 py-0.5 rounded border border-transparent hover:border-slate-300 focus:bg-white focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                    <div className="bg-slate-50 border-b border-slate-300 px-2.5 py-1.5">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-bold text-teal-900 shrink-0">
                          Nội dung lồng ghép, tích hợp:
                        </span>
                        <input
                          type="text"
                          value={generatedPlan.hoatDongDayHoc.khoiDong.noiDungTichHopLongGhep || ''}
                          onChange={(e) =>
                            updateKhoiDongField('noiDungTichHopLongGhep', e.target.value)
                          }
                          placeholder="(Không có — bấm để thêm nội dung tích hợp nếu lồng ghép tại đây)"
                          className="w-full font-bold text-slate-800 bg-transparent px-1.5 py-0.5 rounded border border-transparent hover:border-slate-300 focus:bg-white focus:border-teal-600 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 border-b border-slate-400">
                      <div className="p-2 md:border-r border-slate-300">
                        <textarea
                          rows={calcLineRows(generatedPlan.hoatDongDayHoc.khoiDong.hoatDongGV, 3)}
                          value={arrayToLines(generatedPlan.hoatDongDayHoc.khoiDong.hoatDongGV)}
                          onChange={(e) => updateKhoiDongField('hoatDongGV', e.target.value)}
                          className="w-full text-[13px] leading-relaxed px-1.5 py-1 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                        />
                      </div>
                      <div className="p-2">
                        <textarea
                          rows={calcLineRows(generatedPlan.hoatDongDayHoc.khoiDong.hoatDongHS, 3)}
                          value={arrayToLines(generatedPlan.hoatDongDayHoc.khoiDong.hoatDongHS)}
                          onChange={(e) => updateKhoiDongField('hoatDongHS', e.target.value)}
                          className="w-full text-[13px] leading-relaxed px-1.5 py-1 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* 2. Khám phá */}
                    <div className="bg-slate-200 border-b border-slate-400 px-2.5 py-2 font-bold">
                      2. Khám phá (
                      {generatedPlan.hoatDongDayHoc.khamPha.reduce(
                        (s, item) => s + (item.thoiGianPhut || 0),
                        0
                      )}{' '}
                      phút)
                    </div>
                    {generatedPlan.hoatDongDayHoc.khamPha.map((step, idx) => (
                      <div key={`kp-${idx}`} className="border-b border-slate-400">
                        <div className="bg-slate-100 border-b border-slate-300 p-2.5 space-y-1">
                          <div className="flex items-center justify-between gap-2 font-bold">
                            <div className="flex items-center gap-1.5 flex-1">
                              <span className="shrink-0">Hoạt động {idx + 1}:</span>
                              <input
                                type="text"
                                value={step.tenHoatDong}
                                onChange={(e) =>
                                  updateActivityStep('khamPha', idx, 'tenHoatDong', e.target.value)
                                }
                                className="w-full font-bold bg-transparent px-1.5 py-0.5 rounded border border-transparent hover:border-slate-300 focus:bg-white focus:border-teal-600 focus:outline-none"
                              />
                            </div>
                            <label className="text-xs font-semibold flex items-center gap-1 shrink-0">
                              Phút:
                              <input
                                type="number"
                                min={1}
                                max={20}
                                value={step.thoiGianPhut || 7}
                                onChange={(e) =>
                                  updateActivityStep('khamPha', idx, 'thoiGianPhut', e.target.value)
                                }
                                className="w-12 px-1.5 py-0.5 rounded border border-slate-300 bg-white text-center"
                              />
                            </label>
                          </div>
                          <input
                            type="text"
                            value={step.hinhThucVaDanhGia}
                            onChange={(e) =>
                              updateActivityStep(
                                'khamPha',
                                idx,
                                'hinhThucVaDanhGia',
                                e.target.value
                              )
                            }
                            className="w-full italic text-xs text-slate-700 bg-transparent px-1.5 py-0.5 rounded border border-transparent hover:border-slate-300 focus:bg-white focus:border-teal-600 focus:outline-none"
                          />
                        </div>
                        <div className="bg-slate-50 border-b border-slate-300 px-2.5 py-1.5">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-bold text-teal-900 shrink-0">
                              Nội dung lồng ghép, tích hợp:
                            </span>
                            <input
                              type="text"
                              value={step.noiDungTichHopLongGhep || ''}
                              onChange={(e) =>
                                updateActivityStep(
                                  'khamPha',
                                  idx,
                                  'noiDungTichHopLongGhep',
                                  e.target.value
                                )
                              }
                              placeholder="(Không có — bấm để thêm nếu lồng ghép tại hoạt động này)"
                              className="w-full font-bold text-slate-800 bg-transparent px-1.5 py-0.5 rounded border border-transparent hover:border-slate-300 focus:bg-white focus:border-teal-600 focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2">
                          <div className="p-2 md:border-r border-slate-300">
                            <textarea
                              rows={calcLineRows(step.hoatDongGV, 3)}
                              value={arrayToLines(step.hoatDongGV)}
                              onChange={(e) =>
                                updateActivityStep('khamPha', idx, 'hoatDongGV', e.target.value)
                              }
                              className="w-full text-[13px] leading-relaxed px-1.5 py-1 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                            />
                          </div>
                          <div className="p-2">
                            <textarea
                              rows={calcLineRows(step.hoatDongHS, 3)}
                              value={arrayToLines(step.hoatDongHS)}
                              onChange={(e) =>
                                updateActivityStep('khamPha', idx, 'hoatDongHS', e.target.value)
                              }
                              className="w-full text-[13px] leading-relaxed px-1.5 py-1 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* 3. Luyện tập */}
                    <div className="bg-slate-200 border-b border-slate-400 px-2.5 py-2 font-bold">
                      3. Luyện tập (
                      {generatedPlan.hoatDongDayHoc.luyenTap.reduce(
                        (s, item) => s + (item.thoiGianPhut || 0),
                        0
                      )}{' '}
                      phút)
                    </div>
                    {generatedPlan.hoatDongDayHoc.luyenTap.map((step, idx) => (
                      <div key={`lt-${idx}`} className="border-b border-slate-400">
                        <div className="bg-slate-100 border-b border-slate-300 p-2.5 space-y-1">
                          <div className="flex items-center justify-between gap-2 font-bold">
                            <div className="flex items-center gap-1.5 flex-1">
                              <span className="shrink-0">Hoạt động {idx + 1}:</span>
                              <input
                                type="text"
                                value={step.tenHoatDong}
                                onChange={(e) =>
                                  updateActivityStep('luyenTap', idx, 'tenHoatDong', e.target.value)
                                }
                                className="w-full font-bold bg-transparent px-1.5 py-0.5 rounded border border-transparent hover:border-slate-300 focus:bg-white focus:border-teal-600 focus:outline-none"
                              />
                            </div>
                            <label className="text-xs font-semibold flex items-center gap-1 shrink-0">
                              Phút:
                              <input
                                type="number"
                                min={1}
                                max={20}
                                value={step.thoiGianPhut || 5}
                                onChange={(e) =>
                                  updateActivityStep(
                                    'luyenTap',
                                    idx,
                                    'thoiGianPhut',
                                    e.target.value
                                  )
                                }
                                className="w-12 px-1.5 py-0.5 rounded border border-slate-300 bg-white text-center"
                              />
                            </label>
                          </div>
                          <input
                            type="text"
                            value={step.hinhThucVaDanhGia}
                            onChange={(e) =>
                              updateActivityStep(
                                'luyenTap',
                                idx,
                                'hinhThucVaDanhGia',
                                e.target.value
                              )
                            }
                            className="w-full italic text-xs text-slate-700 bg-transparent px-1.5 py-0.5 rounded border border-transparent hover:border-slate-300 focus:bg-white focus:border-teal-600 focus:outline-none"
                          />
                        </div>
                        <div className="bg-slate-50 border-b border-slate-300 px-2.5 py-1.5">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-bold text-teal-900 shrink-0">
                              Nội dung lồng ghép, tích hợp:
                            </span>
                            <input
                              type="text"
                              value={step.noiDungTichHopLongGhep || ''}
                              onChange={(e) =>
                                updateActivityStep(
                                  'luyenTap',
                                  idx,
                                  'noiDungTichHopLongGhep',
                                  e.target.value
                                )
                              }
                              placeholder="(Không có — bấm để thêm nếu lồng ghép tại hoạt động này)"
                              className="w-full font-bold text-slate-800 bg-transparent px-1.5 py-0.5 rounded border border-transparent hover:border-slate-300 focus:bg-white focus:border-teal-600 focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2">
                          <div className="p-2 md:border-r border-slate-300">
                            <textarea
                              rows={calcLineRows(step.hoatDongGV, 3)}
                              value={arrayToLines(step.hoatDongGV)}
                              onChange={(e) =>
                                updateActivityStep('luyenTap', idx, 'hoatDongGV', e.target.value)
                              }
                              className="w-full text-[13px] leading-relaxed px-1.5 py-1 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                            />
                          </div>
                          <div className="p-2">
                            <textarea
                              rows={calcLineRows(step.hoatDongHS, 3)}
                              value={arrayToLines(step.hoatDongHS)}
                              onChange={(e) =>
                                updateActivityStep('luyenTap', idx, 'hoatDongHS', e.target.value)
                              }
                              className="w-full text-[13px] leading-relaxed px-1.5 py-1 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* 4. Vận dụng */}
                    <div className="bg-slate-100 border-b border-slate-300 p-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-2 font-bold">
                        <span>
                          4. Vận dụng ({generatedPlan.hoatDongDayHoc.vanDung.thoiGianPhut} phút)
                        </span>
                        <label className="text-xs font-semibold flex items-center gap-1">
                          Phút:
                          <input
                            type="number"
                            min={1}
                            max={15}
                            value={generatedPlan.hoatDongDayHoc.vanDung.thoiGianPhut}
                            onChange={(e) => updateVanDungField('thoiGianPhut', e.target.value)}
                            className="w-12 px-1.5 py-0.5 rounded border border-slate-300 bg-white text-center"
                          />
                        </label>
                      </div>
                      <input
                        type="text"
                        value={generatedPlan.hoatDongDayHoc.vanDung.hinhThucVaDanhGia}
                        onChange={(e) => updateVanDungField('hinhThucVaDanhGia', e.target.value)}
                        className="w-full italic text-xs text-slate-700 bg-transparent px-1.5 py-0.5 rounded border border-transparent hover:border-slate-300 focus:bg-white focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                    <div className="bg-slate-50 border-b border-slate-300 px-2.5 py-1.5">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-bold text-teal-900 shrink-0">
                          Nội dung lồng ghép, tích hợp:
                        </span>
                        <input
                          type="text"
                          value={generatedPlan.hoatDongDayHoc.vanDung.noiDungTichHopLongGhep || ''}
                          onChange={(e) =>
                            updateVanDungField('noiDungTichHopLongGhep', e.target.value)
                          }
                          placeholder="(Không có — bấm để thêm nếu lồng ghép tại phần Vận dụng)"
                          className="w-full font-bold text-slate-800 bg-transparent px-1.5 py-0.5 rounded border border-transparent hover:border-slate-300 focus:bg-white focus:border-teal-600 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 border-b border-slate-400">
                      <div className="p-2 md:border-r border-slate-300">
                        <textarea
                          rows={calcLineRows(generatedPlan.hoatDongDayHoc.vanDung.hoatDongGV, 3)}
                          value={arrayToLines(generatedPlan.hoatDongDayHoc.vanDung.hoatDongGV)}
                          onChange={(e) => updateVanDungField('hoatDongGV', e.target.value)}
                          className="w-full text-[13px] leading-relaxed px-1.5 py-1 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                        />
                      </div>
                      <div className="p-2">
                        <textarea
                          rows={calcLineRows(generatedPlan.hoatDongDayHoc.vanDung.hoatDongHS, 3)}
                          value={arrayToLines(generatedPlan.hoatDongDayHoc.vanDung.hoatDongHS)}
                          onChange={(e) => updateVanDungField('hoatDongHS', e.target.value)}
                          className="w-full text-[13px] leading-relaxed px-1.5 py-1 rounded border border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Lưu ý HSKT cuối mục III */}
                    <div className="bg-amber-50/60 p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold italic text-slate-900">
                        <UserCheck className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>
                          Lưu ý: Nếu lớp có HS khuyết tật học hoà nhập (điều chỉnh hoạt động phù hợp):
                        </span>
                      </div>
                      <textarea
                        rows={Math.max(
                          2,
                          (generatedPlan.hoatDongDayHoc.luuYHSKT || '').split('\n').length + 1
                        )}
                        value={generatedPlan.hoatDongDayHoc.luuYHSKT}
                        onChange={(e) =>
                          setGeneratedPlan((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  hoatDongDayHoc: {
                                    ...prev.hoatDongDayHoc,
                                    luuYHSKT: e.target.value,
                                  },
                                }
                              : prev
                          )
                        }
                        className="w-full text-[13px] leading-relaxed bg-white/80 px-2.5 py-1.5 rounded-lg border border-amber-200 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </section>

                {/* IV. ĐIỀU CHỈNH SAU BÀI DẠY */}
                <section className="space-y-1.5 pt-2">
                  <h3 className="text-sm font-extrabold uppercase text-slate-900">
                    IV. ĐIỀU CHỈNH SAU BÀI DẠY:
                  </h3>
                  <textarea
                    rows={2}
                    value={generatedPlan.dieuChinhSauBaiDay}
                    onChange={(e) =>
                      setGeneratedPlan((prev) =>
                        prev ? { ...prev, dieuChinhSauBaiDay: e.target.value } : prev
                      )
                    }
                    className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                  />
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
