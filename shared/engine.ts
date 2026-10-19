import type {
  EvBet, FeedMessage, GameEvent, Leg, MarketDef, Opportunity, Quote, Settings,
} from './types';
import { bookById, leagueById, marketByKey } from './catalog';

interface Track { firstSeen: number; refreshes: number; lastSeq: number; peak: number; low: number }

export interface EngineResult {
  opps: Opportunity[];   // arbs + middles, filtered and sorted
  evs: EvBet[];
  candidates: number;    // before display floors (useful for the empty state)
  seq: number;
}

/**
 * Holds the live odds board (fed by FeedMessages) and turns it into opportunities for a given Settings.
 * Runs in the browser so every user's book selection, floors and staying-power history are their own.
 */
export class Engine {
  events = new Map<string, GameEvent>();
  quotes = new Map<string, Quote>();
  seq = 0;
  private track = new Map<string, Track>();
  private evTrack = new Map<string, Track>();

  apply(msg: FeedMessage) {
    if (msg.type === 'snapshot') { this.events.clear(); this.quotes.clear(); }
    for (const e of msg.events ?? []) this.events.set(e.id, e);
    for (const q of msg.upserts ?? []) this.quotes.set(q.id, q);
    for (const id of msg.removes ?? []) this.quotes.delete(id);
    // drop events that have no quotes left
    if (msg.type === 'snapshot' || (msg.removes?.length ?? 0) > 0) {
      const live = new Set<string>();
      for (const q of this.quotes.values()) live.add(q.eventId);
      for (const id of this.events.keys()) if (!live.has(id)) this.events.delete(id);
    }
    this.seq = msg.seq;
  }

  resetTracking() { this.track.clear(); this.evTrack.clear(); }

  /** Quote passes the user's book/league/market/liquidity filters (for building arbs). */
  private usable(q: Quote, ev: GameEvent, s: Settings, books: Set<string>): boolean {
    if (!books.has(q.book)) return false;
    const pb = s.perBook[q.book];
    if (pb?.disabledLeagues.includes(ev.league)) return false;
    const m = marketByKey(q.market);
    if (pb?.mainLineOnly && q.isAlt && m.lined !== 'none' && !q.player) return false;
    if (q.liquidity !== undefined && q.liquidity < s.arbMinLiquidity) return false;
    return true;
  }

  compute(s: Settings, now = Date.now()): EngineResult {
    const books = new Set(s.books);
    const required = new Set(s.requiredBooks);
    // group quotes: event|market|player|line
    const groups = new Map<string, Quote[]>();
    const lineGroups = new Map<string, Quote[]>(); // event|market|player (for middles)
    for (const q of this.quotes.values()) {
      const ev = this.events.get(q.eventId);
      if (!ev) continue;
      if (ev.live !== (s.mode === 'live')) continue;
      const enabled = s.markets[ev.league];
      if (!enabled || !enabled.includes(q.market)) continue;
      const m = marketByKey(q.market);
      if (m.risky && !s.riskyEnabled) continue;
      const k = `${q.eventId}|${q.market}|${q.player ?? ''}|${q.line ?? ''}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(q);
      if (m.lined !== 'none') {
        const lk = `${q.eventId}|${q.market}|${q.player ?? ''}`;
        (lineGroups.get(lk) ?? lineGroups.set(lk, []).get(lk)!).push(q);
      }
    }

    const opps: Opportunity[] = [];
    const evs: EvBet[] = [];
    const seen = new Set<string>();
    const seenEv = new Set<string>();

    for (const [k, qs] of groups) {
      const ev = this.events.get(qs[0].eventId)!;
      const m = marketByKey(qs[0].market);
      const fair = this.fairProbs(qs, m, s);
      const usable = qs.filter(q => this.usable(q, ev, s, books));

      // ---- arbitrage ----
      const arbLegs = bestCombo(usable, m.sides, required);
      if (arbLegs) {
        const sum = arbLegs.reduce((a, q) => a + 1 / q.price, 0);
        const roi = (1 / sum - 1) * 100;
        if (roi > 0) {
          const key = `arb|${k}|${arbLegs.map(l => l.book).join(',')}`;
          const opp = this.buildOpp(key, 'arb', ev, m, arbLegs, s, fair);
          opps.push(opp); seen.add(key);
        }
      }

      // ---- +EV ----
      if (fair) {
        for (const q of usable) {
          const p = fair[q.side];
          if (!p) continue;
          const e = (q.price * p - 1) * 100;
          if (e <= 0.25) continue;
          const key = `ev|${q.id}`;
          const t = this.touch(this.evTrack, key, now, e);
          seenEv.add(key);
          const b = q.price - 1;
          evs.push({
            key, event: ev, market: m, player: q.player, line: q.line, quote: q,
            fairProb: p, fairPrice: 1 / p, ev: e, kelly: Math.max(0, (p * b - (1 - p)) / b),
            refreshes: t.refreshes, firstSeen: t.firstSeen, risky: !!m.risky,
          });
        }
      }
    }

    // ---- middles ----
    if (s.middlesEnabled) {
      for (const [lk, qs] of lineGroups) {
        const ev = this.events.get(qs[0].eventId)!;
        const m = marketByKey(qs[0].market);
        const usable = qs.filter(q => this.usable(q, ev, s, books));
        const [sideA, sideB] = m.sides; // home/away or over/under
        const bestA = bestByLine(usable.filter(q => q.side === sideA));
        const bestB = bestByLine(usable.filter(q => q.side === sideB));
        for (const a of bestA.values()) for (const b of bestB.values()) {
          if (a.line === undefined || b.line === undefined || a.book === b.book) continue;
          // total: over T1 + under T2 hits when T1 < x < T2.  spread (home line Lh, away line La): hits when La < Lh.
          const size = m.lined === 'total' ? b.line - a.line : a.line - b.line;
          if (size <= 0 || size < s.minMiddleSize) continue;
          if (required.size && !required.has(a.book) && !required.has(b.book)) continue;
          const sum = 1 / a.price + 1 / b.price;
          const worst = (1 / sum - 1) * 100;
          const hit = (2 / sum - 1) * 100;
          if (worst < s.minMiddle || hit < s.minMiddleRoi) continue;
          const key = `mid|${lk}|${a.book}:${a.line}|${b.book}:${b.line}`;
          const opp = this.buildOpp(key, 'middle', ev, m, [a, b], s, null);
          opp.middleSize = size; opp.middleRoi = hit; opp.line = undefined;
          opps.push(opp); seen.add(key);
        }
      }
    }

    // forget anything that vanished this refresh (staying power resets)
    for (const k of this.track.keys()) if (!seen.has(k)) this.track.delete(k);
    for (const k of this.evTrack.keys()) if (!seenEv.has(k)) this.evTrack.delete(k);

    const candidates = opps.length;
    const shown = opps.filter(o => passesFloors(o, s));
    shown.sort((a, b) => compare(a, b, s));
    evs.sort((a, b) => b.ev - a.ev);
    return { opps: shown.slice(0, 400), evs: evs.slice(0, 400), candidates, seq: this.seq };
  }

  private touch(map: Map<string, Track>, key: string, now: number, roi: number): Track {
    let t = map.get(key);
    if (!t) { t = { firstSeen: now, refreshes: 0, lastSeq: this.seq, peak: roi, low: roi }; map.set(key, t); }
    else if (this.seq > t.lastSeq) { t.refreshes += 1; t.lastSeq = this.seq; }
    t.peak = Math.max(t.peak, roi); t.low = Math.min(t.low, roi);
    return t;
  }

  private buildOpp(
    key: string, kind: 'arb' | 'middle', ev: GameEvent, m: MarketDef, qs: Quote[],
    s: Settings, fair: Record<string, number> | null,
  ): Opportunity {
    const stakes = sizeStakes(qs, s);
    const legs: Leg[] = qs.map((q, i) => ({
      quote: q, stake: stakes[i], payout: stakes[i] * q.price,
      ev: fair?.[q.side] ? (q.price * fair[q.side] - 1) * 100 : undefined,
    }));
    const total = stakes.reduce((a, b) => a + b, 0);
    const worstPayout = Math.min(...legs.map(l => l.payout));
    const sum = qs.reduce((a, q) => a + 1 / q.price, 0);
    const roi = (1 / sum - 1) * 100;
    const t = this.touch(this.track, key, Date.now(), roi);
    return {
      key, kind, event: ev, market: m, player: qs[0].player, line: qs[0].line, legs,
      roi, profit: worstPayout - total, totalStake: total, risky: !!m.risky,
      firstSeen: t.firstSeen, refreshes: t.refreshes, peakRoi: t.peak, minRoiSeen: t.low,
    };
  }

  /** De-vigged fair probabilities per side, from market consensus or sharp books. */
  private fairProbs(qs: Quote[], m: MarketDef, s: Settings): Record<string, number> | null {
    const byBook = new Map<string, Map<string, Quote>>();
    for (const q of qs) {
      if (q.liquidity !== undefined && q.liquidity < s.evMinLiquidity) continue;
      if (s.evMethod === 'sharp' && !s.sharpBooks.includes(q.book)) continue;
      (byBook.get(q.book) ?? byBook.set(q.book, new Map()).get(q.book)!).set(q.side, q);
    }
    const acc: Record<string, number> = {};
    let n = 0;
    for (const sides of byBook.values()) {
      if (sides.size !== m.sides.length) continue;
      const inv = m.sides.map(sd => 1 / sides.get(sd)!.price);
      const tot = inv.reduce((a, b) => a + b, 0);
      m.sides.forEach((sd, i) => { acc[sd] = (acc[sd] ?? 0) + inv[i] / tot; });
      n++;
    }
    const need = s.evMethod === 'sharp' ? 1 : 3;
    if (n < need) return null;
    for (const sd of m.sides) acc[sd] /= n;
    return acc;
  }
}

function bestByLine(qs: Quote[]) {
  const best = new Map<number, Quote>();
  for (const q of qs) {
    if (q.line === undefined) continue;
    const cur = best.get(q.line);
    if (!cur || q.price > cur.price) best.set(q.line, q);
  }
  return best;
}

/** Best price per side; if required books are set, the best combination that includes at least one of them. */
function bestCombo(qs: Quote[], sides: string[], required: Set<string>): Quote[] | null {
  const bySide = sides.map(sd => qs.filter(q => q.side === sd).sort((a, b) => b.price - a.price));
  if (bySide.some(l => l.length === 0)) return null;
  const best = bySide.map(l => l[0]);
  const ok = (legs: Quote[]) =>
    new Set(legs.map(l => l.book)).size > 1 && (!required.size || legs.some(l => required.has(l.book)));
  if (ok(best)) return best;
  let winner: Quote[] | null = null;
  let winSum = Infinity;
  // anchor one leg on each candidate (required book, or second-best when books collide), take best elsewhere
  for (let i = 0; i < sides.length; i++) {
    for (const anchor of bySide[i]) {
      if (required.size && !required.has(anchor.book)) continue;
      const legs = bySide.map((l, j) => (j === i ? anchor : l.find(q => q.book !== anchor.book) ?? l[0]));
      if (!ok(legs)) continue;
      const sum = legs.reduce((a, q) => a + 1 / q.price, 0);
      if (sum < winSum) { winSum = sum; winner = legs; }
      break; // list is sorted: first valid anchor for this side is its best
    }
  }
  return winner;
}

export function sizeStakes(qs: Quote[], s: Settings): number[] {
  const override = (b: string) => s.perBook[b]?.stake;
  if (s.stakeMode === 'fixed') return qs.map(q => override(q.book) ?? s.stakeAmount);
  // ratio: balance payouts. If a leg's book has a stake override, anchor on it.
  const anchorIdx = qs.findIndex(q => override(q.book) !== undefined);
  if (anchorIdx >= 0) {
    const a = qs[anchorIdx];
    const payout = override(a.book)! * a.price;
    return qs.map(q => payout / q.price);
  }
  const sum = qs.reduce((acc, q) => acc + 1 / q.price, 0);
  return qs.map(q => (s.stakeAmount * (1 / q.price)) / sum);
}

function passesFloors(o: Opportunity, s: Settings) {
  if (o.kind === 'arb') {
    if (o.roi < s.minArb) return false;
    if (o.risky && o.roi < s.riskyMinRoi) return false;
  }
  if (s.sort === 'profit' && o.profit < s.sortMinProfit && o.kind === 'arb') return false;
  if (s.sort === 'roi' && o.kind === 'arb' && o.roi < s.sortMinRoi) return false;
  if (s.sort === 'staying') {
    if (o.kind === 'arb' && o.roi < s.sortMinRoi) return false;
    if (o.refreshes < s.minRefreshes) return false;
  }
  return true;
}

/** Staying power: survived refreshes, then age, then how little the ROI has decayed. */
export function stayingScore(o: Opportunity, now = Date.now()) {
  const ageSec = (now - o.firstSeen) / 1000;
  const stability = o.peakRoi > 0 ? Math.max(0, o.roi / o.peakRoi) : 0;
  return o.refreshes * 10 + Math.min(ageSec, 600) * 0.5 + stability * 5;
}

function compare(a: Opportunity, b: Opportunity, s: Settings) {
  if (s.sort === 'profit') return b.profit - a.profit;
  if (s.sort === 'roi') return b.roi - a.roi;
  return stayingScore(b) - stayingScore(a) || b.roi - a.roi;
}

export const leagueName = (id: string) => leagueById(id)?.name ?? id;
export const bookName = (id: string) => bookById(id)?.name ?? id;
