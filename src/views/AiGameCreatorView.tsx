import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Gamepad2,
  Link2Off,
  Link2,
  RefreshCw,
  Save,
  Sparkles,
} from 'lucide-react';
import { createMaterial } from '../services/hocLieuService';
import {
  AI_GAME_DAILY_LIMIT,
  AiGameGenerationError,
  fetchMyDailyAiGameQuota,
  requestAiGameHtml,
  toggleMaterialShareLink,
} from '../services/aiGameService';
import {
  GAME_DIFFICULTIES,
  GAME_QUESTION_COUNTS,
  GAME_TYPES,
  GRADE_LEVELS,
  type DepartmentItem,
  type GameDifficulty,
  type GameQuestionCount,
  type GameType,
  type GradeLevel,
  type LearningMaterial,
  type MaterialInput,
  type SubjectItem,
  type UserProfile,
} from '../types/hocLieu';
import {
  buildStudentGameUrl,
  copyTextToClipboard,
  generateShareCode,
} from '../utils/shareCode';
import { useToast } from '../components/ToastContext';

interface AiGameCreatorViewProps {
  profile: UserProfile;
  subjects: SubjectItem[];
  departments: DepartmentItem[];
  onSavedNavigate: (target: 'library' | 'myMaterials') => void;
}

function canInstantApproveMaterial(profile: UserProfile): boolean {
  if (profile.vaiTro === 'toTruong' || profile.vaiTro === 'quanTri') return true;
  if (profile.role === 'TO_TRUONG' || profile.role === 'ADMIN') return true;
  return (
    profile.chucVu === 'Tổ trưởng chuyên môn' ||
    profile.chucVu === 'Hiệu trưởng (BGH)' ||
    profile.chucVu === 'Quản trị viên (ADMIN)'
  );
}

const LESSON_NAME_MAX_LENGTH = 150;
const STANDARD_PROMPT_LENGTH = 300;
const CREATIVE_PROMPT_LENGTH = 600;

interface CreativeSuggestion {
  label: string;
  buildTemplate: (gradeLabel: string) => string;
}

const CREATIVE_SUGGESTIONS: CreativeSuggestion[] = [
  {
    label: 'Khám phá kho báu',
    buildTemplate: (gradeLabel) =>
      `Bối cảnh Khám phá kho báu: Học sinh hóa thân thành nhà thám hiểm ${gradeLabel} vượt qua các hòn đảo bí ẩn trên bản đồ. Trả lời đúng mỗi thử thách sẽ mở khóa rương báu, nhận sao vàng và đi tiếp sang đảo mới.`,
  },
  {
    label: 'Đua xe',
    buildTemplate: () =>
      `Bối cảnh Đua xe về đích: Học sinh điều khiển chiếc xe vui nhộn bằng bàn phím, chuột hoặc nút cảm ứng trên đường đua nhiều màu. Mỗi lần vượt qua thử thách đúng giúp xe tăng tốc về đích sớm nhất.`,
  },
  {
    label: 'Bắn bóng bay',
    buildTemplate: () =>
      `Bối cảnh Bắn bóng bay vui nhộn: Các quả bóng bay rực rỡ mang đáp án bay nhẹ lên bầu trời xanh. Học sinh chạm, click hoặc chọn đúng quả bóng chứa đáp án chuẩn để nổ bóng ăn điểm.`,
  },
  {
    label: 'Mê cung',
    buildTemplate: () =>
      `Bối cảnh Mê cung trí tuệ: Học sinh điều khiển nhân vật bằng phím mũi tên hoặc nút điều hướng cảm ứng tìm đường ra khỏi mê cung. Tại mỗi cổng khóa cần giải đúng thử thách để mở cửa đi tiếp.`,
  },
  {
    label: 'Nhảy qua chướng ngại',
    buildTemplate: () =>
      `Bối cảnh Nhảy qua chướng ngại: Nhân vật chạy vui nhộn trên đường đua, khi gặp chướng ngại vật học sinh bấm phím Space, chạm màn hình hoặc chọn đúng đáp án để nhảy qua an toàn và thu thập sao.`,
  },
  {
    label: 'Nấu ăn / bán hàng',
    buildTemplate: () =>
      `Bối cảnh Nấu ăn / bán hàng: Học sinh làm chủ tiệm bánh nhỏ đáng yêu, phục vụ các bạn thú cưng dễ thương đến gọi món. Hoàn thành đúng mỗi thử thách để giao đơn hàng thành công và nhận huy hiệu đầu bếp.`,
  },
  {
    label: 'Cứu hộ động vật',
    buildTemplate: () =>
      `Bối cảnh Cứu hộ động vật: Các bạn thú rừng dễ thương đang chờ được giúp qua sông an toàn. Mỗi lần giải đúng thử thách sẽ bắc thêm một nhịp cầu để đưa một bạn thú về nhà an toàn.`,
  },
];

export function AiGameCreatorView({
  profile,
  subjects,
  departments,
  onSavedNavigate,
}: AiGameCreatorViewProps) {
  const { showToast, showFirebaseAlert } = useToast();
  const activeSubjects = useMemo(() => subjects.filter((s) => s.kichHoat), [subjects]);
  const activeDepartments = useMemo(
    () => departments.filter((d) => d.kichHoat),
    [departments]
  );
  const canInstantApprove = canInstantApproveMaterial(profile);

  const [monHoc, setMonHoc] = useState(activeSubjects[0]?.ten || 'Toán');
  const [khoiLop, setKhoiLop] = useState<GradeLevel>('1');
  const [tenBaiHoc, setTenBaiHoc] = useState('');
  const [soCauHoi, setSoCauHoi] = useState<GameQuestionCount>(8);
  const [mucDo, setMucDo] = useState<GameDifficulty>('Vừa');
  const [dangTroChoi, setDangTroChoi] = useState<GameType>('Trắc nghiệm');
  const [yeuCau, setYeuCau] = useState('');

  const [tieuDe, setTieuDe] = useState('');
  const lastAutoTitleRef = useRef('');
  const [toKhoi, setToKhoi] = useState(profile.toKhoi || profile.toChuyenMon || '');
  const [chiaSeLink, setChiaSeLink] = useState(true);
  const [instantApprove, setInstantApprove] = useState(false);

  const [generatedHtml, setGeneratedHtml] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isRefusalNotice, setIsRefusalNotice] = useState(false);

  const [remainingToday, setRemainingToday] = useState<number>(AI_GAME_DAILY_LIMIT);
  const [usedToday, setUsedToday] = useState<number>(0);

  const isCreativeMode = dangTroChoi === 'Tự do (sáng tạo)';
  const maxPromptLength = isCreativeMode
    ? CREATIVE_PROMPT_LENGTH
    : STANDARD_PROMPT_LENGTH;

  const [savedRecord, setSavedRecord] = useState<{
    id: string;
    maChiaSe: string;
    chiaSeLink: boolean;
    tieuDe: string;
    tenBaiHoc: string;
    dangTroChoi: GameType;
    monHoc: string;
    khoiLop: GradeLevel;
    toKhoi: string;
    htmlTroChoi: string;
    trangThai: 'choDuyet' | 'daDuyet';
  } | null>(null);
  const [togglingShare, setTogglingShare] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMyDailyAiGameQuota(profile.uid).then((q) => {
      if (!cancelled) {
        setUsedToday(q.usedToday);
        setRemainingToday(q.remainingToday);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [profile.uid]);

  function handleSelectGameType(nextType: GameType) {
    setDangTroChoi(nextType);
    setErrorMsg('');
    setIsRefusalNotice(false);
  }

  function handleApplySuggestion(item: CreativeSuggestion) {
    const gradeLabel = khoiLop === 'Dùng chung' ? 'tiểu học' : `Lớp ${khoiLop}`;
    const template = item.buildTemplate(gradeLabel).slice(0, CREATIVE_PROMPT_LENGTH);
    setYeuCau(template);
    setErrorMsg('');
    setIsRefusalNotice(false);
  }

  async function handleGenerate() {
    setErrorMsg('');
    setIsRefusalNotice(false);

    const cleanLesson = tenBaiHoc.trim();
    if (cleanLesson.length < 2) {
      setErrorMsg('Vui lòng nhập Tên bài học / nội dung kiến thức (ít nhất 2 ký tự).');
      return;
    }
    if (cleanLesson.length > LESSON_NAME_MAX_LENGTH) {
      setErrorMsg(`Tên bài học / nội dung kiến thức tối đa ${LESSON_NAME_MAX_LENGTH} ký tự.`);
      return;
    }

    const cleanPrompt = yeuCau.trim();
    if (isCreativeMode && cleanPrompt.length < 3) {
      setErrorMsg(
        'Vui lòng nhập mô tả cách chơi và bối cảnh trò chơi bạn muốn (hoặc bấm chọn gợi ý nhanh).'
      );
      return;
    }
    if (cleanPrompt.length > maxPromptLength) {
      setErrorMsg(
        `${isCreativeMode ? 'Mô tả trò chơi' : 'Yêu cầu thêm'} tối đa ${maxPromptLength} ký tự.`
      );
      return;
    }
    if (remainingToday <= 0) {
      setErrorMsg(
        `Bạn đã dùng hết ${AI_GAME_DAILY_LIMIT} lượt tạo trò chơi AI trong ngày hôm nay.`
      );
      return;
    }

    setGenerating(true);
    setSavedRecord(null);
    try {
      const res = await requestAiGameHtml({
        monHoc,
        khoiLop,
        tenBaiHoc: cleanLesson,
        soCauHoi,
        mucDo,
        dangTroChoi,
        yeuCau: cleanPrompt,
      });
      setGeneratedHtml(res.html);
      setUsedToday(res.usedToday);
      setRemainingToday(res.remainingToday);

      const suggestedTitle = cleanLesson.slice(0, 200);
      if (!tieuDe.trim() || tieuDe === lastAutoTitleRef.current) {
        setTieuDe(suggestedTitle);
        lastAutoTitleRef.current = suggestedTitle;
      }
      showToast('Đã tạo xong trò chơi! Thầy/cô có thể chơi thử trước khi lưu.', 'success');
    } catch (err) {
      const refused = err instanceof AiGameGenerationError && err.refused;
      const msg = err instanceof Error ? err.message : 'Không thể tạo trò chơi từ AI.';
      setIsRefusalNotice(refused);
      setErrorMsg(msg);
      showToast(msg, refused ? 'info' : 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveGame() {
    if (!generatedHtml) return;
    setErrorMsg('');
    setIsRefusalNotice(false);

    const cleanLesson = tenBaiHoc.trim().slice(0, LESSON_NAME_MAX_LENGTH);
    const cleanTitle = (tieuDe.trim() || cleanLesson).slice(0, 200);
    if (cleanTitle.length < 2) {
      setErrorMsg('Vui lòng nhập tiêu đề trò chơi (tối thiểu 2 ký tự).');
      return;
    }

    const maChiaSe = generateShareCode(20);
    const studentUrl = buildStudentGameUrl(maChiaSe);
    const targetStatus: 'choDuyet' | 'daDuyet' =
      canInstantApprove && instantApprove ? 'daDuyet' : 'choDuyet';

    const extraNote = yeuCau.trim() ? ` · Mô tả cách chơi: ${yeuCau.trim()}` : '';
    const fullDescription = `Trò chơi ${dangTroChoi} (${soCauHoi} câu · Mức độ: ${mucDo}) · Bài học: ${cleanLesson}${extraNote}`;

    setSaving(true);
    try {
      const payload: MaterialInput = {
        tieuDe: cleanTitle,
        tenBaiHoc: cleanLesson,
        moTa: fullDescription.slice(0, 2000),
        monHoc,
        khoiLop,
        loai: 'Bài tập tương tác',
        the: ['tro-choi-ai', dangTroChoi.toLowerCase()],
        loaiNguon: 'troChoi',
        url: studentUrl,
        tenTep: '',
        kichThuocTep: 0,
        duongDanStorage: '',
        toKhoi,
        trangThai: targetStatus,
        htmlTroChoi: generatedHtml,
        maChiaSe,
        chiaSeLink,
        dangTroChoi,
      };

      const materialId = await createMaterial(profile, payload);
      setSavedRecord({
        id: materialId,
        maChiaSe,
        chiaSeLink,
        tieuDe: cleanTitle,
        tenBaiHoc: cleanLesson,
        dangTroChoi,
        monHoc,
        khoiLop,
        toKhoi,
        htmlTroChoi: generatedHtml,
        trangThai: targetStatus,
      });

      showFirebaseAlert(
        true,
        targetStatus === 'daDuyet'
          ? `Đã lưu & duyệt trò chơi "${cleanTitle}" lên Kho học liệu.`
          : `Đã lưu trò chơi "${cleanTitle}" và gửi Tổ trưởng duyệt.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Không thể lưu trò chơi lên Firebase: ${msg}`);
      showFirebaseAlert(false, err);
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyStudentLink(maChiaSe: string) {
    const url = buildStudentGameUrl(maChiaSe);
    const ok = await copyTextToClipboard(url);
    if (ok) {
      showToast('Đã sao chép đường link học sinh vào bộ nhớ tạm.', 'success');
    } else {
      showToast('Không thể tự động sao chép, thầy/cô hãy chọn và copy thủ công.', 'error');
    }
  }

  async function handleToggleSavedShareLink() {
    if (!savedRecord) return;
    const nextEnabled = !savedRecord.chiaSeLink;
    setTogglingShare(true);
    try {
      const syntheticMaterial: LearningMaterial = {
        id: savedRecord.id,
        tieuDe: savedRecord.tieuDe,
        tenBaiHoc: savedRecord.tenBaiHoc,
        moTa: '',
        monHoc: savedRecord.monHoc,
        khoiLop: savedRecord.khoiLop,
        loai: 'Bài tập tương tác',
        the: [],
        loaiNguon: 'troChoi',
        url: buildStudentGameUrl(savedRecord.maChiaSe),
        tenTep: '',
        kichThuocTep: 0,
        duongDanStorage: '',
        nguoiDangUid: profile.uid,
        nguoiDangTen: profile.hoTen,
        toKhoi: savedRecord.toKhoi,
        trangThai: savedRecord.trangThai,
        lyDoTuChoi: '',
        luotXem: 0,
        luotTai: 0,
        ngayTao: null,
        ngayCapNhat: null,
        ngayDuyet: null,
        nguoiDuyetUid: '',
        nguoiDuyetTen: '',
        isSample: false,
        htmlTroChoi: savedRecord.htmlTroChoi,
        maChiaSe: savedRecord.maChiaSe,
        chiaSeLink: savedRecord.chiaSeLink,
        dangTroChoi: savedRecord.dangTroChoi,
      };
      await toggleMaterialShareLink(syntheticMaterial, nextEnabled);
      setSavedRecord({ ...savedRecord, chiaSeLink: nextEnabled });
      showToast(
        nextEnabled
          ? 'Đã bật lại link học sinh chơi không cần đăng nhập.'
          : 'Đã tắt chia sẻ link học sinh.',
        'success'
      );
    } catch (err) {
      showFirebaseAlert(false, err);
    } finally {
      setTogglingShare(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Gamepad2 className="w-7 h-7 text-teal-700 shrink-0" />
            Tạo trò chơi bằng AI
          </h1>
          <p className="mt-1 text-[15px] text-slate-600">
            Chọn môn học, khối lớp, tên bài học và dạng trò chơi để AI thiết kế trò chơi HTML5 chuẩn kiến thức cho học sinh tiểu học.
          </p>
        </div>

        <div className="px-4 py-2.5 rounded-xl bg-teal-50 border border-teal-200 text-sm text-teal-900 font-semibold tabular-nums shrink-0">
          Hôm nay còn{' '}
          <span className="font-extrabold text-teal-700">{remainingToday}</span>/{AI_GAME_DAILY_LIMIT}{' '}
          lượt tạo ({usedToday} đã dùng)
        </div>
      </div>

      {errorMsg && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 text-sm font-medium ${
            isRefusalNotice
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            {isRefusalNotice && (
              <p className="font-bold mb-0.5">
                AI chưa thể tạo trò chơi theo nội dung này
              </p>
            )}
            <p>{errorMsg}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Khung thiết lập thông số */}
        <div className="xl:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="ai-game-subject"
                className="block text-sm font-semibold text-slate-800 mb-1.5"
              >
                Môn học <span className="text-rose-600">*</span>
              </label>
              <select
                id="ai-game-subject"
                value={monHoc}
                onChange={(e) => setMonHoc(e.target.value)}
                disabled={generating}
                className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-[15px] text-slate-900 focus:outline-none focus:border-teal-700"
              >
                {activeSubjects.map((s) => (
                  <option key={s.id} value={s.ten}>
                    {s.ten}
                  </option>
                ))}
                {!activeSubjects.some((s) => s.ten === monHoc) && (
                  <option value={monHoc}>{monHoc}</option>
                )}
              </select>
            </div>

            <div>
              <label
                htmlFor="ai-game-grade"
                className="block text-sm font-semibold text-slate-800 mb-1.5"
              >
                Khối lớp <span className="text-rose-600">*</span>
              </label>
              <select
                id="ai-game-grade"
                value={khoiLop}
                onChange={(e) => setKhoiLop(e.target.value as GradeLevel)}
                disabled={generating}
                className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-[15px] text-slate-900 focus:outline-none focus:border-teal-700"
              >
                {GRADE_LEVELS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="ai-game-lesson"
                className="block text-sm font-semibold text-slate-800"
              >
                Tên bài học / nội dung kiến thức <span className="text-rose-600">*</span>
              </label>
              <span
                className={`text-xs font-mono tabular-nums ${
                  tenBaiHoc.length >= LESSON_NAME_MAX_LENGTH
                    ? 'text-rose-600 font-bold'
                    : 'text-slate-500'
                }`}
              >
                {tenBaiHoc.length}/{LESSON_NAME_MAX_LENGTH}
              </span>
            </div>
            <input
              id="ai-game-lesson"
              type="text"
              maxLength={LESSON_NAME_MAX_LENGTH}
              disabled={generating}
              value={tenBaiHoc}
              onChange={(e) => setTenBaiHoc(e.target.value)}
              placeholder="Ví dụ: Phép cộng trong phạm vi 10, Phép trừ có nhớ, Bảng nhân 6, Từ chỉ sự vật"
              className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 text-[15px] text-slate-900 focus:outline-none focus:border-teal-700"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-sm font-semibold text-slate-800 mb-1.5">
                Số câu hỏi
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {GAME_QUESTION_COUNTS.map((count) => {
                  const active = soCauHoi === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      disabled={generating}
                      onClick={() => setSoCauHoi(count)}
                      className={`min-h-[40px] rounded-xl border text-sm font-bold tabular-nums transition-colors ${
                        active
                          ? 'border-teal-700 bg-teal-700 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-teal-400 hover:bg-teal-50/50'
                      }`}
                    >
                      {count}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="block text-sm font-semibold text-slate-800 mb-1.5">
                Mức độ
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {GAME_DIFFICULTIES.map((level) => {
                  const active = mucDo === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      disabled={generating}
                      onClick={() => setMucDo(level)}
                      className={`min-h-[40px] rounded-xl border text-sm font-semibold transition-colors ${
                        active
                          ? 'border-teal-700 bg-teal-700 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-teal-400 hover:bg-teal-50/50'
                      }`}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <span className="block text-sm font-semibold text-slate-800 mb-2">
              Dạng trò chơi <span className="text-rose-600">*</span>
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {GAME_TYPES.map((type) => {
                const active = dangTroChoi === type;
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={generating}
                    onClick={() => handleSelectGameType(type)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                      active
                        ? 'border-teal-700 bg-teal-700 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-teal-400 hover:bg-teal-50/50'
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="ai-game-prompt"
                className="block text-sm font-semibold text-slate-800"
              >
                {isCreativeMode ? (
                  <>
                    Mô tả trò chơi bạn muốn <span className="text-rose-600">*</span>
                  </>
                ) : (
                  'Yêu cầu thêm cho trò chơi (không bắt buộc)'
                )}
              </label>
              <span
                className={`text-xs font-mono tabular-nums ${
                  yeuCau.length >= maxPromptLength
                    ? 'text-rose-600 font-bold'
                    : 'text-slate-500'
                }`}
              >
                {yeuCau.length}/{maxPromptLength}
              </span>
            </div>
            <textarea
              id="ai-game-prompt"
              rows={isCreativeMode ? 4 : 3}
              maxLength={maxPromptLength}
              disabled={generating}
              value={yeuCau}
              onChange={(e) => setYeuCau(e.target.value)}
              placeholder={
                isCreativeMode
                  ? 'Chỉ mô tả cách chơi và bối cảnh (ví dụ: đua xe, vượt chướng ngại, khám phá kho báu...), không cần nhập nội dung câu hỏi vào ô này.'
                  : 'Không bắt buộc. Ví dụ: Lồng ghép hình ảnh cây cối, hoa quả hoặc tình huống gần gũi với học sinh.'
              }
              className="w-full px-4 py-3 rounded-xl border border-slate-300 text-[15px] text-slate-900 focus:outline-none focus:border-teal-700"
            />
            {isCreativeMode && (
              <p className="text-xs text-slate-500">
                Ô này chỉ dùng để mô tả cách chơi và bối cảnh; hệ thống sẽ tự tạo câu hỏi bám sát Tên bài học ở trên.
              </p>
            )}

            {isCreativeMode && (
              <div className="pt-1 space-y-2">
                <p className="text-xs font-semibold text-slate-600">
                  Gợi ý nhanh (bấm vào để điền sẵn mẫu):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CREATIVE_SUGGESTIONS.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      disabled={generating}
                      onClick={() => handleApplySuggestion(item)}
                      className="px-3 py-1.5 rounded-lg border border-teal-200 bg-teal-50/70 text-teal-900 text-xs font-semibold hover:bg-teal-100 hover:border-teal-300 disabled:opacity-60 transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={generating || remainingToday <= 0}
            onClick={handleGenerate}
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-60 transition-colors"
          >
            {generating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Đang thiết kế trò chơi...
              </>
            ) : generatedHtml ? (
              <>
                <RefreshCw className="w-4 h-4" />
                Tạo lại
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Tạo trò chơi bằng AI
              </>
            )}
          </button>

          {generatedHtml && (
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div>
                <label
                  htmlFor="ai-game-title"
                  className="block text-sm font-semibold text-slate-800 mb-1.5"
                >
                  Tiêu đề lưu vào Kho học liệu <span className="text-rose-600">*</span>
                </label>
                <input
                  id="ai-game-title"
                  type="text"
                  maxLength={200}
                  value={tieuDe}
                  onChange={(e) => setTieuDe(e.target.value)}
                  placeholder="Nhập tên học liệu trò chơi..."
                  className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 text-[15px] text-slate-900 focus:outline-none focus:border-teal-700"
                />
              </div>

              <div>
                <label
                  htmlFor="ai-game-dept"
                  className="block text-sm font-semibold text-slate-800 mb-1.5"
                >
                  Tổ khối duyệt bài
                </label>
                <select
                  id="ai-game-dept"
                  value={toKhoi}
                  onChange={(e) => setToKhoi(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-[15px] text-slate-900 focus:outline-none focus:border-teal-700"
                >
                  {activeDepartments.map((d) => (
                    <option key={d.id} value={d.ten}>
                      {d.ten}
                    </option>
                  ))}
                  {!activeDepartments.some((d) => d.ten === toKhoi) && (
                    <option value={toKhoi}>{toKhoi}</option>
                  )}
                </select>
              </div>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={chiaSeLink}
                  onChange={(e) => setChiaSeLink(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-teal-700 rounded cursor-pointer shrink-0"
                />
                <span className="text-sm text-slate-800 font-medium leading-snug">
                  Mở link công khai để học sinh chơi ngay không cần đăng nhập
                </span>
              </label>

              {canInstantApprove && (
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-teal-300 bg-teal-50/80 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={instantApprove}
                    onChange={(e) => setInstantApprove(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-teal-700 rounded cursor-pointer shrink-0"
                  />
                  <span className="text-sm font-bold text-teal-950 leading-snug">
                    Xác nhận đã kiểm duyệt bài (Đăng thẳng lên Kho học liệu của tổ)
                  </span>
                </label>
              )}

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  disabled={generating}
                  onClick={handleGenerate}
                  className="flex-1 min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                >
                  <RefreshCw className="w-4 h-4" />
                  Tạo lại
                </button>
                <button
                  type="button"
                  disabled={saving || generating}
                  onClick={handleSaveGame}
                  className="flex-1 min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </div>
          )}

          {savedRecord && (
            <div className="p-4 rounded-xl border border-teal-300 bg-teal-50 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-teal-900">
                <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
                Đã lưu trò chơi lên Kho học liệu!
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-teal-200 text-xs font-mono text-slate-700 break-all">
                {buildStudentGameUrl(savedRecord.maChiaSe)}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyStudentLink(savedRecord.maChiaSe)}
                  className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-teal-700 text-white text-xs font-bold hover:bg-teal-800"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Sao chép link học sinh
                </button>

                <button
                  type="button"
                  disabled={togglingShare}
                  onClick={handleToggleSavedShareLink}
                  className={`min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${
                    savedRecord.chiaSeLink
                      ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                      : 'border-teal-300 bg-white text-teal-800 hover:bg-teal-50'
                  }`}
                >
                  {savedRecord.chiaSeLink ? (
                    <>
                      <Link2Off className="w-3.5 h-3.5" />
                      Tắt chia sẻ link
                    </>
                  ) : (
                    <>
                      <Link2 className="w-3.5 h-3.5" />
                      Bật chia sẻ link
                    </>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  onSavedNavigate(
                    savedRecord.trangThai === 'daDuyet' ? 'library' : 'myMaterials'
                  )
                }
                className="w-full text-xs font-semibold text-teal-800 hover:underline pt-1"
              >
                {savedRecord.trangThai === 'daDuyet'
                  ? 'Xem trong Kho học liệu →'
                  : 'Xem trong Học liệu của tôi →'}
              </button>
            </div>
          )}
        </div>

        {/* Khung xem trước sandboxed */}
        <div className="xl:col-span-7 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Xem trước trò chơi (Chế độ an toàn)
              </h2>
              <p className="text-xs text-slate-500">
                Trò chơi chạy độc lập trong khung sandbox, thầy/cô có thể chơi thử toàn bộ câu hỏi ngay tại đây.
              </p>
            </div>
          </div>

          {generatedHtml ? (
            <iframe
              title="Xem trước trò chơi AI"
              srcDoc={generatedHtml}
              sandbox="allow-scripts"
              className="w-full h-[580px] rounded-xl border border-slate-200 bg-white"
            />
          ) : (
            <div className="h-[580px] rounded-xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <Gamepad2 className="w-7 h-7" />
              </div>
              <div className="max-w-md space-y-1">
                <p className="text-base font-bold text-slate-900">
                  Chưa có trò chơi xem trước
                </p>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Hãy chọn môn học, khối lớp, nhập tên bài học, chọn số câu hỏi, mức độ và dạng trò chơi ở cột bên trái, sau đó bấm{' '}
                  <span className="font-semibold text-teal-800">Tạo trò chơi bằng AI</span>.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
