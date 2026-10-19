import type { Book, League, MarketDef } from './types';

// Ontario-licensed sportsbooks. The first seven are the core set.
// URLs are landing pages — confirm each before going live; deep links should come from your odds feed.
export const BOOKS: Book[] = [
  { id: 'fanduel', domain: 'fanduel.com',    name: 'FanDuel',     short: 'FD',  color: '#1493ff', url: 'https://on.sportsbook.fanduel.ca/' },
  { id: 'bet365', domain: 'bet365.com',     name: 'bet365',      short: '365', color: '#126e51', url: 'https://www.on.bet365.ca/' },
  { id: 'pointsbet', domain: 'pointsbet.ca',  name: 'PointsBet',   short: 'PB',  color: '#ed1c24', url: 'https://on.pointsbet.ca/' },
  { id: 'betrivers', domain: 'betrivers.com',  name: 'BetRivers',   short: 'BR',  color: '#f5b335', url: 'https://on.betrivers.ca/' },
  { id: 'draftkings', domain: 'draftkings.com', name: 'DraftKings',  short: 'DK',  color: '#53d337', url: 'https://sportsbook.draftkings.com/' },
  { id: 'betmgm', domain: 'betmgm.com',     name: 'BetMGM',      short: 'MGM', color: '#c5a462', url: 'https://sports.on.betmgm.ca/' },
  { id: 'caesars', domain: 'caesars.com',    name: 'Caesars',     short: 'CZR', color: '#b8975a', url: 'https://sportsbook.caesars.com/ca/on/' },
  // Optional extras (off by default)
  { id: 'thescore', domain: 'thescore.bet',   name: 'theScore Bet', short: 'TS', color: '#1f6feb', url: 'https://thescore.bet/' },
  { id: 'betway', domain: 'betway.com',     name: 'Betway',      short: 'BW',  color: '#8ccf3d', url: 'https://betway.ca/' },
  { id: 'bet99', domain: 'bet99.com',      name: 'BET99',       short: '99',  color: '#e0313b', url: 'https://bet99.com/' },
  { id: 'proline', domain: 'proline.ca',    name: 'PROLINE+',    short: 'PL',  color: '#0a8f4e', url: 'https://proline.ca/' },
  { id: 'northstar', domain: 'northstarbets.ca',  name: 'NorthStar Bets', short: 'NS', color: '#6f7cff', url: 'https://www.northstarbets.ca/' },
  { id: 'pinnacle', domain: 'pinnacle.com',   name: 'Pinnacle',    short: 'PIN', color: '#ff6600', url: 'https://www.pinnacle.ca/', sharp: true },
];

export const DEFAULT_BOOKS = ['fanduel', 'bet365', 'pointsbet', 'betrivers', 'draftkings', 'betmgm', 'caesars'];
export const bookById = (id: string) => BOOKS.find(b => b.id === id);

const two = ['home', 'away'];
const ou = ['over', 'under'];

export const MARKETS: MarketDef[] = [
  { key: 'ml',        label: 'Moneyline',          sides: two, lined: 'none' },
  { key: 'ml3',       label: 'Moneyline (3-way)',  sides: ['home', 'draw', 'away'], lined: 'none' },
  { key: 'spread',    label: 'Spread',             sides: two, lined: 'spread' },
  { key: 'total',     label: 'Total',              sides: ou,  lined: 'total' },
  { key: 'tt_home',   label: 'Home Team Total',    sides: ou,  lined: 'total' },
  { key: 'tt_away',   label: 'Away Team Total',    sides: ou,  lined: 'total' },
  { key: 'h1_ml',     label: '1st Half Moneyline', sides: two, lined: 'none',   risky: true },
  { key: 'h1_spread', label: '1st Half Spread',    sides: two, lined: 'spread', risky: true },
  { key: 'h1_total',  label: '1st Half Total',     sides: ou,  lined: 'total',  risky: true },
  { key: 'q1_spread', label: '1st Quarter Spread', sides: two, lined: 'spread', risky: true },
  { key: 'q1_total',  label: '1st Quarter Total',  sides: ou,  lined: 'total',  risky: true },
  { key: 'p1_total',  label: '1st Period Total',   sides: ou,  lined: 'total',  risky: true },
  { key: 'f5_ml',     label: 'First 5 Moneyline',  sides: two, lined: 'none',   risky: true },
  { key: 'f5_total',  label: 'First 5 Total',      sides: ou,  lined: 'total',  risky: true },
  { key: 'btts',      label: 'Both Teams To Score', sides: ['yes', 'no'], lined: 'none' },
  { key: 'p_points',  label: 'Player Points',      sides: ou, lined: 'total', risky: true },
  { key: 'p_rebounds',label: 'Player Rebounds',    sides: ou, lined: 'total', risky: true },
  { key: 'p_assists', label: 'Player Assists',     sides: ou, lined: 'total', risky: true },
  { key: 'p_pass_yds',label: 'Player Passing Yds', sides: ou, lined: 'total', risky: true },
  { key: 'p_rush_yds',label: 'Player Rushing Yds', sides: ou, lined: 'total', risky: true },
  { key: 'p_rec_yds', label: 'Player Receiving Yds', sides: ou, lined: 'total', risky: true },
  { key: 'p_shots',   label: 'Player Shots on Goal', sides: ou, lined: 'total', risky: true },
  { key: 'p_hits',    label: 'Player Hits',        sides: ou, lined: 'total', risky: true },
  { key: 'p_ks',      label: 'Pitcher Strikeouts', sides: ou, lined: 'total', risky: true },
  { key: 'fight_ml',  label: 'Fight Winner',       sides: two, lined: 'none' },
  { key: 'rounds',    label: 'Total Rounds',       sides: ou, lined: 'total', risky: true },
];
export const marketByKey = (k: string) => MARKETS.find(m => m.key === k)!;

const core = ['ml', 'spread', 'total', 'tt_home', 'tt_away'];
const hoops = [...core, 'h1_ml', 'h1_spread', 'h1_total', 'q1_spread', 'q1_total', 'p_points', 'p_rebounds', 'p_assists'];
const fb = [...core, 'h1_ml', 'h1_spread', 'h1_total', 'q1_spread', 'q1_total', 'p_pass_yds', 'p_rush_yds', 'p_rec_yds'];

export const LEAGUES: League[] = [
  { id: 'nfl',   name: 'NFL',   sport: 'football',   markets: fb },
  { id: 'ncaaf', name: 'NCAAF', sport: 'football',   markets: fb },
  { id: 'cfl',   name: 'CFL',   sport: 'football',   markets: fb },
  { id: 'nba',   name: 'NBA',   sport: 'basketball', markets: hoops },
  { id: 'ncaab', name: 'NCAAB', sport: 'basketball', markets: hoops },
  { id: 'wnba',  name: 'WNBA',  sport: 'basketball', markets: hoops },
  { id: 'nhl',   name: 'NHL',   sport: 'hockey',     markets: [...core, 'p1_total', 'p_shots'] },
  { id: 'mlb',   name: 'MLB',   sport: 'baseball',   markets: [...core, 'f5_ml', 'f5_total', 'p_hits', 'p_ks'] },
  { id: 'epl',   name: 'English Premier League', sport: 'soccer', markets: ['ml3', 'spread', 'total', 'btts', 'h1_total'] },
  { id: 'laliga',name: 'La Liga', sport: 'soccer',   markets: ['ml3', 'spread', 'total', 'btts', 'h1_total'] },
  { id: 'mls',   name: 'MLS',   sport: 'soccer',     markets: ['ml3', 'spread', 'total', 'btts', 'h1_total'] },
  { id: 'ufc',   name: 'UFC',   sport: 'mma',        markets: ['fight_ml', 'rounds'] },
];
export const leagueById = (id: string) => LEAGUES.find(l => l.id === id)!;
