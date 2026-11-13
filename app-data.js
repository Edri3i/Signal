/* Signal data layer: state, storage, providers, scoring loop, history, live feed. */
(function () {
  'use strict';
  const E = window.SigEngine, CATS = E.CATS;
  const clamp = E.clamp, sleep = ms => new Promise(r => setTimeout(r, ms));
  const SG = (window.SG = { E, CATS, A: [], byKey: new Map(), hist: [], feed: [], listeners: {}, logs: [], dirty: { layout: true } });

  /* ------------------------------------------------------------- small helpers */
  SG.on = (n, f) => ((SG.listeners[n] = SG.listeners[n] || []).push(f));
  SG.emit = (n, a) => (SG.listeners[n] || []).forEach(f => { try { f(a); } catch (e) { console.error(e); } });
  const tm = () => new Date().toLocaleTimeString('en-GB');
  SG.log = m => { SG.logs.unshift(tm() + '  ' + m); if (SG.logs.length > 80) SG.logs.pop(); SG.emit('log'); };
  SG.fmtP = p => (p == null || isNaN(p) ? '—' : p >= 10000 ? Math.round(p).toLocaleString('en-US') : p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 1 }) : p >= 10 ? p.toFixed(2) : p >= 1 ? p.toFixed(3) : p >= 0.01 ? p.toFixed(5) : p >= 0.0001 ? p.toFixed(6) : p.toPrecision(3));
  SG.fmtU = u => (u >= 1e9 ? (u / 1e9).toFixed(2) + ' میلیارد دلار' : u >= 1e6 ? (u / 1e6).toFixed(2) + ' میلیون دلار' : u >= 1e3 ? Math.round(u / 1e3) + ' هزار دلار' : Math.round(u) + ' دلار');
  SG.fmtPct = x => (x == null || isNaN(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2) + '٪');
  const dfmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' });
  SG.fmtDate = t => dfmt.format(new Date(t));
  SG.fmtTime = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  SG.ago = t => {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'همین حالا';
    if (s < 3600) return Math.floor(s / 60) + ' دقیقه پیش';
    if (s < 172800) return Math.floor(s / 3600) + ' ساعت پیش';
    return Math.floor(s / 86400) + ' روز پیش';
  };
  const hash32 = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  /* ------------------------------------------------------------------- storage */
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  const IDB = {
    db: null,
    open() { return new Promise(res => { try { const r = indexedDB.open('signal', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { IDB.db = r.result; res(true); }; r.onerror = () => res(false); } catch (e) { res(false); } }); },
    get(k) { return new Promise(res => { if (!IDB.db) return res(null); try { const q = IDB.db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } }); },
    set(k, v) { return new Promise(res => { if (!IDB.db) return res(false); try { const tx = IDB.db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(true); tx.onerror = () => res(false); } catch (e) { res(false); } }); }
  };
  SG.LS = LS; SG.IDB = IDB;

  const S = (SG.S = {
    mode: 'init', modeT: 0, weights: Object.assign({}, E.DEFAULT_W), thresh: 40,
    base: 'https://fapi.binance.com', ws: 'wss://fstream.binance.com', unlocks: [],
    feedCat: 'all', feedTy: 'all', histCat: 'all', histDir: 'all', histSt: 'all',
    src: {}, env: null, stable7: null, stable1: null, stableTotal: null, liq: [], hlW: {}, hlPos: {}, tab: 'net', lastRank: 0
  });
  (function loadCfg() {
    const c = LS.get('sig.cfg', {});
    for (const k of ['thresh', 'base', 'ws', 'unlocks', 'feedCat', 'feedTy', 'histCat', 'histDir', 'histSt']) if (c[k] != null) S[k] = c[k];
    if (c.weights) Object.assign(S.weights, c.weights);
    SG.hist = LS.get('sig.hist', []);
    SG.feed = LS.get('sig.feed', []);
  })();
  let tCfg = 0, tHist = 0, tFeed = 0;
  SG.saveCfg = () => { clearTimeout(tCfg); tCfg = setTimeout(() => LS.set('sig.cfg', { thresh: S.thresh, base: S.base, ws: S.ws, unlocks: S.unlocks, weights: S.weights, feedCat: S.feedCat, feedTy: S.feedTy, histCat: S.histCat, histDir: S.histDir, histSt: S.histSt }), 300); };
  SG.saveHist = () => { clearTimeout(tHist); tHist = setTimeout(() => { if (S.mode === 'demo') return; SG.hist = E.prune(SG.hist, Date.now()); LS.set('sig.hist', SG.hist); }, 1500); };
  SG.saveFeed = () => { clearTimeout(tFeed); tFeed = setTimeout(() => { if (S.mode !== 'demo') LS.set('sig.feed', SG.feed.slice(0, 600)); }, 2500); };
  const flushAll = () => { if (S.mode === 'demo') return; LS.set('sig.hist', E.prune(SG.hist, Date.now())); LS.set('sig.feed', SG.feed.slice(0, 600)); };
  addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushAll(); });

  /* -------------------------------------------------------------------- assets */
  const STABLE_SYM = new Set('USDT USDC DAI FDUSD TUSD USDE USDS PYUSD USDD BUSD USDP GUSD FRAX LUSD EURC USD1 USDY SUSDE SUSDS BUIDL USDX RLUSD USDTB USDG USDF XAUT PAXG BSC-USD USDT0 CRVUSD GHO MKUSD EURS EURT AUSD USDB USDL'.split(' '));
  const WRAPPED = /^(WBTC|WETH|STETH|WSTETH|WEETH|CBBTC|CBETH|RETH|STBTC|SOLVBTC|BTCB|WBETH|METH|EZETH|RSETH|LBTC|JITOSOL|MSOL|BNSOL|WTRX|WBNB|WAVAX)$/;
  const HL1000 = { PEPE: 1, SHIB: 1, BONK: 1, FLOKI: 1, LUNC: 1, SATS: 1, XEC: 1 };
  SG.CRYPTO_N = 300;

  function ensureAsset(cat, t, init) {
    const key = cat + ':' + t;
    let a = SG.byKey.get(key);
    if (!a) {
      a = {
        i: SG.A.length, t, key, cat, d: E.DISPLAY[t] || t, n: t, live: true, price: 0, ch1: null, ch24: null, ch7: null, vol: 0, mcap: 0,
        c: null, h: null, l: null, v: null, ts: null, fund: null, oiChg: null, taker: null, fundSrc: null,
        w: [], wB: 0, wS: 0, wTot: 0, wThr: 50000, hl: [], hlB: 0, hlS: 0, hlTot: 0, hlPos: null,
        target: 0, ss: 0, s: 0, dir: 1, lvl: 'none', agree: 0, nf: 0, rank: -1, cell: 0, x: 0, y: 0, z: 0, db: 0, m: null, f: {}, seen: 0
      };
      SG.A.push(a); SG.byKey.set(key, a); SG.dirty.layout = true;
    }
    if (init) Object.assign(a, init);
    return a;
  }
  SG.ensureAsset = ensureAsset;
  SG.resetUniverse = () => { SG.A.length = 0; SG.byKey.clear(); SG.dirty.layout = true; };
  SG.liveAssets = () => SG.A.filter(a => a.live && a.c);

  /* ---------------------------------------------------------------- providers */
  async function jget(u, ms, opt) {
    const c = new AbortController(), to = setTimeout(() => c.abort(), ms || 12000);
    try { const r = await fetch(u, Object.assign({ signal: c.signal }, opt || {})); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    finally { clearTimeout(to); }
  }
  SG.jget = jget;
  const srcOk = (k, n, extra) => { S.src[k] = Object.assign({ ok: true, t: Date.now(), n: n || 0, err: '' }, extra || {}); SG.emit('src'); };
  const srcErr = (k, e) => { const p = S.src[k] || {}; S.src[k] = Object.assign({}, p, { ok: false, err: String((e && e.message) || e), et: Date.now() }); SG.emit('src'); SG.log(k + ': ' + ((e && e.message) || e)); };

  /* crypto: CoinGecko top coins with 7-day hourly sparkline */
  function ingestCrypto(rows, fromCache) {
    const now = Date.now(); let n = 0; const seen = new Set();
    for (const r of rows) {
      if (n >= SG.CRYPTO_N) break;
      const sym = String(r.symbol || r.sym || '').toUpperCase(); if (!sym) continue;
      const price = r.current_price != null ? r.current_price : r.price;
      const spark = (r.sparkline_in_7d && r.sparkline_in_7d.price) || r.c;
      if (!price || !spark || spark.length < 40) continue;
      const ch7 = r.price_change_percentage_7d_in_currency != null ? r.price_change_percentage_7d_in_currency : r.ch7;
      if (STABLE_SYM.has(sym) || WRAPPED.test(sym) || (Math.abs(price - 1) < 0.03 && Math.abs(ch7 || 0) < 1.5)) continue;
      if (seen.has(sym)) continue; seen.add(sym);
      const c = spark.filter(x => x > 0), nn = c.length;
      const base = fromCache ? (r.ts0 || now) : now;
      const ts = c.map((_, i) => base - (nn - 1 - i) * 36e5);
      if (!fromCache) { c.push(price); ts.push(now); }
      ensureAsset('crypto', sym, {
        id: r.id, n: r.name || sym, rank: r.market_cap_rank || r.rank || 0, price,
        ch1: r.price_change_percentage_1h_in_currency != null ? r.price_change_percentage_1h_in_currency : r.ch1,
        ch24: r.price_change_percentage_24h_in_currency != null ? r.price_change_percentage_24h_in_currency : r.ch24,
        ch7, vol: r.total_volume != null ? r.total_volume : r.vol, mcap: r.market_cap != null ? r.market_cap : r.mcap,
        c, ts, h: null, l: null, v: null, m: null, live: true, seen: now
      });
      const a = SG.byKey.get('crypto:' + sym); a.wThr = clamp((a.vol || 1e8) / 20000, 25000, 300000);
      n++;
    }
    for (const a of SG.A) if (a.cat === 'crypto' && !seen.has(a.t)) a.live = false;
    return n;
  }
  async function loadCrypto() {
    let rows = [];
    const url = p => 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=' + p + '&sparkline=true&price_change_percentage=1h%2C24h%2C7d';
    try {
      rows = await jget(url(1), 25000);
      try { await sleep(1500); rows = rows.concat(await jget(url(2), 25000)); } catch (e) { SG.log('crypto صفحه دوم: ' + e.message); }
      if (S.mode === 'demo') leaveDemo();
      const n = ingestCrypto(rows);
      if (!n) throw new Error('پاسخ خالی');
      srcOk('crypto', n); setMode('live'); SG.dirty.layout = true; SG.dirty.data = true;
      scheduleSnapshot();
      SG.log('کریپتو: ' + n + ' ارز دریافت شد');
      return true;
    } catch (e) { srcErr('crypto', e); return false; }
  }

  /* stocks / indices / forex / gold / oil: snapshot produced by the GitHub data job */
  function ingestTradfi(js, fromCache) {
    if (!js || !js.assets) return 0;
    const now = Date.now(); let n = 0;
    const uni = E.tradfiUniverse();
    for (const u of uni) {
      const e = js.assets[u.t]; if (!e || !e.c || e.c.length < 40) continue;
      const ts = e.ts.map(x => x * 1000);
      const price = e.p || e.c[e.c.length - 1];
      const bpd = E.barsPerDay(ts), idx = Math.max(0, e.c.length - 1 - bpd);
      const a = ensureAsset(u.cat, u.t, { n: u.n, y: u.y, price, c: e.c, h: e.h, l: e.l, v: e.v || null, ts, m: null, live: true, seen: now, ch24: (price / e.c[idx] - 1) * 100, vol: 0, stale: !!e.stale });
      a.gen = js.generated; n++;
    }
    S.tradfiGen = js.generated;
    return n;
  }
  async function loadTradfi() {
    if (S.mode === 'demo') return false;
    try {
      const js = await jget('data/market.json?v=' + Math.floor(Date.now() / 60000), 20000, { cache: 'no-store' });
      const n = ingestTradfi(js);
      if (!n) throw new Error('فایل داده خالی است');
      srcOk('tradfi', n, { gen: js.generated }); SG.dirty.layout = true; SG.dirty.data = true;
      if (S.mode !== 'demo') { SG.IDB.set('tradfi', js); }
      SG.log('سهام و بازارهای جهانی: ' + n + ' دارایی');
      return true;
    } catch (e) { srcErr('tradfi', e); return false; }
  }

  /* stablecoin supply (DefiLlama) */
  async function loadStable() {
    try {
      const a = await jget('https://stablecoins.llama.fi/stablecoincharts/all', 20000);
      const v = a.map(x => x.totalCirculatingUSD && x.totalCirculatingUSD.peggedUSD).filter(Boolean), n = v.length;
      if (n < 9) throw new Error('داده کم');
      S.stableTotal = v[n - 1]; S.stable1 = ((v[n - 1] - v[n - 2]) / v[n - 2]) * 100; S.stable7 = ((v[n - 1] - v[n - 8]) / v[n - 8]) * 100;
      srcOk('stable', 1); SG.dirty.data = true;
    } catch (e) { srcErr('stable', e); }
  }

  /* Binance futures: funding, open interest, taker ratio (needs reachable network) */
  let bnSyms = {};
  async function loadBinance() {
    const F = S.base.replace(/\/$/, '');
    try {
      const p = await jget(F + '/fapi/v1/premiumIndex', 12000);
      bnSyms = {};
      for (const x of p) {
        if (!/USDT$/.test(x.symbol)) continue;
        let b = x.symbol.slice(0, -4); const m = /^1000(\w+)$/.exec(b); if (m && HL1000[m[1]]) b = m[1];
        const a = SG.byKey.get('crypto:' + b); if (!a || !a.live) continue;
        a.fund = +x.lastFundingRate; a.fundSrc = 'bn'; a.bsym = x.symbol; bnSyms[b] = x.symbol;
      }
      srcOk('binance', Object.keys(bnSyms).length); SG.dirty.data = true;
      return true;
    } catch (e) { srcErr('binance', e); return false; }
  }
  async function scanBinanceDeep() {
    const F = S.base.replace(/\/$/, '');
    const list = SG.A.filter(a => a.cat === 'crypto' && a.live && a.bsym).sort((x, y) => (x.rank || 999) - (y.rank || 999)).slice(0, 40);
    let i = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (i < list.length) {
        const a = list[i++];
        try {
          const [oi, tk] = await Promise.all([
            jget(F + '/futures/data/openInterestHist?symbol=' + a.bsym + '&period=5m&limit=13', 10000),
            jget(F + '/futures/data/takerlongshortRatio?symbol=' + a.bsym + '&period=5m&limit=12', 10000)]);
          if (oi.length > 1) { const x = +oi[0].sumOpenInterestValue, y = +oi[oi.length - 1].sumOpenInterestValue; if (x > 0) a.oiChg = ((y - x) / x) * 100; }
          if (tk.length) a.taker = tk.reduce((s, z) => s + +z.buySellRatio, 0) / tk.length;
        } catch (e) { if (i === 1) { srcErr('binance', e); return; } }
        await sleep(120);
      }
    }));
    SG.dirty.data = true;
  }
  let bnSock = null, bnTry = 0;
  function connectBinanceWS() {
    if (bnSock || !S.src.binance || !S.src.binance.ok) return;
    const syms = Object.keys(bnSyms).map(b => ({ b, a: SG.byKey.get('crypto:' + b) })).filter(x => x.a).sort((x, y) => (x.a.rank || 999) - (y.a.rank || 999)).slice(0, 50);
    if (!syms.length) return;
    const streams = ['!forceOrder@arr'].concat(syms.map(x => bnSyms[x.b].toLowerCase() + '@aggTrade'));
    let ws;
    try { ws = new WebSocket(S.ws.replace(/\/$/, '') + '/stream?streams=' + streams.join('/')); } catch (e) { return; }
    bnSock = ws;
    const byS = {}; syms.forEach(x => (byS[bnSyms[x.b].toUpperCase()] = x.a));
    ws.onopen = () => { bnTry = 0; srcOk('ws', syms.length); SG.log('جریان زنده بایننس وصل شد'); };
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; } const d = m.data; if (!d) return;
      if (d.e === 'aggTrade') {
        const a = byS[d.s]; if (!a) return; const u = +d.p * +d.q;
        if (u >= a.wThr) { a.w.push({ t: Date.now(), s: d.m ? 'S' : 'B', u }); if (u >= Math.max(a.wThr * 2, 120000)) addEv({ cat: 'crypto', ty: 'whale', sym: a.t, txt: 'معامله درشت ' + (d.m ? 'فروش' : 'خرید') + ' ' + SG.fmtU(u), col: '#38d4ff' }); }
      } else if (d.e === 'forceOrder') {
        const o = d.o, b = o.s.replace(/USDT$/, ''), a = SG.byKey.get('crypto:' + b.replace(/^1000/, '')), u = +o.q * (+o.ap || +o.p);
        S.liq.push({ t: Date.now(), u });
        if (a && u >= 60000) addEv({ cat: 'crypto', ty: 'liq', sym: a.t, txt: 'تصفیه پوزیشن ' + (o.S === 'SELL' ? 'خرید' : 'فروش') + ' ' + SG.fmtU(u), col: o.S === 'SELL' ? '#ff4d6d' : '#19e3a1' });
        else if (!a && u >= 250000) addEv({ cat: 'crypto', ty: 'liq', sym: b, txt: 'تصفیه بزرگ ' + SG.fmtU(u), col: '#ff9a5c' });
      }
    };
    ws.onclose = () => { bnSock = null; if (S.mode !== 'demo') setTimeout(connectBinanceWS, Math.min(60000, 4000 * ++bnTry)); };
    ws.onerror = () => { try { ws.close(); } catch (e) { } };
  }

  /* Hyperliquid: large trades, big wallets, funding fallback */
  let hlSock = null, hlMap = {}, hlTry = 0;
  const hlPost = async body => { const r = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  const hlWallet = (ad, u, sg) => { const w = S.hlW[ad] || (S.hlW[ad] = { vol: 0, net: 0, last: 0 }); w.vol += u; w.net += sg * u; w.last = Date.now(); };
  async function startHL() {
    if (hlSock) return;
    try {
      const [meta, ctx] = await Promise.all([hlPost({ type: 'meta' }), hlPost({ type: 'metaAndAssetCtxs' })]);
      const names = new Set(meta.universe.map(u => u.name)); hlMap = {};
      for (const a of SG.A) if (a.cat === 'crypto' && a.live) { const k = HL1000[a.t] && names.has('k' + a.t) ? 'k' + a.t : a.t; if (names.has(k)) hlMap[k] = a; }
      ctx[0].universe.forEach((u, i) => { const a = hlMap[u.name], c = ctx[1][i]; if (a && c && a.fund == null) { a.fund = +c.funding * 8; a.fundSrc = 'hl'; } });
      srcOk('hl', Object.keys(hlMap).length);
      const ws = new WebSocket('wss://api.hyperliquid.xyz/ws'); hlSock = ws;
      ws.onopen = () => { hlTry = 0; Object.keys(hlMap).forEach(n => ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'trades', coin: n } }))); SG.log('هایپرلیکوید وصل شد'); };
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.channel !== 'trades' || !Array.isArray(m.data)) return;
        for (const t of m.data) {
          const a = hlMap[t.coin]; if (!a) continue; const u = +t.px * +t.sz; if (u < 50000) continue;
          const side = t.side === 'B' ? 'B' : 'S'; a.hl.push({ t: Date.now(), s: side, u });
          if (u >= 100000 && t.users) { hlWallet(t.users[0], u, 1); hlWallet(t.users[1], u, -1); }
          if (u >= 300000) addEv({ cat: 'crypto', ty: 'whale', sym: a.t, txt: 'نهنگ هایپرلیکوید ' + (side === 'B' ? 'خرید' : 'فروش') + ' ' + SG.fmtU(u), col: '#b6ff5c' });
        }
      };
      ws.onclose = () => { hlSock = null; if (S.mode !== 'demo') setTimeout(startHL, Math.min(90000, 6000 * ++hlTry)); };
      ws.onerror = () => { try { ws.close(); } catch (e) { } };
    } catch (e) { srcErr('hl', e); setTimeout(() => { if (S.mode !== 'demo') startHL(); }, 120000); }
  }
  async function pollHLWallets() {
    try {
      const top = Object.entries(S.hlW).sort((a, b) => b[1].vol - a[1].vol).slice(0, 8);
      for (const [ad] of top) {
        const r = await hlPost({ type: 'clearinghouseState', user: ad }), pos = {};
        for (const ap of r.assetPositions || []) { const p = ap.position; pos[p.coin] = (+p.szi >= 0 ? 1 : -1) * Math.abs(+p.positionValue); }
        S.hlPos[ad] = pos;
      }
      for (const k in hlMap) { let n = 0, any = false; for (const ad in S.hlPos) { const v = S.hlPos[ad][k]; if (v != null) { n += v; any = true; } } hlMap[k].hlPos = any ? n : null; }
    } catch (e) { SG.log('کیف‌پول‌های هایپرلیکوید: ' + e.message); }
  }

  /* --------------------------------------------------------------------- mode */
  function setMode(m) { if (S.mode !== m) { S.mode = m; S.modeT = Date.now(); SG.emit('mode', m); } S.modeT = Date.now(); }
  SG.setMode = setMode;

  /* snapshot (instant start next time) */
  let snapT = 0;
  function scheduleSnapshot() {
    clearTimeout(snapT);
    snapT = setTimeout(() => {
      const rows = SG.A.filter(a => a.cat === 'crypto' && a.live && a.c).map(a => ({ id: a.id, symbol: a.t, name: a.n, rank: a.rank, price: a.price, ch1: a.ch1, ch24: a.ch24, ch7: a.ch7, vol: a.vol, mcap: a.mcap, c: a.c.slice(0, -1).map(x => +x.toPrecision(6)), ts0: a.ts[a.ts.length - 2] || Date.now() }));
      IDB.set('crypto', { t: Date.now(), rows });
    }, 8000);
  }

  /* ----------------------------------------------------------------- feed/events */
  let evSeq = 0;
  function addEv(ev) {
    ev.id = Date.now().toString(36) + (evSeq++).toString(36); ev.t = ev.t || Date.now();
    SG.feed.unshift(ev);
    const cut = Date.now() - 7 * 864e5;
    if (SG.feed.length > 700) SG.feed.length = 700;
    while (SG.feed.length && SG.feed[SG.feed.length - 1].t < cut) SG.feed.pop();
    SG.saveFeed(); SG.emit('ev', ev);
  }
  SG.addEv = addEv;

  /* ----------------------------------------------------------- scoring + history */
  function trimTrades() {
    const now = Date.now();
    for (const a of SG.A) {
      if (a.w.length) { a.w = a.w.filter(x => x.t > now - 9e5); let b = 0, s = 0; for (const x of a.w) x.s === 'B' ? (b += x.u) : (s += x.u); a.wB = b; a.wS = s; a.wTot = b + s; }
      if (a.hl.length) { a.hl = a.hl.filter(x => x.t > now - 18e5); let b = 0, s = 0; for (const x of a.hl) x.s === 'B' ? (b += x.u) : (s += x.u); a.hlB = b; a.hlS = s; a.hlTot = b + s; }
    }
    S.liq = S.liq.filter(x => x.t > now - 3e5);
  }
  function envNow() {
    const byT = {}; for (const a of SG.A) if (a.cat === 'index') byT[a.t] = a;
    return E.computeEnv(byT, S.stable7);
  }
  let firstScore = true;
  function scoreTick() {
    if (!SG.A.length) return;
    const now = Date.now(); trimTrades();
    S.env = envNow();
    const fresh = [];
    for (const a of SG.A) {
      if (!a.live || !a.c) continue;
      const r = E.score(a, S.env, S.weights);
      a.target = r.sc; a.agree = r.agree; a.nf = r.n;
      const prev = a.lvl; a.lvl = r.level;
      if (S.mode !== 'demo') {
        const rec = E.openSignal(SG.hist, a, r, now, S.thresh);
        if (rec) { fresh.push({ a, rec, r }); SG.saveHist(); }
      }
    }
    fresh.sort((x, y) => y.r.s - x.r.s);
    fresh.slice(0, firstScore ? 8 : 12).forEach(({ a, rec }) => addEv({
      cat: a.cat, ty: 'sig', sym: a.t, txt: 'سیگنال ' + (rec.dir > 0 ? 'خرید' : 'فروش') + ' جدید با امتیاز ' + rec.sc + ' · قیمت ' + SG.fmtP(rec.e), col: rec.dir > 0 ? '#19e3a1' : '#ff4d6d', t: rec.t
    }));
    if (fresh.length) SG.emit('hist');
    firstScore = false;
  }
  function onTarget(rec, kind) {
    const a = SG.byKey.get(rec.k);
    const txt = kind === 'stop' ? 'سیگنال ' + (rec.dir > 0 ? 'خرید' : 'فروش') + ' به حد ضرر خورد (' + SG.fmtPct(rec.dn) + ')' : (kind === 't1' ? 'به هدف اول رسید' : 'به هدف دوم رسید') + ' (' + SG.fmtPct(rec.up) + ')';
    addEv({ cat: rec.cat, ty: 'tgt', sym: rec.sym, txt, col: kind === 'stop' ? '#ff4d6d' : '#ffc857' });
    SG.saveHist(); SG.emit('hist');
  }
  function histTick() {
    const now = Date.now(); let ch = false;
    for (const rec of SG.hist) {
      if (rec.done) continue;
      const a = SG.byKey.get(rec.k);
      if (!a || !a.price) continue;
      E.applyPrice(rec, a.price, null, null, now, onTarget); ch = true;
    }
    if (ch) { SG.saveHist(); SG.emit('hist'); }
  }
  function histCatchUp() {
    const now = Date.now();
    for (const rec of SG.hist) {
      if (rec.done) continue;
      const a = SG.byKey.get(rec.k); if (!a || !a.ts) continue;
      const hh = a.h || a.c, ll = a.l || a.c; // closes only for crypto (approximate)
      const fake = { ts: a.ts, h: hh, l: ll, c: a.c, price: a.price };
      E.catchUp(rec, fake, now, onTarget);
    }
    SG.saveHist(); SG.emit('hist');
  }
  SG.histCatchUp = histCatchUp;

  /* movers feed (hourly shock) */
  const moveSeen = {};
  function moversTick() {
    const now = Date.now();
    for (const a of SG.A) {
      if (!a.live || !a.m || S.mode === 'demo') continue;
      const big = a.cat === 'crypto' ? Math.abs(a.ch1 || 0) >= 5 : Math.abs(a.m.m1) >= 3.2;
      if (!big || now - (moveSeen[a.key] || 0) < 6 * 36e5) continue;
      moveSeen[a.key] = now;
      const v = a.cat === 'crypto' ? a.ch1 : a.m.r1;
      addEv({ cat: a.cat, ty: 'move', sym: a.t, txt: 'حرکت شدید ' + (v > 0 ? 'صعودی' : 'نزولی') + ' ' + SG.fmtPct(v) + (a.cat === 'crypto' ? ' در یک ساعت' : ' در یک روز'), col: v > 0 ? '#19e3a1' : '#ff4d6d' });
    }
  }

  /* ------------------------------------------------------------------- demo */
  const DEMO_CRYPTO = 'BTC ETH XRP BNB SOL TRX DOGE ADA HYPE LINK BCH XLM SUI AVAX LTC HBAR XMR SHIB TON CRO DOT UNI PEPE AAVE ENA TAO NEAR ICP ETC ONDO APT WLD POL ARB ALGO ATOM KAS VET FIL RENDER OP SEI INJ BONK TIA JUP STX IMX FET QNT GRT CRV LDO SAND MANA AXS THETA FLOW XTZ EOS NEO IOTA KAVA RUNE MKR SNX COMP DYDX GMX PENDLE ENS CHZ GALA APE BLUR STRK PYTH JTO ZK ZRO IO ATH MOVE ME PENGU TRUMP VIRTUAL GRASS BERA IP KAITO PUMP WIF FLOKI NOT DOGS TURBO POPCAT MEW BOME NEIRO GOAT PNUT ACT EGLD ZEC DASH ZIL ICX ONT QTUM BAT ZRX LRC ANKR SKL CELO ROSE KSM MINA CFX AR GLM BAND STORJ SC DGB RVN ENJ CHR AUDIO LPT RLC CTSI OGN BICO API3 UMA BAL YFI SUSHI CAKE RPL FXS LQTY SSV EIGEN ETHFI REZ SAFE ALT MANTA DYM PIXEL PORTAL ACE XAI AEVO ZETA OMNI TNSR SAGA BB LISTA LUNC JASMY SUPER ILV YGG PRIME MAGIC GMT ALICE HIGH WIN BTT JST SUN TRB BNT KNC CVC COTI MTL POWR DUSK CKB FLUX HNT IOTX ONE KDA GAS WOO CELR AKT BEL BLZ DATA DOCK FIO FIRO GHST GTC IDEX JOE LIT MDT NKN OM OXT PERP PHA PLA POND QI RAD RARE RAY REEF RSR SFP SXP TORN UTK WAN WING XNO ZEN FTM ASTR GLMR MOVR SYS XDC ELF ARDR RDNT HOOK ID EDU CYBER ARKM MAV PEOPLE AMB ACH AGLD ALPHA ANT AST ATA AVA BADGER BAKE BAL BETA BIFI BNX BURGER CLV DAR DEXE DF DGB DOCK EPS FIDA FORTH FRONT GNO HARD HIFI IRIS KEY KMD LINA LOOM MBL MDX NMR OAX ORN PERL PNT POLS PROS RAMP REN SLP STMX STRAX TKO TLM TVK UNFI VIB VIDT VITE WNXM'.split(' ').filter((x, i, a) => a.indexOf(x) === i).slice(0, 300);
  let demoTimer = 0, demoSeed = 7;
  const dr = () => { demoSeed = (demoSeed * 16807) % 2147483647; return demoSeed / 2147483647; };
  function demoSeries(n, start, drift, vol) {
    const c = [start]; let x = start; const h = [start], l = [start], v = [1e5]; const t0 = Date.now() - n * 36e5, ts = [t0];
    for (let i = 1; i < n; i++) { const o = x; x = o * (1 + drift + (dr() - 0.5) * vol); c.push(x); h.push(Math.max(o, x) * (1 + dr() * vol * 0.3)); l.push(Math.min(o, x) * (1 - dr() * vol * 0.3)); v.push(1e5 * (1 + dr())); ts.push(t0 + i * 36e5); }
    return { c, h, l, v, ts };
  }
  function startDemo() {
    if (S.mode === 'demo') return;
    S._realHist = SG.hist; S._realFeed = SG.feed; SG.hist = []; SG.feed = [];
    SG.resetUniverse(); setMode('demo'); S.stable7 = 0.35; S.stableTotal = 1.6e11; S.stable1 = 0.05;
    const mk = (cat, t, n, price, vol, tradfi) => {
      const sd = demoSeries(tradfi ? 150 : 169, price, (dr() - 0.5) * 0.004, vol);
      const a = ensureAsset(cat, t, { n, price: sd.c[sd.c.length - 1], c: tradfi ? sd.c : sd.c, ts: sd.ts, h: tradfi ? sd.h : null, l: tradfi ? sd.l : null, v: tradfi ? sd.v : null, ch24: (dr() - 0.5) * 8, ch1: (dr() - 0.5) * 2, ch7: (dr() - 0.5) * 20, vol: 5e9 / Math.pow(SG.A.length + 2, 0.9), mcap: 1e11 / Math.pow(SG.A.length + 2, 1.1), rank: SG.A.length + 1, live: true });
      a.wThr = 50000;
      if (cat === 'crypto') { a.fund = (dr() - 0.5) * 0.0012; a.oiChg = (dr() - 0.35) * 7; a.taker = 0.82 + dr() * 0.4; }
      return a;
    };
    DEMO_CRYPTO.forEach((t, i) => mk('crypto', t, t, i === 0 ? 68000 : i === 1 ? 3400 : Math.exp(dr() * 6 - 1.5), 0.012, false));
    for (const u of E.tradfiUniverse()) mk(u.cat, u.t, u.n, u.cat === 'fx' ? 0.8 + dr() * 0.8 : 20 + dr() * 400, u.cat === 'fx' ? 0.0025 : 0.007, true);
    SG.dirty.layout = true; SG.dirty.data = true;
    clearInterval(demoTimer);
    demoTimer = setInterval(() => {
      for (let k = 0; k < 6; k++) {
        const a = SG.A[Math.floor(dr() * SG.A.length)];
        a.price *= 1 + (dr() - 0.5) * 0.003; a.c[a.c.length - 1] = a.price; if (a.h) { a.h[a.h.length - 1] = Math.max(a.h[a.h.length - 1], a.price); a.l[a.l.length - 1] = Math.min(a.l[a.l.length - 1], a.price); }
        a.m = null;
        if (a.cat === 'crypto') {
          a.fund = clamp(a.fund + (dr() - 0.5) * 0.0001, -0.0008, 0.0008); a.taker = clamp(a.taker + (dr() - 0.5) * 0.05, 0.75, 1.3); a.oiChg = clamp((a.oiChg || 0) + (dr() - 0.5) * 0.6, -4, 6);
          const u = (60 + dr() * 500) * 1000, side = dr() < 0.5 + (a.taker - 1) ? 'B' : 'S'; a.w.push({ t: Date.now(), s: side, u });
          if (dr() < 0.3) addEv({ cat: 'crypto', ty: 'whale', sym: a.t, txt: 'معامله درشت ' + (side === 'B' ? 'خرید' : 'فروش') + ' ' + SG.fmtU(u), col: '#38d4ff' });
          if (dr() < 0.12) { const lg = dr() < 0.5, uu = (30 + dr() * 400) * 1000; S.liq.push({ t: Date.now(), u: uu }); addEv({ cat: 'crypto', ty: 'liq', sym: a.t, txt: 'تصفیه پوزیشن ' + (lg ? 'خرید' : 'فروش') + ' ' + SG.fmtU(uu), col: lg ? '#ff4d6d' : '#19e3a1' }); }
        }
      }
    }, 1400);
    SG.log('حالت نمایشی با داده ساختگی فعال شد');
  }
  function leaveDemo() {
    clearInterval(demoTimer); SG.resetUniverse();
    SG.hist = S._realHist || []; SG.feed = S._realFeed || []; S._realHist = S._realFeed = null;
    S.stable7 = S.stable1 = S.stableTotal = null; S.liq = [];
    SG.emit('hist'); SG.emit('feedreset');
  }
  SG.startDemo = startDemo;

  /* ---------------------------------------------------------------- orchestration */
  let timers = [];
  async function bootData() {
    await IDB.open();
    const snapC = await IDB.get('crypto'), snapT = await IDB.get('tradfi');
    let used = false;
    if (snapC && snapC.rows && snapC.rows.length) { const n = ingestCrypto(snapC.rows, true); if (n) { used = true; S.snapT = snapC.t; setMode('cached'); } }
    if (snapT) { ingestTradfi(snapT, true); used = used || true; }
    if (used) { SG.dirty.layout = true; SG.dirty.data = true; SG.log('داده ذخیره‌شده بارگذاری شد'); scoreTick(); histCatchUp(); }
    SG.emit('boot');
    const okC = await loadCrypto(), okT = await loadTradfi();
    if (!okC && !okT && !used) startDemo();
    else if (!okC && okT && S.mode !== 'cached') setMode('live');
    if (okC || okT) { scoreTick(); histCatchUp(); }
    loadStable();
    loadBinance().then(ok => { if (ok) { connectBinanceWS(); scanBinanceDeep(); } });
    startHL();
    timers.push(setInterval(async () => { if (document.hidden) return; if (await loadCrypto()) { scoreTick(); } }, 240000));
    timers.push(setInterval(async () => { if (document.hidden) return; if (await loadTradfi()) scoreTick(); }, 300000));
    timers.push(setInterval(() => { if (!document.hidden) loadStable(); }, 1800000));
    timers.push(setInterval(() => { if (document.hidden) return; loadBinance().then(ok => { if (ok) { connectBinanceWS(); scanBinanceDeep(); } }); }, 300000));
    timers.push(setInterval(() => { if (!document.hidden) pollHLWallets(); }, 60000));
    timers.push(setInterval(() => { if (S.mode === 'cached' && Date.now() - S.modeT > 600000) loadCrypto(); }, 60000));
    document.addEventListener('visibilitychange', async () => {
      if (!document.hidden && Date.now() - (S.src.crypto ? S.src.crypto.t : 0) > 180000) { if (await loadCrypto()) { scoreTick(); histCatchUp(); } loadTradfi(); }
    });
  }
  SG.boot = bootData;
  setInterval(scoreTick, 2000);
  setInterval(histTick, 30000);
  setInterval(moversTick, 60000);
  SG.scoreTick = scoreTick;
  SG.hash32 = hash32;
})();
