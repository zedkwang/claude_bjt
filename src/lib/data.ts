import type { Item } from './types';
import { kanjiOf } from './kana';

// src/data/*.json 을 모두 읽어 하나의 문항 목록으로 합침 (파일을 추가하면 자동 반영)
const modules = import.meta.glob<Item[]>('../data/*.json', { eager: true, import: 'default' });

function loadItems(): Item[] {
  const seenId = new Set<string>();
  const seenExpr = new Map<string, Item>();
  const out: Item[] = [];
  for (const path of Object.keys(modules).sort()) {
    for (const raw of modules[path]) {
      const it: Item = { ...raw, alt_readings: raw.alt_readings ?? [] };
      if (seenId.has(it.id)) continue;
      // 같은 표기가 여러 파일에 있으면 우선순위가 높은(숫자가 작은) 쪽을 남김
      const dup = seenExpr.get(it.expression);
      if (dup) {
        if (it.priority < dup.priority) {
          out[out.indexOf(dup)] = it;
          seenExpr.set(it.expression, it);
          seenId.add(it.id);
        }
        continue;
      }
      seenId.add(it.id);
      seenExpr.set(it.expression, it);
      out.push(it);
    }
  }
  return out;
}

export const ITEMS: Item[] = loadItems();
export const ITEM_BY_ID: Record<string, Item> = Object.fromEntries(ITEMS.map((it) => [it.id, it]));

// 한자 → 그 한자를 포함한 단어·복합어 (정답 후 관련 단어 표시용)
const KANJI_INDEX = new Map<string, Item[]>();
for (const it of ITEMS) {
  if (it.level > 2) continue;
  for (const k of kanjiOf(it.expression)) {
    const list = KANJI_INDEX.get(k) ?? [];
    list.push(it);
    KANJI_INDEX.set(k, list);
  }
}

// 단어를 복합어보다 먼저, 같은 레벨에서는 BJT 중요도 순
for (const list of KANJI_INDEX.values()) list.sort((a, b) => a.level - b.level || b.bjt_priority - a.bjt_priority);

export function relatedByKanji(item: Item, perKanji = 4): { kanji: string; items: Item[] }[] {
  if (item.level > 2) return [];
  const shown = new Set([item.id]);
  return kanjiOf(item.expression)
    .filter((k) => k !== '々')
    .map((kanji) => {
      const items = (KANJI_INDEX.get(kanji) ?? []).filter((x) => !shown.has(x.id)).slice(0, perKanji);
      items.forEach((x) => shown.add(x.id));
      return { kanji, items };
    })
    .filter((g) => g.items.length > 0);
}

export const CATEGORY_LABEL: Record<string, string> = {
  transaction: '거래·견적·납품',
  contract: '계약·법무',
  finance: '재무·실적',
  hr: '인사·조직',
  meeting: '회의·의사결정',
  report: '보고·연락',
  schedule: '일정·납기',
  operation: '업무 운영',
  customer: '고객 대응',
  general: '일반(N1)',
};

export const LEVEL_LABEL: Record<number, string> = {
  1: '단어',
  2: '복합어',
  3: '짧은 문장',
  4: '비즈니스 문장',
};

export const READING_TYPE_LABEL: Record<string, string> = {
  onyomi: '음독',
  kunyomi: '훈독',
  mixed: '혼합',
  jukujikun: '숙자훈',
};
