import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleGeneratePptNodeRequest } from '../server/pptGenerator.ts';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await handleGeneratePptNodeRequest(req, res);
}
