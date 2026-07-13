export const postDetailRouteMigrationInvariants = [
  'Post detail read route',
  '不改 API 路径',
  '不改返回结构',
  '不改鉴权',
  '不改限流',
  '保留 maskContact',
  '保留 view dedupe',
];

export const postDetailRouteMigrationGuardNote =
  'These machine-readable invariants keep the route guard stable when the long-form migration document is stored in a protected document format.';
