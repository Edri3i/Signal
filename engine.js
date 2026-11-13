/* Signal engine: universe, indicators, factors, scoring, levels, signal history.
   Shared by the browser (window.SigEngine) and Node (tests, data job). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SigEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  /* ------------------------------------------------------------------ universe */
  const CATS = {
    crypto: { n: 'کریپتو', c: '#38d4ff', cols: 105 },
    stock: { n: 'سهام آمریکا', c: '#ffc857', cols: 35 },
    index: { n: 'شاخص‌ها', c: '#b69cff', cols: 9 },
    fx: { n: 'فارکس', c: '#19e3a1', cols: 10 },
    com: { n: 'طلا و نفت', c: '#ff9a5c', cols: 9 }
  };
  const STOCKS = ('AAPL MSFT NVDA GOOGL AMZN META TSLA AVGO BRK.B LLY JPM V WMT ORCL MA XOM NFLX COST PG JNJ HD BAC ABBV KO CVX AMD PLTR CRM CSCO WFC IBM GE MRK PEP TMO UNH LIN ABT MCD DIS ACN QCOM ADBE TXN INTU CAT VZ AMGN NOW PM GS ISRG MS BKNG SPGI RTX T HON AXP UBER BLK DHR NEE LOW PFE SYK ETN C UNP TJX BSX PGR SCHW COP VRTX ANET CMCSA ADP LMT MU PANW GILD DE MMC KKR BX CB SBUX AMT MDLZ INTC PLD MO NKE CME SO ADI CRWD APH ICE SHW DUK').split(' ').slice(0, 100);
  const INDICES = [
    ['SPX', '^GSPC', 'S&P 500'], ['NDX', '^NDX', 'Nasdaq 100'], ['DJI', '^DJI', 'Dow Jones'], ['RUT', '^RUT', 'Russell 2000'],
    ['VIX', '^VIX', 'VIX'], ['DXY', 'DX-Y.NYB', 'شاخص دلار'], ['FTSE', '^FTSE', 'FTSE 100'], ['DAX', '^GDAXI', 'DAX'],
    ['CAC', '^FCHI', 'CAC 40'], ['N225', '^N225', 'Nikkei 225'], ['HSI', '^HSI', 'Hang Seng'], ['SSE', '000001.SS', 'Shanghai'],
    ['KOSPI', '^KS11', 'KOSPI'], ['SX5E', '^STOXX50E', 'Euro Stoxx 50'], ['NIFTY', '^NSEI', 'Nifty 50'], ['TSX', '^GSPTSE', 'TSX']
  ];
  const FX = 'EURUSD GBPUSD USDJPY USDCHF AUDUSD NZDUSD USDCAD EURGBP EURJPY GBPJPY AUDJPY EURCHF EURAUD GBPAUD GBPCAD CADJPY CHFJPY NZDJPY AUDNZD EURCAD'.split(' ');
  const COM = [['XAU', 'GC=F', 'طلا'], ['WTI', 'CL=F', 'نفت WTI'], ['BRENT', 'BZ=F', 'نفت برنت']];

  function tradfiUniverse() {
    const u = [];
    for (const t of STOCKS) u.push({ t, cat: 'stock', y: t.replace('.', '-'), n: t });
    for (const [t, y, n] of INDICES) u.push({ t, cat: 'index', y, n });
    for (const t of FX) u.push({ t, cat: 'fx', y: t + '=X', n: t.slice(0, 3) + '/' + t.slice(3) });
    for (const [t, y, n] of COM) u.push({ t, cat: 'com', y, n });
    return u;
  }
  const DISPLAY = { XAU: 'GOLD' };

  /* ---------------------------------------------------------------- indicators */
  function rsi(c, n) {
    n = n || 14;
    if (c.length < n + 2) return null;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; d >= 0 ? (g += d) : (l -= d); }
    g /= n; l /= n;
    for (let i = n + 1; i < c.length; i++) {
      const d = c[i] - c[i - 1];
      g = (g * (n - 1) + Math.max(d, 0)) / n;
      l = (l * (n - 1) + Math.max(-d, 0)) / n;
    }
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  function ema(a, n) {
    const k = 2 / (n + 1); let e = a[0]; const o = [e];
    for (let i = 1; i < a.length; i++) { e = a[i] * k + e * (1 - k); o.push(e); }
    return o;
  }
  function macdH(c) {
    const a = ema(c, 12), b = ema(c, 26), m = a.map((v, i) => v - b[i]), s = ema(m, 9), L = c.length - 1;
    return { h: m[L] - s[L], hp: m[L - 1] - s[L - 1] };
  }
  function stdevLogRet(c, k) {
    const n = c.length; k = Math.min(k, n - 1);
    if (k < 5) return null;
    let m = 0; const r = [];
    for (let i = n - k; i < n; i++) { const x = Math.log(c[i] / c[i - 1]); if (isFinite(x)) { r.push(x); m += x; } }
    if (r.length < 5) return null;
    m /= r.length; let s = 0; for (const x of r) s += (x - m) * (x - m);
    return Math.sqrt(s / r.length);
  }
  /* bars per UTC day (median) */
  function barsPerDay(ts) {
    if (!ts || ts.length < 10) return 24;
    const cnt = {};
    for (const t of ts) { const d = Math.floor(t / 864e5); cnt[d] = (cnt[d] || 0) + 1; }
    const v = Object.values(cnt).sort((x, y) => x - y);
    return clamp(v[Math.floor(v.length / 2)] || 24, 4, 24);
  }
  /* average daily range over the last up-to-7 UTC days */
  function dailyAtr(ts, h, l) {
    const n = h.length; if (n < 20) return null;
    const days = {}; const order = [];
    for (let i = 0; i < n; i++) {
      const d = Math.floor(ts[i] / 864e5);
      if (!days[d]) { days[d] = { hi: -Infinity, lo: Infinity, n: 0 }; order.push(d); }
      days[d].hi = Math.max(days[d].hi, h[i]); days[d].lo = Math.min(days[d].lo, l[i]); days[d].n++;
    }
    const use = order.slice(-8, -1); // exclude the current partial day
    if (!use.length) return null;
    let s = 0; for (const d of use) s += days[d].hi - days[d].lo;
    return s / use.length;
  }

  /* ------------------------------------------------------------------- factors */
  const KEYS = ['flow', 'mom', 'tech', 'smart', 'lev', 'macro'];
  const DEFAULT_W = { flow: 22, mom: 20, tech: 18, smart: 16, lev: 14, macro: 10 };

  function prepare(a) {
    /* derive raw metrics once per data refresh */
    const c = a.c; if (!c || c.length < 30) { a.m = null; return null; }
    const n = c.length, h = a.h || c, l = a.l || c;
    const ts = a.ts || c.map((_, i) => Date.now() - (n - 1 - i) * 36e5);
    const bpd = barsPerDay(ts);
    const approx = !a.h; // crypto sparkline has closes only
    let atrD = dailyAtr(ts, h, l);
    if (atrD != null && approx) atrD *= 1.35;
    const r = rsi(c, 14), mc = macdH(c);
    const sig = stdevLogRet(c, 5 * bpd) || 1e-3;
    const lr = k => Math.log(c[n - 1] / c[Math.max(0, n - 1 - k)]);
    const k1 = Math.min(bpd, n - 1), k5 = Math.min(5 * bpd, n - 1);
    a.m = {
      rsi: r, mh: mc.h, mhp: mc.hp, bpd, atrD, sig,
      m1: lr(k1) / (sig * Math.sqrt(k1)), m5: lr(k5) / (sig * Math.sqrt(k5)),
      r1: (Math.exp(lr(k1)) - 1) * 100, r5: (Math.exp(lr(k5)) - 1) * 100,
      lo24: Math.min.apply(null, l.slice(-bpd)), hi24: Math.max.apply(null, h.slice(-bpd))
    };
    return a.m;
  }

  function flowOf(a) {
    const c = a.c, n = c.length, h = a.h || c, l = a.l || c, v = a.v, m = a.m;
    if (a.taker != null) return clamp((a.taker - 1) / 0.3, -1, 1);
    if (v && v.length === n) {
      let up = 0, dn = 0; const k = Math.min(n - 1, 2 * m.bpd);
      for (let i = n - k; i < n; i++) { const d = c[i] - c[i - 1], vv = v[i] || 0; d >= 0 ? (up += vv) : (dn += vv); }
      if (up + dn > 0) return clamp(((up - dn) / (up + dn)) * 1.6, -1, 1);
    }
    if (a.cat === 'crypto' && a.ch24 != null) {
      const vm = a.mcap > 0 ? a.vol / a.mcap : 0.05;
      return clamp(Math.tanh(a.ch24 / 6) * clamp(0.6 + vm * 6, 0.6, 1.4), -1, 1);
    }
    let s = 0, cnt = 0; const k = Math.min(n, 2 * m.bpd);
    for (let i = n - k; i < n; i++) { const r = h[i] - l[i]; if (r > 0) { s += ((c[i] - l[i]) - (h[i] - c[i])) / r; cnt++; } }
    return cnt ? clamp((s / cnt) * 1.4, -1, 1) : null;
  }

  function macroOf(a, env) {
    if (!env) return null;
    const t = a.t, cat = a.cat;
    if (cat === 'crypto') {
      const parts = [];
      if (env.stable7 != null) parts.push(clamp(env.stable7 / 0.8, -1, 1));
      if (env.riskOn != null) parts.push(env.riskOn * 0.6);
      return parts.length ? clamp(parts.reduce((x, y) => x + y, 0) / parts.length, -1, 1) : null;
    }
    if (cat === 'stock' || cat === 'index') {
      if (t === 'DXY') return null;
      if (t === 'VIX') return env.riskOn != null ? -env.riskOn : null;
      return env.riskOn != null ? env.riskOn : null;
    }
    if (cat === 'fx') {
      const base = t.slice(0, 3), quote = t.slice(3), usd = env.usd;
      if (usd != null) {
        if (quote === 'USD') return clamp(-usd, -1, 1);
        if (base === 'USD') return clamp(usd, -1, 1);
      }
      if (quote === 'JPY' && base !== 'USD' && base !== 'CHF' && env.riskOn != null) return env.riskOn;
      return null;
    }
    if (cat === 'com') {
      if (t === 'XAU') return env.usd != null ? clamp(-0.7 * env.usd - 0.3 * (env.riskOn || 0), -1, 1) : null;
      return env.riskOn != null || env.usd != null ? clamp(0.5 * (env.riskOn || 0) - 0.5 * (env.usd || 0), -1, 1) : null;
    }
    return null;
  }

  /* signed factor values in [-1, 1]; missing factors are omitted */
  function factors(a, env) {
    const f = {};
    if (!a.m && !prepare(a)) return f;
    const m = a.m;
    const fl = flowOf(a); if (fl != null) f.flow = fl;
    f.mom = Math.tanh(0.45 * (0.6 * m.m1 + 0.4 * m.m5));
    if (m.rsi != null) {
      const up = m.mh > m.mhp;
      const lg = 0.6 * clamp((42 - m.rsi) / 14, 0, 1) + 0.4 * (up && m.mh < 0 ? 1 : 0);
      const sh = 0.6 * clamp((m.rsi - 58) / 14, 0, 1) + 0.4 * (!up && m.mh > 0 ? 1 : 0);
      f.tech = lg - sh;
    }
    let sm = null;
    if (a.wTot > 0) sm = ((a.wB - a.wS) / a.wTot) * clamp(a.wTot / ((a.wThr || 50000) * 6), 0.25, 1);
    if (a.hlTot > 0) { const h2 = ((a.hlB - a.hlS) / a.hlTot) * clamp(a.hlTot / 6e5, 0.25, 1); sm = sm == null ? h2 : (sm + h2) / 2; }
    if (a.hlPos != null && a.hlPos !== 0) { const p = clamp(a.hlPos / 1.5e6, -1, 1); sm = sm == null ? p : sm * 0.6 + p * 0.4; }
    if (sm != null) f.smart = clamp(sm, -1, 1);
    if (a.fund != null) {
      const fp = a.fund * 100, oi = a.oiChg || 0;
      const lg = clamp(-fp / 0.04, 0, 1) * 0.7 + (fp < 0 ? clamp(oi / 4, 0, 1) * 0.3 : 0);
      const sh = clamp((fp - 0.01) / 0.04, 0, 1) * 0.7 + (fp > 0 ? clamp(oi / 4, 0, 1) * 0.3 : 0);
      f.lev = lg - sh;
    }
    const mc = macroOf(a, env); if (mc != null) f.macro = mc;
    return f;
  }

  function levels(a, dir) {
    const m = a.m; if (!m || !m.atrD || !a.price) return null;
    const p = a.price, A = m.atrD;
    const risk = Math.max(0.6 * A, p * 0.002);
    const stop = dir > 0 ? Math.min(p - risk, m.lo24 - 0.1 * A) : Math.max(p + risk, m.hi24 + 0.1 * A);
    const R = Math.abs(p - stop);
    return {
      zone: dir > 0 ? [p - 0.3 * A, p + 0.05 * A] : [p - 0.05 * A, p + 0.3 * A],
      stop, t1: p + dir * 1.5 * R, t2: p + dir * 3 * R, atr: A
    };
  }

  /* returns { sc (signed, -100..100), s, dir, agree, level, f, n } */
  function score(a, env, W) {
    W = W || DEFAULT_W;
    const f = factors(a, env), ks = Object.keys(f);
    a.f = f;
    if (!ks.length) return { sc: 0, s: 0, dir: 1, agree: 0, level: 'none', f, n: 0 };
    let den = 0, num = 0;
    for (const k of ks) { den += W[k]; num += W[k] * f[k]; }
    const sc = den ? clamp((125 * num) / den, -100, 100) : 0, dir = sc >= 0 ? 1 : -1;
    let agree = 0; for (const k of ks) if (f[k] * dir >= 0.35) agree++;
    const s = Math.abs(sc);
    const need3 = ks.length >= 4 ? 3 : 2;
    const level = s >= 55 && agree >= need3 ? 'strong' : s >= 40 && agree >= 2 ? 'notable' : 'none';
    return { sc, s, dir, agree, level, f, n: ks.length };
  }

  /* global environment from index/forex bars + stablecoin flow */
  function trendOf(a) {
    if (!a || !a.m) { if (a && a.c && a.c.length > 30) prepare(a); else return null; }
    if (!a.m) return null;
    return Math.tanh(0.5 * a.m.m5);
  }
  function computeEnv(byT, stable7) {
    const spx = trendOf(byT.SPX), vix = trendOf(byT.VIX), dxy = trendOf(byT.DXY);
    let riskOn = null;
    if (spx != null || vix != null) riskOn = clamp(0.6 * (spx || 0) - 0.4 * (vix || 0), -1, 1);
    return { stable7: stable7 == null ? null : stable7, spx, vix, usd: dxy, riskOn };
  }

  /* ------------------------------------------------------------ signal history */
  const HIST = { THRESH: 40, COOLDOWN: 12 * 36e5, TRACK: 30 * 864e5, RETAIN: 45 * 864e5, MAX: 4000 };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function openSignal(hist, a, sc, now, thresh) {
    thresh = thresh || HIST.THRESH;
    if (!(sc.s >= thresh && sc.agree >= 2) || !a.price) return null;
    const dir = sc.dir;
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i];
      if (h.k !== a.cat + ':' + a.t) continue;
      if (now - h.t < HIST.COOLDOWN) return null;
      if (h.dir === dir && !h.done && now - h.t < HIST.TRACK) return null;
      break;
    }
    const lv = levels(a, dir);
    const rec = {
      id: uid(), k: a.cat + ':' + a.t, sym: a.t, d: a.d || a.t, cat: a.cat, dir, t: now, sc: Math.round(sc.s),
      e: a.price, zl: lv ? lv.zone[0] : a.price, zh: lv ? lv.zone[1] : a.price,
      st: lv ? lv.stop : null, t1: lv ? lv.t1 : null, t2: lv ? lv.t2 : null,
      up: 0, dn: 0, upT: now, dnT: now, now: a.price, nowT: now, h1: 0, h2: 0, hs: 0, done: false
    };
    hist.push(rec);
    return rec;
  }

  /* apply a price observation (price p, and optional high/low of the window since last update) */
  function applyPrice(rec, p, hi, lo, now, onEvent) {
    if (!isFinite(p)) return;
    hi = hi == null ? p : Math.max(hi, p);
    lo = lo == null ? p : Math.min(lo, p);
    const best = rec.dir > 0 ? hi : lo, worst = rec.dir > 0 ? lo : hi;
    const up = ((best / rec.e - 1) * 100) * rec.dir, dn = ((worst / rec.e - 1) * 100) * rec.dir;
    if (up > rec.up) { rec.up = up; rec.upT = now; }
    if (dn < rec.dn) { rec.dn = dn; rec.dnT = now; }
    rec.now = p; rec.nowT = now;
    const hit = lvl => (rec.dir > 0 ? best >= lvl : best <= lvl);
    const hitStop = rec.st != null && (rec.dir > 0 ? worst <= rec.st : worst >= rec.st);
    if (!rec.h1 && rec.t1 != null && hit(rec.t1)) { rec.h1 = now; if (onEvent) onEvent(rec, 't1'); }
    if (!rec.h2 && rec.t2 != null && hit(rec.t2)) { rec.h2 = now; if (!rec.h1) rec.h1 = now; if (onEvent) onEvent(rec, 't2'); }
    if (!rec.hs && !rec.h1 && hitStop) { rec.hs = now; if (onEvent) onEvent(rec, 'stop'); }
    if (now - rec.t > HIST.TRACK) rec.done = true;
  }
  function statusOf(rec) {
    if (rec.h2) return 't2';
    if (rec.h1) return 't1';
    if (rec.hs) return 'stop';
    return rec.done ? 'expired' : 'open';
  }
  function prune(hist, now) {
    const keep = hist.filter(h => now - h.t < HIST.RETAIN);
    keep.sort((a, b) => a.t - b.t);
    return keep.length > HIST.MAX ? keep.slice(keep.length - HIST.MAX) : keep;
  }
  /* catch up using a bar series (ts, h, l, c) after the app was closed */
  function catchUp(rec, a, now, onEvent) {
    if (!a.ts || !a.h || rec.done) return;
    const from = Math.max(rec.nowT, rec.t);
    let hi = -Infinity, lo = Infinity, any = false;
    for (let i = 0; i < a.ts.length; i++) if (a.ts[i] > from) { hi = Math.max(hi, a.h[i]); lo = Math.min(lo, a.l[i]); any = true; }
    if (any) applyPrice(rec, a.price || a.c[a.c.length - 1], hi, lo, now, onEvent);
  }

  return {
    CATS, STOCKS, INDICES, FX, COM, DISPLAY, KEYS, DEFAULT_W, HIST, tradfiUniverse,
    rsi, ema, macdH, stdevLogRet, barsPerDay, dailyAtr, prepare, factors, levels, score, computeEnv,
    openSignal, applyPrice, statusOf, prune, catchUp, clamp
  };
});
