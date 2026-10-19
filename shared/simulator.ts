import type { FeedMessage, GameEvent, Quote } from './types';
import { BOOKS, LEAGUES, marketByKey } from './catalog';

/**
 * Demo feed. Models a "true" line per event that drifts over time, and books that re-price
 * on their own schedule with their own vig and bias. Arbs appear naturally when a slow book
 * lags a line move, and die when it catches up — which is exactly what staying power measures.
 */

const TEAMS: Record<string, string[]> = {
  nfl: ['Bills', 'Chiefs', 'Eagles', 'Lions', '49ers', 'Ravens', 'Packers', 'Cowboys', 'Bengals', 'Texans', 'Jets', 'Rams'],
  ncaaf: ['Ohio State', 'Georgia', 'Texas', 'Oregon', 'Alabama', 'Michigan', 'Penn State', 'LSU'],
  cfl: ['Argonauts', 'Tiger-Cats', 'Alouettes', 'Redblacks', 'Blue Bombers', 'Roughriders', 'Stampeders', 'Lions', 'Elks'],
  nba: ['Raptors', 'Celtics', 'Knicks', 'Bucks', 'Nuggets', 'Thunder', 'Lakers', 'Warriors', 'Cavaliers', 'Heat'],
  ncaab: ['Duke', 'Kansas', 'UConn', 'Houston', 'Purdue', 'Arizona'],
  wnba: ['Valkyries', 'Liberty', 'Aces', 'Lynx', 'Fever', 'Sky'],
  nhl: ['Maple Leafs', 'Canadiens', 'Senators', 'Oilers', 'Canucks', 'Flames', 'Jets', 'Bruins', 'Rangers', 'Panthers', 'Lightning', 'Stars'],
  mlb: ['Blue Jays', 'Yankees', 'Dodgers', 'Phillies', 'Mariners', 'Guardians'],
  epl: ['Arsenal', 'Liverpool', 'Man City', 'Chelsea', 'Spurs', 'Newcastle'],
  laliga: ['Real Madrid', 'Barcelona', 'Atletico', 'Sevilla'],
  mls: ['Toronto FC', 'CF Montreal', 'Whitecaps', 'Inter Miami', 'LAFC', 'Crew'],
  ufc: ['Fighter A', 'Fighter B', 'Fighter C', 'Fighter D'],
};

const SPORT_PARAMS: Record<string, { sd: number; total: number; totSd: number; spreadStep: number }> = {
  football: { sd: 13.5, total: 46, totSd: 10, spreadStep: 0.5 },
  basketball: { sd: 12, total: 224, totSd: 14, spreadStep: 0.5 },
  hockey: { sd: 2.2, total: 6, totSd: 2.1, spreadStep: 1 },
  baseball: { sd: 4, total: 8.5, totSd: 3.2, spreadStep: 1 },
  soccer: { sd: 1.7, total: 2.6, totSd: 1.5, spreadStep: 0.5 },
  mma: { sd: 1, total: 2.5, totSd: 1.2, spreadStep: 0.5 },
};

const PROPS: Record<string, { mean: number; sd: number }> = {
  p_points: { mean: 22, sd: 6 }, p_rebounds: { mean: 8, sd: 3 }, p_assists: { mean: 6, sd: 2.5 },
  p_pass_yds: { mean: 245, sd: 45 }, p_rush_yds: { mean: 62, sd: 22 }, p_rec_yds: { mean: 58, sd: 22 },
  p_shots: { mean: 3, sd: 1.4 }, p_hits: { mean: 1.1, sd: 0.8 }, p_ks: { mean: 6, sd: 2 },
};

const FIRST = ['J.', 'M.', 'A.', 'D.', 'T.', 'K.', 'S.', 'L.'];
const LAST = ['Carter', 'Nguyen', 'Brooks', 'Silva', 'Okafor', 'Lindqvist', 'Moreau', 'Patel', 'Hughes', 'Reyes'];

function phi(x: number) { // standard normal CDF
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const roundTo = (x: number, step: number) => Math.round(x / step) * step;

interface SimEvent extends GameEvent {
  mu: number; sd: number; total: number; totSd: number; step: number;
  players: Record<string, { name: string; mean: number; sd: number }[]>;
  vol: number;
}

interface BookState { vig: number; lag: number; bias: number }

export class Simulator {
  events: SimEvent[] = [];
  private books: Record<string, BookState> = {};
  private quotes = new Map<string, Quote>();
  private seq = 0;

  constructor() {
    for (const b of BOOKS) {
      this.books[b.id] = {
        vig: b.sharp ? 0.025 : rnd(0.04, 0.065),
        lag: b.sharp ? 0.9 : rnd(0.12, 0.45),   // probability of re-pricing on a given tick
        bias: rnd(-0.015, 0.015),
      };
    }
    this.seedEvents();
  }

  private seedEvents() {
    const now = Date.now();
    let id = 0;
    for (const lg of LEAGUES) {
      const teams = [...TEAMS[lg.id]].sort(() => Math.random() - 0.5);
      const p = SPORT_PARAMS[lg.sport];
      for (let i = 0; i + 1 < teams.length && i < 8; i += 2) {
        const live = Math.random() < 0.4;
        const hoursOut = rnd(1, 30);
        const ev: SimEvent = {
          id: `ev${++id}`, league: lg.id, sport: lg.sport,
          home: teams[i], away: teams[i + 1],
          startTime: live ? now - rnd(10, 100) * 60_000 : roundTo(now + hoursOut * 3_600_000, 900_000),
          live,
          clock: live ? liveClock(lg.sport) : undefined,
          mu: rnd(-1, 1) * p.sd * 0.5, sd: p.sd, total: p.total * rnd(0.9, 1.1), totSd: p.totSd, step: p.spreadStep,
          players: {}, vol: live ? 1 : 0.15,
        };
        for (const mk of lg.markets.filter(m => m.startsWith('p_'))) {
          const base = PROPS[mk];
          ev.players[mk] = [0, 1].map(() => ({
            name: `${pick(FIRST)} ${pick(LAST)}`, mean: base.mean * rnd(0.75, 1.25), sd: base.sd,
          }));
        }
        this.events.push(ev);
      }
    }
  }

  /** Advance the world one tick and return the delta (or a full snapshot on first call). */
  tick(): FeedMessage {
    const first = this.seq === 0;
    this.seq++;
    for (const ev of this.events) {
      ev.mu += (Math.random() - 0.5) * ev.sd * 0.06 * ev.vol;
      ev.total += (Math.random() - 0.5) * ev.totSd * 0.05 * ev.vol;
      for (const ps of Object.values(ev.players)) for (const pl of ps) pl.mean += (Math.random() - 0.5) * pl.sd * 0.05 * ev.vol;
      if (ev.live && Math.random() < 0.05) ev.clock = liveClock(ev.sport);
    }
    const upserts: Quote[] = [];
    const now = Date.now();
    for (const ev of this.events) {
      const lg = LEAGUES.find(l => l.id === ev.league)!;
      for (const b of BOOKS) {
        const st = this.books[b.id];
        if (!first && Math.random() > st.lag * (ev.live ? 1 : 0.4)) continue; // this book hasn't re-priced
        for (const mk of lg.markets) {
          for (const q of this.price(ev, mk, b.id, st, now)) {
            const prev = this.quotes.get(q.id);
            if (prev && prev.price === q.price) continue;
            this.quotes.set(q.id, q);
            upserts.push(q);
          }
        }
      }
    }
    const msg: FeedMessage = first
      ? { type: 'snapshot', seq: this.seq, ts: now, events: this.events.map(stripSim), upserts }
      : { type: 'delta', seq: this.seq, ts: now, upserts, events: this.events.filter(e => e.live).map(stripSim) };
    return msg;
  }

  snapshot(): FeedMessage {
    return { type: 'snapshot', seq: this.seq, ts: Date.now(), events: this.events.map(stripSim), upserts: [...this.quotes.values()] };
  }

  private price(ev: SimEvent, mk: string, book: string, st: BookState, now: number): Quote[] {
    const m = marketByKey(mk);
    const out: Quote[] = [];
    const noise = () => st.bias + (Math.random() - 0.5) * 0.02;
    const mkq = (side: string, p: number, line?: number, player?: string, isAlt?: boolean): Quote => {
      const pr = Math.min(0.97, Math.max(0.03, p + noise()));
      const price = Math.max(1.01, Math.round((1 / (pr * (1 + st.vig))) * 100) / 100);
      return {
        id: `${ev.id}|${mk}|${player ?? ''}|${line ?? ''}|${side}|${book}`,
        eventId: ev.id, book, market: mk, player, side, line, price, isAlt, updatedAt: now,
      };
    };
    const scale = mk.startsWith('h1') || mk.startsWith('f5') ? 0.5 : mk.startsWith('q1') || mk.startsWith('p1') ? 0.25 : 1;
    const mu = ev.mu * scale, sd = ev.sd * Math.sqrt(scale);

    if (m.lined === 'none' && m.sides.length === 2) {
      const pHome = mk === 'btts' ? 0.52 : 1 - phi((0 - mu) / sd);
      out.push(mkq(m.sides[0], pHome), mkq(m.sides[1], 1 - pHome));
    } else if (m.sides.length === 3) {
      const draw = 0.26;
      const pHome = (1 - phi((0 - mu) / sd)) * (1 - draw);
      out.push(mkq('home', pHome), mkq('draw', draw), mkq('away', 1 - draw - pHome));
    } else if (m.lined === 'spread') {
      const main = roundTo(-mu, ev.step) + (Math.random() < 0.25 ? pick([-ev.step, ev.step]) : 0);
      for (const off of [0, -2, -1, 1, 2]) {
        let L = main + off * ev.step * 2;
        if (Number.isInteger(L)) L += 0.5; // half-point lines: no pushes
        const pHome = 1 - phi((-L - mu) / sd);
        out.push(mkq('home', pHome, L, undefined, off !== 0), mkq('away', 1 - pHome, L, undefined, off !== 0));
      }
    } else if (mk.startsWith('p_')) {
      for (const pl of ev.players[mk] ?? []) {
        const main = roundTo(pl.mean, 1) + 0.5 + (Math.random() < 0.25 ? pick([-1, 1]) : 0);
        const pOver = 1 - phi((main - pl.mean) / pl.sd);
        out.push(mkq('over', pOver, main, pl.name), mkq('under', 1 - pOver, main, pl.name));
      }
    } else {
      // totals (game, team, period)
      const tScale = mk.startsWith('tt_') ? 0.5 : scale;
      const mean = ev.total * tScale + (mk === 'tt_home' ? mu / 2 : mk === 'tt_away' ? -mu / 2 : 0);
      const tsd = ev.totSd * Math.sqrt(tScale);
      const step = ev.step;
      const main = roundTo(mean, step) + (step === 1 ? 0.5 : 0) + (Math.random() < 0.25 ? pick([-step, step]) : 0);
      for (const off of [0, -2, -1, 1, 2]) {
        let T = main + off * step * 2;
        if (Number.isInteger(T)) T += 0.5;
        if (T <= 0) continue;
        const pOver = 1 - phi((T - mean) / tsd);
        out.push(mkq('over', pOver, T, undefined, off !== 0), mkq('under', 1 - pOver, T, undefined, off !== 0));
      }
    }
    return out;
  }
}

function liveClock(sport: string) {
  const r = (n: number) => Math.floor(Math.random() * n);
  switch (sport) {
    case 'football': return `Q${1 + r(4)} ${r(15)}:${String(r(60)).padStart(2, '0')}`;
    case 'basketball': return `Q${1 + r(4)} ${r(12)}:${String(r(60)).padStart(2, '0')}`;
    case 'hockey': return `P${1 + r(3)} ${r(20)}:${String(r(60)).padStart(2, '0')}`;
    case 'baseball': return `${pick(['Top', 'Bot'])} ${1 + r(9)}`;
    case 'soccer': return `${r(90)}'`;
    default: return `R${1 + r(3)}`;
  }
}

function stripSim(e: SimEvent): GameEvent {
  const { id, league, sport, home, away, startTime, live, clock } = e;
  return { id, league, sport, home, away, startTime, live, clock };
}
