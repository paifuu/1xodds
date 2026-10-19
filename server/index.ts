import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Board } from './board';
import type { FeedAdapter } from './adapters/types';
import { SimulatedAdapter } from './adapters/simulated';
import { SportsGameOddsAdapter } from './adapters/sportsGameOdds';

const PORT = Number(process.env.PORT ?? 8787);
const FLUSH_MS = Number(process.env.FLUSH_MS ?? 250);          // how often price changes are pushed to browsers
const LIVE_POLL_MS = Number(process.env.LIVE_POLL_MS ?? 1000);
const PREGAME_POLL_MS = Number(process.env.PREGAME_POLL_MS ?? 10000);

const board = new Board();
const adapters: FeedAdapter[] = [];

if (process.env.SGO_API_KEY) {
  const leagues = process.env.SGO_LEAGUES?.split(',').map(s => s.trim()).filter(Boolean);
  adapters.push(new SportsGameOddsAdapter(process.env.SGO_API_KEY, leagues, LIVE_POLL_MS, PREGAME_POLL_MS, undefined, process.env.SGO_LIVE !== '0'));
}
if (!adapters.length || process.env.ENABLE_SIMULATOR === '1') adapters.push(new SimulatedAdapter(Number(process.env.SIM_TICK_MS ?? 500)));

for (const a of adapters) {
  console.log(`[1xOdds] feed: ${a.name}`);
  a.start(b => board.ingest(b));
}

// ---------- HTTP (status + static web build in production) ----------
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../web/dist');
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  if (req.url === '/api/status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ seq: board.seq, events: board.events.size, quotes: board.quotes.size, clients: wss.clients.size, feeds: adapters.map(a => a.status()) }));
    return;
  }
  const file = path.join(dist, req.url === '/' || !req.url ? 'index.html' : path.normalize(req.url.split('?')[0]));
  if (!file.startsWith(dist) || !fs.existsSync(file)) { res.writeHead(404); res.end('Not found (run `npm run build` for the web UI, or use `npm run dev`)'); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// ---------- WebSocket fan-out ----------
const wss = new WebSocketServer({ server, path: '/feed', perMessageDeflate: { threshold: 2048 } });
wss.on('connection', ws => {
  ws.send(JSON.stringify(board.snapshot()));
});

setInterval(() => {
  const delta = board.flush();
  if (!delta) return;
  delta.status = adapters.map(a => a.status());
  const data = JSON.stringify(delta);
  for (const c of wss.clients) {
    if (c.readyState !== WebSocket.OPEN) continue;
    if (c.bufferedAmount > 8 * 1024 * 1024) { c.send(JSON.stringify(board.snapshot())); continue; } // slow client: resync
    c.send(data);
  }
}, FLUSH_MS);

// heartbeat: keeps the status pill honest even when the feed sends nothing
setInterval(() => {
  const data = JSON.stringify({ type: 'status', seq: board.seq, ts: Date.now(), status: adapters.map(a => a.status()) });
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(data);
}, 3000);

setInterval(() => board.prune(), 60_000);

server.listen(PORT, () => console.log(`[1xOdds] listening on http://localhost:${PORT}  (ws: /feed)`));
process.on('SIGINT', () => { adapters.forEach(a => a.stop()); process.exit(0); });
