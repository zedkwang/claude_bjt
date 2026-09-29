import type { Settings, Store } from './types';

const KEY = 'claude-bjt:v1';
const MAX_ATTEMPTS = 30000; // 브라우저 저장 용량 보호 (문항별 누적 기록은 별도로 유지됨)

export const DEFAULT_SETTINGS: Settings = {
  hesitationMs: 3000,
  newRatio: 0.3,
  allowRomaji: true,
};

export function emptyStore(): Store {
  return { version: 1, states: {}, attempts: [], settings: { ...DEFAULT_SETTINGS } };
}

function sanitize(raw: unknown): Store {
  const s = raw as Partial<Store> | null;
  if (!s || typeof s !== 'object' || s.version !== 1) return emptyStore();
  return {
    version: 1,
    states: s.states && typeof s.states === 'object' ? s.states : {},
    attempts: Array.isArray(s.attempts) ? s.attempts : [],
    settings: { ...DEFAULT_SETTINGS, ...(s.settings ?? {}) },
  };
}

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : emptyStore();
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: Store): boolean {
  try {
    const trimmed =
      store.attempts.length > MAX_ATTEMPTS ? { ...store, attempts: store.attempts.slice(-MAX_ATTEMPTS) } : store;
    localStorage.setItem(KEY, JSON.stringify(trimmed));
    return true;
  } catch {
    return false;
  }
}

export function exportStore(store: Store): void {
  const blob = new Blob([JSON.stringify(store)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  a.href = url;
  a.download = `bjt-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importStore(file: File): Promise<Store> {
  const parsed = JSON.parse(await file.text());
  if (!parsed || parsed.version !== 1) throw new Error('백업 파일 형식이 올바르지 않습니다.');
  return sanitize(parsed);
}
