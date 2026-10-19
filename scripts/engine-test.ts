// Sanity checks for the engine + a quick look at how often the demo feed produces opportunities.
import { Engine, sizeStakes } from '../shared/engine';
import { Simulator } from '../shared/simulator';
import { defaultSettings } from '../shared/settings';
import type { Quote } from '../shared/types';

const s = defaultSettings();
let fails = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) fails++; };

// 1. Known 2-way arb: +110 / +105 → 2.10 / 2.05
const e = new Engine();
const ev = { id: 'e1', league: 'nhl', sport: 'hockey' as const, home: 'Leafs', away: 'Habs', startTime: Date.now(), live: true };
const q = (book: string, side: string, price: number): Quote =>
  ({ id: `e1|ml|||${side}|${book}`, eventId: 'e1', book, market: 'ml', side, price, updatedAt: Date.now() });
e.apply({ type: 'snapshot', seq: 1, ts: 0, events: [ev], upserts: [q('fanduel', 'home', 2.10), q('bet365', 'away', 2.05), q('fanduel', 'away', 1.80), q('bet365', 'home', 1.85)] });
const r = e.compute({ ...s, minRefreshes: 0, sort: 'roi', sortMinRoi: 0 });
const arb = r.opps.find(o => o.kind === 'arb')!;
const expect = (1 / (1 / 2.1 + 1 / 2.05) - 1) * 100;
check('detects 2-way arb', !!arb && Math.abs(arb.roi - expect) < 1e-9);
check('balanced stakes sum to 100', Math.abs(arb.totalStake - 100) < 1e-9);
check('payouts equal', Math.abs(arb.legs[0].payout - arb.legs[1].payout) < 1e-9);

// 2. Staying power: refresh count increases only when the feed seq advances
e.apply({ type: 'delta', seq: 2, ts: 0, upserts: [] }); e.compute(s);
e.apply({ type: 'delta', seq: 3, ts: 0, upserts: [] });
const r3 = e.compute({ ...s, minRefreshes: 2, sort: 'staying', sortMinRoi: 0 });
check('refreshes counted (2)', r3.opps[0]?.refreshes === 2);
e.compute(s); // same seq again
check('no double-count on same seq', e.compute({ ...s, minRefreshes: 0 }).opps[0]?.refreshes === 2);
check('min refreshes hides young arbs', e.compute({ ...s, sort: 'staying', minRefreshes: 3, sortMinRoi: 0 }).opps.length === 0);

// 3. Arb disappears → resets
e.apply({ type: 'delta', seq: 4, ts: 0, upserts: [q('fanduel', 'home', 1.70)] });
e.compute(s);
e.apply({ type: 'delta', seq: 5, ts: 0, upserts: [q('fanduel', 'home', 2.10)] });
check('staying power resets after arb dies', e.compute({ ...s, minRefreshes: 0, sort: 'roi', sortMinRoi: 0 }).opps[0]?.refreshes === 0);

// 4. Book filter + required books
check('deselecting a book removes arb', e.compute({ ...s, books: ['fanduel', 'draftkings'], minRefreshes: 0 }).opps.length === 0);
check('required book not present removes arb', e.compute({ ...s, requiredBooks: ['betmgm'], minRefreshes: 0, sortMinRoi: 0 }).opps.length === 0);

// 5. Fixed + per-book anchor stakes
const st = sizeStakes([q('fanduel', 'home', 2.1), q('bet365', 'away', 2.05)], { ...s, perBook: { bet365: { stake: 200, disabledLeagues: [], mainLineOnly: false } } });
check('per-book stake anchors ratio', Math.abs(st[1] - 200) < 1e-9 && Math.abs(st[0] * 2.1 - 410) < 1e-9);

// 6. Middle: over 5.5 @1.95 at FD, under 6.5 @1.95 at 365
const e2 = new Engine();
const tq = (book: string, side: string, line: number, price: number): Quote =>
  ({ id: `e1|total||${line}|${side}|${book}`, eventId: 'e1', book, market: 'total', side, line, price, updatedAt: 0 });
e2.apply({ type: 'snapshot', seq: 1, ts: 0, events: [ev], upserts: [tq('fanduel', 'over', 5.5, 1.95), tq('bet365', 'under', 6.5, 1.95), tq('fanduel', 'under', 5.5, 1.87), tq('bet365', 'over', 6.5, 1.87)] });
const mid = e2.compute({ ...s, minRefreshes: 0, sortMinRoi: 0 }).opps.find(o => o.kind === 'middle');
check('detects 1-pt total middle', !!mid && mid.middleSize === 1 && mid.roi < 0 && (mid.middleRoi ?? 0) > 90);

// 7. Demo feed realism
const sim = new Simulator();
const e3 = new Engine();
let arbs = 0, mids = 0, evs = 0, quotes = 0, ms = 0;
for (let i = 0; i < 60; i++) {
  const msg = sim.tick(); e3.apply(msg); quotes = e3.quotes.size;
  const t = performance.now();
  const res = e3.compute({ ...s, minRefreshes: 0, sortMinRoi: 0, minArb: 0 });
  ms = Math.max(ms, performance.now() - t);
  arbs += res.opps.filter(o => o.kind === 'arb').length; mids += res.opps.filter(o => o.kind === 'middle').length; evs += res.evs.length;
}
console.log(`demo feed: ${quotes} quotes, avg/tick → arbs ${(arbs / 60).toFixed(1)}, middles ${(mids / 60).toFixed(1)}, +EV ${(evs / 60).toFixed(1)}; worst compute ${ms.toFixed(1)}ms`);
const longest = e3.compute({ ...s, minRefreshes: 0, sortMinRoi: 0, minArb: 0, sort: 'staying' }).opps.filter(o => o.kind === 'arb').slice(0, 3);
console.log('top staying arbs:', longest.map(o => `${o.refreshes} refreshes @ ${o.roi.toFixed(2)}%`).join(', '));
process.exit(fails ? 1 : 0);
