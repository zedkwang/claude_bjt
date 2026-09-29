import { useMemo, useState } from 'react';
import type { Store } from '../lib/types';
import { CATEGORY_LABEL, ITEMS, LEVEL_LABEL, READING_TYPE_LABEL } from '../lib/data';
import { INTERVAL_DAYS } from '../lib/srs';
import { normalize } from '../lib/kana';

type Status = 'all' | 'new' | 'learning' | 'wrong';
const PAGE = 100;

export default function WordList({ store }: { store: Store }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [showMeaning, setShowMeaning] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => {
    const nq = normalize(q);
    return ITEMS.filter((it) => {
      const st = store.states[it.id];
      if (status === 'new' && st?.seen) return false;
      if (status === 'learning' && !st?.seen) return false;
      if (status === 'wrong' && !(st && st.wrong > 0)) return false;
      if (!nq) return true;
      return it.expression.includes(q.trim()) || normalize(it.reading).includes(nq) || it.meaning_ko.includes(q.trim());
    });
  }, [q, status, store.states]);

  const now = Date.now();
  const dueText = (due: number, step: number) => {
    if (step === 0) return '재학습';
    const d = Math.ceil((due - now) / 86400000);
    return d <= 0 ? '오늘' : `${d}일 후`;
  };

  return (
    <div className="words">
      <div className="words-bar">
        <input
          className="search"
          placeholder="표기 · 읽기 · 뜻 검색"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(PAGE);
          }}
        />
        <div className="seg">
          {(
            [
              ['all', '전체'],
              ['new', '미학습'],
              ['learning', '학습함'],
              ['wrong', '오답 있음'],
            ] as [Status, string][]
          ).map(([k, v]) => (
            <button key={k} className={status === k ? 'seg-btn on' : 'seg-btn'} onClick={() => setStatus(k)}>
              {v}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={showMeaning} onChange={(e) => setShowMeaning(e.target.checked)} /> 뜻 표시
        </label>
        <span className="muted">{rows.length}개</span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>표기</th>
              <th>읽기</th>
              {showMeaning && <th>뜻</th>}
              <th>구분</th>
              <th className="num">정답/시도</th>
              <th className="num">간격</th>
              <th className="num">다음 복습</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((it) => {
              const st = store.states[it.id];
              return (
                <tr key={it.id}>
                  <td lang="ja" className={it.level >= 3 ? 'jp small' : 'jp'}>
                    {it.expression}
                  </td>
                  <td lang="ja" className={it.level >= 3 ? 'small' : ''}>
                    {it.reading}
                  </td>
                  {showMeaning && <td className="small">{it.meaning_ko}</td>}
                  <td className="small muted">
                    {LEVEL_LABEL[it.level]} · {READING_TYPE_LABEL[it.reading_type]} · {CATEGORY_LABEL[it.category]}
                  </td>
                  <td className="num">{st?.seen ? `${st.correct}/${st.seen}` : '–'}</td>
                  <td className="num">{st?.seen ? (st.step === 0 ? '0' : `${INTERVAL_DAYS[st.step]}일`) : '–'}</td>
                  <td className="num">{st?.seen ? dueText(st.due, st.step) : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button className="btn ghost more" onClick={() => setLimit((l) => l + PAGE)}>
          더 보기 ({rows.length - limit}개 남음)
        </button>
      )}
    </div>
  );
}
