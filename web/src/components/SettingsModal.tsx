import { useMemo, useState } from 'react';
import type { Settings, SortKey } from '../../../shared/types';
import { BOOKS, LEAGUES, MARKETS, bookById, marketByKey } from '../../../shared/catalog';
import { STARTER_PRESETS, defaultSettings } from '../../../shared/settings';
import type { SavedPreset } from '../store';
import { Badge, IconCheck, IconChevD, IconMinus, IconX, NumField, Panel, Toggle } from '../ui';

const TABS = ['Books', 'Leagues & Markets', 'Stake & Liquidity', 'Strategy', 'Display & Alerts', 'Presets'] as const;
type Tab = typeof TABS[number];

export function SettingsModal({ initial, initialTab = 'Books', onSave, onClose, presets, setPresets }: {
  initial: Settings; initialTab?: Tab; onSave: (s: Settings) => void; onClose: () => void;
  presets: SavedPreset[]; setPresets: (f: (p: SavedPreset[]) => SavedPreset[]) => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [d, setD] = useState<Settings>(initial);
  const p = (x: Partial<Settings>) => setD(s => ({ ...s, ...x }));
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal-wrap" onClick={e => e.stopPropagation()} role="dialog" aria-label="Settings">
        <nav className="modal-nav">
          {TABS.map(t => <button key={t} aria-current={tab === t} onClick={() => setTab(t)}>{t}</button>)}
        </nav>
        <div className="modal-body">
          <div className="modal-scroll">
            <div className="panel-head"><h2>{tab}</h2><button className="icon-btn" onClick={onClose} aria-label="Close settings"><IconX /></button></div>
            {tab === 'Books' && <BooksTab d={d} p={p} setD={setD} />}
            {tab === 'Leagues & Markets' && <LeaguesTab d={d} p={p} />}
            {tab === 'Stake & Liquidity' && <StakeTab d={d} p={p} />}
            {tab === 'Strategy' && <StrategyTab d={d} p={p} />}
            {tab === 'Display & Alerts' && <DisplayTab d={d} p={p} />}
            {tab === 'Presets' && <PresetsTab d={d} setD={setD} presets={presets} setPresets={setPresets} />}
          </div>
          <div className="modal-foot">
            <button className="btn ghost" onClick={() => setD(initial)} disabled={!dirty}>Discard</button>
            <button className="btn primary" disabled={!dirty} onClick={() => onSave(d)}>Save changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}

type TP = { d: Settings; p: (x: Partial<Settings>) => void };

function BooksTab({ d, p, setD }: TP & { setD: (f: (s: Settings) => Settings) => void }) {
  const toggle = (id: string) => p({ books: d.books.includes(id) ? d.books.filter(b => b !== id) : [...d.books, id] });
  const [adding, setAdding] = useState('');
  const overrides = Object.entries(d.perBook);
  const setPB = (id: string, x: Partial<Settings['perBook'][string]>) =>
    setD(s => ({ ...s, perBook: { ...s.perBook, [id]: { ...{ disabledLeagues: [], mainLineOnly: false }, ...s.perBook[id], ...x } } }));
  return (
    <>
      <Panel title="Sportsbooks" right={<span className="sub mono">{d.books.length} / {BOOKS.length} selected
        <button className="mini" style={{ marginLeft: 10 }} onClick={() => p({ books: BOOKS.map(b => b.id) })}>Select all</button>
        <button className="mini" style={{ marginLeft: 6 }} onClick={() => p({ books: [] })}>Clear</button></span>}>
        <div className="chips">
          {BOOKS.map(b => (
            <button key={b.id} className="book-chip" aria-pressed={d.books.includes(b.id)} onClick={() => toggle(b.id)}>
              <Badge book={b.id} />{b.name}{b.sharp ? <span className="pill main">Sharp</span> : null}
            </button>
          ))}
        </div>
        <p className="hint">All books shown are licensed in Ontario. Only selected books are used to build arbs; EV fair values use every book on the board.</p>
      </Panel>

      <Panel title="Required books" right={<span className="sub mono">{d.requiredBooks.length} / 20</span>}>
        <p className="hint">Only show arbs that include <b>at least one</b> of these books. Leave empty to show every arb. Handy for working a promo or a fresh account.</p>
        <div className="chips">
          {d.books.map(id => (
            <button key={id} className="book-chip" aria-pressed={d.requiredBooks.includes(id)}
              onClick={() => p({ requiredBooks: d.requiredBooks.includes(id) ? d.requiredBooks.filter(b => b !== id) : [...d.requiredBooks, id].slice(0, 20) })}>
              <Badge book={id} />{bookById(id)?.name}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Per-book settings · custom only" right={
        <span style={{ display: 'flex', gap: 6 }}>
          <select id="pb-add" className="input" style={{ height: 32, width: 150 }} value={adding} onChange={e => setAdding(e.target.value)}>
            <option value="">Choose book…</option>
            {BOOKS.filter(b => !d.perBook[b.id]).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button className="mini" disabled={!adding} onClick={() => { setPB(adding, {}); setAdding(''); }}>+ Add book</button>
        </span>}>
        <p className="hint">Books listed here override the global defaults. <b>Main line leg</b> hides this book's leg when it's an alternate spread or total (the other book can still be on an alt line). Doesn't affect props.</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Book</th><th>Stake</th><th>Disabled leagues</th><th>Main line leg</th><th></th></tr></thead>
            <tbody>
              {overrides.length === 0 && <tr><td colSpan={5} className="sub">No per-book overrides yet. Use “+ Add book” to customise one.</td></tr>}
              {overrides.map(([id, v]) => (
                <tr key={id}>
                  <td><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Badge book={id} />{bookById(id)?.name}</span></td>
                  <td><input id={`pb-stake-${id}`} className="input" style={{ width: 100 }} type="number" placeholder="global" value={v.stake ?? ''}
                    onChange={e => setPB(id, { stake: e.target.value === '' ? undefined : Number(e.target.value) })} /></td>
                  <td>
                    <div className="chips">
                      {LEAGUES.map(l => (
                        <button key={l.id} className="mini" aria-pressed={v.disabledLeagues.includes(l.id)}
                          style={v.disabledLeagues.includes(l.id) ? { color: 'var(--loss)', borderColor: 'var(--loss)' } : undefined}
                          onClick={() => setPB(id, { disabledLeagues: v.disabledLeagues.includes(l.id) ? v.disabledLeagues.filter(x => x !== l.id) : [...v.disabledLeagues, l.id] })}>
                          {l.id.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td><Toggle on={v.mainLineOnly} label="Main line leg only" onChange={x => setPB(id, { mainLineOnly: x })} /></td>
                  <td><button className="mini" onClick={() => setD(s => { const pb = { ...s.perBook }; delete pb[id]; return { ...s, perBook: pb }; })}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function LeaguesTab({ d, p }: TP) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const sports = useMemo(() => [...new Set(LEAGUES.map(l => l.sport))], []);
  const ql = q.toLowerCase();
  const setLeague = (id: string, markets: string[]) => p({ markets: { ...d.markets, [id]: markets } });
  return (
    <>
      <div className="fields">
        <input id="lg-search" className="search" placeholder="Search leagues & markets…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="mini" onClick={() => p({ markets: Object.fromEntries(LEAGUES.map(l => [l.id, [...l.markets]])) })}>Select all</button>
        <button className="mini" onClick={() => p({ markets: Object.fromEntries(LEAGUES.map(l => [l.id, []])) })}>Clear</button>
      </div>
      {sports.map(sp => {
        const leagues = LEAGUES.filter(l => l.sport === sp && (!ql || l.name.toLowerCase().includes(ql) || l.markets.some(m => marketByKey(m).label.toLowerCase().includes(ql))));
        if (!leagues.length) return null;
        return (
          <div key={sp} style={{ display: 'grid', gap: 8 }}>
            <div className="sport-label">{sp}</div>
            {leagues.map(l => {
              const on = d.markets[l.id] ?? [];
              const state = on.length === l.markets.length ? 'all' : on.length ? 'some' : 'none';
              const expanded = open === l.id || !!ql;
              return (
                <div className="league" key={l.id}>
                  <div className="league-head">
                    <button className="check" data-state={state} aria-label={`Toggle ${l.name}`} onClick={() => setLeague(l.id, state === 'all' ? [] : [...l.markets])}>
                      {state === 'all' ? <IconCheck /> : state === 'some' ? <IconMinus /> : null}
                    </button>
                    <strong>{l.name}</strong>
                    <button className="expand" onClick={() => setOpen(open === l.id ? null : l.id)} aria-expanded={expanded}>{on.length} / {l.markets.length} markets <IconChevD /></button>
                  </div>
                  {expanded && (
                    <div className="market-list">
                      {l.markets.filter(m => !ql || marketByKey(m).label.toLowerCase().includes(ql) || l.name.toLowerCase().includes(ql)).map(m => (
                        <button key={m} aria-pressed={on.includes(m)} onClick={() => setLeague(l.id, on.includes(m) ? on.filter(x => x !== m) : [...on, m])}>
                          {marketByKey(m).label}{marketByKey(m).risky ? ' ·R' : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      <p className="hint">Markets marked ·R are risky (props, periods). They follow the risky-market floor in Strategy.</p>
    </>
  );
}

function StakeTab({ d, p }: TP) {
  return (
    <>
      <Panel title="Global default stake">
        <div className="fields">
          <NumField id="st-amount" label="Amount" value={d.stakeAmount} onChange={v => p({ stakeAmount: v })} suffix="$" />
          <div className="field"><label className="lbl" htmlFor="st-mode">Mode</label>
            <select id="st-mode" className="input" value={d.stakeMode} onChange={e => p({ stakeMode: e.target.value as Settings['stakeMode'] })}>
              <option value="ratio">Ratio</option><option value="fixed">Fixed</option>
            </select></div>
        </div>
        <p className="hint">Applies to every book unless overridden in Books → per-book settings. <b>Ratio</b> splits the amount across legs so every outcome pays the same (an override anchors that book's leg). <b>Fixed</b> bets this exact amount on each leg.</p>
      </Panel>
      <Panel title="Liquidity filters">
        <div className="fields">
          <NumField id="liq-arb" label="Arb minimum liquidity" suffix="$" value={d.arbMinLiquidity} onChange={v => p({ arbMinLiquidity: v })} />
          <NumField id="liq-ev" label="EV minimum liquidity" suffix="$" value={d.evMinLiquidity} onChange={v => p({ evMinLiquidity: v })} />
        </div>
        <p className="hint"><b>Arb:</b> hides legs from books reporting less liquidity than this. <b>EV:</b> excludes those books from the fair-value baseline. Only applies to feeds that report liquidity.</p>
      </Panel>
    </>
  );
}

function StrategyTab({ d, p }: TP) {
  const sorts: [SortKey, string][] = [['profit', 'Profit ($)'], ['roi', 'ROI %'], ['staying', 'Staying power']];
  return (
    <div className="grid2">
      <div style={{ display: 'grid', gap: 18 }}>
        <Panel title="Sorting order">
          <p className="hint">Sets the feed's order and the floor that goes with it. Applies to the arbitrage table.</p>
          <div className="seg">{sorts.map(([k, l]) => <button key={k} aria-pressed={d.sort === k} onClick={() => p({ sort: k })}>{l}</button>)}</div>
          {d.sort === 'profit' && <div className="fields"><NumField id="so-profit" label="Min profit" suffix="$" value={d.sortMinProfit} onChange={v => p({ sortMinProfit: v })} /></div>}
          {d.sort === 'roi' && <div className="fields"><NumField id="so-roi" label="Min ROI" suffix="%" value={d.sortMinRoi} onChange={v => p({ sortMinRoi: v })} /></div>}
          {d.sort === 'staying' && (
            <>
              <div className="fields">
                <NumField id="sp-roi" label="Min ROI" suffix="%" value={d.sortMinRoi} onChange={v => p({ sortMinRoi: v })} />
                <NumField id="sp-ref" label="Min refreshes" step="1" min={0} value={d.minRefreshes} onChange={v => p({ minRefreshes: Math.max(0, Math.round(v)) })} />
              </div>
              <p className="hint">An arb only appears once it has survived this many odds refreshes in a row. If any leg moves and the arb dies, its count resets. Higher = fewer arbs, but far fewer “odds changed” rejections.</p>
            </>
          )}
          <div className="toggle-row"><span>Show EV % on each leg</span><Toggle on={d.showEv} label="Show EV %" onChange={v => p({ showEv: v })} /></div>
        </Panel>
        <Panel title="Risky markets" right={<Toggle on={d.riskyEnabled} label="Risky markets" onChange={v => p({ riskyEnabled: v })} />}>
          <p className="hint">Player props, halves, quarters and periods move faster and get voided more often. Turn off to hide them entirely, or keep them behind a higher floor.</p>
          {d.riskyEnabled && <div className="fields"><NumField id="rk-roi" label="Min ROI" suffix="%" value={d.riskyMinRoi} onChange={v => p({ riskyMinRoi: v })} /></div>}
        </Panel>
        <Panel title="Middles" right={<Toggle on={d.middlesEnabled} label="Middles" onChange={v => p({ middlesEnabled: v })} />}>
          {d.middlesEnabled && <div className="fields">
            <NumField id="md-size" label="Min middle size" suffix="pts" value={d.minMiddleSize} onChange={v => p({ minMiddleSize: v })} />
            <NumField id="md-roi" label="Min ROI if middle hits" suffix="%" value={d.minMiddleRoi} onChange={v => p({ minMiddleRoi: v })} />
          </div>}
          <p className="hint">A middle bets both sides at different lines. If the result lands between them, both legs win. The toolbar's Min Middle sets the worst-case floor.</p>
        </Panel>
      </div>
      <div style={{ display: 'grid', gap: 18 }}>
        <Panel title="EV calculation">
          <div className="seg">
            <button aria-pressed={d.evMethod === 'consensus'} onClick={() => p({ evMethod: 'consensus' })}>Market consensus</button>
            <button aria-pressed={d.evMethod === 'sharp'} onClick={() => p({ evMethod: 'sharp' })}>Sharp books</button>
          </div>
          <p className="hint">{d.evMethod === 'consensus' ? 'Fair odds = vig-free average of every book on the board (needs 3+).' : 'Fair odds = vig-free price from the reference books below.'}</p>
          <div className="lbl">Reference books</div>
          <div className="chips">
            {BOOKS.map(b => (
              <button key={b.id} className="book-chip" disabled={d.evMethod !== 'sharp'} aria-pressed={d.sharpBooks.includes(b.id)}
                style={d.evMethod !== 'sharp' ? { opacity: .45 } : undefined}
                onClick={() => p({ sharpBooks: d.sharpBooks.includes(b.id) ? d.sharpBooks.filter(x => x !== b.id) : [...d.sharpBooks, b.id] })}>
                <Badge book={b.id} />{b.name}
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Refresh rate">
          <div className="seg">
            {[500, 1000, 2000, 5000, 10000].map(ms => (
              <button key={ms} aria-pressed={d.refreshMs === ms} onClick={() => p({ refreshMs: ms })}>{ms < 1000 ? `.${ms / 100}s` : `${ms / 1000}s`}</button>
            ))}
          </div>
          <p className="hint">How often the table re-scans. On the demo feed it's also how often books re-price. The server pushes live price changes every 250 ms regardless.</p>
        </Panel>
        <Panel title="Lines">
          <div className="toggle-row"><span>Show main / alt tag on each leg</span><Toggle on={d.showMainWithAlt} label="Show main with alt line" onChange={v => p({ showMainWithAlt: v })} /></div>
        </Panel>
      </div>
    </div>
  );
}

function DisplayTab({ d, p }: TP) {
  return (
    <>
      <div className="grid2">
        <Panel title="Alerts">
          <div className="toggle-row"><span className="lbl">Arbitrage</span><Toggle on={d.arbAlerts} label="Arbitrage alerts" onChange={v => p({ arbAlerts: v })} /></div>
          <div className="fields">
            <NumField id="al-arb-soft" label="Soft alert ROI" suffix="%" value={d.arbSoft} onChange={v => p({ arbSoft: v })} />
            <NumField id="al-arb-loud" label="Loud alert ROI" suffix="%" value={d.arbLoud} onChange={v => p({ arbLoud: v })} />
          </div>
          <div className="toggle-row"><span className="lbl">+EV</span><Toggle on={d.evAlerts} label="EV alerts" onChange={v => p({ evAlerts: v })} /></div>
          <div className="fields">
            <NumField id="al-ev-soft" label="Soft alert EV" suffix="%" value={d.evSoft} onChange={v => p({ evSoft: v })} />
            <NumField id="al-ev-loud" label="Loud alert EV" suffix="%" value={d.evLoud} onChange={v => p({ evLoud: v })} />
          </div>
          <p className="hint">Soft = one chime. Loud = triple chime, flashing tab title and a desktop notification (if allowed). Alerts fire once per new opportunity while the toolbar's Alerts switch is on.</p>
        </Panel>
        <Panel title="Feed display">
          <div className="toggle-row"><span>Show comparable odds</span><Toggle on={d.showComparable} label="Show comparable odds" onChange={v => p({ showComparable: v })} /></div>
          <div className="toggle-row"><span>Show main / alt line tag</span><Toggle on={d.showMainWithAlt} label="Show main with alt" onChange={v => p({ showMainWithAlt: v })} /></div>
          <div className="toggle-row"><span>Arb details popup on row click</span><Toggle on={d.arbPopup} label="Arb details popup" onChange={v => p({ arbPopup: v })} /></div>
        </Panel>
      </div>
      <Panel title="Betslip">
        <div className="fields">
          <div className="field"><span className="lbl">Open mode</span>
            <div className="seg"><button aria-pressed={d.openMode === 'popup'} onClick={() => p({ openMode: 'popup' })}>Popups</button><button aria-pressed={d.openMode === 'tab'} onClick={() => p({ openMode: 'tab' })}>Tabs</button></div></div>
          <div className="field"><span className="lbl">Sportsbook links</span>
            <div className="seg">{(['auto', 'desktop', 'mobile'] as const).map(m => <button key={m} aria-pressed={d.linkMode === m} onClick={() => p({ linkMode: m })}>{m[0].toUpperCase() + m.slice(1)}</button>)}</div></div>
        </div>
        <p className="hint">Popups let you tile two books side by side and place both legs fast. Size them under Layout.</p>
      </Panel>
      <Panel title="Layout">
        {([['popupW', 'Popup width', 600, 1600], ['popupH', 'Popup height', 400, 1200]] as const).map(([k, l, min, max]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 80px', gap: 12, alignItems: 'center' }}>
            <label className="lbl" htmlFor={`ly-${k}`}>{l}</label>
            <input id={`ly-${k}`} className="range" type="range" min={min} max={max} step={10} value={d[k]} onChange={e => p({ [k]: Number(e.target.value) } as Partial<Settings>)} />
            <span className="mono">{d[k]}px</span>
          </div>
        ))}
        <div className="toggle-row"><span>Desktop view on all screen widths</span><Toggle on={d.desktopAlways} label="Desktop view always" onChange={v => p({ desktopAlways: v })} /></div>
      </Panel>
    </>
  );
}

function PresetsTab({ d, setD, presets, setPresets }: {
  d: Settings; setD: (f: (s: Settings) => Settings) => void; presets: SavedPreset[]; setPresets: (f: (p: SavedPreset[]) => SavedPreset[]) => void;
}) {
  const [name, setName] = useState('');
  const def = defaultSettings();
  const describe = (s: Partial<Settings>) => ({
    'Min ROI': `${s.minArb ?? def.minArb}%`, 'Risky floor': s.riskyEnabled === false ? 'Hidden' : `${s.riskyMinRoi ?? def.riskyMinRoi}%`,
    Middles: s.middlesEnabled === false ? 'Off' : 'On', Sort: { profit: 'Profit', roi: 'ROI %', staying: 'Staying power' }[s.sort ?? def.sort],
  });
  return (
    <>
      <Panel title="Save current filters">
        <form style={{ display: 'flex', gap: 10 }} onSubmit={e => {
          e.preventDefault(); if (!name.trim()) return;
          setPresets(ps => [...ps, { id: String(Date.now()), name: name.trim(), settings: d, savedAt: Date.now() }]); setName('');
        }}>
          <input id="pr-name" className="input" style={{ fontFamily: 'var(--font-body)' }} placeholder="Name this preset…" value={name} onChange={e => setName(e.target.value)} />
          <button className="btn primary" disabled={!name.trim()}>Save preset</button>
        </form>
        <div className="lbl">Saved presets · {presets.length}</div>
        {presets.map(ps => (
          <div key={ps.id} className="toggle-row">
            <span><strong>{ps.name}</strong> <span className="sub">{ps.settings.books.length} books · min {ps.settings.minArb}% · {new Date(ps.savedAt).toLocaleDateString()}</span></span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button className="mini" onClick={() => setD(() => ({ ...ps.settings, mode: d.mode }))}>Apply</button>
              <button className="mini" onClick={() => setPresets(xs => xs.filter(x => x.id !== ps.id))}>Delete</button>
            </span>
          </div>
        ))}
      </Panel>
      <Panel title="Starter strategies">
        <p className="hint">One click, fully reversible. These only change strategy (floors, risky markets, middles, sort). Your books, stakes and layout stay as they are. Apply <b>Everything</b> to go back to the whole board.</p>
        <div className="preset-grid">
          {STARTER_PRESETS.map(sp => (
            <div className="preset" key={sp.id}>
              <div><h5>{sp.name}</h5><div className="tag">{sp.tagline}</div></div>
              <p className="hint">{sp.description}</p>
              <div className="kv">{Object.entries(describe(sp.patch)).map(([k, v]) => <FragmentKV key={k} k={k} v={v} />)}</div>
              <button className="btn primary" onClick={() => setD(s => ({ ...s, ...sp.patch }))}>Apply</button>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
const FragmentKV = ({ k, v }: { k: string; v: string }) => <><span>{k}</span><b>{v}</b></>;

export const MARKET_COUNT = MARKETS.length;
