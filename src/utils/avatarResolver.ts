type UnknownRecord = Record<string, unknown>;

const AVATAR_FIELD_KEYS = [
  'photoUrl',
  'avatarUrl',
  'avatar',
  'imageUrl',
  'image',
  'picture',
  'profileImageUrl',
  'profileImage',
  'profilePicture',
  'profilePhotoUrl',
  'photoURL',
  'photo_url',
  'avatar_url',
  'profile_image_url',
  'profile_picture',
  'profile_photo_url',
] as const;

function cleanString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const text = cleanString(value);
    if (text) return text;
  }
  return '';
}

function readRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {};
}

function readAvatarFields(record: UnknownRecord, keys: readonly string[] = AVATAR_FIELD_KEYS) {
  return firstNonEmpty(...keys.map((key) => record[key]));
}

export function resolveUserAvatarUrl(value: unknown): string {
  const root = readRecord(value);
  const user = readRecord(root.user);
  const author = readRecord(root.author);
  const creator = readRecord(root.creator);
  const publisher = readRecord(root.publisher);
  const profile = readRecord(user.profile || root.profile);

  return firstNonEmpty(
    readAvatarFields(profile),
    readAvatarFields(user),
    readAvatarFields(author),
    readAvatarFields(creator),
    readAvatarFields(publisher),
    readAvatarFields(root, [
      ...AVATAR_FIELD_KEYS,
      'userPhotoUrl',
      'userAvatarUrl',
      'userAvatar',
      'userPhoto',
      'authorPhotoUrl',
      'authorAvatarUrl',
      'authorAvatar',
      'creatorPhotoUrl',
      'creatorAvatarUrl',
      'publisherPhotoUrl',
      'publisherAvatarUrl',
      'user_photo_url',
      'user_avatar_url',
      'author_photo_url',
      'author_avatar_url',
    ]),
  );
}
