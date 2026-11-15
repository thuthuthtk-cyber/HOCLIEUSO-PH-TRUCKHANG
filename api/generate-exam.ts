import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleGenerateExamNodeRequest } from '../server/examGenerator.ts';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await handleGenerateExamNodeRequest(req, res);
}
