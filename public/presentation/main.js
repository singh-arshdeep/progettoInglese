// iPhone 17 – Tech Review: renders that play only on screen, the chapter band, and the moves the sheet dealt.
const reduced = false;
const phone = matchMedia('(max-width: 767px)').matches;

// ---- videos: each plays once when it is in view and stops on its last frame (no loops); coming back to it plays it
// again from the start; leaving it half-way pauses it. Loaded a little before they arrive; smaller files on phones;
// posters only under reduced motion. data-dir="video" marks the graphite renders (they sit on the graphite cards).
const videos = [...document.querySelectorAll('video[data-v]')];
if (!reduced) {
  const load = (v) => { if (!v.getAttribute('src')) { v.src = `assets/${v.dataset.dir || 'cut'}/${phone ? 'mobile/' : ''}${v.dataset.v}.mp4`; v.preload = 'auto'; } };
  const near = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { load(e.target); near.unobserve(e.target); }
  }, { rootMargin: '400px 0px' });
  const seen = new IntersectionObserver((entries) => {
    for (const { target: v, isIntersecting } of entries) {
      if (isIntersecting) {
        load(v);
        if (v.ended) v.currentTime = 0;
        v.play().catch(() => {});
      } else if (!v.paused) v.pause();
    }
  }, { threshold: 0.35 });
  videos.forEach((v) => { near.observe(v); seen.observe(v); });
}

// ---- the chapter band: the name of the section in view slides up out of its mask, the next slides in
{
  const now = document.querySelector('.band__now');
  let current = '';
  const show = (name) => {
    if (name === current) return;
    current = name;
    const old = now.querySelector('span:not(.is-out)');
    const next = Object.assign(document.createElement('span'), { textContent: name, className: reduced ? '' : 'is-in' });
    now.append(next);
    if (old) { if (reduced) old.remove(); else { old.classList.add('is-out'); setTimeout(() => old.remove(), 300); } }
    if (!reduced) requestAnimationFrame(() => requestAnimationFrame(() => next.classList.remove('is-in')));
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) show(e.target.dataset.name || '');
  }, { rootMargin: '-50% 0px -50% 0px' });
  document.querySelectorAll('[data-hero], [data-name]').forEach((s) => io.observe(s));
}

// ---- small cards and the pros/cons appear one by one once their group is well in view
{
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -30% 0px' });
  document.querySelectorAll('[data-appear]').forEach((el) => io.observe(el));
}

// ---- rolling figures (motion.md): each digit rolls up to its value once, the real number kept for screen readers
{
  const els = [...document.querySelectorAll('[data-roll]')];
  els.forEach((el) => {
    const value = el.textContent.trim();
    const said = Object.assign(document.createElement('span'), { className: 'sr-only', textContent: value });
    const shown = Object.assign(document.createElement('span'), { className: 'roll__digits' });
    shown.setAttribute('aria-hidden', 'true');
    let i = 0;
    for (const ch of value) {
      const col = Object.assign(document.createElement('span'), { className: 'roll__col' });
      const strip = Object.assign(document.createElement('span'), { className: 'roll__strip' });
      strip.style.setProperty('--d', ch);
      strip.style.setProperty('--i', i++);
      col.append(strip);   // the strip's 0-9 is drawn by CSS, so the heading's text stays the real number
      shown.append(col);
    }
    el.classList.add('roll');
    el.replaceChildren(said, shown);
  });
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -15% 0px' });
  els.forEach((el) => io.observe(el));
}

if (!window.gsap || !window.ScrollTrigger) document.documentElement.classList.add('no-gsap');

if (!reduced && window.gsap && window.ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);

  // 1 · hero: the title recedes, the five colours come close (kept from the first build)
  gsap.timeline({ scrollTrigger: phone ? { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 } : { trigger: '.hero', start: 'top top', end: 'bottom bottom', scrub: 0.6 } })
    .to('.hero__words', { yPercent: -35, scale: 0.78, autoAlpha: 0, ease: 'power1.in', duration: 0.4 }, 0)
    .fromTo('.hero__pic video', { scale: 1 }, { scale: () => (phone ? 2.4 : 1.2), yPercent: () => (phone ? 0 : -14), ease: 'power1.inOut', duration: 0.7 }, 0)
    .to('.hero__pic', { autoAlpha: 0, yPercent: () => (phone ? 0 : -8), ease: 'power1.in', duration: 0.3 }, 0.7);
  const late = document.querySelector('.late');
  ScrollTrigger.create({ trigger: '.hero', start: 'top top', end: '+=60%', onUpdate: (s) => late.style.setProperty('--k', s.progress) });
}

// ---- presentation: the arrow keys, PageUp/PageDown, Space (or a clicker) and the on-screen arrows step through the
// page. A step is a stop on the page (scrolled into place) or one reveal inside it (a card, the pros, the cons, the
// picture opening). Back undoes a reveal, then goes to the stop before. Scrolling by hand leaves the mode and shows
// everything, so the page still reads as an ordinary page.
{
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const middle = (el) => () => el.offsetTop + (el.offsetHeight - innerHeight) / 2;
  // one click shows all of a stop's reveals, still in their order: each group 300ms after the one before, the members
  // of a group 120ms apart (the delay is read when the reveal arrives)
  const once = (groups) => {
    groups.forEach((g, gi) => g.forEach((el, ii) => { el.dataset.delay = gi * 300 + ii * 120; }));
    return groups.length ? [groups.flat()] : [];
  };
  const stops = [
    { y: () => 0, beats: [] },
    { y: () => $('#features h2').getBoundingClientRect().top + scrollY - $('.band').offsetHeight - 24, beats: once($$('.pair > .card').map((c) => [c])) },
    { y: middle($('#love')), beats: once($$('.love__cards > li').map((li) => [li])) },
    { y: middle($('#flaws')), beats: once([$$('.versus__side--pro > li'), $$('.versus__side--con > li')]) },
    { y: middle($('#verdict')), beats: once([[$('.verdict__for'), $('.verdict__pic')]]) },
    { y: middle($('#advice')), beats: once([[$('.advice__icon')], ...$$('.advice__why > li').map((li) => [li])]) },
    { y: () => $('#glossary').offsetTop, beats: [] },
    { y: middle($('#debate')), beats: once([[$('.debate__side')], ...$$('.debate__steps > li').map((li) => [li])]) },
    // language expert: a stop per part; in "Your turn!" the sentences come with one click, the answers with the next
    ...$$('.lang__part').map((part) => {
      const all = (s) => [...part.querySelectorAll(s)];
      const gaps = all('.gap > span');
      return { y: () => part.offsetTop, beats: [...once(all('tbody tr, .lang__side, .lang__phrases > li, .lang__quiz > li').map((el) => [el])), ...(gaps.length ? [gaps] : [])] };
    }),
  ];
  const waiting = stops.flatMap((s) => s.beats.flat());
  const prevBtn = $('[data-deck="prev"]'), nextBtn = $('[data-deck="next"]');
  let on = false, at = 0, shown = 0;   // on: presenting; at: the stop; shown: reveals made at that stop
  const live = () => stops.filter((s) => !s.when || s.when());
  const paint = () => {
    const list = live();
    list.forEach((s, i) => s.beats.forEach((group, b) => group.forEach((el) => {
      const hide = i > at || (i === at && b >= shown);
      const arriving = el.classList.contains('is-hid') && !hide;
      const delay = +(el.dataset.delay || 0);
      el.style.transitionDelay = arriving ? delay + 'ms' : '0ms';   // arrive in order, leave at once
      el.classList.toggle('is-hid', hide);
      // a render arriving with its step starts from its first frame, so it plays as the card appears
      if (arriving && !reduced) setTimeout(() => el.querySelectorAll('video[src]').forEach((v) => { v.currentTime = 0; v.play().catch(() => {}); }), delay);
    })));
    prevBtn.disabled = at === 0 && shown === 0;
    nextBtn.disabled = at === list.length - 1 && shown === list[at].beats.length;
  };
  let glideId = 0;
  const glide = (to) => {
    cancelAnimationFrame(glideId);
    if (reduced) return scrollTo(0, to);
    const from = scrollY, d = to - from, T = Math.min(2200, Math.max(700, Math.abs(d) * 0.9)), t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => { const k = Math.min(1, (now - t0) / T); scrollTo(0, from + d * ease(k)); if (k < 1) glideId = requestAnimationFrame(step); };
    glideId = requestAnimationFrame(step);
  };
  const go = (i, beats) => {
    const list = live();
    at = Math.max(0, Math.min(list.length - 1, i));
    shown = beats === 'all' ? list[at].beats.length : 0;
    paint();
    glide(Math.max(0, list[at].y()));
  };
  // entering the mode: the stop is the last one at or above where the page is now; its reveals start hidden
  const start = () => {
    if (on) return;
    on = true;
    document.documentElement.classList.add('is-presenting');
    at = 0;
    live().forEach((s, i) => { if (s.y() <= scrollY + 8) at = i; });
    shown = 0;
    paint();
  };
  const stop = () => {
    cancelAnimationFrame(glideId);
    if (!on) return;
    on = false;
    document.documentElement.classList.toggle('is-presenting', false);
    waiting.forEach((el) => { el.classList.toggle('is-hid', false); el.style.transitionDelay = ''; });
    prevBtn.disabled = nextBtn.disabled = false;
  };
  const next = () => {
    start();
    const list = live();
    if (shown < list[at].beats.length) { shown++; paint(); }
    else if (at < list.length - 1) go(at + 1);
  };
  const prev = () => {
    start();
    if (shown > 0) { shown--; paint(); }
    else go(at - 1, at > 0 ? 'all' : 0);
  };
  // the class game drives the deck from the host's phone: every stop and every reveal is one numbered step
  const NAMES = ['iPhone 17', 'Key Features', 'What I Love', 'Pros vs Cons', 'My Verdict', 'My Advice', 'Glossary', 'Debate', 'Language Expert', 'As or as if?', 'Recommending phrases', 'Your turn!'];
  const flat = () => live().flatMap((s, i) => [[i, 0], ...s.beats.map((_, b) => [i, b + 1])]);
  window.deck = {
    total: () => flat().length,
    stops: () => { let n = 0; return live().map((s, i) => { const r = { name: NAMES[i] || 'Part ' + (i + 1), step: n }; n += 1 + s.beats.length; return r; }); },
    goTo(k) {
      const list = flat(), [i, b] = list[Math.max(0, Math.min(list.length - 1, k | 0))];
      start();
      const move = i !== at;
      at = i; shown = b; paint();
      if (move || Math.abs(scrollY - Math.max(0, live()[at].y())) > 4) glide(Math.max(0, live()[at].y()));
    },
  };
  nextBtn.addEventListener('click', next);
  prevBtn.addEventListener('click', prev);
  const embedded = document.documentElement.classList.contains('embed');
  if (!embedded) addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const onControl = e.target.closest && e.target.closest('a, button');
    if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key) || (e.key === ' ' && !onControl)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); prev(); }
    else if (e.key === 'Home') { e.preventDefault(); start(); go(0); }
    else if (e.key === 'Escape') stop();
  });
  if (!embedded) addEventListener('wheel', stop, { passive: true });
  if (!embedded) addEventListener('touchmove', stop, { passive: true });
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', stop));
}

// ---- language expert, "Your turn!": the button shows the answers in the gaps, and hides them again
{
  const btn = document.querySelector('.lang__check');
  const quiz = document.querySelector('.lang__quiz');
  const label = btn.querySelector('.btn__label');
  btn.addEventListener('click', () => {
    const on = quiz.classList.toggle('is-solved');
    btn.setAttribute('aria-pressed', on);
    label.textContent = label.dataset.label = on ? 'Hide answers' : 'Show answers';
  });
}

// ---- glossary: the class guesses the word; a click shows its Italian and the plain word from the review (and hides them)
document.querySelectorAll('.term').forEach((b) => b.addEventListener('click', () => {
  b.setAttribute('aria-expanded', b.getAttribute('aria-expanded') !== 'true');
}));

// ---- class game: what is open in the glossary and in "Your turn!", read and set from outside,
// and told to the game when the big screen clicks it, so every phone opens the same words
{
  const terms = [...document.querySelectorAll('.term')];
  const quiz = document.querySelector('.lang__quiz'), btn = document.querySelector('.lang__check'), label = btn.querySelector('.btn__label');
  const ui = () => ({ terms: terms.map((b, i) => (b.getAttribute('aria-expanded') === 'true' ? i : -1)).filter((i) => i >= 0), solved: quiz.classList.contains('is-solved') });
  Object.assign(window.deck, {
    ui,
    setUi({ terms: open = [], solved = false } = {}) {
      terms.forEach((b, i) => b.setAttribute('aria-expanded', open.includes(i)));
      quiz.classList.toggle('is-solved', solved);
      btn.setAttribute('aria-pressed', solved);
      label.textContent = label.dataset.label = solved ? 'Hide answers' : 'Show answers';
    },
  });
  // the page's own click handlers run first, then this reports the new state
  const tell = () => { if (parent !== window) parent.postMessage({ type: 'deck-ui', ui: ui() }, location.origin); };
  [...terms, btn].forEach((el) => el.addEventListener('click', tell));
}
