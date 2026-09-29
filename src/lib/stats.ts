import type { Attempt, ErrorType, Item, ItemState, Settings } from './types';
import { DAY, MASTERED_STEP, avgFirstKey } from './srs';

export const FK_CAP = 30000; // 30초 넘는 반응은 자리 비움으로 보고 평균에서 제외

const rate = (ok: number, n: number) => (n ? ok / n : null);

function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface DailyPoint {
  day: string;
  n: number;
  accuracy: number | null;
  avgFk: number | null;
}

export interface Kpis {
  attempts: number;
  accuracy: number | null; // Reading Accuracy
  accuracy7d: number | null;
  firstAttempt: number | null; // First Attempt Accuracy
  avgFirstKey: number | null; // Reading Response Time (정답·단어 기준)
  repeatedErrorRate: number | null; // 한 번 틀린 문항 중 2회 이상 틀린 비율
  retention7: number | null; // 7일 이상 지나 다시 봤을 때 정답률
  retention30: number | null;
  seenItems: number;
  masteredItems: number;
  totalItems: number;
}

export function computeKpis(items: Item[], states: Record<string, ItemState>, attempts: Attempt[], now: number): Kpis {
  const levelOf = new Map(items.map((it) => [it.id, it.level]));
  let ok = 0;
  let n7 = 0;
  let ok7 = 0;
  let firstN = 0;
  let firstOk = 0;
  let fkSum = 0;
  let fkN = 0;
  let r7n = 0;
  let r7ok = 0;
  let r30n = 0;
  let r30ok = 0;
  for (const a of attempts) {
    ok += a.ok;
    if (now - a.t <= 7 * DAY) {
      n7 += 1;
      ok7 += a.ok;
    }
    if (a.gap === -1) {
      firstN += 1;
      firstOk += a.ok;
    }
    if (a.ok && a.fk > 0 && a.fk < FK_CAP && (levelOf.get(a.id) ?? 1) <= 2) {
      fkSum += a.fk;
      fkN += 1;
    }
    if (a.gap >= 7) {
      r7n += 1;
      r7ok += a.ok;
    }
    if (a.gap >= 30) {
      r30n += 1;
      r30ok += a.ok;
    }
  }
  let everWrong = 0;
  let repeated = 0;
  let seen = 0;
  let mastered = 0;
  for (const it of items) {
    const st = states[it.id];
    if (!st?.seen) continue;
    seen += 1;
    if (st.step >= MASTERED_STEP) mastered += 1;
    if (st.wrong >= 1) everWrong += 1;
    if (st.wrong >= 2) repeated += 1;
  }
  return {
    attempts: attempts.length,
    accuracy: rate(ok, attempts.length),
    accuracy7d: rate(ok7, n7),
    firstAttempt: rate(firstOk, firstN),
    avgFirstKey: fkN ? fkSum / fkN : null,
    repeatedErrorRate: rate(repeated, everWrong),
    retention7: rate(r7ok, r7n),
    retention30: rate(r30ok, r30n),
    seenItems: seen,
    masteredItems: mastered,
    totalItems: items.length,
  };
}

export function dailySeries(items: Item[], attempts: Attempt[], now: number, days = 14): DailyPoint[] {
  const levelOf = new Map(items.map((it) => [it.id, it.level]));
  const buckets = new Map<string, { n: number; ok: number; fk: number; fkN: number }>();
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(now - i * DAY);
    keys.push(k);
    buckets.set(k, { n: 0, ok: 0, fk: 0, fkN: 0 });
  }
  for (const a of attempts) {
    const b = buckets.get(dayKey(a.t));
    if (!b) continue;
    b.n += 1;
    b.ok += a.ok;
    if (a.ok && a.fk > 0 && a.fk < FK_CAP && (levelOf.get(a.id) ?? 1) <= 2) {
      b.fk += a.fk;
      b.fkN += 1;
    }
  }
  return keys.map((day) => {
    const b = buckets.get(day)!;
    return { day, n: b.n, accuracy: rate(b.ok, b.n), avgFk: b.fkN ? b.fk / b.fkN : null };
  });
}

export function errorBreakdown(states: Record<string, ItemState>): [ErrorType, number][] {
  const acc: Partial<Record<ErrorType, number>> = {};
  for (const st of Object.values(states)) {
    for (const [k, v] of Object.entries(st.errors)) acc[k as ErrorType] = (acc[k as ErrorType] ?? 0) + (v ?? 0);
  }
  return (Object.entries(acc) as [ErrorType, number][]).sort((a, b) => b[1] - a[1]);
}

// 망설임 단어: 맞히긴 했지만 입력 시작까지 오래 걸린 단어·복합어
export function hesitantTop(items: Item[], states: Record<string, ItemState>, settings: Settings, limit = 20) {
  return items
    .filter((it) => it.level <= 2)
    .map((it) => ({ it, st: states[it.id] }))
    .filter(({ st }) => st && st.firstKeyCount > 0 && (st.hesitations > 0 || avgFirstKey(st) > settings.hesitationMs))
    .sort((a, b) => avgFirstKey(b.st!) - avgFirstKey(a.st!))
    .slice(0, limit);
}

export function wrongTop(items: Item[], states: Record<string, ItemState>, limit = 20) {
  return items
    .map((it) => ({ it, st: states[it.id] }))
    .filter(({ st }) => st && st.wrong > 0)
    .sort((a, b) => b.st!.wrong - a.st!.wrong || b.st!.wrong / b.st!.seen - a.st!.wrong / a.st!.seen)
    .slice(0, limit);
}

export const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);
export const secs = (ms: number | null) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)}초`);
