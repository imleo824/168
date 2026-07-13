-- Robot identity integrity
-- Contract:
-- 1. Chat robots are real public User records with userType=ROBOT.
-- 2. ChatBotProfile.id is the canonical robot User.id.
-- 3. Every BOT ChatMessage must carry both botProfileId and authorUserId.
-- 4. Robot display names and avatars must be unique at the database boundary.

CREATE OR REPLACE FUNCTION canonical_robot_avatar_url(robot_id text)
RETURNS text AS $$
BEGIN
  RETURN 'https://api.dicebear.com/8.x/thumbs/svg?seed=robot-' || encode(convert_to(robot_id, 'UTF8'), 'hex') || '&size=256&backgroundColor=ffd6a5,caffbf,9bf6ff,bdb2ff,ffc6ff';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 1) Promote old BOT message authors into ChatBotProfile if they only existed as message snapshots.
INSERT INTO "ChatBotProfile" (
  "id",
  "displayName",
  "photoUrl",
  "persona",
  "isEnabled",
  "weight",
  "cooldownSeconds",
  "createdAt",
  "updatedAt"
)
SELECT DISTINCT ON (cm."authorUserId")
  cm."authorUserId",
  COALESCE(NULLIF(TRIM(cm."authorName"), ''), '机器人'),
  canonical_robot_avatar_url(cm."authorUserId"),
  '普通群友，偶尔聊两句。',
  TRUE,
  1,
  90,
  COALESCE(MIN(cm."createdAt") OVER (PARTITION BY cm."authorUserId"), NOW()),
  NOW()
FROM "ChatMessage" cm
LEFT JOIN "ChatBotProfile" cb ON cb."id" = cm."authorUserId"
WHERE cm."authorType" = 'BOT'
  AND cm."authorUserId" IS NOT NULL
  AND cm."authorUserId" <> ''
  AND cb."id" IS NULL
ORDER BY cm."authorUserId", cm."createdAt" ASC, cm."id" ASC;

-- 2) For BOT messages that only have botProfileId, make authorUserId canonical.
UPDATE "ChatMessage"
SET
  "authorUserId" = "botProfileId",
  "updatedAt" = NOW()
WHERE "authorType" = 'BOT'
  AND ("authorUserId" IS NULL OR "authorUserId" = '')
  AND "botProfileId" IS NOT NULL
  AND "botProfileId" <> '';

-- 3) For BOT messages that only have authorUserId, make botProfileId canonical.
UPDATE "ChatMessage"
SET
  "botProfileId" = "authorUserId",
  "updatedAt" = NOW()
WHERE "authorType" = 'BOT'
  AND ("botProfileId" IS NULL OR "botProfileId" = '')
  AND "authorUserId" IS NOT NULL
  AND "authorUserId" <> '';

-- 4) Ensure every ChatBotProfile has a mirrored User with the same id.
INSERT INTO "User" (
  "id",
  "displayName",
  "photoUrl",
  "bio",
  "userType",
  "isDisabled",
  "points",
  "role",
  "createdAt",
  "updatedAt"
)
SELECT
  cb."id",
  COALESCE(NULLIF(TRIM(cb."displayName"), ''), '机器人'),
  canonical_robot_avatar_url(cb."id"),
  LEFT(COALESCE(NULLIF(TRIM(cb."persona"), ''), '普通群友，偶尔聊两句。'), 160),
  'ROBOT',
  NOT cb."isEnabled",
  0,
  'USER',
  COALESCE(cb."createdAt", NOW()),
  NOW()
FROM "ChatBotProfile" cb
LEFT JOIN "User" u ON u."id" = cb."id"
WHERE u."id" IS NULL;

-- 5) Normalize duplicated ChatBotProfile names before creating unique indexes.
WITH ranked AS (
  SELECT
    "id",
    "displayName",
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM("displayName")) ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "ChatBotProfile"
)
UPDATE "ChatBotProfile" cb
SET
  "displayName" = LEFT(COALESCE(NULLIF(TRIM(ranked."displayName"), ''), '机器人'), 40) || '·' || ranked.rn || '-' || SUBSTRING(cb."id" FROM 1 FOR 4),
  "updatedAt" = NOW()
FROM ranked
WHERE cb."id" = ranked."id"
  AND ranked.rn > 1;

-- 6) Canonicalize every ChatBotProfile avatar by id.
UPDATE "ChatBotProfile"
SET
  "photoUrl" = canonical_robot_avatar_url("id"),
  "updatedAt" = NOW()
WHERE TRUE;

-- 7) Sync mirrored Users from ChatBotProfile after canonicalization.
UPDATE "User" u
SET
  "displayName" = cb."displayName",
  "photoUrl" = cb."photoUrl",
  "bio" = LEFT(COALESCE(NULLIF(TRIM(cb."persona"), ''), COALESCE(u."bio", '普通群友，偶尔聊两句。')), 160),
  "userType" = 'ROBOT',
  "isDisabled" = NOT cb."isEnabled",
  "updatedAt" = NOW()
FROM "ChatBotProfile" cb
WHERE u."id" = cb."id";

-- 8) Normalize duplicated robot User names across every robot account.
WITH ranked AS (
  SELECT
    "id",
    "displayName",
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM("displayName")) ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "User"
  WHERE "userType" = 'ROBOT'
)
UPDATE "User" u
SET
  "displayName" = LEFT(COALESCE(NULLIF(TRIM(ranked."displayName"), ''), '机器人'), 40) || '·' || ranked.rn || '-' || SUBSTRING(u."id" FROM 1 FOR 4),
  "updatedAt" = NOW()
FROM ranked
WHERE u."id" = ranked."id"
  AND ranked.rn > 1;

-- 9) Canonicalize every robot User avatar by id.
UPDATE "User"
SET
  "photoUrl" = canonical_robot_avatar_url("id"),
  "updatedAt" = NOW()
WHERE "userType" = 'ROBOT';

-- 10) Sync ChatBotProfile names back from User if a global robot User duplicate normalization changed them.
UPDATE "ChatBotProfile" cb
SET
  "displayName" = u."displayName",
  "photoUrl" = u."photoUrl",
  "updatedAt" = NOW()
FROM "User" u
WHERE u."id" = cb."id"
  AND u."userType" = 'ROBOT';

-- 11) Backfill all BOT messages from their canonical ChatBotProfile identity.
UPDATE "ChatMessage" cm
SET
  "authorUserId" = cb."id",
  "botProfileId" = cb."id",
  "authorName" = cb."displayName",
  "authorPhotoUrl" = cb."photoUrl",
  "updatedAt" = NOW()
FROM "ChatBotProfile" cb
WHERE cm."authorType" = 'BOT'
  AND (
    cm."botProfileId" = cb."id"
    OR cm."authorUserId" = cb."id"
  );

-- 12) Hard fail if any BOT message still lacks a real identity.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ChatMessage" cm
    LEFT JOIN "User" u ON u."id" = cm."authorUserId" AND u."userType" = 'ROBOT'
    LEFT JOIN "ChatBotProfile" cb ON cb."id" = cm."botProfileId"
    WHERE cm."authorType" = 'BOT'
      AND (
        cm."authorUserId" IS NULL
        OR cm."authorUserId" = ''
        OR cm."botProfileId" IS NULL
        OR cm."botProfileId" = ''
        OR u."id" IS NULL
        OR cb."id" IS NULL
        OR cm."authorUserId" <> cm."botProfileId"
      )
  ) THEN
    RAISE EXCEPTION 'robot_identity_integrity_failed: BOT messages must resolve to canonical robot users';
  END IF;
END $$;

-- 13) Runtime guards: robot identities cannot duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_robot_display_name_unique"
  ON "User" (LOWER(TRIM("displayName")))
  WHERE "userType" = 'ROBOT';

CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_robot_photo_hash_unique"
  ON "User" (MD5(COALESCE("photoUrl", '')))
  WHERE "userType" = 'ROBOT' AND "photoUrl" IS NOT NULL AND "photoUrl" <> '';

CREATE UNIQUE INDEX IF NOT EXISTS "idx_chat_bot_profile_display_name_unique"
  ON "ChatBotProfile" (LOWER(TRIM("displayName")));

CREATE UNIQUE INDEX IF NOT EXISTS "idx_chat_bot_profile_photo_hash_unique"
  ON "ChatBotProfile" (MD5(COALESCE("photoUrl", '')))
  WHERE "photoUrl" IS NOT NULL AND "photoUrl" <> '';

ALTER TABLE "ChatMessage" DROP CONSTRAINT IF EXISTS "chat_message_bot_identity_required";
ALTER TABLE "ChatMessage" ADD CONSTRAINT "chat_message_bot_identity_required"
  CHECK (
    "authorType" <> 'BOT'
    OR (
      "authorUserId" IS NOT NULL
      AND "authorUserId" <> ''
      AND "botProfileId" IS NOT NULL
      AND "botProfileId" <> ''
      AND "authorUserId" = "botProfileId"
    )
  );

-- 14) Trigger: future ChatBotProfile writes cannot reuse names or avatars across ChatBotProfile and robot User.
CREATE OR REPLACE FUNCTION ensure_chat_bot_profile_identity_integrity()
RETURNS trigger AS $$
DECLARE
  duplicate_count integer;
BEGIN
  NEW."displayName" := COALESCE(NULLIF(TRIM(NEW."displayName"), ''), '机器人');

  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT "id" FROM "ChatBotProfile"
    WHERE LOWER(TRIM("displayName")) = LOWER(TRIM(NEW."displayName"))
      AND "id" <> NEW."id"
    UNION ALL
    SELECT "id" FROM "User"
    WHERE "userType" = 'ROBOT'
      AND LOWER(TRIM("displayName")) = LOWER(TRIM(NEW."displayName"))
      AND "id" <> NEW."id"
  ) duplicate_names;

  IF duplicate_count > 0 THEN
    NEW."displayName" := LEFT(NEW."displayName", 40) || '·' || SUBSTRING(NEW."id" FROM 1 FOR 8);
  END IF;

  IF NEW."photoUrl" IS NULL OR NEW."photoUrl" = '' OR EXISTS (
    SELECT 1
    FROM (
      SELECT "id", "photoUrl" FROM "ChatBotProfile"
      UNION ALL
      SELECT "id", "photoUrl" FROM "User" WHERE "userType" = 'ROBOT'
    ) robot_identities
    WHERE robot_identities."photoUrl" = NEW."photoUrl"
      AND robot_identities."id" <> NEW."id"
  ) THEN
    NEW."photoUrl" := canonical_robot_avatar_url(NEW."id");
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_chat_bot_profile_identity_integrity" ON "ChatBotProfile";
CREATE TRIGGER "trg_chat_bot_profile_identity_integrity"
BEFORE INSERT OR UPDATE OF "displayName", "photoUrl" ON "ChatBotProfile"
FOR EACH ROW
EXECUTE FUNCTION ensure_chat_bot_profile_identity_integrity();

-- 15) Trigger: future robot User writes cannot reuse names or avatars across User and ChatBotProfile.
CREATE OR REPLACE FUNCTION ensure_robot_user_identity_integrity()
RETURNS trigger AS $$
DECLARE
  duplicate_count integer;
BEGIN
  IF NEW."userType" <> 'ROBOT' THEN
    RETURN NEW;
  END IF;

  NEW."displayName" := COALESCE(NULLIF(TRIM(NEW."displayName"), ''), '机器人');

  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT "id" FROM "User"
    WHERE "userType" = 'ROBOT'
      AND LOWER(TRIM("displayName")) = LOWER(TRIM(NEW."displayName"))
      AND "id" <> NEW."id"
    UNION ALL
    SELECT "id" FROM "ChatBotProfile"
    WHERE LOWER(TRIM("displayName")) = LOWER(TRIM(NEW."displayName"))
      AND "id" <> NEW."id"
  ) duplicate_names;

  IF duplicate_count > 0 THEN
    NEW."displayName" := LEFT(NEW."displayName", 40) || '·' || SUBSTRING(NEW."id" FROM 1 FOR 8);
  END IF;

  IF NEW."photoUrl" IS NULL OR NEW."photoUrl" = '' OR EXISTS (
    SELECT 1
    FROM (
      SELECT "id", "photoUrl" FROM "User" WHERE "userType" = 'ROBOT'
      UNION ALL
      SELECT "id", "photoUrl" FROM "ChatBotProfile"
    ) robot_identities
    WHERE robot_identities."photoUrl" = NEW."photoUrl"
      AND robot_identities."id" <> NEW."id"
  ) THEN
    NEW."photoUrl" := canonical_robot_avatar_url(NEW."id");
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_robot_user_identity_integrity" ON "User";
CREATE TRIGGER "trg_robot_user_identity_integrity"
BEFORE INSERT OR UPDATE OF "displayName", "photoUrl", "userType" ON "User"
FOR EACH ROW
EXECUTE FUNCTION ensure_robot_user_identity_integrity();

-- 16) Trigger: ChatBotProfile is the source of truth and always syncs into User.
CREATE OR REPLACE FUNCTION sync_chat_bot_profile_to_robot_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO "User" (
    "id",
    "displayName",
    "photoUrl",
    "bio",
    "userType",
    "isDisabled",
    "points",
    "role",
    "createdAt",
    "updatedAt"
  ) VALUES (
    NEW."id",
    NEW."displayName",
    NEW."photoUrl",
    LEFT(COALESCE(NULLIF(TRIM(NEW."persona"), ''), '普通群友，偶尔聊两句。'), 160),
    'ROBOT',
    NOT NEW."isEnabled",
    0,
    'USER',
    COALESCE(NEW."createdAt", NOW()),
    NOW()
  )
  ON CONFLICT ("id") DO UPDATE SET
    "displayName" = EXCLUDED."displayName",
    "photoUrl" = EXCLUDED."photoUrl",
    "bio" = EXCLUDED."bio",
    "userType" = 'ROBOT',
    "isDisabled" = EXCLUDED."isDisabled",
    "updatedAt" = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_chat_bot_profile_to_robot_user" ON "ChatBotProfile";
CREATE TRIGGER "trg_chat_bot_profile_to_robot_user"
AFTER INSERT OR UPDATE OF "displayName", "photoUrl", "persona", "isEnabled" ON "ChatBotProfile"
FOR EACH ROW
EXECUTE FUNCTION sync_chat_bot_profile_to_robot_user();
