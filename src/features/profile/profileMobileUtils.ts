export function getProfileRelationName(user: any) {
  return String(user?.displayName || user?.username || '用户').trim() || '用户';
}

export function getProfileRelationUsername(user: any) {
  return String(user?.username || '').trim();
}

