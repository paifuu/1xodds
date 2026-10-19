import { Simulator } from '../../shared/simulator';
import type { FeedAdapter, OddsBatch } from './types';

/** Demo feed — realistic drifting lines across all 13 books. Used when no API key is configured. */
export class SimulatedAdapter implements FeedAdapter {
  name = 'simulated';
  private sim = new Simulator();
  private timer?: NodeJS.Timeout;
  private last = 0;
  constructor(private intervalMs = 500) {}

  start(push: (b: OddsBatch) => void) {
    const run = () => {
      const t = Date.now();
      const msg = this.sim.tick();
      push({ scope: 'sim', events: msg.events ?? [], quotes: msg.upserts ?? [], replace: false });
      this.last = Date.now() - t;
    };
    run();
    this.timer = setInterval(run, this.intervalMs);
  }
  stop() { clearInterval(this.timer); }
  status() { return { source: this.name, healthy: true, lastPollMs: this.intervalMs, latencyMs: this.last }; }
}
