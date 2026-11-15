import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleGeneratePptImageNodeRequest } from '../server/pptGenerator.ts';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await handleGeneratePptImageNodeRequest(req, res);
}
