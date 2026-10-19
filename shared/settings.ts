import type { Settings } from './types';
import { DEFAULT_BOOKS, LEAGUES } from './catalog';

export function defaultSettings(): Settings {
  const markets: Record<string, string[]> = {};
  for (const l of LEAGUES) markets[l.id] = [...l.markets];
  return {
    books: [...DEFAULT_BOOKS],
    requiredBooks: [],
    perBook: {},
    markets,
    stakeAmount: 100,
    stakeMode: 'ratio',
    arbMinLiquidity: 0,
    evMinLiquidity: 1000,
    minArb: 0.5,
    minMiddle: -3,
    sort: 'staying',
    sortMinProfit: 0,
    sortMinRoi: 1,
    minRefreshes: 3,
    showEv: true,
    riskyEnabled: true,
    riskyMinRoi: 4,
    middlesEnabled: true,
    minMiddleSize: 0.5,
    minMiddleRoi: 0,
    evMethod: 'consensus',
    sharpBooks: ['pinnacle'],
    refreshMs: 1000,
    showMainWithAlt: true,
    alertsOn: false,
    arbAlerts: true, arbSoft: 2, arbLoud: 5,
    evAlerts: true, evSoft: 5, evLoud: 10,
    showComparable: true,
    arbPopup: true,
    openMode: 'popup',
    linkMode: 'auto',
    popupW: 1000, popupH: 700,
    desktopAlways: false,
    mode: 'live',
  };
}

export interface Preset {
  id: string;
  name: string;
  tagline: string;
  description: string;
  patch: Partial<Settings>;
}

/** Starter strategies: only touch strategy fields, never books/stakes/layout. */
export const STARTER_PRESETS: Preset[] = [
  {
    id: 'everything', name: 'Everything', tagline: 'Whole board',
    description: 'No floors, every market, middles on, sorted by ROI. Apply to undo any other preset.',
    patch: { minArb: 0, sortMinRoi: 0, riskyEnabled: true, riskyMinRoi: 0, middlesEnabled: true, sort: 'roi', minRefreshes: 0 },
  },
  {
    id: 'noprops', name: 'No props', tagline: 'Game lines only',
    description: 'Hides player props, quarters, halves and other risky markets. Moneylines, spreads and totals stay.',
    patch: { minArb: 0, sortMinRoi: 0, riskyEnabled: false, middlesEnabled: true, sort: 'roi', minRefreshes: 0 },
  },
  {
    id: 'stable', name: 'Safe & stable', tagline: 'Fewer, cleaner arbs',
    description: '2% floor, 8% on risky markets, sorted by staying power so you have time to place both legs.',
    patch: { minArb: 2, sortMinRoi: 2, riskyEnabled: true, riskyMinRoi: 8, middlesEnabled: true, sort: 'staying', minRefreshes: 3 },
  },
  {
    id: 'protect', name: 'Protect my accounts', tagline: 'Longevity first',
    description: '4% floor, 15% on risky markets, no middles, most stable arbs first. Keeps accounts healthy longer.',
    patch: { minArb: 4, sortMinRoi: 4, riskyEnabled: true, riskyMinRoi: 15, middlesEnabled: false, sort: 'staying', minRefreshes: 5 },
  },
];
