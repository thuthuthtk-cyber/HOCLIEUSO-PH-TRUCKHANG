import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../config/firebase';
import type {
  ExamConfig,
  ExamRecord,
  GeneratedExamPackage,
  MatrixRow,
  MatrixSummaryTotals,
  SaveExamInput,
} from '../types/exam';
import type { LearningMaterial, UserProfile } from '../types/hocLieu';
import { buildTeacherApiHeaders } from '../utils/ssoAuth';

function roundScore(val: number): number {
  return Math.round(val * 100) / 100;
}

export function calculateMatrixTotals(rows: MatrixRow[]): MatrixSummaryTotals {
  const totals: MatrixSummaryTotals = {
    muc1TnSoCau: 0,
    muc1TnDiem: 0,
    muc1TlSoCau: 0,
    muc1TlDiem: 0,
    muc2TnSoCau: 0,
    muc2TnDiem: 0,
    muc2TlSoCau: 0,
    muc2TlDiem: 0,
    muc3TnSoCau: 0,
    muc3TnDiem: 0,
    muc3TlSoCau: 0,
    muc3TlDiem: 0,
    tongTnSoCau: 0,
    tongTnDiem: 0,
    tongTlSoCau: 0,
    tongTlDiem: 0,
    tongSoCau: 0,
    tongDiem: 0,
    tongTyLePhanTram: 0,
  };

  for (const row of rows) {
    totals.muc1TnSoCau += row.muc1.tnSoCau;
    totals.muc1TnDiem += row.muc1.tnDiem;
    totals.muc1TlSoCau += row.muc1.tlSoCau;
    totals.muc1TlDiem += row.muc1.tlDiem;

    totals.muc2TnSoCau += row.muc2.tnSoCau;
    totals.muc2TnDiem += row.muc2.tnDiem;
    totals.muc2TlSoCau += row.muc2.tlSoCau;
    totals.muc2TlDiem += row.muc2.tlDiem;

    totals.muc3TnSoCau += row.muc3.tnSoCau;
    totals.muc3TnDiem += row.muc3.tnDiem;
    totals.muc3TlSoCau += row.muc3.tlSoCau;
    totals.muc3TlDiem += row.muc3.tlDiem;

    totals.tongSoCau += row.tongSoCau;
    totals.tongDiem += row.tongDiem;
  }

  totals.muc1TnDiem = roundScore(totals.muc1TnDiem);
  totals.muc1TlDiem = roundScore(totals.muc1TlDiem);
  totals.muc2TnDiem = roundScore(totals.muc2TnDiem);
  totals.muc2TlDiem = roundScore(totals.muc2TlDiem);
  totals.muc3TnDiem = roundScore(totals.muc3TnDiem);
  totals.muc3TlDiem = roundScore(totals.muc3TlDiem);

  totals.tongTnSoCau = totals.muc1TnSoCau + totals.muc2TnSoCau + totals.muc3TnSoCau;
  totals.tongTnDiem = roundScore(
    totals.muc1TnDiem + totals.muc2TnDiem + totals.muc3TnDiem
  );
  totals.tongTlSoCau = totals.muc1TlSoCau + totals.muc2TlSoCau + totals.muc3TlSoCau;
  totals.tongTlDiem = roundScore(
    totals.muc1TlDiem + totals.muc2TlDiem + totals.muc3TlDiem
  );
  totals.tongDiem = roundScore(totals.tongDiem);
  totals.tongTyLePhanTram = roundScore(totals.tongDiem * 10);

  return totals;
}

export async function generateExamPackageWithAI(
  config: ExamConfig
): Promise<GeneratedExamPackage> {
  if (!config.monHoc || !config.chuDeKienThuc?.length) {
    throw new Error('Vui lòng chọn môn học và nhập ít nhất 1 mạch kiến thức.');
  }

  const headers = await buildTeacherApiHeaders();
  const res = await fetch('/api/generate-exam', {
    method: 'POST',
    headers,
    body: JSON.stringify(config),
  });

  const data = (await res.json().catch(() => ({}))) as Partial<GeneratedExamPackage> & {
    error?: string;
  };

  if (!res.ok) {
    throw new Error(
      data.error || `Không thể sinh đề kiểm tra bằng AI (mã lỗi ${res.status}).`
    );
  }

  if (!Array.isArray(data.deKiemTra) || data.deKiemTra.length === 0) {
    throw new Error('Máy chủ chưa trả về danh sách câu hỏi đề kiểm tra hợp lệ.');
  }

  return data as GeneratedExamPackage;
}

function sortExamsByNewest(list: ExamRecord[]): ExamRecord[] {
  return [...list].sort((a, b) => {
    const ta = a.ngayTao?.toMillis?.() ?? 0;
    const tb = b.ngayTao?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

export function subscribeExamsForTeacher(
  profile: UserProfile,
  onData: (exams: ExamRecord[]) => void,
  onError: () => void
): Unsubscribe {
  if (profile.vaiTro === 'quanTri') {
    return onSnapshot(
      collection(db, 'exams'),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ExamRecord, 'id'>),
        }));
        onData(sortExamsByNewest(list));
      },
      (err) => {
        onError();
        handleFirestoreError(err, OperationType.LIST, 'exams');
      }
    );
  }

  const buckets = new Map<string, Map<string, ExamRecord>>();
  const syncAll = () => {
    const merged = new Map<string, ExamRecord>();
    buckets.forEach((bucket) => {
      bucket.forEach((item, id) => merged.set(id, item));
    });
    onData(sortExamsByNewest(Array.from(merged.values())));
  };

  const scopedQueries = [
    {
      key: 'mine',
      q: query(collection(db, 'exams'), where('nguoiTaoUid', '==', profile.uid)),
    },
    {
      key: 'shared',
      q: query(collection(db, 'exams'), where('chiaSeKho', '==', true)),
    },
  ];

  const unsubs = scopedQueries.map(({ key, q }) =>
    onSnapshot(
      q,
      (snap) => {
        const map = new Map<string, ExamRecord>();
        snap.docs.forEach((d) => {
          map.set(d.id, { id: d.id, ...(d.data() as Omit<ExamRecord, 'id'>) });
        });
        buckets.set(key, map);
        syncAll();
      },
      (err) => {
        onError();
        handleFirestoreError(err, OperationType.LIST, 'exams');
      }
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function fetchExamsForTeacher(profile: UserProfile): Promise<ExamRecord[]> {
  try {
    if (profile.vaiTro === 'quanTri') {
      const snap = await getDocs(collection(db, 'exams'));
      return sortExamsByNewest(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ExamRecord, 'id'>),
        }))
      );
    }

    const [mineSnap, sharedSnap] = await Promise.all([
      getDocs(query(collection(db, 'exams'), where('nguoiTaoUid', '==', profile.uid))),
      getDocs(query(collection(db, 'exams'), where('chiaSeKho', '==', true))),
    ]);

    const merged = new Map<string, ExamRecord>();
    mineSnap.docs.forEach((d) =>
      merged.set(d.id, { id: d.id, ...(d.data() as Omit<ExamRecord, 'id'>) })
    );
    sharedSnap.docs.forEach((d) =>
      merged.set(d.id, { id: d.id, ...(d.data() as Omit<ExamRecord, 'id'>) })
    );

    return sortExamsByNewest(Array.from(merged.values()));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'exams');
  }
}

export function generateNewExamId(): string {
  return doc(collection(db, 'exams')).id;
}

function sanitizeExamConfigForFirestore(config: ExamConfig): ExamConfig {
  const cleaned: ExamConfig = {
    monHoc: config.monHoc,
    khoiLop: config.khoiLop,
    thoiDiemKiemTra: config.thoiDiemKiemTra,
    thoiGianLamBai: config.thoiGianLamBai,
    chuDeKienThuc: config.chuDeKienThuc,
    tyLeMucDo: config.tyLeMucDo,
    soCauTracNghiem: config.soCauTracNghiem,
    soCauTuLuan: config.soCauTuLuan,
    cacDangTracNghiem: config.cacDangTracNghiem,
  };
  if (config.namHoc) cleaned.namHoc = config.namHoc;
  if (config.boSach) cleaned.boSach = config.boSach;
  if (config.yeuCauBoSung) cleaned.yeuCauBoSung = config.yeuCauBoSung;
  return cleaned;
}

export async function saveExamToFirestore(
  profile: UserProfile,
  input: SaveExamInput,
  examId: string
): Promise<string> {
  const targetId = (examId || '').trim() || generateNewExamId();
  const path = `exams/${targetId}`;
  try {
    const examRef = doc(db, 'exams', targetId);
    const existingSnap = await getDoc(examRef);
    const cleanTitle = input.tieuDe.trim().slice(0, 220);
    const cleanConfig = sanitizeExamConfigForFirestore(input.config);

    if (existingSnap.exists()) {
      const updatePayload: Record<string, unknown> = {
        tieuDe: cleanTitle,
        config: cleanConfig,
        maTran: input.maTran,
        banDacTa: input.banDacTa,
        deKiemTra: input.deKiemTra,
        tongDiem: roundScore(input.tongDiem),
        toKhoi: input.toKhoi || profile.toKhoi || '',
        chiaSeKho: Boolean(input.chiaSeKho),
        trangThai: input.trangThai,
        ngayCapNhat: serverTimestamp(),
      };
      if (input.materialId !== undefined) {
        updatePayload.materialId = input.materialId;
      }
      await setDoc(examRef, updatePayload, { merge: true });
      return targetId;
    }

    const createPayload: Record<string, unknown> = {
      tieuDe: cleanTitle,
      config: cleanConfig,
      maTran: input.maTran,
      banDacTa: input.banDacTa,
      deKiemTra: input.deKiemTra,
      tongDiem: roundScore(input.tongDiem),
      nguoiTaoUid: profile.uid,
      nguoiTaoTen: profile.hoTen?.trim() || 'Giáo viên',
      toKhoi: input.toKhoi || profile.toKhoi || '',
      chiaSeKho: Boolean(input.chiaSeKho),
      trangThai: input.trangThai,
      materialId: input.materialId || '',
      ngayTao: serverTimestamp(),
      ngayCapNhat: serverTimestamp(),
    };

    await setDoc(examRef, createPayload);
    return targetId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateExamInFirestore(
  examId: string,
  updates: Partial<SaveExamInput>
): Promise<void> {
  const path = `exams/${examId}`;
  try {
    const cleanUpdates: Record<string, unknown> = {
      ngayCapNhat: serverTimestamp(),
    };

    if (updates.tieuDe !== undefined) {
      cleanUpdates.tieuDe = updates.tieuDe.trim().slice(0, 220);
    }
    if (updates.config !== undefined) {
      cleanUpdates.config = sanitizeExamConfigForFirestore(updates.config);
    }
    if (updates.maTran !== undefined) cleanUpdates.maTran = updates.maTran;
    if (updates.banDacTa !== undefined) cleanUpdates.banDacTa = updates.banDacTa;
    if (updates.deKiemTra !== undefined) cleanUpdates.deKiemTra = updates.deKiemTra;
    if (updates.tongDiem !== undefined) cleanUpdates.tongDiem = roundScore(updates.tongDiem);
    if (updates.toKhoi !== undefined) cleanUpdates.toKhoi = updates.toKhoi;
    if (updates.chiaSeKho !== undefined) cleanUpdates.chiaSeKho = updates.chiaSeKho;
    if (updates.trangThai !== undefined) cleanUpdates.trangThai = updates.trangThai;
    if (updates.materialId !== undefined) cleanUpdates.materialId = updates.materialId;

    await updateDoc(doc(db, 'exams', examId), cleanUpdates);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteExamFromFirestore(examId: string): Promise<void> {
  const path = `exams/${examId}`;
  try {
    await deleteDoc(doc(db, 'exams', examId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function buildExamLibraryUrl(examId: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://hoclieuso.vn';
  return `${origin}/#/de-kiem-tra/${examId}`;
}

export async function findExistingLibraryMaterialByTitle(
  uid: string,
  tieuDe: string
): Promise<LearningMaterial | null> {
  const path = 'materials';
  const normalizedTarget = tieuDe.trim().slice(0, 200).toLowerCase();
  if (!normalizedTarget) return null;

  try {
    const q = query(collection(db, 'materials'), where('nguoiDangUid', '==', uid));
    const snap = await getDocs(q);
    const matches: LearningMaterial[] = [];

    snap.docs.forEach((d) => {
      const data = d.data() as Omit<LearningMaterial, 'id'>;
      const candidateTitle = String(data.tieuDe || '').trim().toLowerCase();
      if (candidateTitle === normalizedTarget) {
        matches.push({ id: d.id, ...data });
      }
    });

    if (matches.length === 0) return null;

    matches.sort((a, b) => {
      const ta = a.ngayCapNhat?.toMillis?.() ?? a.ngayTao?.toMillis?.() ?? 0;
      const tb = b.ngayCapNhat?.toMillis?.() ?? b.ngayTao?.toMillis?.() ?? 0;
      return tb - ta;
    });

    return matches[0];
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export function canOverwriteLibraryMaterial(
  profile: UserProfile,
  existing: LearningMaterial
): boolean {
  if (profile.vaiTro === 'quanTri') return true;
  if (existing.nguoiDangUid !== profile.uid) return false;
  if (profile.vaiTro === 'toTruong') {
    return (
      existing.toKhoi === profile.toKhoi &&
      ['nhap', 'choDuyet', 'daDuyet', 'tuChoi'].includes(existing.trangThai)
    );
  }
  return ['nhap', 'choDuyet', 'tuChoi'].includes(existing.trangThai);
}

export interface ShareExamOptions {
  targetStatus?: 'choDuyet' | 'daDuyet';
  overwriteMaterialId?: string;
  forceNew?: boolean;
}

export async function shareExamToLibrary(
  profile: UserProfile,
  exam: ExamRecord,
  options: ShareExamOptions = {}
): Promise<string> {
  const targetStatus = options.targetStatus ?? 'choDuyet';
  const cleanTitle = exam.tieuDe.trim().slice(0, 200);
  const moTa = `Bộ đề kiểm tra ${exam.config.thoiDiemKiemTra} môn ${exam.config.monHoc} lớp ${exam.config.khoiLop} (${exam.config.thoiGianLamBai} phút) kèm Ma trận, Bản đặc tả GDPT 2018 và Đáp án biểu điểm.`;
  const tags = [
    'de-kiem-tra-ai',
    exam.config.monHoc.toLowerCase().slice(0, 50),
    `khoi-${exam.config.khoiLop}`,
  ].slice(0, 10);
  const url = buildExamLibraryUrl(exam.id);
  const toKhoi = exam.toKhoi || profile.toKhoi;

  const materialId = options.overwriteMaterialId
    ? options.overwriteMaterialId
    : options.forceNew
      ? doc(collection(db, 'materials')).id
      : exam.materialId || `exam_${exam.id}`;

  const matPath = `materials/${materialId}`;
  const matRef = doc(db, 'materials', materialId);

  try {
    const existingSnap = await getDoc(matRef);

    if (existingSnap.exists()) {
      const existingData = existingSnap.data() as Partial<LearningMaterial>;
      const existingStatus = existingData.trangThai;
      const updatePayload: Record<string, unknown> = {
        tieuDe: cleanTitle,
        moTa,
        monHoc: exam.config.monHoc,
        khoiLop: exam.config.khoiLop,
        loai: 'Đề kiểm tra',
        the: tags,
        loaiNguon: 'lienKet',
        url,
        tenTep: '',
        kichThuocTep: 0,
        duongDanStorage: '',
        toKhoi,
        lyDoTuChoi: '',
        ngayCapNhat: serverTimestamp(),
      };

      if (profile.vaiTro === 'toTruong' && existingStatus === 'daDuyet') {
        updatePayload.trangThai = 'daDuyet';
        updatePayload.ngayDuyet = serverTimestamp();
        updatePayload.nguoiDuyetUid = profile.uid;
        updatePayload.nguoiDuyetTen = profile.hoTen?.trim() || 'Tổ trưởng / BGH';
      } else if (profile.vaiTro === 'quanTri' && existingStatus) {
        updatePayload.trangThai = existingStatus;
      } else {
        updatePayload.trangThai = targetStatus;
      }

      await setDoc(matRef, updatePayload, { merge: true });
    } else {
      const isApprovedNow = targetStatus === 'daDuyet';
      const reviewerName = profile.hoTen?.trim() || 'Tổ trưởng / BGH';
      await setDoc(matRef, {
        tieuDe: cleanTitle,
        moTa,
        monHoc: exam.config.monHoc,
        khoiLop: exam.config.khoiLop,
        loai: 'Đề kiểm tra',
        the: tags,
        loaiNguon: 'lienKet',
        url,
        tenTep: '',
        kichThuocTep: 0,
        duongDanStorage: '',
        nguoiDangUid: profile.uid,
        nguoiDangTen: profile.hoTen?.trim() || 'Giáo viên',
        toKhoi,
        trangThai: targetStatus,
        lyDoTuChoi: '',
        luotXem: 0,
        luotTai: 0,
        ngayTao: serverTimestamp(),
        ngayCapNhat: serverTimestamp(),
        ngayDuyet: isApprovedNow ? serverTimestamp() : null,
        nguoiDuyetUid: isApprovedNow ? profile.uid : '',
        nguoiDuyetTen: isApprovedNow ? reviewerName : '',
        isSample: false,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, matPath);
  }

  await setDoc(
    doc(db, 'exams', exam.id),
    {
      chiaSeKho: true,
      trangThai: 'chiaSeKho',
      materialId,
      ngayCapNhat: serverTimestamp(),
    },
    { merge: true }
  );

  return materialId;
}
