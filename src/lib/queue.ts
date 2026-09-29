import type { Filter, Item, ItemState, Settings } from './types';
import { avgFirstKey } from './srs';
import { kanjiOf } from './kana';

// 무한 모드 출제 순서
// 1) 재학습 (방금 틀린 문항, 몇 문제 뒤 재출제)
// 2) 복습 시점이 된 문항 ↔ 신규 문항 (newRatio 비율로 섞음)
// 3) 둘 다 없으면 약점 문항 가중 랜덤 반복 → 끝나지 않음

export const RELEARN_GAP = 4; // 틀린 문항은 최소 4문제 뒤에 다시 나옴
const RECENT_BLOCK = 6; // 최근 본 문항은 가능한 한 피함
const GATE_RATIO = 0.7; // 복합어·문장은 들어 있는 한자의 70% 이상을 먼저 본 뒤 등장

export type PickReason = 'relearn' | 'due' | 'new' | 'practice';

const PRIORITY_WEIGHT: Record<number, number> = { 1: 1, 2: 1.6, 3: 2.2, 4: 3 };

// 신규 문항 제시 순서: Priority 1 → 4 를 기본으로 하되 그룹 간 교차 배치
export function buildNewOrder(items: Item[]): Item[] {
  const byPriority = new Map<number, Item[]>();
  for (const it of items) {
    const list = byPriority.get(it.priority) ?? [];
    list.push(it);
    byPriority.set(it.priority, list);
  }
  const keyed: { it: Item; key: number }[] = [];
  for (const [p, list] of byPriority) {
    const sorted = [...list].sort((a, b) => b.bjt_priority - a.bjt_priority || a.level - b.level);
    sorted.forEach((it, rank) => keyed.push({ it, key: (rank + 1) * (PRIORITY_WEIGHT[p] ?? 3) + it.level * 0.01 }));
  }
  return keyed.sort((a, b) => a.key - b.key).map((k) => k.it);
}

export function matchesFilter(item: Item, st: ItemState | undefined, filter: Filter, settings: Settings): boolean {
  if (filter.levels.length && !filter.levels.includes(item.level)) return false;
  if (filter.category !== 'all' && item.category !== filter.category) return false;
  switch (filter.scope) {
    case 'kunyomi':
      return item.level <= 2 && (item.reading_type === 'kunyomi' || item.reading_type === 'mixed' || item.reading_type === 'jukujikun');
    case 'wrong':
      return !!st && st.wrong > 0;
    case 'hesitant':
      return !!st && item.level <= 2 && (st.hesitations > 0 || avgFirstKey(st) > settings.hesitationMs);
    default:
      return true;
  }
}

// 약점 점수: 틀린 비율·망설임·느린 반응이 클수록 자주 등장
export function weakness(st: ItemState | undefined, settings: Settings): number {
  if (!st || st.seen === 0) return 1;
  const wrongRate = st.wrong / st.seen;
  const hesRate = st.hesitations / Math.max(1, st.correct);
  const slow = Math.min(3, avgFirstKey(st) / settings.hesitationMs);
  const recentWrong = st.streak === 0 ? 1.5 : 0;
  return 0.3 + wrongRate * 4 + hesRate * 2 + slow + recentWrong;
}

export interface PickContext {
  items: Item[];
  newOrder: Item[];
  states: Record<string, ItemState>;
  filter: Filter;
  settings: Settings;
  recent: string[]; // 최근 출제 id (마지막이 가장 최근)
  now: number;
  rand?: () => number;
}

export interface Pick {
  item: Item;
  reason: PickReason;
}

export function queueCounts(ctx: Omit<PickContext, 'recent' | 'rand' | 'newOrder'>) {
  let relearn = 0;
  let due = 0;
  let fresh = 0;
  let total = 0;
  for (const it of ctx.items) {
    const st = ctx.states[it.id];
    if (!matchesFilter(it, st, ctx.filter, ctx.settings)) continue;
    total += 1;
    if (!st || st.seen === 0) fresh += 1;
    else if (st.step === 0) relearn += 1;
    else if (st.due <= ctx.now) due += 1;
  }
  return { relearn, due, fresh, total };
}

export function pickNext(ctx: PickContext): Pick | null {
  const rand = ctx.rand ?? Math.random;
  const { states, filter, settings, now } = ctx;
  const recentSet = new Set(ctx.recent.slice(-RECENT_BLOCK));
  const relearnBlock = new Set(ctx.recent.slice(-RELEARN_GAP));
  const last = ctx.recent[ctx.recent.length - 1];

  const pool = ctx.items.filter((it) => matchesFilter(it, states[it.id], filter, settings));
  if (pool.length === 0) return null;

  const relearn: Item[] = [];
  const due: Item[] = [];
  const seenPool: Item[] = [];
  for (const it of pool) {
    const st = states[it.id];
    if (!st || st.seen === 0) continue;
    seenPool.push(it);
    if (st.step === 0) {
      if (!relearnBlock.has(it.id)) relearn.push(it);
    } else if (st.due <= now && !recentSet.has(it.id)) {
      due.push(it);
    }
  }

  // 1) 재학습: 가장 오래 기다린 것부터
  if (relearn.length) {
    relearn.sort((a, b) => states[a.id].lastReviewed - states[b.id].lastReviewed);
    return { item: relearn[0], reason: 'relearn' };
  }

  // 2) 복습 ↔ 신규
  const fresh = filter.scope === 'wrong' || filter.scope === 'hesitant' ? null : nextNew(ctx, pool);
  if (due.length && (!fresh || rand() >= settings.newRatio)) {
    // 오래 밀린 순 상위 5개 중에서 약점 가중치로 선택 → 순서가 너무 고정되지 않게
    due.sort((a, b) => states[a.id].due - states[b.id].due);
    const top = due.slice(0, 5);
    return { item: weightedPick(top, (it) => weakness(states[it.id], settings), rand), reason: 'due' };
  }
  if (fresh) return { item: fresh, reason: 'new' };

  // 3) 약점 반복 (무한)
  let candidates = seenPool.filter((it) => !recentSet.has(it.id));
  if (!candidates.length) candidates = pool.filter((it) => it.id !== last);
  if (!candidates.length) candidates = pool;
  return { item: weightedPick(candidates, (it) => weakness(states[it.id], settings), rand), reason: 'practice' };
}

function nextNew(ctx: PickContext, pool: Item[]): Item | null {
  const poolIds = new Set(pool.map((it) => it.id));
  const levelFiltered = ctx.filter.levels.length > 0;
  const known = new Set<string>();
  for (const it of ctx.items) {
    if (ctx.states[it.id]?.seen) for (const k of kanjiOf(it.expression)) known.add(k);
  }
  let fallback: Item | null = null;
  for (const it of ctx.newOrder) {
    if (!poolIds.has(it.id) || ctx.states[it.id]?.seen) continue;
    fallback ??= it;
    // 단어 → 복합어 → 문장 단계 학습: 레벨을 직접 고른 경우에는 제한 없음
    if (it.level === 1 || levelFiltered) return it;
    const ks = kanjiOf(it.expression);
    const covered = ks.filter((k) => known.has(k)).length;
    if (ks.length === 0 || covered / ks.length >= GATE_RATIO) return it;
  }
  // 레벨 1 신규가 모두 소진되면 조건을 만족하지 못한 문항도 순서대로 등장
  const hasLevel1New = ctx.newOrder.some((it) => it.level === 1 && poolIds.has(it.id) && !ctx.states[it.id]?.seen);
  return hasLevel1New ? null : fallback;
}

function weightedPick<T>(list: T[], weight: (t: T) => number, rand: () => number): T {
  const ws = list.map(weight);
  const total = ws.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < list.length; i++) {
    r -= ws[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}
