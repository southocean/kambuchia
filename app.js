(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // no accents (Bị ốm → Bi om): payment apps only show plain letters
  const plain = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  const unscramble = s => [...atob(s)].reverse().join('');
  const person = id => PEOPLE.find(x => x.id === id) || { id, name: id, color: '#8a8f98', pay: [] };
  const FXR = window.FX || { vndPerSek: 2583 };
  const krTxt = (v, d = 2) => v.toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' kr';
  const vnd = kr => Math.round(kr * FXR.vndPerSek / 1000) * 1000;
  const vndTxt = v => v.toLocaleString('vi-VN') + ' ₫';
  const initials = n => plain(n).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  // a face, or the person's initials on their colour
  const face = (id, cls = '') => {
    const p = person(id);
    return p.face
      ? `<img class="av ${cls}" src="${esc(p.face)}" alt="" style="--pc:${p.color}">`
      : `<span class="av ini ${cls}" style="--pc:${p.color}" aria-hidden="true">${esc(initials(p.name))}</span>`;
  };
  const fmtDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const QR_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3 3h8v8H3V3Zm2 2v4h4V5H5Zm8-2h8v8h-8V3Zm2 2v4h4V5h-4ZM3 13h8v8H3v-8Zm2 2v4h4v-4H5Zm1-9h2v2H6V6Zm10 0h2v2h-2V6ZM6 16h2v2H6v-2Zm7-3h2v2h-2v-2Zm2 2h2v2h-2v-2Zm2-2h4v2h-2v2h-2v-4Zm-4 4h2v4h-2v-4Zm4 2h4v2h-4v-2Zm2-2h2v2h-2v-2Z"/></svg>';

  let EV, bal, pay;
  // what a bill costs the group: the payer's own items come off first
  const billKr = b => b.kr - (b.own || 0);
  const splitOf = b => b.for && b.for.length ? b.for : EV.crew;

  // ── who owes whom ──────────────────────────────────────
  // Every bill splits evenly over its `for` (default: the crew). Balances round to whole kronor;
  // with a hub everyone settles through them, otherwise the biggest debt pays the biggest credit.
  function settle() {
    const b0 = Object.fromEntries(EV.crew.map(id => [id, 0]));
    EV.bills.forEach(b => {
      const split = splitOf(b), kr = billKr(b);
      b0[b.by] = (b0[b.by] || 0) + kr;
      split.forEach(id => { b0[id] -= kr / split.length; });
    });
    // debts round UP to the next krona and credits to the nearest, so the bill payers never come up
    // short; the few spare kronor from rounding land on the biggest credit
    const whole = EV.crew.map(id => ({ id, v: b0[id] < 0 ? -Math.ceil(-b0[id] - 1e-9) : Math.round(b0[id]) }));
    const rest = whole.reduce((t, x) => t + x.v, 0);
    if (rest) whole.reduce((m, x) => x.v > m.v ? x : m).v -= rest;
    const out = { bal: Object.fromEntries(whole.map(x => [x.id, x.v])), pay: [] };
    if (EV.hub) {
      whole.filter(x => x.id !== EV.hub && x.v < 0).forEach(x => out.pay.push({ from: x.id, to: EV.hub, kr: -x.v }));
      whole.filter(x => x.id !== EV.hub && x.v > 0).forEach(x => out.pay.push({ from: EV.hub, to: x.id, kr: x.v }));
      return out;
    }
    // Everyone else sends at most ONE Swish and never passes money on; only the squarers (Nam, Tracy,
    // Jane, Emma by default) may send more. A one-Swish debt goes to someone it fits whole (an exact
    // match first, else the tightest fit), and only a squarer may be tipped past what they're owed.
    // Then the squarers who were tipped over pay out what's still owed.
    const sq = new Set((EV.squarers || window.SQUARERS || []).filter(id => EV.crew.includes(id)));
    // Couples first: one partner (a squarer if there is one, else whoever is owed more) carries the
    // household's net balance and the other pays (or is paid by) just their partner. The site shows it
    // like any other Swish; couples sort it out between themselves.
    const unit = Object.fromEntries(whole.map(x => [x.id, x.v]));
    (EV.couples || window.COUPLES || []).filter(c => c.every(id => id in unit)).forEach(c => {
      const [rep, other] = c.slice().sort((a, b) => (sq.has(b) - sq.has(a)) || (unit[b] - unit[a]));
      const v = unit[other];
      if (v < 0) out.pay.push({ from: other, to: rep, kr: -v });
      if (v > 0) out.pay.push({ from: rep, to: other, kr: v });
      unit[rep] += v; delete unit[other];
    });
    const units = Object.entries(unit).map(([id, v]) => ({ id, v }));
    const rem = Object.fromEntries(units.filter(x => x.v > 0).map(x => [x.id, x.v]));
    const once = units.filter(x => x.v < 0 && !sq.has(x.id)).sort((a, b) => a.v - b.v);
    const owing = units.filter(x => x.v < 0 && sq.has(x.id)).map(x => ({ id: x.id, v: -x.v }));
    once.forEach(x => {
      const kr = -x.v, open = Object.keys(rem).filter(id => rem[id] > 0);
      const fits = open.filter(id => rem[id] >= kr).sort((a, b) => rem[a] - rem[b]);
      const to = fits.find(id => rem[id] === kr) || fits[0]
        || [...open].sort((a, b) => (sq.has(b) - sq.has(a)) || (rem[b] - rem[a]))[0];
      out.pay.push({ from: x.id, to, kr });
      rem[to] -= kr;
    });
    const debt = owing.concat(Object.entries(rem).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v })));
    const cred = Object.entries(rem).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
    // the first squarer (Nam) does the passing on: the others send ONE Swish where it fits whole
    const lead = [...sq][0];
    debt.filter(d => d.id !== lead && debt.some(x => x.id === lead)).forEach(d => {
      const c = cred.find(c => c.v === d.v) || cred.filter(c => c.v >= d.v).sort((a, b) => b.v - a.v)[0];
      if (!c) return;
      out.pay.push({ from: d.id, to: c.id, kr: d.v });
      c.v -= d.v; d.v = 0;
    });
    for (let i = debt.length; i--;) if (!debt[i].v) debt.splice(i, 1);
    for (let i = cred.length; i--;) if (!cred[i].v) cred.splice(i, 1);
    while (debt.length && cred.length) {
      debt.sort((a, b) => b.v - a.v); cred.sort((a, b) => b.v - a.v);
      const d = debt[0], c = cred[0], amt = Math.min(d.v, c.v);
      out.pay.push({ from: d.id, to: c.id, kr: amt });
      d.v -= amt; c.v -= amt;
      if (!d.v) debt.shift();
      if (!c.v) cred.shift();
    }
    // grouped by who gets paid, biggest first: easy to find your own row; the payers' squaring-up last
    const late = t => out.bal[t.from] > 0 ? 1 : 0;
    out.pay.sort((a, b) => (late(a) - late(b)) || (out.bal[b.to] - out.bal[a.to]) || (b.kr - a.kr));
    return out;
  }
  const hasSwish = id => person(id).pay.some(m => m.kind === 'swish');
  // the method a payment opens on: Swish when the payer has it, otherwise the recipient's bank
  const methodFor = t => {
    const methods = person(t.to).pay, bank = methods.findIndex(m => m.kind === 'bank');
    return !hasSwish(t.from) && bank >= 0 ? bank : Math.max(0, methods.findIndex(m => m.kind === 'swish'));
  };

  // ── the event: cover, title, faces ─────────────────────
  function renderHead() {
    const cover = EV.photos[0];
    $('#cover').src = cover.src; $('#cover').alt = cover.alt || EV.title;
    $('#kicker').textContent = [fmtDate(EV.date), EV.where, `${EV.crew.length} of us`].filter(Boolean).join(' · ');
    $('#title').textContent = EV.title;
    document.title = `${EV.title} · KambuChia`;
    $('#faces').innerHTML = EV.crew.map(id => { const p = person(id); return `<li><button class="face" data-to="${p.id}" style="--pc:${p.color}" aria-label="Pay ${esc(p.name)}">
      <span class="face-img">${face(id)}</span><b>${esc(p.name)}</b></button></li>`; }).join('');
    // other events, newest first; only when there is more than one
    $('#events').hidden = EVENTS.length < 2;
    $('#events').innerHTML = EVENTS.map(e => `<button data-ev="${esc(e.id)}" aria-pressed="${e === EV}">${esc(e.title)}<small>${esc(new Date(e.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))}</small></button>`).join('');
    // the gallery tab is there when there are more photos than the cover
    const more = EV.photos.length > 1;
    document.querySelector('.tabs [data-tab=pics]').hidden = !more;
    $('#panel-pics').classList.toggle('none', !more);
    document.querySelector('.tabs').style.setProperty('--n', more ? 3 : 2);
  }
  $('#faces').addEventListener('click', e => { const b = e.target.closest('.face'); if (b) openPay({ to: b.dataset.to }); });
  $('#coverBtn').addEventListener('click', () => openViewer(EV.photos, 0));
  $('#events').addEventListener('click', e => {
    const b = e.target.closest('[data-ev]'); if (!b) return;
    show(EVENTS.find(x => x.id === b.dataset.ev));
    scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── the logo: the bottle pops in, the name slides out, then a streak of light slices "Chia",
  // U-turns up and over, and comes straight down through the bottle ──
  const brand = $('#brand'), light = $('#bLight');
  let brandT = [], lightA, lightF;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function streak() {
    const o = brand.getBoundingClientRect(), C = brand.querySelector('.b-chia').getBoundingClientRect();
    const B = brand.querySelector('.b-bottle').getBoundingClientRect();
    const z = o.width / brand.offsetWidth || 1; // screen px → the logo's own px (page zoom etc.)
    const cx = (C.left - o.left) / z, cy = (C.top - o.top) / z, W = C.width / z, H = C.height / z;
    // the slant through Chia (same as the clip line: 66% height on the left, 36% on the right), extended 8px
    const k = .30 * H / W, x0 = cx - 8, y0 = cy + .66 * H + 8 * k, x1 = cx + W + 8, y1 = cy + .36 * H - 8 * k;
    const len = Math.hypot(W + 16, y1 - y0), ux = (W + 16) / len, uy = (y1 - y0) / len;
    const bx = (B.left - o.left + B.width / 2) / z, by = (B.bottom - o.top) / z + 6;
    const seg1 = `M${x0},${y0} L${x1},${y1}`;
    // the U-turn stays low (the badge sits near the top of the screen), so most of it is on screen
    const seg2 = `M${x1},${y1} C${x1 + ux * 40},${y1 + uy * 40} ${bx},${-22} ${bx},${0}`;
    const seg3 = `M${bx},${0} L${bx},${by}`;
    const L = d => { light.setAttribute('d', d); return light.getTotalLength(); };
    const l1 = L(seg1), l2 = L(seg2), l3 = L(seg3), all = l1 + l2 + l3, dash = 18;
    light.setAttribute('d', seg1 + ' ' + seg2.replace(/^M[^C]+/, '') + ' ' + seg3.replace(/^M[^L]+/, ''));
    light.style.strokeDasharray = `${dash} ${all + dash}`;
    // time: a fast slash through Chia, a smooth arc, a quick drop through the bottle, then the tail leaves
    const t1 = 140, t2 = 380, t3 = 110, t4 = 70, T = t1 + t2 + t3 + t4;
    if (lightA) lightA.cancel();
    if (lightF) lightF.cancel();
    lightA = light.animate([
      { strokeDashoffset: dash, offset: 0 },
      { strokeDashoffset: dash - l1, offset: t1 / T, easing: 'cubic-bezier(.45, 0, .55, 1)' },
      { strokeDashoffset: dash - l1 - l2, offset: (t1 + t2) / T },
      { strokeDashoffset: dash - all, offset: (t1 + t2 + t3) / T },
      { strokeDashoffset: -all, offset: 1 },
    ], { duration: T, fill: 'forwards' });
    // it seems done after Chia: the light dies out early in the U-turn and only flares up again
    // just before it drops into the bottle
    const at = ms => Math.min(1, ms / T);
    lightF = light.animate([
      { opacity: 1, offset: 0 }, { opacity: 1, offset: at(t1 + 20) }, { opacity: 0, offset: at(t1 + 90) },
      { opacity: 0, offset: at(t1 + t2 - 70) }, { opacity: 1, offset: at(t1 + t2 - 10) }, { opacity: 1, offset: 1 },
    ], { duration: T, fill: 'forwards' });
    brandT.push(setTimeout(() => brand.classList.add('cut-c'), t1 - 20), setTimeout(() => brand.classList.add('cut-b'), t1 + t2 + t3 - 20));
  }
  function playBrand() {
    brandT.forEach(clearTimeout); brandT = [];
    if (reduced()) { brand.classList.add('pop', 'open', 'cut-c', 'cut-b'); return; }
    brand.classList.remove('pop', 'open', 'cut-c', 'cut-b');
    if (lightA) lightA.cancel();
    if (lightF) lightF.cancel();
    void brand.offsetWidth;
    brandT.push(
      setTimeout(() => brand.classList.add('pop'), 120),
      setTimeout(() => brand.classList.add('open'), 650),
      setTimeout(streak, 1300),
    );
  }
  brand.addEventListener('click', playBrand);
  // play it the first time it's actually seen: phones often reopen a page scrolled down or in the
  // background, and the animation would run with nobody looking
  let brandPlayed = false;
  function tryBrand() {
    if (brandPlayed || document.hidden) return;
    const r = brand.getBoundingClientRect();
    if (!r.height || r.top < -4 || r.bottom > innerHeight) return; // not (wholly) on screen yet
    brandPlayed = true;
    removeEventListener('scroll', tryBrand);
    playBrand();
  }
  addEventListener('scroll', tryBrand, { passive: true });
  addEventListener('pageshow', tryBrand);
  document.addEventListener('visibilitychange', tryBrand);
  // first look once the page has loaded: browsers put a restored scroll position back around then
  const firstLook = () => setTimeout(tryBrand, 200);
  if (document.readyState === 'complete') firstLook(); else addEventListener('load', firstLook);

  // ── now and then, the same light splits someone's face ──
  // After ~40 s on the page, a streak flashes across a random face on screen at a random angle and
  // cuts it in two, then it's gone, until the next one 35-80 s later. Split faces stay split.
  function zap(img) {
    const r = img.getBoundingClientRect(), D = Math.max(r.width, r.height);
    const th = Math.random() * Math.PI, dx = Math.cos(th), dy = Math.sin(th);
    // the streak: a short comet riding a line through the face's centre
    const z = document.createElement('div');
    z.className = 'zap';
    z.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;width:${D * 3}px;transform:translate(-50%,-50%) rotate(${th}rad)`;
    z.innerHTML = '<i></i>';
    document.body.appendChild(z);
    const run = z.firstChild.animate([
      { transform: `translateX(${-D * 1.5}px)`, opacity: 0 }, { opacity: 1, offset: .25 },
      { opacity: 1, offset: .7 }, { transform: `translateX(${D * 1.5}px)`, opacity: 0 },
    ], { duration: 340, easing: 'cubic-bezier(.5, 0, .5, 1)' });
    run.onfinish = () => z.remove();
    setTimeout(() => cut(img, dx, dy), 160);
  }
  const splits = new Map(); // which faces have been cut (and at what angle), so each is cut once
  function splitKey(img) {
    if (img.closest('#faces')) return 'f:' + img.closest('.face').dataset.to;
    const b = img.closest('.pay-btn'), t = b && pay[+b.dataset.i];
    return t ? `p:${t.from}>${t.to}:${[...img.closest('.pair').querySelectorAll('img.av:not(.half)')].indexOf(img)}` : '';
  }
  // after the faces are drawn again (a tick, a new event), the ones that were cut come back cut
  function reapplySplits() {
    document.querySelectorAll('#faces img.av, #payList .pair img.av').forEach(img => {
      if (img.closest('.split')) return;
      const s = splits.get(splitKey(img));
      if (s) cut(img, s.dx, s.dy, true);
    });
  }
  function cut(img, dx, dy, now) {
    if (!img.isConnected || img.closest('.split')) return;
    const key = splitKey(img);
    if (!now && splits.has(key)) return;
    splits.set(key, { dx, dy });
    const w = img.offsetWidth, h = img.offsetHeight;
    const wrap = document.createElement('span');
    wrap.className = 'split';
    wrap.style.cssText = `width:${w}px;height:${h}px`;
    img.replaceWith(wrap);
    wrap.appendChild(img);
    // two copies, each clipped to one side of the line through the centre (dx, dy), pushed apart along its normal
    const nx = -dy, ny = dx, P = (x, y) => `${50 + x}% ${50 + y}%`;
    [1, -1].forEach(side => {
      const c = img.cloneNode();
      c.classList.add('half');
      c.style.clipPath = `polygon(${P(-dx * 200, -dy * 200)}, ${P(dx * 200, dy * 200)}, ${P(dx * 200 + nx * 200 * side, dy * 200 + ny * 200 * side)}, ${P(-dx * 200 + nx * 200 * side, -dy * 200 + ny * 200 * side)})`;
      if (now) c.style.transition = 'none';
      wrap.appendChild(c);
      void c.offsetWidth; // lay it out unmoved first, so the push apart animates
      c.style.transform = `translate(${nx * 2.5 * side}px, ${ny * 2.5 * side}px) rotate(${side * 4}deg)`;
    });
    img.style.visibility = 'hidden';
  }
  let zapT;
  function zapLater(ms) {
    clearTimeout(zapT);
    zapT = setTimeout(() => {
      if (document.hidden || document.querySelector('dialog[open]')) return zapLater(8000);
      // only a face you can fully see right now: wholly inside the window, not already split, and
      // the topmost thing at its centre (so not scrolled out of the face row or covered)
      const vis = [...document.querySelectorAll('#faces img.av, #payList .pair img.av')].filter(el => {
        if (el.closest('.split') || splits.has(splitKey(el))) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) return false;
        return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el;
      });
      if (vis.length) zap(vis[Math.floor(Math.random() * vis.length)]);
      zapLater(35000 + Math.random() * 45000);
    }, ms);
  }
  // ?zap in the address starts the first one after a second (for previewing)
  if (!reduced()) zapLater(/[?&]zap\b/.test(location.search) ? 1000 : 40000);

  // ── "I've paid": shared ticks (Google Sheet via tools/ticks.gs; tools/serve.js locally) ──
  // A tick is on trust: whoever taps it marks that payment paid for everyone. Payments listed in
  // data.js (EV.payments, with receipts) count as paid too and can't be unticked.
  const TICKS = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '/ticks' : '') || window.TICKS_URL || '';
  const TICKS_ON = !!TICKS;
  let ticks = {};
  const tickKey = t => `${EV.id}|${t.from}|${t.to}`;
  const inData = t => (EV.payments || []).filter(p => p.from === t.from && p.to === t.to).reduce((s, p) => s + p.kr, 0) >= t.kr - 0.5;
  const isPaid = t => inData(t) || !!(ticks[tickKey(t)] && ticks[tickKey(t)].paid);
  function takeTicks(next) {
    if (!next || next.error) return;
    const before = pay.filter(isPaid).map(tickKey).join();
    ticks = next;
    if (pay.filter(isPaid).map(tickKey).join() === before) return;
    renderPay(); reapplySplits(); playTicks();
  }
  function loadTicks() {
    if (!TICKS_ON || document.hidden) return;
    fetch(TICKS, { cache: 'no-store' }).then(r => r.json()).then(takeTicks).catch(() => {});
  }
  function setTick(t, paid) {
    const key = tickKey(t), old = ticks[key];
    takeTicks({ ...ticks, [key]: { paid, kr: t.kr, at: new Date().toISOString() } });
    // text/plain keeps it a "simple" request, which Apps Script accepts without a CORS preflight
    return fetch(TICKS, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key, paid, kr: t.kr }) })
      .then(r => r.json()).then(takeTicks)
      .catch(() => {
        const back = { ...ticks }; if (old) back[key] = old; else delete back[key];
        takeTicks(back); alert("Couldn't save that. Check your connection and try again.");
      });
  }

  // ── pay ────────────────────────────────────────────────
  function renderPay() {
    const rows = pay.map((t, i) => {
      const made = (EV.payments || []).filter(p => p.from === t.from && p.to === t.to);
      const done = isPaid(t), receipt = made.find(p => p.photo);
      const to = person(t.to), m = to.pay[t.m], bank = m && m.kind === 'bank';
      const via = !m ? 'Swish number coming' : bank ? m.bank : 'Swish';
      return `<li class="pay-row${done ? ' paid' : ''}${m ? '' : ' nonum'}" style="--from:${person(t.from).color};--to:${to.color}">
        <button class="pay-btn" data-i="${i}"${receipt ? ` data-receipt="${esc(receipt.photo)}"` : ''}${done && !receipt && !TICKS_ON ? ' disabled' : ''} aria-label="${esc(person(t.from).name)} pays ${esc(to.name)} ${t.kr} kr${done ? ', paid' : ''}">
          <span class="pair">${face(t.from)}<span class="arr" aria-hidden="true"><svg viewBox="0 0 24 12" width="22" height="11"><path d="M0 6h20M15 1l6 5-6 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>${face(t.to)}</span>
          <span class="who"><b>${esc(person(t.from).name)} <i>→</i> ${esc(to.name)}</b><small>${esc(via)}</small></span>
          <span class="amt"><b>${krTxt(t.kr, 0)}</b>${bank ? `<small>${vndTxt(vnd(t.kr))}</small>` : ''}</span>
          <span class="qr-ic">${done ? `<span class="q">${QR_ICON}</span><span class="t" aria-hidden="true">✓</span>` : QR_ICON}</span>
        </button></li>`;
    }).join('');
    const spent = id => EV.bills.reduce((t, b) => { const s = splitOf(b); return t + (s.includes(id) ? billKr(b) / s.length : 0); }, 0);
    const paid = id => EV.bills.filter(b => b.by === id).reduce((t, b) => t + billKr(b), 0);
    const dec = v => v.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('sv-SE');
    // one line per person: their share, what they paid, what's left (owed to them: +)
    const order = EV.crew.slice().sort((a, b) => bal[b] - bal[a]);
    $('#payList').innerHTML = `<ul class="pays">${rows || '<li class="square">All square ✓</li>'}</ul>
      <table class="tally">
        <thead><tr><th scope="col">kr</th><th scope="col">Share</th><th scope="col">Paid</th><th scope="col">Balance</th></tr></thead>
        <tbody>${order.map(id => `<tr style="--pc:${person(id).color}"><th scope="row">${face(id, 'xs')}<span>${esc(person(id).name)}</span></th>
          <td>${dec(spent(id))}</td><td>${paid(id) ? dec(paid(id)) : '–'}</td>
          <td class="${bal[id] > 0 ? 'pos' : bal[id] < 0 ? 'neg' : ''}">${signed(bal[id])}</td></tr>`).join('')}</tbody>
      </table>`;
  }
  $('#payList').addEventListener('click', e => {
    const b = e.target.closest('.pay-btn'); if (!b) return;
    if (b.dataset.receipt) openViewer([{ src: b.dataset.receipt, alt: 'Receipt' }], 0);
    else if (!b.closest('.paid') || TICKS_ON) openPay(pay[+b.dataset.i]);
  });
  // the tick: a second after a paid row comes into view; every time the tab opens, it plays again
  const paidIO = 'IntersectionObserver' in window && new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    paidIO.unobserve(e.target);
    setTimeout(() => e.target.classList.add('go'), 1000);
  }), { threshold: 0.6 });
  function playTicks() {
    document.querySelectorAll('#payList .pay-row.paid').forEach(r => { r.classList.remove('go'); paidIO ? paidIO.observe(r) : r.classList.add('go'); });
  }

  // ── bills ──────────────────────────────────────────────
  function renderBills() {
    const groups = [];
    EV.bills.forEach((b, i) => {
      const who = splitOf(b), key = who.slice().sort().join(',');
      let g = groups.find(x => x.key === key);
      if (!g) groups.push(g = { key, who, list: [] });
      g.list.push({ ...b, i });
    });
    $('#billList').innerHTML = groups.map(g => {
      const total = g.list.reduce((t, b) => t + billKr(b), 0);
      const out = EV.crew.filter(id => !g.who.includes(id));
      const all = g.who.length === EV.crew.length;
      return `<div class="bill-group">
        <div class="bg-head">
          <span class="stack">${g.who.slice(0, 5).map(id => face(id, 'sm')).join('')}${g.who.length > 5 ? `<span class="av sm more">+${g.who.length - 5}</span>` : ''}</span>
          <span class="bg-t"><b>${all ? 'Everyone' : g.who.length + ' people'}</b>${out.length ? `<small>not ${out.map(id => esc(person(id).name)).join(', ')}</small>` : `<small>${g.who.length} people</small>`}</span>
          <span class="bg-sum"><b>${krTxt(total / g.who.length)}</b><small>each</small></span>
        </div>
        <ul class="bills">${g.list.map(b => `<li>
          ${b.photo ? `<button class="ic rc" data-photo="${esc(b.photo)}" aria-label="Receipt: ${esc(b.what)}"><img src="${esc(b.photo)}" alt="" loading="lazy"></button>` : `<span class="ic" aria-hidden="true">${b.icon || '🧾'}</span>`}
          <span class="what"><b>${esc(b.what)}</b>${b.sub ? `<small>${esc(b.sub)}</small>` : ''}${b.own ? `<small class="own">−${krTxt(b.own)} ${esc(person(b.by).name)}'s own${b.ownWhat ? ' (' + esc(b.ownWhat) + ')' : ''}</small>` : ''}</span>
          <span class="by">${face(b.by, 'xs')}<span>${esc(person(b.by).name)}</span></span>
          <span class="bamt">${b.own ? `<s>${krTxt(b.kr)}</s>` : ''}<b>${krTxt(billKr(b))}</b></span>
        </li>`).join('')}</ul>
        <p class="bg-total">Total ${krTxt(total)} ÷ ${g.who.length}</p>
      </div>`;
    }).join('');
  }
  $('#billList').addEventListener('click', e => {
    const b = e.target.closest('.rc'); if (!b) return;
    const list = EV.bills.filter(x => x.photo).map(x => ({ src: x.photo, alt: x.what }));
    openViewer(list, list.findIndex(x => x.src === b.dataset.photo));
  });

  // ── payment links ──────────────────────────────────────
  // Swish: its own payment link with number, amount and message locked; the QR holds the link.
  function swishLink(n, kr, msg) {
    const q = new URLSearchParams({ sw: n, amt: kr ? kr.toFixed(2) : '', msg: msg.replace(/[^\w åäöÅÄÖ.,!?:-]/g, '').slice(0, 50) });
    if (!kr) q.delete('amt');
    return 'https://app.swish.nu/1/p/sw/?' + q.toString().replace(/\+/g, '%20');
  }
  // VietQR (NAPAS 247): the EMVCo payload every Vietnamese bank app scans.
  const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;
  function crc16(s) {
    let c = 0xFFFF;
    for (let i = 0; i < s.length; i++) {
      c ^= s.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) c = c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1;
      c &= 0xFFFF;
    }
    return c.toString(16).toUpperCase().padStart(4, '0');
  }
  const ascii = s => plain(s).replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 25);
  function vietQr(bin, acct, amount, memo) {
    let s = tlv('00', '01') + tlv('01', amount ? '12' : '11')
      + tlv('38', tlv('00', 'A000000727') + tlv('01', tlv('00', bin) + tlv('01', acct)) + tlv('02', 'QRIBFTTA'))
      + tlv('53', '704') + (amount ? tlv('54', String(amount)) : '') + tlv('58', 'VN')
      + (memo ? tlv('62', tlv('08', ascii(memo))) : '') + '6304';
    return s + crc16(s);
  }
  // open the payer's own bank app with the transfer filled in (VietQR's deeplink service)
  const APPS = [['vcb', 'Vietcombank'], ['tcb', 'Techcombank'], ['mb', 'MB'], ['bidv', 'BIDV'], ['icb', 'VietinBank'], ['acb', 'ACB'], ['tpb', 'TPBank'], ['vpb', 'VPBank']];
  const BANK_CODE = { '970436': 'vcb', '970407': 'tcb' };
  const appLink = (app, m, acct, amount, memo) => 'https://dl.vietqr.io/pay?' + new URLSearchParams({ app, ba: `${acct}@${BANK_CODE[m.bin]}`, am: amount || '', tn: ascii(memo) });

  // ── the pay popup ──────────────────────────────────────
  const box = $('#qrBox');
  // Swish (and the bank apps) only exist on phones and tablets, so the Open Swish button and the
  // phone layout only show up there; touch laptops and desktops get the QR code to scan instead.
  // A web page can't ask whether the app is installed, so a mobile OS is the best signal there is.
  const touch = (navigator.userAgentData && navigator.userAgentData.mobile)
    || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let cur = null;
  function openPay(t) {
    const to = person(t.to);
    cur = { ...t, m: t.m || 0 };
    $('#qrTitle').innerHTML = t.from
      ? `${face(t.from, 'sm')}<span>${esc(person(t.from).name)}</span><i>→</i>${face(t.to, 'sm')}<span>${esc(to.name)}</span>`
      : `<span>Pay</span>${face(t.to, 'sm')}<span>${esc(to.name)}</span>`;
    const canTick = TICKS_ON && !!t.from && !inData(t), ticked = canTick && isPaid(t);
    box.classList.toggle('ticked', ticked); box.classList.toggle('can-tick', canTick);
    $('#qrPaid').textContent = ticked ? 'Paid ✓  ·  undo' : "I've paid";
    const hero = $('#qrHero'), big = !t.from && to.face;
    hero.hidden = !big; if (big) { hero.src = to.photo || to.face; hero.alt = to.name; }
    // phones: Open Swish first, the QR code only on request (and closing it closes the card);
    // computers: the QR code straight away, next to the photo when there is one
    box.classList.toggle('touch', touch); box.classList.remove('qr-on');
    box.classList.toggle('wide', !!big && !touch);
    $('#qrSeg').innerHTML = to.pay.length > 1 ? to.pay.map((m, i) => `<button role="tab" data-m="${i}">${m.kind === 'swish' ? 'Swish' : esc(m.bank)}</button>`).join('') : '';
    $('#qrSeg').hidden = to.pay.length < 2;
    $('#qrAmtIn').value = '';
    box.style.setProperty('--pc', to.color);
    draw();
    box.showModal();
    if (!t.kr && !touch && to.pay.length) $('#qrAmtIn').focus();
  }
  function draw() {
    const to = person(cur.to), m = to.pay[cur.m], bank = m && m.kind === 'bank';
    const memo = plain(`KambuChia ${EV.title} - ${cur.from ? person(cur.from).name : ''}`.replace(/ - $/, ''));
    $('#qrSeg').querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', i === cur.m));
    const fixed = cur.kr != null;
    $('#qrAmtWrap').hidden = fixed || !m; $('#qrAmt').hidden = !fixed;
    $('#qrUnit').textContent = bank ? '₫' : 'kr';
    $('#qrNone').hidden = !!m; $('#qrCode').hidden = !m;
    $('#qrNone').innerHTML = m ? '' : `<b>${esc(to.name)}'s Swish number is on its way.</b><span>The QR code and the Open Swish button show up here once it's in.</span>`;
    const typed = parseFloat($('#qrAmtIn').value.replace(/\s/g, '').replace(',', '.')) || 0;
    let amount, payload;
    $('#qrAcct').innerHTML = ''; $('#qrOpen').hidden = true; $('#qrApps').hidden = true; $('#qrSub').textContent = '';
    $('#qrActions').hidden = !touch || !m; $('#qrHint').hidden = touch || !m || bank;
    if (!m) {
      $('#qrAmt').textContent = krTxt(cur.kr || 0, 0);
    } else if (bank) {
      amount = fixed ? vnd(cur.kr) : Math.round(typed);
      const acct = unscramble(m.acct);
      payload = vietQr(m.bin, acct, amount, memo);
      $('#qrAmt').textContent = krTxt(cur.kr || 0, 0);
      $('#qrSub').textContent = fixed ? vndTxt(amount) : '';
      $('#qrAcct').innerHTML = `<span><b>${esc(m.bank)}</b> · ${esc(acct)}${m.holder !== acct ? ' · ' + esc(m.holder) : ''}</span><button class="copy" data-copy="${esc(acct)}">Copy</button>`;
      $('#qrApps').hidden = !touch;
      $('#qrApps').innerHTML = `<p>Open your bank app</p><div>${APPS.map(([id, name]) => `<a href="${esc(appLink(id, m, acct, amount, memo))}" target="_blank" rel="noopener">${name}</a>`).join('')}</div>`;
    } else {
      amount = fixed ? cur.kr : typed;
      payload = swishLink(unscramble(m.n), amount, memo);
      $('#qrAmt').textContent = krTxt(amount, 0);
      $('#qrOpen').href = payload; $('#qrOpen').hidden = !touch;
    }
    $('#qrSub').hidden = !$('#qrSub').textContent;
    if (payload) { const qr = qrcode(0, 'M'); qr.addData(payload); qr.make(); $('#qrCode').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }
  }
  $('#qrSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { cur.m = +b.dataset.m; draw(); } });
  $('#qrAmtIn').addEventListener('input', draw);
  $('#qrAcct').addEventListener('click', e => {
    const b = e.target.closest('.copy'); if (!b) return;
    navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy).then(() => { b.textContent = '✓'; setTimeout(() => { b.textContent = 'Copy'; }, 1400); });
  });
  // closing plays the card's exit animation first
  const closeBox = () => {
    if (!box.open || box.classList.contains('closing')) return;
    box.classList.add('closing');
    setTimeout(() => { box.classList.remove('closing'); box.close(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200);
  };
  $('#qrClose').onclick = closeBox;
  $('#qrShow').onclick = () => box.classList.add('qr-on');
  $('#qrDone').onclick = closeBox;
  $('#qrPaid').onclick = () => {
    const t = pay.find(x => x.from === cur.from && x.to === cur.to); if (!t) return;
    setTick(t, !isPaid(t)); closeBox();
  };
  box.addEventListener('click', e => { if (e.target === box) closeBox(); });
  box.addEventListener('cancel', e => { e.preventDefault(); closeBox(); });

  // ── photos ─────────────────────────────────────────────
  // A swipeable strip; tap one for the full-screen viewer (swipe, arrows, ←/→).
  const track = $('#track');
  function renderPics() {
    track.innerHTML = EV.photos.map((g, i) => `<button class="tile${g.video ? ' vid' : ''}" data-i="${i}" aria-label="${esc(g.alt || '')}"><img src="${esc(g.video ? g.poster : g.src)}" alt="" loading="lazy" draggable="false">${g.video ? '<span class="play" aria-hidden="true">▶</span>' : ''}</button>`).join('');
    track.scrollLeft = 0; navState();
  }
  const step = dir => track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: 'smooth' });
  $('#picList .prev').onclick = () => step(-1); $('#picList .next').onclick = () => step(1);
  function navState() {
    $('#picList .prev').disabled = track.scrollLeft < 4;
    $('#picList .next').disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 4;
  }
  track.addEventListener('scroll', navState, { passive: true }); addEventListener('resize', navState);
  // mouse drag to swipe; a drag isn't a click
  let drag = null;
  track.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') drag = { x: e.clientX, s: track.scrollLeft, moved: false }; });
  addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 5) { drag.moved = true; track.classList.add('dragging'); }
    if (drag.moved) track.scrollLeft = drag.s - dx;
  });
  addEventListener('pointerup', () => { if (!drag) return; const moved = drag.moved; track.classList.remove('dragging'); setTimeout(() => { drag = null; }, 0); if (moved) track.dataset.justDragged = '1'; setTimeout(() => delete track.dataset.justDragged, 50); });
  track.addEventListener('click', e => { if (track.dataset.justDragged) return; const t = e.target.closest('.tile'); if (t) openViewer(EV.photos, +t.dataset.i); });

  const viewer = $('#viewer'), vTrack = $('#vTrack');
  let vItems = [];
  const vIndex = () => Math.round(vTrack.scrollLeft / vTrack.clientWidth);
  const vGo = (i, smooth = true) => vTrack.scrollTo({ left: Math.max(0, Math.min(vItems.length - 1, i)) * vTrack.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  function vSync() {
    const i = vIndex();
    $('#vDots').querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-current', i === j));
    $('#vPrev').disabled = i === 0; $('#vNext').disabled = i === vItems.length - 1;
    vTrack.querySelectorAll('video').forEach(v => { if (v.closest('.v-item') !== vTrack.children[i]) v.pause(); });
  }
  function openViewer(items, i) {
    if (items !== vItems) {
      vItems = items;
      vTrack.innerHTML = items.map(g => `<div class="v-item">${g.video
        ? `<video src="${esc(g.src)}" poster="${esc(g.poster)}" controls playsinline preload="metadata"></video>`
        : `<img src="${esc(g.src)}" alt="${esc(g.alt || '')}">`}</div>`).join('');
      $('#vDots').innerHTML = items.length > 1 ? items.map((_, j) => `<button data-i="${j}" aria-label="${j + 1}"></button>`).join('') : '';
    }
    viewer.showModal();
    requestAnimationFrame(() => { vGo(i, false); vSync(); const v = vTrack.children[i].querySelector('video'); if (v) v.play().catch(() => {}); });
  }
  vTrack.addEventListener('scroll', () => requestAnimationFrame(vSync), { passive: true });
  $('#vPrev').onclick = () => vGo(vIndex() - 1); $('#vNext').onclick = () => vGo(vIndex() + 1);
  $('#vDots').addEventListener('click', e => { const b = e.target.closest('button'); if (b) vGo(+b.dataset.i); });
  $('#vClose').onclick = () => viewer.close();
  viewer.addEventListener('close', () => vTrack.querySelectorAll('video').forEach(v => v.pause()));
  viewer.addEventListener('click', e => { if (e.target === viewer || e.target.classList.contains('v-item')) viewer.close(); });
  addEventListener('keydown', e => {
    if (!viewer.open) return;
    if (e.key === 'ArrowLeft') vGo(vIndex() - 1);
    if (e.key === 'ArrowRight') vGo(vIndex() + 1);
  });

  // ── tabs (phones; on a wide screen everything shows) ───
  const tabs = document.querySelectorAll('.tabs [role=tab]');
  function showTab(name) {
    document.body.dataset.tab = name;
    tabs.forEach(b => b.setAttribute('aria-selected', b.dataset.tab === name));
  }
  tabs.forEach(b => b.addEventListener('click', () => { showTab(b.dataset.tab); requestAnimationFrame(navState); if (b.dataset.tab === 'pay') playTicks(); }));

  // ── show an event (the newest on arrival; the address stays clean) ─
  function show(ev) {
    EV = ev;
    ({ bal, pay } = settle());
    pay.forEach(t => { t.m = methodFor(t); });
    renderHead(); renderPay(); renderBills(); renderPics();
    showTab('pay'); reapplySplits(); playTicks();
  }
  if (TICKS_ON) {
    setInterval(loadTicks, 20000);
    document.addEventListener('visibilitychange', loadTicks);
  }
  show(EVENTS.slice().sort((a, b) => b.date.localeCompare(a.date))[0]);
  loadTicks();
})();
