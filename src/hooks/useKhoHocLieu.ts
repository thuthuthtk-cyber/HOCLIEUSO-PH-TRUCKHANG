import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from '../config/firebase';
import {
  deleteMaterial,
  incrementMaterialCounter,
  seedDefaultCatalogs,
  submitDraftMaterial,
  subscribeMaterialsForUser,
} from '../services/hocLieuService';
import { toggleMaterialShareLink } from '../services/aiGameService';
import {
  subscribeAllUsers,
  subscribeDepartments,
  subscribeSubjects,
  subscribeUserProfile,
} from '../services/userService';
import {
  DEFAULT_DEPARTMENTS,
  DEFAULT_SUBJECTS,
  type AppView,
  type DepartmentItem,
  type LearningMaterial,
  type SubjectItem,
  type UserProfile,
} from '../types/hocLieu';
import { useToast } from '../components/ToastContext';

export function useKhoHocLieu() {
  const { showToast, showFirebaseAlert } = useToast();

  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileRefreshTick, setProfileRefreshTick] = useState(0);

  const [view, setView] = useState<AppView>('library');
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  const [editingMaterial, setEditingMaterial] = useState<LearningMaterial | null>(null);
  const [previewMaterial, setPreviewMaterial] = useState<LearningMaterial | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LearningMaterial | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingShareId, setTogglingShareId] = useState<string | null>(null);
  const [geminiConfigOpen, setGeminiConfigOpen] = useState(false);

  const autoSeededRef = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (!user) {
        setProfile(null);
        setProfileLoading(false);
        setMaterials([]);
        setAllUsers([]);
        autoSeededRef.current = false;
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authUser) return;
    setProfileLoading(true);
    return subscribeUserProfile(
      authUser.uid,
      (loaded) => {
        setProfile(loaded);
        setProfileLoading(false);
      },
      () => setProfileLoading(false)
    );
  }, [authUser, profileRefreshTick]);

  useEffect(() => {
    if (!profile || profile.biKhoa || profile.yeuCauDoiMatKhau) return;
    if (profile.vaiTro === 'quanTri' && !autoSeededRef.current) {
      autoSeededRef.current = true;
      void seedDefaultCatalogs();
    }
  }, [profile]);

  useEffect(() => {
    if (!profile || profile.biKhoa || profile.yeuCauDoiMatKhau) return;
    const unsubSub = subscribeSubjects(setSubjects);
    const unsubDept = subscribeDepartments(setDepartments);
    return () => {
      unsubSub();
      unsubDept();
    };
  }, [profile]);

  useEffect(() => {
    if (!profile || profile.biKhoa || profile.yeuCauDoiMatKhau || profile.vaiTro !== 'quanTri') {
      setAllUsers([]);
      return;
    }
    return subscribeAllUsers(setAllUsers);
  }, [profile]);

  useEffect(() => {
    if (!profile || profile.biKhoa || profile.yeuCauDoiMatKhau) {
      setMaterials([]);
      return;
    }
    setMaterialsLoading(true);
    return subscribeMaterialsForUser(
      profile,
      (list) => {
        setMaterials(list);
        setMaterialsLoading(false);
      },
      () => setMaterialsLoading(false)
    );
  }, [profile]);

  const effectiveSubjects: SubjectItem[] = useMemo(() => {
    if (subjects.length > 0) return subjects;
    return DEFAULT_SUBJECTS.map((s, idx) => ({
      id: `default-sub-${idx}`,
      ten: s.ten,
      thuTu: s.thuTu,
      kichHoat: true,
      isSample: false,
      ngayTao: null,
      ngayCapNhat: null,
    }));
  }, [subjects]);

  const effectiveDepartments: DepartmentItem[] = useMemo(() => {
    if (departments.length > 0) return departments;
    return DEFAULT_DEPARTMENTS.map((d, idx) => ({
      id: `default-dept-${idx}`,
      ten: d.ten,
      moTa: d.moTa,
      thuTu: d.thuTu,
      kichHoat: true,
      isSample: false,
      ngayTao: null,
      ngayCapNhat: null,
    }));
  }, [departments]);

  const myMaterials = useMemo(() => {
    if (!profile) return [];
    return materials.filter((m) => m.nguoiDangUid === profile.uid);
  }, [materials, profile]);

  const pendingApprovalCount = useMemo(() => {
    if (!profile) return 0;
    if (profile.vaiTro === 'quanTri') {
      return materials.filter((m) => m.trangThai === 'choDuyet').length;
    }
    if (profile.vaiTro === 'toTruong') {
      return materials.filter(
        (m) => m.trangThai === 'choDuyet' && m.toKhoi === profile.toKhoi
      ).length;
    }
    return 0;
  }, [materials, profile]);

  const activePreviewMaterial = useMemo(() => {
    if (!previewMaterial) return null;
    return materials.find((m) => m.id === previewMaterial.id) || previewMaterial;
  }, [materials, previewMaterial]);

  function navigateTo(next: AppView) {
    if (next !== 'upload') setEditingMaterial(null);
    setView(next);
  }

  function handleViewMaterial(m: LearningMaterial) {
    setPreviewMaterial(m);
    void incrementMaterialCounter(m.id, 'luotXem');
  }

  function handleDownloadMaterial(m: LearningMaterial) {
    void incrementMaterialCounter(m.id, 'luotTai');
  }

  async function handleSubmitDraft(m: LearningMaterial) {
    try {
      await submitDraftMaterial(m.id);
      showFirebaseAlert(true, `Đã gửi học liệu "${m.tieuDe}" lên Tổ trưởng duyệt.`);
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    }
  }

  async function handleToggleShareLink(m: LearningMaterial) {
    const nextEnabled = !(m.chiaSeLink === true);
    setTogglingShareId(m.id);
    try {
      await toggleMaterialShareLink(m, nextEnabled);
      showToast(
        nextEnabled
          ? `Đã bật link chia sẻ cho học sinh: "${m.tieuDe}".`
          : `Đã tắt chia sẻ link học sinh cho "${m.tieuDe}".`,
        'success'
      );
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    } finally {
      setTogglingShareId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const removedTitle = deleteTarget.tieuDe;
      await deleteMaterial(deleteTarget);
      setDeleteTarget(null);
      showFirebaseAlert(true, `Đã xóa học liệu "${removedTitle}" khỏi Cloud Firestore.`);
    } catch (err: unknown) {
      showFirebaseAlert(false, err);
    } finally {
      setDeleting(false);
    }
  }

  return {
    authReady,
    authUser,
    profileLoading,
    profile,
    refreshProfile: () => setProfileRefreshTick((t) => t + 1),
    signOutUser: () => signOut(auth),
    view,
    setView,
    navigateTo,
    materials,
    materialsLoading,
    myMaterials,
    pendingApprovalCount,
    effectiveSubjects,
    effectiveDepartments,
    allUsers,
    editingMaterial,
    setEditingMaterial,
    previewMaterial: activePreviewMaterial,
    setPreviewMaterial,
    deleteTarget,
    setDeleteTarget,
    deleting,
    togglingShareId,
    geminiConfigOpen,
    setGeminiConfigOpen,
    handleViewMaterial,
    handleDownloadMaterial,
    handleSubmitDraft,
    handleToggleShareLink,
    handleConfirmDelete,
  };
}
