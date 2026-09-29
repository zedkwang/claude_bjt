import { useRef, useState } from 'react';
import type { Store } from '../lib/types';
import { DEFAULT_SETTINGS, emptyStore, exportStore, importStore } from '../lib/storage';
import { ITEMS } from '../lib/data';

export default function SettingsPage({ store, update }: { store: Store; update: (fn: (s: Store) => Store) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const s = store.settings;
  const set = (patch: Partial<typeof s>) => update((st) => ({ ...st, settings: { ...st.settings, ...patch } }));

  return (
    <div className="settings">
      <section className="panel">
        <h2>학습 설정</h2>
        <label className="field">
          <span className="field-label">
            망설임 기준 <b>{(s.hesitationMs / 1000).toFixed(1)}초</b>
          </span>
          <input
            type="range"
            min={1000}
            max={8000}
            step={500}
            value={s.hesitationMs}
            onChange={(e) => set({ hesitationMs: Number(e.target.value) })}
          />
          <span className="field-hint">
            정답이어도 이 시간보다 늦게 입력을 시작하면 '망설임'으로 기록되고 복습 간격이 늘어나지 않습니다.
          </span>
        </label>
        <label className="field">
          <span className="field-label">
            신규 문항 비율 <b>{Math.round(s.newRatio * 100)}%</b>
          </span>
          <input
            type="range"
            min={0}
            max={0.8}
            step={0.1}
            value={s.newRatio}
            onChange={(e) => set({ newRatio: Number(e.target.value) })}
          />
          <span className="field-hint">복습할 문항이 쌓여 있을 때 신규 문항이 섞이는 비율입니다.</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.allowRomaji} onChange={(e) => set({ allowRomaji: e.target.checked })} />
          로마자 입력 허용 (예: shounin → しょうにん)
        </label>
        <button className="btn ghost" onClick={() => set({ ...DEFAULT_SETTINGS })}>
          기본값으로
        </button>
      </section>

      <section className="panel">
        <h2>백업</h2>
        <p className="panel-sub">
          학습 기록은 이 브라우저에만 저장됩니다. 브라우저 데이터를 지우면 사라지므로 가끔 백업 파일을 내려받아 두세요.
        </p>
        <div className="actions left">
          <button className="btn" onClick={() => exportStore(store)}>
            백업 내려받기
          </button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            백업 불러오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const next = await importStore(f);
                if (!confirm('현재 학습 기록을 백업 파일 내용으로 덮어씁니다. 계속할까요?')) return;
                update(() => next);
                setMsg(`불러왔습니다 · 학습 문항 ${Object.keys(next.states).length}개`);
              } catch (err) {
                setMsg(err instanceof Error ? err.message : '불러오지 못했습니다.');
              }
            }}
          />
        </div>
        {msg && <p className="notice">{msg}</p>}
      </section>

      <section className="panel danger">
        <h2>초기화</h2>
        <p className="panel-sub">모든 학습 기록을 지웁니다. 되돌릴 수 없으니 먼저 백업을 내려받으세요.</p>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm('모든 학습 기록을 삭제합니다. 되돌릴 수 없습니다. 계속할까요?'))
              update((st) => ({ ...emptyStore(), settings: st.settings }));
          }}
        >
          학습 기록 초기화
        </button>
      </section>

      <p className="muted small">수록 문항 {ITEMS.length}개 · 문항 추가 방법은 README를 참고하세요.</p>
    </div>
  );
}
