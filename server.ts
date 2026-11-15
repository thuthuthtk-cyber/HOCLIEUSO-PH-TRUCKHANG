import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { handleGenerateGameNodeRequest } from './server/gameGenerator.ts';
import { handleGenerateExamNodeRequest } from './server/examGenerator.ts';
import { handleGenerateLessonPlanNodeRequest } from './server/lessonPlanGenerator.ts';
import {
  handleGeneratePptImageNodeRequest,
  handleGeneratePptNodeRequest,
} from './server/pptGenerator.ts';
import { handleTestGeminiNodeRequest } from './server/testGemini.ts';

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

  app.all('/api/generate-lesson-plan', async (req, res) => {
    await handleGenerateLessonPlanNodeRequest(req, res);
  });

  app.all('/api/generate-ppt', async (req, res) => {
    await handleGeneratePptNodeRequest(req, res);
  });

  app.all('/api/generate-ppt-image', async (req, res) => {
    await handleGeneratePptImageNodeRequest(req, res);
  });

  app.all('/api/test-gemini', async (req, res) => {
    await handleTestGeminiNodeRequest(req, res);
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
