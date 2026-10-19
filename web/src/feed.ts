import type { FeedMessage } from '../../shared/types';
import { Simulator } from '../../shared/simulator';



export type FeedState =
  | { kind: 'connecting' }
  | { kind: 'server'; latencyMs: number; feeds: string[]; error?: string }
  | { kind: 'demo' }
  | { kind: 'down'; reason: string };

/**
 * Connects to the 1xOdds server over WebSocket. If there is no server (static demo build,
 * or the server isn't running) it falls back to the in-browser simulator so the UI still works.
 */
export function connectFeed(
  onMsg: (m: FeedMessage) => void,
  onState: (s: FeedState) => void,
  demoTickMs: () => number,
) {
  let ws: WebSocket | null = null;
  let stopped = false;
  let demoTimer: number | undefined;
  let gotData = false;

  const startDemo = () => {
    if (demoTimer !== undefined || stopped) return;
    onState({ kind: 'demo' });
    const sim = new Simulator();
    const loop = () => {
      if (stopped) return;
      onMsg(sim.tick());
      demoTimer = window.setTimeout(loop, demoTickMs());
    };
    loop();
  };

  if (__DEMO_ONLY__ || typeof WebSocket === 'undefined') { startDemo(); }
  else {
    const open = () => {
      onState({ kind: 'connecting' });
      try {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${proto}://${location.host}/feed`);
      } catch { startDemo(); return; }
      const fallback = window.setTimeout(() => { if (!gotData) { ws?.close(); startDemo(); } }, 2500);
      ws.onmessage = ev => {
        gotData = true;
        window.clearTimeout(fallback);
        const m = JSON.parse(ev.data) as FeedMessage;
        if (m.status) onState({ kind: 'server', latencyMs: Math.max(0, ...m.status.map(s => s.latencyMs)), feeds: m.status.map(s => s.source), error: m.status.find(s => s.error)?.error });
        else if (m.type === 'snapshot') onState({ kind: 'server', latencyMs: 0, feeds: [] });
        if (m.type !== 'status') onMsg(m);
      };
      ws.onclose = () => {
        if (stopped || demoTimer !== undefined) return;
        if (gotData) { onState({ kind: 'down', reason: 'Reconnecting…' }); window.setTimeout(open, 1500); }
        else { window.clearTimeout(fallback); startDemo(); }
      };
    };
    open();
  }

  return () => { stopped = true; ws?.close(); if (demoTimer) clearTimeout(demoTimer); };
}
