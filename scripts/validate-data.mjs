// 콘텐츠 데이터 검증: npm run validate
// - 필수 필드·값 범위 확인
// - reading 이 히라가나(문장은 공백·ー 허용)인지 확인
// - 파일 간 id / 표기 중복 확인
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
const LEVELS = [1, 2, 3, 4];
const TYPES = ['onyomi', 'kunyomi', 'mixed', 'jukujikun'];
const CATS = ['transaction', 'contract', 'finance', 'hr', 'meeting', 'report', 'schedule', 'operation', 'customer', 'general'];
const WORD_RE = /^[ぁ-ゖー]+$/;
const SENT_RE = /^[ぁ-ゖー ]+$/;

const errors = [];
const warnings = [];
const ids = new Map();
const exprs = new Map();
const counts = {};
let total = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  let arr;
  try {
    arr = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  } catch (e) {
    errors.push(`${file}: JSON 파싱 실패 - ${e.message}`);
    continue;
  }
  if (!Array.isArray(arr)) {
    errors.push(`${file}: 배열이 아닙니다`);
    continue;
  }
  counts[file] = arr.length;
  total += arr.length;
  for (const it of arr) {
    const at = `${file} ${it.id ?? '(id 없음)'} ${it.expression ?? ''}`;
    for (const k of ['id', 'expression', 'reading', 'meaning_ko']) if (!it[k]) errors.push(`${at}: ${k} 누락`);
    if (!LEVELS.includes(it.level)) errors.push(`${at}: level 값 오류 (${it.level})`);
    if (!TYPES.includes(it.reading_type)) errors.push(`${at}: reading_type 값 오류 (${it.reading_type})`);
    if (!CATS.includes(it.category)) errors.push(`${at}: category 값 오류 (${it.category})`);
    if (![1, 2, 3, 4].includes(it.priority)) errors.push(`${at}: priority 값 오류 (${it.priority})`);
    const re = it.level >= 3 ? SENT_RE : WORD_RE;
    for (const r of [it.reading, ...(it.alt_readings ?? [])]) {
      if (r && !re.test(r)) errors.push(`${at}: 읽기에 허용되지 않는 문자 (${r})`);
    }
    if (ids.has(it.id)) errors.push(`${at}: id 중복 (${ids.get(it.id)})`);
    ids.set(it.id, file);
    if (exprs.has(it.expression)) warnings.push(`${at}: 표기 중복 (${exprs.get(it.expression)}) → 우선순위 높은 쪽만 사용`);
    else exprs.set(it.expression, file);
  }
}

console.log('파일별 문항 수:', counts);
console.log(`합계 ${total}개 · 중복 제거 후 ${exprs.size}개`);
if (warnings.length) console.log(`\n경고 ${warnings.length}건\n` + warnings.join('\n'));
if (errors.length) {
  console.error(`\n오류 ${errors.length}건\n` + errors.join('\n'));
  process.exit(1);
}
console.log('\n오류 없음');
