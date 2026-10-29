/* ══════════════════════════════════════════════════════════
   FEATURE 45 — HONEST MOTION CONTROLLER
   Motion OFF settles the page instead of freezing it mid-way:
   every GSAP tween finishes instantly (timeScale), scroll reveals
   jump to their visible end state, endless loops park at their
   start, and mouse-driven transforms reset. The head script set
   html[data-motion] before first paint; features read motionOK()
   and listen for the 'motionchange' event.
══════════════════════════════════════════════════════════ */
(function motionController() {
  const root = document.documentElement;
  const mq   = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let applied = true;

  /* endless decorative tweens (the float badges) */
  const loops = () => gsap.globalTimeline.getChildren(true, true, false).filter(t => t.repeat() === -1);

  function settle() {
    ScrollTrigger.getAll().forEach(st => { if (st.animation) st.animation.progress(1); });
    gsap.set(['.mag-btn', '.gsap-cert', '#photoFrame', '#heroPhoto', '.hero-avail', '.hero-stats', '.orb1', '.orb2', '#cur', '#curR'],
             { clearProps: 'transform' });
    document.querySelectorAll('.c-spark, .touch-ripple').forEach(n => n.remove());
  }
  function apply(on) {
    gsap.globalTimeline.timeScale(on ? 1 : 1000);
    loops().forEach(t => on ? t.resume() : t.pause(0));
    if (!on) settle();
    applied = on;
  }
  function setMotion(on, save) {
    on = !!on;
    if (save) { try { localStorage.setItem('motion', on ? 'on' : 'off'); } catch (e) {} }
    root.setAttribute('data-motion', on ? 'on' : 'off');
    if (applied !== on) apply(on);
    document.dispatchEvent(new CustomEvent('motionchange', { detail: { on } }));
  }
  window.setMotion = setMotion;

  /* follow the OS setting live, unless the visitor chose with the button */
  if (mq && mq.addEventListener) {
    mq.addEventListener('change', e => {
      let saved = null;
      try { saved = localStorage.getItem('motion'); } catch (err) {}
      if (saved !== 'on' && saved !== 'off') setMotion(!e.matches, false);
    });
  }
  if (!motionOK()) apply(false);   // reduced-motion first load: no preloader show, everything visible
})();

/* ══════════════════════════════════════════════════════════
   FEATURE 40 — ACCESSIBILITY MOTION TOGGLE
   aria-pressed = "animations paused"; the choice is remembered.
══════════════════════════════════════════════════════════ */
(function motionToggle() {
  const btn = document.getElementById('motionToggle');
  if (!btn) return;
  function paint() {
    const on = motionOK();
    btn.classList.toggle('paused', !on);
    btn.setAttribute('aria-pressed', on ? 'false' : 'true');
    btn.setAttribute('aria-label', 'Pause animations');
    btn.title = on ? 'Pause animations' : 'Play animations';
    btn.innerHTML = on ? '<i class="fa-solid fa-pause" aria-hidden="true"></i>'
                       : '<i class="fa-solid fa-play" aria-hidden="true"></i>';
  }
  paint();
  btn.addEventListener('click', () => {
    const on = !motionOK();
    setMotion(on, true);
    showToast(on ? 'Animations on' : 'Animations off', on ? 'success' : 'info', 2000);
  });
  document.addEventListener('motionchange', paint);
})();

/* ── SECTION CLIP-PATH REVEAL enhancement ── */
gsap.utils.toArray('section').forEach(sec => {
  gsap.from(sec, {
    scrollTrigger: { trigger: sec, start: 'top 98%', toggleActions: 'play none none none' },
    clipPath: 'inset(0 0 4% 0)',
    duration: .9, ease: 'power3.out',
    clearProps: 'clipPath'
  });
});

/* ── MARQUEE speed boost on fast scroll ── */
(function marqueeSpeed() {
  const track = document.querySelector('.marquee-track');
  if (!track) return;
  let lastY = 0, speed = 28;
  window.addEventListener('scroll', () => {
    const delta = Math.abs(window.scrollY - lastY);
    lastY = window.scrollY;
    speed = Math.max(14, 28 - delta * .4);
    track.style.animationDuration = speed + 's';
  }, { passive: true });
})();

/* ── SOFT TAGS interactive click ── */
document.querySelectorAll('.soft-tag').forEach(tag => {
  tag.addEventListener('click', () => {
    gsap.fromTo(tag, { scale: .92 }, { scale: 1, duration: .4, ease: 'elastic.out(1.2,.4)' });
    showToast(tag.textContent.trim(), 'info', 2000);
  });
});

/* (a second, clip-path .about-item animation used to live here; it duplicated
   the "ABOUT ITEMS stagger" above and fought it, so it was removed) */
