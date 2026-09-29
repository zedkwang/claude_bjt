import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Attempt, Filter, Item, ItemState, Level, Store } from '../lib/types';
import { CATEGORY_LABEL, ITEMS, LEVEL_LABEL, READING_TYPE_LABEL, relatedByKanji } from '../lib/data';
import { ERROR_LABEL, grade, type GradeResult } from '../lib/grade';
import { DAY, review } from '../lib/srs';
import { buildNewOrder, pickNext, queueCounts, type Pick } from '../lib/queue';
import { FK_CAP, secs } from '../lib/stats';

const FILTER_KEY = 'claude-bjt:filter';
const DEFAULT_FILTER: Filter = { scope: 'all', levels: [], category: 'all' };
const NEW_ORDER = buildNewOrder(ITEMS);

function loadFilter(): Filter {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    return raw ? { ...DEFAULT_FILTER, ...JSON.parse(raw) } : DEFAULT_FILTER;
  } catch {
    return DEFAULT_FILTER;
  }
}

interface Answered {
  result: GradeResult;
  rawInput: string;
  hesitant: boolean;
  firstKeyMs?: number;
  prevState?: ItemState; // 오타 처리 시 되돌리기용
  overridden: boolean;
}

interface Session {
  n: number;
  ok: number;
  fkSum: number;
  fkN: number;
}

const SCOPES: [Filter['scope'], string][] = [
  ['all', '전체'],
  ['kunyomi', '훈독·혼합'],
  ['wrong', '오답만'],
  ['hesitant', '망설임'],
];

const REASON_LABEL: Record<Pick['reason'], string> = {
  relearn: '재학습',
  due: '복습',
  new: '신규',
  practice: '반복',
};

export default function Drill({
  store,
  update,
  active,
}: {
  store: Store;
  update: (fn: (s: Store) => Store) => void;
  active: boolean;
}) {
  const [filter, setFilter] = useState<Filter>(loadFilter);
  const [current, setCurrent] = useState<Pick | null>(null);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState('');
  const [showMeaning, setShowMeaning] = useState(false);
  const [session, setSession] = useState<Session>({ n: 0, ok: 0, fkSum: 0, fkN: 0 });

  const recent = useRef<string[]>([]);
  const shownAt = useRef(0);
  const firstKeyAt = useRef<number | null>(null);
  const leftTab = useRef(false);
  const answeredAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(filter));
    } catch {
      /* 필터 기억은 편의 기능이라 실패해도 무시 */
    }
  }, [filter]);

  const next = useCallback(
    (f: Filter = filter) => {
      const s = storeRef.current;
      const pick = pickNext({
        items: ITEMS,
        newOrder: NEW_ORDER,
        states: s.states,
        filter: f,
        settings: s.settings,
        recent: recent.current,
        now: Date.now(),
      });
      setCurrent(pick);
      setAnswered(null);
      setInput('');
      setNotice('');
      setShowMeaning(false);
      shownAt.current = performance.now();
      firstKeyAt.current = null;
      leftTab.current = false;
    },
    [filter],
  );

  // 첫 문제
  useEffect(() => {
    next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 문제를 보는 중에 탭을 떠나면 반응 시간은 기록하지 않음
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) leftTab.current = true;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // 새 문제가 화면에 반영된 뒤 입력창에 포커스
  useEffect(() => {
    if (active && !answered) inputRef.current?.focus();
  }, [current, answered, active]);

  const changeFilter = (f: Filter) => {
    setFilter(f);
    if (!answered) next(f);
  };

  const submit = () => {
    if (!current || answered) return;
    const item = current.item;
    const s = storeRef.current;
    const result = grade(item, input, s.settings);
    if (result.status === 'invalid') {
      setNotice(result.message ?? '');
      return;
    }
    const now = Date.now();
    const elapsed = performance.now() - shownAt.current;
    const fkRaw = firstKeyAt.current !== null ? firstKeyAt.current - shownAt.current : elapsed;
    const firstKeyMs = leftTab.current || fkRaw > FK_CAP ? undefined : Math.round(fkRaw);
    const ok = result.status === 'correct';
    const hesitant = ok && item.level <= 2 && firstKeyMs !== undefined && firstKeyMs > s.settings.hesitationMs;
    const prevState = s.states[item.id];

    const attempt: Attempt = {
      id: item.id,
      t: now,
      ok: ok ? 1 : 0,
      fk: firstKeyMs ?? 0,
      tt: Math.round(elapsed),
      gap: prevState?.seen ? Math.floor((now - prevState.lastReviewed) / DAY) : -1,
      ...(ok ? {} : { e: result.errorType }),
    };
    const nextState = review(prevState, {
      ok,
      hesitant,
      answer: result.input,
      errorType: result.errorType,
      firstKeyMs,
      now,
    });
    update((st) => ({ ...st, states: { ...st.states, [item.id]: nextState }, attempts: [...st.attempts, attempt] }));
    setSession((ss) => ({
      n: ss.n + 1,
      ok: ss.ok + (ok ? 1 : 0),
      fkSum: ss.fkSum + (ok && firstKeyMs !== undefined && item.level <= 2 ? firstKeyMs : 0),
      fkN: ss.fkN + (ok && firstKeyMs !== undefined && item.level <= 2 ? 1 : 0),
    }));
    recent.current = [...recent.current.slice(-20), item.id];
    answeredAt.current = performance.now();
    setAnswered({ result, rawInput: input, hesitant, firstKeyMs, prevState, overridden: false });
    setNotice('');
  };

  // 오타로 처리: 방금 기록한 오답을 정답으로 되돌림
  const overrideTypo = () => {
    if (!current || !answered || answered.result.status === 'correct' || answered.overridden) return;
    const item = current.item;
    const now = Date.now();
    const fixed = review(answered.prevState, {
      ok: true,
      hesitant: false,
      answer: answered.result.input,
      firstKeyMs: answered.firstKeyMs,
      now,
    });
    update((st) => {
      const attempts = [...st.attempts];
      const last = attempts[attempts.length - 1];
      if (last && last.id === item.id) attempts[attempts.length - 1] = { ...last, ok: 1, e: undefined };
      return { ...st, states: { ...st.states, [item.id]: fixed }, attempts };
    });
    setSession((ss) => ({
      ...ss,
      ok: ss.ok + 1,
      fkSum: ss.fkSum + (answered.firstKeyMs !== undefined && item.level <= 2 ? answered.firstKeyMs : 0),
      fkN: ss.fkN + (answered.firstKeyMs !== undefined && item.level <= 2 ? 1 : 0),
    }));
    setAnswered({ ...answered, overridden: true });
  };

  // 답한 뒤 단축키: Enter 다음 · M 뜻 보기 · T 오타 처리
  useEffect(() => {
    if (!answered) return;
    const onKey = (e: KeyboardEvent) => {
      if (!active || e.isComposing || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        // 제출에 쓴 Enter 가 곧바로 '다음'으로 이어지지 않도록
        if (performance.now() - answeredAt.current < 250) return;
        next();
      } else if (e.key === 'm' || e.key === 'M') {
        setShowMeaning((v) => !v);
      } else if (e.key === 't' || e.key === 'T') {
        overrideTypo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const counts = useMemo(
    () => queueCounts({ items: ITEMS, states: store.states, filter, settings: store.settings, now: Date.now() }),
    [store.states, filter, store.settings],
  );

  const toggleLevel = (lv: Level) => {
    const levels = filter.levels.includes(lv) ? filter.levels.filter((x) => x !== lv) : [...filter.levels, lv];
    changeFilter({ ...filter, levels: levels.sort() });
  };

  const item = current?.item;
  const isSentence = !!item && item.level >= 3;
  const st = item ? store.states[item.id] : undefined;

  return (
    <div className="drill">
      <section className="filters" aria-label="학습 범위">
        <div className="seg" role="group" aria-label="범위">
          {SCOPES.map(([key, label]) => (
            <button
              key={key}
              className={filter.scope === key ? 'seg-btn on' : 'seg-btn'}
              onClick={() => changeFilter({ ...filter, scope: key })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="레벨">
          {([1, 2, 3, 4] as Level[]).map((lv) => (
            <button
              key={lv}
              className={filter.levels.includes(lv) ? 'seg-btn on' : 'seg-btn'}
              onClick={() => toggleLevel(lv)}
              title={filter.levels.length === 0 ? '선택하지 않으면 전체 레벨' : undefined}
            >
              {LEVEL_LABEL[lv]}
            </button>
          ))}
        </div>
        <select
          className="select"
          value={filter.category}
          onChange={(e) => changeFilter({ ...filter, category: e.target.value as Filter['category'] })}
          aria-label="카테고리"
        >
          <option value="all">모든 카테고리</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </section>

      <section className="meta-row">
        <span>
          재학습 <b>{counts.relearn}</b>
        </span>
        <span>
          복습 대기 <b>{counts.due}</b>
        </span>
        <span>
          신규 <b>{counts.fresh}</b>
        </span>
        <span className="spacer" />
        <span>
          이번 세션 <b>{session.n}</b>문제 · 정답률 <b>{session.n ? Math.round((session.ok / session.n) * 100) : 0}%</b> ·
          평균 반응 <b>{session.fkN ? secs(session.fkSum / session.fkN) : '–'}</b>
        </span>
      </section>

      {!item ? (
        <div className="card empty">
          <p>이 범위에는 문제가 없습니다.</p>
          <button className="btn" onClick={() => changeFilter(DEFAULT_FILTER)}>
            전체 범위로 돌아가기
          </button>
        </div>
      ) : (
        <div className={`card ${answered ? `is-${answered.overridden ? 'correct' : answered.result.status}` : ''}`}>
          <div className="card-tags">
            <span className="tag">{REASON_LABEL[current!.reason]}</span>
            <span className="tag muted">{LEVEL_LABEL[item.level]}</span>
          </div>

          <div className={isSentence ? 'expr sentence' : 'expr'} lang="ja">
            {item.expression}
          </div>

          {!answered ? (
            <form
              className="answer-form"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                ref={inputRef}
                className="answer-input"
                lang="ja"
                value={input}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="よみを入力"
                aria-label="읽기 입력"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (firstKeyAt.current === null && !['Shift', 'Meta', 'Control', 'Alt', 'Tab'].includes(e.key)) {
                    firstKeyAt.current = performance.now();
                  }
                  // IME 변환 확정용 Enter 는 제출하지 않음
                  if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
                }}
              />
              <div className="hint">
                Enter 제출 · 빈 칸으로 Enter = 모름{store.settings.allowRomaji ? ' · 로마자 입력 가능' : ''}
              </div>
              {notice && <div className="notice">{notice}</div>}
            </form>
          ) : (
            <Feedback
              item={item}
              answered={answered}
              state={st}
              showMeaning={showMeaning}
              onToggleMeaning={() => setShowMeaning((v) => !v)}
              onOverride={overrideTypo}
              onNext={() => next()}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Feedback({
  item,
  answered,
  state,
  showMeaning,
  onToggleMeaning,
  onOverride,
  onNext,
}: {
  item: Item;
  answered: Answered;
  state?: ItemState;
  showMeaning: boolean;
  onToggleMeaning: () => void;
  onOverride: () => void;
  onNext: () => void;
}) {
  const { result, overridden, hesitant, firstKeyMs } = answered;
  const status = overridden ? 'correct' : result.status;
  const related = relatedByKanji(item);
  const canOverride = !overridden && result.status !== 'correct' && result.errorType !== 'unknown';

  let label: string;
  if (overridden) label = '✓ 오타로 처리됨';
  else if (status === 'correct') label = hesitant ? '✓ 정답 · 망설임' : '✓ 정답';
  else if (status === 'near') label = `△ 거의 맞음 · ${ERROR_LABEL[result.errorType!]}`;
  else label = result.errorType === 'unknown' ? '✗ 모름' : `✗ 오답 · ${ERROR_LABEL[result.errorType!]}`;

  return (
    <div className="feedback">
      <div className={item.level >= 3 ? 'reading sentence' : 'reading'} lang="ja">
        {item.reading}
      </div>
      {item.alt_readings.length > 0 && (
        <div className="alt" lang="ja">
          다른 읽기: {item.alt_readings.join(' / ')}
        </div>
      )}

      <div className={`verdict v-${status}`}>
        <span>{label}</span>
        {firstKeyMs !== undefined && <span className="rt">반응 {secs(firstKeyMs)}</span>}
      </div>

      {status !== 'correct' && result.input && (
        <div className="your-answer" lang="ja">
          내 답: <s>{result.input}</s>
        </div>
      )}

      <div className="actions">
        <button className="btn ghost" onClick={onToggleMeaning}>
          {showMeaning ? '뜻 숨기기' : '뜻 보기'} <kbd>M</kbd>
        </button>
        {canOverride && (
          <button className="btn ghost" onClick={onOverride}>
            오타로 처리 <kbd>T</kbd>
          </button>
        )}
        <button className="btn primary" onClick={onNext}>
          다음 <kbd>Enter</kbd>
        </button>
      </div>

      {showMeaning && (
        <div className="meaning">
          <span className="meaning-ko">{item.meaning_ko}</span>
          <span className="tag muted">{CATEGORY_LABEL[item.category]}</span>
          <span className="tag muted">{READING_TYPE_LABEL[item.reading_type]}</span>
        </div>
      )}

      {item.grammar && (
        <div className="grammar">
          문법 포인트 <b lang="ja">{item.grammar}</b>
        </div>
      )}

      {item.example && item.level <= 2 && (
        <div className="example" lang="ja">
          {item.example}
        </div>
      )}

      {related.length > 0 && (
        <div className="related">
          {related.map((g) => (
            <div className="related-group" key={g.kanji}>
              <span className="related-kanji" lang="ja">
                {g.kanji}
              </span>
              <ul>
                {g.items.map((r) => (
                  <li key={r.id} lang="ja">
                    <span className="r-expr">{r.expression}</span>
                    <span className="r-read">{r.reading}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {state && (
        <div className="item-stat">
          이 문항 {state.seen}회 · 정답 {state.correct} · 오답 {state.wrong} · 연속 {state.streak}
        </div>
      )}
    </div>
  );
}
