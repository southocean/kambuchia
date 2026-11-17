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
    const rem = Object.fromEntries(whole.filter(x => x.v > 0).map(x => [x.id, x.v]));
    const once = whole.filter(x => x.v < 0 && !sq.has(x.id)).sort((a, b) => a.v - b.v);
    const owing = whole.filter(x => x.v < 0 && sq.has(x.id)).map(x => ({ id: x.id, v: -x.v }));
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

  // ── pay ────────────────────────────────────────────────
  function renderPay() {
    const rows = pay.map((t, i) => {
      const made = (EV.payments || []).filter(p => p.from === t.from && p.to === t.to);
      const done = made.reduce((s, p) => s + p.kr, 0) >= t.kr - 0.5, receipt = made.find(p => p.photo);
      const to = person(t.to), m = to.pay[t.m], bank = m && m.kind === 'bank';
      const via = !m ? 'Swish number coming' : bank ? m.bank : 'Swish';
      return `<li class="pay-row${done ? ' paid' : ''}${m ? '' : ' nonum'}" style="--from:${person(t.from).color};--to:${to.color}">
        <button class="pay-btn" data-i="${i}"${receipt ? ` data-receipt="${esc(receipt.photo)}"` : ''}${done && !receipt ? ' disabled' : ''} aria-label="${esc(person(t.from).name)} pays ${esc(to.name)} ${t.kr} kr${done ? ', paid' : ''}">
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
    else if (!b.closest('.paid')) openPay(pay[+b.dataset.i]);
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
  const touch = matchMedia('(pointer: coarse)').matches;
  let cur = null;
  function openPay(t) {
    const to = person(t.to);
    cur = { ...t, m: t.m || 0 };
    $('#qrTitle').innerHTML = t.from
      ? `${face(t.from, 'sm')}<span>${esc(person(t.from).name)}</span><i>→</i>${face(t.to, 'sm')}<span>${esc(to.name)}</span>`
      : `<span>Pay</span>${face(t.to, 'sm')}<span>${esc(to.name)}</span>`;
    const hero = $('#qrHero'), big = !t.from && to.face;
    hero.hidden = !big; if (big) { hero.src = to.photo || to.face; hero.alt = to.name; }
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
  $('#qrClose').onclick = () => box.close();
  box.addEventListener('click', e => { if (e.target === box) box.close(); });

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
    showTab('pay'); playTicks();
  }
  show(EVENTS.slice().sort((a, b) => b.date.localeCompare(a.date))[0]);
})();
