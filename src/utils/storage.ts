class MemoryStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] || null;
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
}

export type StorageInterface = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

let safeLocalStorageInstance: StorageInterface;

try {
  const testKey = '__storage_test_key__';
  window.localStorage.setItem(testKey, 'test');
  const res = window.localStorage.getItem(testKey);
  window.localStorage.removeItem(testKey);
  if (res === 'test') {
    safeLocalStorageInstance = window.localStorage;
  } else {
    throw new Error('Storage test did not retrieve the same value');
  }
} catch (e) {
  console.warn('localStorage is blocked or unavailable in this environment (likely due to iframe third-party cookie/storage restrictions). Falling back to dynamic memory storage.');
  const memoryStore = new MemoryStorage();
  safeLocalStorageInstance = {
    getItem: (key) => memoryStore.getItem(key),
    setItem: (key, value) => memoryStore.setItem(key, value),
    removeItem: (key) => memoryStore.removeItem(key),
  };
}

export const safeLocalStorage = safeLocalStorageInstance;
