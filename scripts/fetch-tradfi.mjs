// Fetches hourly bars for stocks, indices, forex, gold and oil from Yahoo Finance and writes data/market.json
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const E = require('../engine.js');
const uni = E.tradfiUniverse();
const OUT = 'data/market.json';
let old = { assets: {} };
try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const r4 = x => (x == null ? null : Math.abs(x) >= 100 ? Math.round(x * 100) / 100 : Math.round(x * 1e5) / 1e5);
async function one(u) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(u.y) + '?interval=60m&range=1mo&includePrePost=false';
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36' } });
      if (r.status === 429) { await sleep(2000 * (k + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(), res = j.chart.result[0], q = res.indicators.quote[0], ts = res.timestamp || [];
      const rows = [];
      for (let i = 0; i < ts.length; i++) if (q.close[i] != null) rows.push([ts[i], q.close[i], q.high[i] ?? q.close[i], q.low[i] ?? q.close[i], q.volume[i] ?? 0]);
      const last = rows.slice(-200);
      if (last.length < 40) throw new Error('too few bars');
      return { p: r4(res.meta.regularMarketPrice ?? last[last.length - 1][1]), ts: last.map(x => x[0]), c: last.map(x => r4(x[1])), h: last.map(x => r4(x[2])), l: last.map(x => r4(x[3])), v: last.map(x => Math.round(x[4])) };
    } catch (e) { if (k === 2) throw e; await sleep(800); }
  }
  throw new Error('failed');
}
const out = { generated: Date.now(), assets: {} };
let ok = 0, bad = 0, i = 0;
async function worker() {
  while (i < uni.length) {
    const u = uni[i++];
    try { out.assets[u.t] = await one(u); ok++; }
    catch (e) { bad++; if (old.assets && old.assets[u.t]) out.assets[u.t] = Object.assign({}, old.assets[u.t], { stale: true }); console.log('fail', u.t, e.message); }
    await sleep(150);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
console.log('ok', ok, 'failed', bad);
if (ok < 10) { console.error('too few succeeded, keeping old file'); process.exit(ok ? 0 : 1); }
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
