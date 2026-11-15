import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../config/firebase';
import type {
  GameDifficulty,
  GameQuestionCount,
  GameType,
  GradeLevel,
  LearningMaterial,
  PublicGameRecord,
} from '../types/hocLieu';
import { isValidShareCodeFormat } from '../utils/shareCode';

export const AI_GAME_DAILY_LIMIT = 20;

export interface GenerateAiGameRequest {
  monHoc: string;
  khoiLop: GradeLevel;
  tenBaiHoc: string;
  soCauHoi: GameQuestionCount;
  mucDo: GameDifficulty;
  dangTroChoi: GameType;
  yeuCau: string;
}

export interface GenerateAiGameResponse {
  html: string;
  usedToday: number;
  remainingToday: number;
  dailyLimit: number;
}

function getTodayDateKeyVietnam(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function fetchMyDailyAiGameQuota(uid: string): Promise<{
  usedToday: number;
  remainingToday: number;
  dailyLimit: number;
}> {
  try {
    const dateKey = getTodayDateKeyVietnam();
    const snap = await getDoc(doc(db, 'ai_game_quotas', `${uid}_${dateKey}`));
    const usedToday = snap.exists() ? Number(snap.data().count || 0) : 0;
    return {
      usedToday,
      remainingToday: Math.max(0, AI_GAME_DAILY_LIMIT - usedToday),
      dailyLimit: AI_GAME_DAILY_LIMIT,
    };
  } catch {
    return {
      usedToday: 0,
      remainingToday: AI_GAME_DAILY_LIMIT,
      dailyLimit: AI_GAME_DAILY_LIMIT,
    };
  }
}

export class AiGameGenerationError extends Error {
  refused: boolean;
  constructor(message: string, refused = false) {
    super(message);
    this.refused = refused;
  }
}

export async function requestAiGameHtml(
  payload: GenerateAiGameRequest
): Promise<GenerateAiGameResponse> {
  const user = auth.currentUser;
  if (!user) {
    throw new AiGameGenerationError(
      'Vui lòng đăng nhập lại để sử dụng tính năng Tạo trò chơi bằng AI.'
    );
  }

  const idToken = await user.getIdToken();
  const response = await fetch('/api/generate-game', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as Partial<GenerateAiGameResponse> & {
    error?: string;
    refused?: boolean;
  };

  if (!response.ok) {
    throw new AiGameGenerationError(
      data.error || `Không thể tạo trò chơi bằng AI (mã lỗi ${response.status}).`,
      Boolean(data.refused)
    );
  }

  if (!data.html || typeof data.html !== 'string') {
    throw new AiGameGenerationError('Máy chủ không trả về mã trò chơi HTML hợp lệ.');
  }

  return {
    html: data.html,
    usedToday: data.usedToday ?? 1,
    remainingToday: data.remainingToday ?? AI_GAME_DAILY_LIMIT - 1,
    dailyLimit: data.dailyLimit ?? AI_GAME_DAILY_LIMIT,
  };
}

export async function fetchPublicGameByShareCode(
  maChiaSe: string
): Promise<PublicGameRecord | null> {
  if (!isValidShareCodeFormat(maChiaSe)) {
    return null;
  }

  try {
    const snap = await getDoc(doc(db, 'public_games', maChiaSe));
    if (!snap.exists()) return null;
    const data = snap.data() as PublicGameRecord;
    if (!data.chiaSeLink || !data.htmlTroChoi) return null;
    return data;
  } catch {
    // Trường hợp link đã tắt chia sẻ (chiaSeLink == false) hoặc mã không tồn tại
    return null;
  }
}

export async function toggleMaterialShareLink(
  material: LearningMaterial,
  enabled: boolean
): Promise<void> {
  if (material.loaiNguon !== 'troChoi' || !material.maChiaSe) {
    throw new Error('Học liệu này không phải trò chơi AI có link chia sẻ.');
  }

  const path = `materials/${material.id}`;
  try {
    const publicRef = doc(db, 'public_games', material.maChiaSe);
    const publicSnap = await getDoc(publicRef);
    const batch = writeBatch(db);

    batch.update(doc(db, 'materials', material.id), {
      chiaSeLink: enabled,
      ngayCapNhat: serverTimestamp(),
    });

    if (publicSnap.exists()) {
      batch.update(publicRef, {
        chiaSeLink: enabled,
        ngayCapNhat: serverTimestamp(),
      });
    } else if (material.htmlTroChoi) {
      batch.set(publicRef, {
        maChiaSe: material.maChiaSe,
        materialId: material.id,
        tieuDe: material.tieuDe,
        monHoc: material.monHoc,
        khoiLop: material.khoiLop,
        dangTroChoi: material.dangTroChoi || 'Trắc nghiệm',
        htmlTroChoi: material.htmlTroChoi,
        chiaSeLink: enabled,
        nguoiDangUid: material.nguoiDangUid,
        toKhoi: material.toKhoi,
        ngayTao: material.ngayTao || serverTimestamp(),
        ngayCapNhat: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}
