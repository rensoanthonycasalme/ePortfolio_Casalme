/* Site features (data renderers first, then Features 1–39).
   GSAP now comes from npm and is bundled by Astro; it is also exposed on window
   for the lab/terminal/motion modules, which load after this one (see main.js). */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { TextPlugin } from 'gsap/TextPlugin';
import { CustomEase } from 'gsap/CustomEase';
Object.assign(window, { gsap, ScrollTrigger });

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, TextPlugin);

/* ══════════════════════════════════════════════════════════
   FEATURE 41 — PORTFOLIO DATA (single content source)
   Runs FIRST so every feature below that binds to .cert-card,
   .mag-btn, a or button finds the rendered markup.
══════════════════════════════════════════════════════════ */
const PD = window.PD = (function loadPortfolioData() {
  let d = {};
  try { d = JSON.parse(document.getElementById('portfolioData').textContent) || {}; }
  catch (err) { console.error('portfolioData is not valid JSON; dynamic content skipped.', err); }
  /* guarantee the core shape so no feature has to null-check it */
  d.person = d.person || {};
  d.person.links = d.person.links || {};
  d.resume = d.resume || { pdf: '' };
  d.ojt = d.ojt || {};
  d.interests = Array.isArray(d.interests) ? d.interests : [];
  d.about = d.about || { story: '' };
  d.certs = Array.isArray(d.certs) ? d.certs : [];
  d.education = Array.isArray(d.education) ? d.education : [];
  d.analytics = d.analytics || {};
  return d;
})();

/* Tiny DOM builder: strings always become text nodes, never HTML. */
function pdEl(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(k => {
    const v = attrs[k];
    if (v == null || v === false) return;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v === true ? '' : String(v));
  });
  kids.flat(Infinity).forEach(c => {
    if (c == null || typeof c === 'boolean' || c === '') return;
    n.append(c instanceof Node ? c : String(c));
  });
  return n;
}
if (!window.el) window.el = pdEl;
/* Only http(s) / mailto / relative URLs from the data block reach an href. */
function pdUrl(u) {
  if (typeof u !== 'string') return '';
  u = u.trim();
  return u && !/^(javascript|data|vbscript):/i.test(u) ? u : '';
}
function pdPretty(u) { return String(u).replace(/^[a-z]+:\/\/(www\.)?/i, '').replace(/\/+$/, ''); }
/* Text with <wbr> break points before "@" and after "/" so long addresses wrap at sane places. */
function pdBreakable(s) {
  const out = [];
  String(s).split(/(@|\/)/).forEach(part => {
    if (part === '@') out.push(document.createElement('wbr'), '@');
    else if (part === '/') out.push('/', document.createElement('wbr'));
    else if (part) out.push(part);
  });
  return out;
}
/* Decorative-motion gate (uses the shared motionOK() contract when present). */
function pdMotion() {
  if (typeof window.motionOK === 'function') return !!window.motionOK();
  return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* Certificate cards: front + flip back, straight from PD.certs */
(function renderCerts() {
  const grid = document.getElementById('certGrid');
  if (!grid) return;
  const icon = cls => pdEl('i', { class: cls, 'aria-hidden': 'true' });
  const open = (i, e) => { if (e) e.stopPropagation(); window.openModal(i); };
  grid.replaceChildren(...PD.certs.map((c, i) => {
    const verify = pdUrl(c.verifyUrl);
    const front = pdEl('div', { class: 'cert-front' },
      pdEl('div', { class: 'cert-img-wrap' },
        pdEl('img', { src: pdUrl(c.img), alt: `${c.type}: ${c.title} (${c.issuer})`, width: 700, height: 525, loading: 'lazy', decoding: 'async', style: 'background:#fff' }),
        pdEl('div', { class: 'cert-overlay', 'aria-hidden': 'true' }, pdEl('span', null, icon('fa-solid fa-expand'), ' View Certificate'))),
      pdEl('div', { class: 'cert-body' },
        c.type ? pdEl('span', { class: 'cert-type', text: c.type }) : null,
        pdEl('h3', { class: 'cert-title', text: c.title }),
        pdEl('div', { class: 'cert-meta' },
          c.date ? pdEl('span', null, icon('fa-regular fa-calendar'), pdEl('time', { datetime: c.dateISO || null, text: c.date })) : null,
          c.issuer ? pdEl('span', null, icon('fa-solid fa-building'), c.issuer) : null,
          c.venue ? pdEl('span', null, icon('fa-solid fa-location-dot'), c.venue) : null),
        c.summary ? pdEl('div', { class: 'cert-desc', text: c.summary }) : null));

    /* back face is a mouse-only duplicate of the modal (keyboard users get the modal) */
    const viewBtn = pdEl('button', { type: 'button', class: 'cert-back-btn', tabindex: '-1', text: 'View Details' });
    viewBtn.addEventListener('click', e => open(i, e));
    let verifyLink = null;
    if (verify) {
      verifyLink = pdEl('a', { class: 'cert-back-btn', href: verify, target: '_blank', rel: 'noopener noreferrer', tabindex: '-1' }, icon('fa-solid fa-circle-check'), ' Verify');
      verifyLink.addEventListener('click', e => e.stopPropagation());
    }
    const back = pdEl('div', { class: 'cert-back', 'aria-hidden': 'true' },
      pdEl('div', { class: 'cb-icon' }, icon(c.icon || 'fa-solid fa-certificate')),
      pdEl('div', { class: 'cb-title', text: c.title }),
      c.issuer ? pdEl('div', { class: 'cb-org', text: c.issuer }) : null,
      c.date ? pdEl('time', { class: 'cb-date', datetime: c.dateISO || null, text: c.date }) : null,
      pdEl('div', { class: 'cert-back-links' }, viewBtn, verifyLink));

    const card = pdEl('div', {
      class: 'cert-card gsap-cert cert-card-3d', 'data-cat': c.cat || '', 'data-idx': i, 'data-id': c.id || null,
      tabindex: '0', role: 'button', 'aria-label': `View certificate: ${c.title}${c.issuer ? ', ' + c.issuer : ''}${c.date ? ', ' + c.date : ''}`
    }, pdEl('div', { class: 'cert-card-inner' }, front, back));
    card.addEventListener('click', () => open(i));
    card.addEventListener('keydown', e => {
      if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(i); }
    });
    return card;
  }));
})();

/* Hero stats, contact/footer links and the optional About story */
(function applyPortfolioData() {
  const p = PD.person, L = p.links;
  /* real numbers already sit in the HTML for no-JS readers; PD keeps them in sync */
  const certStat = document.querySelector('.hs-num[data-pd="certCount"]');
  if (certStat && PD.certs.length) { certStat.dataset.target = PD.certs.length; certStat.textContent = PD.certs.length; }
  const yearStat = document.querySelector('.hs-num[data-pd="gradYear"]');
  if (yearStat && p.gradYear) { yearStat.dataset.target = p.gradYear; yearStat.textContent = p.gradYear; }

  const nameParts = String(p.name || '').split(/\s+/).filter(Boolean);
  const shortName = nameParts.length > 1 ? nameParts[0] + ' ' + nameParts[nameParts.length - 1] : (nameParts[0] || '');
  document.querySelectorAll('[data-pd-email]').forEach(a => {
    if (!p.email) { (a.closest('.contact-row') || a).remove(); return; }
    a.href = 'mailto:' + p.email + '?subject=' + encodeURIComponent('Internship inquiry - ' + shortName);
    const v = a.querySelector('.c-val');
    if (v) v.replaceChildren(...pdBreakable(p.email));
  });
  document.querySelectorAll('[data-pd-link]').forEach(a => {
    const url = pdUrl(L[a.dataset.pdLink]);
    if (!url) { a.remove(); return; }
    a.href = url;
    const v = a.querySelector('.c-val');
    if (v) v.replaceChildren(...pdBreakable(pdPretty(url)));
  });

  const story = String(PD.about.story || '').trim();
  const intro = document.getElementById('aboutIntro');
  if (story && intro) intro.after(pdEl('p', { class: 'about-story', text: story }));
})();

/* ══════════════════════════════════════════════════════════
   FEATURE 42 — INTERNSHIP SNAPSHOT + RÉSUMÉ BUTTON
══════════════════════════════════════════════════════════ */
(function snapshotAndResume() {
  const p = PD.person, o = PD.ojt;
  const list = document.getElementById('ojtSnapshot');
  if (list) {
    const program = [[p.programShort || p.program, p.school].filter(Boolean).join(', '),
                     p.gradYear ? 'Class of ' + p.gradYear : ''].filter(Boolean).join(' · ');
    /* [label, value, width class] — a row exists only when its value does.
       'wide' = full line everywhere, 'wide-sm' = full line on phones only */
    const rows = [
      ['Focus', PD.interests.filter(Boolean).join(' · '), 'wide'],
      ['Program', program, 'wide'],
      ['OJT hours', o.hours], ['Window', o.window], ['Setup', o.setup],
      ['Commute', o.commute, 'wide-sm'], ['Endorsement', o.moa, 'wide']
    ].filter(r => r[1] != null && String(r[1]).trim() !== '');
    list.replaceChildren(...rows.map(([k, v, w]) =>
      pdEl('div', { class: 'ojt-row' + (w ? ' ' + w : '') }, pdEl('dt', { text: k }), pdEl('dd', { text: String(v) }))));
    list.classList.toggle('ojt-many', rows.length >= 5);
    list.hidden = rows.length === 0;
  }

  const btn = document.getElementById('resumeBtn');
  if (!btn) return;
  const pdf = pdUrl(PD.resume.pdf);
  if (pdf) {
    const link = pdEl('a', { class: 'btn-primary mag-btn', id: 'resumeBtn', href: pdf, download: pdf.split('/').pop() || true },
      pdEl('i', { class: 'fa-solid fa-download', 'aria-hidden': 'true' }), ' Download Résumé (PDF)');
    const view = pdEl('a', { class: 'btn-ghost', href: pdf, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'View résumé PDF (opens in a new tab)' },
      pdEl('i', { class: 'fa-solid fa-up-right-from-square', 'aria-hidden': 'true' }), ' View');
    btn.replaceWith(link);
    link.after(view);
  } else {
    /* no PDF yet: print the one-page résumé built by Feature 43 (Save as PDF) */
    btn.hidden = false;
    btn.addEventListener('click', () => {
      if (typeof window.buildPrintResume === 'function') window.buildPrintResume();
      window.print();
    });
  }
})();

/* ══════════════════════════════════════════════════════════
   FEATURE 43 — PRINT RÉSUMÉ (built from PD for Save as PDF)
══════════════════════════════════════════════════════════ */
(function printResume() {
  const texts = sel => [...document.querySelectorAll(sel)].map(n => n.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
  function skillNames() {
    if (Array.isArray(PD.skills) && PD.skills.length) {
      return PD.skills.map(s => typeof s === 'string' ? s : (s && (s.name || s.title || s.label)) || '').filter(Boolean);
    }
    return texts('#skills .skill-name');
  }
  function build() {
    const p = PD.person, L = p.links, o = PD.ojt;
    let root = document.getElementById('printResume');
    if (!root) { root = pdEl('div', { id: 'printResume' }); document.body.appendChild(root); }
    const sec = (title, ...kids) => pdEl('div', { class: 'pr-sec' }, pdEl('h2', { class: 'pr-h', text: title }), ...kids);
    const row = (main, sub, date) => pdEl('div', { class: 'pr-row' },
      pdEl('div', { class: 'pr-main' }, pdEl('b', { text: main }), sub ? pdEl('span', { class: 'pr-sub', text: sub }) : null),
      date ? pdEl('div', { class: 'pr-date', text: date }) : null);

    const contact = [];
    if (p.email) contact.push(['Email', 'mailto:' + p.email, p.email]);
    [['GitHub', L.github], ['LinkedIn', L.linkedin], ['Facebook', L.facebook]].forEach(([k, u]) => {
      u = pdUrl(u); if (u) contact.push([k, u, pdPretty(u)]);
    });
    if (/^https?:$/.test(location.protocol) && !/^(localhost|127\.|\[::1\])/.test(location.hostname)) {
      const site = location.origin + location.pathname.replace(/index\.html$/, '');
      contact.push(['Portfolio', site, pdPretty(site)]);
    }
    const focus = PD.interests.filter(Boolean);
    const ojtRows = [['Required OJT hours', o.hours], ['Internship window', o.window], ['Setup', o.setup],
                     ['Can commute to', o.commute], ['Endorsement', o.moa]].filter(r => r[1] != null && String(r[1]).trim() !== '');
    const certs = PD.certs.slice().sort((a, b) => String(b.dateISO || '').localeCompare(String(a.dateISO || '')));
    const edu = PD.education.slice().reverse();
    const tech = skillNames(), soft = texts('#skills .soft-tag');
    const tagline = [p.program, p.school, p.gradYear ? 'Class of ' + p.gradYear : ''].filter(Boolean).join(' · ');
    const focusText = focus.length > 1 ? focus.slice(0, -1).join(', ') + ' and ' + focus[focus.length - 1] : (focus[0] || '');
    const profile = 'Information Technology student available for internship' + (focusText ? ', focused on ' + focusText : '') + '.';

    root.replaceChildren(...[
      pdEl('header', { class: 'pr-head' },
        pdEl('div', { class: 'pr-name', text: p.name || '' }),
        tagline ? pdEl('div', { class: 'pr-tag', text: tagline }) : null,
        contact.length ? pdEl('div', { class: 'pr-contact' },
          contact.map(([k, href, label]) => pdEl('span', null, pdEl('b', { text: k + ': ' }), pdEl('a', { href, text: label })))) : null),
      sec('Profile',
        pdEl('p', { class: 'pr-line', text: profile }),
        ojtRows.length ? pdEl('dl', { class: 'pr-kv' }, ojtRows.map(([k, v]) => [pdEl('dt', { text: k }), pdEl('dd', { text: String(v) })])) : null),
      edu.length ? sec('Education', edu.map(e => row(e.school, e.sub, e.years))) : null,
      certs.length ? sec('Certificates & Trainings', certs.map(c => {
        const v = pdUrl(c.verifyUrl);
        return row(c.title, [c.issuer, c.type, v ? 'Verify: ' + pdPretty(v) : ''].filter(Boolean).join(' · '), c.date);
      })) : null,
      (tech.length || soft.length) ? sec('Skills',
        tech.length ? pdEl('p', { class: 'pr-line' }, pdEl('b', { text: 'Technical: ' }), tech.join(' · ')) : null,
        soft.length ? pdEl('p', { class: 'pr-line' }, pdEl('b', { text: 'Soft skills: ' }), soft.join(' · ')) : null) : null
    ].filter(Boolean));
    document.documentElement.classList.add('pr-ready');
  }
  window.buildPrintResume = build;
  try { build(); } catch (err) { console.error('print résumé build failed; the page itself will print.', err); }
  /* rebuild late so content added by later features (e.g. skills) is included */
  window.addEventListener('load', build);
  window.addEventListener('beforeprint', build);
})();

/* ══════════════════════════════════════════════════════════
   FEATURE 44 — CONTACT: COPY EMAIL
══════════════════════════════════════════════════════════ */
(function copyEmail() {
  const email = PD.person.email;
  document.querySelectorAll('.copy-email').forEach(btn => {
    if (!email) { btn.remove(); return; }
    const ico = btn.querySelector('i');
    btn.addEventListener('click', async () => {
      let ok = false;
      try {
        await navigator.clipboard.writeText(email);
        ok = true;
      } catch (err) {
        /* older browsers / insecure origins: hidden-textarea fallback */
        try {
          const ta = pdEl('textarea', { readonly: true, 'aria-hidden': 'true', style: 'position:fixed;top:-200px;left:0;opacity:0' });
          ta.value = email;
          document.body.appendChild(ta);
          ta.select();
          ok = document.execCommand('copy');
          ta.remove();
        } catch (e2) { ok = false; }
      }
      if (ok) {
        btn.classList.add('copied');
        if (ico) ico.className = 'fa-solid fa-check';
        btn.setAttribute('aria-label', 'Email address copied');
        showToast('Email copied to clipboard', 'success', 2200);
        setTimeout(() => {
          btn.classList.remove('copied');
          if (ico) ico.className = 'fa-regular fa-copy';
          btn.setAttribute('aria-label', 'Copy email address');
        }, 2000);
      } else {
        showToast('Copy failed: ' + email, 'warn', 4500);
      }
    });
  });
})();

/* ══════════════════════════════════════════════════════════
   FEATURE 46 — EVIDENCE SCAN (nmap-style, replaces self-rated %)
   Rows come from PD.skills. A skill is "open" only when it lists
   evidence (a certificate id from PD.certs, or later a lab id);
   otherwise it is "filtered" (still learning). Each card gets a
   matching chip where the old % bar was. Runs before the features
   that bind to .skill-card so they see the final markup.
══════════════════════════════════════════════════════════ */
(function evidenceScan() {
  const skills = Array.isArray(PD.skills) ? PD.skills : [];
  const certs  = Array.isArray(PD.certs) ? PD.certs : [];
  const box = document.getElementById('skillScan');
  const rows = document.getElementById('skillScanRows');
  const done = document.getElementById('skillScanDone');
  if (!skills.length || !box || !rows) return;

  const certAt = id => certs.findIndex(c => c.id === id);
  const shortDate = iso => { const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };
  const goLab = id => {
    const t = document.getElementById('lab-' + id) || document.getElementById('lab');
    if (t) gsap.to(window, { scrollTo: { y: t, offsetY: 68 }, duration: motionOK() ? 1 : 0, ease: 'power3.inOut' });
  };
  /* one clickable label per piece of evidence */
  const evButtons = (s, cls) => (s.evidence || []).map(ev => {
    if (ev.cert) {
      const i = certAt(ev.cert);
      if (i < 0) return null;
      const c = certs[i];
      const b = pdEl('button', { type: 'button', class: cls, title: 'Open the certificate: ' + c.title }, (c.short || c.title) + (cls === 'scan-evbtn' && c.dateISO ? ' · ' + shortDate(c.dateISO) : ''));
      b.addEventListener('click', () => openModal(i));
      return b;
    }
    if (ev.lab) {
      const b = pdEl('button', { type: 'button', class: cls, title: 'Go to the lab write-up' }, ev.label || 'Lab ' + ev.lab);
      b.addEventListener('click', () => goLab(ev.lab));
      return b;
    }
    return null;
  }).filter(Boolean);

  let open = 0, filtered = 0;
  skills.forEach(s => {
    const ev = evButtons(s, 'scan-evbtn');
    const isOpen = s.state === 'open' && ev.length > 0;
    isOpen ? open++ : filtered++;
    rows.append(pdEl('tr', { 'data-skill': s.id },
      pdEl('td', { class: 'scan-port', 'data-label': 'Port' }, s.port || ''),
      pdEl('td', { class: 'scan-state ' + (isOpen ? 'is-open' : 'is-filtered'), 'data-label': 'State' }, isOpen ? 'open' : 'filtered'),
      pdEl('td', { class: 'scan-svc', 'data-label': 'Service' }, s.service || s.name),
      pdEl('td', { class: 'scan-evcell', 'data-label': 'Evidence' },
        isOpen ? pdEl('div', { class: 'scan-ev' }, ev) : pdEl('span', { class: 'scan-evnote' }, s.note || 'learning'))));

    /* the matching card: chip where the % bar used to be */
    const card = document.querySelector('.skill-card[data-skill="' + s.id + '"]');
    if (card) {
      const chip = pdEl('button', { type: 'button', class: 'skill-proof' + (isOpen ? '' : ' is-filtered') },
        isOpen ? 'open · ' + (ev.length === 1 ? ev[0].textContent : ev.length + ' certificates') : 'filtered · learning');
      chip.addEventListener('click', () => {
        const row = rows.querySelector('tr[data-skill="' + s.id + '"]');
        if (isOpen && ev.length === 1) ev[0].click();
        else if (row) gsap.to(window, { scrollTo: { y: box, offsetY: 90 }, duration: motionOK() ? .8 : 0, ease: 'power3.inOut' });
      });
      card.append(chip);
    }
  });
  done.append('Nmap done: ', pdEl('b', null, skills.length + ' skills'), ' scanned · ',
              pdEl('b', null, open + ' open'), ' (certificate-backed) · ',
              pdEl('b', null, filtered + ' filtered'), ' (still learning)');
  box.hidden = false;

  /* owner slots: tools used / learning next (hidden while empty) */
  [['tools', 'toolsRow', 'toolsList'], ['learningNext', 'learnRow', 'learnList']].forEach(([key, rowId, listId]) => {
    const list = Array.isArray(PD[key]) ? PD[key].filter(x => typeof x === 'string' && x.trim()) : [];
    const row = document.getElementById(rowId), holder = document.getElementById(listId);
    if (!list.length || !row || !holder) return;
    list.forEach(t => holder.append(pdEl('span', { class: 'soft-tag' }, t.trim())));
    row.hidden = false;
  });
})();

/* ══════════════════════════════════════════════════════════
   FEATURE 47 — LAB NOTEBOOK (helpdesk-ticket write-ups)
   Renders PD.labs; the block stays hidden while it is empty.
   Each lab: { id, ticket, title, status, origin ("Coursework" |
   "Self-directed"), date (YYYY-MM-DD), tags[], problem,
   environment, steps[], commands, result, whatBroke,
   evidence[{ label, href }] }. Skill rows can point at a lab with
   { "lab": "<id>", "label": "…" } in PD.skills[].evidence.
══════════════════════════════════════════════════════════ */
(function labNotebook() {
  const labs = Array.isArray(PD.labs) ? PD.labs.filter(l => l && l.title && l.problem) : [];
  const box = document.getElementById('labNotebook');
  const grid = document.getElementById('labNotebookGrid');
  if (!labs.length || !box || !grid) return;
  const txt = v => (typeof v === 'string' ? v.trim() : '');
  const month = iso => { const d = new Date(txt(iso) + 'T00:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };
  const part = (label, node) => node ? [pdEl('h5', null, label), node] : [];

  labs.forEach((l, i) => {
    const id = txt(l.id) || String(i + 1).padStart(3, '0');
    const steps = Array.isArray(l.steps) ? l.steps.map(txt).filter(Boolean) : [];
    const ev = (Array.isArray(l.evidence) ? l.evidence : [])
      .map(e => ({ label: txt(e && e.label), href: pdUrl(e && e.href) })).filter(e => e.label && e.href);
    const ext = h => /^https?:/i.test(h);
    const details = pdEl('details', null, pdEl('summary', null, 'Full write-up'),
      part('Environment', txt(l.environment) && pdEl('p', null, txt(l.environment))),
      part('What I did', steps.length && pdEl('ol', null, steps.map(s => pdEl('li', null, s)))),
      part('Commands', txt(l.commands) && pdEl('pre', null, pdEl('code', null, l.commands))),
      part('Result', txt(l.result) && pdEl('p', null, txt(l.result))),
      part('What broke and how I fixed it', txt(l.whatBroke) && pdEl('p', null, txt(l.whatBroke))),
      part('Evidence', ev.length && pdEl('div', { class: 'nb-ev' }, ev.map(e =>
        pdEl('a', ext(e.href) ? { href: e.href, target: '_blank', rel: 'noopener noreferrer' } : { href: e.href }, e.label)))));
    grid.append(pdEl('article', { class: 'nb-ticket', id: 'lab-' + id },
      pdEl('div', { class: 'nb-meta' },
        pdEl('span', { class: 'nb-no' }, '#' + (txt(l.ticket) || 'LAB-' + id)),
        txt(l.status) && pdEl('span', { class: 'nb-chip' + (/resolved|solved|done/i.test(l.status) ? ' is-ok' : '') }, txt(l.status)),
        txt(l.origin) && pdEl('span', { class: 'nb-chip' }, txt(l.origin)),
        month(l.date) && pdEl('time', { datetime: txt(l.date) }, month(l.date))),
      pdEl('h4', null, txt(l.title)),
      pdEl('p', null, pdEl('b', null, 'Problem: '), txt(l.problem)),
      Array.isArray(l.tags) && l.tags.length ? pdEl('div', { class: 'nb-tags' }, l.tags.map(t => pdEl('span', null, String(t)))) : null,
      details));
  });
  box.hidden = false;
})();

/* ══════════════════════════════════════════════════════════
   FEATURE 51 — NOW.LOG (dated proof of current learning)
   Renders PD.now = { updated: "YYYY-MM-DD", focus, next: { label,
   target }, entries: [{ date, text, href }] }. Hidden while empty.
   Past 45 days without an update it says so ("stale"): honest
   for visitors, and a nudge to keep it current.
══════════════════════════════════════════════════════════ */
(function nowLog() {
  const n = PD.now && typeof PD.now === 'object' ? PD.now : null;
  const box = document.getElementById('nowLog');
  if (!n || !box) return;
  const txt = v => (typeof v === 'string' ? v.trim() : '');
  const entries = (Array.isArray(n.entries) ? n.entries : [])
    .map(e => ({ date: txt(e && e.date), text: txt(e && e.text), href: pdUrl(e && e.href) })).filter(e => e.text)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const focus = txt(n.focus);
  const next = n.next && txt(n.next.label) ? { label: txt(n.next.label), target: txt(n.next.target) } : null;
  if (!focus && !next && !entries.length) return;

  const age = document.getElementById('nowAge');
  const upd = new Date(txt(n.updated) + 'T00:00:00');
  if (!isNaN(upd)) {
    const days = Math.max(0, Math.floor((Date.now() - upd.getTime()) / 864e5));
    age.append('· updated ', pdEl('time', { datetime: txt(n.updated) }, days === 0 ? 'today' : days + (days === 1 ? ' day' : ' days') + ' ago'));
    if (days > 45) { age.append(' ', pdEl('span', { class: 'now-stale' }, 'stale')); box.classList.add('is-stale'); }
  }
  const kv = document.getElementById('nowKv');
  if (focus) kv.append(pdEl('dt', null, 'focus'), pdEl('dd', null, focus));
  if (next) kv.append(pdEl('dt', null, 'next'), pdEl('dd', null, next.label, next.target ? pdEl('span', { class: 'now-dim' }, ' (target ' + next.target + ')') : null));
  const row = e => pdEl('li', null,
    e.date ? pdEl('time', { datetime: e.date, class: 'now-dim' }, e.date) : null, ' ',
    e.href ? pdEl('a', /^https?:/i.test(e.href) ? { href: e.href, target: '_blank', rel: 'noopener noreferrer' } : { href: e.href }, e.text) : e.text);
  entries.slice(0, 8).forEach(e => document.getElementById('nowList').append(row(e)));
  if (entries.length > 8) {
    entries.slice(8).forEach(e => document.getElementById('nowOlder').append(row(e)));
    document.getElementById('nowOlderWrap').hidden = false;
  }
  box.hidden = false;
})();

/* ══════════════════════════════════════════════════════════
   FEATURE 52 — ROLE LENS (?role=helpdesk | noc | soc)
   Highlights the skills, scan rows and certificates that matter for
   one kind of internship, dims the rest and moves matches first.
   No new animation: classes, CSS order and a filter. The optional
   "week one I can… / still learning…" lines come from PD.roles and
   render only when filled.
══════════════════════════════════════════════════════════ */
(function roleLens() {
  const roles = (Array.isArray(PD.roles) ? PD.roles : []).filter(r => r && r.id && r.label);
  const box = document.getElementById('roleLens');
  const btns = document.getElementById('roleLensBtns');
  if (!roles.length || !box || !btns) return;
  const status = document.getElementById('roleLensStatus');
  const note = document.getElementById('roleLensNote');
  const scanBody = document.getElementById('skillScanRows');
  const scanOrder = scanBody ? [...scanBody.children] : [];
  const txt = v => (typeof v === 'string' ? v.trim() : '');
  const choices = [{ id: 'all', label: 'All' }].concat(roles);

  function apply(id, push) {
    const role = roles.find(r => r.id === id) || null;
    btns.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.role === (role ? role.id : 'all'))));
    const mark = (el, on) => {
      el.classList.toggle('lens-match', !!role && on);
      el.classList.toggle('lens-dim', !!role && !on);
      el.style.order = role && on ? '-1' : '';
    };
    document.querySelectorAll('.skill-card[data-skill]').forEach(el => mark(el, role && role.skills.includes(el.dataset.skill)));
    document.querySelectorAll('.cert-card[data-id]').forEach(el => mark(el, role && role.certs.includes(el.dataset.id)));
    const lab = document.getElementById('lab');
    if (lab) lab.classList.toggle('lens-match-section', !!(role && role.lab));
    if (scanBody) {
      const rows = role ? scanOrder.slice().sort((a, b) => role.skills.includes(b.dataset.skill) - role.skills.includes(a.dataset.skill)) : scanOrder;
      rows.forEach(tr => { scanBody.append(tr); tr.classList.toggle('lens-dim', !!role && !role.skills.includes(tr.dataset.skill)); });
    }
    const weekOne = role && txt(role.weekOne), toLearn = role && txt(role.toLearn);
    note.replaceChildren(...[
      weekOne ? pdEl('p', null, pdEl('b', null, 'Week one, I can: '), weekOne) : null,
      toLearn ? pdEl('p', null, pdEl('b', null, 'Still learning: '), toLearn) : null
    ].filter(Boolean));
    note.hidden = !(weekOne || toLearn);
    status.textContent = role ? `Highlighting what is relevant for ${role.label} roles.` : 'Showing everything.';
    if (push) {
      const u = new URL(location.href);
      if (role) u.searchParams.set('role', role.id); else u.searchParams.delete('role');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    }
  }

  btns.append(...choices.map(c => {
    const b = pdEl('button', { type: 'button', class: 'role-btn', 'data-role': c.id, 'aria-pressed': 'false' }, c.label);
    b.addEventListener('click', () => apply(c.id, true));
    return b;
  }));
  box.hidden = false;
  const fromUrl = new URLSearchParams(location.search).get('role');
  apply(roles.some(r => r.id === fromUrl) ? fromUrl : 'all', false);
})();

/* ══════════════════════════════════════════════════
   FEATURE 1 — CUSTOM CURSOR (GSAP follower)
══════════════════════════════════════════════════ */
const cur  = document.getElementById('cur');
const curR = document.getElementById('curR');
const isTouchDevice = window.matchMedia('(hover:none)').matches;

if (!isTouchDevice) {
  let mx = 0, my = 0;
  window.addEventListener('mousemove', e => {
    if (!motionOK()) return;               // motion off: the CSS shows the system cursor instead
    mx = e.clientX; my = e.clientY;
    gsap.to(cur,  { x: mx, y: my, duration: 0.08, ease: 'power3.out' });
    gsap.to(curR, { x: mx, y: my, duration: 0.22, ease: 'power3.out' });
  });
  // Grow on links/buttons
  document.querySelectorAll('a,button,.cert-card,.about-item,.soft-tag').forEach(el => {
    el.addEventListener('mouseenter', () => gsap.to(curR, { scale: 2.2, opacity: .5, duration: .2 }));
    el.addEventListener('mouseleave', () => gsap.to(curR, { scale: 1, opacity: 1, duration: .2 }));
  });
}

/* ══════════════════════════════════════════════════
   FEATURE 2 — SCROLL PROGRESS BAR (GSAP)
══════════════════════════════════════════════════ */
ScrollTrigger.create({
  start: 'top top',
  end: 'bottom bottom',
  onUpdate: self => {
    gsap.to('#progressBar', { width: (self.progress * 100) + '%', duration: 0.1, ease: 'none' });
  }
});

/* ══════════════════════════════════════════════════
   FEATURE 3 — HERO NAME CHAR-BY-CHAR REVEAL (GSAP)
══════════════════════════════════════════════════ */
(function heroReveal() {
  const words = document.querySelectorAll('#heroName .word');
  gsap.set(words, { y: 80, opacity: 0, rotateX: -60 });
  gsap.to(words, {
    y: 0, opacity: 1, rotateX: 0,
    duration: 1, ease: 'power4.out',
    stagger: 0.12, delay: 0.3
  });
  gsap.from('.hero-avail',  { y: 20, opacity: 0, duration: .7, delay: .2, ease:'power3.out' });
  gsap.from(['.ojt-snapshot', '.hero-bio'], { y: 24, opacity: 0, duration: .8, delay: .9, ease:'power3.out' });
  gsap.from('.hero-btns',   { y: 24, opacity: 0, duration: .8, delay: 1.0, ease:'power3.out' });
  gsap.from('.hero-stats',  { y: 24, opacity: 0, duration: .8, delay: 1.1, ease:'power3.out' });
  gsap.from('#heroPhoto',   { x: 60, opacity: 0, duration: 1.1, delay: .5, ease:'power4.out' });
})();

/* ══════════════════════════════════════════════════
   FEATURE 4 — TYPEWRITER ROLE (GSAP TextPlugin)
══════════════════════════════════════════════════ */
(function typewriter() {
  const el = document.getElementById('heroRole');
  if (!el) return;
  /* honest lines only: each one is backed by something on this page */
  const roles = [
    'Aspiring IT Support / Network Intern',
    'Networking & Security Enthusiast',
    'Cisco NetAcad Learner',
    'Python Essentials 1 & 2 Completer',
    'Continuous Learner'
  ];
  let i = 0, on = false;
  el.textContent = roles[0];               // also the static line when motion is off
  function typeIn() {
    if (!on) return;
    gsap.to(el, {
      duration: roles[i].length * 0.055,
      text: { value: roles[i], delimiter: '' },
      ease: 'none',
      onComplete: () => gsap.delayedCall(2, typeOut)
    });
  }
  function typeOut() {
    if (!on) return;
    gsap.to(el, {
      duration: roles[i].length * 0.025,
      text: { value: '', delimiter: '' },
      ease: 'none',
      onComplete: () => { i = (i + 1) % roles.length; typeIn(); }
    });
  }
  function start() { if (on) return; on = true; gsap.delayedCall(3.4, typeOut); }
  function stop() {
    on = false;
    gsap.killTweensOf(el); gsap.killTweensOf(typeIn); gsap.killTweensOf(typeOut);
    i = 0; el.textContent = roles[0];
  }
  document.addEventListener('motionchange', e => (e.detail && e.detail.on) ? start() : stop());
  if (pdMotion()) start();
})();

/* ══════════════════════════════════════════════════
   FEATURE 5 — PARTICLE NETWORK CANVAS (GSAP ticker)
══════════════════════════════════════════════════ */
(function particles() {
  const canvas = document.getElementById('heroCanvas');
  const ctx = canvas.getContext('2d');
  let W, H, pts = [];
  const COUNT = window.innerWidth < 600 ? 28 : 55;
  const MAX_D = 130;
  /* ticks only while motion is on, the hero is on screen and the tab is visible;
     otherwise one still frame stays painted */
  let running = false, heroVisible = true;
  /* colour follows the theme (--particleRGB), re-read whenever data-theme changes */
  let rgb = '';
  const readRGB = () => {
    rgb = getComputedStyle(document.documentElement).getPropertyValue('--particleRGB').trim() || '224,72,79';
    if (!running) frame(false);
  };

  function resize() {
    const sec = document.getElementById('home');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);   // crisp on retina, capped for cost
    W = sec.offsetWidth; H = sec.offsetHeight;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!running) frame(false);
  }

  class P {
    constructor() { this.reset(); }
    reset() {
      this.x  = Math.random() * W;
      this.y  = Math.random() * H;
      this.vx = (Math.random() - .5) * .45;
      this.vy = (Math.random() - .5) * .45;
      this.r  = Math.random() * 2.2 + .8;
      this.a  = Math.random() * .26 + .06;
    }
    tick() {
      this.x += this.vx; this.y += this.vy;
      if (this.x < 0 || this.x > W) this.vx *= -1;
      if (this.y < 0 || this.y > H) this.vy *= -1;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(${rgb},${this.a})`;
      ctx.fill();
    }
  }

  function frame(move) {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < pts.length; i++) {
      if (move) pts[i].tick();
      pts[i].draw();
      for (let j = i+1; j < pts.length; j++) {
        const dx = pts[i].x-pts[j].x, dy = pts[i].y-pts[j].y;
        const d  = Math.sqrt(dx*dx+dy*dy);
        if (d < MAX_D) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(${rgb},${(1-d/MAX_D)*.11})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }
  const step = () => frame(true);
  function update() {
    const should = motionOK() && heroVisible && !document.hidden;
    if (should === running) return;
    running = should;
    if (running) gsap.ticker.add(step);
    else { gsap.ticker.remove(step); frame(false); }
  }

  resize();
  for (let i = 0; i < COUNT; i++) pts.push(new P());
  readRGB();
  new MutationObserver(readRGB).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('resize', resize);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { heroVisible = entries[0].isIntersecting; update(); })
      .observe(document.getElementById('home'));
  }
  document.addEventListener('visibilitychange', update);
  document.addEventListener('motionchange', update);
  window.__particlesRunning = () => running;   // read by the motion self-check
  update();
})();

/* ══════════════════════════════════════════════════
   FEATURE 6 — GSAP SCROLL REVEAL (sections)
══════════════════════════════════════════════════ */
gsap.utils.toArray('.gsap-reveal').forEach((el, i) => {
  gsap.from(el, {
    scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' },
    y: 50, opacity: 0, duration: .9, ease: 'power3.out', delay: i * 0.08
  });
});

/* ══════════════════════════════════════════════════
   FEATURE 7 — GSAP TIMELINE EDUCATION (draw in)
══════════════════════════════════════════════════ */
gsap.utils.toArray('.gsap-tl').forEach((el, i) => {
  gsap.from(el, {
    scrollTrigger: { trigger: el, start: 'top 88%' },
    x: i % 2 === 0 ? 60 : -60,
    opacity: 0, duration: .9, ease: 'power3.out', delay: i * 0.15
  });
});
ScrollTrigger.create({
  trigger: '.timeline', start: 'top 70%', end: 'bottom 60%',
  onUpdate: self => { document.getElementById('tlFill').style.height = (self.progress * 100) + '%'; }
});

/* ══════════════════════════════════════════════════
   FEATURE 8 — GSAP SKILL CARDS stagger + bar anim
══════════════════════════════════════════════════ */
gsap.utils.toArray('.gsap-skill').forEach((el, i) => {
  ScrollTrigger.create({
    trigger: el, start: 'top 88%',
    onEnter: () => {
      gsap.from(el, { y: 40, opacity: 0, duration: .75, ease: 'power3.out', delay: i * 0.1 });
      /* (the self-rated % bar and counter were removed; Feature 46 shows evidence instead) */
    },
    once: true
  });
});

/* ══════════════════════════════════════════════════
   FEATURE 9 — CERT CARDS stagger + 3D tilt
══════════════════════════════════════════════════ */
gsap.utils.toArray('.gsap-cert').forEach((el, i) => {
  gsap.from(el, {
    scrollTrigger: { trigger: el, start: 'top 90%' },
    y: 50, opacity: 0, scale: .95,
    duration: .75, ease: 'power3.out', delay: i * 0.1
  });
  if (!isTouchDevice) {
    el.addEventListener('mousemove', e => {
      if (!motionOK()) return;
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width  - .5) * 12;
      const y = ((e.clientY - r.top)  / r.height - .5) * 12;
      gsap.to(el, { rotateX: -y, rotateY: x, duration: .15, ease:'none', transformPerspective:600 });
    });
    el.addEventListener('mouseleave', () => {
      gsap.to(el, { rotateX:0, rotateY:0, duration:.5, ease:'power2.out' });
    });
  }
});

/* ══════════════════════════════════════════════════
   FEATURE 10 — STAT COUNTER (GSAP odometer)
══════════════════════════════════════════════════ */
document.querySelectorAll('.hs-num').forEach(el => {
  const target  = parseInt(el.dataset.target);
  const suffix  = el.dataset.suffix || '';
  ScrollTrigger.create({
    trigger: el, start: 'top 90%', once: true,
    onEnter: () => {
      if (!pdMotion() || isNaN(target)) return;   // the real number is already in the HTML
      gsap.to({ n: 0 }, {
        n: target, duration: 2, ease: 'power2.out',
        onUpdate() { el.textContent = Math.round(this._targets[0].n) + suffix; }
      });
    }
  });
});

/* ══════════════════════════════════════════════════
   FEATURE 11 — MAGNETIC BUTTONS (GSAP)
══════════════════════════════════════════════════ */
if (!isTouchDevice) {
  document.querySelectorAll('.mag-btn').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      if (!motionOK()) return;
      const r  = btn.getBoundingClientRect();
      const dx = (e.clientX - r.left - r.width/2)  * .35;
      const dy = (e.clientY - r.top  - r.height/2) * .35;
      gsap.to(btn, { x: dx, y: dy, duration: .35, ease: 'power3.out' });
    });
    btn.addEventListener('mouseleave', () => {
      gsap.to(btn, { x: 0, y: 0, duration: .6, ease: 'elastic.out(1,.4)' });
    });
  });
}

/* ══════════════════════════════════════════════════
   FEATURE 12 — NAVBAR ACTIVE PILL (GSAP)
══════════════════════════════════════════════════ */
const navLinks  = document.querySelectorAll('.nl');
const navPill   = document.getElementById('navPill');
const navEl     = document.getElementById('navbar');

function movePill(link) {
  const r  = link.getBoundingClientRect();
  const nr = document.getElementById('navLinks').getBoundingClientRect();
  gsap.to(navPill, { x: r.left - nr.left, width: r.width, duration: .4, ease: 'power3.inOut' });
}
navLinks.forEach(a => {
  a.addEventListener('mouseenter', () => movePill(a));
  a.addEventListener('focus',      () => movePill(a));
});
document.getElementById('navLinks').addEventListener('mouseleave', () => {
  const active = document.querySelector('.nl.active');
  if (active) movePill(active);
});

window.addEventListener('scroll', () => {
  navEl.classList.toggle('scrolled', window.scrollY > 20);
  let cur = 'home';
  document.querySelectorAll('section[id]').forEach(s => {
    if (window.scrollY >= s.offsetTop - 120) cur = s.id;
  });
  navLinks.forEach(a => {
    const active = a.getAttribute('href') === '#'+cur;
    a.classList.toggle('active', active);
    if (active) movePill(a);
  });
});
// Init pill position
setTimeout(() => { const a = document.querySelector('.nl.active'); if(a) movePill(a); }, 200);

/* ══════════════════════════════════════════════════
   FEATURE 13 — DARK / LIGHT MODE TOGGLE (GSAP)
   Red & black (dark) is the default; the head script has
   already applied any saved choice before first paint.
══════════════════════════════════════════════════ */
const toggle = document.getElementById('themeToggle');
let dark = document.documentElement.getAttribute('data-theme') !== 'light';
function paintThemeToggle() {
  toggle.innerHTML = dark ? '<i class="fa-solid fa-sun" aria-hidden="true"></i>' : '<i class="fa-solid fa-moon" aria-hidden="true"></i>';
  toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  toggle.title = dark ? 'Light theme' : 'Dark theme';
}
paintThemeToggle();
toggle.addEventListener('click', () => {
  dark = !dark;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0c0a0b' : '#f7f3f3');
  try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) {}
  paintThemeToggle();
  gsap.fromTo(toggle, { rotate: -30, scale: .8 }, { rotate: 0, scale: 1, duration: .4, ease: 'back.out(2)' });
});

/* ══════════════════════════════════════════════════
   FEATURE 14 — LIVE CLOCK (navbar widget)
══════════════════════════════════════════════════ */
(function liveClock() {
  const el = document.getElementById('navClock');
  function tick() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    const s = String(now.getSeconds()).padStart(2,'0');
    el.textContent = `${h}:${m}:${s}`;
  }
  tick(); setInterval(tick, 1000);
})();

/* ══════════════════════════════════════════════════
   FEATURE 15 — BACK TO TOP (GSAP launch)
══════════════════════════════════════════════════ */
const btt = document.getElementById('backTop');
window.addEventListener('scroll', () => btt.classList.toggle('show', window.scrollY > 400));
btt.addEventListener('click', () => {
  gsap.to(btt, { y: -120, opacity: 0, duration: .45, ease: 'power3.in', onComplete: () => {
    gsap.to(window, { scrollTo: 0, duration: 1, ease: 'power4.inOut' });
    gsap.set(btt, { y: 0, opacity: 1 });
  }});
});

/* ══════════════════════════════════════════════════
   FEATURE 16 — CERTIFICATE FILTER
══════════════════════════════════════════════════ */
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    const f = btn.dataset.filter;
    document.querySelectorAll('.cert-card').forEach(card => {
      const show = f === 'all' || card.dataset.cat === f;
      if (show) {
        card.classList.remove('hidden');
        gsap.fromTo(card, { scale:.9, opacity:0 }, { scale:1, opacity:1, duration:.4, ease:'power2.out' });
      } else {
        gsap.to(card, { scale:.9, opacity:0, duration:.3, ease:'power2.in',
          onComplete: () => card.classList.add('hidden') });
      }
    });
  });
});

/* ══════════════════════════════════════════════════
   FEATURE 17 — CERT MODAL (GSAP flip)
══════════════════════════════════════════════════ */
/* data comes from PD.certs (Feature 41); openModal(i) stays global (i = 0..PD.certs.length-1) */
let modalReturnFocus = null;
function openModal(i) {
  const d = PD.certs[i];
  if (!d) return;
  const ov  = document.getElementById('modalOverlay');
  const img = document.getElementById('mImg');
  const src = pdUrl(d.imgFull || d.img);     /* imgFull: the large WebP the build makes for the pop-up */
  img.src = src;
  img.alt = `${d.type || 'Certificate'}: ${d.title}${d.issuer ? ' (' + d.issuer + ')' : ''}`;
  document.getElementById('mType').textContent = d.type || '';
  document.getElementById('mTitle').textContent = d.title || '';
  const mmi = (icon, ...content) => pdEl('div', { class: 'mmi' }, pdEl('i', { class: icon, 'aria-hidden': 'true' }), pdEl('span', null, ...content));
  document.getElementById('mMeta').replaceChildren(...[
    d.date   ? mmi('fa-regular fa-calendar', pdEl('time', { datetime: d.dateISO || null, text: d.date })) : null,
    d.issuer ? mmi('fa-solid fa-building', d.issuer) : null,
    d.venue  ? mmi('fa-solid fa-location-dot', d.venue) : null,
    d.modules ? mmi('fa-solid fa-layer-group', d.modules + ' learning modules') : mmi('fa-solid fa-tag', d.type || '')
  ].filter(Boolean));
  const verify = pdUrl(d.verifyUrl);
  document.getElementById('mLinks').replaceChildren(...[
    verify ? pdEl('a', { class: 'modal-link verify', href: verify, target: '_blank', rel: 'noopener noreferrer' },
               pdEl('i', { class: 'fa-solid fa-circle-check', 'aria-hidden': 'true' }), ' Verify credential') : null,
    src ? pdEl('a', { class: 'modal-link', href: src, target: '_blank', rel: 'noopener noreferrer' },
            pdEl('i', { class: 'fa-solid fa-up-right-and-down-left-from-center', 'aria-hidden': 'true' }), ' Open full size') : null
  ].filter(Boolean));
  document.getElementById('mDesc').textContent = d.desc || '';
  document.getElementById('mLearned').textContent = d.learned || '';
  if (!ov.classList.contains('open')) {
    modalReturnFocus = document.activeElement;
    ov.classList.add('open');
    document.body.style.overflow = 'hidden';
    gsap.fromTo('#modalBox', { scale:.88, y:40, opacity:0 }, { scale:1, y:0, opacity:1, duration:.5, ease:'back.out(1.6)' });
    const closeBtn = document.getElementById('modalClose');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }
}
function closeModal() {
  const ov = document.getElementById('modalOverlay');
  if (!ov.classList.contains('open')) return;
  gsap.to('#modalBox', { scale:.92, y:20, opacity:0, duration:.3, ease:'power2.in', onComplete:() => {
    ov.classList.remove('open');
    document.body.style.overflow = '';
    if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') modalReturnFocus.focus({ preventScroll: true });
    modalReturnFocus = null;
  }});
}
function closeModalOut(e) { if (e.target === document.getElementById('modalOverlay')) closeModal(); }
document.getElementById('modalOverlay').addEventListener('click', closeModalOut);
document.getElementById('modalClose').addEventListener('click', closeModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* keep keyboard focus inside the open certificate dialog (Feature 56) */
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const ov = document.getElementById('modalOverlay');
  if (!ov || !ov.classList.contains('open')) return;
  const box = document.getElementById('modalBox');
  const items = [...box.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1], inside = box.contains(document.activeElement);
  if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
});

/* ══════════════════════════════════════════════════
   FEATURE 18 — HAMBURGER MENU (GSAP slide)
══════════════════════════════════════════════════ */
const ham = document.getElementById('hamburger');
const mob = document.getElementById('mobileMenu');
let menuOpen = false;
ham.addEventListener('click', () => {
  menuOpen = !menuOpen;
  ham.classList.toggle('open', menuOpen);
  ham.setAttribute('aria-expanded', String(menuOpen));
  if (menuOpen) {
    mob.classList.add('open');
    gsap.fromTo(mob, { y: -12, opacity: 0 }, { y: 0, opacity: 1, duration: .3, ease: 'power2.out' });
    gsap.from(mob.querySelectorAll('a'), { y: -10, opacity: 0, stagger: .06, duration: .3, ease: 'power2.out' });
  } else {
    gsap.to(mob, { y: -8, opacity: 0, duration: .25, ease:'power2.in', onComplete:() => mob.classList.remove('open') });
  }
});
mob.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  menuOpen = false; ham.classList.remove('open'); ham.setAttribute('aria-expanded', 'false');
  gsap.to(mob, { y:-8, opacity:0, duration:.2, onComplete:()=>mob.classList.remove('open') });
}));

/* ══════════════════════════════════════════════════
   FEATURE 19 — PHOTO PARALLAX (GSAP mousemove)
══════════════════════════════════════════════════ */
if (!isTouchDevice) {
  document.getElementById('home').addEventListener('mousemove', e => {
    if (!motionOK()) return;
    const { innerWidth: W, innerHeight: H } = window;
    const dx = (e.clientX / W - .5) * 18;
    const dy = (e.clientY / H - .5) * 12;
    gsap.to('#photoFrame', { rotateY: dx, rotateX: -dy, duration: .6, ease:'power2.out', transformPerspective:900 });
    gsap.to('.orb1', { x: dx*.8, y: dy*.8, duration:1, ease:'power1.out' });
    gsap.to('.orb2', { x: -dx*.6, y: -dy*.6, duration:1.2, ease:'power1.out' });
  });
  document.getElementById('home').addEventListener('mouseleave', () => {
    gsap.to('#photoFrame', { rotateY:0, rotateX:0, duration:1, ease:'elastic.out(1,.4)' });
  });
}

/* ══════════════════════════════════════════════════
   FEATURE 20 — KONAMI CODE CONFETTI (Easter Egg)
══════════════════════════════════════════════════ */
(function konamiConfetti() {
  const KONAMI = [38,38,40,40,37,39,37,39,66,65];
  let seq = [];
  document.addEventListener('keydown', e => {
    seq.push(e.keyCode);
    if (seq.length > 10) seq.shift();
    if (seq.join(',') === KONAMI.join(',')) {
      if (motionOK()) launchConfetti();
      else showToast('Konami code unlocked!', 'success');
    }
  });

  function launchConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const pieces = [];
    const colors = ['#b82a33','#e0484f','#ec6a70','#7a1a22','#f0c4c6','#ffffff','#2c161a'];
    for (let i = 0; i < 180; i++) {
      pieces.push({
        x: Math.random() * canvas.width, y: -20,
        w: Math.random()*10+5, h: Math.random()*6+4,
        color: colors[Math.floor(Math.random()*colors.length)],
        vx: (Math.random()-0.5)*6, vy: Math.random()*4+3,
        rot: Math.random()*360, vr: (Math.random()-0.5)*8,
        alpha: 1
      });
    }
    gsap.ticker.add(function draw() {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      let alive = false;
      pieces.forEach(p => {
        if (p.alpha <= 0) return;
        alive = true;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        if (p.y > canvas.height * .7) p.alpha -= .018;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * Math.PI/180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      });
      if (!alive) gsap.ticker.remove(draw);
    });
  }
})();

/* ── SOFT TAG STAGGER on scroll ─────────── */
ScrollTrigger.create({
  trigger: '.soft-grid', start: 'top 88%', once: true,
  onEnter: () => gsap.from('.soft-tag', { y:20, opacity:0, scale:.85, stagger:.06, duration:.5, ease:'back.out(2)' })
});

/* ── ABOUT ITEMS stagger ─────────────────── */
ScrollTrigger.create({
  trigger: '.about-highlights', start: 'top 85%', once: true,
  onEnter: () => gsap.from('.about-item', { x:-30, opacity:0, stagger:.1, duration:.6, ease:'power3.out' })
});

/* ── FLOAT BADGES continuous float ──────── */
gsap.utils.toArray('.float-badge').forEach((b, i) => {
  gsap.to(b, { y: -7, duration: 1.8 + i*.4, ease:'sine.inOut', yoyo:true, repeat:-1, delay:i*.35 });
});

/* ── DIVIDER draw-in ─────────────────────── */
gsap.utils.toArray('.divider').forEach(d => {
  ScrollTrigger.create({
    trigger: d, start:'top 90%', once:true,
    onEnter: () => gsap.to(d, { width:52, duration:.9, ease:'power3.out' })
  });
});

/* ── CONTACT items stagger ───────────────── */
ScrollTrigger.create({
  trigger: '.contact-right', start:'top 85%', once:true,
  onEnter: () => gsap.from('.contact-item', { x:30, opacity:0, stagger:.12, duration:.6, ease:'power3.out' })
});

/* ── FOOTER reveal ───────────────────────── */
ScrollTrigger.create({
  trigger:'footer', start:'top 92%', once:true,
  onEnter: () => gsap.from('footer > .container > *', { y:20, opacity:0, stagger:.1, duration:.6, ease:'power2.out' })
});

/* ── ABOUT card grid items ───────────────── */
ScrollTrigger.create({
  trigger:'.about-card', start:'top 88%', once:true,
  onEnter: () => gsap.from('.aci', { y:10, opacity:0, stagger:.08, duration:.5, ease:'power2.out' })
});

/* ── REFRESH ScrollTrigger on resize ────── */
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => ScrollTrigger.refresh(), 200);
});

/* ══════════════════════════════════════════════════════════
   FEATURE 21 — GSAP PRELOADER (cinematic entry)
   FEATURE 55 — LIVE HANDSHAKE: the rows are this visit's real
   Navigation Timing (DNS, TCP, TLS, first byte, download), not a
   scripted 0–100%. Plays once per session; Skip / Esc ends it; the
   same numbers are available later as `handshake` in the terminal.
══════════════════════════════════════════════════════════ */
const handshake = (function readHandshake() {
  const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  if (!nav) return null;
  const ms = v => Math.max(0, Math.round(v));
  const dns = ms(nav.domainLookupEnd - nav.domainLookupStart);
  const tls = nav.secureConnectionStart > 0 ? ms(nav.connectEnd - nav.secureConnectionStart) : 0;
  const tcp = ms(nav.connectEnd - nav.connectStart) - tls;
  const ttfb = ms(nav.responseStart - nav.requestStart);
  const download = ms(nav.responseEnd - nav.responseStart);
  const size = nav.transferSize ? Math.max(1, Math.round(nav.transferSize / 1024)) + ' KB' : 'from cache';
  const reused = dns === 0 && tcp + tls === 0;
  const server = /github\.io$/.test(location.hostname) ? 'GitHub Pages' : location.host;
  const rows = reused
    ? [['connection reused · no DNS, TCP or TLS needed', 0]]
    : [['DNS lookup', dns], ['TCP handshake · SYN → SYN-ACK → ACK', tcp]].concat(tls ? [['TLS handshake', tls]] : []);
  rows.push([`GET ${location.pathname} → ${nav.responseStatus || 200} · first byte`, ttfb], [`download · ${size}`, download]);
  return { rows, total: ms(nav.responseEnd - nav.startTime), protocol: nav.nextHopProtocol || '', server };
})();

(function initPreloader() {
  gsap.registerPlugin(CustomEase);
  CustomEase.create('smoothEntry', 'M0,0 C0.22,1 0.36,1 1,1');

  const pl    = document.getElementById('preloader');
  const bar   = document.getElementById('plBar');
  const chars = document.getElementById('plChars');
  const hs    = document.getElementById('plHs');
  const sum   = document.getElementById('plSum');
  const skip  = document.getElementById('plSkip');

  const reveal = () => {
    gsap.fromTo('#navbar', { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: .6, delay: .1, ease: 'power3.out' });
    gsap.to('.side-nav', { opacity: 1, duration: .6, delay: .4 });
  };
  /* motion off (button or OS "reduce motion"): no intro animation, the page is just there */
  if (!motionOK()) {
    pl.style.display = 'none';
    gsap.set('.side-nav', { opacity: 1 });
    return;
  }
  /* seen this session already: a quick fade instead of the full sequence */
  let seen = false;
  try { seen = sessionStorage.getItem('renso.intro') === '1'; sessionStorage.setItem('renso.intro', '1'); } catch (e) { /* storage blocked */ }
  if (seen) {
    gsap.to(pl, { opacity: 0, duration: .35, onComplete: () => { pl.style.display = 'none'; } });
    reveal();
    return;
  }

  /* logo characters */
  chars.replaceChildren(...'Renso'.split('').map(c => pdEl('span', { class: 'pl-char' }, c)), pdEl('span', { class: 'pl-char pl-dot' }, '.'));
  /* the visitor's real connection, one row per step */
  if (handshake) {
    hs.replaceChildren(...handshake.rows.map(([label, v]) => pdEl('li', null, pdEl('span', null, label), pdEl('b', null, v + ' ms'))));
    sum.textContent = `This page reached you in ${handshake.total} ms${handshake.protocol ? ' over ' + handshake.protocol : ''} from ${handshake.server}.`;
  }

  const tl = gsap.timeline({
    onComplete: () => {
      gsap.to(pl, { yPercent: -100, duration: .9, ease: 'power4.inOut', onComplete: () => { pl.style.display = 'none'; } });
      reveal();
      document.removeEventListener('keydown', onKey);
    }
  });
  tl.to('.pl-logo', { opacity: 1, duration: .2 })
    .to('.pl-char', { y: 0, opacity: 1, stagger: .07, duration: .6, ease: 'power4.out' }, '<')
    .to(bar, { width: '100%', duration: 1.2, ease: 'power2.inOut' }, '-=.2')
    .from('#plHs li', { opacity: 0, x: -10, stagger: .16, duration: .3, ease: 'power2.out' }, '<')
    .from(sum, { opacity: 0, y: 6, duration: .3 }, '-=.1')
    .to({}, { duration: .55 });
  const end = () => tl.progress(1);
  const onKey = e => { if (e.key === 'Escape') end(); };
  skip.addEventListener('click', end);
  document.addEventListener('keydown', onKey);
})();

/* `handshake` in the terminal: the same numbers, any time */
window.TERM_CMDS = window.TERM_CMDS || {};
window.TERM_CMDS.handshake = {
  help: 'how this page reached you (real Navigation Timing)',
  run(args, io) {
    if (!handshake) return io.err('handshake: Navigation Timing is not available in this browser');
    handshake.rows.forEach(([label, v]) => io.print(`${String(v).padStart(5)} ms  ${label}`));
    io.dim(`total ${handshake.total} ms${handshake.protocol ? ' · ' + handshake.protocol : ''} · server ${handshake.server}`);
  },
};

/* ══════════════════════════════════════════════════════════
   FEATURE 22 — SIDE NAVIGATION DOTS
══════════════════════════════════════════════════════════ */
(function sideNav() {
  const dots    = document.querySelectorAll('.side-dot');
  const sections = [...document.querySelectorAll('section[id]')];

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const target = document.querySelector(dot.dataset.target);
      if (target) gsap.to(window, { scrollTo: { y: target, offsetY: 68 }, duration: motionOK() ? 1.1 : 0, ease: 'power3.inOut' });
    });
  });

  function updateDots() {
    let cur = sections[0].id;
    sections.forEach(s => { if (window.scrollY >= s.offsetTop - 160) cur = s.id; });
    dots.forEach(d => {
      const on = d.dataset.target === '#' + cur;
      d.classList.toggle('active', on);
      if (on) d.setAttribute('aria-current', 'location'); else d.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', updateDots, { passive: true });
  updateDots();
})();

/* ══════════════════════════════════════════════════════════
   FEATURE 23 — TOAST NOTIFICATION SYSTEM
══════════════════════════════════════════════════════════ */
function showToast(msg, type = 'info', duration = 3000) {
  const tc   = document.getElementById('toastContainer');
  const t    = document.createElement('div');
  const icons = { info: 'fa-circle-info', success: 'fa-circle-check', warn: 'fa-triangle-exclamation' };
  t.className = `toast t-${type}`;
  t.setAttribute('role', type === 'warn' ? 'alert' : 'status');
  const ico = document.createElement('i');
  ico.className = `fa-solid ${icons[type] || icons.info}`;
  ico.setAttribute('aria-hidden', 'true');
  t.append(ico, String(msg));               // message is text, never HTML
  tc.appendChild(t);
  gsap.to(t, { opacity: 1, y: 0, scale: 1, duration: .4, ease: 'back.out(2)' });
  setTimeout(() => {
    gsap.to(t, { opacity: 0, y: 8, scale: .94, duration: .3, ease: 'power2.in', onComplete: () => t.remove() });
  }, duration);
}

/* (the fake "Resume download starting…" toast was removed: the résumé button is real now, see Feature 42) */

/* ══════════════════════════════════════════════════════════
   FEATURE 24 — CURSOR SPARKLE TRAIL
══════════════════════════════════════════════════════════ */
if (!isTouchDevice) {
  let sparkTimer = 0;
  window.addEventListener('mousemove', e => {
    if (!motionOK()) return;
    const now = Date.now();
    if (now - sparkTimer < 55) return;
    sparkTimer = now;
    const s = document.createElement('div');
    s.className = 'c-spark';
    s.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;width:${Math.random()*5+3}px;height:${Math.random()*5+3}px;background:${Math.random()>.5?'var(--accent)':'var(--accent2)'}`;
    document.body.appendChild(s);
    gsap.to(s, {
      x: (Math.random()-0.5)*40, y: (Math.random()-0.5)*40,
      opacity: 0, scale: 0,
      duration: .55 + Math.random()*.3,
      ease: 'power2.out',
      onComplete: () => s.remove()
    });
  });
}

/* ══════════════════════════════════════════════════════════
   FEATURE 25 — CARD MOUSE SPOTLIGHT EFFECT
══════════════════════════════════════════════════════════ */
if (!isTouchDevice) {
  document.querySelectorAll('.skill-card,.tl-item').forEach(card => {
    card.classList.add('spotlight-card');
    card.addEventListener('mousemove', e => {
      if (!motionOK()) return;
      const r  = card.getBoundingClientRect();
      const x  = ((e.clientX - r.left) / r.width  * 100).toFixed(1);
      const y  = ((e.clientY - r.top)  / r.height * 100).toFixed(1);
      card.style.setProperty('--mouse-x', x + '%');
      card.style.setProperty('--mouse-y', y + '%');
    });
  });
}

/* ══════════════════════════════════════════════════════════
   FEATURE 26 — SCROLL VELOCITY SKEW
══════════════════════════════════════════════════════════ */
(function velocitySkew() {
  /* driven by ScrollTrigger's scroll velocity, so it costs nothing while the page is still
     (the old version ran a requestAnimationFrame loop forever) */
  const els = gsap.utils.toArray('.hero-text,.s-title,.hero-name');
  els.forEach(el => el.classList.add('v-skew'));
  const proxy   = { skew: 0 };
  const setSkew = gsap.quickSetter(els, 'skewY', 'deg');
  const clamp   = gsap.utils.clamp(-6, 6);
  ScrollTrigger.create({
    onUpdate: self => {
      if (!motionOK()) return;
      const skew = clamp(self.getVelocity() / 300);
      if (Math.abs(skew) > Math.abs(proxy.skew)) {
        proxy.skew = skew;
        gsap.to(proxy, { skew: 0, duration: .8, ease: 'power3', overwrite: true, onUpdate: () => setSkew(proxy.skew) });
      }
    }
  });
  document.addEventListener('motionchange', e => {
    if (e.detail && e.detail.on) return;
    gsap.killTweensOf(proxy); proxy.skew = 0; setSkew(0);
  });
})();

/* ══════════════════════════════════════════════════════════
   FEATURE 27 — CERTIFICATE 3D FLIP CARDS (JS wrap)
══════════════════════════════════════════════════════════ */
/* The flip structure (.cert-card-inner > .cert-front + .cert-back) is now
   rendered straight from PD.certs by Feature 41 (renderCerts), so the
   back face shows the same issuer/date as the card and the modal. */

/* ══════════════════════════════════════════════════════════
   FEATURE 28 — TIMELINE EXPAND / COLLAPSE
══════════════════════════════════════════════════════════ */
(function timelineExpand() {
  /* PD.education[i] ↔ .tl-item[i]: the card text is kept in sync with PD, and a
     Details toggle exists only when details[] has verified entries. */
  document.querySelectorAll('.tl-item').forEach((item, i) => {
    const d = PD.education[i];
    if (!d) return;
    const set = (sel, val) => { const n = item.querySelector(sel); if (n && val) n.textContent = val; };
    set('.tl-year', d.years);
    set('.tl-school', d.school);
    set('.tl-sub', d.sub);
    const badge = item.querySelector('.tl-badge');
    if (badge && d.level) {
      const ico = badge.querySelector('i');
      badge.replaceChildren(...[ico, ' ' + d.level + (d.current ? ' · Current' : '')].filter(Boolean));
    }

    const details = (Array.isArray(d.details) ? d.details : []).filter(x => x && String(x).trim());
    if (!details.length) return;
    const bodyId = 'tlDetails' + i;
    const btn = pdEl('button', { type: 'button', class: 'tl-expand-btn', 'aria-expanded': 'false', 'aria-controls': bodyId },
      pdEl('i', { class: 'fa-solid fa-chevron-down', 'aria-hidden': 'true' }), ' Details');
    const body = pdEl('div', { class: 'tl-expand-body', id: bodyId },
      pdEl('div', { class: 'tl-expand-inner' }, pdEl('ul', null, details.map(x => pdEl('li', { text: String(x) })))));
    item.append(btn, body);
    btn.addEventListener('click', () => {
      const open = body.classList.toggle('open');
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      gsap.to(btn, { scale: open ? 1.04 : 1, duration: .2, ease: 'back.out(2)' });
    });
  });
})();

/* ══════════════════════════════════════════════════════════
   FEATURE 29 — MODAL PREV / NEXT NAVIGATION
══════════════════════════════════════════════════════════ */
(function modalNav() {
  let currentIdx = 0;
  const prevBtn  = document.getElementById('modalPrev');
  const nextBtn  = document.getElementById('modalNext');
  const counter  = document.getElementById('modalCounter');

  /* Patch openModal to track index */
  const _open = window.openModal;
  window.openModal = function(i) {
    currentIdx = i;
    _open(i);
    if (counter) counter.textContent = `${i + 1} / ${PD.certs.length}`;
  };

  function navigate(dir) {
    if (!PD.certs.length) return;
    currentIdx = (currentIdx + dir + PD.certs.length) % PD.certs.length;
    gsap.to('#modalBox', {
      x: dir * -30, opacity: 0, duration: .18, ease: 'power2.in',
      onComplete: () => {
        window.openModal(currentIdx);
        gsap.fromTo('#modalBox', { x: dir * 30, opacity: 0 }, { x: 0, opacity: 1, duration: .28, ease: 'power2.out' });
      }
    });
  }

  if (prevBtn) prevBtn.addEventListener('click', () => navigate(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => navigate(1));

  document.addEventListener('keydown', e => {
    const ov = document.getElementById('modalOverlay');
    if (!ov.classList.contains('open')) return;
    if (e.key === 'ArrowLeft')  navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
  });
})();

/* ══════════════════════════════════════════════════════════
   FEATURE 30 — SECTION AMBIENT COLOR SHIFT
══════════════════════════════════════════════════════════ */
(function ambientShift() {
  const b1 = document.getElementById('ambBlob1');
  const b2 = document.getElementById('ambBlob2');
  if (!b1 || !b2) return;
  /* dim crimson / wine shades per section (literal rgba so GSAP can interpolate them) */
  const sectionColors = {
    home:      { c1:'rgba(184,42,51,.12)', c2:'rgba(94,18,24,.12)' },
    about:     { c1:'rgba(184,42,51,.09)', c2:'rgba(122,26,34,.08)' },
    education: { c1:'rgba(150,32,42,.11)', c2:'rgba(184,42,51,.07)' },
    skills:    { c1:'rgba(184,42,51,.10)', c2:'rgba(94,18,24,.10)' },
    trainings: { c1:'rgba(224,72,79,.07)', c2:'rgba(122,26,34,.08)' },
    contact:   { c1:'rgba(184,42,51,.12)', c2:'rgba(94,18,24,.12)' }
  };
  function updateAmbient() {
    const sections = document.querySelectorAll('section[id]');
    let cur = 'home';
    sections.forEach(s => { if (window.scrollY >= s.offsetTop - 200) cur = s.id; });
    const col = sectionColors[cur] || sectionColors.home;
    gsap.to(b1, { background: `radial-gradient(circle,${col.c1},transparent 70%)`, duration: 1.2, ease: 'power1.out', opacity: .8 });
    gsap.to(b2, { background: `radial-gradient(circle,${col.c2},transparent 70%)`, duration: 1.2, ease: 'power1.out', opacity: .8 });
  }
  window.addEventListener('scroll', updateAmbient, { passive: true });
  updateAmbient();
})();

/* ══════════════════════════════════════════════════════════
   FEATURE 31 — GRADIENT ANIMATED SECTION HEADINGS
══════════════════════════════════════════════════════════ */
(function gradientHeadings() {
  /* Apply gradient text to first s-title in each section */
  document.querySelectorAll('section .s-title').forEach((el, i) => {
    if (i % 2 === 0) el.classList.add('grad-text');
  });
})();

/* ══════════════════════════════════════════════════════════
   FEATURE 32 — TOUCH RIPPLE EFFECT (mobile)
══════════════════════════════════════════════════════════ */
(function touchRipple() {
  document.querySelectorAll('.about-item,.soft-tag,.filter-btn,.cert-card,.tl-item').forEach(el => {
    el.style.position = 'relative';
    el.style.overflow = 'hidden';
    el.addEventListener('pointerdown', e => {
      if (!motionOK()) return;               // the ripple removes itself on animationend, which never fires with motion off
      const r = el.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * .6;
      const ripple = document.createElement('span');
      ripple.className = 'touch-ripple';
      ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size/2}px;top:${e.clientY - r.top - size/2}px`;
      el.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  });
})();

/* ══════════════════════════════════════════════════════════
   FEATURE 33 — PARALLAX DEPTH SCROLL (hero layers)
══════════════════════════════════════════════════════════ */
(function parallaxDepth() {
  if (isTouchDevice) return;
  const home  = document.getElementById('home');
  const photo = document.getElementById('heroPhoto');
  const avail = document.querySelector('.hero-avail');
  const stats = document.querySelector('.hero-stats');

  ScrollTrigger.create({
    trigger: home, start: 'top top', end: 'bottom top',
    onUpdate: self => {
      if (!motionOK()) return;
      const p = self.progress;
      if (photo) gsap.set(photo,  { y: p * 80, ease: 'none' });
      if (avail) gsap.set(avail,  { y: p * 30, ease: 'none' });
      if (stats) gsap.set(stats,  { y: p * 20, ease: 'none' });
    }
  });
})();

/* ══════════════════════════════════════════════════════════
   FEATURE 36 — SMOOTH GSAP SCROLL LINKS (all anchors)
══════════════════════════════════════════════════════════ */
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const href = link.getAttribute('href') || '';
    if (href.length < 2) return;            // bare "#": querySelector('#') would throw
    let target = null;
    try { target = document.querySelector(href); } catch (err) { return; }
    if (!target) return;
    e.preventDefault();
    gsap.to(window, { scrollTo: { y: target, offsetY: 68 }, duration: motionOK() ? 1.1 : 0, ease: 'power3.inOut' });
  });
});

/* ══════════════════════════════════════════════════════════
   FEATURE 37 — THEME DEFAULT (formerly auto system theme)
   The red & black theme is the brand, so the OS light/dark
   setting no longer overrides it. The theme is decided in the
   <head> script (saved choice, else dark) and Feature 13.
══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   FEATURE 38 — HERO TEXT GSAP STAGGER (word-level)
══════════════════════════════════════════════════════════ */
ScrollTrigger.create({
  trigger: '.hero-stats', start: 'top 90%', once: true,
  onEnter: () => {
    gsap.from('.hs-num', { y: 16, opacity: 0, scale: .85, stagger: .12, duration: .6, ease: 'back.out(2)' });
    gsap.from('.hs-label', { y: 8, opacity: 0, stagger: .12, duration: .4, delay: .15, ease: 'power2.out' });
  }
});

/* ══════════════════════════════════════════════════════════
   FEATURE 39 — BACK-TO-TOP RING SCROLL PROGRESS
══════════════════════════════════════════════════════════ */
(function bttRing() {
  const ring = document.getElementById('backTopRing');
  const fg   = document.getElementById('btrFg');
  if (!ring || !fg) return;

  const btt  = document.getElementById('backTop');
  const circ = 138; // 2π×22

  window.addEventListener('scroll', () => {
    const show = window.scrollY > 400;
    ring.classList.toggle('show', show);
    if (!show) return;
    const maxY = document.body.scrollHeight - window.innerHeight;
    const pct  = Math.min(window.scrollY / maxY, 1);
    fg.style.strokeDashoffset = (circ - pct * circ).toFixed(2);
  }, { passive: true });

  /* Sync visibility with btt button */
  btt.addEventListener('click', () => { ring.classList.remove('show'); });
})();

/* shared with the lab, terminal and motion modules */
Object.assign(window, { showToast, openModal, closeModal });
