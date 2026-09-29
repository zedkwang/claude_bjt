import type { ErrorType, Item, Settings } from './types';
import { foldParticles, hasKanji, isKanaOnly, looksLikeRomaji, normalize, romajiToHiragana } from './kana';

export type GradeStatus = 'correct' | 'near' | 'wrong' | 'invalid';

export interface GradeResult {
  status: GradeStatus;
  errorType?: ErrorType;
  input: string; // 정규화된 사용자 입력
  message?: string;
}

// 가나 → 모음 (장음 판정용)
const VOWEL_ROWS: Record<string, string> = {
  a: 'あかさたなはまやらわがざだばぱぁゃ',
  i: 'いきしちにひみりぎじぢびぴぃ',
  u: 'うくすつぬふむゆるぐずづぶぷぅゅ',
  e: 'えけせてねへめれげぜでべぺぇ',
  o: 'おこそとのほもよろをごぞどぼぽぉょ',
};
const VOWEL_OF: Record<string, string> = {};
for (const [v, chars] of Object.entries(VOWEL_ROWS)) for (const c of chars) VOWEL_OF[c] = v;
const VOWEL_KANA: Record<string, string> = { あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o' };

// 장음 제거: しょう→しょ, けい→け, おお→お, ー 제거
function foldLongVowel(s: string): string {
  let out = '';
  let prevVowel = '';
  for (const c of s) {
    if (c === 'ー') continue;
    const asVowel = VOWEL_KANA[c];
    if (
      asVowel &&
      prevVowel &&
      (asVowel === prevVowel || (asVowel === 'u' && prevVowel === 'o') || (asVowel === 'i' && prevVowel === 'e'))
    ) {
      continue;
    }
    out += c;
    prevVowel = VOWEL_OF[c] ?? '';
  }
  return out;
}

const foldSokuon = (s: string) => s.replace(/っ/g, '');
const foldDakuten = (s: string) => s.normalize('NFD').replace(/[゙゚]/g, '').normalize('NFC');
const SMALL: Record<string, string> = { ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お' };
const foldYoon = (s: string) => s.replace(/[ゃゅょぁぃぅぇぉ]/g, (c) => SMALL[c]);

const NEAR_CHECKS: [ErrorType, (s: string) => string][] = [
  ['long_vowel', foldLongVowel],
  ['sokuon', foldSokuon],
  ['rendaku', foldDakuten],
  ['yoon', foldYoon],
];

export function readingErrorType(item: Item): ErrorType {
  if (item.reading_type === 'onyomi') return 'kanji_onyomi';
  if (item.reading_type === 'kunyomi') return 'kanji_kunyomi';
  return 'mixed_reading';
}

export function prepareInput(raw: string, settings: Pick<Settings, 'allowRomaji'>): string {
  const trimmed = raw.trim();
  if (settings.allowRomaji && looksLikeRomaji(trimmed)) return normalize(romajiToHiragana(trimmed));
  return normalize(trimmed);
}

export function grade(item: Item, raw: string, settings: Pick<Settings, 'allowRomaji'>): GradeResult {
  const input = prepareInput(raw, settings);
  if (input === '') return { status: 'wrong', errorType: 'unknown', input };
  if (hasKanji(input) || !isKanaOnly(input)) {
    return { status: 'invalid', input, message: '히라가나로 입력해 주세요 (한자로 변환되었습니다)' };
  }

  const isSentence = item.level >= 3;
  const fold = (s: string) => (isSentence ? foldParticles(s) : s);
  const answer = fold(input);
  const candidates = [item.reading, ...(item.alt_readings ?? [])].map((r) => fold(normalize(r)));

  if (candidates.includes(answer)) return { status: 'correct', input };

  for (const [type, f] of NEAR_CHECKS) {
    if (candidates.some((c) => f(c) === f(answer))) return { status: 'near', errorType: type, input };
  }
  // 여러 종류의 사소한 오류가 겹친 경우
  const all = (s: string) => foldYoon(foldDakuten(foldSokuon(foldLongVowel(s))));
  if (candidates.some((c) => all(c) === all(answer))) return { status: 'near', errorType: 'long_vowel', input };

  return { status: 'wrong', errorType: readingErrorType(item), input };
}

export const ERROR_LABEL: Record<ErrorType, string> = {
  kanji_onyomi: '음독 오류',
  kanji_kunyomi: '훈독 오류',
  mixed_reading: '혼합 읽기 오류',
  rendaku: '탁음·연탁 오류',
  long_vowel: '장음 오류',
  sokuon: '촉음(っ) 오류',
  yoon: '요음(ゃゅょ) 오류',
  unknown: '모름',
};
