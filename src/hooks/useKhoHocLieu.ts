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
import { normalizeVietnamese } from '../lib/utils';
import {
  attemptSilentFirebaseAuthForSso,
  buildSsoSessionFromPayload,
  clearSsoSessionFromStorage,
  detectInitialSsoSession,
  saveSsoSessionToStorage,
  type SsoSession,
} from '../utils/ssoAuth';
import { useToast } from '../components/ToastContext';

export function useKhoHocLieu() {
  const { showToast, showFirebaseAlert } = useToast();

  const [ssoSession, setSsoSession] = useState<SsoSession | null>(() =>
    detectInitialSsoSession()
  );
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileRefreshTick, setProfileRefreshTick] = useState(0);

  const [view, setView] = useState<AppView>('library');
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  const [editingMaterial, setEditingMaterial] = useState<LearningMaterial | null>(null);
  const [previewMaterial, setPreviewMaterial] = useState<LearningMaterial | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LearningMaterial | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingShareId, setTogglingShareId] = useState<string | null>(null);

  const autoSeededRef = useRef(false);
  const silentAuthAttemptedRef = useRef(false);

  useEffect(() => {
    function handleSsoMessage(event: MessageEvent) {
      const data = event.data as Record<string, unknown> | null | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'PK_TRUC_KHANG_SSO_LOGIN') return;

      const rawUser =
        (data.user && typeof data.user === 'object'
          ? (data.user as Record<string, unknown>)
          : null) ||
        (data.payload && typeof data.payload === 'object'
          ? (data.payload as Record<string, unknown>)
          : null) ||
        (data.teacher && typeof data.teacher === 'object'
          ? (data.teacher as Record<string, unknown>)
          : null) ||
        (data.data && typeof data.data === 'object'
          ? (data.data as Record<string, unknown>)
          : null) ||
        data;

      const nextSession = buildSsoSessionFromPayload(rawUser, 'post_message');
      saveSsoSessionToStorage(nextSession);
      setSsoSession(nextSession);
    }

    window.addEventListener('message', handleSsoMessage);
    return () => window.removeEventListener('message', handleSsoMessage);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (!user || user.isAnonymous) {
        setProfile(null);
        setProfileLoading(false);
        autoSeededRef.current = false;
      }
    });
    return () => unsub();
  }, []);

  const isRealAuthUser = Boolean(authUser && !authUser.isAnonymous);

  // Thử đăng nhập Firebase Auth ngầm cho phiên SSO trong iframe (không chặn giao diện nếu dự án chưa bật Anonymous Auth)
  useEffect(() => {
    if (!authReady || authUser || !ssoSession || silentAuthAttemptedRef.current) return;
    silentAuthAttemptedRef.current = true;
    void attemptSilentFirebaseAuthForSso(auth, ssoSession.currentUser.ssoToken);
  }, [authReady, authUser, ssoSession]);

  useEffect(() => {
    if (!isRealAuthUser || !authUser) {
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    return subscribeUserProfile(
      authUser.uid,
      (loaded) => {
        setProfile(loaded);
        setProfileLoading(false);
      },
      () => setProfileLoading(false)
    );
  }, [isRealAuthUser, authUser, profileRefreshTick]);

  // Đồng bộ danh sách người dùng để ánh xạ hồ sơ thật (UID, tổ khối) cho giáo viên SSO
  const activeSsoBaseProfile = !isRealAuthUser ? ssoSession?.profile ?? null : null;
  const canLoadCatalogs = Boolean(
    (isRealAuthUser && profile && !profile.biKhoa && !profile.yeuCauDoiMatKhau) ||
      activeSsoBaseProfile
  );

  useEffect(() => {
    if (!isRealAuthUser || !profile || profile.biKhoa || profile.yeuCauDoiMatKhau) return;
    if (profile.vaiTro === 'quanTri' && !autoSeededRef.current) {
      autoSeededRef.current = true;
      void seedDefaultCatalogs();
    }
  }, [isRealAuthUser, profile]);

  useEffect(() => {
    if (!canLoadCatalogs) {
      setSubjects([]);
      setDepartments([]);
      return;
    }
    const unsubSub = subscribeSubjects(setSubjects);
    const unsubDept = subscribeDepartments(setDepartments);
    return () => {
      unsubSub();
      unsubDept();
    };
  }, [canLoadCatalogs]);

  useEffect(() => {
    const canLoadUsers = Boolean(
      (isRealAuthUser &&
        profile &&
        !profile.biKhoa &&
        !profile.yeuCauDoiMatKhau &&
        profile.vaiTro === 'quanTri') ||
        activeSsoBaseProfile
    );
    if (!canLoadUsers) {
      setAllUsers([]);
      return;
    }
    return subscribeAllUsers(setAllUsers);
  }, [isRealAuthUser, profile, activeSsoBaseProfile]);

  const resolvedSsoProfile: UserProfile | null = useMemo(() => {
    if (!activeSsoBaseProfile) return null;
    if (allUsers.length === 0) return activeSsoBaseProfile;

    const targetEmail = (activeSsoBaseProfile.email || '').trim().toLowerCase();
    const targetName = normalizeVietnamese(activeSsoBaseProfile.hoTen || '');

    const matchedByEmail = targetEmail
      ? allUsers.find((u) => (u.email || '').trim().toLowerCase() === targetEmail)
      : undefined;

    const nameMatches =
      !matchedByEmail && targetName
        ? allUsers.filter((u) => normalizeVietnamese(u.hoTen || '') === targetName)
        : [];

    const matchedUser =
      matchedByEmail || (nameMatches.length === 1 ? nameMatches[0] : undefined);

    if (!matchedUser) return activeSsoBaseProfile;

    return {
      ...activeSsoBaseProfile,
      uid: matchedUser.uid || activeSsoBaseProfile.uid,
      hoTen: matchedUser.hoTen || activeSsoBaseProfile.hoTen,
      email: matchedUser.email || activeSsoBaseProfile.email,
      vaiTro: matchedUser.vaiTro || activeSsoBaseProfile.vaiTro,
      role: matchedUser.role || activeSsoBaseProfile.role,
      chucVu: matchedUser.chucVu || activeSsoBaseProfile.chucVu,
      toKhoi:
        matchedUser.toKhoi || matchedUser.toChuyenMon || activeSsoBaseProfile.toKhoi,
      toChuyenMon:
        matchedUser.toChuyenMon || matchedUser.toKhoi || activeSsoBaseProfile.toKhoi,
      biKhoa: Boolean(matchedUser.biKhoa),
      yeuCauDoiMatKhau: false,
    };
  }, [activeSsoBaseProfile, allUsers]);

  const effectiveProfile = isRealAuthUser ? profile : resolvedSsoProfile;
  const currentUser = isRealAuthUser
    ? authUser
    : ssoSession
      ? {
          ...ssoSession.currentUser,
          uid: effectiveProfile?.uid || ssoSession.currentUser.uid,
          email: effectiveProfile?.email || ssoSession.currentUser.email,
          displayName: effectiveProfile?.hoTen || ssoSession.currentUser.displayName,
        }
      : null;
  const isAuthenticated = Boolean(currentUser && effectiveProfile);

  const effectiveUid = effectiveProfile?.uid || '';
  const effectiveRole = effectiveProfile?.vaiTro || 'giaoVien';
  const effectiveDept = effectiveProfile?.toKhoi || '';
  const effectiveName = effectiveProfile?.hoTen || '';
  const effectiveEmail = effectiveProfile?.email || '';
  const effectiveBlocked = Boolean(
    effectiveProfile?.biKhoa || effectiveProfile?.yeuCauDoiMatKhau
  );

  useEffect(() => {
    if (!isAuthenticated || !effectiveProfile || effectiveBlocked) {
      setMaterials([]);
      setMaterialsLoading(false);
      return;
    }
    setMaterialsLoading(true);
    return subscribeMaterialsForUser(
      effectiveProfile,
      (list) => {
        setMaterials(list);
        setMaterialsLoading(false);
      },
      () => setMaterialsLoading(false)
    );
  }, [
    isAuthenticated,
    effectiveUid,
    effectiveRole,
    effectiveDept,
    effectiveName,
    effectiveBlocked,
  ]);

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

  const matchingOwnerUids = useMemo(() => {
    const set = new Set<string>();
    if (effectiveUid) set.add(effectiveUid);
    if (ssoSession?.profile.uid) set.add(ssoSession.profile.uid);
    const targetEmail = effectiveEmail.trim().toLowerCase();
    if (targetEmail) {
      allUsers.forEach((u) => {
        if ((u.email || '').trim().toLowerCase() === targetEmail && u.uid) {
          set.add(u.uid);
        }
      });
    }
    return set;
  }, [effectiveUid, ssoSession?.profile.uid, effectiveEmail, allUsers]);

  const myMaterials = useMemo(() => {
    if (!effectiveProfile) return [];
    const normalizedOwnerName = normalizeVietnamese(effectiveName);
    const targetEmail = effectiveEmail.trim().toLowerCase();

    return materials.filter((m) => {
      if (m.nguoiDangUid && matchingOwnerUids.has(m.nguoiDangUid)) return true;
      const docEmail = (m as { nguoiDangEmail?: string }).nguoiDangEmail
        ?.trim()
        .toLowerCase();
      if (targetEmail && docEmail && docEmail === targetEmail) return true;
      if (
        normalizedOwnerName &&
        normalizeVietnamese(m.nguoiDangTen || '') === normalizedOwnerName
      ) {
        return true;
      }
      return false;
    });
  }, [materials, effectiveProfile, matchingOwnerUids, effectiveName, effectiveEmail]);

  const pendingApprovalCount = useMemo(() => {
    if (!effectiveProfile) return 0;
    if (effectiveProfile.vaiTro === 'quanTri') {
      return materials.filter((m) => m.trangThai === 'choDuyet').length;
    }
    if (effectiveProfile.vaiTro === 'toTruong') {
      return materials.filter(
        (m) => m.trangThai === 'choDuyet' && m.toKhoi === effectiveProfile.toKhoi
      ).length;
    }
    return 0;
  }, [materials, effectiveProfile]);

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

  async function signOutUser() {
    silentAuthAttemptedRef.current = false;
    clearSsoSessionFromStorage();
    setSsoSession(null);
    if (auth.currentUser) {
      await signOut(auth);
    }
  }

  return {
    authReady,
    authUser: isRealAuthUser ? authUser : null,
    currentUser,
    isAuthenticated,
    isSsoSession: Boolean(!isRealAuthUser && ssoSession),
    profileLoading,
    profile: effectiveProfile,
    refreshProfile: () => setProfileRefreshTick((t) => t + 1),
    signOutUser,
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
    handleViewMaterial,
    handleDownloadMaterial,
    handleSubmitDraft,
    handleToggleShareLink,
    handleConfirmDelete,
  };
}
