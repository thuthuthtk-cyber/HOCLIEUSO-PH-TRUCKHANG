import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleGenerateGameNodeRequest } from '../server/gameGenerator.ts';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await handleGenerateGameNodeRequest(req, res);
}
