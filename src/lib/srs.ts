import type { ErrorType, ItemState } from './types';

export const DAY = 24 * 60 * 60 * 1000;

// 단계별 복습 간격 (일). step 0 = 오답 직후 재학습 (같은 세션 안에서 몇 문제 뒤 재출제)
// Handoff 16장: 오답 직후 → 1일 → 3일 → 7일 → 14일 → 30일 (이후 60·120일로 빈도 감소)
export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60, 120];
export const MAX_STEP = INTERVAL_DAYS.length - 1;
export const MASTERED_STEP = 4; // 14일 간격 이상 = 안정적으로 읽음

export function emptyState(): ItemState {
  return {
    step: 0,
    due: 0,
    seen: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    firstResult: 0,
    lastReviewed: 0,
    lastAnswer: '',
    errors: {},
    sumFirstKeyMs: 0,
    firstKeyCount: 0,
    hesitations: 0,
  };
}

export interface ReviewInput {
  ok: boolean;
  hesitant: boolean; // 정답이지만 입력 시작이 늦었음
  answer: string;
  errorType?: ErrorType;
  firstKeyMs?: number; // 측정 불가(탭 이탈 등)면 undefined
  now: number;
}

export function review(prev: ItemState | undefined, r: ReviewInput): ItemState {
  const s: ItemState = prev ? { ...prev, errors: { ...prev.errors } } : emptyState();
  const isFirst = s.seen === 0;
  s.seen += 1;
  s.lastReviewed = r.now;
  s.lastAnswer = r.answer;

  if (r.ok) {
    s.correct += 1;
    s.streak += 1;
    if (isFirst) s.firstResult = 1;
    if (r.firstKeyMs !== undefined) {
      s.sumFirstKeyMs += r.firstKeyMs;
      s.firstKeyCount += 1;
    }
    if (r.hesitant) s.hesitations += 1;
    // 재학습/신규 → 1일. 망설였으면 단계를 올리지 않고 같은 간격으로 다시 확인
    const next = s.step === 0 ? 1 : r.hesitant ? s.step : Math.min(s.step + 1, MAX_STEP);
    s.step = next;
    s.due = r.now + INTERVAL_DAYS[next] * DAY;
  } else {
    s.wrong += 1;
    s.streak = 0;
    if (r.errorType) s.errors[r.errorType] = (s.errors[r.errorType] ?? 0) + 1;
    s.step = 0;
    s.due = r.now;
  }
  return s;
}

export const avgFirstKey = (s: ItemState) => (s.firstKeyCount ? s.sumFirstKeyMs / s.firstKeyCount : 0);
