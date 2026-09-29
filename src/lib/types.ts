// 콘텐츠 문항 (Handoff 19장 metadata 형식)
export type Level = 1 | 2 | 3 | 4; // 1 단어 · 2 복합어 · 3 짧은 문장 · 4 비즈니스 문장
export type ReadingType = 'onyomi' | 'kunyomi' | 'mixed' | 'jukujikun';
export type Category =
  | 'transaction'
  | 'contract'
  | 'finance'
  | 'hr'
  | 'meeting'
  | 'report'
  | 'schedule'
  | 'operation'
  | 'customer'
  | 'general';

export interface Item {
  id: string;
  expression: string;
  reading: string;
  alt_readings: string[];
  meaning_ko: string;
  level: Level;
  reading_type: ReadingType;
  category: Category;
  jlpt: string;
  priority: 1 | 2 | 3 | 4;
  bjt_priority: number;
  example?: string;
  grammar?: string;
}

// 오답 카테고리 (Handoff 15장 중 읽기 판정으로 자동 분류 가능한 것)
export type ErrorType =
  | 'kanji_onyomi'
  | 'kanji_kunyomi'
  | 'mixed_reading'
  | 'rendaku'
  | 'long_vowel'
  | 'sokuon'
  | 'yoon' // 요음 (しょ ↔ しよ)
  | 'unknown'; // 「모름」으로 넘긴 경우

// 문항별 학습 상태
export interface ItemState {
  step: number; // 0 = 재학습 대기, 1..N = 복습 간격 단계
  due: number; // 다음 복습 시각 (ms)
  seen: number;
  correct: number;
  wrong: number;
  streak: number; // 연속 정답
  firstResult: 0 | 1; // 첫 시도 정답 여부
  lastReviewed: number;
  lastAnswer: string;
  errors: Partial<Record<ErrorType, number>>;
  sumFirstKeyMs: number; // 정답일 때만 누적 (망설임 측정용)
  firstKeyCount: number;
  hesitations: number;
}

// 시도 로그 한 건 (통계용, 용량 절약을 위해 짧은 키 사용)
export interface Attempt {
  id: string;
  t: number; // 시각
  ok: 0 | 1;
  fk: number; // 첫 입력까지 걸린 시간 (ms)
  tt: number; // 제출까지 걸린 시간 (ms)
  gap: number; // 직전 학습 후 경과 일수 (-1 = 첫 시도)
  e?: ErrorType;
}

export interface Settings {
  hesitationMs: number; // 이 시간보다 늦게 입력을 시작하면 망설임
  newRatio: number; // 복습 대기 문항이 있을 때 신규 문항 비율 (0~1)
  allowRomaji: boolean;
}

export interface Filter {
  scope: 'all' | 'kunyomi' | 'wrong' | 'hesitant';
  levels: Level[]; // 빈 배열 = 전체
  category: Category | 'all';
}

export interface Store {
  version: 1;
  states: Record<string, ItemState>;
  attempts: Attempt[];
  settings: Settings;
}
