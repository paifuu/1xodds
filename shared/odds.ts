export const toAmerican = (d: number) =>
  d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));

export const fromAmerican = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / -a);

export const fmtAmerican = (d: number) => {
  const a = toAmerican(d);
  return a > 0 ? `+${a}` : `${a}`;
};

/** Accepts "+150", "-110", "2.5" → decimal odds, or NaN */
export const parseOdds = (s: string): number => {
  const t = s.trim();
  if (!t) return NaN;
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  if (/^[+-]/.test(t) || Math.abs(n) >= 100) return Math.abs(n) >= 100 ? fromAmerican(n) : NaN;
  return n > 1 ? n : NaN;
};

export const impliedProb = (d: number) => 1 / d;

/** Stakes that equalise payout across legs for a given total stake. */
export function balanceStakes(prices: number[], total: number) {
  const inv = prices.map(p => 1 / p);
  const sum = inv.reduce((a, b) => a + b, 0);
  return inv.map(i => (total * i) / sum);
}
