import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../config/firebase';
import { getEffectiveUser } from '../utils/ssoAuth';
import { generateTextWithClientGemini } from '../utils/geminiClient';
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

const GAME_SYSTEM_INSTRUCTION = `Bạn là chuyên gia sư phạm tiểu học và thiết kế trò chơi giáo dục HTML5 dành cho học sinh tiểu học Việt Nam (lớp 1 đến lớp 5).

QUY TẮC KIỂM DUYỆT AN TOÀN & HỌC TẬP (ƯU TIÊN CAO NHẤT):
- Trước khi tạo trò chơi, hãy kiểm tra cả Tên bài học lẫn Mô tả trò chơi của giáo viên.
- Nếu nội dung chứa yếu tố KHÔNG phù hợp với trẻ em tiểu học (bạo lực, máu me, vũ khí sát thương, kinh dị, 18+, cờ bạc, cá độ, chất kích thích, ngôn từ thô tục, xúc phạm, tự gây hại...) HOẶC hoàn toàn KHÔNG liên quan đến học tập / giáo dục (ví dụ: giao dịch tiền ảo, đánh bạc, tin tức người lớn, tán tỉnh...), BẮT BUỘC TỪ CHỐI tạo trò chơi.
- Khi từ chối, KHÔNG xuất HTML, chỉ trả về DUY NHẤT một chuỗi JSON đúng định dạng:
  {"refused": true, "reason": "Lời từ chối lịch sự, thân thiện bằng tiếng Việt giải thích ngắn gọn và gợi ý giáo viên nhập nội dung gắn với bài học tiểu học."}

QUY TẮC SƯ PHẠM & CHẤT LƯỢNG CÂU HỎI (BẮT BUỘC):
1. Toàn bộ câu hỏi và đáp án PHẢI bám sát đúng "Tên bài học / nội dung kiến thức" và chương trình giáo dục phổ thông tiểu học của Khối lớp đã chọn. Không đi lạc sang kiến thức ngoài bài học hoặc vượt quá phạm vi lớp học.
2. Tạo ĐÚNG "Số câu hỏi" yêu cầu (5, 8, 10 hoặc 15 câu/cặp/hàng/thử thách tương ứng) với độ khó khớp đúng "Mức độ" đã chọn:
   - Dễ: Kiến thức nhận biết trực tiếp, phép tính/từ ngữ cơ bản, quen thuộc.
   - Vừa: Thông hiểu và vận dụng chuẩn trọng tâm bài học.
   - Khó: Vận dụng linh hoạt, có tính suy luận phù hợp học sinh khá giỏi ở đúng khối lớp đó.
3. Mỗi lần nhận yêu cầu (đặc biệt khi giáo viên bấm "Tạo lại"), PHẢI sinh một bộ câu hỏi MỚI hoàn toàn với số liệu, phép tính, từ ngữ, tình huống và ngữ cảnh khác nhau, không lặp lại máy móc.
4. Đáp án đúng phải tuyệt đối chính xác về khoa học và sư phạm. Các đáp án sai CHỈ là phương án gây nhiễu hợp lý (gần đúng hoặc lỗi sai học sinh hay mắc), tuyệt đối không đặt đáp án vô lý quá lộ liễu và không để câu hỏi có nhiều hơn 1 đáp án đúng (với dạng 1 lựa chọn).
5. Lời giải thích sau mỗi lần trả lời phải NGẮN GỌN (1-2 câu), súc tích, thân thiện và thật dễ hiểu với học sinh tiểu học.

QUY TẮC THIẾT KẾ TRÒ CHƠI HTML5:
6. Làm ĐÚNG theo mô tả của giáo viên về cách chơi, luật chơi, nhân vật và bối cảnh. Riêng ở chế độ "Tự do (sáng tạo)", mô tả của giáo viên chỉ dùng để xác định cách chơi và bối cảnh (không yêu cầu giáo viên phải viết sẵn câu hỏi trong mô tả), bạn hãy tự sinh đủ bộ câu hỏi bám sát Tên bài học, Môn học, Khối lớp, Số câu hỏi và Mức độ.
7. Chỉ trả về MỘT tệp HTML tự chứa hoàn chỉnh (bắt đầu bằng <!DOCTYPE html>, kết thúc bằng </html>; toàn bộ CSS nằm trong <style>, toàn bộ JS nằm trong <script>). Không thêm lời dẫn hay bọc markdown.
8. Ngôn ngữ 100% tiếng Việt chuẩn mực, chữ LỚN rõ ràng (nội dung >= 18px, nút bấm >= 48px), màu sắc tươi vui, sinh động, phù hợp lứa tuổi tiểu học.
9. Hỗ trợ chơi tốt bằng CẢ 3 cách: CHUỘT (click/kéo thả), CẢM ỨNG trên điện thoại/máy tính bảng (nút chạm lớn, có nút điều hướng ảo trên màn hình nếu trò chơi cần di chuyển), và BÀN PHÍM (phím mũi tên, Space/Enter hoặc phím 1-4/A-D).
10. Có hiển thị điểm số, thông báo đúng/sai rõ ràng kèm giải thích ngắn dễ hiểu, màn hình tổng kết và nút "Chơi lại" (khi bấm Chơi lại hoặc Tạo lại chơi rất mượt).
11. Tuyệt đối KHÔNG tải tài nguyên bên ngoài (không CDN, không Google Fonts, không link/script/img từ internet); chỉ dùng Unicode/emoji hoặc inline SVG.
12. Tuyệt đối KHÔNG bạo lực, không yếu tố gây sợ hãi (kể cả trò chơi bắn bóng bay hay vượt chướng ngại vật phải dùng hiệu ứng bong bóng/hoa quả/đồ chơi dễ thương, lành mạnh).`;

function buildGamePrompt(payload: GenerateAiGameRequest, generationNonce: string): string {
  const gradeText =
    payload.khoiLop === 'Dùng chung'
      ? 'Học sinh tiểu học (dùng chung)'
      : `Lớp ${payload.khoiLop} (Tiểu học)`;

  const mechanicsGuide: Record<GameType, string> = {
    'Trắc nghiệm': `Tạo đúng ${payload.soCauHoi} câu hỏi trắc nghiệm 4 lựa chọn A/B/C/D bám sát bài "${payload.tenBaiHoc}" (hỗ trợ click, chạm và phím 1-4/A-D), có thanh tiến độ 1/${payload.soCauHoi}, chấm điểm ngay sau mỗi lần chọn kèm lời giải thích ngắn dễ hiểu và nút Câu tiếp theo.`,
    'Ghép đôi': `Tạo bảng ghép đôi đúng ${payload.soCauHoi} cặp thẻ kiến thức thuộc bài "${payload.tenBaiHoc}" (câu hỏi - đáp án, phép tính - kết quả, từ - nghĩa...) hỗ trợ chuột, chạm và bàn phím. Chọn đúng phát sáng xanh, hiển thị giải thích ngắn và giữ cặp; chọn sai rung nhẹ và gợi ý ngắn để thử lại.`,
    'Ô chữ': `Tạo trò chơi Ô chữ tiếng Việt gồm đúng ${payload.soCauHoi} hàng ngang (hoặc chia thành các lượt hợp lý đủ ${payload.soCauHoi} từ khóa) bám sát bài "${payload.tenBaiHoc}" với gợi ý rõ ràng; hỗ trợ nhập bàn phím lẫn bấm nút chữ trên màn hình cho cảm ứng, hiển thị giải thích ngắn khi giải đúng mỗi hàng.`,
    'Kéo thả': `Tạo trò chơi Kéo thả gồm đúng ${payload.soCauHoi} thẻ nội dung/câu hỏi bám sát bài "${payload.tenBaiHoc}" (hỗ trợ cả kéo thả chuột lẫn bấm-chọn-rồi-bấm-ô cho cảm ứng điện thoại và bàn phím), có phản hồi đúng/sai kèm giải thích ngắn dễ hiểu và nút Chơi lại.`,
    'Đúng/Sai': `Tạo đúng ${payload.soCauHoi} câu nhận định rõ ràng bám sát bài "${payload.tenBaiHoc}" với 2 nút lớn ĐÚNG và SAI (hỗ trợ click, chạm và phím mũi tên / 1-2), chấm điểm ngay và hiện giải thích ngắn thân thiện cho học sinh tiểu học.`,
    'Tự do (sáng tạo)': `Thiết kế gameplay tương tác đúng sát với bối cảnh và cách chơi giáo viên đã mô tả (ví dụ: khám phá kho báu, đua xe, bắn bóng bay, mê cung, nhảy qua chướng ngại, nấu ăn/bán hàng, cứu hộ động vật...). Lồng ghép mượt mà ĐÚNG ${payload.soCauHoi} câu hỏi/thử thách kiến thức bám sát bài học "${payload.tenBaiHoc}" ở mức độ "${payload.mucDo}"; BẮT BUỘC có đủ điều khiển bằng chuột, nút chạm cảm ứng trên màn hình điện thoại và bàn phím, kèm giải thích ngắn mỗi câu.`,
  };

  const extraDescription =
    payload.yeuCau.trim() ||
    'Thiết kế giao diện thân thiện, sinh động, phù hợp với học sinh tiểu học.';

  return `Hãy thiết kế trò chơi giáo dục HTML5 tự chứa theo đầy đủ từng thông số sau:
1. Môn học: ${payload.monHoc}
2. Khối lớp: ${gradeText}
3. Tên bài học / nội dung kiến thức trọng tâm: ${payload.tenBaiHoc}
4. Số câu hỏi: ${payload.soCauHoi} câu
5. Mức độ: ${payload.mucDo}
6. Dạng trò chơi: ${payload.dangTroChoi}
7. Mô tả trò chơi (cách chơi, bối cảnh / yêu cầu bổ sung): ${extraDescription}
8. Mã phiên sinh đề ngẫu nhiên (bắt buộc tạo bộ câu hỏi, số liệu và ngữ cảnh MỚI cho mã này): ${generationNonce}

HƯỚNG DẪN CƠ CHẾ CHƠI CẦN ĐÁP ỨNG:
${mechanicsGuide[payload.dangTroChoi]}

Lưu ý kiểm tra lại trước khi xuất:
- Kiểm tra tính phù hợp với trẻ em và mục tiêu học tập trước; nếu vi phạm hãy trả JSON từ chối như hệ thống đã quy định.
- Đảm bảo đủ chính xác ${payload.soCauHoi} câu hỏi/thử thách, đáp án chuẩn xác, đáp án nhiễu hợp lý, lời giải thích ngắn dễ hiểu.
- Chỉ xuất duy nhất tệp HTML5 tự chứa từ <!DOCTYPE html> đến </html>, hiển thị vừa vặn trên cả điện thoại và máy tính, không dùng alert()/confirm().`;
}

function tryExtractRefusalReason(rawText: string): string | null {
  const trimmed = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { refused?: unknown; reason?: unknown };
      if (parsed && parsed.refused === true) {
        const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
        return (
          reason ||
          'Mô tả trò chơi có nội dung chưa phù hợp với học sinh tiểu học hoặc chưa gắn với mục tiêu học tập. Thầy/cô vui lòng điều chỉnh lại mô tả nhé!'
        );
      }
    } catch {
      // Fallback below
    }
  }

  const hasHtml = /<!DOCTYPE\s+html|<html[\s>]/i.test(rawText);
  if (!hasHtml && trimmed.length > 0 && trimmed.length < 1200) {
    return trimmed;
  }

  return null;
}

function cleanAndValidateGameHtml(rawText: string): string {
  const refusalReason = tryExtractRefusalReason(rawText);
  if (refusalReason) {
    throw new AiGameGenerationError(refusalReason, true);
  }

  let html = rawText
    .trim()
    .replace(/^```(?:html|HTML)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const doctypeIdx = html.search(/<!DOCTYPE\s+html/i);
  const htmlStartIdx = doctypeIdx >= 0 ? doctypeIdx : html.search(/<html[\s>]/i);
  const htmlEndIdx = html.toLowerCase().lastIndexOf('</html>');

  if (htmlStartIdx < 0 || htmlEndIdx < 0) {
    throw new AiGameGenerationError(
      'AI trả về mã trò chơi chưa đầy đủ định dạng HTML. Vui lòng bấm Tạo lại.'
    );
  }

  html = html.slice(htmlStartIdx, htmlEndIdx + '</html>'.length);
  if (!/^<!DOCTYPE\s+html/i.test(html)) {
    html = `<!DOCTYPE html>\n${html}`;
  }

  html = html.replace(
    /<script\b[^>]*\bsrc\s*=\s*["']https?:\/\/[^"']*["'][^>]*>[\s\S]*?<\/script>/gi,
    ''
  );
  html = html.replace(
    /<link\b[^>]*\bhref\s*=\s*["']https?:\/\/[^"']*["'][^>]*\/?>/gi,
    ''
  );
  html = html.replace(/@import\s+url\([^)]*https?:\/\/[^)]*\)\s*;?/gi, '');

  if (html.length < 500 || html.length > 340_000) {
    throw new AiGameGenerationError(
      'Mã HTML trò chơi vượt ngoài giới hạn kích thước cho phép. Vui lòng bấm Tạo lại.'
    );
  }

  return html;
}

export async function requestAiGameHtml(
  payload: GenerateAiGameRequest
): Promise<GenerateAiGameResponse> {
  const teacher = getEffectiveUser();
  const dateKey = getTodayDateKeyVietnam();
  const currentQuota = await fetchMyDailyAiGameQuota(teacher.uid);

  if (currentQuota.usedToday >= AI_GAME_DAILY_LIMIT) {
    throw new AiGameGenerationError(
      `Bạn đã dùng hết ${AI_GAME_DAILY_LIMIT} lượt tạo trò chơi AI trong ngày hôm nay.`
    );
  }

  const nonce =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const prompt = buildGamePrompt(payload, nonce);
  const { text } = await generateTextWithClientGemini({
    contents: prompt,
    config: {
      systemInstruction: GAME_SYSTEM_INSTRUCTION,
    },
  });

  const html = cleanAndValidateGameHtml(text);
  const usedToday = currentQuota.usedToday + 1;

  try {
    await setDoc(
      doc(db, 'ai_game_quotas', `${teacher.uid}_${dateKey}`),
      {
        uid: teacher.uid,
        date: dateKey,
        count: usedToday,
        ngayCapNhat: serverTimestamp(),
      },
      { merge: true }
    );
  } catch {
    // Non-blocking if offline or quota rule fails
  }

  return {
    html,
    usedToday,
    remainingToday: Math.max(0, AI_GAME_DAILY_LIMIT - usedToday),
    dailyLimit: AI_GAME_DAILY_LIMIT,
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
