import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { handleGenerateGameNodeRequest } from './server/gameGenerator.ts';
import { handleGenerateExamNodeRequest } from './server/examGenerator.ts';
import {
  handleGeneratePptImageNodeRequest,
  handleGeneratePptNodeRequest,
} from './server/pptGenerator.ts';
import { GoogleGenAI } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '64kb' }));

  app.all('/api/generate-game', async (req, res) => {
    await handleGenerateGameNodeRequest(req, res);
  });

  app.all('/api/generate-exam', async (req, res) => {
    await handleGenerateExamNodeRequest(req, res);
  });

  app.all('/api/generate-ppt', async (req, res) => {
    await handleGeneratePptNodeRequest(req, res);
  });

  app.all('/api/generate-ppt-image', async (req, res) => {
    await handleGeneratePptImageNodeRequest(req, res);
  });

  app.post('/api/test-gemini', async (req, res) => {
    try {
      const { apiKey, model } = req.body || {};
      const activeKey = apiKey || process.env.GEMINI_API_KEY;
      if (!activeKey || activeKey === 'MY_GEMINI_API_KEY') {
        return res.status(400).json({ success: false, error: 'Chưa cung cấp API Key hợp lệ.' });
      }
      const aiModel = model && model !== 'auto' ? model : 'gemini-2.5-flash';
      const ai = new GoogleGenAI({ apiKey: activeKey });
      const response = await ai.models.generateContent({
        model: aiModel,
        contents: 'Xin chào, hãy trả lời ngắn gọn: "Kết nối thành công".',
      });
      if (response && response.text) {
        return res.json({ success: true, text: response.text });
      }
      return res.status(500).json({ success: false, error: 'Mô hình không phản hồi văn bản.' });
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Lỗi kết nối Gemini API';
      return res.status(500).json({ success: false, error: msg });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
