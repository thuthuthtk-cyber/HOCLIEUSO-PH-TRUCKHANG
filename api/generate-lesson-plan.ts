import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleGenerateLessonPlanNodeRequest } from '../server/lessonPlanGenerator.ts';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await handleGenerateLessonPlanNodeRequest(req, res);
}
