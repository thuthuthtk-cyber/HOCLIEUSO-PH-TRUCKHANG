import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FileSpreadsheet,
  HelpCircle,
  Layers,
  ListTree,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
  Table,
  X,
} from 'lucide-react';
import {
  EXAM_DURATIONS,
  EXAM_GRADE_LEVELS,
  EXAM_PERIODS,
  PRIMARY_EXAM_SUBJECTS,
  type ExamConfig,
  type ExamDurationMinutes,
  type ExamGradeLevel,
  type ExamPeriod,
  type ExamQuestion,
  type ExamRecord,
  type GeneratedExamPackage,
  type MatrixRow,
  type SpecificationRow,
} from '../../types/exam';
import { STATUS_LABELS, type LearningMaterial, type UserProfile } from '../../types/hocLieu';
import {
  calculateMatrixTotals,
  canOverwriteLibraryMaterial,
  findExistingLibraryMaterialByTitle,
  generateExamPackageWithAI,
  generateNewExamId,
  saveExamToFirestore,
  shareExamToLibrary,
} from '../../services/aiExamGeneratorService';
import { exportExamToWord } from '../../utils/examWordExport';
import { useToast } from '../ToastContext';
import { buildStudentGameUrl, copyTextToClipboard } from '../../utils/shareCode';

interface ExamGeneratorWorkspaceProps {
  profile: UserProfile;
  onSavedNavigate?: (target: 'library' | 'myMaterials') => void;
}

export function ExamGeneratorWorkspace({ profile, onSavedNavigate }: ExamGeneratorWorkspaceProps) {
  const { showToast, showFirebaseAlert } = useToast();

  const [monHoc, setMonHoc] = useState<string>('Toán');
  const [khoiLop, setKhoiLop] = useState<ExamGradeLevel>('3');
  const [thoiDiemKiemTra, setThoiDiemKiemTra] = useState<ExamPeriod>('Cuối học kì I');
  const [thoiGianLamBai, setThoiGianLamBai] = useState<ExamDurationMinutes>(40);
  const [soCauTracNghiem, setSoCauTracNghiem] = useState<number>(6);
  const [soCauTuLuan, setSoCauTuLuan] = useState<number>(4);
  const [cacDangTracNghiem, setCacDangTracNghiem] = useState<string[]>([
    'Khoanh tròn chữ cái (A, B, C, D)',
    'Điền khuyết',
    'Nối cột',
  ]);
  const [chuDeInput, setChuDeInput] = useState<string>(
    '1. Ôn tập số và phép tính trong phạm vi 1000\n2. Hình học và đo lường\n3. Giải toán có lời văn'
  );

  const [muc1, setMuc1] = useState<number>(40);
  const [muc2, setMuc2] = useState<number>(40);
  const [muc3, setMuc3] = useState<number>(20);

  const [boSach, setBoSach] = useState<string>('Kết nối tri thức với cuộc sống');
  const [yeuCauBoSung, setYeuCauBoSung] = useState<string>('');

  const [generating, setGenerating] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isShared, setIsShared] = useState<boolean>(false);
  const [exportingWord, setExportingWord] = useState<boolean>(false);

  const [generatedPackage, setGeneratedPackage] = useState<GeneratedExamPackage | null>(null);
  const [activeTab, setActiveTab] = useState<'matrix' | 'specification' | 'paper' | 'answers'>('matrix');

  const [currentExamId, setCurrentExamId] = useState<string>(() => generateNewExamId());
  const [savedExamId, setSavedExamId] = useState<string | null>(null);
  const [savedMaterialId, setSavedMaterialId] = useState<string | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    existing: LearningMaterial;
    shareToLibrary: boolean;
  } | null>(null);

  const savingLockRef = useRef<boolean>(false);

  // Edit question modal state
  const [editingQuestion, setEditingQuestion] = useState<ExamQuestion | null>(null);

  const ratioSum = muc1 + muc2 + muc3;

  function handleRatioChange(m1: number, m2: number, m3: number) {
    setMuc1(m1);
    setMuc2(m2);
    setMuc3(m3);
  }

  async function handleGenerate() {
    if (ratioSum !== 100) {
      showToast('Tổng tỷ lệ 3 mức độ nhận thức phải bằng đúng 100%.', 'error');
      return;
    }

    const chuDeList = chuDeInput
      .split('\n')
      .map((s) => s.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(Boolean);

    if (chuDeList.length === 0) {
      showToast('Vui lòng nhập ít nhất một mạch kiến thức hoặc chủ đề.', 'error');
      return;
    }

    const config: ExamConfig = {
      monHoc,
      khoiLop,
      thoiDiemKiemTra,
      thoiGianLamBai,
      soCauTracNghiem,
      soCauTuLuan,
      cacDangTracNghiem,
      chuDeKienThuc: chuDeList,
      tyLeMucDo: {
        muc1_NhanBiet: muc1,
        muc2_KetNoi: muc2,
        muc3_VanDung: muc3,
      },
      boSach,
      yeuCauBoSung: yeuCauBoSung.trim() || undefined,
    };

    setGenerating(true);
    setCurrentExamId(generateNewExamId());
    setIsSaved(false);
    setIsShared(false);
    setSavedExamId(null);
    setSavedMaterialId(null);
    setDuplicatePrompt(null);

    try {
      const res = await generateExamPackageWithAI(config);
      setGeneratedPackage(res);
      setActiveTab('matrix');
      showToast('Đã sinh thành công Ma trận, Bản đặc tả và Đề kiểm tra chuẩn GDPT 2018!', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(msg, 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function handleExportWord() {
    if (!generatedPackage) return;
    setExportingWord(true);
    try {
      const chuDeList = chuDeInput.split('\n').map((s) => s.trim()).filter(Boolean);
      const config: ExamConfig = {
        monHoc,
        khoiLop,
        thoiDiemKiemTra,
        thoiGianLamBai,
        soCauTracNghiem,
        soCauTuLuan,
        cacDangTracNghiem,
        chuDeKienThuc: chuDeList,
        tyLeMucDo: { muc1_NhanBiet: muc1, muc2_KetNoi: muc2, muc3_VanDung: muc3 },
      };
      await exportExamToWord({
        tieuDe: generatedPackage.tieuDeDeThi,
        config,
        maTran: generatedPackage.maTran,
        banDacTa: generatedPackage.banDacTa,
        deKiemTra: generatedPackage.deKiemTra,
      });
      showToast('Đã tải xuống tệp Word (.docx) hồ sơ đề thi thành công.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Không thể xuất file Word: ${msg}`, 'error');
    } finally {
      setExportingWord(false);
    }
  }

  function buildCurrentConfig(): ExamConfig {
    const chuDeList = chuDeInput.split('\n').map((s) => s.trim()).filter(Boolean);
    return {
      monHoc,
      khoiLop,
      thoiDiemKiemTra,
      thoiGianLamBai,
      soCauTracNghiem,
      soCauTuLuan,
      cacDangTracNghiem,
      chuDeKienThuc: chuDeList,
      tyLeMucDo: { muc1_NhanBiet: muc1, muc2_KetNoi: muc2, muc3_VanDung: muc3 },
      boSach: boSach.trim() || undefined,
      yeuCauBoSung: yeuCauBoSung.trim() || undefined,
    };
  }

  async function executeSaveExam(
    shareToLibrary: boolean,
    options?: { overwriteMaterialId?: string; forceNew?: boolean }
  ) {
    if (!generatedPackage || savingLockRef.current) return;

    savingLockRef.current = true;
    setIsSaving(true);
    const config = buildCurrentConfig();

    try {
      const examId = await saveExamToFirestore(
        profile,
        {
          tieuDe: generatedPackage.tieuDeDeThi,
          config,
          maTran: generatedPackage.maTran,
          banDacTa: generatedPackage.banDacTa,
          deKiemTra: generatedPackage.deKiemTra,
          tongDiem: generatedPackage.tongDiem,
          toKhoi: profile.toKhoi || `Khối ${khoiLop}`,
          chiaSeKho: shareToLibrary || isShared,
          trangThai: shareToLibrary || isShared ? 'chiaSeKho' : 'daLuu',
          materialId: savedMaterialId || options?.overwriteMaterialId || '',
        },
        currentExamId
      );
      setSavedExamId(examId);
      setIsSaved(true);

      if (shareToLibrary) {
        const examRecord: ExamRecord = {
          id: examId,
          tieuDe: generatedPackage.tieuDeDeThi,
          config,
          maTran: generatedPackage.maTran,
          banDacTa: generatedPackage.banDacTa,
          deKiemTra: generatedPackage.deKiemTra,
          tongDiem: generatedPackage.tongDiem,
          nguoiTaoUid: profile.uid,
          nguoiTaoTen: profile.hoTen,
          toKhoi: profile.toKhoi || `Khối ${khoiLop}`,
          chiaSeKho: true,
          trangThai: 'chiaSeKho',
          materialId: savedMaterialId || undefined,
          ngayTao: null,
          ngayCapNhat: null,
        };
        const matId = await shareExamToLibrary(profile, examRecord, {
          targetStatus: 'choDuyet',
          overwriteMaterialId: options?.overwriteMaterialId ?? savedMaterialId ?? undefined,
          forceNew: options?.forceNew,
        });
        setSavedMaterialId(matId);
        setIsShared(true);
        showFirebaseAlert(
          true,
          options?.overwriteMaterialId
            ? 'Đã ghi đè và cập nhật đề kiểm tra trong Kho học liệu thành công.'
            : 'Đã lưu và chia sẻ đề kiểm tra lên Kho học liệu (gửi Tổ trưởng duyệt).'
        );
      } else {
        showFirebaseAlert(true, 'Đã lưu hồ sơ đề kiểm tra vào hệ thống thành công.');
      }
    } catch (err) {
      showFirebaseAlert(false, err);
    } finally {
      savingLockRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleSaveExam(shareToLibrary = false) {
    if (!generatedPackage || savingLockRef.current || isSaving) return;
    if (!shareToLibrary && isSaved) return;
    if (shareToLibrary && isShared) return;

    if (shareToLibrary && !savedMaterialId) {
      savingLockRef.current = true;
      setIsSaving(true);
      try {
        const existing = await findExistingLibraryMaterialByTitle(
          profile.uid,
          generatedPackage.tieuDeDeThi
        );
        if (existing) {
          savingLockRef.current = false;
          setIsSaving(false);
          setDuplicatePrompt({ existing, shareToLibrary });
          return;
        }
      } catch (err) {
        savingLockRef.current = false;
        setIsSaving(false);
        showFirebaseAlert(false, err);
        return;
      }
      savingLockRef.current = false;
      setIsSaving(false);
    }

    await executeSaveExam(shareToLibrary);
  }

  function handleUpdateQuestion(updated: ExamQuestion) {
    if (!generatedPackage) return;
    const nextDeKiemTra = generatedPackage.deKiemTra.map((q) =>
      q.soThuTu === updated.soThuTu ? updated : q
    );
    setGeneratedPackage({
      ...generatedPackage,
      deKiemTra: nextDeKiemTra,
    });
    setEditingQuestion(null);
    showToast(`Đã cập nhật câu hỏi số ${updated.soThuTu}.`, 'success');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <ListTree className="w-7 h-7 text-teal-700 shrink-0" />
            Tạo Đề Kiểm Tra Bằng AI (Ma trận &amp; Bản đặc tả)
          </h1>
          <p className="mt-1 text-[15px] text-slate-600">
            Thiết kế đề kiểm tra định kì chuẩn Chương trình GDPT 2018 và Thông tư 27/2020/TT-BGDĐT cho trường Tiểu học.
          </p>
        </div>

        {generatedPackage && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={exportingWord}
              onClick={handleExportWord}
              className="min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-teal-300 bg-teal-50 text-teal-900 text-sm font-bold hover:bg-teal-100 transition-colors"
            >
              <Download className="w-4 h-4" />
              {exportingWord ? 'Đang xuất Word...' : 'Tải file Word (.docx)'}
            </button>
            <button
              type="button"
              disabled={isSaving || isSaved}
              onClick={() => handleSaveExam(false)}
              className={`min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors disabled:cursor-not-allowed ${
                isSaved
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50 disabled:opacity-60'
              }`}
            >
              {isSaved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {isSaving ? 'Đang lưu...' : isSaved ? 'Đã lưu' : 'Lưu vào hệ thống'}
            </button>
            <button
              type="button"
              disabled={isSaving || isShared}
              onClick={() => handleSaveExam(true)}
              className={`min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:cursor-not-allowed ${
                isShared
                  ? 'bg-emerald-600 text-white opacity-90'
                  : 'bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-60'
              }`}
            >
              {isShared ? <CheckCircle2 className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
              {isSaving ? 'Đang lưu...' : isShared ? 'Đã lưu vào Kho' : 'Chia sẻ lên Kho học liệu'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Cột trái: Cấu hình đề kiểm tra */}
        <div className="xl:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Layers className="w-5 h-5 text-teal-700" />
            Thiết lập cấu hình đề kiểm tra
          </h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="exam-subject" className="block text-sm font-semibold text-slate-800 mb-1">
                Môn học <span className="text-rose-600">*</span>
              </label>
              <select
                id="exam-subject"
                value={monHoc}
                onChange={(e) => setMonHoc(e.target.value)}
                disabled={generating}
                className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-[15px] text-slate-900 focus:outline-none focus:border-teal-700"
              >
                {PRIMARY_EXAM_SUBJECTS.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="exam-grade" className="block text-sm font-semibold text-slate-800 mb-1">
                  Khối lớp <span className="text-rose-600">*</span>
                </label>
                <select
                  id="exam-grade"
                  value={khoiLop}
                  onChange={(e) => setKhoiLop(e.target.value as ExamGradeLevel)}
                  disabled={generating}
                  className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-[15px] text-slate-900 focus:outline-none focus:border-teal-700"
                >
                  {EXAM_GRADE_LEVELS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="exam-duration" className="block text-sm font-semibold text-slate-800 mb-1">
                  Thời gian làm bài <span className="text-rose-600">*</span>
                </label>
                <select
                  id="exam-duration"
                  value={thoiGianLamBai}
                  onChange={(e) => setThoiGianLamBai(Number(e.target.value) as ExamDurationMinutes)}
                  disabled={generating}
                  className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-[15px] text-slate-900 focus:outline-none focus:border-teal-700"
                >
                  {EXAM_DURATIONS.map((dur) => (
                    <option key={dur} value={dur}>
                      {dur} phút
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="exam-period" className="block text-sm font-semibold text-slate-800 mb-1">
                Kỳ / Thời điểm kiểm tra <span className="text-rose-600">*</span>
              </label>
              <select
                id="exam-period"
                value={thoiDiemKiemTra}
                onChange={(e) => setThoiDiemKiemTra(e.target.value as ExamPeriod)}
                disabled={generating}
                className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-[15px] text-slate-900 focus:outline-none focus:border-teal-700"
              >
                {EXAM_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="exam-book" className="block text-sm font-semibold text-slate-800 mb-1">
                Bộ sách giáo khoa
              </label>
              <input
                id="exam-book"
                type="text"
                value={boSach}
                onChange={(e) => setBoSach(e.target.value)}
                placeholder="Ví dụ: Kết nối tri thức, Cánh diều..."
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-teal-700"
              />
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">
                  Cấu trúc số câu hỏi
                </span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-teal-100 text-teal-800">
                  Tổng: {soCauTracNghiem + soCauTuLuan} câu
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Số câu Trắc nghiệm
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={soCauTracNghiem}
                    onChange={(e) => setSoCauTracNghiem(Math.max(1, Number(e.target.value)))}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 text-sm font-bold text-center text-slate-900 bg-white focus:outline-none focus:border-teal-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Số câu Tự luận
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={soCauTuLuan}
                    onChange={(e) => setSoCauTuLuan(Math.max(0, Number(e.target.value)))}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 text-sm font-bold text-center text-slate-900 bg-white focus:outline-none focus:border-teal-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Dạng câu hỏi Trắc nghiệm (Chọn nhiều)
                </label>
                <div className="space-y-1.5">
                  {[
                    'Khoanh tròn chữ cái (A, B, C, D)',
                    'Điền khuyết',
                    'Nối cột',
                    'Đúng / Sai',
                  ].map((dtype) => {
                    const checked = cacDangTracNghiem.includes(dtype);
                    return (
                      <label key={dtype} className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCacDangTracNghiem([...cacDangTracNghiem, dtype]);
                            } else {
                              if (cacDangTracNghiem.length > 1) {
                                setCacDangTracNghiem(cacDangTracNghiem.filter((d) => d !== dtype));
                              } else {
                                showToast('Phải chọn ít nhất 1 dạng trắc nghiệm.', 'error');
                              }
                            }
                          }}
                          className="w-4 h-4 rounded text-teal-700 focus:ring-teal-600"
                        />
                        <span>{dtype}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="exam-topics" className="block text-sm font-semibold text-slate-800">
                  Các mạch kiến thức / chủ đề <span className="text-rose-600">*</span>
                </label>
                <span className="text-xs text-slate-500">Mỗi dòng 1 chủ đề</span>
              </div>
              <textarea
                id="exam-topics"
                rows={4}
                value={chuDeInput}
                onChange={(e) => setChuDeInput(e.target.value)}
                placeholder="Nhập các mạch kiến thức trọng tâm..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-teal-700"
              />
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">
                  Tỷ lệ điểm 3 mức độ (Thông tư 27)
                </span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                    ratioSum === 100 ? 'bg-teal-100 text-teal-800' : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  Tổng: {ratioSum}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <label htmlFor="ratio-m1" className="block font-semibold text-slate-700 mb-1">
                    Mức 1 (%)
                  </label>
                  <input
                    id="ratio-m1"
                    type="number"
                    min={0}
                    max={100}
                    value={muc1}
                    onChange={(e) => handleRatioChange(Number(e.target.value), muc2, muc3)}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white text-center font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="ratio-m2" className="block font-semibold text-slate-700 mb-1">
                    Mức 2 (%)
                  </label>
                  <input
                    id="ratio-m2"
                    type="number"
                    min={0}
                    max={100}
                    value={muc2}
                    onChange={(e) => handleRatioChange(muc1, Number(e.target.value), muc3)}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white text-center font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="ratio-m3" className="block font-semibold text-slate-700 mb-1">
                    Mức 3 (%)
                  </label>
                  <input
                    id="ratio-m3"
                    type="number"
                    min={0}
                    max={100}
                    value={muc3}
                    onChange={(e) => handleRatioChange(muc1, muc2, Number(e.target.value))}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white text-center font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleRatioChange(40, 40, 20)}
                  className="flex-1 px-2 py-1 rounded bg-white border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Chuẩn 40-40-20
                </button>
                <button
                  type="button"
                  onClick={() => handleRatioChange(50, 30, 20)}
                  className="flex-1 px-2 py-1 rounded bg-white border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Chuẩn 50-30-20
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="exam-note" className="block text-sm font-semibold text-slate-800 mb-1">
                Ghi chú / Yêu cầu thêm (nếu có)
              </label>
              <input
                id="exam-note"
                type="text"
                value={yeuCauBoSung}
                onChange={(e) => setYeuCauBoSung(e.target.value)}
                placeholder="Ví dụ: Có bài toán đố thực tế ở câu cuối..."
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-teal-700"
              />
            </div>

            <button
              type="button"
              disabled={generating || ratioSum !== 100}
              onClick={handleGenerate}
              className="w-full min-h-[50px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-teal-700 text-white text-base font-bold hover:bg-teal-800 disabled:opacity-60 transition-colors shadow-sm"
            >
              {generating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  AI đang xây dựng Ma trận &amp; Đề...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Tạo Ma Trận &amp; Đề Bằng AI
                </>
              )}
            </button>
          </div>
        </div>

        {/* Cột phải: Kết quả 4 tab */}
        <div className="xl:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
          {generatedPackage ? (
            <>
              {/* Tab navigation */}
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('matrix')}
                  className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                    activeTab === 'matrix'
                      ? 'bg-teal-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Tab 1: Ma trận đề
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('specification')}
                  className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                    activeTab === 'specification'
                      ? 'bg-teal-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Tab 2: Bản đặc tả chi tiết
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('paper')}
                  className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                    activeTab === 'paper'
                      ? 'bg-teal-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Tab 3: Đề kiểm tra ({generatedPackage.deKiemTra.length} câu)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('answers')}
                  className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                    activeTab === 'answers'
                      ? 'bg-teal-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Tab 4: Đáp án &amp; Biểu điểm
                </button>
              </div>

              <div className="p-1">
                <h3 className="text-lg font-extrabold text-slate-900 mb-3">
                  {generatedPackage.tieuDeDeThi}
                </h3>

                {/* TAB 1: Ma trận đề */}
                {activeTab === 'matrix' && (
                  <div className="space-y-4 overflow-x-auto">
                    <p className="text-xs text-slate-600">
                      Bảng ma trận đề kiểm tra định kì phân bổ số câu và điểm số theo Thông tư 27/2020/TT-BGDĐT. Tổng điểm toàn bảng: <span className="font-bold text-teal-800">10,0 điểm</span>.
                    </p>
                    <table className="w-full min-w-[750px] border-collapse text-xs text-slate-800">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 text-center font-bold">
                          <th className="border border-slate-300 p-2" rowSpan={3}>TT</th>
                          <th className="border border-slate-300 p-2 text-left" rowSpan={3}>Mạch kiến thức / Chủ đề</th>
                          <th className="border border-slate-300 p-2" colSpan={4}>Mức 1 (Nhận biết)</th>
                          <th className="border border-slate-300 p-2" colSpan={4}>Mức 2 (Kết nối)</th>
                          <th className="border border-slate-300 p-2" colSpan={4}>Mức 3 (Vận dụng)</th>
                          <th className="border border-slate-300 p-2" colSpan={2} rowSpan={2}>Tổng</th>
                          <th className="border border-slate-300 p-2" rowSpan={3}>Tỷ lệ %</th>
                        </tr>
                        <tr className="bg-slate-100 text-slate-900 text-center font-bold">
                          <th className="border border-slate-300 p-1.5" colSpan={2}>TNKQ</th>
                          <th className="border border-slate-300 p-1.5" colSpan={2}>TL</th>
                          <th className="border border-slate-300 p-1.5" colSpan={2}>TNKQ</th>
                          <th className="border border-slate-300 p-1.5" colSpan={2}>TL</th>
                          <th className="border border-slate-300 p-1.5" colSpan={2}>TNKQ</th>
                          <th className="border border-slate-300 p-1.5" colSpan={2}>TL</th>
                        </tr>
                        <tr className="bg-slate-100 text-slate-900 text-center font-semibold text-[11px]">
                          <th className="border border-slate-300 p-1">Câu</th>
                          <th className="border border-slate-300 p-1">Đ</th>
                          <th className="border border-slate-300 p-1">Câu</th>
                          <th className="border border-slate-300 p-1">Đ</th>
                          <th className="border border-slate-300 p-1">Câu</th>
                          <th className="border border-slate-300 p-1">Đ</th>
                          <th className="border border-slate-300 p-1">Câu</th>
                          <th className="border border-slate-300 p-1">Đ</th>
                          <th className="border border-slate-300 p-1">Câu</th>
                          <th className="border border-slate-300 p-1">Đ</th>
                          <th className="border border-slate-300 p-1">Câu</th>
                          <th className="border border-slate-300 p-1">Đ</th>
                          <th className="border border-slate-300 p-1">Số câu</th>
                          <th className="border border-slate-300 p-1">Điểm</th>
                        </tr>
                      </thead>
                      <tbody>
                        {generatedPackage.maTran.map((row, idx) => {
                          const showC = (n: number) => (n > 0 ? n : '');
                          const showD = (n: number) => (n > 0 ? n.toFixed(1) : '');
                          return (
                            <tr key={row.id} className="hover:bg-slate-50 text-center">
                              <td className="border border-slate-300 p-2 font-medium">{idx + 1}</td>
                              <td className="border border-slate-300 p-2 text-left font-medium">{row.machKienThuc}</td>
                              <td className="border border-slate-300 p-1">{showC(row.muc1.tnSoCau)}</td>
                              <td className="border border-slate-300 p-1">{showD(row.muc1.tnDiem)}</td>
                              <td className="border border-slate-300 p-1">{showC(row.muc1.tlSoCau)}</td>
                              <td className="border border-slate-300 p-1">{showD(row.muc1.tlDiem)}</td>
                              <td className="border border-slate-300 p-1">{showC(row.muc2.tnSoCau)}</td>
                              <td className="border border-slate-300 p-1">{showD(row.muc2.tnDiem)}</td>
                              <td className="border border-slate-300 p-1">{showC(row.muc2.tlSoCau)}</td>
                              <td className="border border-slate-300 p-1">{showD(row.muc2.tlDiem)}</td>
                              <td className="border border-slate-300 p-1">{showC(row.muc3.tnSoCau)}</td>
                              <td className="border border-slate-300 p-1">{showD(row.muc3.tnDiem)}</td>
                              <td className="border border-slate-300 p-1">{showC(row.muc3.tlSoCau)}</td>
                              <td className="border border-slate-300 p-1">{showD(row.muc3.tlDiem)}</td>
                              <td className="border border-slate-300 p-2 font-bold bg-slate-50">{row.tongSoCau}</td>
                              <td className="border border-slate-300 p-2 font-bold bg-slate-50">{row.tongDiem.toFixed(1)}</td>
                              <td className="border border-slate-300 p-2 font-bold text-teal-800">{Math.round(row.tyLePhanTram)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        {(() => {
                          const t = calculateMatrixTotals(generatedPackage.maTran);
                          return (
                            <tr className="bg-teal-50/70 font-bold text-center text-teal-950">
                              <td className="border border-slate-300 p-2" colSpan={2}>Tổng cộng</td>
                              <td className="border border-slate-300 p-1">{t.muc1TnSoCau || ''}</td>
                              <td className="border border-slate-300 p-1">{t.muc1TnDiem.toFixed(1)}</td>
                              <td className="border border-slate-300 p-1">{t.muc1TlSoCau || ''}</td>
                              <td className="border border-slate-300 p-1">{t.muc1TlDiem.toFixed(1)}</td>
                              <td className="border border-slate-300 p-1">{t.muc2TnSoCau || ''}</td>
                              <td className="border border-slate-300 p-1">{t.muc2TnDiem.toFixed(1)}</td>
                              <td className="border border-slate-300 p-1">{t.muc2TlSoCau || ''}</td>
                              <td className="border border-slate-300 p-1">{t.muc2TlDiem.toFixed(1)}</td>
                              <td className="border border-slate-300 p-1">{t.muc3TnSoCau || ''}</td>
                              <td className="border border-slate-300 p-1">{t.muc3TnDiem.toFixed(1)}</td>
                              <td className="border border-slate-300 p-1">{t.muc3TlSoCau || ''}</td>
                              <td className="border border-slate-300 p-1">{t.muc3TlDiem.toFixed(1)}</td>
                              <td className="border border-slate-300 p-2">{t.tongSoCau}</td>
                              <td className="border border-slate-300 p-2">{t.tongDiem.toFixed(1)}</td>
                              <td className="border border-slate-300 p-2 text-teal-700">100%</td>
                            </tr>
                          );
                        })()}
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* TAB 2: Bản đặc tả chi tiết */}
                {activeTab === 'specification' && (
                  <div className="space-y-4 overflow-x-auto">
                    <p className="text-xs text-slate-600">
                      Bản đặc tả chi tiết yêu cầu cần đạt (YCCĐ) theo Chương trình GDPT 2018 tương ứng với từng câu hỏi.
                    </p>
                    <table className="w-full min-w-[700px] border-collapse text-xs text-slate-800">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 text-center font-bold">
                          <th className="border border-slate-300 p-2 w-12" rowSpan={2}>TT</th>
                          <th className="border border-slate-300 p-2" rowSpan={2}>Mạch kiến thức</th>
                          <th className="border border-slate-300 p-2" rowSpan={2}>Đơn vị kiến thức / Yêu cầu cần đạt</th>
                          <th className="border border-slate-300 p-2" colSpan={3}>Số câu theo mức độ</th>
                          <th className="border border-slate-300 p-2" rowSpan={2}>Mô tả chi tiết năng lực từng câu hỏi</th>
                        </tr>
                        <tr className="bg-slate-100 text-slate-900 text-center font-bold text-[11px]">
                          <th className="border border-slate-300 p-1 w-10">M1</th>
                          <th className="border border-slate-300 p-1 w-10">M2</th>
                          <th className="border border-slate-300 p-1 w-10">M3</th>
                        </tr>
                      </thead>
                      <tbody>
                        {generatedPackage.banDacTa.map((row, idx) => (
                          <tr key={row.id} className="hover:bg-slate-50 align-top">
                            <td className="border border-slate-300 p-2 text-center font-medium">{idx + 1}</td>
                            <td className="border border-slate-300 p-2 font-semibold text-slate-900">{row.machKienThuc}</td>
                            <td className="border border-slate-300 p-2 text-slate-700">{row.donViKienThuc}</td>
                            <td className="border border-slate-300 p-2 text-center font-bold">{row.muc1_SoCau || '-'}</td>
                            <td className="border border-slate-300 p-2 text-center font-bold">{row.muc2_SoCau || '-'}</td>
                            <td className="border border-slate-300 p-2 text-center font-bold">{row.muc3_SoCau || '-'}</td>
                            <td className="border border-slate-300 p-2 space-y-1">
                              {row.moTaChiTietTheoCau.map((det) => (
                                <div key={det.soThuTuCau} className="text-xs">
                                  <span className="font-bold text-teal-800">Câu {det.soThuTuCau} ({det.mucDo} - {det.hinhThuc}):</span>{' '}
                                  <span className="text-slate-700">{det.nangLucCanDat}</span>
                                </div>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* TAB 3: Đề kiểm tra chính thức */}
                {activeTab === 'paper' && (
                  <div className="space-y-6 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                          Đề kiểm tra chính thức (Mẫu in Tiểu học)
                        </h4>
                        <p className="text-xs text-slate-500">
                          Thầy/cô có thể bấm nút <span className="font-bold text-teal-800">Sửa nội dung câu</span> để chỉnh sửa trực tiếp chữ nghĩa trên câu hỏi.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-bold hover:bg-slate-100"
                      >
                        <Printer className="w-4 h-4 text-teal-700" />
                        In nhanh đề thi
                      </button>
                    </div>

                    <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-300 shadow-sm space-y-6">
                      {/* Tiêu đề trường */}
                      <div className="grid grid-cols-2 text-center text-xs font-bold text-slate-900 border-b border-slate-200 pb-4">
                        <div>
                          TRƯỜNG TIỂU HỌC QUANG HƯNG<br />
                          <span className="font-normal text-slate-600">Phân hiệu Trực Khang</span>
                        </div>
                        <div>
                          CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br />
                          <span className="font-normal text-slate-600">Độc lập - Tự do - Hạnh phúc</span>
                        </div>
                      </div>

                      <div className="text-center space-y-1 pt-2">
                        <h4 className="text-base font-extrabold text-slate-900 uppercase">
                          {generatedPackage.tieuDeDeThi}
                        </h4>
                        <p className="text-xs text-slate-600 italic">
                          Thời gian làm bài: {thoiGianLamBai} phút (không kể thời gian giao đề)
                        </p>
                      </div>

                      {/* Khung học sinh */}
                      <div className="p-4 rounded-xl border border-slate-300 bg-slate-50/50 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                        <div className="sm:col-span-2 font-medium">
                          Họ và tên học sinh: .......................................................................
                        </div>
                        <div className="font-medium">
                          Lớp: {khoiLop}..... &nbsp;&nbsp;&nbsp; Số báo danh: .........
                        </div>
                      </div>

                      {/* Danh sách câu hỏi */}
                      <div className="space-y-6 pt-2">
                        {/* Phần I. Trắc nghiệm */}
                        <div className="space-y-4">
                          <h5 className="text-sm font-bold text-teal-900 uppercase bg-teal-50 px-3 py-2 rounded-xl border border-teal-200">
                            I. PHẦN TRẮC NGHIỆM ({generatedPackage.deKiemTra.filter(q => !(q.hinhThuc === 'Tự luận' || q.hinhThuc.toLowerCase().includes('tự luận'))).length} câu)
                          </h5>
                          {generatedPackage.deKiemTra
                            .filter(q => !(q.hinhThuc === 'Tự luận' || q.hinhThuc.toLowerCase().includes('tự luận')))
                            .map((q) => (
                              <div key={q.soThuTu} className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 group hover:border-teal-400 transition-colors">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="text-sm font-semibold text-slate-900 leading-relaxed flex-1">
                                    <span className="font-bold text-teal-900">Câu {q.soThuTu}</span> ({q.diem.toFixed(1)} điểm · {q.mucDo} · {q.hinhThuc}):{' '}
                                    <span className="text-slate-800">{q.noiDungCauHoi}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setEditingQuestion(q)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 text-xs font-bold hover:bg-teal-100 shrink-0"
                                  >
                                    Sửa câu hỏi
                                  </button>
                                </div>

                                {q.cacLuaChon && q.cacLuaChon.length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-4 text-sm text-slate-700">
                                    {q.cacLuaChon.map((opt, oIdx) => (
                                      <div key={oIdx} className="p-2 rounded-lg bg-slate-50 border border-slate-100 font-medium">
                                        {opt}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {q.hinhThuc === 'Nối' && q.cotBenTrai && q.cotBenPhai && (
                                  <div className="grid grid-cols-2 gap-4 pl-4 pt-2 text-xs">
                                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                                      <div className="font-bold text-slate-900 mb-1">Cột A</div>
                                      {q.cotBenTrai.map((item, i) => (
                                        <div key={i}>• {item}</div>
                                      ))}
                                    </div>
                                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                                      <div className="font-bold text-slate-900 mb-1">Cột B</div>
                                      {q.cotBenPhai.map((item, i) => (
                                        <div key={i}>• {item}</div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                        </div>

                        {/* Phần II. Tự luận */}
                        {generatedPackage.deKiemTra.some(q => q.hinhThuc === 'Tự luận' || q.hinhThuc.toLowerCase().includes('tự luận')) && (
                          <div className="space-y-4 pt-4">
                            <h5 className="text-sm font-bold text-teal-900 uppercase bg-teal-50 px-3 py-2 rounded-xl border border-teal-200">
                              II. PHẦN TỰ LUẬN ({generatedPackage.deKiemTra.filter(q => q.hinhThuc === 'Tự luận' || q.hinhThuc.toLowerCase().includes('tự luận')).length} câu)
                            </h5>
                            {generatedPackage.deKiemTra
                              .filter(q => q.hinhThuc === 'Tự luận' || q.hinhThuc.toLowerCase().includes('tự luận'))
                              .map((q) => (
                                <div key={q.soThuTu} className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 group hover:border-teal-400 transition-colors">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="text-sm font-semibold text-slate-900 leading-relaxed flex-1">
                                      <span className="font-bold text-teal-900">Câu {q.soThuTu}</span> ({q.diem.toFixed(1)} điểm · {q.mucDo} · {q.hinhThuc}):{' '}
                                      <span className="text-slate-800">{q.noiDungCauHoi}</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setEditingQuestion(q)}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 text-xs font-bold hover:bg-teal-100 shrink-0"
                                    >
                                      Sửa câu hỏi
                                    </button>
                                  </div>

                                  <div className="pl-4 pt-2 space-y-2">
                                    <div className="text-xs font-medium text-slate-500 italic">Bài làm:</div>
                                    <div className="h-16 border-b border-dashed border-slate-300" />
                                    <div className="h-16 border-b border-dashed border-slate-300" />
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: Đáp án & Biểu điểm */}
                {activeTab === 'answers' && (
                  <div className="space-y-4 overflow-x-auto">
                    <p className="text-xs text-slate-600">
                      Bảng đáp án chính xác và hướng dẫn chấm chi tiết (biểu điểm từng ý) phục vụ công tác chấm bài của giáo viên.
                    </p>
                    <table className="w-full min-w-[700px] border-collapse text-xs text-slate-800">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 text-center font-bold">
                          <th className="border border-slate-300 p-2 w-16">Câu</th>
                          <th className="border border-slate-300 p-2 w-28">Mức độ / Dạng</th>
                          <th className="border border-slate-300 p-2">Đáp án chính xác</th>
                          <th className="border border-slate-300 p-2">Hướng dẫn chấm chi tiết</th>
                          <th className="border border-slate-300 p-2 w-20">Biểu điểm</th>
                        </tr>
                      </thead>
                      <tbody>
                        {generatedPackage.deKiemTra.map((q) => (
                          <tr key={q.soThuTu} className="hover:bg-slate-50 align-top">
                            <td className="border border-slate-300 p-2 text-center font-bold">Câu {q.soThuTu}</td>
                            <td className="border border-slate-300 p-2 text-center font-semibold text-teal-900">
                              {q.mucDo}<br />
                              <span className="text-[11px] font-normal text-slate-600">{q.hinhThuc}</span>
                            </td>
                            <td className="border border-slate-300 p-2 font-bold text-slate-900">{q.dapAnChiTiet}</td>
                            <td className="border border-slate-300 p-2 text-slate-700">{q.huongDanCham}</td>
                            <td className="border border-slate-300 p-2 text-center font-bold text-teal-800">{q.diem.toFixed(1)} đ</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-teal-50 font-bold text-slate-900">
                          <td className="border border-slate-300 p-2 text-right" colSpan={4}>Tổng điểm toàn bài:</td>
                          <td className="border border-slate-300 p-2 text-center text-teal-800">{generatedPackage.tongDiem.toFixed(1)} đ</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-[520px] rounded-2xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <ListTree className="w-7 h-7" />
              </div>
              <div className="max-w-md space-y-1">
                <h3 className="text-base font-bold text-slate-900">Chưa có đề kiểm tra</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Thầy/cô hãy thiết lập cấu hình môn học, khối lớp, mạch kiến thức và tỷ lệ điểm ở cột bên trái, sau đó bấm{' '}
                  <span className="font-semibold text-teal-800">Tạo Ma Trận &amp; Đề Bằng AI</span>.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal chỉnh sửa trực tiếp câu hỏi */}
      {editingQuestion && (
        <EditQuestionModal
          question={editingQuestion}
          onClose={() => setEditingQuestion(null)}
          onSave={handleUpdateQuestion}
        />
      )}

      {/* Modal xác nhận ghi đè hoặc tạo bản mới khi trùng tiêu đề trong Kho học liệu */}
      {duplicatePrompt && (
        <DuplicateMaterialDialog
          existing={duplicatePrompt.existing}
          canOverwrite={canOverwriteLibraryMaterial(profile, duplicatePrompt.existing)}
          loading={isSaving}
          onOverwrite={() => {
            const targetId = duplicatePrompt.existing.id;
            const share = duplicatePrompt.shareToLibrary;
            setDuplicatePrompt(null);
            void executeSaveExam(share, { overwriteMaterialId: targetId });
          }}
          onCreateNew={() => {
            const share = duplicatePrompt.shareToLibrary;
            setDuplicatePrompt(null);
            void executeSaveExam(share, { forceNew: true });
          }}
          onCancel={() => setDuplicatePrompt(null)}
        />
      )}
    </div>
  );
}

interface EditQuestionModalProps {
  question: ExamQuestion;
  onClose: () => void;
  onSave: (updated: ExamQuestion) => void;
}

function EditQuestionModal({ question, onClose, onSave }: EditQuestionModalProps) {
  const [noiDung, setNoiDung] = useState(question.noiDungCauHoi);
  const [dapAn, setDapAn] = useState(question.dapAnChiTiet);
  const [huongDan, setHuongDan] = useState(question.huongDanCham);
  const [diem, setDiem] = useState(String(question.diem));

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...question,
      noiDungCauHoi: noiDung.trim(),
      dapAnChiTiet: dapAn.trim(),
      huongDanCham: huongDan.trim(),
      diem: Math.max(0.1, Number(diem) || 0.5),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleFormSubmit}
        className="w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900">
            Chỉnh sửa Câu số {question.soThuTu} ({question.mucDo} · {question.hinhThuc})
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
            ✕
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div>
            <label htmlFor="edit-q-content" className="block font-semibold text-slate-800 mb-1">
              Nội dung câu hỏi
            </label>
            <textarea
              id="edit-q-content"
              rows={3}
              required
              value={noiDung}
              onChange={(e) => setNoiDung(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-teal-700"
            />
          </div>

          <div>
            <label htmlFor="edit-q-answer" className="block font-semibold text-slate-800 mb-1">
              Đáp án chính xác
            </label>
            <input
              id="edit-q-answer"
              type="text"
              required
              value={dapAn}
              onChange={(e) => setDapAn(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-teal-700"
            />
          </div>

          <div>
            <label htmlFor="edit-q-guide" className="block font-semibold text-slate-800 mb-1">
              Hướng dẫn chấm / Biểu điểm chi tiết
            </label>
            <textarea
              id="edit-q-guide"
              rows={2}
              required
              value={huongDan}
              onChange={(e) => setHuongDan(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-teal-700"
            />
          </div>

          <div>
            <label htmlFor="edit-q-score" className="block font-semibold text-slate-800 mb-1">
              Điểm số
            </label>
            <input
              id="edit-q-score"
              type="number"
              step="0.25"
              min="0.1"
              max="10"
              required
              value={diem}
              onChange={(e) => setDiem(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-teal-700"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            className="min-h-[42px] px-5 py-2 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800"
          >
            Lưu thay đổi
          </button>
        </div>
      </form>
    </div>
  );
}

interface DuplicateMaterialDialogProps {
  existing: LearningMaterial;
  canOverwrite: boolean;
  loading: boolean;
  onOverwrite: () => void;
  onCreateNew: () => void;
  onCancel: () => void;
}

function DuplicateMaterialDialog({
  existing,
  canOverwrite,
  loading,
  onOverwrite,
  onCreateNew,
  onCancel,
}: DuplicateMaterialDialogProps) {
  const statusLabel = STATUS_LABELS[existing.trangThai] || existing.trangThai;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-material-dialog-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 id="duplicate-material-dialog-title" className="text-lg font-bold text-slate-900">
                Học liệu cùng tiêu đề đã tồn tại
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Trong Kho học liệu của bạn đã có một học liệu cùng tiêu đề và cùng người tạo:
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            aria-label="Đóng"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-sm">
          <div className="font-bold text-slate-900 line-clamp-2">{existing.tieuDe}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold">
              {statusLabel}
            </span>
            <span>Môn {existing.monHoc} · Khối {existing.khoiLop}</span>
          </div>
        </div>

        {!canOverwrite && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            Học liệu cũ đã được duyệt nên tài khoản của bạn không thể ghi đè trực tiếp. Vui lòng chọn <strong>Tạo bản mới</strong>.
          </p>
        )}

        <p className="text-sm text-slate-700">
          Thầy/cô muốn <strong>Ghi đè</strong> lên học liệu cũ hay <strong>Tạo bản mới</strong>?
        </p>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={onCreateNew}
            disabled={loading}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-teal-300 bg-teal-50 text-teal-900 text-sm font-bold hover:bg-teal-100 disabled:opacity-60"
          >
            Tạo bản mới
          </button>
          <button
            type="button"
            onClick={onOverwrite}
            disabled={loading || !canOverwrite}
            className="min-h-[42px] px-5 py-2 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ghi đè
          </button>
        </div>
      </div>
    </div>
  );
}
