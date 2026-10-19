import type { Engine } from '../../../shared/engine';
import { stayingScore } from '../../../shared/engine';
import type { EvBet, Opportunity, Settings } from '../../../shared/types';
import { leagueById } from '../../../shared/catalog';
import { Badge, bookHref, ago, legLabel, money, odds, openBook, pct, sideLabel, startLabel } from '../ui';

function comparable(engine: Engine, o: Opportunity, legIdx: number, s: Settings) {
  const q = o.legs[legIdx].quote;
  const out: { book: string; price: number }[] = [];
  for (const other of engine.quotes.values()) {
    if (other.eventId === q.eventId && other.market === q.market && other.side === q.side && other.line === q.line
      && other.player === q.player && other.book !== q.book && s.books.includes(other.book)) out.push({ book: other.book, price: other.price });
  }
  return out.sort((a, b) => b.price - a.price).slice(0, 4);
}

export function OppLedger({ opps, s, engine, onOpen, onPlan, planned, freshKeys, now }: {
  opps: Opportunity[]; s: Settings; engine: Engine; now: number;
  onOpen: (o: Opportunity) => void; onPlan: (o: Opportunity) => void; planned: Set<string>; freshKeys: Set<string>;
}) {
  const maxScore = Math.max(1, ...opps.map(o => stayingScore(o, now)));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="ledger">
        <thead>
          <tr>
            <th>{s.sort === 'profit' ? 'Profit' : 'ROI'}</th>
            <th>Event</th>
            <th>Market</th>
            <th>Bets</th>
            <th className="hide-sm">Staying power</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {opps.map(o => {
            const score = stayingScore(o, now);
            return (
              <tr key={o.key} className={`row${freshKeys.has(o.key) ? ' fresh' : ''}`} onClick={() => s.arbPopup && onOpen(o)}>
                <td>
                  <div className={`roi${o.roi < 0 ? ' neg' : ''}`}>{s.sort === 'profit' ? money(o.profit) : pct(o.roi)}</div>
                  <div className="sub mono">{s.sort === 'profit' ? pct(o.roi) : money(o.profit)}</div>
                  {o.kind === 'middle' && <div className="sub mono">hit {pct(o.middleRoi ?? 0, 0)}</div>}
                </td>
                <td style={{ minWidth: 180 }}>
                  <div className="evt">{o.event.away} @ {o.event.home}</div>
                  <div className="sub" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {o.event.live && <span className="pill live">Live</span>}
                    {leagueById(o.event.league).name} · {startLabel(o.event)}
                  </div>
                </td>
                <td style={{ minWidth: 150 }}>
                  <div>{o.market.label}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {o.kind === 'middle' && <span className="pill mid">Middle {o.middleSize}</span>}
                    {o.risky && <span className="pill risky">Risky</span>}
                  </div>
                </td>
                <td style={{ minWidth: 300 }}>
                  <div className="legs">
                    {o.legs.map((l, i) => (
                      <div key={i}>
                        <div className="leg">
                          <Badge book={l.quote.book} />
                          <span>
                            {legLabel(o, i)}{' '}
                            {s.showMainWithAlt && o.market.lined !== 'none' && !l.quote.player && (
                              <span className={`pill ${l.quote.isAlt ? 'alt' : 'main'}`}>{l.quote.isAlt ? 'Alt' : 'Main'}</span>
                            )}
                            {s.showEv && l.ev !== undefined && <span className={`ev-tag ${l.ev > 0 ? 'pos' : 'neg'}`}> {l.ev > 0 ? '+' : ''}{l.ev.toFixed(1)}% EV</span>}
                          </span>
                          <a className="price" href={bookHref(l.quote)} target="_blank" rel="noreferrer"
                            onClick={e => { e.stopPropagation(); if (openBook(l.quote, s)) e.preventDefault(); }}>{odds(l.quote.price)}</a>
                          <span className="stake">{money(l.stake)}</span>
                        </div>
                        {s.showComparable && (
                          <div className="compare" style={{ marginLeft: 44 }}>
                            {comparable(engine, o, i, s).map(c => <span key={c.book}><Badge book={c.book} size="sm" /> {odds(c.price)}</span>)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="hide-sm">
                  <div className="staybar">
                    <div className="track"><div className="fill" style={{ width: `${Math.min(100, (score / maxScore) * 100)}%` }} /></div>
                    <span className="mono sub">{o.refreshes}×</span>
                  </div>
                  <div className="sub mono">up {ago(o.firstSeen, now)} · peak {pct(o.peakRoi, 1)}</div>
                </td>
                <td>
                  <div className="row-actions">
                    <button className={`mini${planned.has(o.key) ? ' added' : ''}`} onClick={e => { e.stopPropagation(); onPlan(o); }}>
                      {planned.has(o.key) ? 'In plan' : '+ Plan'}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EvLedger({ evs, s, now }: { evs: EvBet[]; s: Settings; now: number }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="ledger">
        <thead>
          <tr><th>EV</th><th>Event</th><th>Bet</th><th>Book</th><th>Fair</th><th className="hide-sm">Kelly ¼</th><th className="hide-sm">Seen</th></tr>
        </thead>
        <tbody>
          {evs.map(b => (
            <tr key={b.key} className="row">
              <td><div className="roi">{pct(b.ev)}</div></td>
              <td style={{ minWidth: 180 }}>
                <div className="evt">{b.event.away} @ {b.event.home}</div>
                <div className="sub">{b.event.live && <span className="pill live">Live</span>} {leagueById(b.event.league).name} · {startLabel(b.event)}</div>
              </td>
              <td style={{ minWidth: 180 }}>
                <div>{sideLabel(b.event, b.market, b.quote)}</div>
                <div className="sub">{b.market.label} {b.risky && <span className="pill risky">Risky</span>}</div>
              </td>
              <td>
                <div className="leg" style={{ gridTemplateColumns: '34px auto' }}>
                  <Badge book={b.quote.book} />
                  <a className="price" href={bookHref(b.quote)} target="_blank" rel="noreferrer"
                    onClick={e => { if (openBook(b.quote, s)) e.preventDefault(); }}>{odds(b.quote.price)}</a>
                </div>
              </td>
              <td className="mono">{odds(b.fairPrice)}<div className="sub">{(b.fairProb * 100).toFixed(1)}%</div></td>
              <td className="mono hide-sm">{(b.kelly * 25).toFixed(2)}%<div className="sub">of bankroll</div></td>
              <td className="mono sub hide-sm">{ago(b.firstSeen, now)} · {b.refreshes}×</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
