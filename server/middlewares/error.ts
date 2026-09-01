import { Request, Response, NextFunction } from 'express';

function normalizeStatusCode(err: any) {
  const rawStatus = Number(err?.status || err?.statusCode || 500);
  if (!Number.isInteger(rawStatus) || rawStatus < 400 || rawStatus > 599) {
    return 500;
  }
  return rawStatus;
}

function normalizeErrorMessage(err: any) {
  if (err?.type === 'entity.parse.failed') return '请求格式不正确，请检查 JSON 内容';
  if (err instanceof URIError || /failed to decode param/i.test(String(err?.message || ''))) {
    return '请求路径编码不正确';
  }
  if (err instanceof Error && err.message) return err.message;
  if (typeof err?.message === 'string' && err.message.trim()) return err.message.trim();
  return 'Error occurred';
}

// Global error handler for catching async errors and preventing app crash
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = normalizeStatusCode(err);
  const message = normalizeErrorMessage(err);
  const stack = err instanceof Error ? err.stack : undefined;

  console.error('[System Error]:', {
    requestId: (req as any).requestId,
    message,
    path: req.path,
    method: req.method,
    ip: req.ip,
    statusCode,
    stack: process.env.NODE_ENV === 'production' ? undefined : stack
  });

  if (res.headersSent) {
    return next(err);
  }

  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal Server Error' : message,
    ...(process.env.NODE_ENV !== 'production' && statusCode >= 500 && stack && { stack })
  });
};

// Wrapper for async route callbacks
type RequestWithMiddlewareContext = Request & {
  user?: any;
  requestId?: string;
};

type AsyncRequestHandler = (req: RequestWithMiddlewareContext, res: Response, next: NextFunction) => unknown | Promise<unknown>;

export const catchAsync = (fn: AsyncRequestHandler) => {
  return (req: RequestWithMiddlewareContext, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
