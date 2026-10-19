import type { GameEvent, Quote, Sport } from '../../shared/types';
import { fromAmerican } from '../../shared/odds';
import type { FeedAdapter, OddsBatch } from './types';

/**
 * SportsGameOdds v2 adapter (licensed feed — no scraping, no account risk).
 * Docs: https://sportsgameodds.com/docs   oddID = {statID}-{statEntityID}-{periodID}-{betTypeID}-{sideID}
 *
 * Field names below follow the published docs; anything marked VERIFY should be checked against
 * a real response from your plan before going live (run `npm run probe:sgo`).
 *
 * Speed: each league is polled on its own loop with an in-flight guard, live leagues fastest.
 * If your plan includes their realtime stream, swap `poll()` for the stream and keep `toBatch()`.
 */

const LEAGUE_MAP: Record<string, { id: string; sport: Sport }> = {
  NFL: { id: 'nfl', sport: 'football' }, NCAAF: { id: 'ncaaf', sport: 'football' }, CFL: { id: 'cfl', sport: 'football' },
  NBA: { id: 'nba', sport: 'basketball' }, NCAAB: { id: 'ncaab', sport: 'basketball' }, WNBA: { id: 'wnba', sport: 'basketball' },
  NHL: { id: 'nhl', sport: 'hockey' }, MLB: { id: 'mlb', sport: 'baseball' },
  EPL: { id: 'epl', sport: 'soccer' }, LA_LIGA: { id: 'laliga', sport: 'soccer' }, MLS: { id: 'mls', sport: 'soccer' },
  UFC: { id: 'ufc', sport: 'mma' },
};

// Our book ids -> SGO bookmakerIDs (VERIFY: /v2/bookmakers lists exact ids on your plan)
const BOOK_MAP: Record<string, string> = {
  fanduel: 'fanduel', bet365: 'bet365', pointsbet: 'pointsbet', betrivers: 'betrivers',
  draftkings: 'draftkings', betmgm: 'betmgm', caesars: 'caesars', thescore: 'thescorebet',
  betway: 'betway', pinnacle: 'pinnacle',
};
const SGO_TO_OURS = Object.fromEntries(Object.entries(BOOK_MAP).map(([a, b]) => [b, a]));

const PERIOD_PREFIX: Record<string, string> = { game: '', '1h': 'h1_', '1q': 'q1_', '1p': 'p1_', '1i-5i': 'f5_' };
const PROP_STATS: Record<string, string> = {
  points: 'p_points', rebounds: 'p_rebounds', assists: 'p_assists',
  passing_yards: 'p_pass_yds', rushing_yards: 'p_rush_yds', receiving_yards: 'p_rec_yds',
  shots_onGoal: 'p_shots', batting_hits: 'p_hits', pitching_strikeouts: 'p_ks',
};

function mapMarket(statID: string, entity: string, period: string, betType: string): string | null {
  const pre = PERIOD_PREFIX[period];
  if (pre === undefined) return null;
  const team = entity === 'home' || entity === 'away' || entity === 'all';
  if (!team) return pre === '' && betType === 'ou' ? PROP_STATS[statID] ?? null : null;
  if (statID !== 'points' && statID !== 'goals' && statID !== 'runs') return null;
  if (betType === 'ml') return pre === '' ? 'ml' : `${pre}ml`;
  if (betType === 'ml3way') return pre === '' ? 'ml3' : null;
  if (betType === 'sp') return pre === '' ? 'spread' : `${pre}spread`;
  if (betType === 'ou') {
    if (entity === 'all') return pre === '' ? 'total' : `${pre}total`;
    return pre === '' ? `tt_${entity}` : null;
  }
  return null;
}

export class SportsGameOddsAdapter implements FeedAdapter {
  name = 'sportsgameodds';
  private timers: NodeJS.Timeout[] = [];
  private stopped = false;
  private lastOk = 0;
  private latency = 0;
  private errors = 0;
  private lastError = '';
  private eventsSeen = 0;

  constructor(
    private apiKey: string,
    private leagues = Object.keys(LEAGUE_MAP),
    private liveMs = 1000,
    private pregameMs = 10_000,
    private books = Object.keys(BOOK_MAP),
    private includeLive = true,
  ) {}
  private retryUntil = 0;

  start(push: (b: OddsBatch) => void) {
    for (const lg of this.leagues) {
      for (const live of this.includeLive ? [true, false] : [false]) {
        const loop = async () => {
          if (this.stopped) return;
          if (Date.now() < this.retryUntil) { this.timers.push(setTimeout(loop, this.retryUntil - Date.now() + 100)); return; }
          const t = Date.now();
          try {
            const data = await this.poll(lg, live);
            const batch = this.toBatch(lg, live, data);
            push(batch);
            if (!this.lastOk) console.log(`[sgo] first response OK (${lg} ${live ? 'live' : 'pre-game'}: ${batch.events.length} games, ${batch.quotes.length} prices)`);
            this.eventsSeen = Math.max(this.eventsSeen, batch.events.length);
            this.lastOk = Date.now(); this.latency = Date.now() - t; this.errors = 0;
          } catch (err) {
            this.errors++;
            this.lastError = `${lg}: ${(err as Error).message}`;
            console.warn(`[sgo] ${lg} ${live ? 'live' : 'pre'}: ${(err as Error).message}`);
          }
          // back off on errors (rate limits), otherwise go again as soon as the interval allows
          const base = live ? this.liveMs : this.pregameMs;
          const wait = Math.max(0, base - (Date.now() - t)) * (this.errors ? Math.min(8, 2 ** this.errors) : 1);
          this.timers.push(setTimeout(loop, wait));
        };
        loop();
      }
    }
  }

  stop() { this.stopped = true; this.timers.forEach(clearTimeout); }

  status() {
    return {
      source: this.name, healthy: Date.now() - this.lastOk < 30_000, lastPollMs: this.liveMs, latencyMs: this.latency,
      error: Date.now() - this.lastOk < 30_000 ? undefined : this.lastError || 'Waiting for first response…',
    };
  }

  private async poll(league: string, live: boolean): Promise<any[]> {
    const out: any[] = [];
    let cursor: string | undefined;
    do {
      const u = new URL('https://api.sportsgameodds.com/v2/events');
      u.searchParams.set('apiKey', this.apiKey);
      u.searchParams.set('leagueID', league);
      u.searchParams.set('oddsAvailable', 'true');
      u.searchParams.set('includeAltLines', 'true');
      // No bookmakerID filter: one unrecognised id can reject the whole request. Unmapped books are ignored in toBatch.
      if (live) u.searchParams.set('live', 'true');
      else { u.searchParams.set('started', 'false'); u.searchParams.set('startsBefore', new Date(Date.now() + 3 * 86_400_000).toISOString()); }
      u.searchParams.set('limit', '50');
      if (cursor) u.searchParams.set('cursor', cursor);
      const res = await fetch(u);
      if (res.status === 429) {
        const after = Number(res.headers.get('retry-after')) || 60;
        this.retryUntil = Date.now() + after * 1000; // pause every league, not just this one
      }
      if (!res.ok) {
        const text = (await res.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ');
        throw new Error(`HTTP ${res.status}${res.status === 401 || res.status === 403 ? ' (key rejected or plan does not include this)' : res.status === 429 ? ' (rate limited, pausing; your plan allows fewer requests)' : ''} ${text}`);
      }
      const body: any = await res.json();
      if (body.success === false) throw new Error(body.error ?? 'request failed');
      out.push(...(body.data ?? []));
      cursor = body.nextCursor;
    } while (cursor && out.length < 500);
    return out;
  }

  private toBatch(league: string, live: boolean, data: any[]): OddsBatch {
    const lg = LEAGUE_MAP[league];
    const events: GameEvent[] = [];
    const quotes: Quote[] = [];
    for (const e of data) {
      const id = `sgo:${e.eventID}`;
      events.push({
        id, league: lg.id, sport: lg.sport, live,
        home: e.teams?.home?.names?.long ?? e.teams?.home?.names?.medium ?? 'Home', // VERIFY
        away: e.teams?.away?.names?.long ?? e.teams?.away?.names?.medium ?? 'Away',
        startTime: Date.parse(e.status?.startsAt ?? '') || Date.now(),
        clock: e.status?.displayShort,
      });
      for (const o of Object.values<any>(e.odds ?? {})) {
        const market = mapMarket(o.statID, o.statEntityID, o.periodID, o.betTypeID);
        if (!market) continue;
        const player = market.startsWith('p_') ? (e.players?.[o.statEntityID]?.name ?? o.statEntityID) : undefined;
        for (const [bk, v] of Object.entries<any>(o.byBookmaker ?? {})) {
          const book = SGO_TO_OURS[bk];
          if (!book || v.available === false) continue;
          const american = Number(v.odds);
          if (!Number.isFinite(american) || american === 0) continue;
          let line: number | undefined;
          if (o.betTypeID === 'ou') line = Number(v.overUnder ?? o.bookOverUnder);
          if (o.betTypeID === 'sp') {
            const sp = Number(v.spread ?? o.bookSpread);
            line = o.sideID === 'home' ? sp : -sp; // canonical = home handicap
          }
          if (line !== undefined && !Number.isFinite(line)) continue;
          const side = o.sideID === 'over' || o.sideID === 'under' || o.sideID === 'draw' ? o.sideID : o.sideID === 'home' ? 'home' : 'away';
          quotes.push({
            id: `${id}|${market}|${player ?? ''}|${line ?? ''}|${side}|${book}`,
            eventId: id, book, market, player, side, line,
            price: Math.round(fromAmerican(american) * 1000) / 1000,
            isAlt: v.isMainLine === false, // VERIFY: alt-line flag name
            link: v.deeplink,
            updatedAt: Date.parse(v.lastUpdatedAt ?? '') || Date.now(),
          });
        }
      }
    }
    return { scope: `sgo:${league}:${live ? 'live' : 'pre'}`, events, quotes, replace: true };
  }
}
