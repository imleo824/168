import type { Response } from 'express';
import { setNoStore } from '../http-cache';

export class HttpError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function isHttpError(err: unknown): err is HttpError {
  return !!err && typeof err === 'object' && 'statusCode' in err && typeof (err as HttpError).statusCode === 'number';
}

export function isDatabaseUnavailableError(error: unknown) {
  const code = String((error as any)?.code || '');
  const message = String((error as any)?.message || '');
  return (
    ['P1000', 'P1001', 'P1002', 'P1003', 'P1008', 'P1017', 'P2024'].includes(code) ||
    /can't reach database server|database server|connection refused|econnrefused|connection terminated|connect timeout|timed out fetching a new connection|server has closed the connection|connection pool/i.test(message)
  );
}

export function isDatabaseSchemaDriftError(error: unknown) {
  const code = String((error as any)?.code || '');
  const message = String((error as any)?.message || '');
  const metaCode = String((error as any)?.meta?.code || '');

  return (
    ['P2021', 'P2022'].includes(code) ||
    (code === 'P2010' && ['42703', '42P01', '23502'].includes(metaCode)) ||
    /column .*does not exist|relation .*does not exist|table .*does not exist|null value in column .*violates not-null constraint|Post\.(showContact|categoryMeta|categoryId|bumpedAt|countryCode|countryName|source|telegramSyncStatus|telegramSyncedAt|telegramSyncRequestedAt|telegramSyncLastError|quoteCount|quotedPostId)/i.test(message)
  );
}

export function sendDatabaseUnavailable(res: Response, action: string) {
  setNoStore(res);
  return res.status(503).json({
    error: `系统服务暂时不可用，暂时无法${action}。请稍后重试。`,
  });
}

export function sendDatabaseSchemaDrift(res: Response, action: string) {
  setNoStore(res);
  return res.status(503).json({
    error: `系统服务正在更新，暂时无法${action}。请稍后重试。`,
  });
}
