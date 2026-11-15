import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleTestGeminiNodeRequest } from '../server/testGemini.ts';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await handleTestGeminiNodeRequest(req, res);
}
