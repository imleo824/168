import type { RequestHandler } from 'express';

const removedHandler: RequestHandler = (_req, res) => {
  res.status(410).json({ error: 'External API has been removed' });
};

export function createWebhookHandlers(_options?: unknown): {
  createWebhookPostHandler: RequestHandler;
  createWebhookLikeHandler: RequestHandler;
} {
  return {
    createWebhookPostHandler: removedHandler,
    createWebhookLikeHandler: removedHandler,
  };
}
