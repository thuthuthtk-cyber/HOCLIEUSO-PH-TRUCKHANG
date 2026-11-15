import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  deleteObject,
  ref,
} from 'firebase/storage';
import { db, handleFirestoreError, OperationType, storage } from '../config/firebase';
import {
  DEFAULT_DEPARTMENTS,
  DEFAULT_SUBJECTS,
  type GradeLevel,
  type LearningMaterial,
  type MaterialCategory,
  type MaterialInput,
  type MaterialStatus,
  type UserProfile,
} from '../types/hocLieu';

function sortByNewest(list: LearningMaterial[]): LearningMaterial[] {
  return [...list].sort((a, b) => {
    const ta = a.ngayTao?.toMillis?.() ?? 0;
    const tb = b.ngayTao?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

export function subscribeMaterialsForUser(
  profile: UserProfile,
  onData: (materials: LearningMaterial[]) => void,
  onError: () => void
): Unsubscribe {
  if (profile.vaiTro === 'quanTri') {
    return onSnapshot(
      collection(db, 'materials'),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<LearningMaterial, 'id'>),
        }));
        onData(sortByNewest(list));
      },
      (err) => {
        onError();
        handleFirestoreError(err, OperationType.LIST, 'materials');
      }
    );
  }

  const buckets = new Map<string, Map<string, LearningMaterial>>();
  const syncAll = () => {
    const merged = new Map<string, LearningMaterial>();
    buckets.forEach((m) => {
      m.forEach((item, id) => merged.set(id, item));
    });
    onData(sortByNewest(Array.from(merged.values())));
  };

  const queries = [
    {
      key: 'school',
      q: query(collection(db, 'materials'), where('trangThai', '==', 'chiaSeToanTruong')),
    },
    {
      key: 'mine',
      q: query(collection(db, 'materials'), where('nguoiDangUid', '==', profile.uid)),
    },
    profile.vaiTro === 'toTruong'
      ? {
          key: 'dept',
          q: query(collection(db, 'materials'), where('toKhoi', '==', profile.toKhoi)),
        }
      : {
          key: 'dept',
          q: query(
            collection(db, 'materials'),
            where('toKhoi', '==', profile.toKhoi),
            where('trangThai', '==', 'daDuyet')
          ),
        },
  ];

  const unsubs = queries.map(({ key, q }) =>
    onSnapshot(
      q,
      (snap) => {
        const m = new Map<string, LearningMaterial>();
        snap.docs.forEach((d) => {
          m.set(d.id, { id: d.id, ...(d.data() as Omit<LearningMaterial, 'id'>) });
        });
        buckets.set(key, m);
        syncAll();
      },
      (err) => {
        onError();
        handleFirestoreError(err, OperationType.LIST, 'materials');
      }
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function createMaterial(profile: UserProfile, input: MaterialInput): Promise<string> {
  const path = 'materials';
  const isApprovedNow = input.trangThai === 'daDuyet';
  const reviewerName = profile.hoTen?.trim() || 'Tổ trưởng / BGH';
  const isGame = input.loaiNguon === 'troChoi';

  try {
    const materialRef = doc(collection(db, 'materials'));
    const cleanTitle = input.tieuDe.trim().slice(0, 200);
    const cleanShareCode = (input.maChiaSe || '').trim();
    const cleanHtml = input.htmlTroChoi || '';
    const cleanGameType = (input.dangTroChoi || 'Trắc nghiệm').trim().slice(0, 60);
    const shareEnabled = Boolean(input.chiaSeLink);

    const payload: Record<string, unknown> = {
      tieuDe: cleanTitle,
      moTa: input.moTa.trim().slice(0, 2000),
      monHoc: input.monHoc,
      khoiLop: input.khoiLop,
      loai: input.loai,
      the: input.the.slice(0, 10),
      loaiNguon: input.loaiNguon,
      url: input.url.trim().slice(0, 2000),
      tenTep: input.tenTep.slice(0, 255),
      kichThuocTep: input.kichThuocTep,
      duongDanStorage: input.duongDanStorage.slice(0, 500),
      nguoiDangUid: profile.uid,
      nguoiDangTen: profile.hoTen?.trim() || 'Giáo viên',
      toKhoi: input.toKhoi,
      trangThai: input.trangThai,
      lyDoTuChoi: '',
      luotXem: 0,
      luotTai: 0,
      ngayTao: serverTimestamp(),
      ngayCapNhat: serverTimestamp(),
      ngayDuyet: isApprovedNow ? serverTimestamp() : null,
      nguoiDuyetUid: isApprovedNow ? profile.uid : '',
      nguoiDuyetTen: isApprovedNow ? reviewerName : '',
      isSample: false,
    };

    if (isGame) {
      if (input.tenBaiHoc !== undefined) {
        payload.tenBaiHoc = input.tenBaiHoc.trim().slice(0, 150);
      }
      payload.htmlTroChoi = cleanHtml;
      payload.maChiaSe = cleanShareCode;
      payload.chiaSeLink = shareEnabled;
      payload.dangTroChoi = cleanGameType;
    }

    const batch = writeBatch(db);
    batch.set(materialRef, payload);

    if (isGame && cleanShareCode) {
      batch.set(doc(db, 'public_games', cleanShareCode), {
        maChiaSe: cleanShareCode,
        materialId: materialRef.id,
        tieuDe: cleanTitle,
        monHoc: input.monHoc,
        khoiLop: input.khoiLop,
        dangTroChoi: cleanGameType,
        htmlTroChoi: cleanHtml,
        chiaSeLink: shareEnabled,
        nguoiDangUid: profile.uid,
        toKhoi: input.toKhoi,
        ngayTao: serverTimestamp(),
        ngayCapNhat: serverTimestamp(),
      });
    }

    await batch.commit();
    return materialRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateMaterial(
  materialId: string,
  input: MaterialInput,
  reviewer?: UserProfile
): Promise<void> {
  const path = `materials/${materialId}`;
  const isApprovedNow = input.trangThai === 'daDuyet' && Boolean(reviewer);
  const cleanTitle = input.tieuDe.trim().slice(0, 200);
  const updates: Record<string, unknown> = {
    tieuDe: cleanTitle,
    moTa: input.moTa.trim().slice(0, 2000),
    monHoc: input.monHoc,
    khoiLop: input.khoiLop,
    loai: input.loai,
    the: input.the.slice(0, 10),
    loaiNguon: input.loaiNguon,
    url: input.url.trim().slice(0, 2000),
    tenTep: input.tenTep.slice(0, 255),
    kichThuocTep: input.kichThuocTep,
    duongDanStorage: input.duongDanStorage.slice(0, 500),
    toKhoi: input.toKhoi,
    trangThai: input.trangThai,
    lyDoTuChoi: '',
    ngayCapNhat: serverTimestamp(),
  };

  if (input.loaiNguon === 'troChoi') {
    if (input.tenBaiHoc !== undefined) updates.tenBaiHoc = input.tenBaiHoc.trim().slice(0, 150);
    if (input.htmlTroChoi !== undefined) updates.htmlTroChoi = input.htmlTroChoi;
    if (input.chiaSeLink !== undefined) updates.chiaSeLink = input.chiaSeLink;
    if (input.dangTroChoi !== undefined) updates.dangTroChoi = input.dangTroChoi.slice(0, 60);
  }

  if (isApprovedNow && reviewer) {
    updates.ngayDuyet = serverTimestamp();
    updates.nguoiDuyetUid = reviewer.uid;
    updates.nguoiDuyetTen = reviewer.hoTen?.trim() || 'Tổ trưởng / BGH';
  }

  try {
    if (input.loaiNguon === 'troChoi' && input.maChiaSe) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'materials', materialId), updates);
      const publicUpdates: Record<string, unknown> = {
        tieuDe: cleanTitle,
        monHoc: input.monHoc,
        khoiLop: input.khoiLop,
        ngayCapNhat: serverTimestamp(),
      };
      if (input.htmlTroChoi !== undefined) publicUpdates.htmlTroChoi = input.htmlTroChoi;
      if (input.chiaSeLink !== undefined) publicUpdates.chiaSeLink = input.chiaSeLink;
      if (input.dangTroChoi !== undefined) {
        publicUpdates.dangTroChoi = input.dangTroChoi.slice(0, 60);
      }
      batch.update(doc(db, 'public_games', input.maChiaSe), publicUpdates);
      await batch.commit();
      return;
    }

    await updateDoc(doc(db, 'materials', materialId), updates);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteMaterial(material: LearningMaterial): Promise<void> {
  const path = `materials/${material.id}`;
  try {
    if (material.loaiNguon === 'troChoi' && material.maChiaSe) {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'materials', material.id));
      batch.delete(doc(db, 'public_games', material.maChiaSe));
      await batch.commit();
    } else {
      await deleteDoc(doc(db, 'materials', material.id));
    }

    if (material.duongDanStorage) {
      try {
        await deleteObject(ref(storage, material.duongDanStorage));
      } catch {
        // Bỏ qua nếu Storage chưa kích hoạt hoặc tệp đã bị xóa trước đó
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function submitDraftMaterial(materialId: string): Promise<void> {
  const path = `materials/${materialId}`;
  try {
    await updateDoc(doc(db, 'materials', materialId), {
      trangThai: 'choDuyet',
      lyDoTuChoi: '',
      ngayCapNhat: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function moderateMaterial(
  materialId: string,
  newStatus: 'daDuyet' | 'chiaSeToanTruong' | 'tuChoi',
  reviewer: UserProfile,
  rejectReason = ''
): Promise<void> {
  const path = `materials/${materialId}`;
  try {
    await updateDoc(doc(db, 'materials', materialId), {
      trangThai: newStatus,
      lyDoTuChoi: newStatus === 'tuChoi' ? rejectReason.trim().slice(0, 1000) : '',
      ngayDuyet: newStatus === 'tuChoi' ? null : serverTimestamp(),
      nguoiDuyetUid: reviewer.uid,
      nguoiDuyetTen: reviewer.hoTen,
      ngayCapNhat: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function incrementMaterialCounter(
  materialId: string,
  field: 'luotXem' | 'luotTai'
): Promise<void> {
  try {
    await updateDoc(doc(db, 'materials', materialId), {
      [field]: increment(1),
    });
  } catch {
    // Không làm gián đoạn trải nghiệm xem/tải nếu bộ đếm gặp lỗi mạng tạm thời
  }
}

export async function seedDefaultCatalogs(): Promise<{
  subjectsAdded: number;
  departmentsAdded: number;
}> {
  let subjectsAdded = 0;
  let departmentsAdded = 0;

  try {
    const [subSnap, deptSnap] = await Promise.all([
      getDocs(collection(db, 'subjects')),
      getDocs(collection(db, 'departments')),
    ]);

    const batch = writeBatch(db);

    if (subSnap.empty) {
      DEFAULT_SUBJECTS.forEach((item, idx) => {
        const refDoc = doc(db, 'subjects', `mon-${idx + 1}`);
        batch.set(refDoc, {
          ten: item.ten,
          thuTu: item.thuTu,
          kichHoat: true,
          isSample: false,
          ngayTao: serverTimestamp(),
          ngayCapNhat: serverTimestamp(),
        });
        subjectsAdded += 1;
      });
    }

    if (deptSnap.empty) {
      DEFAULT_DEPARTMENTS.forEach((item, idx) => {
        const refDoc = doc(db, 'departments', `to-${idx + 1}`);
        batch.set(refDoc, {
          ten: item.ten,
          moTa: item.moTa,
          thuTu: item.thuTu,
          kichHoat: true,
          isSample: false,
          ngayTao: serverTimestamp(),
          ngayCapNhat: serverTimestamp(),
        });
        departmentsAdded += 1;
      });
    }

    if (subjectsAdded > 0 || departmentsAdded > 0) {
      await batch.commit();
    }

    return { subjectsAdded, departmentsAdded };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'subjects|departments');
  }
}

interface SampleMaterialSeed {
  id: string;
  tieuDe: string;
  moTa: string;
  monHoc: string;
  khoiLop: GradeLevel;
  loai: MaterialCategory;
  the: string[];
  url: string;
  toKhoi: string;
  trangThai: MaterialStatus;
  lyDoTuChoi: string;
  nguoiDangTen: string;
}

const SAMPLE_MATERIALS: SampleMaterialSeed[] = [
  {
    id: 'sample-mat-1',
    tieuDe: 'Bài giảng PowerPoint: Phép cộng các số trong phạm vi 10 000',
    moTa: 'Bài giảng điện tử thiết kế sinh động kèm phần khởi động trò chơi đố vui và phiếu bài tập luyện tập trên lớp dành cho học sinh lớp 3.',
    monHoc: 'Toán',
    khoiLop: '3',
    loai: 'Bài giảng điện tử',
    the: ['toan-3', 'phep-cong', 'powerpoint', 'gdpt-2018'],
    url: 'https://docs.google.com/presentation/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
    toKhoi: 'Khối 3',
    trangThai: 'chiaSeToanTruong',
    lyDoTuChoi: '',
    nguoiDangTen: 'Cô Nguyễn Thị Lan (Mẫu)',
  },
  {
    id: 'sample-mat-2',
    tieuDe: 'Bộ thẻ hình minh họa ghép vần - Chủ điểm Gia đình',
    moTa: 'Tổng hợp thẻ chữ cái và hình ảnh trực quan giúp học sinh lớp 1 nhận diện vần mới nhanh, phù hợp trình chiếu trên bảng tương tác.',
    monHoc: 'Tiếng Việt',
    khoiLop: '1',
    loai: 'Hình ảnh',
    the: ['tieng-viet-1', 'tap-doc', 'ghep-van', 'the-hinh'],
    url: 'https://www.canva.com/',
    toKhoi: 'Khối 1',
    trangThai: 'chiaSeToanTruong',
    lyDoTuChoi: '',
    nguoiDangTen: 'Cô Trần Minh Thu (Mẫu)',
  },
  {
    id: 'sample-mat-3',
    tieuDe: 'Bài tập tương tác Tiếng Anh 4: Unit 5 - Things We Can Do',
    moTa: 'Trò chơi trắc nghiệm ôn tập từ vựng và mẫu câu hỏi đáp về khả năng hành động, sử dụng được cả trên máy tính và điện thoại.',
    monHoc: 'Tiếng Anh',
    khoiLop: '4',
    loai: 'Bài tập tương tác',
    the: ['tieng-anh-4', 'unit-5', 'tu-vung', 'tuong-tac'],
    url: 'https://quizizz.com/',
    toKhoi: 'Tổ Chuyên biệt',
    trangThai: 'chiaSeToanTruong',
    lyDoTuChoi: '',
    nguoiDangTen: 'Thầy Phạm Đức Anh (Mẫu)',
  },
  {
    id: 'sample-mat-4',
    tieuDe: 'Video thí nghiệm: Sự biến đổi hóa học của một số chất quen thuộc',
    moTa: 'Video minh họa trực quan thí nghiệm giấm ăn tác dụng với vỏ trứng và hiện tượng gỉ sét sắt, phục vụ tiết Khoa học lớp 5.',
    monHoc: 'Khoa học',
    khoiLop: '5',
    loai: 'Video',
    the: ['khoa-hoc-5', 'thi-nghiem', 'bien-doi-hoa-hoc'],
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    toKhoi: 'Khối 5',
    trangThai: 'daDuyet',
    lyDoTuChoi: '',
    nguoiDangTen: 'Cô Lê Hải Yến (Mẫu)',
  },
  {
    id: 'sample-mat-5',
    tieuDe: 'Giáo án Tin học 3: Làm quen với chuột máy tính và tư thế ngồi đúng',
    moTa: 'Kế hoạch bài dạy chi tiết theo Công văn 2345, tích hợp phần thực hành kéo thả chuột an toàn cho học sinh tiểu học.',
    monHoc: 'Tin học',
    khoiLop: '3',
    loai: 'Giáo án',
    the: ['tin-hoc-3', 'chuot-may-tinh', 'cv-2345'],
    url: 'https://drive.google.com/',
    toKhoi: 'Tổ Chuyên biệt',
    trangThai: 'daDuyet',
    lyDoTuChoi: '',
    nguoiDangTen: 'Thầy Vũ Hoàng Nam (Mẫu)',
  },
  {
    id: 'sample-mat-6',
    tieuDe: 'Đề kiểm tra giữa học kì II môn Toán lớp 2 (Có ma trận và đáp án)',
    moTa: 'Bộ đề tham khảo gồm 2 phần trắc nghiệm và tự luận theo 3 mức độ nhận thức, kèm hướng dẫn chấm chi tiết.',
    monHoc: 'Toán',
    khoiLop: '2',
    loai: 'Đề kiểm tra',
    the: ['toan-2', 'de-kiem-tra', 'giua-ki-2', 'ma-tran'],
    url: 'https://drive.google.com/',
    toKhoi: 'Khối 2',
    trangThai: 'choDuyet',
    lyDoTuChoi: '',
    nguoiDangTen: 'Cô Đỗ Thanh Hương (Mẫu)',
  },
  {
    id: 'sample-mat-7',
    tieuDe: 'Bài giảng Âm nhạc 4: Học hát bài Em yêu hòa bình',
    moTa: 'Slide giảng dạy có kèm nhạc đệm beat chuẩn, phân tích tiết tấu gõ đệm theo phách và nhịp.',
    monHoc: 'Âm nhạc',
    khoiLop: '4',
    loai: 'Bài giảng điện tử',
    the: ['am-nhac-4', 'em-yeu-hoa-binh', 'beat-nhac'],
    url: 'https://www.canva.com/',
    toKhoi: 'Tổ Chuyên biệt',
    trangThai: 'choDuyet',
    lyDoTuChoi: '',
    nguoiDangTen: 'Cô Hoàng Ngọc Mai (Mẫu)',
  },
  {
    id: 'sample-mat-8',
    tieuDe: 'Giáo án Tự nhiên và Xã hội 1: An toàn khi tham gia giao thông',
    moTa: 'Bài dạy giúp học sinh nhận biết đèn tín hiệu giao thông và quy tắc đi bộ qua đường an toàn.',
    monHoc: 'Tự nhiên và Xã hội',
    khoiLop: '1',
    loai: 'Giáo án',
    the: ['tnxh-1', 'an-toan-giao-thong'],
    url: 'https://drive.google.com/',
    toKhoi: 'Khối 1',
    trangThai: 'tuChoi',
    lyDoTuChoi:
      'Vui lòng bổ sung thêm hình ảnh biển báo giao thông đường bộ mới nhất và câu hỏi tình huống phân hiệu Trực Khang.',
    nguoiDangTen: 'Cô Nguyễn Thị Lan (Mẫu)',
  },
  {
    id: 'sample-mat-9',
    tieuDe: 'Phiếu luyện tập Đạo đức 2: Kính trọng thầy giáo, cô giáo',
    moTa: 'Phiếu học tập có hình minh họa tình huống ứng xử lễ phép trong trường học dành cho học sinh lớp 2.',
    monHoc: 'Đạo đức',
    khoiLop: '2',
    loai: 'Bài tập tương tác',
    the: ['dao-duc-2', 'kinh-trong-thay-co'],
    url: 'https://docs.google.com/',
    toKhoi: 'Khối 2',
    trangThai: 'chiaSeToanTruong',
    lyDoTuChoi: '',
    nguoiDangTen: 'Cô Đỗ Thanh Hương (Mẫu)',
  },
];

export async function createSampleData(adminProfile: UserProfile): Promise<number> {
  await seedDefaultCatalogs();

  try {
    const batch = writeBatch(db);
    SAMPLE_MATERIALS.forEach((item) => {
      const refDoc = doc(db, 'materials', item.id);
      const isApproved = item.trangThai === 'daDuyet' || item.trangThai === 'chiaSeToanTruong';
      batch.set(refDoc, {
        tieuDe: item.tieuDe,
        moTa: item.moTa,
        monHoc: item.monHoc,
        khoiLop: item.khoiLop,
        loai: item.loai,
        the: item.the,
        loaiNguon: 'lienKet',
        url: item.url,
        tenTep: '',
        kichThuocTep: 0,
        duongDanStorage: '',
        nguoiDangUid: adminProfile.uid,
        nguoiDangTen: item.nguoiDangTen,
        toKhoi: item.toKhoi,
        trangThai: item.trangThai,
        lyDoTuChoi: item.lyDoTuChoi,
        luotXem: 0,
        luotTai: 0,
        ngayTao: serverTimestamp(),
        ngayCapNhat: serverTimestamp(),
        ngayDuyet: isApproved ? serverTimestamp() : null,
        nguoiDuyetUid: isApproved ? adminProfile.uid : '',
        nguoiDuyetTen: isApproved ? adminProfile.hoTen || 'Quản trị viên' : '',
        isSample: true,
      });
    });

    await batch.commit();
    return SAMPLE_MATERIALS.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'materials');
  }
}

export async function syncSampleMaterialsWithAddDoc(
  adminProfile: UserProfile
): Promise<{ added: number; skipped: number }> {
  const path = 'materials';
  try {
    const existingSnap = await getDocs(collection(db, path));
    const existingTitles = new Set(
      existingSnap.docs.map((d) => String(d.data().tieuDe || '').trim().toLowerCase())
    );

    let added = 0;
    let skipped = 0;

    for (const item of SAMPLE_MATERIALS) {
      if (existingTitles.has(item.tieuDe.trim().toLowerCase())) {
        skipped += 1;
        continue;
      }
      const isApproved = item.trangThai === 'daDuyet' || item.trangThai === 'chiaSeToanTruong';
      await addDoc(collection(db, path), {
        tieuDe: item.tieuDe,
        moTa: item.moTa,
        monHoc: item.monHoc,
        khoiLop: item.khoiLop,
        loai: item.loai,
        the: item.the,
        loaiNguon: 'lienKet',
        url: item.url,
        tenTep: '',
        kichThuocTep: 0,
        duongDanStorage: '',
        nguoiDangUid: adminProfile.uid,
        nguoiDangTen: item.nguoiDangTen,
        toKhoi: item.toKhoi,
        trangThai: item.trangThai,
        lyDoTuChoi: item.lyDoTuChoi,
        luotXem: 0,
        luotTai: 0,
        ngayTao: serverTimestamp(),
        ngayCapNhat: serverTimestamp(),
        ngayDuyet: isApproved ? serverTimestamp() : null,
        nguoiDuyetUid: isApproved ? adminProfile.uid : '',
        nguoiDuyetTen: isApproved ? adminProfile.hoTen || 'Quản trị viên' : '',
        isSample: true,
      });
      added += 1;
    }

    return { added, skipped };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function clearSampleData(): Promise<number> {
  try {
    const q = query(collection(db, 'materials'), where('isSample', '==', true));
    const snap = await getDocs(q);

    if (snap.empty) {
      return 0;
    }

    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
      batch.delete(d.ref);
    });
    await batch.commit();
    return snap.size;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'materials');
  }
}
