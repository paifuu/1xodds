import { useCallback, useEffect, useState } from 'react';
import type { Opportunity, Settings } from '../../shared/types';
import { defaultSettings } from '../../shared/settings';

export function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; }
  catch { return fallback; }
}
export function loadArr<T>(key: string): T[] {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
export function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => load('1x.settings', defaultSettings()));
  useEffect(() => save('1x.settings', settings), [settings]);
  const patch = useCallback((p: Partial<Settings>) => setSettings(s => ({ ...s, ...p })), []);
  return { settings, setSettings, patch };
}

export interface SavedPreset { id: string; name: string; settings: Settings; savedAt: number }

export interface PlanLeg { book: string; label: string; price: number; stake: number; placed: boolean }
export interface PlanItem {
  id: string; title: string; market: string; roi: number; profit: number; total: number;
  kind: 'arb' | 'middle'; addedAt: number; legs: PlanLeg[];
}

export function useList<T extends { id: string }>(key: string) {
  const [items, setItems] = useState<T[]>(() => loadArr<T>(key));
  useEffect(() => save(key, items), [key, items]);
  return [items, setItems] as const;
}

export function planFromOpp(o: Opportunity, legLabel: (o: Opportunity, i: number) => string): PlanItem {
  return {
    id: `${o.key}@${Date.now()}`,
    title: `${o.event.away} @ ${o.event.home}`,
    market: o.market.label + (o.player ? ` · ${o.player}` : ''),
    roi: o.roi, profit: o.profit, total: o.totalStake, kind: o.kind, addedAt: Date.now(),
    legs: o.legs.map((l, i) => ({ book: l.quote.book, label: legLabel(o, i), price: l.quote.price, stake: l.stake, placed: false })),
  };
}
