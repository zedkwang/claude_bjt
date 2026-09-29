// 가나 정규화 · 로마자 변환 유틸

export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// 공백·문장부호 제거, 가타카나 → 히라가나, 전각/반각 정리
export function normalize(s: string): string {
  return toHiragana(s.normalize('NFKC'))
    .replace(/[\s　]/g, '')
    .replace(/[、。，．,.!！?？「」『』（）()・…〜~：:；;"'”“’‘-]/g, '')
    .replace(/[-－―‐]/g, 'ー');
}

// 문장 문항 한정: 조사 は/へ/を 를 발음대로 입력해도 인정
export function foldParticles(s: string): string {
  return s.replace(/は/g, 'わ').replace(/へ/g, 'え').replace(/を/g, 'お');
}

const KANJI_RE = /[㐀-鿿豈-﫿々]/;
export const hasKanji = (s: string) => KANJI_RE.test(s);
export const kanjiOf = (s: string) => Array.from(new Set(s.match(/[㐀-鿿豈-﫿々]/g) ?? []));

export const isKanaOnly = (s: string) => /^[ぁ-ゖー]*$/.test(s);

// ── 로마자 → 히라가나 (IME 없이 입력할 때를 위한 보조 기능) ──
const ROMAJI: Record<string, string> = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ',
  ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  wa: 'わ', wo: 'を', nn: 'ん', "n'": 'ん',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
  sha: 'しゃ', shu: 'しゅ', sho: 'しょ', sya: 'しゃ', syu: 'しゅ', syo: 'しょ', she: 'しぇ',
  cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ', che: 'ちぇ',
  nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
  hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
  mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
  rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
  gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
  ja: 'じゃ', ju: 'じゅ', jo: 'じょ', zya: 'じゃ', zyu: 'じゅ', zyo: 'じょ', jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
  bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
  pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
  xtu: 'っ', ltu: 'っ', '-': 'ー',
};

export function romajiToHiragana(input: string): string {
  const s = input.toLowerCase();
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    // 촉음: 같은 자음 반복 (n 제외)
    if (i + 1 < s.length && c === s[i + 1] && /[bcdfghjkmpqrstvwxyz]/.test(c)) {
      out += 'っ';
      i += 1;
      continue;
    }
    // "nni" → んに (konnichi → こんにち)
    if (c === 'n' && s[i + 1] === 'n' && /[aiueoy]/.test(s[i + 2] ?? '')) {
      out += 'ん';
      i += 1;
      continue;
    }
    let matched = false;
    for (const len of [3, 2, 1]) {
      const chunk = s.slice(i, i + len);
      if (ROMAJI[chunk]) {
        out += ROMAJI[chunk];
        i += len;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (c === 'n') {
      out += 'ん';
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

export const looksLikeRomaji = (s: string) => /^[a-zA-Z' \-]+$/.test(s.trim());
