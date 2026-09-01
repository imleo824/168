import type { Request } from 'express';
import crypto from 'crypto';

export function getRequestId(req: Request) {
  const raw = req.headers['x-request-id'];
  return typeof raw === 'string' && raw.trim()
    ? raw.trim()
    : crypto.randomUUID();
}
