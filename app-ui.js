/* Signal UI: top-20 list, pages (live feed, history), detail sheet, drawer, boot. */
(function () {
  'use strict';
  const SG = window.SG, E = SG.E, CATS = SG.CATS, S = SG.S;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = E.clamp, fmtP = SG.fmtP, fmtPct = SG.fmtPct;
  const hexRgba = (h, a) => { const n = parseInt(h.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };
  const CATKEYS = Object.keys(CATS);
  const LBL = { flow: 'فشار خرید و فروش', mom: 'مومنتوم قیمت', tech: 'فیلتر فنی', smart: 'پول هوشمند', lev: 'اهرم و تصفیه', macro: 'نقدینگی کلان' };
  const FCOL = { flow: '#19e3a1', mom: '#ffc857', tech: '#ff8fd0', smart: '#38d4ff', lev: '#b6ff5c', macro: '#8b7bff' };
  SG.page = 'net';

  /* ------------------------------------------------------------ input cards */
  const left = $('#left');
  SG.SRC.forEach(s => {
    const el = document.createElement('div'); el.className = 'src'; el.style.setProperty('--c', s.c);
    el.innerHTML = '<div class="srow"><span class="sn">' + s.n + '</span><b class="sv">—</b></div><div class="ssub">' + s.sub + '</div><div class="spark"></div>';
    left.appendChild(el); s.el = el; s.row = el.firstChild; s.sv = el.querySelector('.sv'); s.spark = el.querySelector('.spark');
  });
  SG.on('agg', () => SG.SRC.forEach(s => { s.sv.textContent = s.txt || '—'; s.el.style.opacity = s.has ? 1 : 0.55; }));

  /* ------------------------------------------------------------------ top 20 */
  const list = $('#list'), inner = $('#inner'), rows = new Map(), pool = [];
  SG.top20 = [];
  SG.rowOf = a => rows.get(a.key);
  function mkRow() {
    const el = pool.pop() || (() => {
      const e = document.createElement('div'); e.className = 'row';
      e.innerHTML = '<i class="cd"></i><b class="tk"></b><span class="dr"></span><em class="sc"></em><u class="bar"><s></s></u><span class="pr"></span>';
      e.cd = e.children[0]; e.tk = e.children[1]; e.dr = e.children[2]; e.sc = e.children[3]; e.bf = e.children[4].firstChild; e.pr = e.children[5];
      inner.appendChild(e); return e;
    })();
    return el;
  }
  const dirGrad = d => (d > 0 ? 'linear-gradient(90deg,#0fae7d,#19e3a1)' : 'linear-gradient(90deg,#c93a56,#ff4d6d)');
  function fillRow(el, a) {
    const c = CATS[a.cat].c; el.dataset.k = a.key; el.style.setProperty('--cc', c); el.style.setProperty('--tint', hexRgba(c, 0.16)); el.classList.remove('hot');
    el.cd.style.background = c; el.cd.style.boxShadow = '0 0 8px ' + c; el.tk.textContent = a.d; el.tk.style.fontSize = a.d.length > 6 ? '10.5px' : '';
    el._d = 0; el._s = -1; el._p = ''; updRow(el, a);
  }
  function updRow(el, a) {
    const d = a.dir, s = Math.round(a.s);
    if (el._d !== d) { el._d = d; el.dr.textContent = d > 0 ? 'خرید' : 'فروش'; el.dr.className = 'dr ' + (d > 0 ? 'L' : 'S'); el.bf.style.background = dirGrad(d); }
    if (el._s !== s) { el._s = s; el.sc.textContent = s; }
    const p = fmtP(a.price); if (el._p !== p) { el._p = p; el.pr.textContent = p; }
    el.bf.style.transform = 'scaleX(' + clamp(a.s / 100, 0.02, 1).toFixed(3) + ')';
  }
  function placeRows() {
    const g = SG.geo; list.style.setProperty('--rh', g.RH + 'px'); inner.style.height = 20 * (g.RH + g.GAP) + 'px';
    rows.forEach((el, k) => { const a = SG.byKey.get(k); if (a && a.rank >= 0) el.style.transform = 'translateY(' + a.rank * (g.RH + g.GAP) + 'px)'; });
  }
  SG.on('geo', placeRows);
  let rerankAt = 0;
  function rerank() {
    const g = SG.geo, cur = new Set(SG.top20.map(a => a.key));
    const cand = SG.A.filter(a => a.live && a.c && a.nf > 0);
    cand.sort((p, q) => q.s + (cur.has(q.key) ? 2.5 : 0) - (p.s + (cur.has(p.key) ? 2.5 : 0)));
    const sorted = cand.slice(0, 20); sorted.sort((p, q) => q.s - p.s);
    const nxt = new Set(sorted.map(a => a.key));
    rows.forEach((el, k) => { if (!nxt.has(k)) { el.style.opacity = '0'; el.classList.remove('hot'); const a = SG.byKey.get(k); if (a) a.rank = -1; rows.delete(k); setTimeout(() => { if (!rows.has(el.dataset.k)) { el.style.transform = 'translateY(0px)'; pool.push(el); } }, 800); } });
    sorted.forEach((a, r) => {
      a.rank = r; let el = rows.get(a.key);
      if (!el) { el = mkRow(); el.style.transition = 'none'; fillRow(el, a); el.style.opacity = '0'; el.style.transform = 'translateY(' + r * (g.RH + g.GAP) + 'px)'; void el.offsetHeight; el.style.transition = ''; el.style.opacity = '1'; rows.set(a.key, el); }
      else { updRow(el, a); el.style.transform = 'translateY(' + r * (g.RH + g.GAP) + 'px)'; }
    });
    SG.top20 = sorted;
  }
  inner.addEventListener('click', e => { const r = e.target.closest('.row'); if (r) { const a = SG.byKey.get(r.dataset.k); if (a) openSheet(a); } });
  $('#stage').addEventListener('click', e => { const a = SG.pickAsset(e.clientX, e.clientY); if (a) { SG.burstAt(a); openSheet(a); } });

  /* ------------------------------------------------------------ legend, status */
  function tickInfo() {
    const live = SG.A.filter(a => a.live && a.c), cnt = {}; CATKEYS.forEach(k => (cnt[k] = 0)); live.forEach(a => cnt[a.cat]++);
    $('#legend').innerHTML = CATKEYS.map(k => '<span><i style="background:' + CATS[k].c + ';box-shadow:0 0 8px ' + CATS[k].c + '"></i>' + CATS[k].n + ' <b>' + cnt[k] + '</b></span>').join('');
    const strong = live.filter(a => a.lvl === 'strong').length;
    $('#cap').innerHTML = '<b>' + live.length + '</b> دارایی در شبکه&nbsp;&nbsp;·&nbsp;&nbsp;<b>' + strong + '</b> سیگنال قوی';
    const m = S.mode; const pill = $('#pill'); pill.className = 'pill ' + m;
    $('#pillTx').textContent = m === 'live' ? 'زنده' : m === 'cached' ? 'ذخیره‌شده' : m === 'demo' ? 'نمایشی' : 'در حال اتصال';
    const b = $('#banner'); let msg = '';
    if (m === 'demo') msg = 'اتصال به منابع داده برقرار نشد. اطلاعات فعلی نمایشی و ساختگی است و ثبت نمی‌شود. فیلترشکن را روشن کنید و تلاش دوباره بزنید.';
    else if (m === 'cached') msg = 'اتصال برقرار نشد. آخرین داده ذخیره‌شده (' + SG.ago(S.snapT || S.modeT) + ') نمایش داده می‌شود.';
    else if (m === 'live' && cnt.stock + cnt.index + cnt.fx + cnt.com === 0) msg = 'داده سهام، شاخص‌ها، فارکس، طلا و نفت هنوز دریافت نشده است. فقط کریپتو فعال است.';
    b.classList.toggle('on', !!msg); $('#bannerTx').textContent = msg;
  }
  $('#retry').onclick = () => { SG.log('تلاش دوباره'); SG.boot2 && SG.boot2(); };

  /* ------------------------------------------------------------------- pages */
  function setPage(p, push) {
    if (SG.page === p) return;
    SG.page = p; SG._cleared = false;
    $$('.page').forEach(el => el.classList.toggle('on', el.id === 'pg' + p[0].toUpperCase() + p.slice(1)));
    $$('.nb').forEach(b => b.classList.toggle('on', b.dataset.p === p));
    if (push) { try { history.pushState({ p }, ''); } catch (e) { } }
    if (p === 'net') setTimeout(SG.measure, 30);
    if (p === 'feed') { feedPending = 0; $('#feedBd').classList.remove('on'); badge = 0; renderFeed(true); }
    if (p === 'hist') renderHist();
  }
  $$('.nb').forEach(b => b.onclick = () => setPage(b.dataset.p, b.dataset.p !== 'net'));
  try { history.replaceState({ p: 'net' }, ''); } catch (e) { }
  addEventListener('popstate', e => { closeOverlays(true); setPage((e.state && e.state.p) || 'net', false); });

  /* -------------------------------------------------------------------- chips */
  function chipRow(el, items, cur, onPick) {
    el.innerHTML = items.map(i => i === '|' ? '<span style="flex:none;width:1px;background:rgba(255,255,255,.12);margin:2px 2px"></span>' : '<button class="chip' + (i[0] === cur(i) ? ' on' : '') + '" data-v="' + i[0] + '">' + i[1] + '</button>').join('');
    el.onclick = e => { const b = e.target.closest('.chip'); if (b) onPick(b.dataset.v, b.dataset.g); };
  }
  const CAT_ITEMS = [['all', 'همه']].concat(CATKEYS.map(k => [k, CATS[k].n]));

  /* ------------------------------------------------------------- live feed page */
  const TY_ITEMS = [['all', 'همه رویدادها'], ['sig', 'سیگنال‌ها'], ['whale', 'نهنگ‌ها'], ['liq', 'تصفیه‌ها'], ['tgt', 'هدف‌ها و حد ضرر'], ['move', 'حرکت‌های شدید']];
  let feedShown = 120, feedPending = 0, badge = 0;
  const feedEl = $('#feedList');
  const feedOK = ev => (S.feedCat === 'all' || ev.cat === S.feedCat) && (S.feedTy === 'all' || ev.ty === S.feedTy);
  function evHTML(ev, isNew) {
    const c = CATS[ev.cat] || { n: '', c: '#8a97b8' };
    return '<div class="ev' + (isNew ? ' new' : '') + '" data-k="' + esc(ev.cat + ':' + ev.sym) + '"><i class="edot" style="color:' + ev.col + '"></i><div class="eb"><div class="et"><b>' + esc(ev.sym) + '</b><span class="tag">' + c.n + '</span></div><div class="ex">' + esc(ev.txt) + '</div></div><div class="etime">' + SG.fmtTime(ev.t) + '<br>' + SG.fmtDate(ev.t) + '</div></div>';
  }
  function feedChips() {
    chipRow($('#feedCats'), CAT_ITEMS, i => S.feedCat, v => { S.feedCat = v; SG.saveCfg(); feedChips(); renderFeed(true); });
    chipRow($('#feedTys'), TY_ITEMS, i => S.feedTy, v => { S.feedTy = v; SG.saveCfg(); feedChips(); renderFeed(true); });
  }
  function renderFeed(reset) {
    if (reset) { feedShown = 120; feedEl.scrollTop = 0; feedPending = 0; $('#feedNew').classList.remove('on'); }
    const fl = SG.feed.filter(feedOK);
    feedEl.innerHTML = fl.length ? fl.slice(0, feedShown).map(e => evHTML(e)).join('') : '<div class="empty">رویدادی با این فیلتر ثبت نشده است. رویدادها هنگام باز بودن برنامه جمع می‌شوند و ذخیره می‌مانند.</div>';
  }
  feedEl.addEventListener('scroll', () => {
    if (feedEl.scrollTop + feedEl.clientHeight > feedEl.scrollHeight - 300) { const fl = SG.feed.filter(feedOK); if (feedShown < fl.length) { const old = feedShown; feedShown += 120; feedEl.insertAdjacentHTML('beforeend', fl.slice(old, feedShown).map(e => evHTML(e)).join('')); } }
    if (feedEl.scrollTop < 6 && feedPending) { feedPending = 0; $('#feedNew').classList.remove('on'); renderFeed(false); }
  });
  $('#feedNew').onclick = () => renderFeed(true);
  feedEl.addEventListener('click', e => { const r = e.target.closest('.ev'); if (r) { const a = SG.byKey.get(r.dataset.k); if (a) openSheet(a); } });
  SG.on('ev', ev => {
    if (SG.page !== 'feed') { if (ev.ty !== 'move' || true) { badge = Math.min(99, badge + 1); const b = $('#feedBd'); b.textContent = badge; b.classList.add('on'); } return; }
    if (!feedOK(ev)) return;
    if (feedEl.scrollTop < 6) { const empty = feedEl.querySelector('.empty'); if (empty) feedEl.innerHTML = ''; feedEl.insertAdjacentHTML('afterbegin', evHTML(ev, true)); }
    else { feedPending++; const p = $('#feedNew'); p.textContent = '↑ ' + feedPending + ' رویداد جدید'; p.classList.add('on'); }
  });
  SG.on('feedreset', () => { if (SG.page === 'feed') renderFeed(true); });

  /* ----------------------------------------------------------- history page */
  const histEl = $('#histList'); let histShown = 80, histT = 0;
  const DIR_ITEMS = [['all', 'همه جهت‌ها', 'dir'], ['L', 'خرید', 'dir'], ['S', 'فروش', 'dir']], ST_ITEMS = [['all', 'همه وضعیت‌ها', 'st'], ['open', 'فعال', 'st'], ['hit', 'به هدف رسیده', 'st'], ['stop', 'حد ضرر', 'st']];
  function histChips() {
    chipRow($('#histCats'), CAT_ITEMS, i => S.histCat, v => { S.histCat = v; SG.saveCfg(); histChips(); renderHist(true); });
    const el = $('#histOpts'), items = DIR_ITEMS.concat(['|'], ST_ITEMS);
    el.innerHTML = items.map(i => i === '|' ? '<span style="flex:none;width:1px;background:rgba(255,255,255,.12);margin:2px 2px"></span>' : '<button class="chip' + (i[2] === 'dir' ? (i[0] === S.histDir ? ' on' : '') : (i[0] === S.histSt ? ' on' : '')) + '" data-v="' + i[0] + '" data-g="' + i[2] + '">' + i[1] + '</button>').join('');
    el.onclick = e => { const b = e.target.closest('.chip'); if (!b) return; if (b.dataset.g === 'dir') S.histDir = b.dataset.v; else S.histSt = b.dataset.v; SG.saveCfg(); histChips(); renderHist(true); };
  }
  const stOf = r => E.statusOf(r);
  function histOK(r) {
    if (S.histCat !== 'all' && r.cat !== S.histCat) return false;
    if (S.histDir === 'L' && r.dir < 0) return false; if (S.histDir === 'S' && r.dir > 0) return false;
    const st = stOf(r);
    if (S.histSt === 'open' && st !== 'open') return false; if (S.histSt === 'hit' && st !== 't1' && st !== 't2') return false; if (S.histSt === 'stop' && st !== 'stop') return false;
    return true;
  }
  function histCard(r) {
    const a = SG.byKey.get(r.k), now = a && a.price ? a.price : r.now, pnl = r.dir * (now / r.e - 1) * 100, st = stOf(r);
    const stTxt = { open: 'فعال', t1: 'هدف اول ✓', t2: 'هدف دوم ✓', stop: 'حد ضرر ✗', expired: 'پایان ۳۰ روز' }[st];
    const L = r.dir > 0, best = L ? 'بیشترین رشد' : 'بیشترین ریزش';
    return '<div class="hc ' + (L ? 'L' : 'S') + '" data-k="' + esc(r.k) + '"><div class="hh"><i class="cd" style="width:9px;height:9px;border-radius:50%;background:' + CATS[r.cat].c + '"></i><b class="sym">' + esc(r.d || r.sym) + '</b><span class="bdg ' + (L ? 'L' : 'S') + '">' + (L ? 'خرید' : 'فروش') + '</span><span class="bdg n">امتیاز ' + r.sc + '</span><span class="st ' + st + '">' + stTxt + '</span></div>'
      + '<div class="hw">ورود: ' + SG.fmtDate(r.t) + ' ساعت ' + SG.fmtTime(r.t) + ' · ' + SG.ago(r.t) + '</div>'
      + '<div class="hg"><div><small>اکنون</small><b>' + fmtP(now) + '</b><em class="' + (pnl >= 0 ? 'up' : 'dn') + '">' + fmtPct(pnl) + ' از ورود</em></div>'
      + '<div><small>' + best + '</small><b class="up">' + fmtPct(r.up) + '</b><em>' + (r.up > 0 ? SG.ago(r.upT) : '—') + '</em></div>'
      + '<div><small>بیشترین ضرر</small><b class="dn">' + fmtPct(r.dn) + '</b><em>' + (r.dn < 0 ? SG.ago(r.dnT) : '—') + '</em></div>'
      + '<div><small>ناحیه ورود</small><b>' + fmtP(r.zl) + '–' + fmtP(r.zh) + '</b><em>قیمت ورود ' + fmtP(r.e) + '</em></div></div>'
      + '<div class="hl"><span class="' + (r.hs ? 'bad' : '') + '">حد ضرر <b>' + fmtP(r.st) + '</b>' + (r.hs ? ' ✗' : '') + '</span><span class="' + (r.h1 ? 'ok' : '') + '">هدف ۱ <b>' + fmtP(r.t1) + '</b>' + (r.h1 ? ' ✓' : '') + '</span><span class="' + (r.h2 ? 'ok' : '') + '">هدف ۲ <b>' + fmtP(r.t2) + '</b>' + (r.h2 ? ' ✓' : '') + '</span></div></div>';
  }
  function renderHist(reset) {
    if (reset) { histShown = 80; histEl.scrollTop = 0; }
    const all = SG.hist.slice().sort((a, b) => b.t - a.t), cut = Date.now() - 30 * 864e5, mon = all.filter(r => r.t > cut);
    const nHit = mon.filter(r => r.h1).length, nStop = mon.filter(r => r.hs).length, nOpen = mon.filter(r => stOf(r) === 'open').length;
    $('#histStats').innerHTML = '<div class="hs"><small>سیگنال‌های ۳۰ روز اخیر</small><b>' + mon.length + '</b></div><div class="hs"><small>فعال</small><b>' + nOpen + '</b></div><div class="hs"><small>رسیده به هدف اول</small><b class="up">' + nHit + (mon.length ? ' (' + Math.round(nHit / mon.length * 100) + '٪)' : '') + '</b></div><div class="hs"><small>حد ضرر خورده</small><b class="dn">' + nStop + '</b></div>';
    const fl = all.filter(histOK), part = fl.slice(0, histShown);
    if (!part.length) { histEl.innerHTML = '<div class="empty">' + (SG.hist.length ? 'سیگنالی با این فیلتر وجود ندارد.' : 'هنوز سیگنالی ثبت نشده است. هر دارایی که امتیازش به ' + S.thresh + ' برسد در اینجا ثبت می‌شود و تا ۴۵ روز می‌ماند.') + '</div>'; return; }
    let html = '', day = '';
    for (const r of part) { const d = SG.fmtDate(r.t); if (d !== day) { day = d; const today = SG.fmtDate(Date.now()) === d ? ' · امروز' : SG.fmtDate(Date.now() - 864e5) === d ? ' · دیروز' : ''; html += '<div class="dh2">' + d + today + '</div>'; } html += histCard(r); }
    if (fl.length > part.length) html += '<div class="empty">برای دیدن موارد قدیمی‌تر پایین بروید</div>';
    const top = histEl.scrollTop; histEl.innerHTML = html; histEl.scrollTop = top;
  }
  histEl.addEventListener('scroll', () => { if (histEl.scrollTop + histEl.clientHeight > histEl.scrollHeight - 300) { const n = SG.hist.filter(histOK).length; if (histShown < n) { histShown += 80; renderHist(); } } });
  histEl.addEventListener('click', e => { const r = e.target.closest('.hc'); if (r) { const a = SG.byKey.get(r.dataset.k); if (a) openSheet(a); } });
  SG.on('hist', () => { if (SG.page !== 'hist' || Date.now() - histT < 1500) return; histT = Date.now(); renderHist(); });

  /* ------------------------------------------------------------ detail sheet */
  let sheetKey = null, liqCache = {};
  function pushOverlay() { try { if (!(history.state && history.state.o)) history.pushState({ o: 1, p: SG.page }, ''); } catch (e) { } }
  function closeOverlays(fromPop) {
    sheetKey = null; $('#sheet').classList.remove('on'); $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on'); document.body.classList.remove('lock');
    try { if (fromPop !== true && history.state && history.state.o) history.back(); } catch (e) { }
  }
  $('#scrim').onclick = () => closeOverlays();
  $('#closeD').onclick = () => closeOverlays();
  function detailOf(a, k) {
    const m = a.m || {};
    if (k === 'flow') return a.taker != null ? 'نسبت خرید به فروش ' + a.taker.toFixed(2) : a.cat === 'crypto' ? fmtPct(a.ch24) + ' در ۲۴ ساعت' : 'جریان حجم و موقعیت بسته‌شدن کندل‌ها';
    if (k === 'mom') return m.r1 != null ? fmtPct(m.r1) + ' روزانه · ' + fmtPct(m.r5) + ' پنج‌روزه' : '—';
    if (k === 'tech') return m.rsi != null ? 'RSI ' + m.rsi.toFixed(0) + ' · مکدی ' + (m.mh > m.mhp ? 'رو به بالا' : 'رو به پایین') : '—';
    if (k === 'smart') { const p = []; if (a.wTot > 0) p.push('نهنگ‌ها خرید ' + SG.fmtU(a.wB) + ' / فروش ' + SG.fmtU(a.wS)); if (a.hlTot > 0) p.push('هایپرلیکوید خرید ' + SG.fmtU(a.hlB) + ' / فروش ' + SG.fmtU(a.hlS)); if (a.hlPos) p.push('موقعیت خالص ' + (a.hlPos > 0 ? 'خرید ' : 'فروش ') + SG.fmtU(Math.abs(a.hlPos))); return p.join(' · ') || '—'; }
    if (k === 'lev') return a.fund != null ? 'نرخ تأمین ' + (a.fund * 100).toFixed(3) + '٪' + (a.oiChg != null ? ' · قرارداد باز ' + fmtPct(a.oiChg) : '') : '—';
    if (k === 'macro') { const e = S.env || {}; if (a.cat === 'crypto') return (S.stable7 != null ? 'استیبل‌کوین ' + fmtPct(S.stable7) : '') + (e.riskOn != null ? ' · ریسک بازار ' + (e.riskOn >= 0 ? 'مثبت' : 'منفی') : ''); return (e.riskOn != null ? 'ریسک بازار ' + (e.riskOn >= 0 ? 'مثبت' : 'منفی') : '') + (e.usd != null ? ' · دلار ' + (e.usd >= 0 ? 'قوی‌تر' : 'ضعیف‌تر') : ''); }
    return '';
  }
  function chartSVG(a, lv) {
    const c = a.c.slice(-168), n = c.length; if (n < 5) return '';
    let lo = Math.min.apply(null, c), hi = Math.max.apply(null, c);
    if (lv) { lo = Math.min(lo, lv.stop, lv.zone[0]); hi = Math.max(hi, lv.t1, lv.zone[1]); }
    const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    const X = i => (i / (n - 1)) * 300, Y = v => 120 - ((v - lo) / (hi - lo)) * 120;
    let d = ''; c.forEach((v, i) => (d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)));
    const ln = (v, col, t) => '<line x1="0" x2="300" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="' + col + '" stroke-width="1" stroke-dasharray="4 3" opacity=".8"/><text x="298" y="' + (Y(v) - 2).toFixed(1) + '" fill="' + col + '" font-size="8" text-anchor="end">' + t + '</text>';
    let lines = ''; if (lv) lines = ln(lv.stop, '#ff4d6d', 'SL') + ln(lv.t1, '#19e3a1', 'T1') + ln(lv.t2, '#19e3a1', 'T2') + '<rect x="0" width="300" y="' + Y(lv.zone[1]).toFixed(1) + '" height="' + Math.max(1, Y(lv.zone[0]) - Y(lv.zone[1])).toFixed(1) + '" fill="#8b7bff" opacity=".18"/>';
    return '<svg class="pchart" viewBox="0 0 300 120" preserveAspectRatio="none">' + lines + '<path d="' + d + '" fill="none" stroke="#9cc2ff" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>';
  }
  function sheetHTML(a) {
    const r = a.f && Object.keys(a.f).length ? E.score(a, S.env, S.weights) : null, L = a.dir > 0, col = L ? '#19e3a1' : '#ff4d6d', c = CATS[a.cat];
    let h = '<div class="shd"><div><span class="sym">' + esc(a.d) + '</span> <span class="tag">' + c.n + '</span><div class="note" style="margin:0">' + esc(a.n || '') + '</div><div style="font-family:var(--num);font-size:15px;direction:ltr;text-align:right">' + fmtP(a.price) + (a.ch24 != null ? ' <span class="' + (a.ch24 >= 0 ? 'up' : 'dn') + '" style="font-size:12px">' + fmtPct(a.ch24) + '</span>' : '') + '</div></div><button class="x" id="closeS">✕</button></div>';
    if (!r || !r.n) return h + '<div class="empty">داده کافی برای این دارایی جمع نشده است.</div>';
    h += '<div class="big"><div class="ring" style="--p:' + Math.round(r.s) + ';--c:' + col + '"><b>' + Math.round(r.s) + '</b></div><div><div><span class="bdg ' + (L ? 'L' : 'S') + '">' + (L ? 'سناریوی خرید' : 'سناریوی فروش') + '</span> <span class="bdg n">' + (r.level === 'strong' ? 'قوی' : r.level === 'notable' ? 'قابل‌توجه' : 'ضعیف') + '</span></div><div class="note">' + r.agree + ' عامل از ' + r.n + ' عامل هم‌جهت‌اند</div></div></div>';
    h += '<div class="sec">عامل‌های امتیاز</div>';
    for (const k of E.KEYS) { if (a.f[k] == null) continue; const v = a.f[k], w = Math.abs(v) * 50; h += '<div class="fr"><div class="t"><span>' + LBL[k] + '</span><span>' + esc(detailOf(a, k)) + '</span></div><div class="b" style="direction:ltr"><u style="' + (v >= 0 ? 'left:50%' : 'right:50%') + ';width:' + w.toFixed(1) + '%;background:' + (v >= 0 ? '#19e3a1' : '#ff4d6d') + '"></u><u style="left:50%;width:1px;background:rgba(255,255,255,.3)"></u></div></div>'; }
    const un = (S.unlocks || []).filter(u => String(u.sym).toUpperCase() === a.t && (new Date(u.date) - Date.now()) / 864e5 <= 21 && (new Date(u.date) - Date.now()) / 864e5 >= -1)[0];
    if (un) h += '<div class="warn">آزادسازی توکن ' + esc(a.t) + ' در تاریخ ' + esc(un.date) + (un.note ? ' (' + esc(un.note) + ')' : '') + ' است و برای سناریوی خرید ریسک محسوب می‌شود.</div>';
    const lv = E.levels(a, r.dir);
    if (lv) h += '<div class="sec">ورود و خروج</div><div class="lvg"><div><small>ناحیه ورود</small><b>' + fmtP(lv.zone[0]) + '–' + fmtP(lv.zone[1]) + '</b></div><div><small>حد ضرر</small><b class="dn">' + fmtP(lv.stop) + '</b></div><div><small>نوسان روزانه</small><b>' + fmtP(lv.atr) + '</b></div><div><small>هدف اول</small><b class="up">' + fmtP(lv.t1) + '</b></div><div><small>هدف دوم</small><b class="up">' + fmtP(lv.t2) + '</b></div><div><small>ریسک به سود</small><b>۱ به ۳</b></div></div>';
    h += '<div class="sec">نمودار قیمت ساعتی</div>' + chartSVG(a, lv);
    if (a.cat === 'crypto' && a.bsym) h += '<div class="sec">نقشه تصفیه اهرمی (تخمینی)</div><canvas class="liqc" id="liqc"></canvas><div class="note">قرمز: خوشه‌های تصفیه پوزیشن خرید، سبز: تصفیه پوزیشن فروش. از حجم و اهرم‌های رایج تخمین زده می‌شود و داده واقعی صرافی نیست.</div>';
    const mine = SG.hist.filter(x => x.k === a.key).sort((x, y) => y.t - x.t).slice(0, 5);
    if (mine.length) h += '<div class="sec">سیگنال‌های قبلی این دارایی</div>' + mine.map(histCard).join('');
    return h + '<div class="note">این تحلیل توصیه مالی نیست. پیش از ورود حتماً حد ضرر بگذارید.</div>';
  }
  function liqMap(k, p) {
    if (!k || k.length < 30) return null;
    const lo = p * 0.88, hi = p * 1.12, N = 44, bw = (hi - lo) / N, Lg = new Array(N).fill(0), Sh = new Array(N).fill(0), levs = [[10, 0.4], [25, 0.3], [50, 0.2], [100, 0.1]], n = k.length, sl = new Array(n), sh = new Array(n);
    let mn = Infinity, mx = -Infinity; for (let i = n - 1; i >= 0; i--) { sl[i] = mn; sh[i] = mx; mn = Math.min(mn, k[i][3]); mx = Math.max(mx, k[i][2]); }
    for (let i = 0; i < n; i++) { const o = k[i][1], cl = k[i][4], w = k[i][5] * cl, lw = cl >= o ? 0.6 : 0.4, sw = 1 - lw;
      for (const [lv, wt] of levs) { const lp = cl * (1 - 0.9 / lv), sp = cl * (1 + 0.9 / lv);
        if (lp >= lo && lp < p && sl[i] > lp) Lg[Math.min(N - 1, Math.floor((lp - lo) / bw))] += w * lw * wt;
        if (sp <= hi && sp > p && sh[i] < sp) Sh[Math.min(N - 1, Math.floor((sp - lo) / bw))] += w * sw * wt; } }
    const m = Math.max.apply(null, Lg.concat(Sh, [1e-9])); return { lo, hi, N, bw, p, L: Lg.map(x => x / m), S: Sh.map(x => x / m) };
  }
  function drawLiq(q, m, price) {
    const ctx = q.getContext('2d'), r = q.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); q.width = r.width * d; q.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    const w = r.width, h = r.height; ctx.clearRect(0, 0, w, h); const pad = 52, y = p => h - ((p - m.lo) / (m.hi - m.lo)) * h, bh = h / m.N;
    for (let i = 0; i < m.N; i++) { const mid = m.lo + (i + 0.5) * m.bw, up = mid > price, v = up ? m.S[i] : m.L[i]; if (v <= 0) continue; ctx.fillStyle = up ? 'rgba(25,227,161,' + (0.2 + 0.65 * v) + ')' : 'rgba(255,77,109,' + (0.2 + 0.65 * v) + ')'; ctx.fillRect(pad, y(m.lo + (i + 1) * m.bw) + 1, v * (w - pad - 20), bh - 1.5); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(pad, y(price)); ctx.lineTo(w - 10, y(price)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.fillText(fmtP(price), 2, y(price) + 3);
  }
  async function loadLiq(a) {
    const q = $('#liqc'); if (!q) return;
    let m = liqCache[a.key] && Date.now() - liqCache[a.key].t < 600000 ? liqCache[a.key].m : null;
    if (!m) { try { const k = await SG.jget(S.base.replace(/\/$/, '') + '/fapi/v1/klines?symbol=' + a.bsym + '&interval=1h&limit=200', 10000); m = liqMap(k.map(x => [x[0], +x[1], +x[2], +x[3], +x[4], +x[5]]), a.price); liqCache[a.key] = { t: Date.now(), m }; } catch (e) { const s = q.nextElementSibling; q.style.display = 'none'; if (s) s.textContent = 'داده تصفیه در این اتصال در دسترس نیست.'; return; } }
    if (m && sheetKey === a.key) { const q2 = $('#liqc'); if (q2) drawLiq(q2, m, a.price); }
  }
  function openSheet(a) {
    sheetKey = a.key; $('#sheetBody').innerHTML = sheetHTML(a); $('#sheet').classList.add('on'); $('#scrim').classList.add('on'); document.body.classList.add('lock'); pushOverlay(); loadLiq(a);
  }
  SG.openSheet = openSheet;
  $('#sheetBody').addEventListener('click', e => { if (e.target.id === 'closeS') closeOverlays(); const h = e.target.closest('.hc'); if (h) { const a = SG.byKey.get(h.dataset.k); if (a) openSheet(a); } });
  setInterval(() => { if (sheetKey && $('#sheet').classList.contains('on')) { const a = SG.byKey.get(sheetKey); if (a) { const top = $('#sheet').scrollTop; $('#sheetBody').innerHTML = sheetHTML(a); $('#sheet').scrollTop = top; loadLiq(a); } } }, 6000);

  /* ------------------------------------------------------------------ drawer */
  let drawerBuilt = false, deferred = null;
  const standalone = () => (matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
  function srcRows() {
    const names = { crypto: 'کریپتو (CoinGecko)', tradfi: 'سهام، شاخص‌ها، فارکس، طلا و نفت', stable: 'استیبل‌کوین (DefiLlama)', binance: 'بایننس آتی (اهرم)', ws: 'جریان زنده بایننس', hl: 'هایپرلیکوید' };
    return Object.keys(names).map(k => { const s = S.src[k]; const st = !s ? '<span class="dot" style="background:#7f8db3"></span>در انتظار' : s.ok ? '<span class="dot" style="background:#19e3a1"></span>' + SG.ago(s.t) : '<span class="dot" style="background:#ff4d6d"></span>قطع'; return '<tr><td>' + names[k] + '</td><td>' + st + '</td><td class="n">' + (s && s.n ? s.n : '') + '</td></tr>'; }).join('');
  }
  function renderDrawer() {
    if (!drawerBuilt) buildDrawer();
    $('#d-src').innerHTML = '<tr><th>منبع</th><th>وضعیت</th><th>تعداد</th></tr>' + srcRows();
    const l = $('#logBox'); if (l) l.textContent = SG.logs.join('\n');
    const e = S.env || {}, f = x => (x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2));
    $('#d-env').innerHTML = '<tr><td>روند شاخص S&P 500</td><td class="n">' + f(e.spx) + '</td></tr><tr><td>روند VIX (ترس بازار)</td><td class="n">' + f(e.vix) + '</td></tr><tr><td>روند شاخص دلار</td><td class="n">' + f(e.usd) + '</td></tr><tr><td>تمایل به ریسک</td><td class="n">' + f(e.riskOn) + '</td></tr><tr><td>تغییر ۷ روزه استیبل‌کوین‌ها</td><td class="n">' + (S.stable7 == null ? '—' : fmtPct(S.stable7)) + '</td></tr><tr><td>مجموع بازار استیبل‌کوین</td><td class="n">' + (S.stableTotal ? SG.fmtU(S.stableTotal) : '—') + '</td></tr>';
    const hw = $('#d-hl'); const rows = Object.entries(S.hlW).sort((a, b) => b[1].vol - a[1].vol).slice(0, 10);
    hw.innerHTML = '<tr><th>کیف‌پول</th><th>حجم</th><th>خالص</th></tr>' + (rows.length ? rows.map(([ad, w]) => '<tr><td class="n">' + ad.slice(0, 6) + '…' + ad.slice(-4) + '</td><td>' + SG.fmtU(w.vol) + '</td><td class="' + (w.net >= 0 ? 'up' : 'dn') + '">' + SG.fmtU(Math.abs(w.net)) + '</td></tr>').join('') : '<tr><td colspan="3">هنوز معامله بزرگی دیده نشده است.</td></tr>');
    $('#d-unl').innerHTML = S.unlocks.length ? S.unlocks.map((u, i) => '<div class="row2"><span>' + esc(u.sym) + ' · ' + esc(u.date) + ' ' + esc(u.note || '') + '</span><button class="btn" data-del="' + i + '">حذف</button></div>').join('') : '<div class="note">موردی ثبت نشده است.</div>';
    $('#d-store').textContent = 'تاریخچه: ' + SG.hist.length + ' سیگنال · رویدادها: ' + SG.feed.length;
  }
  function buildDrawer() {
    drawerBuilt = true;
    $('#dbody').innerHTML = `
    <details open><summary>نصب روی گوشی</summary><div class="dc"><div class="note">۱. این صفحه را در کروم گوشی باز کنید.<br>۲. روی منوی سه‌نقطه بالای صفحه بزنید.<br>۳. گزینه «نصب برنامه» یا «افزودن به صفحه اصلی» را بزنید.<br>۴. آیکون Signal روی صفحه گوشی می‌نشیند.</div><button class="btn p" id="d-inst">نصب برنامه</button></div></details>
    <details><summary>وضعیت منابع داده</summary><div class="dc"><table class="tbl" id="d-src"></table><div class="note">گزارش اتصال</div><pre class="log" id="logBox"></pre></div></details>
    <details><summary>ورودی‌های پشت‌صحنه امتیاز</summary><div class="dc"><div class="note">این مقدارها در امتیاز همه دارایی‌ها اثر دارند ولی روی صفحه اصلی نمایش داده نمی‌شوند.</div><table class="tbl" id="d-env"></table>
      <div class="note" style="margin-top:10px">وزن هر عامل در امتیاز</div>${E.KEYS.map(k => `<div class="row2"><span>${LBL[k]}</span><b id="wv-${k}">${S.weights[k]}</b></div><input type="range" min="0" max="40" value="${S.weights[k]}" data-w="${k}">`).join('')}</div></details>
    <details><summary>نهنگ‌های هایپرلیکوید</summary><div class="dc"><div class="note">کیف‌پول‌هایی که معاملات درشت انجام داده‌اند، از شروع اجرای برنامه.</div><table class="tbl" id="d-hl"></table></div></details>
    <details><summary>تقویم آزادسازی توکن‌ها</summary><div class="dc"><div id="d-unl"></div><div class="note" style="margin-top:8px">افزودن دستی (نماد، تاریخ، توضیح)</div><input type="text" id="u-sym" placeholder="مثلاً ARB"><input type="date" id="u-date"><input type="text" id="u-note" placeholder="توضیح کوتاه"><button class="btn p" id="u-add">افزودن</button></div></details>
    <details><summary>اعلان‌ها</summary><div class="dc"><div class="row2"><span>دریافت اعلان سیگنال جدید</span><button class="btn" id="n-on"></button></div>
      <div class="row2"><span>حداقل امتیاز برای اعلان</span><b id="n-v">${S.nMin}</b></div><input type="range" min="50" max="95" step="5" value="${S.nMin}" id="n-r">
      <div class="note">نوع سیگنال</div><div class="chips" id="n-dir"></div>
      <button class="btn" id="n-test">ارسال اعلان آزمایشی</button><div class="note" id="n-st"></div>
      <div class="note">اعلان فقط وقتی برنامه باز است یا در پس‌زمینه گوشی زنده مانده است می‌رسد. اگر برنامه کاملاً بسته شود یا گوشی آن را متوقف کند، چیزی نمی‌رسد. برای بهتر شدن، در تنظیمات گوشی صرفه‌جویی باتری را برای Signal غیرفعال کنید.</div></div></details>
    <details><summary>تنظیمات سیگنال و حافظه</summary><div class="dc"><div class="row2"><span>حداقل امتیاز برای ثبت در تاریخچه</span><b id="th-v">${S.thresh}</b></div><input type="range" min="30" max="70" value="${S.thresh}" id="th-r"><div class="note" id="d-store"></div>
      <div class="row2"><button class="btn" id="b-exp">خروجی تاریخچه</button><button class="btn" id="b-clr">پاک‌کردن تاریخچه</button></div></div></details>
    <details><summary>اتصال و آدرس‌ها</summary><div class="dc"><div class="note">اگر بایننس از اینترنت شما باز نمی‌شود، آدرس پروکسی خودتان را اینجا بگذارید یا فیلترشکن را روشن کنید.</div><label class="note">آدرس رابط برنامه‌نویسی</label><input type="text" id="i-base" value="${S.base}"><label class="note">آدرس جریان زنده</label><input type="text" id="i-ws" value="${S.ws}"><button class="btn p" id="b-save">ذخیره و اتصال دوباره</button></div></details>
    <details><summary>روش محاسبه و محدودیت‌ها</summary><div class="dc"><div class="note">امتیاز هر دارایی میانگین وزنی شش عامل است: فشار خرید و فروش، مومنتوم، فیلتر فنی، پول هوشمند، اهرم و نقدینگی کلان. عامل‌هایی که برای یک دارایی داده ندارند کنار گذاشته می‌شوند. سیگنال قوی یعنی امتیاز بالای ۵۵ با دست‌کم سه عامل هم‌جهت. ورود، حد ضرر و اهداف از نوسان روزانه محاسبه می‌شوند. داده سهام و بازارهای جهانی با تأخیر چند دقیقه‌ای به‌روز می‌شود. تاریخچه فقط وقتی ثبت می‌شود که برنامه باز باشد. هیچ سیگنالی سود را تضمین نمی‌کند.</div></div></details>`;
    const nDir = () => chipRow($('#n-dir'), [['both', 'خرید و فروش'], ['buy', 'فقط خرید'], ['sell', 'فقط فروش']], () => S.nDir, v => { S.nDir = v; SG.saveCfg(); nDir(); });
    const nBtn = async () => { const g = await notifPerm(false); $('#n-on').textContent = S.nOn ? 'روشن' : 'خاموش'; $('#n-on').classList.toggle('p', S.nOn); $('#n-st').textContent = S.nOn && !g ? 'اجازه اعلان داده نشده است. در تنظیمات گوشی اجازه دهید.' : ''; };
    nDir(); nBtn();
    $('#n-on').onclick = async () => { S.nOn = !S.nOn; if (S.nOn) await notifPerm(true); SG.saveCfg(); nBtn(); };
    $('#n-r').oninput = e => { S.nMin = +e.target.value; $('#n-v').textContent = S.nMin; SG.saveCfg(); };
    $('#n-test').onclick = async () => { if (await notifPerm(true)) notify('Signal', 'اعلان آزمایشی: همه چیز درست است', 'test'); else $('#n-st').textContent = 'اجازه اعلان داده نشده است.'; };
    $('#d-inst').onclick = async () => { if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch (e) { } deferred = null; } else alert(standalone() ? 'برنامه همین حالا نصب است.' : 'از منوی سه‌نقطه مرورگر گزینه نصب برنامه را بزنید.'); };
    $('#b-save').onclick = () => { S.base = $('#i-base').value.trim() || 'https://fapi.binance.com'; S.ws = $('#i-ws').value.trim() || 'wss://fstream.binance.com'; SG.saveCfg(); location.reload(); };
    $('#u-add').onclick = () => { const s = $('#u-sym').value.trim().toUpperCase(), d = $('#u-date').value; if (!s || !d) return; S.unlocks.push({ sym: s, date: d, note: $('#u-note').value.trim() }); SG.saveCfg(); renderDrawer(); };
    $('#th-r').oninput = e => { S.thresh = +e.target.value; $('#th-v').textContent = S.thresh; SG.saveCfg(); };
    $('#b-clr').onclick = () => { if (confirm('تمام تاریخچه سیگنال‌ها پاک شود؟')) { SG.hist.length = 0; SG.LS.set('sig.hist', []); SG.emit('hist'); renderDrawer(); } };
    $('#b-exp').onclick = () => { const b = new Blob([JSON.stringify(SG.hist, null, 1)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'signal-history.json'; a.click(); };
    $('#dbody').addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (b) { S.unlocks.splice(+b.dataset.del, 1); SG.saveCfg(); renderDrawer(); } });
    $('#dbody').addEventListener('input', e => { const k = e.target.dataset.w; if (k) { S.weights[k] = +e.target.value; $('#wv-' + k).textContent = e.target.value; SG.saveCfg(); } });
  }
  $('#menuBtn').onclick = () => { renderDrawer(); $('#drawer').classList.add('on'); $('#scrim').classList.add('on'); document.body.classList.add('lock'); pushOverlay(); };
  SG.on('log', () => { const l = $('#logBox'); if (l && $('#drawer').classList.contains('on')) l.textContent = SG.logs.join('\n'); });


  /* ------------------------------------------------------------ notifications */
  const CAP = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
  let nid = Math.floor(Date.now() / 1000) % 1000000;
  async function notifPerm(ask) {
    try {
      const ln = CAP();
      if (ln) { let p = await ln.checkPermissions(); if (p.display !== 'granted' && ask) p = await ln.requestPermissions(); return p.display === 'granted'; }
      if (!('Notification' in window)) return false;
      if (Notification.permission === 'default' && ask) await Notification.requestPermission();
      return Notification.permission === 'granted';
    } catch (e) { return false; }
  }
  async function notify(title, body, tag) {
    try {
      const ln = CAP();
      if (ln) { await ln.schedule({ notifications: [{ id: ++nid, title, body }] }); return; }
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      if (reg && reg.showNotification) reg.showNotification(title, { body, tag, icon: 'icon-192.png', badge: 'icon-192.png', dir: 'rtl', lang: 'fa' });
      else new Notification(title, { body, tag, icon: 'icon-192.png' });
    } catch (e) { }
  }
  SG.on('newsig', async recs => {
    if (!S.nOn) return;
    const ok = recs.filter(r => Math.abs(r.sc) >= S.nMin && (S.nDir === 'both' || (S.nDir === 'buy' ? r.dir > 0 : r.dir < 0)));
    if (!ok.length || !(await notifPerm(false))) return;
    ok.sort((a, b) => Math.abs(b.sc) - Math.abs(a.sc));
    ok.slice(0, 3).forEach(r => notify('Signal · ' + (r.d || r.sym), (r.dir > 0 ? 'سیگنال خرید' : 'سیگنال فروش') + ' با امتیاز ' + Math.abs(r.sc) + ' · قیمت ' + fmtP(r.e), r.k));
    if (ok.length > 3) notify('Signal', (ok.length - 3) + ' سیگنال دیگر هم ثبت شد', 'more');
  });

  /* --------------------------------------------------------------------- boot */
  let lastRank = 0;
  function uiTick() {
    const now = Date.now();
    if (SG.dirty.data || now - lastRank > 1600) { lastRank = now; SG.dirty.data = false; if (SG.page === 'net') rerank(); }
    tickInfo();
    if ($('#drawer').classList.contains('on')) renderDrawer();
  }
  SG.boot2 = () => SG.boot();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { });
  feedChips(); histChips();
  SG.startFx();
  new ResizeObserver(() => SG.measure()).observe(document.getElementById('app'));
  addEventListener('orientationchange', () => setTimeout(SG.measure, 300));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => SG.measure());
  setInterval(() => { if (SG.page === 'net') SG.measure(); }, 2500);
  setInterval(uiTick, 1000);
  SG.on('mode', () => { SG.aggTick(); });
  SG.boot().then(() => { SG.aggTick(); uiTick(); });
  window.__sigReady = true;
})();
