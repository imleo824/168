const profileSettingsOpenListeners = new Set<() => void>();

export function requestProfileSettingsOpen() {
  for (const listener of profileSettingsOpenListeners) {
    listener();
  }
}

export function subscribeProfileSettingsOpen(listener: () => void) {
  profileSettingsOpenListeners.add(listener);
  return () => {
    profileSettingsOpenListeners.delete(listener);
  };
}
