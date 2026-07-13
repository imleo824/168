-- Robot avatar guard v4: natural photo URLs instead of badge/cartoon SVG avatars.
-- Keeps robot avatars non-empty and deterministic while avoiding visible template labels.

CREATE OR REPLACE FUNCTION public."buildRobotAvatarPhotoUrl"(
  p_id text,
  p_display_name text,
  p_bio text DEFAULT ''
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_seed text := substring(md5(coalesce(p_id, p_display_name, 'robot')), 1, 16);
  v_bucket int := (('x' || substring(md5(coalesce(p_id, p_display_name, 'robot')), 1, 2))::bit(8)::int % 10);
BEGIN
  -- 70% portrait-like photo source, 30% mixed real-photo source.
  IF v_bucket < 7 THEN
    RETURN 'https://i.pravatar.cc/320?u=tuitui-' || v_seed;
  END IF;

  RETURN 'https://picsum.photos/seed/tuitui-' || v_seed || '/320/320';
END;
$$;

CREATE OR REPLACE FUNCTION public."ensureRobotUserAvatar"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF new."userType"::text = 'ROBOT' THEN
    IF tg_op = 'INSERT'
      OR new."photoUrl" IS NULL
      OR btrim(new."photoUrl") = ''
      OR new."photoUrl" LIKE 'data:image/svg+xml%'
      OR NOT (
        new."photoUrl" LIKE 'https://i.pravatar.cc/%'
        OR new."photoUrl" LIKE 'https://picsum.photos/%'
      )
      OR new."displayName" IS DISTINCT FROM old."displayName"
      OR new."bio" IS DISTINCT FROM old."bio" THEN
        new."photoUrl" := public."buildRobotAvatarPhotoUrl"(new."id", new."displayName", coalesce(new."bio", ''));
    END IF;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS "trgEnsureRobotUserAvatar" ON public."User";
CREATE TRIGGER "trgEnsureRobotUserAvatar"
BEFORE INSERT OR UPDATE OF "photoUrl", "displayName", "bio", "userType" ON public."User"
FOR EACH ROW
EXECUTE FUNCTION public."ensureRobotUserAvatar"();

CREATE OR REPLACE FUNCTION public."ensureChatBotProfileAvatar"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF tg_op = 'INSERT'
    OR new."photoUrl" IS NULL
    OR btrim(new."photoUrl") = ''
    OR new."photoUrl" LIKE 'data:image/svg+xml%'
    OR NOT (
      new."photoUrl" LIKE 'https://i.pravatar.cc/%'
      OR new."photoUrl" LIKE 'https://picsum.photos/%'
    )
    OR new."displayName" IS DISTINCT FROM old."displayName"
    OR new."persona" IS DISTINCT FROM old."persona" THEN
      new."photoUrl" := public."buildRobotAvatarPhotoUrl"(new."id", new."displayName", coalesce(new."persona", ''));
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS "trgEnsureChatBotProfileAvatar" ON public."ChatBotProfile";
CREATE TRIGGER "trgEnsureChatBotProfileAvatar"
BEFORE INSERT OR UPDATE OF "photoUrl", "displayName", "persona" ON public."ChatBotProfile"
FOR EACH ROW
EXECUTE FUNCTION public."ensureChatBotProfileAvatar"();
