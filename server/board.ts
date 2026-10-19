import type { FeedMessage, GameEvent, Quote } from '../shared/types';
import type { OddsBatch } from './adapters/types';

/**
 * The server-side odds board. Adapters write batches into it; it coalesces changes and
 * emits one compact delta per flush so clients get every price move with minimal bandwidth.
 */
export class Board {
  events = new Map<string, GameEvent>();
  quotes = new Map<string, Quote>();
  private scopeQuotes = new Map<string, Set<string>>();
  private pendingUp = new Map<string, Quote>();
  private pendingRm = new Set<string>();
  private pendingEv = new Map<string, GameEvent>();
  seq = 0;

  ingest(b: OddsBatch) {
    for (const e of b.events) {
      const prev = this.events.get(e.id);
      if (!prev || prev.live !== e.live || prev.clock !== e.clock || prev.startTime !== e.startTime) this.pendingEv.set(e.id, e);
      this.events.set(e.id, e);
    }
    const ids = new Set<string>();
    for (const q of b.quotes) {
      ids.add(q.id);
      const prev = this.quotes.get(q.id);
      if (prev && prev.price === q.price && prev.line === q.line && prev.liquidity === q.liquidity) continue;
      this.quotes.set(q.id, q);
      this.pendingUp.set(q.id, q);
      this.pendingRm.delete(q.id);
    }
    if (b.replace) {
      for (const id of this.scopeQuotes.get(b.scope) ?? []) {
        if (!ids.has(id)) { this.quotes.delete(id); this.pendingUp.delete(id); this.pendingRm.add(id); }
      }
      this.scopeQuotes.set(b.scope, ids);
    } else {
      const set = this.scopeQuotes.get(b.scope) ?? new Set();
      ids.forEach(i => set.add(i));
      this.scopeQuotes.set(b.scope, set);
    }
  }

  /** Returns a delta if anything changed since the last flush. Each flush is one "refresh". */
  flush(): FeedMessage | null {
    if (!this.pendingUp.size && !this.pendingRm.size && !this.pendingEv.size) return null;
    this.seq++;
    const msg: FeedMessage = {
      type: 'delta', seq: this.seq, ts: Date.now(),
      events: [...this.pendingEv.values()], upserts: [...this.pendingUp.values()], removes: [...this.pendingRm],
    };
    this.pendingUp.clear(); this.pendingRm.clear(); this.pendingEv.clear();
    return msg;
  }

  snapshot(): FeedMessage {
    return { type: 'snapshot', seq: this.seq, ts: Date.now(), events: [...this.events.values()], upserts: [...this.quotes.values()] };
  }

  /** Drop events that started long ago and quotes for them. */
  prune(now = Date.now()) {
    for (const [id, e] of this.events) {
      if (now - e.startTime > 6 * 3_600_000) {
        this.events.delete(id);
        for (const [qid, q] of this.quotes) if (q.eventId === id) { this.quotes.delete(qid); this.pendingRm.add(qid); }
      }
    }
  }
}
