-- Replace badge-like robot avatars with deterministic humanlike portrait avatars.
-- No visible category labels, no TECH/LOCAL/SPORT text, no third-party image URLs.

CREATE OR REPLACE FUNCTION public."buildRobotAvatarSvg"(
  p_id text,
  p_display_name text,
  p_bio text DEFAULT ''
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_hash text := md5(coalesce(p_id, p_display_name, 'robot'));
  v_seed text := substring(v_hash, 1, 12);
  h1 int := (('x' || substring(v_hash, 1, 2))::bit(8)::int);
  h2 int := (('x' || substring(v_hash, 3, 2))::bit(8)::int);
  h3 int := (('x' || substring(v_hash, 5, 2))::bit(8)::int);
  h4 int := (('x' || substring(v_hash, 7, 2))::bit(8)::int);
  h5 int := (('x' || substring(v_hash, 9, 2))::bit(8)::int);
  h6 int := (('x' || substring(v_hash, 11, 2))::bit(8)::int);
  h7 int := (('x' || substring(v_hash, 13, 2))::bit(8)::int);
  v_skin text;
  v_hair text;
  v_shirt text;
  v_bg1 text;
  v_bg2 text;
  v_lip text;
  v_svg text;
  v_hair_shape text;
  v_glasses text := '';
  v_blush text := '';
  v_face_cx int := 160 + ((h1 % 9) - 4);
  v_face_cy int := 128 + ((h2 % 9) - 4);
  v_face_rx int := 57 + (h3 % 9);
  v_face_ry int := 66 + (h4 % 10);
  v_eye_y int := 124 + (h5 % 9);
  v_mouth_y int := 164 + (h6 % 10);
  v_nose_x int := 160 + ((h7 % 7) - 3);
BEGIN
  v_skin := (array['#f7c9a9','#efb48f','#d99570','#c97955','#8f553d','#f1d0b5','#d8a47f','#b87757'])[(h1 % 8) + 1];
  v_hair := (array['#1f1612','#332018','#4b2b19','#6b3f22','#171717','#2b211c','#5b3824','#8a5a35'])[(h2 % 8) + 1];
  v_shirt := (array['#111827','#2563eb','#0f766e','#7c3aed','#be123c','#334155','#ca8a04','#0e7490','#16a34a'])[(h3 % 9) + 1];
  v_bg1 := (array['#e0f2fe','#fce7f3','#f5f3ff','#dcfce7','#ffedd5','#e0e7ff','#fef3c7','#cffafe'])[(h4 % 8) + 1];
  v_bg2 := (array['#93c5fd','#f9a8d4','#c4b5fd','#86efac','#fdba74','#a5b4fc','#fde68a','#67e8f9'])[(h5 % 8) + 1];
  v_lip := (array['#9f4a4e','#8f3f46','#a85252','#7f3a40','#b15b62'])[(h6 % 5) + 1];

  v_hair_shape := CASE h7 % 5
    WHEN 0 THEN '<path d="M94 129c4-48 33-82 72-82 42 0 71 33 75 81-21-26-53-37-84-37-29 0-51 11-63 38Z" fill="' || v_hair || '"/>'
    WHEN 1 THEN '<path d="M93 127c6-52 37-83 78-79 35 4 60 30 67 74-26-18-54-20-83-15-26 4-46 11-62 20Z" fill="' || v_hair || '"/><path d="M111 90c26-35 84-39 108 4-33-13-70-12-108-4Z" fill="rgba(255,255,255,0.08)"/>'
    WHEN 2 THEN '<path d="M96 121c10-47 42-72 82-69 34 3 58 28 64 72-20-11-34-18-58-17-34 2-62 1-88 14Z" fill="' || v_hair || '"/><circle cx="124" cy="86" r="22" fill="' || v_hair || '"/><circle cx="156" cy="75" r="24" fill="' || v_hair || '"/><circle cx="190" cy="87" r="22" fill="' || v_hair || '"/>'
    WHEN 3 THEN '<path d="M88 133c5-52 31-87 75-87 50 0 76 37 79 90-19-31-50-42-80-42-34 0-57 12-74 39Z" fill="' || v_hair || '"/><path d="M104 65c23 22 66 26 105 17-19-24-72-37-105-17Z" fill="rgba(255,255,255,0.1)"/>'
    ELSE '<path d="M95 127c4-50 34-79 75-79 39 0 67 27 72 78-16-13-34-19-57-18-30 1-61 6-90 19Z" fill="' || v_hair || '"/><path d="M110 111c26-31 67-38 116-20-35-31-86-32-116 20Z" fill="rgba(0,0,0,0.16)"/>'
  END;

  IF h2 % 6 = 0 THEN
    v_glasses := '<g fill="none" stroke="#1f2937" stroke-width="4" stroke-linecap="round"><circle cx="134" cy="132" r="17"/><circle cx="186" cy="132" r="17"/><path d="M151 132h18"/></g>';
  END IF;

  IF h3 % 4 = 0 THEN
    v_blush := '<circle cx="117" cy="150" r="10" fill="rgba(244,114,182,0.22)"/><circle cx="203" cy="150" r="10" fill="rgba(244,114,182,0.22)"/>';
  END IF;

  v_svg := '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">'
    || '<defs><linearGradient id="bg' || v_seed || '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' || v_bg1 || '"/><stop offset="1" stop-color="' || v_bg2 || '"/></linearGradient><radialGradient id="light' || v_seed || '" cx="30%" cy="20%" r="70%"><stop offset="0" stop-color="rgba(255,255,255,0.72)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/></radialGradient></defs>'
    || '<rect width="320" height="320" rx="160" fill="url(#bg' || v_seed || ')"/>'
    || '<circle cx="82" cy="70" r="80" fill="url(#light' || v_seed || ')"/>'
    || '<path d="M48 300c12-61 59-102 112-102s100 41 112 102" fill="' || v_shirt || '"/>'
    || '<path d="M118 214c8 22 76 22 84 0v-24h-84v24Z" fill="' || v_skin || '"/>'
    || v_hair_shape
    || '<ellipse cx="' || v_face_cx || '" cy="' || v_face_cy || '" rx="' || v_face_rx || '" ry="' || v_face_ry || '" fill="' || v_skin || '"/>'
    || '<ellipse cx="98" cy="141" rx="16" ry="23" fill="' || v_skin || '" opacity="0.92"/>'
    || '<ellipse cx="222" cy="141" rx="16" ry="23" fill="' || v_skin || '" opacity="0.92"/>'
    || '<path d="M112 112c26-11 61-12 96-2-13-31-74-41-96 2Z" fill="rgba(255,255,255,0.12)"/>'
    || '<path d="M119 ' || (v_eye_y - 12)::text || 'c12-7 25-7 36 0" stroke="rgba(35,24,20,0.5)" stroke-width="5" stroke-linecap="round" fill="none"/>'
    || '<path d="M166 ' || (v_eye_y - 12)::text || 'c12-7 25-7 36 0" stroke="rgba(35,24,20,0.5)" stroke-width="5" stroke-linecap="round" fill="none"/>'
    || '<circle cx="137" cy="' || v_eye_y::text || '" r="5" fill="#141018"/>'
    || '<circle cx="185" cy="' || v_eye_y::text || '" r="5" fill="#141018"/>'
    || v_glasses
    || '<path d="M' || v_nose_x::text || ' 137c-5 14-9 25-3 31 4 4 12 3 17 0" stroke="rgba(74,43,35,0.32)" stroke-width="4" stroke-linecap="round" fill="none"/>'
    || v_blush
    || '<path d="M137 ' || v_mouth_y::text || 'c15 12 33 12 48 0" stroke="' || v_lip || '" stroke-width="5" stroke-linecap="round" fill="none"/>'
    || '<path d="M87 300c18-36 44-55 73-55s55 19 73 55" fill="rgba(255,255,255,0.1)"/>'
    || '<circle cx="160" cy="160" r="154" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="6"/>'
    || '<circle cx="160" cy="160" r="146" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="2"/>'
    || '</svg>';

  RETURN 'data:image/svg+xml;base64,' || encode(convert_to(v_svg, 'UTF8'), 'base64');
END;
$$;
