import { useMemo, useState } from 'react';
import type { GameEvent, Opportunity, Settings } from '../../../shared/types';
import { leagueById } from '../../../shared/catalog';
import { parseOdds } from '../../../shared/odds';
import type { PlanItem } from '../store';
import {
  Badge, bookHref, IconChevL, IconChevR, IconExt, IconX, ago, legLabel, money, odds, openBook, pct, startLabel,
} from '../ui';

// ---------------- Arb detail drawer ----------------
export function OppDrawer({ o, s, onClose, onPlan, onCalc, now }: {
  o: Opportunity; s: Settings; now: number; onClose: () => void; onPlan: () => void; onCalc: () => void;
}) {
  const [total, setTotal] = useState(Math.round(o.totalStake));
  const [round, setRound] = useState(1);
  const sum = o.legs.reduce((a, l) => a + 1 / l.quote.price, 0);
  const stakes = o.legs.map(l => Math.round(((total * (1 / l.quote.price)) / sum) / round) * round);
  const payouts = stakes.map((st, i) => st * o.legs[i].quote.price);
  const spent = stakes.reduce((a, b) => a + b, 0);
  const worst = Math.min(...payouts) - spent;
  return (
    <div className="scrim" onClick={onClose}>
      <aside className="drawer" onClick={e => e.stopPropagation()} aria-label="Opportunity details">
        <div className="panel-head">
          <div>
            <div className="sub">{leagueById(o.event.league).name} · {startLabel(o.event)}</div>
            <h2>{o.event.away} @ {o.event.home}</h2>
            <div className="sub">{o.market.label}{o.player ? ` · ${o.player}` : ''}</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconX /></button>
        </div>

        <div className="fields">
          <div><div className="lbl">{o.kind === 'middle' ? 'Worst case' : 'Guaranteed'}</div><div className={`big-number ${o.roi >= 0 ? 'pos' : 'neg'}`}>{pct(o.roi)}</div></div>
          {o.kind === 'middle' && <div><div className="lbl">If middle hits</div><div className="big-number pos">{pct(o.middleRoi ?? 0, 0)}</div></div>}
          <div><div className="lbl">Refreshes</div><div className="big-number">{o.refreshes}</div></div>
          <div><div className="lbl">Alive</div><div className="big-number">{ago(o.firstSeen, now)}</div></div>
        </div>
        <p className="hint">ROI range while alive: {pct(o.minRoiSeen)} to {pct(o.peakRoi)}. A steady range with many refreshes means the books aren't racing to fix it.</p>

        <div className="fields">
          <div className="field"><label className="lbl" htmlFor="dr-total">Total stake</label>
            <input id="dr-total" className="input" type="number" value={total} onChange={e => setTotal(Number(e.target.value) || 0)} /></div>
          <div className="field"><label className="lbl" htmlFor="dr-round">Round legs to</label>
            <select id="dr-round" className="input" value={round} onChange={e => setRound(Number(e.target.value))}>
              <option value={0.01}>$0.01</option><option value={1}>$1</option><option value={5}>$5</option><option value={10}>$10</option>
            </select></div>
        </div>

        <div className="legs">
          {o.legs.map((l, i) => (
            <div key={i} className="plan-item">
              <div className="leg" style={{ gridTemplateColumns: '34px 1fr auto' }}>
                <Badge book={l.quote.book} />
                <strong>{legLabel(o, i)}</strong>
                <span className="price">{odds(l.quote.price)}</span>
              </div>
              <div className="panel-head">
                <span className="mono">Bet {money(stakes[i])} → returns {money(payouts[i])}</span>
                <a className="mini" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                  href={bookHref(l.quote)} target="_blank" rel="noreferrer"
                  onClick={e => { if (openBook(l.quote, s)) e.preventDefault(); }}>Open book <IconExt /></a>
              </div>
            </div>
          ))}
        </div>
        <div className="panel-head">
          <span>Total {money(spent)} · worst-case profit <b className="mono" style={{ color: worst >= 0 ? 'var(--win)' : 'var(--loss)' }}>{money(worst)}</b></span>
        </div>
        <div className="fields">
          <button className="btn primary" onClick={onPlan}>Add to bet plan</button>
          <button className="btn" onClick={onCalc}>Open in calculator</button>
        </div>
        <p className="hint">Place the leg at the book most likely to move first. Odds are re-checked every refresh; confirm the price on the betslip before submitting.</p>
      </aside>
    </div>
  );
}

// ---------------- Calculator ----------------
export function Calculator({ initial, onClose }: { initial?: string[]; onClose: () => void }) {
  const [legs, setLegs] = useState<string[]>(initial ?? ['+110', '+105']);
  const [total, setTotal] = useState(100);
  const [round, setRound] = useState(0.01);
  const prices = legs.map(parseOdds);
  const valid = prices.every(p => Number.isFinite(p) && p > 1);
  const sum = valid ? prices.reduce((a, p) => a + 1 / p, 0) : NaN;
  const stakes = prices.map(p => Math.round((total * (1 / p) / sum) / round) * round);
  const spent = stakes.reduce((a, b) => a + b, 0);
  const worst = valid ? Math.min(...stakes.map((st, i) => st * prices[i])) - spent : NaN;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="small-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Arbitrage calculator">
        <div className="panel-head"><h2>Calculator</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><IconX /></button></div>
        <p className="hint">Enter American (+150, −110) or decimal (2.50) odds. Stakes are balanced so every outcome pays the same.</p>
        <div className="calc-grid">
          <span className="lbl">Odds</span><span className="lbl">Stake</span><span className="lbl">Returns</span>
          {legs.map((v, i) => (
            <FragmentRow key={i}>
              <input id={`calc-${i}`} className="input" value={v} aria-label={`Leg ${i + 1} odds`}
                onChange={e => setLegs(ls => ls.map((x, j) => (j === i ? e.target.value : x)))} />
              <span className="mono">{valid ? money(stakes[i]) : '—'}</span>
              <span className="mono">{valid ? money(stakes[i] * prices[i]) : '—'}</span>
            </FragmentRow>
          ))}
        </div>
        <div className="fields">
          <button className="mini" onClick={() => setLegs(l => (l.length === 2 ? [...l, '+300'] : l.slice(0, 2)))}>{legs.length === 2 ? '+ 3-way (draw)' : '− Back to 2-way'}</button>
        </div>
        <div className="fields">
          <div className="field"><label className="lbl" htmlFor="calc-total">Total stake</label>
            <input id="calc-total" className="input" type="number" value={total} onChange={e => setTotal(Number(e.target.value) || 0)} /></div>
          <div className="field"><label className="lbl" htmlFor="calc-round">Round to</label>
            <select id="calc-round" className="input" value={round} onChange={e => setRound(Number(e.target.value))}>
              <option value={0.01}>$0.01</option><option value={1}>$1</option><option value={5}>$5</option>
            </select></div>
        </div>
        <div className="fields">
          <div><div className="lbl">Market total</div><div className="big-number">{valid ? `${(sum * 100).toFixed(2)}%` : '—'}</div></div>
          <div><div className="lbl">ROI</div><div className={`big-number ${(1 / sum - 1) >= 0 ? 'pos' : 'neg'}`}>{valid ? pct((1 / sum - 1) * 100) : '—'}</div></div>
          <div><div className="lbl">Worst-case profit</div><div className={`big-number ${worst >= 0 ? 'pos' : 'neg'}`}>{valid ? money(worst) : '—'}</div></div>
        </div>
        {!valid && <p className="hint" style={{ color: 'var(--loss)' }}>One of the odds isn't readable. Use a format like +150, −110 or 2.50.</p>}
      </div>
    </div>
  );
}
const FragmentRow = ({ children }: { children: React.ReactNode }) => <>{children}</>;

// ---------------- Bet plan ----------------
export function BetPlan({ items, setItems, onClose }: {
  items: PlanItem[]; setItems: (f: (x: PlanItem[]) => PlanItem[]) => void; onClose: () => void;
}) {
  const totals = useMemo(() => ({
    staked: items.reduce((a, i) => a + i.total, 0),
    profit: items.reduce((a, i) => a + i.profit, 0),
    open: items.filter(i => i.legs.some(l => !l.placed)).length,
  }), [items]);
  return (
    <div className="scrim" onClick={onClose}>
      <aside className="drawer" onClick={e => e.stopPropagation()} aria-label="Bet plan">
        <div className="panel-head"><h2>Bet plan</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><IconX /></button></div>
        <div className="fields">
          <div><div className="lbl">Staked</div><div className="big-number">{money(totals.staked)}</div></div>
          <div><div className="lbl">Locked profit</div><div className="big-number pos">{money(totals.profit)}</div></div>
          <div><div className="lbl">Unfinished</div><div className="big-number">{totals.open}</div></div>
        </div>
        {items.length === 0 && <p className="hint">Nothing planned yet. Press “+ Plan” on any opportunity to stage its legs here, then tick each leg off as you place it.</p>}
        {items.map(it => (
          <div className="plan-item" key={it.id}>
            <div className="panel-head">
              <div><strong>{it.title}</strong><div className="sub">{it.market} · {it.kind === 'middle' ? 'Middle' : 'Arb'} {pct(it.roi)} · added {ago(it.addedAt)} ago</div></div>
              <button className="mini" onClick={() => setItems(xs => xs.filter(x => x.id !== it.id))}>Remove</button>
            </div>
            {it.legs.map((l, i) => (
              <label key={i} className="leg" style={{ gridTemplateColumns: '20px 34px 1fr auto auto', cursor: 'pointer' }}>
                <input type="checkbox" checked={l.placed} onChange={() => setItems(xs => xs.map(x => x.id !== it.id ? x : { ...x, legs: x.legs.map((y, j) => (j === i ? { ...y, placed: !y.placed } : y)) }))} />
                <Badge book={l.book} />
                <span style={{ textDecoration: l.placed ? 'line-through' : undefined, color: l.placed ? 'var(--fg-3)' : undefined }}>{l.label}</span>
                <span className="price">{odds(l.price)}</span>
                <span className="stake">{money(l.stake)}</span>
              </label>
            ))}
          </div>
        ))}
        {items.length > 0 && <button className="btn ghost" onClick={() => setItems(() => [])}>Clear plan</button>}
      </aside>
    </div>
  );
}

// ---------------- Empty state + upcoming volume ----------------
export function EmptyState({ events, candidates, onLoosen }: { events: GameEvent[]; candidates: number; onLoosen: () => void }) {
  const [dayOffset, setDayOffset] = useState(0);
  const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + dayOffset);
  const counts = Array.from({ length: 24 }, () => 0);
  for (const e of events) {
    const d = new Date(e.startTime);
    if (d.toDateString() === day.toDateString()) counts[d.getHours()]++;
  }
  const max = Math.max(1, ...counts);
  const W = 480, H = 150, bw = W / 24;
  return (
    <div className="empty">
      <div className="empty-card">
        <div className="scan"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></svg></div>
        <h2>Nothing clears your filters yet</h2>
        <p>
          {candidates > 0
            ? `${candidates} opportunit${candidates === 1 ? 'y is' : 'ies are'} on the board but below your floors or still too young for your minimum refreshes.`
            : 'No arbitrage between your selected books right now. Lines are still being compared on every refresh.'}
        </p>
        <span className="monitor"><i />Monitoring markets</span>
        {candidates > 0 && <button className="btn" onClick={onLoosen}>Show everything for now</button>}
      </div>
      <div className="empty-card">
        <div className="vol-head">
          <button className="icon-btn" onClick={() => setDayOffset(d => d - 1)} disabled={dayOffset <= 0} aria-label="Previous day"><IconChevL /></button>
          <div><h3>Upcoming volume</h3><div className="sub">{day.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div></div>
          <button className="icon-btn" onClick={() => setDayOffset(d => d + 1)} aria-label="Next day"><IconChevR /></button>
        </div>
        <p>More games on the board means more mispriced lines. Add books or leagues, or come back at peak hours.</p>
        <svg viewBox={`0 0 ${W} ${H + 24}`} width="100%" role="img" aria-label="Games starting per hour">
          {[0.5, 1].map(f => <line key={f} x1="0" x2={W} y1={H - f * (H - 16)} y2={H - f * (H - 16)} stroke="var(--line)" />)}
          {counts.map((c, h) => {
            const bh = (c / max) * (H - 16);
            return (
              <g key={h}>
                {c > 0 && <rect x={h * bw + 3} y={H - bh} width={bw - 6} height={bh} rx="3" fill="var(--brand)" opacity={0.45 + 0.55 * (c / max)} />}
                {c > 0 && <text x={h * bw + bw / 2} y={H - bh - 4} textAnchor="middle" fontSize="10" fill="var(--fg-2)" fontFamily="var(--font-mono)">{c}</text>}
                {h % 3 === 0 && <text x={h * bw + bw / 2} y={H + 16} textAnchor="middle" fontSize="10" fill="var(--fg-3)">{h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}</text>}
              </g>
            );
          })}
          <line x1="0" x2={W} y1={H} y2={H} stroke="var(--ink-3)" />
        </svg>
      </div>
    </div>
  );
}
