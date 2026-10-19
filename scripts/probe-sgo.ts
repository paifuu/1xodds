// Prints one raw event from SportsGameOdds so you can confirm field names before going live.
import 'dotenv/config';
const key = process.env.SGO_API_KEY;
if (!key) { console.error('Set SGO_API_KEY in .env first'); process.exit(1); }
const league = process.argv[2] ?? 'NHL';
const u = `https://api.sportsgameodds.com/v2/events?apiKey=${key}&leagueID=${league}&oddsAvailable=true&limit=1`;
const res = await fetch(u);
console.log('HTTP', res.status);
const body: any = await res.json();
const ev = body.data?.[0];
if (!ev) { console.log(res.status, JSON.stringify(body).slice(0, 500)); process.exit(0); }
const { odds, ...rest } = ev;
console.log(JSON.stringify(rest, null, 2).slice(0, 3000));
const sample = Object.values<any>(odds ?? {}).slice(0, 3);
console.log(JSON.stringify(sample, null, 2));
console.log('bookmakers seen:', [...new Set(Object.values<any>(odds ?? {}).flatMap(o => Object.keys(o.byBookmaker ?? {})))].join(', '));
