import { useState, type ReactNode } from 'react';
import type { GameEvent, MarketDef, Opportunity, Quote, Settings } from '../../shared/types';
import { bookById } from '../../shared/catalog';
import { fmtAmerican } from '../../shared/odds';

export const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;
export const pct = (n: number, d = 2) => `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(d)}%`;
export const odds = (d: number) => fmtAmerican(d);
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Human label for one side of a market. */
export function sideLabel(ev: GameEvent, m: MarketDef, q: Quote): string {
  const team = q.side === 'home' ? ev.home : q.side === 'away' ? ev.away : q.side === 'draw' ? 'Draw' : '';
  const pre = q.player ? `${q.player} ` : m.key === 'tt_home' ? `${ev.home} ` : m.key === 'tt_away' ? `${ev.away} ` : '';
  if (m.lined === 'spread' && q.line !== undefined) return `${team} ${signed(q.side === 'home' ? q.line : -q.line)}`;
  if (m.lined === 'total' && q.line !== undefined) return `${pre}${q.side === 'over' ? 'Over' : 'Under'} ${q.line}`;
  if (q.side === 'yes' || q.side === 'no') return q.side === 'yes' ? 'Yes' : 'No';
  return team;
}
export const legLabel = (o: Opportunity, i: number) => sideLabel(o.event, o.market, o.legs[i].quote);

export function ago(ts: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h`;
}

export function startLabel(ev: GameEvent) {
  if (ev.live) return ev.clock ?? 'Live';
  const d = new Date(ev.startTime);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `Today ${time}` : `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

/** Logo sources in priority order: your own licensed file, then the book's own app icon from its website. */
function logoSources(id: string): string[] {
  const b = bookById(id);
  if (!b) return [];
  return [
    ...(b.logo ? [b.logo] : []),
    `https://www.google.com/s2/favicons?domain=${b.domain}&sz=64`,
  ];
}
const failed = new Set<string>(); // remember broken sources so every badge doesn't retry them

export function Badge({ book, size = 'md' }: { book: string; size?: 'sm' | 'md' }) {
  const b = bookById(book);
  const sources = logoSources(book);
  const [idx, setIdx] = useState(() => { const i = sources.findIndex(s => !failed.has(s)); return i < 0 ? sources.length : i; });
  const src = sources[idx];
  if (src) {
    return (
      <span className={`badge has-img ${size}`} title={b?.name}>
        <img src={src} alt={b?.name ?? book} loading="lazy" referrerPolicy="no-referrer"
          onError={() => { failed.add(src); setIdx(i => i + 1); }} />
      </span>
    );
  }
  // fallback when no icon can load (offline, or a page that blocks outside images)
  return <span className={`badge ${size}`} style={{ background: b?.color ?? '#555' }} title={b?.name}>{b?.short ?? book.slice(0, 3)}</span>;
}

export function Toggle({ on, onChange, label, id }: { on: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return <button id={id} type="button" role="switch" aria-checked={on} aria-label={label} className="toggle" onClick={() => onChange(!on)} />;
}

export function NumField({ id, label, value, onChange, suffix, step = 'any', min }: {
  id: string; label: string; value: number; onChange: (n: number) => void; suffix?: string; step?: string; min?: number;
}) {
  return (
    <div className="field">
      <label className="lbl" htmlFor={id}>{label}{suffix ? ` (${suffix})` : ''}</label>
      <input id={id} className="input" type="number" step={step} min={min} value={Number.isFinite(value) ? value : ''}
        onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
    </div>
  );
}

export function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head"><h4>{title}</h4>{right}</div>
      {children}
    </section>
  );
}

export const bookHref = (q: Quote) => q.link ?? bookById(q.book)?.url ?? '#';

/** Open a book's betslip/landing page honouring the Display settings. */
export function openBook(q: Quote, s: Settings) {
  const b = bookById(q.book);
  let url = q.link ?? b?.url ?? '#';
  if (s.linkMode === 'mobile' && !q.link) url = url.replace('://sportsbook.', '://m.sportsbook.');
  const features = s.openMode === 'popup' ? `popup=yes,width=${s.popupW},height=${s.popupH}` : undefined;
  const w = window.open(url, `1x_${q.book}`, features);
  return w !== null; // false → caller lets the <a href> do its thing
}

// ---- tiny inline icons (stroke = currentColor) ----
const I = (d: string, size = 20) => () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
export const IconScale = I('M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0L7 7zm10 0-3 7a3 3 0 0 0 6 0l-3-7zM8 21h8');
export const IconBolt = I('M13 2 4 14h7l-1 8 9-12h-7l1-8z');
export const IconSplit = I('M4 12h6l4-6h6M14 18h6M10 12l4 6');
export const IconTicket = I('M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4V8zM9 6v12');
export const IconCalc = I('M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM8 6h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h2M14 19h2');
export const IconSliders = I('M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4');
export const IconPause = I('M8 5v14M16 5v14');
export const IconPlay = I('M7 4l13 8-13 8V4z');
export const IconBell = I('M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4');
export const IconChevL = I('M15 18l-6-6 6-6', 18);
export const IconChevR = I('M9 6l6 6-6 6', 18);
export const IconChevD = I('M6 9l6 6 6-6', 16);
export const IconCheck = I('M5 12l5 5L20 7', 14);
export const IconMinus = I('M6 12h12', 14);
export const IconX = I('M6 6l12 12M18 6L6 18', 18);
export const IconExt = I('M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5', 14);
