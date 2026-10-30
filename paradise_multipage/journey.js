/* 3D travel journal: an open book facing the reader. Each place fills a spread; its landmark lifts
   off the page in 3D, pages turn in 3D, and the book closes and reopens between chapters
   (Jakarta → Bali → Flavours). Content lives in journey-data.js. */
(() => {
  const J = window.JOURNAL;
  const $ = (s, r = document) => r.querySelector(s);
  const desk = $('#desk'), book = $('#book'), body = $('#body'), base = $('#base'), ovl = $('#ovl');
  const cap = $('#cap'), bar = $('#bar'), playBtn = $('#play');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = reduce ? 0.01 : 1;   // time scale

  const DWELL = 5.5, INTRO_DWELL = 3.5, RATIO = 1.72;
  const CUT_REST = 'drop-shadow(0px 0px 0px rgba(20,10,0,0)) brightness(1)';
  const CUT_UP = 'drop-shadow(0px 28px 22px rgba(20,10,0,0.55)) brightness(1.06)';
  const ORN = '<svg class="ornament" viewBox="0 0 220 14" fill="none" stroke="currentColor" aria-hidden="true"><path d="M0 7H86M134 7H220"/><path d="M96 7L110 1L124 7L110 13Z"/><circle cx="110" cy="7" r="2" fill="currentColor"/><circle cx="90" cy="7" r="1.5" fill="currentColor"/><circle cx="130" cy="7" r="1.5" fill="currentColor"/></svg>';

  const S = { ch: 0, p: 0, playing: !reduce, busy: false, timer: null, popTl: null, closed: false };
  const geo = { W: 0, H: 0 };
  const pad = n => String(n).padStart(2, '0');

  const spreads = ch => [{ type: 'intro' }, ...J[ch].items.map((it, i) => ({ type: it.photo ? 'photo' : 'illus', it, i }))];

  /* ---------- building pages ---------- */
  function buildSpread(ch, p) {
    const c = J[ch], d = spreads(ch)[p];
    const el = document.createElement('div');
    el.className = 'spread is-' + d.type;
    Object.assign(el.style, { width: geo.W + 'px', height: geo.H + 'px' });
    if (d.type === 'photo') {
      el.innerHTML = `
        <div class="sp-clip"><img class="bg" src="${d.it.photo}" alt="${d.it.name}"><div class="gutter"></div></div>
        <img class="cut" src="${d.it.cut}" alt="" style="transform-origin:${d.it.origin}">`;
    } else if (d.type === 'illus') {
      el.innerHTML = `
        <div class="pg left"><div class="pg-in">
          <div class="k">No. ${pad(d.i + 1)} · ${d.it.region || c.title}</div>
          <h3>${d.it.name}</h3>
          <div class="ar" lang="ar">${d.it.ar}</div>
          ${ORN}
          <div class="tag">${d.it.tag}</div>
          <p>${d.it.desc}</p>
        </div></div>
        <div class="pg right"><img class="cut art" src="assets/journey/art/${d.it.id}.svg" alt="${d.it.name}" style="transform-origin:50% 100%"></div>
        <div class="gutter"></div>`;
    } else {
      el.innerHTML = `
        <div class="pg left intro"><div class="pg-in">
          <div class="k">Tayer Alshareq · ${c.kicker}</div>
          <h2>${c.title}</h2>
          <div class="ar big" lang="ar">${c.titleAr}</div>
          ${ORN}
          <div class="sub">${c.sub}</div>
          <div class="sub ar" lang="ar">${c.subAr}</div>
        </div></div>
        <div class="pg right"><div class="pg-in toc">
          <div class="k">Contents</div>
          <ol>${c.items.map((it, i) => `<li><button data-p="${i + 1}"><span class="n">${pad(i + 1)}</span><span class="t">${it.name}</span><span class="dots"></span></button></li>`).join('')}</ol>
        </div></div>
        <div class="gutter"></div>`;
    }
    const cut = $('.cut', el);
    if (cut) gsap.set(cut, { filter: CUT_REST });
    return el;
  }

  function coverEl(ch) {
    const c = J[ch];
    const el = document.createElement('div');
    el.className = 'cover';
    el.innerHTML = `
      <div class="k">Tayer Alshareq · Travel Journal</div>
      <h3 class="foil">${c.title}</h3>
      <div class="ar" lang="ar">${c.titleAr}</div>
      ${ORN}
      <div class="sub">${c.kicker} — ${c.sub}</div>
      <div class="glint"></div>`;
    return el;
  }

  // one half of a spread (for the turning leaf and the half that stays put)
  function half(spread, side) {
    const w = document.createElement('div');
    w.className = 'half';
    const c = spread.cloneNode(true);
    Object.assign(c.style, { position: 'absolute', top: 0, left: side === 'left' ? 0 : -geo.W / 2 + 'px' });
    w.appendChild(c);
    return w;
  }

  function leaf(side, front, back) {
    const l = document.createElement('div');
    l.className = 'leaf ' + side;
    const f = document.createElement('div'), b = document.createElement('div');
    f.className = 'face front'; b.className = 'face back';
    f.append(front); b.append(back);
    f.insertAdjacentHTML('beforeend', '<i class="shade"></i>');
    b.insertAdjacentHTML('beforeend', '<i class="shade"></i>');
    l.append(f, b);
    return l;
  }

  const setBase = el => { base.replaceChildren(el); };
  const play = tl => new Promise(res => {
    if (!tl.duration()) { tl.progress(1); res(); return; }
    tl.eventCallback('onComplete', res);
  });

  /* ---------- layout ---------- */
  function layout() {
    const vw = innerWidth, vh = innerHeight, mob = vw < 720;
    const top = mob ? 116 : 128, bottom = mob ? 86 : 92;
    const availW = vw * (mob ? 0.96 : 0.92), availH = Math.max(160, vh - top - bottom);
    geo.W = Math.round(Math.min(availW, availH * RATIO, 1700));
    geo.H = Math.round(geo.W / RATIO);
    Object.assign(book.style, {
      width: geo.W + 'px', height: geo.H + 'px', fontSize: geo.H / 28 + 'px',
      left: (vw - geo.W) / 2 + 'px', top: top + (availH - geo.H) / 2 + 'px'
    });
    ovl.style.perspective = geo.W * 1.8 + 'px';
  }

  /* ---------- the 3D lift ---------- */
  function pop() {
    const cut = $('.cut', base), bg = $('.bg', base);
    if (!cut) return;
    if (S.popTl) S.popTl.kill();
    const isArt = cut.classList.contains('art');
    const tl = gsap.timeline();
    tl.to(cut, { scale: isArt ? 1.16 : 1.12, yPercent: isArt ? -4 : -2.5, filter: CUT_UP, duration: 1.3 * T, ease: 'back.out(1.5)' }, 0);
    if (bg) tl.to(bg, { filter: 'brightness(0.82) saturate(0.92) blur(0.5px)', scale: 1.02, duration: 1.3 * T, ease: 'power2.out' }, 0);
    tl.call(() => burst(cut), null, 0.25 * T);
    if (!reduce) tl.to(cut, { yPercent: (isArt ? -4 : -2.5) - 1.2, duration: 2.4, ease: 'sine.inOut', repeat: -1, yoyo: true });
    S.popTl = tl;
  }
  function sink() {
    if (S.popTl) { S.popTl.kill(); S.popTl = null; }
    const cut = $('.cut', base), bg = $('.bg', base);
    const tl = gsap.timeline();
    if (cut) tl.to(cut, { scale: 1, yPercent: 0, x: 0, y: 0, filter: CUT_REST, duration: 0.45 * T, ease: 'power2.in' }, 0);
    if (bg) tl.to(bg, { filter: 'brightness(1) saturate(1) blur(0px)', scale: 1, x: 0, y: 0, duration: 0.45 * T }, 0);
    return play(tl);
  }

  // depth: the lifted landmark follows the pointer more than the photo behind it
  addEventListener('pointermove', e => {
    if (!S.popTl || reduce) return;
    const px = e.clientX / innerWidth - 0.5, py = e.clientY / innerHeight - 0.5;
    const cut = $('.cut', base), bg = $('.bg', base);
    if (cut) gsap.to(cut, { x: px * geo.W * 0.016, y: py * geo.H * 0.012, duration: 0.6, overwrite: 'auto' });
    if (bg) gsap.to(bg, { x: -px * geo.W * 0.006, y: -py * geo.H * 0.005, duration: 0.6, overwrite: 'auto' });
  });

  /* ---------- page turns ---------- */
  async function turn(dir, next) {
    const A = base.firstElementChild;
    let still, lf;
    if (dir > 0) {
      still = half(A, 'left'); still.classList.add('still', 'l');
      lf = leaf('right', half(A, 'right'), half(next, 'left'));
    } else {
      still = half(A, 'right'); still.classList.add('still', 'r');
      lf = leaf('left', half(A, 'left'), half(next, 'right'));
    }
    ovl.replaceChildren(still, lf);
    setBase(next);
    const [fs, bs] = lf.querySelectorAll('.shade');
    const tl = gsap.timeline();
    tl.to(lf, { rotationY: dir > 0 ? -180 : 180, duration: 1.2 * T, ease: 'power2.inOut' }, 0)
      .fromTo(fs, { opacity: 0 }, { opacity: 0.45, duration: 0.6 * T, ease: 'power1.in' }, 0)
      .fromTo(bs, { opacity: 0.45 }, { opacity: 0, duration: 0.6 * T, ease: 'power1.out' }, 0.6 * T);
    await play(tl);
    ovl.replaceChildren();
  }

  // close the book (cover folds over), swap to another chapter, open it again
  async function closeOpen(ch, p) {
    const A = base.firstElementChild;
    body.style.clipPath = 'inset(-40px -40px -40px 50%)';
    const lf = leaf('left', half(A, 'left'), coverEl(S.ch));
    ovl.replaceChildren(lf);
    await play(gsap.timeline()
      .to(lf, { rotationY: 180, duration: 1.3 * T, ease: 'power2.inOut' }, 0)
      .to(book, { x: -geo.W / 4, duration: 1.3 * T, ease: 'power2.inOut' }, 0));
    S.closed = true;
    const back = $('.face.back', lf);
    await play(gsap.timeline().fromTo($('.glint', back), { xPercent: -130 }, { xPercent: 130, duration: 1 * T, ease: 'power1.inOut' }));
    if (ch !== S.ch) {
      const old = $('.cover', back), fresh = coverEl(ch);
      gsap.set(fresh, { opacity: 0 });
      back.insertBefore(fresh, old);
      await play(gsap.timeline().to(old, { opacity: 0, duration: 0.4 * T }).to(fresh, { opacity: 1, duration: 0.5 * T }, '<0.1'));
      old.remove();
    }
    S.ch = ch; S.p = p;
    syncTabs();
    const B = buildSpread(ch, p);
    setBase(B);
    await open(lf, B);
  }

  async function open(lf, B) {
    $('.face.front', lf).replaceChildren(half(B, 'left'));
    await play(gsap.timeline({ delay: 0.5 * T })
      .to(lf, { rotationY: 0, duration: 1.5 * T, ease: 'power2.inOut' }, 0)
      .to(book, { x: 0, duration: 1.5 * T, ease: 'power2.inOut' }, 0));
    body.style.clipPath = '';
    ovl.replaceChildren();
    S.closed = false;
  }

  /* ---------- flow ---------- */
  function clearTimer() { if (S.timer) { S.timer.kill(); S.timer = null; } gsap.set(bar, { width: '0%' }); }
  function schedule(secs) {
    clearTimer();
    S.timer = gsap.fromTo(bar, { width: '0%' }, { width: '100%', duration: secs, ease: 'none', onComplete: () => { S.timer = null; next(); } });
    if (!S.playing) S.timer.pause();
  }

  function settle() {
    const c = J[S.ch], d = spreads(S.ch)[S.p];
    cap.textContent = d.type === 'intro' ? `${c.title} — ${c.sub}` : `${pad(d.i + 1)}. ${d.it.name}: ${d.it.desc}`;
    history.replaceState(null, '', '#' + c.id);
    if (d.type !== 'intro') pop();
    schedule(d.type === 'intro' ? INTRO_DWELL : DWELL);
  }

  async function run(job) {
    if (S.busy) return;
    S.busy = true;
    clearTimer();
    try { await job(); } finally { S.busy = false; }
    settle();
  }

  const goTo = p => run(async () => {
    if (p === S.p) return;
    await sink();
    const dir = p > S.p ? 1 : -1;
    S.p = p;
    await turn(dir, buildSpread(S.ch, p));
  });
  const toChapter = (ch, p = 0) => run(async () => { await sink(); await closeOpen(ch, p); });

  function next() {
    if (S.p < spreads(S.ch).length - 1) goTo(S.p + 1);
    else if (S.ch < J.length - 1) toChapter(S.ch + 1);
    else finale();
  }
  function prev() {
    if (S.p > 0) goTo(S.p - 1);
    else if (S.ch > 0) toChapter(S.ch - 1, spreads(S.ch - 1).length - 1);
  }

  function finale() {
    clearTimer();
    sink();
    const el = $('#finale');
    el.hidden = false;
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.8 * T });
  }

  /* ---------- controls ---------- */
  function setPlaying(on) {
    S.playing = on;
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    playBtn.innerHTML = on
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
    if (S.timer) on ? S.timer.resume() : S.timer.pause();
  }
  playBtn.addEventListener('click', () => setPlaying(!S.playing));
  $('#next').addEventListener('click', () => { setPlaying(false); next(); });
  $('#prev').addEventListener('click', () => { setPlaying(false); prev(); });
  base.addEventListener('click', e => {
    const b = e.target.closest('button[data-p]');
    if (b) { setPlaying(false); goTo(+b.dataset.p); }
  });

  const tabs = $('#chapters');
  tabs.innerHTML = J.map((c, k) => `<button role="tab" data-ch="${k}">${c.title} · <span lang="ar" class="ar">${c.titleAr}</span></button>`).join('');
  const syncTabs = () => tabs.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-selected', String(k === S.ch)));
  tabs.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b && +b.dataset.ch !== S.ch) toChapter(+b.dataset.ch);
  });
  addEventListener('hashchange', () => {
    const n = J.findIndex(c => '#' + c.id === location.hash);
    if (n >= 0 && n !== S.ch) toChapter(n);
  });
  $('#replay').addEventListener('click', () => {
    $('#finale').hidden = true;
    setPlaying(true);
    toChapter(0);
  });
  addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); $('#next').click(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); $('#prev').click(); }
    if (e.key === ' ' && e.target === document.body) { e.preventDefault(); playBtn.click(); }
  });
  let sx = null;
  desk.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  desk.addEventListener('touchend', e => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 50) (dx < 0 ? $('#next') : $('#prev')).click();
  });

  let rz;
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (S.busy) return;
      layout();
      setBase(buildSpread(S.ch, S.p));
      if (spreads(S.ch)[S.p].type !== 'intro') pop();
    }, 150);
  });

  /* ---------- gold dust ---------- */
  const cv = $('#dust'), ctx = cv.getContext('2d');
  const motes = [], sparks = [];
  let dpr = 1;
  function sizeCanvas() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
  }
  sizeCanvas();
  addEventListener('resize', sizeCanvas);
  for (let k = 0; k < (innerWidth < 720 ? 22 : 42); k++) {
    motes.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.6, v: 0.00012 + Math.random() * 0.00035, t: Math.random() * 6 });
  }
  function burst(cut) {
    if (reduce) return;
    const r = cut.getBoundingClientRect();
    const [ox, oy] = (cut.style.transformOrigin || '50% 100%').split(' ').map(v => parseFloat(v) / 100);
    const x = r.left + r.width * ox, y = r.top + r.height * oy;
    for (let k = 0; k < 60; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, sp = 1 + Math.random() * 3.8;
      sparks.push({ x: x + (Math.random() - 0.5) * r.width * 0.3, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: 0.008 + Math.random() * 0.016, r: 0.8 + Math.random() * 2.2 });
    }
  }
  (function tick() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalCompositeOperation = 'lighter';
    if (!reduce) for (const m of motes) {
      m.y -= m.v; m.t += 0.02;
      if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(m.t);
      ctx.fillStyle = '#f6dc96';
      ctx.beginPath(); ctx.arc(m.x * innerWidth, m.y * innerHeight, m.r, 0, 6.283); ctx.fill();
    }
    for (let k = sparks.length - 1; k >= 0; k--) {
      const s = sparks[k];
      s.x += s.vx; s.y += s.vy; s.vy += 0.03; s.vx *= 0.985; s.life -= s.decay;
      if (s.life <= 0) { sparks.splice(k, 1); continue; }
      ctx.globalAlpha = s.life;
      ctx.fillStyle = s.life > 0.6 ? '#fff3c4' : '#e3b24f';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (0.6 + s.life * 0.6), 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  })();

  /* ---------- start: the closed book opens onto the chapter ---------- */
  S.ch = Math.max(0, J.findIndex(c => '#' + c.id === location.hash));
  setPlaying(S.playing);
  syncTabs();
  const boot = () => {
    layout();
    const B = buildSpread(S.ch, 0);
    setBase(B);
    body.style.clipPath = 'inset(-40px -40px -40px 50%)';
    const lf = leaf('left', half(B, 'left'), coverEl(S.ch));
    gsap.set(lf, { rotationY: 180 });
    gsap.set(book, { x: -geo.W / 4 });
    ovl.replaceChildren(lf);
    S.closed = true;
    run(async () => {
      await play(gsap.timeline({ delay: 0.6 * T }).fromTo($('.face.back .glint', lf), { xPercent: -130 }, { xPercent: 130, duration: 1 * T }));
      await open(lf, B);
    });
  };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(boot);
})();
