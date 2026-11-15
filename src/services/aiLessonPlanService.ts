import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../config/firebase';
import type { GradeLevel, LearningMaterial, MaterialStatus, UserProfile } from '../types/hocLieu';
import {
  LESSON_PLAN_GRADES,
  LESSON_PLAN_SUBJECTS,
  LESSON_PLAN_TEXTBOOKS,
  type GeneratedLessonPlan,
  type LessonPlanConfig,
} from '../types/lessonPlan';
import { buildTeacherApiHeaders } from '../utils/ssoAuth';

export async function generateLessonPlanWithAI(
  config: LessonPlanConfig
): Promise<GeneratedLessonPlan> {
  if (!LESSON_PLAN_SUBJECTS.includes(config.monHoc)) {
    throw new Error('Vui lòng chọn môn học hợp lệ.');
  }
  if (!LESSON_PLAN_GRADES.includes(config.khoiLop)) {
    throw new Error('Vui lòng chọn khối lớp từ 1 đến 5.');
  }
  if (!LESSON_PLAN_TEXTBOOKS.includes(config.boSach)) {
    throw new Error('Vui lòng chọn bộ sách giáo khoa hợp lệ.');
  }
  if (!config.tenBaiHoc || config.tenBaiHoc.trim().length < 2) {
    throw new Error('Vui lòng nhập Tên bài học / Tiết dạy cần soạn.');
  }

  const headers = await buildTeacherApiHeaders();
  const res = await fetch('/api/generate-lesson-plan', {
    method: 'POST',
    headers,
    body: JSON.stringify(config),
  });

  const data = (await res.json().catch(() => ({}))) as Partial<GeneratedLessonPlan> & {
    error?: string;
  };

  if (!res.ok) {
    throw new Error(
      data.error || `Không thể soạn Kế hoạch bài dạy AI (mã lỗi ${res.status}).`
    );
  }

  if (!data.header || !data.yeuCauCanDat || !data.hoatDongDayHoc) {
    throw new Error('Máy chủ chưa trả về cấu trúc Kế hoạch bài dạy hợp lệ.');
  }

  return data as GeneratedLessonPlan;
}

export async function saveLessonPlanToSystem(params: {
  profile: UserProfile;
  existingMaterialId?: string | null;
  config: LessonPlanConfig;
  plan: GeneratedLessonPlan;
  sharePublic: boolean;
}): Promise<string> {
  const { profile, existingMaterialId, config, plan, sharePublic } = params;

  const cleanTitle = (
    plan.header.tenBaiHoc ||
    config.tenBaiHoc ||
    'Kế hoạch bài dạy AI'
  )
    .trim()
    .slice(0, 200);

  const targetRef = existingMaterialId
    ? doc(db, 'materials', existingMaterialId)
    : doc(collection(db, 'materials'));
  const path = `materials/${targetRef.id}`;

  const targetStatus: MaterialStatus = sharePublic
    ? profile.vaiTro === 'quanTri' || profile.role === 'ADMIN'
      ? 'chiaSeToanTruong'
      : profile.vaiTro === 'toTruong' || profile.role === 'TO_TRUONG'
        ? 'daDuyet'
        : 'choDuyet'
    : 'nhap';

  const isAutoApproved = targetStatus === 'daDuyet' || targetStatus === 'chiaSeToanTruong';
  const actorName = profile.hoTen?.trim() || 'Giáo viên';

  const integrationSummary = plan.yeuCauCanDat.giaoDucTichHop.join(' | ');
  const moTa = `Kế hoạch bài dạy (CV 2345 · 1 tiết) môn ${config.monHoc} lớp ${config.khoiLop} (${config.boSach}). ${integrationSummary}`.slice(
    0,
    1900
  );

  const sanitizedFileBase =
    cleanTitle
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s-_]/g, '')
      .trim()
      .replace(/\s+/g, '_') || 'KHBD_AI';

  const tags = [
    'khbd-ai',
    'cv-2345',
    config.monHoc.toLowerCase().slice(0, 40),
    `khoi-${config.khoiLop}`,
    ...(config.selectedIntegrations || []).slice(0, 4).map((c) => c.toLowerCase()),
  ].slice(0, 10);

  try {
    const existingSnap = existingMaterialId ? await getDoc(targetRef) : null;

    if (existingSnap?.exists()) {
      const updatePayload: Record<string, unknown> = {
        tieuDe: cleanTitle,
        tenBaiHoc: cleanTitle,
        moTa,
        monHoc: config.monHoc,
        khoiLop: config.khoiLop as GradeLevel,
        loai: 'Giáo án',
        the: tags,
        loaiNguon: 'lienKet',
        url: `https://kho-hoc-lieu.local/khbd-ai/${targetRef.id}`,
        tenTep: `${sanitizedFileBase}_Lop${config.khoiLop}.docx`.slice(0, 255),
        kichThuocTep: 0,
        duongDanStorage: '',
        toKhoi: profile.toKhoi || 'Tổ Chuyên Môn',
        trangThai: targetStatus,
        lyDoTuChoi: '',
        ngayCapNhat: serverTimestamp(),
      };

      if (isAutoApproved) {
        updatePayload.ngayDuyet = serverTimestamp();
        updatePayload.nguoiDuyetUid = profile.uid;
        updatePayload.nguoiDuyetTen = actorName;
      }

      await setDoc(targetRef, updatePayload, { merge: true });
      return targetRef.id;
    }

    await setDoc(targetRef, {
      tieuDe: cleanTitle,
      tenBaiHoc: cleanTitle,
      moTa,
      monHoc: config.monHoc,
      khoiLop: config.khoiLop as GradeLevel,
      loai: 'Giáo án',
      the: tags,
      loaiNguon: 'lienKet',
      url: `https://kho-hoc-lieu.local/khbd-ai/${targetRef.id}`,
      tenTep: `${sanitizedFileBase}_Lop${config.khoiLop}.docx`.slice(0, 255),
      kichThuocTep: 0,
      duongDanStorage: '',
      nguoiDangUid: profile.uid,
      nguoiDangTen: actorName,
      toKhoi: profile.toKhoi || 'Tổ Chuyên Môn',
      trangThai: targetStatus,
      lyDoTuChoi: '',
      luotXem: 0,
      luotTai: 0,
      ngayTao: serverTimestamp(),
      ngayCapNhat: serverTimestamp(),
      ngayDuyet: isAutoApproved ? serverTimestamp() : null,
      nguoiDuyetUid: isAutoApproved ? profile.uid : '',
      nguoiDuyetTen: isAutoApproved ? actorName : '',
      isSample: false,
    });

    return targetRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
