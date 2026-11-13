/* Signal graphics: rotating torus, bristles, input streams, connections. */
(function () {
  'use strict';
  const SG = window.SG, E = SG.E, CATS = SG.CATS, S = SG.S;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x), lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let _s = 777; const rnd = () => { _s = (_s * 16807) % 2147483647; return _s / 2147483647; };

  /* ------------------------------------------------------------------- torus grid */
  const U = 168, VN = 42, NP = U * VN, R0 = 1, r0 = 0.42;
  const bx = new Float32Array(NP), by = new Float32Array(NP), bz = new Float32Array(NP), nx = new Float32Array(NP), ny = new Float32Array(NP), nz = new Float32Array(NP);
  const sA = new Float32Array(NP), cA = new Float32Array(NP);
  for (let ui = 0; ui < U; ui++) for (let vi = 0; vi < VN; vi++) {
    const p = ui * VN + vi, u = (ui + 0.5 * (vi & 1)) / U * 6.2832, v = vi / VN * 6.2832;
    const cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v), rr = R0 + r0 * cv;
    bx[p] = rr * cu; by[p] = r0 * sv; bz[p] = rr * su; nx[p] = cv * cu; ny[p] = sv; nz[p] = cv * su;
    const ph = u * 6 + v * 3; sA[p] = Math.sin(ph); cA[p] = Math.cos(ph);
  }
  const isAsset = new Uint8Array(NP), cellAsset = new Int32Array(NP).fill(-1);
  function assignCells() {
    isAsset.fill(0); cellAsset.fill(-1);
    let u0 = 0;
    for (const cat in CATS) {
      const cells = CATS[cat].cols * VN, used = new Uint8Array(cells);
      const list = SG.A.filter(a => a.cat === cat && a.live && a.c).sort((x, y) => (x.key < y.key ? -1 : 1));
      for (const a of list) {
        let p = SG.hash32(a.key) % cells, k = 0;
        while (used[p] && k++ < cells) p = (p + 1) % cells;
        used[p] = 1; a.cell = u0 * VN + p; isAsset[a.cell] = 1; cellAsset[a.cell] = a.i;
      }
      u0 += CATS[cat].cols;
    }
    SG.dirty.layout = false;
  }

  /* ----------------------------------------------------------------- input sources */
  const SRC = SG.SRC = [
    { k: 'flow', n: 'فشار خرید و فروش', sub: 'سهم دارایی‌های با جریان خرید', c: '#19e3a1' },
    { k: 'mom', n: 'مومنتوم قیمت', sub: 'سهم دارایی‌های صعودی', c: '#ffc857' },
    { k: 'tech', n: 'فیلتر فنی', sub: 'میانگین قدرت نسبی', c: '#ff8fd0' },
    { k: 'smart', n: 'پول هوشمند', sub: 'خالص نهنگ‌ها و هایپرلیکوید', c: '#38d4ff' },
    { k: 'lev', n: 'اهرم و تصفیه', sub: 'میانگین نرخ تأمین مالی', c: '#b6ff5c' },
    { k: 'macro', n: 'نقدینگی کلان', sub: 'استیبل‌کوین و ریسک بازار', c: '#8b7bff' }
  ];
  const WIN = 15 * 60 * 1000;
  SRC.forEach((s, i) => { s.buf = []; s.has = false; s.txt = '—'; s.val = 0; s.ph = i * 1.9; s.lines = [-0.2, -0.07, 0.07, 0.2]; s.pt = []; for (let j = 0; j < 12; j++) s.pt.push({ o: (j * 0.31 + i * 0.13) % 1, v: 0.12 + 0.07 * ((j * 7 + i * 3) % 5) / 5, pu: 0 }); s.lo = 0; s.hi = 1; });
  const fmtM = v => { const a = Math.abs(v); return (v < 0 ? '-' : '+') + '$' + (a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'K' : Math.round(a)); };
  function aggTick() {
    const now = Date.now(), L = SG.A.filter(a => a.live && a.c && a.f);
    const set = (s, has, val, txt) => { s.has = has; if (has) { s.val = val; s.txt = txt; const b = s.buf; if (!b.length || now - b[b.length - 1].t > 14000) b.push({ t: now, v: val }); else b[b.length - 1].v = val; while (b.length > 70 || (b.length && now - b[0].t > WIN + 60000)) b.shift(); } else s.txt = '—'; };
    const share = k => { let n = 0, p = 0; for (const a of L) if (a.f[k] != null) { n++; if (a.f[k] > 0) p++; } return n ? (p / n) * 100 : null; };
    let v = share('flow'); set(SRC[0], v != null, v, v == null ? '' : Math.round(v) + '٪ خرید');
    v = share('mom'); set(SRC[1], v != null, v, v == null ? '' : Math.round(v) + '٪ صعودی');
    let n = 0, sum = 0, os = 0; for (const a of L) if (a.m && a.m.rsi != null) { n++; sum += a.m.rsi; if (a.m.rsi < 30) os++; }
    set(SRC[2], n > 0, n ? sum / n : 0, n ? 'RSI ' + Math.round(sum / n) + ' · ' + os + ' اشباع فروش' : '');
    let net = 0, any = false; for (const a of L) if (a.wTot > 0 || a.hlTot > 0) { any = true; net += a.wB - a.wS + a.hlB - a.hlS; }
    set(SRC[3], any, net, fmtM(net));
    n = 0; sum = 0; for (const a of L) if (a.fund != null) { n++; sum += a.fund * 100; }
    set(SRC[4], n > 0, n ? sum / n : 0, n ? (sum / n >= 0 ? '+' : '') + (sum / n).toFixed(3) + '٪' : '');
    if (S.stable7 != null) set(SRC[5], true, S.stable7, SG.fmtPct(S.stable7));
    else if (S.env && S.env.riskOn != null) set(SRC[5], true, S.env.riskOn, S.env.riskOn >= 0 ? 'ریسک‌پذیری' : 'ریسک‌گریزی');
    else set(SRC[5], false, 0, '');
    SG.emit('agg');
  }
  SG.aggTick = aggTick;
  setInterval(aggTick, 15000);

  /* --------------------------------------------------------------------- canvas */
  const cv = document.getElementById('fx'), ctx = cv.getContext('2d', { alpha: true });
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, sc = 100, portrait = false;
  const geo = (SG.geo = { LX: 0, LT: 0, LH: 0, LW: 0, RH: 28, GAP: 3, portrait: false });
  function measure() {
    W = innerWidth; H = innerHeight; dpr = Math.min(2, devicePixelRatio || 1);
    const cw = Math.round(W * dpr), ch = Math.round(H * dpr); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    portrait = matchMedia('(max-aspect-ratio:1/1)').matches; geo.portrait = portrait;
    const st = document.getElementById('stage'), sr = st.getBoundingClientRect();
    if (sr.width < 20 || sr.height < 20) return;
    cx = sr.left + sr.width / 2; cy = sr.top + sr.height / 2 + sr.height * 0.01; sc = Math.max(40, Math.min(sr.width / 3.45, sr.height / 2.1));
    for (const s of SRC) {
      if (!s.el) continue;
      const r = s.el.getBoundingClientRect(), k = s.spark.getBoundingClientRect(), t = s.row.getBoundingClientRect();
      s.ax = r.right; s.ay = t.top + t.height * 0.5; s.kx = k.left; s.ky = k.top; s.kw = k.width; s.kh = k.height;
    }
    const list = document.getElementById('list'), lr = list.getBoundingClientRect();
    geo.LX = lr.left + 8; geo.LT = lr.top; geo.LH = lr.height; geo.LW = lr.width - 16;
    const rh = portrait ? 38 : clamp(Math.floor((lr.height - 10) / 20) - 3, 22, 40);
    const changed = rh !== geo.RH; geo.RH = rh;
    SG.emit('geo', changed);
  }
  SG.measure = measure;

  /* sprites */
  function glow(color, inner) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(inner || 0.16, color); gr.addColorStop(0.4, color + '77'); gr.addColorStop(1, color + '00'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
  }
  function star(color) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 20);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, color + 'cc'); gr.addColorStop(1, color + '00'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.4; g.globalAlpha = 0.9; g.beginPath(); g.moveTo(32, 3); g.lineTo(32, 61); g.moveTo(3, 32); g.lineTo(61, 32); g.stroke();
    g.globalAlpha = 0.5; g.lineWidth = 1; g.beginPath(); g.moveTo(14, 14); g.lineTo(50, 50); g.moveTo(50, 14); g.lineTo(14, 50); g.stroke(); return c;
  }
  const SPR = {}; for (const k in CATS) SPR[k] = glow(CATS[k].c);
  const SSPR = SRC.map(s => glow(s.c, 0.22)), STAR = SRC.map(s => star(s.c)), STAR_CAT = {}; for (const k in CATS) STAR_CAT[k] = star(CATS[k].c);

  const TONES = ['46,76,170', '70,115,225', '120,165,255', '184,212,255', '255,255,255'], DA = [0.34, 0.62, 0.97];
  const FILL = []; for (let d = 0; d < 3; d++) for (let t = 0; t < 5; t++) FILL[t * 3 + d] = 'rgba(' + TONES[t] + ',' + DA[d] + ')';
  const buckets = Array.from({ length: 15 }, () => []);
  const px = new Float32Array(NP), py = new Float32Array(NP), pz = new Float32Array(NP), pd = new Uint8Array(NP);
  const LIGHT = (() => { const l = [-0.35, 0.75, -0.55], n = Math.hypot(l[0], l[1], l[2]); return l.map(v => v / n); })();
  let lowQ = false, slow = 0, last = 0;
  let spin = 0, cs = 1, ss = 0, ct = 1, st = 0; const D = 3.3;
  const out = [0, 0];

  function bz4(x0, y0, x1, y1, x2, y2, x3, y3, t, o) {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    o[0] = a * x0 + b * x1 + c * x2 + d * x3; o[1] = a * y0 + b * y1 + c * y2 + d * y3;
  }
  function strokeCurve(x0, y0, x1, y1, x2, y2, x3, y3, t0, t1, n) {
    ctx.beginPath(); bz4(x0, y0, x1, y1, x2, y2, x3, y3, t0, out); ctx.moveTo(out[0], out[1]);
    for (let i = 1; i <= n; i++) { bz4(x0, y0, x1, y1, x2, y2, x3, y3, lerp(t0, t1, i / n), out); ctx.lineTo(out[0], out[1]); }
    ctx.stroke();
  }

  /* bristle bursts */
  const bursts = []; let lastSpawn = 0;
  function spawnBurst(c0, col, strength, dur) {
    if (bursts.length > 16) return;
    const u0 = Math.floor(c0 / VN), v0 = c0 % VN, cells = [], n = 9 + Math.floor(rnd() * 9);
    for (let i = 0; i < n; i++) {
      const du = Math.floor((rnd() - 0.5) * 8), dv = Math.floor((rnd() - 0.5) * 6);
      cells.push({ p: ((u0 + du + U) % U) * VN + ((v0 + dv + VN) % VN), k: 0.55 + rnd() * 0.6 });
    }
    bursts.push({ cells, t0: performance.now() / 1000, dur: dur || 2.8 + rnd() * 1.6, col, str: strength || 1 });
  }
  const OUTER = [0, 1, 2, 3, 39, 40, 41, 38];
  function spawnNear(ex, ey, col, str) {
    const t = performance.now() / 1000; if (t - lastSpawn < 0.22) return; lastSpawn = t;
    let best = -1, bd = 1e9;
    for (let i = 0; i < 70; i++) { const p = Math.floor(rnd() * U) * VN + OUTER[Math.floor(rnd() * OUTER.length)]; if (pz[p] > 0.9) continue; const d = (px[p] - ex) * (px[p] - ex) + (py[p] - ey) * (py[p] - ey); if (d < bd) { bd = d; best = p; } }
    if (best >= 0) spawnBurst(best, col, str);
  }
  let nextAmb = 0.5;

  /* connections asset -> right list */
  const conns = []; let nextEmit = 2;

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || !W) return;
    if (SG.page !== 'net') { if (!SG._cleared) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); SG._cleared = true; } last = 0; return; }
    SG._cleared = false;
    const t = now / 1000, dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016; last = now;
    if (!lowQ) { if (dt > 0.027) slow++; else slow = Math.max(0, slow - 1); if (slow > 100) lowQ = true; }
    if (SG.dirty.layout) assignCells();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);

    /* smooth the displayed scores */
    const kk = 1 - Math.exp(-dt * 1.8);
    for (const a of SG.A) { if (!a.live || !a.c) continue; if (!a.seenFrame) { a.ss = a.target; a.seenFrame = 1; } else a.ss += (a.target - a.ss) * kk; a.s = Math.abs(a.ss); a.dir = a.ss >= 0 ? 1 : -1; }

    /* ---- torus points ---- */
    spin = t * 0.075; const tilt = 0.5 + 0.035 * Math.sin(t * 0.21);
    cs = Math.cos(spin); ss = Math.sin(spin); ct = Math.cos(tilt); st = Math.sin(tilt);
    const sB = Math.sin(-1.1 * t), cB = Math.cos(-1.1 * t), step = lowQ ? 2 : 1;
    for (let b = 0; b < 15; b++) buckets[b].length = 0;
    for (let p = 0; p < NP; p++) {
      const dr = 0.016 * (sA[p] * cB + cA[p] * sB), x = bx[p] + nx[p] * dr, y = by[p] + ny[p] * dr, z = bz[p] + nz[p] * dr;
      const x1 = x * cs + z * ss, z1 = -x * ss + z * cs, y2 = y * ct + z1 * st, z2 = -y * st + z1 * ct, f = D / (D + z2);
      px[p] = cx + x1 * f * sc; py[p] = cy - y2 * f * sc; pz[p] = z2;
      const dn = clamp(0.5 - z2 / 2.9, 0, 1); pd[p] = dn < 0.36 ? 0 : dn < 0.62 ? 1 : 2;
      if (isAsset[p] || (step === 2 && (p & 1))) continue;
      const X = nx[p], Y = ny[p], Z = nz[p], X1 = X * cs + Z * ss, Z1 = -X * ss + Z * cs, Y2 = Y * ct + Z1 * st, Z2 = -Y * st + Z1 * ct;
      const lit = 0.5 + 0.5 * (X1 * LIGHT[0] + Y2 * LIGHT[1] + Z2 * LIGHT[2]);
      buckets[Math.min(4, (lit * 5) | 0) * 3 + pd[p]].push(p);
    }
    const ps = clamp(sc / 200, 0.8, 1.45);
    for (let d = 0; d < 3; d++) {
      const s = (d === 0 ? 1 : d === 1 ? 1.35 : 1.8) * ps, h = s / 2;
      for (let tn = 0; tn < 5; tn++) { const arr = buckets[tn * 3 + d]; if (!arr.length) continue; ctx.fillStyle = FILL[tn * 3 + d]; ctx.beginPath(); for (let i = 0; i < arr.length; i++) { const p = arr[i]; ctx.rect(px[p] - h, py[p] - h, s, s); } ctx.fill(); }
    }

    /* ---- bristle bursts ---- */
    if (t > nextAmb) { nextAmb = t + 0.45 + rnd() * 0.7; spawnBurst(Math.floor(rnd() * U) * VN + OUTER[Math.floor(rnd() * OUTER.length)], rnd() < 0.2 ? '#7fd7ff' : '#ffdf8a', 0.7 + rnd() * 0.5); }
    ctx.lineWidth = 1;
    for (let bi = bursts.length - 1; bi >= 0; bi--) {
      const b = bursts[bi], age = t - b.t0; if (age > b.dur) { bursts.splice(bi, 1); continue; }
      const k = Math.pow(Math.sin((age / b.dur) * Math.PI), 1.3) * b.str; ctx.strokeStyle = b.col; ctx.fillStyle = '#fff2c4';
      for (let dd = 0; dd < 3; dd++) {
        ctx.globalAlpha = (dd === 0 ? 0.3 : dd === 1 ? 0.55 : 0.9) * clamp(k, 0, 1); ctx.beginPath();
        for (const c of b.cells) {
          const p = c.p; if (pd[p] !== dd) continue; const f = D / (D + pz[p]), L = 0.2 * k * c.k * sc * f;
          const X = nx[p], Y = ny[p], Z = nz[p], X1 = X * cs + Z * ss, Z1 = -X * ss + Z * cs, Y2 = Y * ct + Z1 * st;
          const tx = px[p] + X1 * L, ty = py[p] - Y2 * L; ctx.moveTo(px[p], py[p]); ctx.lineTo(tx, ty);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    /* ---- assets: spikes + dots ---- */
    const NA = SG.A.length;
    for (let i = 0; i < NA; i++) { const a = SG.A[i]; if (!a.live || !a.c) continue; const p = a.cell; a.x = px[p]; a.y = py[p]; a.z = pz[p]; a.db = pd[p]; }
    const asz = sc / 200;
    for (let d = 0; d < 3; d++) {
      for (let i = 0; i < NA; i++) {
        const a = SG.A[i]; if (!a.live || !a.c || a.db !== d || !isAsset[a.cell]) continue;
        const p = a.cell, col = CATS[a.cat].c, f = D / (D + a.z), k = sstep(30, 62, a.s);
        if (k > 0.01) {
          const L = 0.34 * k * sc * f, X = nx[p], Y = ny[p], Z = nz[p], X1 = X * cs + Z * ss, Z1 = -X * ss + Z * cs, Y2 = Y * ct + Z1 * st;
          const tx = a.x + X1 * L, ty = a.y - Y2 * L;
          ctx.globalAlpha = (d === 0 ? 0.35 : d === 1 ? 0.6 : 0.95) * (0.45 + 0.55 * k); ctx.strokeStyle = col; ctx.lineWidth = d === 2 ? 1.2 : 0.9; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(tx, ty); ctx.stroke();
          ctx.globalAlpha = d === 0 ? 0.4 : 0.85; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tx, ty, 0.8 + k * 0.7, 0, 6.2832); ctx.fill();
        }
        const size = (6 + 9 * (a.s / 100)) * asz * f * (a.rank >= 0 ? 1.3 : 1);
        ctx.globalAlpha = d === 0 ? 0.5 : d === 1 ? 0.78 : 1; ctx.drawImage(SPR[a.cat], a.x - size / 2, a.y - size / 2, size, size);
        if (a.rank >= 0 && d > 0) { ctx.globalAlpha = 0.65; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(a.x, a.y, size * 0.5 + 1.5, 0, 6.2832); ctx.stroke(); }
      }
    }
    ctx.globalAlpha = 1;

    /* ---- input streams: card -> shell ---- */
    const rx = sc * (R0 + r0) * 0.97, ry = sc * (r0 * ct + (R0 + r0) * st) * 0.92;
    for (let si = 0; si < SRC.length; si++) {
      const s = SRC[si]; if (!s.el || s.ax == null) continue;
      const dim = s.has ? 1 : 0.45, ang0 = Math.atan2(s.ay - cy, s.ax - cx);
      /* sparkline */
      if (s.kw > 4) {
        const b = s.buf, now0 = Date.now();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (b.length) {
          let lo = Infinity, hi = -Infinity; for (const p of b) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
          if (hi - lo < 1e-9) { lo -= 1; hi += 1; } const pad = (hi - lo) * 0.18; lo -= pad; hi += pad;
          s.lo += (lo - s.lo) * 0.08; s.hi += (hi - s.hi) * 0.08; if (!s.init) { s.lo = lo; s.hi = hi; s.init = 1; }
          const pts = b.map(p => [s.kx + s.kw * (1 - (now0 - p.t) / WIN), s.ky + s.kh - ((p.v - s.lo) / (s.hi - s.lo)) * s.kh]); pts.push([s.kx + s.kw, pts[pts.length - 1][1]]);
          for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle = s.c; ctx.globalAlpha = (pass ? 0.95 : 0.22) * dim; ctx.lineWidth = pass ? 1.6 : 5; ctx.beginPath();
            let started = false;
            for (let i = 0; i < pts.length; i++) { const q = pts[i]; if (q[0] < s.kx - 1) continue; if (!started) { ctx.moveTo(Math.max(q[0], s.kx), q[1]); started = true; } else ctx.lineTo(q[0], q[1]); }
            ctx.stroke();
          }
          const e = pts[pts.length - 1]; ctx.globalAlpha = dim; ctx.drawImage(SSPR[si], e[0] - 6, e[1] - 6, 12, 12);
        } else { ctx.strokeStyle = s.c; ctx.globalAlpha = 0.25; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(s.kx, s.ky + s.kh / 2); ctx.lineTo(s.kx + s.kw, s.ky + s.kh / 2); ctx.stroke(); ctx.setLineDash([]); }
      }
      /* wires */
      ctx.globalAlpha = 1; ctx.drawImage(SSPR[si], s.ax - 7, s.ay - 7, 14, 14);
      for (let li = 0; li < 4; li++) {
        const ang = ang0 + s.lines[li] * 0.85, dx = Math.cos(ang), dy = Math.sin(ang), nm = Math.sqrt((dx / rx) * (dx / rx) + (dy / ry) * (dy / ry));
        const sway = Math.sin(t * 0.35 + si * 1.7 + li * 2.1) * sc * 0.02, ex = cx + (dx / nm) * 0.95 + sway, ey = cy + (dy / nm) * 0.95 + sway * 0.7;
        const sag = (ey - s.ay) * (0.25 + 0.12 * Math.sin(t * 0.3 + li + si)), x0 = s.ax + 4, y0 = s.ay;
        const x1 = x0 + (ex - x0) * 0.5, y1 = y0 + sag, x2 = ex - (ex - x0) * 0.3, y2 = ey - sag * 0.6;
        ctx.globalAlpha = 0.34 * dim; ctx.strokeStyle = s.c; ctx.lineWidth = 0.8; strokeCurve(x0, y0, x1, y1, x2, y2, ex, ey, 0, 1, 24);
        ctx.globalAlpha = 0.5 * dim; ctx.drawImage(SSPR[si], ex - 6, ey - 6, 12, 12);
        for (let pi = 0; pi < 3; pi++) {
          const q = s.pt[li * 3 + pi], u = (q.o + t * q.v) % 1, env = Math.sin(u * Math.PI);
          if (u < q.pu) spawnNear(ex, ey, s.c, 0.8 + rnd() * 0.6);
          q.pu = u;
          ctx.globalAlpha = 0.7 * env * dim; ctx.lineWidth = 1.4; strokeCurve(x0, y0, x1, y1, x2, y2, ex, ey, Math.max(0, u - 0.09), u, 5);
          bz4(x0, y0, x1, y1, x2, y2, ex, ey, u, out); const hs = pi === 0 ? 13 : 9;
          ctx.globalAlpha = 0.95 * env * dim; ctx.drawImage(pi === 0 ? STAR[si] : SSPR[si], out[0] - hs / 2, out[1] - hs / 2, hs, hs);
        }
      }
    }
    ctx.globalAlpha = 1;

    /* ---- connections: asset -> top-20 list ---- */
    const listEl = document.getElementById('list'), stl = listEl.scrollTop, g = geo;
    if (t > nextEmit && conns.length < 4 && SG.top20 && SG.top20.length) {
      let tot = 0; const cand = [];
      for (const a of SG.top20) {
        const y = g.LT + a.rank * (g.RH + g.GAP) + g.RH / 2 - stl; if (y < g.LT + 6 || y > g.LT + g.LH - 6) continue;
        if (a.x < cx - sc * 0.1 || a.db < 1 || conns.some(c => c.a === a)) continue; const w = a.s * a.s + 1; cand.push([a, w]); tot += w;
      }
      if (cand.length) { let r = rnd() * tot, pick = cand[0][0]; for (const c of cand) { r -= c[1]; if (r <= 0) { pick = c[0]; break; } } conns.push({ a: pick, b: t, life: 3.4 + rnd() * 1.2, k: rnd() }); const el = SG.rowOf && SG.rowOf(pick); if (el) el.classList.add('hot'); spawnBurst(pick.cell, CATS[pick.cat].c, 1.1, 2.4); }
      nextEmit = t + 0.55 + rnd() * 0.7;
    }
    for (let ci = conns.length - 1; ci >= 0; ci--) {
      const c = conns[ci], a = c.a, age = t - c.b;
      if (age > c.life || a.rank < 0 || a.db < 1) { const el = SG.rowOf && SG.rowOf(a); if (el) el.classList.remove('hot'); conns.splice(ci, 1); continue; }
      const env = sstep(0, 0.5, age) * (1 - sstep(c.life - 0.9, c.life, age)), grow = sstep(0, 1.1, age), ty = g.LT + a.rank * (g.RH + g.GAP) + g.RH / 2 - stl, col = CATS[a.cat].c;
      let x0 = a.x, y0 = a.y, x1, y1, x2, y2, x3, y3;
      if (portrait) { x3 = lerp(g.LX + 34, g.LX + g.LW - 34, a.rank / 19); y3 = g.LT + 3; x1 = x0; y1 = y0 + (y3 - y0) * 0.55; x2 = x3; y2 = y3 - (y3 - y0) * 0.4; }
      else { x3 = g.LX; y3 = ty; x1 = x0 + (x3 - x0) * 0.5; y1 = y0; x2 = x3 - (x3 - x0) * 0.38; y2 = y3; }
      ctx.strokeStyle = col; ctx.globalAlpha = 0.55 * env; ctx.lineWidth = 1.2; strokeCurve(x0, y0, x1, y1, x2, y2, x3, y3, 0, grow, 28);
      const u = ((age * 0.5 + c.k) % 1) * grow; ctx.globalAlpha = 0.9 * env; ctx.lineWidth = 2; strokeCurve(x0, y0, x1, y1, x2, y2, x3, y3, Math.max(0, u - 0.1), u, 6);
      bz4(x0, y0, x1, y1, x2, y2, x3, y3, u, out); ctx.drawImage(STAR_CAT[a.cat], out[0] - 8, out[1] - 8, 16, 16);
      bz4(x0, y0, x1, y1, x2, y2, x3, y3, grow, out); ctx.globalAlpha = 0.9 * env; ctx.drawImage(SPR[a.cat], out[0] - 6, out[1] - 6, 12, 12);
      ctx.drawImage(STAR_CAT[a.cat], x0 - 7, y0 - 7, 14, 14);
    }
    ctx.globalAlpha = 1;
  }

  SG.pickAsset = (x, y) => {
    let best = null, bd = 26 * 26;
    for (const a of SG.A) { if (!a.live || !a.c || !isAsset[a.cell] || a.db < 1) continue; const d = (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y); if (d < bd) { bd = d; best = a; } }
    return best;
  };
  SG.burstAt = a => { if (a && isAsset[a.cell]) spawnBurst(a.cell, CATS[a.cat].c, 1.4, 3); };
  SG.startFx = () => { measure(); requestAnimationFrame(frame); };
})();
