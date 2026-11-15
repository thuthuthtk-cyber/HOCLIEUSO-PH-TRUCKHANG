import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  getSecondaryAuth,
  handleFirestoreError,
  OperationType,
} from '../config/firebase';
import type {
  DepartmentItem,
  SubjectItem,
  UserProfile,
  UserRole,
} from '../types/hocLieu';
import {
  mapTeacherRoleToVaiTro,
  mapVaiTroToTeacherRole,
  type Teacher,
  type TeacherInput,
} from '../types/user';

function docToTeacher(id: string, data: DocumentData): Teacher {
  const role = data.role || mapVaiTroToTeacherRole(data.vaiTro);
  return {
    id,
    uid: data.uid || '',
    maGV: data.maGV || '',
    hoTen: data.hoTen || '',
    cccd: data.cccd || '',
    ngaySinh: data.ngaySinh || '',
    email: data.email || '',
    soDienThoai: data.soDienThoai || '',
    chucVu: data.chucVu || (role === 'ADMIN' ? 'Quản trị viên (ADMIN)' : role === 'TO_TRUONG' ? 'Tổ trưởng chuyên môn' : 'Giáo viên'),
    toChuyenMon: data.toChuyenMon || data.toKhoi || '',
    role,
    biKhoa: Boolean(data.biKhoa),
    yeuCauDoiMatKhau: Boolean(data.yeuCauDoiMatKhau),
  };
}

/**
 * Lấy danh sách toàn bộ giáo viên từ collection `users` trên Firestore
 */
export async function getTeachers(): Promise<Teacher[]> {
  const path = 'users';
  try {
    const snap = await getDocs(collection(db, path));
    const list = snap.docs.map((d) => docToTeacher(d.id, d.data()));
    return list.sort((a, b) => a.hoTen.localeCompare(b.hoTen, 'vi'));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

/**
 * Lắng nghe danh sách giáo viên thời gian thực từ collection `users` trên Firestore
 */
export function subscribeTeachers(
  onData: (teachers: Teacher[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const path = 'users';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const list = snap.docs.map((d) => docToTeacher(d.id, d.data()));
      list.sort((a, b) => a.hoTen.localeCompare(b.hoTen, 'vi'));
      onData(list);
    },
    (err) => {
      onError?.(err);
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

/**
 * Lấy danh sách giáo viên thuộc cùng một Tổ chuyên môn (phục vụ chia sẻ tài liệu cùng tổ)
 */
export async function getTeachersByTo(toChuyenMon: string): Promise<Teacher[]> {
  const path = 'users';
  try {
    const q = query(collection(db, path), where('toChuyenMon', '==', toChuyenMon));
    const snap = await getDocs(q);

    // Fallback kiểm tra thêm trường `toKhoi` nếu dữ liệu cũ chưa có `toChuyenMon`
    let docs = snap.docs;
    if (docs.length === 0) {
      const fallbackQ = query(collection(db, path), where('toKhoi', '==', toChuyenMon));
      const fallbackSnap = await getDocs(fallbackQ);
      docs = fallbackSnap.docs;
    }

    const list = docs.map((d) => docToTeacher(d.id, d.data()));
    return list.sort((a, b) => a.hoTen.localeCompare(b.hoTen, 'vi'));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

/**
 * Thêm giáo viên mới vào collection `users` bằng addDoc (hoặc đồng bộ Auth UID khi cấp tài khoản đăng nhập)
 */
export async function addTeacher(
  teacher: TeacherInput,
  tempPassword?: string
): Promise<Teacher> {
  const vaiTro = mapTeacherRoleToVaiTro(teacher.role);
  const cleanEmail = teacher.email.trim().toLowerCase();

  const basePayload = {
    maGV: teacher.maGV.trim().slice(0, 30),
    hoTen: teacher.hoTen.trim().slice(0, 120),
    cccd: teacher.cccd.trim().slice(0, 20),
    ngaySinh: teacher.ngaySinh.trim().slice(0, 20),
    email: cleanEmail.slice(0, 150),
    soDienThoai: teacher.soDienThoai.trim().slice(0, 20),
    chucVu: String(teacher.chucVu).trim().slice(0, 80),
    toChuyenMon: teacher.toChuyenMon.trim().slice(0, 80),
    role: teacher.role,
    vaiTro,
    toKhoi: teacher.toChuyenMon.trim().slice(0, 80),
    biKhoa: teacher.biKhoa ?? false,
    yeuCauDoiMatKhau: teacher.yeuCauDoiMatKhau ?? Boolean(tempPassword),
    ngayTao: serverTimestamp(),
    ngayCapNhat: serverTimestamp(),
  };

  if (tempPassword && tempPassword.trim().length >= 6) {
    const secondaryAuth = getSecondaryAuth();
    const cred = await createUserWithEmailAndPassword(
      secondaryAuth,
      cleanEmail,
      tempPassword.trim()
    );
    const targetUid = cred.user.uid;
    await signOut(secondaryAuth);

    const path = `users/${targetUid}`;
    try {
      await setDoc(doc(db, 'users', targetUid), {
        uid: targetUid,
        ...basePayload,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }

    return {
      id: targetUid,
      ...teacher,
      email: cleanEmail,
    };
  }

  try {
    const docRef = await addDoc(collection(db, 'users'), {
      uid: '',
      ...basePayload,
    });
    return {
      id: docRef.id,
      ...teacher,
      email: cleanEmail,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'users');
  }
}

const SAMPLE_BGH_TEACHERS: TeacherInput[] = [
  {
    maGV: 'BGH-01',
    hoTen: 'Nguyễn Văn Hùng',
    cccd: '036078001234',
    ngaySinh: '1978-05-12',
    email: 'hung.nv.bgh@quanghung.edu.vn',
    soDienThoai: '0912345601',
    chucVu: 'Hiệu trưởng (BGH)',
    toChuyenMon: 'Tổ Ban Giám Hiệu & Quản Trị Hệ Thống',
    role: 'ADMIN',
    biKhoa: false,
    yeuCauDoiMatKhau: false,
  },
  {
    maGV: 'BGH-02',
    hoTen: 'Trần Thị Minh Phương',
    cccd: '036182005678',
    ngaySinh: '1982-09-20',
    email: 'phuong.ttm.bgh@quanghung.edu.vn',
    soDienThoai: '0912345602',
    chucVu: 'Quản trị viên (ADMIN)',
    toChuyenMon: 'Tổ Ban Giám Hiệu & Quản Trị Hệ Thống',
    role: 'ADMIN',
    biKhoa: false,
    yeuCauDoiMatKhau: false,
  },
  {
    maGV: 'BGH-03',
    hoTen: 'Lê Thị Thu Hà',
    cccd: '036186009012',
    ngaySinh: '1986-11-08',
    email: 'ha.ltt.bgh@quanghung.edu.vn',
    soDienThoai: '0912345603',
    chucVu: 'Quản trị viên (ADMIN)',
    toChuyenMon: 'Tổ Ban Giám Hiệu & Quản Trị Hệ Thống',
    role: 'ADMIN',
    biKhoa: false,
    yeuCauDoiMatKhau: false,
  },
];

/**
 * Đẩy 3 cán bộ Ban Giám Hiệu mẫu lên collection `users` bằng addDoc
 */
export async function syncSampleBghTeachers(): Promise<{ added: number; skipped: number }> {
  const path = 'users';
  try {
    const existingSnap = await getDocs(collection(db, path));
    const existingEmails = new Set(
      existingSnap.docs.map((d) => String(d.data().email || '').trim().toLowerCase())
    );

    let added = 0;
    let skipped = 0;

    for (const item of SAMPLE_BGH_TEACHERS) {
      const cleanEmail = item.email.trim().toLowerCase();
      if (existingEmails.has(cleanEmail)) {
        skipped += 1;
        continue;
      }

      await addDoc(collection(db, path), {
        uid: '',
        maGV: item.maGV,
        hoTen: item.hoTen,
        cccd: item.cccd,
        ngaySinh: item.ngaySinh,
        email: cleanEmail,
        soDienThoai: item.soDienThoai,
        chucVu: item.chucVu,
        toChuyenMon: item.toChuyenMon,
        role: item.role,
        vaiTro: mapTeacherRoleToVaiTro(item.role),
        toKhoi: item.toChuyenMon,
        biKhoa: false,
        yeuCauDoiMatKhau: false,
        ngayTao: serverTimestamp(),
        ngayCapNhat: serverTimestamp(),
      });
      added += 1;
    }

    return { added, skipped };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

const FULL_SAMPLE_TEACHERS: TeacherInput[] = [
  ...SAMPLE_BGH_TEACHERS,
  {
    maGV: 'GV-01',
    hoTen: 'Nguyễn Thị Lan',
    cccd: '036188002345',
    ngaySinh: '1988-03-15',
    email: 'lan.nt.k1@quanghung.edu.vn',
    soDienThoai: '0983112201',
    chucVu: 'Tổ trưởng chuyên môn',
    toChuyenMon: 'Tổ Chuyên Môn 1 (Khối Lớp 1)',
    role: 'TO_TRUONG',
    biKhoa: false,
    yeuCauDoiMatKhau: false,
  },
  {
    maGV: 'GV-02',
    hoTen: 'Trần Minh Thu',
    cccd: '036191003456',
    ngaySinh: '1991-07-22',
    email: 'thu.tm.k1@quanghung.edu.vn',
    soDienThoai: '0983112202',
    chucVu: 'Giáo viên',
    toChuyenMon: 'Tổ Chuyên Môn 1 (Khối Lớp 1)',
    role: 'GIAO_VIEN',
    biKhoa: false,
    yeuCauDoiMatKhau: false,
  },
  {
    maGV: 'GV-03',
    hoTen: 'Đỗ Thanh Hương',
    cccd: '036189004567',
    ngaySinh: '1989-10-11',
    email: 'huong.dt.k2@quanghung.edu.vn',
    soDienThoai: '0983112203',
    chucVu: 'Tổ trưởng chuyên môn',
    toChuyenMon: 'Tổ Chuyên Môn 2 (Khối Lớp 2)',
    role: 'TO_TRUONG',
    biKhoa: false,
    yeuCauDoiMatKhau: false,
  },
  {
    maGV: 'GV-04',
    hoTen: 'Phạm Thị Ngọc Ánh',
    cccd: '036190005678',
    ngaySinh: '1990-02-19',
    email: 'anh.ptn.k3@quanghung.edu.vn',
    soDienThoai: '0983112204',
    chucVu: 'Tổ trưởng chuyên môn',
    toChuyenMon: 'Tổ Chuyên Môn 3 (Khối Lớp 3)',
    role: 'TO_TRUONG',
    biKhoa: false,
    yeuCauDoiMatKhau: false,
  },
  {
    maGV: 'GV-05',
    hoTen: 'Hoàng Ngọc Mai',
    cccd: '036192006789',
    ngaySinh: '1992-06-05',
    email: 'mai.hn.k4@quanghung.edu.vn',
    soDienThoai: '0983112205',
    chucVu: 'Giáo viên',
    toChuyenMon: 'Tổ Chuyên Môn 4 (Khối Lớp 4)',
    role: 'GIAO_VIEN',
    biKhoa: false,
    yeuCauDoiMatKhau: false,
  },
  {
    maGV: 'GV-06',
    hoTen: 'Lê Hải Yến',
    cccd: '036187007890',
    ngaySinh: '1987-12-01',
    email: 'yen.lh.k5@quanghung.edu.vn',
    soDienThoai: '0983112206',
    chucVu: 'Tổ trưởng chuyên môn',
    toChuyenMon: 'Tổ Chuyên Môn 5 (Khối Lớp 5)',
    role: 'TO_TRUONG',
    biKhoa: false,
    yeuCauDoiMatKhau: false,
  },
  {
    maGV: 'GV-07',
    hoTen: 'Phạm Đức Anh',
    cccd: '036093008901',
    ngaySinh: '1993-04-18',
    email: 'anh.pd.cb@quanghung.edu.vn',
    soDienThoai: '0983112207',
    chucVu: 'Giáo viên',
    toChuyenMon: 'Tổ Chuyên Biệt',
    role: 'GIAO_VIEN',
    biKhoa: false,
    yeuCauDoiMatKhau: false,
  },
];

/**
 * Đẩy toàn bộ danh sách cán bộ/giáo viên mẫu các Tổ lên collection `users` bằng addDoc
 */
export async function syncAllSampleTeachers(): Promise<{ added: number; skipped: number }> {
  const path = 'users';
  try {
    const existingSnap = await getDocs(collection(db, path));
    const existingEmails = new Set(
      existingSnap.docs.map((d) => String(d.data().email || '').trim().toLowerCase())
    );

    let added = 0;
    let skipped = 0;

    for (const item of FULL_SAMPLE_TEACHERS) {
      const cleanEmail = item.email.trim().toLowerCase();
      if (existingEmails.has(cleanEmail)) {
        skipped += 1;
        continue;
      }

      await addDoc(collection(db, path), {
        uid: '',
        maGV: item.maGV,
        hoTen: item.hoTen,
        cccd: item.cccd,
        ngaySinh: item.ngaySinh,
        email: cleanEmail,
        soDienThoai: item.soDienThoai,
        chucVu: item.chucVu,
        toChuyenMon: item.toChuyenMon,
        role: item.role,
        vaiTro: mapTeacherRoleToVaiTro(item.role),
        toKhoi: item.toChuyenMon,
        biKhoa: false,
        yeuCauDoiMatKhau: false,
        ngayTao: serverTimestamp(),
        ngayCapNhat: serverTimestamp(),
      });
      added += 1;
    }

    return { added, skipped };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

/**
 * Cập nhật thông tin giáo viên trên Firestore
 */
export async function updateTeacher(
  id: string,
  updates: Partial<TeacherInput>
): Promise<void> {
  const path = `users/${id}`;
  const mapped: Record<string, unknown> = {
    ngayCapNhat: serverTimestamp(),
  };

  if (updates.maGV !== undefined) mapped.maGV = updates.maGV.trim().slice(0, 30);
  if (updates.hoTen !== undefined) mapped.hoTen = updates.hoTen.trim().slice(0, 120);
  if (updates.cccd !== undefined) mapped.cccd = updates.cccd.trim().slice(0, 20);
  if (updates.ngaySinh !== undefined) mapped.ngaySinh = updates.ngaySinh.trim().slice(0, 20);
  if (updates.email !== undefined) mapped.email = updates.email.trim().toLowerCase().slice(0, 150);
  if (updates.soDienThoai !== undefined) mapped.soDienThoai = updates.soDienThoai.trim().slice(0, 20);
  if (updates.chucVu !== undefined) mapped.chucVu = String(updates.chucVu).trim().slice(0, 80);
  if (updates.toChuyenMon !== undefined) {
    const cleanDept = updates.toChuyenMon.trim().slice(0, 80);
    mapped.toChuyenMon = cleanDept;
    mapped.toKhoi = cleanDept;
  }
  if (updates.role !== undefined) {
    mapped.role = updates.role;
    mapped.vaiTro = mapTeacherRoleToVaiTro(updates.role);
  }
  if (updates.biKhoa !== undefined) mapped.biKhoa = updates.biKhoa;
  if (updates.yeuCauDoiMatKhau !== undefined) mapped.yeuCauDoiMatKhau = updates.yeuCauDoiMatKhau;

  try {
    await updateDoc(doc(db, 'users', id), mapped);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Cấp tài khoản Firebase Auth (Email/Mật khẩu) cho một hồ sơ giáo viên đã có trên Firestore
 * và đồng bộ document sang `users/{authUid}` để giáo viên có thể đăng nhập ngay.
 */
export async function activateTeacherAuthAccount(
  existingDocId: string,
  teacher: TeacherInput,
  password: string
): Promise<string> {
  const cleanEmail = teacher.email.trim().toLowerCase();
  const cleanPass = password.trim();
  const vaiTro = mapTeacherRoleToVaiTro(teacher.role);

  const secondaryAuth = getSecondaryAuth();
  const cred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, cleanPass);
  const newUid = cred.user.uid;
  await signOut(secondaryAuth);

  const payload = {
    uid: newUid,
    maGV: teacher.maGV.trim().slice(0, 30),
    hoTen: teacher.hoTen.trim().slice(0, 120),
    cccd: teacher.cccd.trim().slice(0, 20),
    ngaySinh: teacher.ngaySinh.trim().slice(0, 20),
    email: cleanEmail.slice(0, 150),
    soDienThoai: teacher.soDienThoai.trim().slice(0, 20),
    chucVu: String(teacher.chucVu).trim().slice(0, 80),
    toChuyenMon: teacher.toChuyenMon.trim().slice(0, 80),
    role: teacher.role,
    vaiTro,
    toKhoi: teacher.toChuyenMon.trim().slice(0, 80),
    biKhoa: teacher.biKhoa ?? false,
    yeuCauDoiMatKhau: teacher.yeuCauDoiMatKhau ?? false,
    ngayTao: serverTimestamp(),
    ngayCapNhat: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', newUid), payload);
    if (existingDocId && existingDocId !== newUid) {
      await deleteDoc(doc(db, 'users', existingDocId));
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${newUid}`);
  }

  return newUid;
}

/**
 * Xóa hồ sơ giáo viên khỏi collection `users` trên Firestore
 */
export async function deleteTeacher(id: string): Promise<void> {
  const path = `users/${id}`;
  try {
    await deleteDoc(doc(db, 'users', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/* ============================================================================
 * Các hàm đồng bộ thời gian thực & quản lý danh mục hệ thống
 * ============================================================================ */

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void,
  onError: () => void
): Unsubscribe {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (snap.exists()) {
        onData({ uid: snap.id, ...(snap.data() as Omit<UserProfile, 'uid'>) });
      } else {
        onData(null);
      }
    },
    (err) => {
      onError();
      handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

export function subscribeAllUsers(
  onData: (users: UserProfile[]) => void,
  onError?: () => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'users'),
    (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data() as Omit<UserProfile, 'uid'> & { uid?: string };
        return {
          ...data,
          uid: data.uid && data.uid.trim() ? data.uid : d.id,
          toKhoi: data.toKhoi || data.toChuyenMon || '',
        };
      });
      list.sort((a, b) => (a.hoTen || '').localeCompare(b.hoTen || '', 'vi'));
      onData(list);
    },
    (err) => {
      onError?.();
      if (auth.currentUser) {
        handleFirestoreError(err, OperationType.LIST, 'users');
      } else {
        console.warn('Firestore subscribeAllUsers warning (SSO mode):', err);
      }
    }
  );
}

export function subscribeSubjects(
  onData: (subjects: SubjectItem[]) => void,
  onError?: () => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'subjects'), orderBy('thuTu', 'asc')),
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SubjectItem, 'id'>),
      }));
      onData(list);
    },
    (err) => {
      onError?.();
      if (auth.currentUser) {
        handleFirestoreError(err, OperationType.LIST, 'subjects');
      } else {
        console.warn('Firestore subscribeSubjects warning (SSO mode):', err);
      }
    }
  );
}

export function subscribeDepartments(
  onData: (departments: DepartmentItem[]) => void,
  onError?: () => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'departments'), orderBy('thuTu', 'asc')),
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<DepartmentItem, 'id'>),
      }));
      onData(list);
    },
    (err) => {
      onError?.();
      if (auth.currentUser) {
        handleFirestoreError(err, OperationType.LIST, 'departments');
      } else {
        console.warn('Firestore subscribeDepartments warning (SSO mode):', err);
      }
    }
  );
}

export async function createTeacherAccount(params: {
  hoTen: string;
  email: string;
  vaiTro: UserRole;
  toKhoi: string;
  tempPassword: string;
}): Promise<string> {
  const secondaryAuth = getSecondaryAuth();
  const cred = await createUserWithEmailAndPassword(
    secondaryAuth,
    params.email.trim().toLowerCase(),
    params.tempPassword
  );
  const newUid = cred.user.uid;
  await signOut(secondaryAuth);

  const path = `users/${newUid}`;
  const role = mapVaiTroToTeacherRole(params.vaiTro);
  try {
    await setDoc(doc(db, 'users', newUid), {
      uid: newUid,
      hoTen: params.hoTen.trim().slice(0, 120),
      email: params.email.trim().toLowerCase().slice(0, 150),
      vaiTro: params.vaiTro,
      role,
      toKhoi: params.toKhoi,
      toChuyenMon: params.toKhoi,
      biKhoa: false,
      yeuCauDoiMatKhau: true,
      ngayTao: serverTimestamp(),
      ngayCapNhat: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
  return newUid;
}

export async function updateUserProfileFields(
  uid: string,
  updates: Partial<Pick<UserProfile, 'hoTen' | 'vaiTro' | 'toKhoi' | 'biKhoa' | 'yeuCauDoiMatKhau'>>
): Promise<void> {
  const path = `users/${uid}`;
  const mapped: Record<string, unknown> = {
    ...updates,
    ngayCapNhat: serverTimestamp(),
  };
  if (updates.vaiTro) mapped.role = mapVaiTroToTeacherRole(updates.vaiTro);
  if (updates.toKhoi) mapped.toChuyenMon = updates.toKhoi;

  try {
    await updateDoc(doc(db, 'users', uid), mapped);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function sendUserPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function addSubject(ten: string, thuTu: number): Promise<void> {
  try {
    await addDoc(collection(db, 'subjects'), {
      ten: ten.trim().slice(0, 100),
      thuTu,
      kichHoat: true,
      isSample: false,
      ngayTao: serverTimestamp(),
      ngayCapNhat: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'subjects');
  }
}

export async function toggleSubject(id: string, kichHoat: boolean): Promise<void> {
  const path = `subjects/${id}`;
  try {
    await updateDoc(doc(db, 'subjects', id), {
      kichHoat,
      ngayCapNhat: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteSubject(id: string): Promise<void> {
  const path = `subjects/${id}`;
  try {
    await deleteDoc(doc(db, 'subjects', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function addDepartment(ten: string, moTa: string, thuTu: number): Promise<void> {
  try {
    await addDoc(collection(db, 'departments'), {
      ten: ten.trim().slice(0, 80),
      moTa: moTa.trim().slice(0, 250),
      thuTu,
      kichHoat: true,
      isSample: false,
      ngayTao: serverTimestamp(),
      ngayCapNhat: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'departments');
  }
}

export async function toggleDepartment(id: string, kichHoat: boolean): Promise<void> {
  const path = `departments/${id}`;
  try {
    await updateDoc(doc(db, 'departments', id), {
      kichHoat,
      ngayCapNhat: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteDepartment(id: string): Promise<void> {
  const path = `departments/${id}`;
  try {
    await deleteDoc(doc(db, 'departments', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
