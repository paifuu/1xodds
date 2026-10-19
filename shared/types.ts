// Core domain types shared by the server (ingestion) and the web client (engine + UI).

export type BookId = string;
export type Mode = 'live' | 'pregame';
export type Sport = 'football' | 'basketball' | 'baseball' | 'hockey' | 'soccer' | 'mma';

export interface Book {
  id: BookId;
  name: string;
  short: string;     // 2-3 letter badge
  color: string;     // badge colour
  url: string;       // landing page (verify before production use)
  domain: string;    // used to load the book's own app icon
  logo?: string;     // optional: your own licensed logo file, e.g. '/logos/fanduel.png' (put it in web/public/logos)
  sharp?: boolean;   // eligible as a sharp reference for EV
  reportsLiquidity?: boolean;
}

export interface League {
  id: string;
  name: string;
  sport: Sport;
  markets: string[]; // market keys available for this league
}

export interface MarketDef {
  key: string;
  label: string;
  sides: string[];             // outcome keys, e.g. ['home','away'] or ['over','under'] or ['home','draw','away']
  lined: 'none' | 'spread' | 'total'; // how the line is interpreted for middles
  risky?: boolean;             // props, periods: move faster / settle less predictably
}

export interface GameEvent {
  id: string;
  league: string;
  sport: Sport;
  home: string;
  away: string;
  startTime: number; // epoch ms
  live: boolean;
  clock?: string;    // e.g. "Q3 4:12"
}

/**
 * One price from one book for one outcome.
 * `line` is canonical so both sides of a market share it:
 *  - spread: the HOME handicap (home -3.5 and away +3.5 both carry line = -3.5)
 *  - total / props: the threshold (over 220.5 and under 220.5 both carry 220.5)
 */
export interface Quote {
  id: string;          // unique: event|market|player|line|side|book
  eventId: string;
  book: BookId;
  market: string;      // MarketDef.key
  player?: string;     // for player props
  side: string;
  line?: number;
  price: number;       // decimal odds
  isAlt?: boolean;     // alternate line (vs main)
  liquidity?: number;  // $ available, if the book reports it
  link?: string;       // deep link to betslip if the feed provides one
  updatedAt: number;
}

export interface FeedMessage {
  type: 'snapshot' | 'delta' | 'status';
  seq: number;
  ts: number;
  events?: GameEvent[];
  upserts?: Quote[];
  removes?: string[];
  status?: { source: string; healthy: boolean; lastPollMs: number; latencyMs: number; error?: string }[];
}

export interface Leg {
  quote: Quote;
  stake: number;
  payout: number;
  ev?: number; // EV % of this leg vs fair price
}

export type OppKind = 'arb' | 'middle';

export interface Opportunity {
  key: string;          // stable identity across refreshes
  kind: OppKind;
  event: GameEvent;
  market: MarketDef;
  player?: string;
  line?: number;
  legs: Leg[];
  roi: number;          // %, guaranteed (arb) or worst case (middle)
  profit: number;       // $ at current stakes, worst case
  totalStake: number;
  middleSize?: number;  // points
  middleRoi?: number;   // % if the middle hits
  risky: boolean;
  // staying power
  firstSeen: number;
  refreshes: number;    // number of feed refreshes this opportunity has survived
  peakRoi: number;
  minRoiSeen: number;
}

export interface EvBet {
  key: string;
  event: GameEvent;
  market: MarketDef;
  player?: string;
  line?: number;
  quote: Quote;
  fairProb: number;
  fairPrice: number;
  ev: number;          // %
  kelly: number;       // fraction
  refreshes: number;
  firstSeen: number;
  risky: boolean;
}

export type SortKey = 'profit' | 'roi' | 'staying';
export type StakeMode = 'ratio' | 'fixed';

export interface PerBookSetting {
  stake?: number;
  disabledLeagues: string[];
  mainLineOnly: boolean;
}

export interface Settings {
  books: BookId[];
  requiredBooks: BookId[];
  perBook: Record<BookId, PerBookSetting>;
  markets: Record<string, string[]>; // leagueId -> enabled market keys
  stakeAmount: number;
  stakeMode: StakeMode;
  arbMinLiquidity: number;
  evMinLiquidity: number;
  minArb: number;            // % (toolbar)
  minMiddle: number;         // % worst case (toolbar)
  sort: SortKey;
  sortMinProfit: number;     // $ when sort=profit
  sortMinRoi: number;        // % when sort=roi or staying
  minRefreshes: number;      // when sort=staying
  showEv: boolean;
  riskyEnabled: boolean;     // false = hide risky markets entirely
  riskyMinRoi: number;
  middlesEnabled: boolean;
  minMiddleSize: number;
  minMiddleRoi: number;      // % if-hit ROI floor
  evMethod: 'consensus' | 'sharp';
  sharpBooks: BookId[];
  refreshMs: number;
  showMainWithAlt: boolean;
  alertsOn: boolean;
  arbAlerts: boolean; arbSoft: number; arbLoud: number;
  evAlerts: boolean; evSoft: number; evLoud: number;
  showComparable: boolean;
  arbPopup: boolean;
  openMode: 'popup' | 'tab';
  linkMode: 'auto' | 'desktop' | 'mobile';
  popupW: number; popupH: number;
  desktopAlways: boolean;
  mode: Mode;
}
