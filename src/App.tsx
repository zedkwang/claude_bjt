import { useCallback, useEffect, useState } from 'react';
import type { Store } from './lib/types';
import { loadStore, saveStore } from './lib/storage';
import Drill from './components/Drill';
import StatsPage from './components/StatsPage';
import WordList from './components/WordList';
import SettingsPage from './components/SettingsPage';

type Tab = 'drill' | 'stats' | 'words' | 'settings';
const TABS: [Tab, string][] = [
  ['drill', '학습'],
  ['stats', '통계'],
  ['words', '단어장'],
  ['settings', '설정'],
];

export default function App() {
  const [store, setStore] = useState<Store>(loadStore);
  const [tab, setTab] = useState<Tab>('drill');
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    setSaveFailed(!saveStore(store));
  }, [store]);

  const update = useCallback((fn: (s: Store) => Store) => setStore(fn), []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">読</span>
          <span className="brand-name">BJT 読みドリル</span>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? 'tab active' : 'tab'}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      {saveFailed && (
        <div className="banner warn">브라우저에 저장하지 못했습니다. 설정 탭에서 백업 파일을 내려받아 두세요.</div>
      )}
      <main className="main">
        {/* 학습 화면은 탭을 옮겨도 세션이 유지되도록 항상 마운트 */}
        <div hidden={tab !== 'drill'}>
          <Drill store={store} update={update} active={tab === 'drill'} />
        </div>
        {tab === 'stats' && <StatsPage store={store} />}
        {tab === 'words' && <WordList store={store} />}
        {tab === 'settings' && <SettingsPage store={store} update={update} />}
      </main>
    </div>
  );
}
