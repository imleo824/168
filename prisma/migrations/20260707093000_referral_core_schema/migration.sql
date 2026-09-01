-- Referral core schema
-- Idempotent by design because early referral versions created these tables from server runtime.

CREATE TABLE IF NOT EXISTS "ReferralInvite" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "inviteCode" TEXT NOT NULL UNIQUE,
  "disabledAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ReferralRelation" (
  "id" TEXT PRIMARY KEY,
  "referrerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "inviteeId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "inviteCode" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "sourceIp" TEXT,
  "sourceUserAgent" TEXT,
  "registeredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ReferralRelation_no_self" CHECK ("referrerId" <> "inviteeId")
);

CREATE TABLE IF NOT EXISTS "ReferralCommission" (
  "id" TEXT PRIMARY KEY,
  "referrerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "inviteeId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "orderId" TEXT NOT NULL UNIQUE REFERENCES "Order"("id") ON DELETE CASCADE,
  "rechargeAmount" NUMERIC(18, 6) NOT NULL DEFAULT 0,
  "commissionRate" NUMERIC(10, 6) NOT NULL DEFAULT 0,
  "commissionAmount" NUMERIC(18, 6) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "availableAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "settledAt" TIMESTAMPTZ,
  "convertedAt" TIMESTAMPTZ,
  "withdrawalId" TEXT
);

CREATE TABLE IF NOT EXISTS "ReferralWithdrawal" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "amount" NUMERIC(18, 6) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USDT',
  "network" TEXT NOT NULL DEFAULT 'TRC20',
  "address" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "adminNote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "paidAt" TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS "ReferralConversion" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "amount" NUMERIC(18, 6) NOT NULL DEFAULT 0,
  "points" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'CONVERTED',
  "adminNote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "convertedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "ReferralInvite" ADD COLUMN IF NOT EXISTS "disabledAt" TIMESTAMPTZ;
ALTER TABLE "ReferralInvite" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT now();
ALTER TABLE "ReferralInvite" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT now();
ALTER TABLE "ReferralRelation" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'manual';
ALTER TABLE "ReferralRelation" ADD COLUMN IF NOT EXISTS "sourceIp" TEXT;
ALTER TABLE "ReferralRelation" ADD COLUMN IF NOT EXISTS "sourceUserAgent" TEXT;
ALTER TABLE "ReferralRelation" ADD COLUMN IF NOT EXISTS "registeredAt" TIMESTAMPTZ DEFAULT now();
ALTER TABLE "ReferralRelation" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT now();
ALTER TABLE "ReferralRelation" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT now();
ALTER TABLE "ReferralCommission" ADD COLUMN IF NOT EXISTS "rechargeAmount" NUMERIC(18, 6) DEFAULT 0;
ALTER TABLE "ReferralCommission" ADD COLUMN IF NOT EXISTS "commissionRate" NUMERIC(10, 6) DEFAULT 0;
ALTER TABLE "ReferralCommission" ADD COLUMN IF NOT EXISTS "commissionAmount" NUMERIC(18, 6) DEFAULT 0;
ALTER TABLE "ReferralCommission" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'PENDING';
ALTER TABLE "ReferralCommission" ADD COLUMN IF NOT EXISTS "availableAt" TIMESTAMPTZ DEFAULT now();
ALTER TABLE "ReferralCommission" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT now();
ALTER TABLE "ReferralCommission" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT now();
ALTER TABLE "ReferralCommission" ADD COLUMN IF NOT EXISTS "settledAt" TIMESTAMPTZ;
ALTER TABLE "ReferralCommission" ADD COLUMN IF NOT EXISTS "convertedAt" TIMESTAMPTZ;
ALTER TABLE "ReferralCommission" ADD COLUMN IF NOT EXISTS "withdrawalId" TEXT;
ALTER TABLE "ReferralWithdrawal" ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'USDT';
ALTER TABLE "ReferralWithdrawal" ADD COLUMN IF NOT EXISTS "network" TEXT DEFAULT 'TRC20';
ALTER TABLE "ReferralWithdrawal" ADD COLUMN IF NOT EXISTS "adminNote" TEXT;
ALTER TABLE "ReferralWithdrawal" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT now();
ALTER TABLE "ReferralWithdrawal" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT now();
ALTER TABLE "ReferralWithdrawal" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMPTZ;
ALTER TABLE "ReferralConversion" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'CONVERTED';
ALTER TABLE "ReferralConversion" ADD COLUMN IF NOT EXISTS "adminNote" TEXT;
ALTER TABLE "ReferralConversion" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT now();
ALTER TABLE "ReferralConversion" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT now();
ALTER TABLE "ReferralConversion" ADD COLUMN IF NOT EXISTS "convertedAt" TIMESTAMPTZ DEFAULT now();

DELETE FROM "ReferralInvite" ri USING (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY CASE WHEN "disabledAt" IS NULL THEN 0 ELSE 1 END, "createdAt" DESC NULLS LAST, "id" DESC) AS rn
    FROM "ReferralInvite" WHERE "userId" IS NOT NULL
  ) ranked WHERE rn > 1
) stale WHERE ri."id" = stale."id";

DELETE FROM "ReferralInvite" ri USING (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "inviteCode" ORDER BY CASE WHEN "disabledAt" IS NULL THEN 0 ELSE 1 END, "createdAt" DESC NULLS LAST, "id" DESC) AS rn
    FROM "ReferralInvite" WHERE "inviteCode" IS NOT NULL
  ) ranked WHERE rn > 1
) stale WHERE ri."id" = stale."id";

DELETE FROM "ReferralRelation" rr USING (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "inviteeId" ORDER BY "createdAt" DESC NULLS LAST, "id" DESC) AS rn
    FROM "ReferralRelation" WHERE "inviteeId" IS NOT NULL
  ) ranked WHERE rn > 1
) stale WHERE rr."id" = stale."id";

DELETE FROM "ReferralCommission" rc USING (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "orderId" ORDER BY "createdAt" ASC NULLS LAST, "id" ASC) AS rn
    FROM "ReferralCommission" WHERE "orderId" IS NOT NULL
  ) ranked WHERE rn > 1
) stale WHERE rc."id" = stale."id";

CREATE UNIQUE INDEX IF NOT EXISTS "idx_referral_invite_user_unique" ON "ReferralInvite" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_referral_invite_code_unique" ON "ReferralInvite" ("inviteCode");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_referral_relation_invitee_unique" ON "ReferralRelation" ("inviteeId");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_referral_commission_order_unique" ON "ReferralCommission" ("orderId");
CREATE INDEX IF NOT EXISTS "idx_referral_relation_referrer_created" ON "ReferralRelation" ("referrerId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_referral_relation_invitee" ON "ReferralRelation" ("inviteeId");
CREATE INDEX IF NOT EXISTS "idx_referral_commission_referrer_status_created" ON "ReferralCommission" ("referrerId", "status", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_referral_commission_invitee_created" ON "ReferralCommission" ("inviteeId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_referral_withdrawal_user_created" ON "ReferralWithdrawal" ("userId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_referral_withdrawal_status_created" ON "ReferralWithdrawal" ("status", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_referral_conversion_user_created" ON "ReferralConversion" ("userId", "createdAt" DESC, "id" DESC);

INSERT INTO "SystemConfig" ("key", "value", "updatedAt")
VALUES
  ('referral_enabled', 'true', now()),
  ('referral_commission_rate', '0.5', now()),
  ('referral_settlement_days', '1', now()),
  ('referral_min_withdraw_usdt', '10', now())
ON CONFLICT ("key") DO NOTHING;
