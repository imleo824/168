-- Notification and web-push storage previously lived in request-time bootstrap code.

CREATE TABLE IF NOT EXISTS "UserNotification" (
  "id" TEXT PRIMARY KEY,
  "sourceKey" TEXT NOT NULL,
  "receiverId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "actorId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "type" TEXT NOT NULL,
  "postId" TEXT REFERENCES "Post"("id") ON DELETE CASCADE,
  "commentId" TEXT,
  "quotePostId" TEXT REFERENCES "Post"("id") ON DELETE CASCADE,
  "title" TEXT,
  "body" TEXT,
  "targetUrl" TEXT,
  "metadata" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "UserNotification" ADD COLUMN IF NOT EXISTS "sourceKey" TEXT;
ALTER TABLE "UserNotification" ADD COLUMN IF NOT EXISTS "receiverId" TEXT;
ALTER TABLE "UserNotification" ADD COLUMN IF NOT EXISTS "actorId" TEXT;
ALTER TABLE "UserNotification" ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE "UserNotification" ADD COLUMN IF NOT EXISTS "postId" TEXT;
ALTER TABLE "UserNotification" ADD COLUMN IF NOT EXISTS "commentId" TEXT;
ALTER TABLE "UserNotification" ADD COLUMN IF NOT EXISTS "quotePostId" TEXT;
ALTER TABLE "UserNotification" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "UserNotification" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "UserNotification" ADD COLUMN IF NOT EXISTS "targetUrl" TEXT;
ALTER TABLE "UserNotification" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "UserNotification" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);
ALTER TABLE "UserNotification" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "UserNotification" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "UserNotification" ALTER COLUMN "actorId" DROP NOT NULL;

DELETE FROM "UserNotification" notification
USING "UserNotification" newer
WHERE notification."receiverId" = newer."receiverId"
  AND notification."sourceKey" = newer."sourceKey"
  AND notification."receiverId" IS NOT NULL
  AND notification."sourceKey" IS NOT NULL
  AND (notification."createdAt", notification."id") < (newer."createdAt", newer."id");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_notification_receiver_source_unique" ON "UserNotification" ("receiverId", "sourceKey");
CREATE INDEX IF NOT EXISTS "idx_user_notification_receiver_created" ON "UserNotification" ("receiverId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_user_notification_receiver_read_created" ON "UserNotification" ("receiverId", "readAt", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_user_notification_receiver_type_created" ON "UserNotification" ("receiverId", "type", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_user_notification_actor_created" ON "UserNotification" ("actorId", "createdAt" DESC, "id" DESC);

CREATE TABLE IF NOT EXISTS "WebPushSubscription" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "endpoint" TEXT NOT NULL UNIQUE,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "platform" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
  "followEnabled" BOOLEAN NOT NULL DEFAULT true,
  "commentEnabled" BOOLEAN NOT NULL DEFAULT true,
  "quoteEnabled" BOOLEAN NOT NULL DEFAULT true,
  "likeEnabled" BOOLEAN NOT NULL DEFAULT false,
  "systemEnabled" BOOLEAN NOT NULL DEFAULT true,
  "rechargeEnabled" BOOLEAN NOT NULL DEFAULT true,
  "promotionEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "WebPushDelivery" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "eventKey" TEXT NOT NULL UNIQUE,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "targetUrl" TEXT NOT NULL DEFAULT '/messages',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "error" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "sentAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "WebPushCursor" (
  "eventType" TEXT PRIMARY KEY,
  "cursorCreatedAt" TIMESTAMPTZ NOT NULL,
  "cursorKey" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_web_push_subscription_user_active" ON "WebPushSubscription" ("userId", "isActive");
CREATE INDEX IF NOT EXISTS "idx_web_push_subscription_updated" ON "WebPushSubscription" ("updatedAt");
CREATE INDEX IF NOT EXISTS "idx_web_push_delivery_user_created" ON "WebPushDelivery" ("userId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_web_push_delivery_status_created" ON "WebPushDelivery" ("status", "createdAt");

ALTER TABLE "UserNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebPushSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebPushDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebPushCursor" ENABLE ROW LEVEL SECURITY;
