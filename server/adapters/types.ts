import type { GameEvent, Quote } from '../../shared/types';

/**
 * A source of odds. Adapters push whatever they learn; the Board diffs it and fans it out.
 * `replace` = this batch is the complete current state for the given scope (lets the board
 * remove quotes that a book pulled). Scope is usually `${adapter}:${league}`.
 */
export interface OddsBatch {
  scope: string;
  events: GameEvent[];
  quotes: Quote[];
  replace: boolean;
}

export interface FeedAdapter {
  name: string;
  start(push: (b: OddsBatch) => void): void;
  stop(): void;
  status(): { source: string; healthy: boolean; lastPollMs: number; latencyMs: number; error?: string };
}
