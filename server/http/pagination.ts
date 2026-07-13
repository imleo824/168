import type { Request, Response } from 'express';
import { HttpError } from './errors';
import { normalizeStringParam } from './params';

export type CursorPaginationOptions = {
  defaultLimit?: number;
  maxLimit?: number;
  cursorMaxLength?: number;
};

export type CursorPaginationResult = {
  limit: number;
  cursor?: string;
};

export type CursorPaginationHeaders = {
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
};

export type StrictPaginationParseError = {
  error: string;
  statusCode: number;
};

export type StrictPaginationParams = {
  limit: number;
  cursor?: string;
};

export type StrictPaginationParserOptions = {
  defaultPageSize: number;
  maxPageSize: number;
  maxCursorLength: number;
  cursorPatterns: RegExp[];
};

export type StrictPaginationRequestOptions = {
  maxLimit?: number;
  defaultLimit?: number;
};

export function parseCursorPagination(
  req: Request,
  options: CursorPaginationOptions = {},
): CursorPaginationResult {
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;
  const cursorMaxLength = options.cursorMaxLength ?? 128;
  const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const parsedLimit = Number(rawLimit);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(maxLimit, Math.max(1, Math.round(parsedLimit)))
    : defaultLimit;
  const cursor = normalizeStringParam(req.query.cursor, cursorMaxLength);

  return { limit, cursor: cursor || undefined };
}

export function setCursorPaginationHeaders(res: Response, result: CursorPaginationHeaders) {
  res.setHeader('X-Next-Cursor', result.nextCursor || '');
  res.setHeader('X-Has-More', result.hasMore ? 'true' : 'false');
  if (typeof result.total === 'number') res.setHeader('X-Total-Count', String(result.total));
}

export function createStrictPaginationParser(parserOptions: StrictPaginationParserOptions) {
  function parseStrictPagination(
    req: Request,
    options?: StrictPaginationRequestOptions,
  ): StrictPaginationParams | StrictPaginationParseError {
    const maxLimit = Number.isFinite(options?.maxLimit)
      ? Math.floor(options!.maxLimit!)
      : parserOptions.maxPageSize;
    const defaultLimit = Number.isFinite(options?.defaultLimit)
      ? Math.max(1, Math.floor(options!.defaultLimit!))
      : parserOptions.defaultPageSize;

    const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const parsedLimit = Number(rawLimit);

    if (rawLimit !== undefined && !Number.isFinite(parsedLimit)) {
      return {
        error: 'limit 必须是数字',
        statusCode: 400,
      };
    }

    const safeMaxLimit = Math.max(1, Math.min(maxLimit || parserOptions.maxPageSize, parserOptions.maxPageSize));
    const safeDefaultLimit = Math.max(1, Math.min(defaultLimit || parserOptions.defaultPageSize, safeMaxLimit));
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.floor(parsedLimit), 1), safeMaxLimit)
      : safeDefaultLimit;

    const rawCursor = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
    const trimmedCursor = typeof rawCursor === 'string' ? rawCursor.trim() : '';
    const isKnownCursor = parserOptions.cursorPatterns.some((pattern) => pattern.test(trimmedCursor));
    if (trimmedCursor && (trimmedCursor.length > parserOptions.maxCursorLength || !isKnownCursor)) {
      return {
        error: 'cursor 格式无效',
        statusCode: 400,
      };
    }

    return {
      limit,
      cursor: trimmedCursor || undefined,
    };
  }

  return function throwOnInvalidPagination(
    req: Request,
    options?: StrictPaginationRequestOptions,
  ) {
    const parsed = parseStrictPagination(req, options);
    if ('error' in parsed) {
      throw new HttpError(parsed.error, parsed.statusCode);
    }
    return parsed;
  };
}
