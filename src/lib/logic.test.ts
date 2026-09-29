import { describe, expect, it } from 'vitest';
import type { Filter, Item, ItemState, Settings } from './types';
import { grade } from './grade';
import { normalize, romajiToHiragana } from './kana';
import { DAY, review } from './srs';
import { buildNewOrder, pickNext } from './queue';

const base: Omit<Item, 'id' | 'expression' | 'reading'> = {
  alt_readings: [],
  meaning_ko: '',
  level: 1,
  reading_type: 'onyomi',
  category: 'operation',
  jlpt: 'N1',
  priority: 1,
  bjt_priority: 5,
};
const mk = (id: string, expression: string, reading: string, extra: Partial<Item> = {}): Item => ({
  ...base,
  id,
  expression,
  reading,
  ...extra,
});
const settings: Settings = { hesitationMs: 3000, newRatio: 0.3, allowRomaji: true };

describe('정답 판정', () => {
  const shounin = mk('a', '承認', 'しょうにん');

  it('정확히 읽으면 정답', () => {
    expect(grade(shounin, 'しょうにん', settings).status).toBe('correct');
  });
  it('가타카나·공백은 무시', () => {
    expect(grade(shounin, ' ショウ ニン ', settings).status).toBe('correct');
  });
  it('로마자 입력 지원', () => {
    expect(grade(shounin, 'shounin', settings).status).toBe('correct');
    expect(romajiToHiragana('konnichiha')).toBe('こんにちは');
    expect(romajiToHiragana('kekka')).toBe('けっか');
    expect(romajiToHiragana('shinsei')).toBe('しんせい');
  });
  it('장음 누락은 근접 오답으로 분류', () => {
    const r = grade(shounin, 'しょにん', settings);
    expect(r.status).toBe('near');
    expect(r.errorType).toBe('long_vowel');
  });
  it('촉음 누락', () => {
    const r = grade(mk('b', '決算', 'けっさん'), 'けさん', settings);
    expect(r).toMatchObject({ status: 'near', errorType: 'sokuon' });
  });
  it('탁음·연탁 오류', () => {
    const r = grade(mk('c', '手続き', 'てつづき', { reading_type: 'kunyomi' }), 'てつつき', settings);
    expect(r).toMatchObject({ status: 'near', errorType: 'rendaku' });
  });
  it('요음 오류', () => {
    const r = grade(shounin, 'しようにん', settings);
    expect(r).toMatchObject({ status: 'near', errorType: 'yoon' });
  });
  it('다른 읽기는 읽기 유형별 오답', () => {
    expect(grade(mk('d', '催促', 'さいそく'), 'さいしょく', settings)).toMatchObject({ status: 'wrong' });
    expect(grade(mk('e', '承る', 'うけたまわる', { reading_type: 'kunyomi' }), 'しょうる', settings).errorType).toBe(
      'kanji_kunyomi',
    );
  });
  it('빈 입력은 모름', () => {
    expect(grade(shounin, '', settings)).toMatchObject({ status: 'wrong', errorType: 'unknown' });
  });
  it('한자로 변환된 입력은 판정하지 않음', () => {
    expect(grade(shounin, '承認', settings).status).toBe('invalid');
  });
  it('대체 읽기 인정', () => {
    expect(grade(mk('f', '早急', 'さっきゅう', { alt_readings: ['そうきゅう'] }), 'そうきゅう', settings).status).toBe(
      'correct',
    );
  });
  it('문장: 문장부호·공백 무시, 조사 は/へ/を 발음 입력 허용', () => {
    const s = mk('s', '本日は見積書をご確認ください。', 'ほんじつは みつもりしょを ごかくにんください', { level: 3 });
    expect(grade(s, 'ほんじつわみつもりしょおごかくにんください', settings).status).toBe('correct');
    expect(grade(s, 'ほんじつは、みつもりしょを ごかくにんください。', settings).status).toBe('correct');
  });
  it('normalize: 긴 음표 통일', () => {
    expect(normalize('スケジュール')).toBe('すけじゅーる');
  });
});

describe('복습 알고리즘', () => {
  const now = 1_000_000_000_000;
  it('신규 정답 → 1일 뒤, 이후 3·7·14·30일', () => {
    let s: ItemState | undefined;
    const expected = [1, 3, 7, 14, 30];
    for (const d of expected) {
      s = review(s, { ok: true, hesitant: false, answer: '', now });
      expect(s.due - now).toBe(d * DAY);
    }
    expect(s!.streak).toBe(5);
  });
  it('오답 → 재학습(step 0), 재학습 정답 → 다음 날', () => {
    let s = review(undefined, { ok: true, hesitant: false, answer: '', now });
    s = review(s, { ok: true, hesitant: false, answer: '', now });
    s = review(s, { ok: false, hesitant: false, answer: 'x', errorType: 'kanji_onyomi', now });
    expect(s.step).toBe(0);
    expect(s.errors.kanji_onyomi).toBe(1);
    s = review(s, { ok: true, hesitant: false, answer: '', now });
    expect(s.due - now).toBe(1 * DAY);
  });
  it('망설인 정답은 간격을 늘리지 않음', () => {
    let s = review(undefined, { ok: true, hesitant: false, answer: '', now }); // 1일
    s = review(s, { ok: true, hesitant: true, answer: '', now, firstKeyMs: 5000 });
    expect(s.due - now).toBe(1 * DAY);
    expect(s.hesitations).toBe(1);
  });
});

describe('무한 모드 출제', () => {
  const items = Array.from({ length: 5 }, (_, i) => mk(`w${i}`, `字${i}`, 'じ'));
  const filter: Filter = { scope: 'all', levels: [], category: 'all' };
  const ctx = (states: Record<string, ItemState>, recent: string[] = []) => ({
    items,
    newOrder: buildNewOrder(items),
    states,
    filter,
    settings,
    recent,
    now: Date.now(),
    rand: () => 0.99,
  });

  it('모든 문항을 다 봤고 복습 대기가 없어도 계속 출제', () => {
    const now = Date.now();
    const states: Record<string, ItemState> = {};
    for (const it of items) {
      states[it.id] = review(undefined, { ok: true, hesitant: false, answer: '', now });
    }
    for (let i = 0; i < 50; i++) {
      const p = pickNext(ctx(states, ['w0']));
      expect(p).not.toBeNull();
      expect(p!.reason).toBe('practice');
      expect(p!.item.id).not.toBe('w0');
    }
  });
  it('방금 틀린 문항은 몇 문제 뒤에 재학습으로 등장', () => {
    const now = Date.now();
    const wrong = review(undefined, { ok: false, hesitant: false, answer: '', now });
    expect(pickNext(ctx({ w0: wrong }, ['w0']))!.reason).toBe('new');
    expect(pickNext(ctx({ w0: wrong }, ['w0', 'w1', 'w2', 'w3', 'w4']))).toMatchObject({
      reason: 'relearn',
      item: { id: 'w0' },
    });
  });
  it('복합어·문장은 들어 있는 한자를 먼저 본 뒤 등장', () => {
    const list = [mk('k1', '承認', 'しょうにん'), mk('k2', '申請', 'しんせい'), mk('c1', '承認申請', 'x', { level: 2 })];
    const order = buildNewOrder(list);
    const now = Date.now();
    const c = { ...ctx({}), items: list, newOrder: order };
    expect(pickNext(c)!.item.level).toBe(1);
    const seen = {
      k1: review(undefined, { ok: true, hesitant: false, answer: '', now }),
      k2: review(undefined, { ok: true, hesitant: false, answer: '', now }),
    };
    expect(pickNext({ ...c, states: seen })!.item.id).toBe('c1');
  });
});
