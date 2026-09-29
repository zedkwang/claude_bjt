import { useMemo, useState } from 'react';
import type { Store } from '../lib/types';
import { ITEMS } from '../lib/data';
import { ERROR_LABEL } from '../lib/grade';
import { avgFirstKey } from '../lib/srs';
import { computeKpis, dailySeries, errorBreakdown, hesitantTop, pct, secs, wrongTop, type DailyPoint } from '../lib/stats';

export default function StatsPage({ store }: { store: Store }) {
  const now = Date.now();
  const kpi = useMemo(() => computeKpis(ITEMS, store.states, store.attempts, now), [store]); // eslint-disable-line
  const series = useMemo(() => dailySeries(ITEMS, store.attempts, now), [store]); // eslint-disable-line
  const errors = useMemo(() => errorBreakdown(store.states), [store.states]);
  const hes = useMemo(() => hesitantTop(ITEMS, store.states, store.settings), [store]);
  const wrong = useMemo(() => wrongTop(ITEMS, store.states), [store.states]);
  const errTotal = errors.reduce((a, [, n]) => a + n, 0);

  return (
    <div className="stats">
      <section className="kpi-grid">
        <Kpi label="평균 반응 시간" value={secs(kpi.avgFirstKey)} hint="한자를 보고 입력을 시작하기까지 (정답·단어 기준)" hero />
        <Kpi label="Reading Accuracy" value={pct(kpi.accuracy)} hint={`최근 7일 ${pct(kpi.accuracy7d)} · 총 ${kpi.attempts}회`} />
        <Kpi label="첫 시도 정답률" value={pct(kpi.firstAttempt)} hint="처음 본 문항을 바로 맞힌 비율" />
        <Kpi label="반복 오답률" value={pct(kpi.repeatedErrorRate)} hint="한 번 틀린 문항 중 2회 이상 틀린 비율" />
        <Kpi label="7일 리텐션" value={pct(kpi.retention7)} hint="7일 이상 지나 다시 봤을 때 정답률" />
        <Kpi label="30일 리텐션" value={pct(kpi.retention30)} hint="30일 이상 지나 다시 봤을 때 정답률" />
      </section>

      <section className="panel">
        <h2>진도</h2>
        <div className="progress">
          <div className="progress-bar">
            <span className="p-seen" style={{ width: `${(kpi.seenItems / kpi.totalItems) * 100}%` }} />
            <span className="p-mastered" style={{ width: `${(kpi.masteredItems / kpi.totalItems) * 100}%` }} />
          </div>
          <div className="progress-legend">
            <span>
              <i className="sw sw-mastered" /> 안정(14일 간격 이상) {kpi.masteredItems}
            </span>
            <span>
              <i className="sw sw-seen" /> 학습함 {kpi.seenItems}
            </span>
            <span>전체 {kpi.totalItems}</span>
          </div>
        </div>
      </section>

      <div className="two-col">
        <section className="panel">
          <h2>일별 문제 수 (최근 14일)</h2>
          <BarChart data={series} value={(d) => d.n} format={(v) => `${v}문제`} extra={(d) => `정답률 ${pct(d.accuracy)}`} />
        </section>
        <section className="panel">
          <h2>일별 평균 반응 시간 (초)</h2>
          <BarChart
            data={series}
            value={(d) => (d.avgFk ?? 0) / 1000}
            format={(v) => `${v.toFixed(1)}초`}
            extra={(d) => `${d.n}문제`}
          />
        </section>
      </div>

      <div className="two-col">
        <section className="panel">
          <h2>망설임 단어 TOP 20</h2>
          <p className="panel-sub">맞히긴 했지만 입력 시작이 늦은 단어입니다. 자동화가 아직 덜 된 단어입니다.</p>
          {hes.length === 0 ? (
            <p className="empty-text">아직 데이터가 없습니다.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>표기</th>
                  <th>읽기</th>
                  <th className="num">평균 반응</th>
                  <th className="num">망설임</th>
                </tr>
              </thead>
              <tbody>
                {hes.map(({ it, st }) => (
                  <tr key={it.id}>
                    <td lang="ja" className="jp">
                      {it.expression}
                    </td>
                    <td lang="ja">{it.reading}</td>
                    <td className="num">{secs(avgFirstKey(st!))}</td>
                    <td className="num">{st!.hesitations}회</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="panel">
          <h2>오답 많은 단어 TOP 20</h2>
          {wrong.length === 0 ? (
            <p className="empty-text">아직 오답이 없습니다.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>표기</th>
                  <th>읽기</th>
                  <th>최근 내 답</th>
                  <th className="num">오답/시도</th>
                </tr>
              </thead>
              <tbody>
                {wrong.map(({ it, st }) => (
                  <tr key={it.id}>
                    <td lang="ja" className="jp">
                      {it.expression}
                    </td>
                    <td lang="ja">{it.reading}</td>
                    <td lang="ja" className="muted">
                      {st!.streak === 0 ? st!.lastAnswer || '(모름)' : '—'}
                    </td>
                    <td className="num">
                      {st!.wrong}/{st!.seen}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>오답 유형</h2>
        {errors.length === 0 ? (
          <p className="empty-text">아직 오답이 없습니다.</p>
        ) : (
          <ul className="err-list">
            {errors.map(([type, n]) => (
              <li key={type}>
                <span className="err-label">{ERROR_LABEL[type]}</span>
                <span className="err-bar">
                  <span style={{ width: `${(n / errors[0][1]) * 100}%` }} />
                </span>
                <span className="err-num">
                  {n}회 · {pct(n / errTotal)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, hint, hero }: { label: string; value: string; hint: string; hero?: boolean }) {
  return (
    <div className={hero ? 'kpi hero' : 'kpi'}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-hint">{hint}</div>
    </div>
  );
}

// 단일 계열 막대 그래프 + 막대별 툴팁
function BarChart({
  data,
  value,
  format,
  extra,
}: {
  data: DailyPoint[];
  value: (d: DailyPoint) => number;
  format: (v: number) => string;
  extra: (d: DailyPoint) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 180;
  const pad = { l: 36, r: 8, t: 12, b: 24 };
  const vals = data.map(value);
  const max = Math.max(1, ...vals);
  const niceMax = niceCeil(max);
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const slot = iw / data.length;
  const bw = Math.max(4, Math.min(18, slot * 0.55));
  const ticks = [0, niceMax / 2, niceMax];
  const hasData = vals.some((v) => v > 0);

  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="일별 막대 그래프">
        {ticks.map((t) => {
          const y = pad.t + ih - (t / niceMax) * ih;
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} className={t === 0 ? 'axis' : 'grid'} />
              <text x={pad.l - 6} y={y + 4} className="tick" textAnchor="end">
                {Number.isInteger(t) ? t : t.toFixed(1)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const v = vals[i];
          const h = (v / niceMax) * ih;
          const x = pad.l + slot * i + (slot - bw) / 2;
          const y = pad.t + ih - h;
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={d.day}>
              {h > 0 && (
                <path
                  className={hover === i ? 'bar hover' : 'bar'}
                  d={`M${x},${pad.t + ih} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${pad.t + ih} Z`}
                />
              )}
              {(i % 2 === 1 || data.length <= 7) && (
                <text x={x + bw / 2} y={H - 6} className="tick" textAnchor="middle">
                  {d.day.slice(8)}
                </text>
              )}
              <rect
                x={pad.l + slot * i}
                y={pad.t}
                width={slot}
                height={ih}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          );
        })}
      </svg>
      {!hasData && <div className="chart-empty">아직 기록이 없습니다</div>}
      {hover !== null && (
        <div className="tooltip" style={{ left: `${((pad.l + slot * hover + slot / 2) / W) * 100}%` }}>
          <b>{data[hover].day.slice(5).replace('-', '/')}</b>
          <span>{format(vals[hover])}</span>
          <span className="muted">{extra(data[hover])}</span>
        </div>
      )}
    </div>
  );
}

function niceCeil(v: number): number {
  if (v <= 1) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}
