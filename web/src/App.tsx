import type React from "react";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Engine, type EngineResult } from '../../shared/engine';
import type { Opportunity, Settings } from '../../shared/types';
import { leagueById } from '../../shared/catalog';
import { fmtAmerican } from '../../shared/odds';
import { connectFeed, type FeedState } from './feed';
import { planFromOpp, useList, useSettings, type PlanItem, type SavedPreset } from './store';
import { armAudio, loudAlert, softAlert } from './alerts';
import { OppLedger, EvLedger } from './components/Ledger';
import { BetPlan, Calculator, EmptyState, OppDrawer } from './components/Panels';
import { SettingsModal } from './components/SettingsModal';
import {
  IconBell, IconBolt, IconCalc, IconPause, IconPlay, IconScale, IconSliders, IconSplit, IconTicket, Toggle, legLabel, pct,
} from './ui';

type View = 'arb' | 'middle' | 'ev';
const EMPTY: EngineResult = { opps: [], evs: [], candidates: 0, seq: 0 };

export default function App() {
  const { settings: s, setSettings, patch } = useSettings();
  const [presets, setPresets] = useList<SavedPreset>('1x.presets');
  const [plan, setPlan] = useList<PlanItem>('1x.plan');
  const [view, setView] = useState<View>('arb');
  const [res, setRes] = useState<EngineResult>(EMPTY);
  const [feed, setFeed] = useState<FeedState>({ kind: 'connecting' });
  const [paused, setPaused] = useState(false);
  const [query, setQuery] = useState('');
  const [showSettings, setShowSettings] = useState<false | 'Books' | 'Strategy'>(false);
  const [showCalc, setShowCalc] = useState<false | string[]>(false);
  const [showPlan, setShowPlan] = useState(false);
  const [detail, setDetail] = useState<Opportunity | null>(null);
  const [toast, setToast] = useState('');
  const [now, setNow] = useState(Date.now());
  const [showToolbar, setShowToolbar] = useState(true);

  const engine = useRef(new Engine()).current;
  const sRef = useRef(s); sRef.current = s;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const lastCompute = useRef(0);
  const pending = useRef<number | undefined>(undefined);
  const alerted = useRef(new Set<string>());
  const prevKeys = useRef(new Set<string>());
  const [freshKeys, setFreshKeys] = useState(new Set<string>());

  // ---- feed → engine → table ----
  useEffect(() => {
    const run = () => {
      pending.current = undefined;
      lastCompute.current = Date.now();
      const r = engine.compute(sRef.current);
      if (pausedRef.current) return;
      setRes(r);
      setNow(Date.now());
    };
    const schedule = () => {
      if (pending.current !== undefined) return;
      const wait = Math.max(0, sRef.current.refreshMs - (Date.now() - lastCompute.current));
      pending.current = window.setTimeout(run, wait);
    };
    return connectFeed(m => { engine.apply(m); schedule(); }, setFeed, () => sRef.current.refreshMs);
  }, [engine]);

  // settings changed → rescan now (staying-power history is kept)
  useEffect(() => { setRes(engine.compute(s)); }, [s, engine]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  // ---- alerts & "fresh" highlight ----
  useEffect(() => {
    const keys = new Set(res.opps.map(o => o.key));
    setFreshKeys(new Set([...keys].filter(k => !prevKeys.current.has(k))));
    prevKeys.current = keys;
    if (!s.alertsOn) return;
    let loud: string | null = null, soft = false;
    for (const o of res.opps) {
      if (o.kind !== 'arb' || !s.arbAlerts || alerted.current.has(o.key)) continue;
      if (o.roi >= s.arbLoud) loud = `${pct(o.roi)} arb · ${o.event.away} @ ${o.event.home}`;
      else if (o.roi >= s.arbSoft) soft = true;
      alerted.current.add(o.key);
    }
    for (const b of res.evs) {
      if (!s.evAlerts || alerted.current.has(b.key)) continue;
      if (b.ev >= s.evLoud) loud = loud ?? `${pct(b.ev)} EV · ${b.event.away} @ ${b.event.home}`;
      else if (b.ev >= s.evSoft) soft = true;
      alerted.current.add(b.key);
    }
    if (loud) loudAlert('1xOdds', loud); else if (soft) softAlert();
    if (alerted.current.size > 5000) alerted.current.clear();
  }, [res]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 2200); return () => clearTimeout(t); } }, [toast]);

  // ---- derived ----
  const q = query.trim().toLowerCase();
  const match = (o: { event: { home: string; away: string; league: string }; market: { label: string }; player?: string }) =>
    !q || `${o.event.home} ${o.event.away} ${leagueById(o.event.league).name} ${o.market.label} ${o.player ?? ''}`.toLowerCase().includes(q);
  const arbs = useMemo(() => res.opps.filter(o => o.kind === 'arb' && match(o)), [res, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const mids = useMemo(() => res.opps.filter(o => o.kind === 'middle' && match(o)), [res, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const evs = useMemo(() => res.evs.filter(b => b.ev >= 1 && match(b)), [res, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const plannedKeys = useMemo(() => new Set(plan.map(p => p.id.split('@')[0])), [plan]);
  const pregameEvents = useMemo(() => [...engine.events.values()].filter(e => !e.live), [res, engine]);

  const addToPlan = (o: Opportunity) => {
    if (plannedKeys.has(o.key)) { setShowPlan(true); return; }
    setPlan(xs => [planFromOpp(o, legLabel), ...xs]);
    setToast('Added to bet plan');
  };
  const saveSettings = (next: Settings) => { setSettings(next); setShowSettings(false); setToast('Settings saved'); };

  const rail: [View, string, () => React.JSX.Element, number][] = [
    ['arb', 'Arbitrage', IconScale, arbs.length], ['middle', 'Middles', IconSplit, mids.length], ['ev', 'Positive EV', IconBolt, evs.length],
  ];
  const list = view === 'arb' ? arbs : mids;

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <div className="logo">1x<b>Odds</b></div>
        {rail.map(([v, label, Icon, n]) => (
          <button key={v} className="rail-btn" aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)} aria-label={label}>
            <Icon />{n > 0 && <span className="dot">{n > 99 ? '99+' : n}</span>}<span className="tip">{label}</span>
          </button>
        ))}
        <button className="rail-btn" onClick={() => setShowPlan(true)} aria-label="Bet plan"><IconTicket />{plan.length > 0 && <span className="dot">{plan.length}</span>}<span className="tip">Bet plan</span></button>
        <button className="rail-btn" onClick={() => setShowCalc(['+110', '+105'])} aria-label="Calculator"><IconCalc /><span className="tip">Calculator</span></button>
        <div className="rail-spacer" />
        <button className="rail-btn" onClick={() => setShowSettings('Books')} aria-label="Settings"><IconSliders /><span className="tip">Settings</span></button>
      </nav>

      <main className="main">
        <header className="topbar">
          <button className={`icon-btn${showToolbar ? ' on' : ''}`} onClick={() => setShowToolbar(t => !t)} aria-label="Toggle quick settings"><IconSliders /></button>
          <button className={`icon-btn${paused ? ' on' : ''}`} onClick={() => setPaused(p => !p)} aria-label={paused ? 'Resume feed' : 'Pause feed'} title={paused ? 'Resume' : 'Pause'}>{paused ? <IconPlay /> : <IconPause />}</button>
          <input id="search" className="search" placeholder="Search games, players, markets…" value={query} onChange={e => setQuery(e.target.value)} />
          <div className="mode" role="group" aria-label="Game state">
            <button aria-pressed={s.mode === 'live'} onClick={() => patch({ mode: 'live' })}><span className="live-dot" />Live</button>
            <button aria-pressed={s.mode === 'pregame'} onClick={() => patch({ mode: 'pregame' })}>Pre-game</button>
          </div>
        </header>

        {showToolbar && (
          <div className="toolbar">
            <div className="chip-field"><label htmlFor="tb-minarb">Min arb</label><input id="tb-minarb" type="number" step="0.1" value={s.minArb} onChange={e => patch({ minArb: Number(e.target.value) || 0 })} /><span className="sub">%</span></div>
            <div className="chip-field"><label htmlFor="tb-minmid">Min middle</label><input id="tb-minmid" type="number" step="0.5" value={s.minMiddle} onChange={e => patch({ minMiddle: Number(e.target.value) || 0 })} /><span className="sub">%</span></div>
            <div className="sortseg" role="group" aria-label="Sort">
              {(['staying', 'roi', 'profit'] as const).map(k => <button key={k} aria-pressed={s.sort === k} onClick={() => patch({ sort: k })}>{k === 'staying' ? 'Staying power' : k === 'roi' ? 'ROI' : 'Profit'}</button>)}
            </div>
            {s.sort === 'staying' && <div className="chip-field"><label htmlFor="tb-ref">Min refreshes</label><input id="tb-ref" type="number" step="1" min="0" value={s.minRefreshes} onChange={e => patch({ minRefreshes: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /></div>}
            <button className="tb-btn" onClick={() => setShowCalc(['+110', '+105'])}><IconCalc />Calculator</button>
            <button className="tb-btn accent" onClick={() => setShowPlan(true)}><IconTicket />Bet plan</button>
            <div className="chip-field"><label htmlFor="tb-alerts"><IconBell /></label><span className="lbl">Alerts</span>
              <Toggle id="tb-alerts" on={s.alertsOn} label="Alerts" onChange={v => { if (v) armAudio(); patch({ alertsOn: v }); }} /></div>
            <span className="tb-sep" />
            <button className="tb-btn" onClick={() => setShowSettings('Strategy')}>All settings</button>
          </div>
        )}

        <section className="content" aria-live="polite">
          {view !== 'ev' && list.length > 0 && (
            <OppLedger opps={list} s={s} engine={engine} now={now} onOpen={setDetail} onPlan={addToPlan} planned={plannedKeys} freshKeys={freshKeys} />
          )}
          {view === 'ev' && evs.length > 0 && <EvLedger evs={evs} s={s} now={now} />}
          {((view !== 'ev' && list.length === 0) || (view === 'ev' && evs.length === 0)) && (
            <EmptyState events={pregameEvents} candidates={res.candidates}
              onLoosen={() => { patch({ minArb: 0, sortMinRoi: 0, minRefreshes: 0, riskyMinRoi: 0 }); setToast('Floors set to 0'); }} />
          )}
        </section>
      </main>

      <div className="status-pill" role="status">
        <i className={feed.kind === 'demo' ? 'demo' : feed.kind === 'down' || feed.kind === 'connecting' || (feed.kind === 'server' && feed.error) ? 'down' : ''} />
        {feed.kind === 'demo' && <>Demo feed · {engine.events.size} games · simulated odds</>}
        {feed.kind === 'server' && !feed.error && <>Live feed · {engine.events.size} games · {engine.quotes.size.toLocaleString()} prices{feed.latencyMs ? ` · ${feed.latencyMs} ms` : ''}</>}
        {feed.kind === 'server' && feed.error && <span style={{ color: 'var(--loss)' }}>Odds feed problem · {feed.error}</span>}
        {feed.kind === 'connecting' && <>Connecting…</>}
        {feed.kind === 'down' && <>{feed.reason}</>}
        {paused && <b style={{ color: 'var(--brand)' }}> · Paused</b>}
      </div>

      {detail && <OppDrawer o={res.opps.find(o => o.key === detail.key) ?? detail} s={s} now={now} onClose={() => setDetail(null)}
        onPlan={() => { addToPlan(detail); setDetail(null); }}
        onCalc={() => { setShowCalc(detail.legs.map(l => fmtAmerican(l.quote.price))); setDetail(null); }} />}
      {showCalc && <Calculator initial={showCalc} onClose={() => setShowCalc(false)} />}
      {showPlan && <BetPlan items={plan} setItems={setPlan} onClose={() => setShowPlan(false)} />}
      {showSettings && <SettingsModal initial={s} initialTab={showSettings} onSave={saveSettings} onClose={() => setShowSettings(false)} presets={presets} setPresets={setPresets} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
