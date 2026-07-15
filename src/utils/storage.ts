class MemoryStorage {
  private store: Record<string, string> = {};

  get length(): number {
    return Object.keys(this.store).length;
  }

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] || null;
  }
}

export type StorageInterface = {
  readonly length: number;
  getItem(key: string): string | null;
  key(index: number): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function createMemoryStorage(): StorageInterface {
  return new MemoryStorage();
}

function getAvailableBrowserLocalStorage(): StorageInterface | null {
  if (typeof window === 'undefined') return null;
  const testKey = '__storage_test_key__';
  try {
    const storage = window.localStorage;
    storage.setItem(testKey, 'test');
    const res = storage.getItem(testKey);
    storage.removeItem(testKey);
    return res === 'test' ? storage : null;
  } catch {
    return null;
  }
}

const browserLocalStorage = getAvailableBrowserLocalStorage();

if (!browserLocalStorage && typeof window !== 'undefined') {
  console.warn('localStorage is blocked or unavailable in this environment (likely due to iframe third-party cookie/storage restrictions). Falling back to dynamic memory storage.');
}

export const safeLocalStorage = browserLocalStorage || createMemoryStorage();

export function getStorageKeysByPrefix(prefix: string, storage: StorageInterface = safeLocalStorage) {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys;
}

export function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
