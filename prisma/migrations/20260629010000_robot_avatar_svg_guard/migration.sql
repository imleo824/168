-- Stable robot avatar guard
-- Robot avatars must not depend on third-party image URLs. The app may still pass
-- an empty or external avatar during legacy default-bot creation; the database
-- rewrites it to a deterministic inline SVG so robot avatars are always visible.

CREATE OR REPLACE FUNCTION public."buildRobotAvatarSvg"(
  p_id text,
  p_display_name text,
  p_bio text DEFAULT ''
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_seed text := substring(md5(coalesce(p_id, p_display_name, 'robot')), 1, 10);
  v_name text := coalesce(nullif(btrim(p_display_name), ''), '推推');
  v_bio text := coalesce(p_bio, '');
  v_theme text := 'travel';
  v_label text;
  v_c1 text;
  v_c2 text;
  v_c3 text;
  v_tag text;
  v_hash text := md5(coalesce(p_id, p_display_name, 'robot'));
  v_dx int;
  v_dy int;
  v_ra int;
  v_rb int;
  v_svg text;
BEGIN
  v_dx := ((('x' || substring(v_hash, 1, 2))::bit(8)::int % 54) - 27);
  v_dy := ((('x' || substring(v_hash, 3, 2))::bit(8)::int % 54) - 27);
  v_ra := ((('x' || substring(v_hash, 5, 2))::bit(8)::int % 46) + 18);
  v_rb := ((('x' || substring(v_hash, 7, 2))::bit(8)::int % 38) + 14);

  IF v_bio LIKE '体育%' OR v_name ~ '跑|球|健身|练|Run|Fitness' THEN
    v_theme := 'sport';
  ELSIF v_bio LIKE '文艺%' OR v_name ~ '书|歌|展|咖啡|画|Coffee|Books|Studio|Library' THEN
    v_theme := 'culture';
  ELSIF v_bio LIKE '政商%' OR v_name ~ 'Office|Market|Desk|Client|Brief|Ledger|开会|看报|报' THEN
    v_theme := 'business';
  ELSIF v_bio LIKE '本地生活%' OR v_name ~ '看房|通勤|搬家|买菜|看店|夜市|租房' THEN
    v_theme := 'local';
  ELSIF v_bio LIKE '签证%' OR v_name ~ 'Visa|Hồ sơ|Checkin|Du lịch|Sân bay|Giấy|护照|签证|机场' THEN
    v_theme := 'document';
  ELSIF v_bio LIKE '二手%' OR v_name ~ '验机|看机|电池|屏|清灰|配件|Tech|机' THEN
    v_theme := 'tech';
  ELSIF v_bio LIKE '宠物%' OR v_name ~ '猫|狗|抱狗|遛狗|养猫|Pet' THEN
    v_theme := 'pet';
  END IF;

  v_label := CASE
    WHEN v_name ~ '^[A-Za-z]' THEN left(v_name, 2)
    ELSE left(regexp_replace(v_name, '\s+', '', 'g'), 2)
  END;
  v_label := replace(replace(replace(coalesce(nullif(v_label, ''), '推'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');

  v_c1 := CASE v_theme
    WHEN 'sport' THEN '#22c55e'
    WHEN 'culture' THEN '#a855f7'
    WHEN 'business' THEN '#111827'
    WHEN 'local' THEN '#06b6d4'
    WHEN 'document' THEN '#14b8a6'
    WHEN 'tech' THEN '#6366f1'
    WHEN 'pet' THEN '#f97316'
    ELSE '#0ea5e9'
  END;
  v_c2 := CASE v_theme
    WHEN 'sport' THEN '#0ea5e9'
    WHEN 'culture' THEN '#f97316'
    WHEN 'business' THEN '#f59e0b'
    WHEN 'local' THEN '#3b82f6'
    WHEN 'document' THEN '#0f766e'
    WHEN 'tech' THEN '#22d3ee'
    WHEN 'pet' THEN '#fb7185'
    ELSE '#0891b2'
  END;
  v_c3 := CASE v_theme
    WHEN 'sport' THEN '#064e3b'
    WHEN 'culture' THEN '#581c87'
    WHEN 'business' THEN '#374151'
    WHEN 'local' THEN '#155e75'
    WHEN 'document' THEN '#134e4a'
    WHEN 'tech' THEN '#312e81'
    WHEN 'pet' THEN '#9a3412'
    ELSE '#164e63'
  END;
  v_tag := CASE v_theme
    WHEN 'sport' THEN 'SPORT'
    WHEN 'culture' THEN 'LIFE'
    WHEN 'business' THEN 'WORK'
    WHEN 'local' THEN 'LOCAL'
    WHEN 'document' THEN 'TRAVEL'
    WHEN 'tech' THEN 'TECH'
    WHEN 'pet' THEN 'PET'
    ELSE 'SEA'
  END;

  v_svg := '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">'
    || '<desc>tuitui-robot-' || v_seed || '</desc>'
    || '<defs><linearGradient id="g' || v_seed || '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' || v_c1 || '"/><stop offset="0.52" stop-color="' || v_c2 || '"/><stop offset="1" stop-color="' || v_c3 || '"/></linearGradient><radialGradient id="r' || v_seed || '" cx="34%" cy="24%" r="70%"><stop offset="0" stop-color="rgba(255,255,255,0.48)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/></radialGradient></defs>'
    || '<rect width="320" height="320" rx="160" fill="url(#g' || v_seed || ')"/>'
    || '<circle cx="' || (98 + v_dx)::text || '" cy="' || (86 + v_dy)::text || '" r="' || v_ra::text || '" fill="rgba(255,255,255,0.18)"/>'
    || '<circle cx="' || (224 - v_dx)::text || '" cy="' || (230 - v_dy)::text || '" r="' || v_rb::text || '" fill="rgba(0,0,0,0.12)"/>'
    || '<circle cx="100" cy="86" r="92" fill="url(#r' || v_seed || ')"/>'
    || '<circle cx="160" cy="126" r="62" fill="rgba(255,255,255,0.26)"/>'
    || '<path d="M58 292c18-58 58-88 102-88s84 30 102 88" fill="rgba(0,0,0,0.22)"/>'
    || '<path d="M64 288c18-46 54-70 96-70s78 24 96 70" fill="rgba(255,255,255,0.18)"/>'
    || '<text x="160" y="183" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,Noto Sans SC,sans-serif" font-size="86" font-weight="800" fill="white" letter-spacing="-4">' || v_label || '</text>'
    || '<text x="160" y="250" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,Noto Sans SC,sans-serif" font-size="24" font-weight="700" fill="rgba(255,255,255,0.78)" letter-spacing="2">' || v_tag || '</text>'
    || '<text x="160" y="286" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="rgba(255,255,255,0.34)" letter-spacing="1">' || v_seed || '</text>'
    || '<circle cx="160" cy="160" r="154" fill="none" stroke="rgba(255,255,255,0.46)" stroke-width="6"/>'
    || '<circle cx="160" cy="160" r="146" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="2"/>'
    || '</svg>';

  RETURN 'data:image/svg+xml;base64,' || encode(convert_to(v_svg, 'UTF8'), 'base64');
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
      OR new."photoUrl" ~* '^https?://'
      OR new."photoUrl" !~* '^data:image/svg\+xml;base64,'
      OR new."displayName" IS DISTINCT FROM old."displayName"
      OR new."bio" IS DISTINCT FROM old."bio" THEN
        new."photoUrl" := public."buildRobotAvatarSvg"(new."id", new."displayName", coalesce(new."bio", ''));
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
    OR new."photoUrl" ~* '^https?://'
    OR new."photoUrl" !~* '^data:image/svg\+xml;base64,'
    OR new."displayName" IS DISTINCT FROM old."displayName"
    OR new."persona" IS DISTINCT FROM old."persona" THEN
      new."photoUrl" := public."buildRobotAvatarSvg"(new."id", new."displayName", coalesce(new."persona", ''));
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS "trgEnsureChatBotProfileAvatar" ON public."ChatBotProfile";
CREATE TRIGGER "trgEnsureChatBotProfileAvatar"
BEFORE INSERT OR UPDATE OF "photoUrl", "displayName", "persona" ON public."ChatBotProfile"
FOR EACH ROW
EXECUTE FUNCTION public."ensureChatBotProfileAvatar"();
