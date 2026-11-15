import { useEffect, useState } from 'react';
import { fetchPublicGameByShareCode } from '../services/aiGameService';
import type { PublicGameRecord } from '../types/hocLieu';

interface PublicGamePlayerViewProps {
  shareCode: string;
}

export function PublicGamePlayerView({ shareCode }: PublicGamePlayerViewProps) {
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<PublicGameRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPublicGameByShareCode(shareCode)
      .then((result) => {
        if (!cancelled) {
          setGame(result);
          setLoading(false);
          if (result?.tieuDe) {
            document.title = result.tieuDe;
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGame(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [shareCode]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center p-6">
        <p className="text-lg font-bold text-slate-700">Đang tải trò chơi...</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-white border border-slate-200 p-7 text-center space-y-2 shadow-xs">
          <h1 className="text-xl font-extrabold text-slate-900">
            Trò chơi hiện không khả dụng
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Liên kết trò chơi này không tồn tại hoặc đã được giáo viên tắt chế độ chia sẻ công khai.
          </p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      title={game.tieuDe}
      srcDoc={game.htmlTroChoi}
      sandbox="allow-scripts"
      className="fixed inset-0 w-screen h-screen border-0 bg-white"
    />
  );
}
