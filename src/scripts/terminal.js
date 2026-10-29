/* ══════════════════════════════════════════════════════════
   FEATURE 50 — RENSO@DLSL TERMINAL (` key or the >_ button)
   Real, honestly labelled commands: ping = timed HTTP(S) HEAD
   requests, curl -I = this page's real response headers, dig =
   DNS-over-HTTPS (Cloudflare, only when typed). Extensible:
     window.TERM_CMDS[name]  = { help, usage?, hidden?, complete?(args) → [], run(args, io) }
     window.TERM_FILES[name] = { read(io), exists?() → bool, hidden? }   (used by ls / cat)
   window.__termRun('cmd') → Promise<output text>; window.openTerminal('cmd'?)
══════════════════════════════════════════════════════════ */
(function renTerminal() {
  const wrap = document.getElementById('terminal');
  if (!wrap) return;
  const toggle  = document.getElementById('termToggle');
  const win     = wrap.querySelector('.term-win');
  const out     = document.getElementById('termOut');
  const form    = document.getElementById('termForm');
  const input   = document.getElementById('termIn');
  const psEl    = document.getElementById('termPrompt');
  const titleEl = document.getElementById('termTitle');
  const chipsEl = document.getElementById('termChips');
  if (!win || !out || !form || !input) return;

  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const getPD = () => window.PD || {};
  const motionOK = () => (typeof window.motionOK === 'function'
    ? !!window.motionOK()
    : !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches));
  const isPhone = () => window.matchMedia('(max-width: 600px)').matches;
  const coarse  = () => window.matchMedia('(pointer: coarse)').matches;

  /* tiny DOM builder: strings always become text nodes, never HTML */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(k => {
      const v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else n.setAttribute(k, v === true ? '' : String(v));
    });
    kids.flat().forEach(c => { if (c != null && c !== false && c !== '') n.append(c); });
    return n;
  }
  const str = v => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
  const txt = n => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');
  /* only https:, mailto: or same-origin http(s) URLs ever reach an href / window.open */
  function safeUrl(u) {
    const s = str(u);
    if (!s) return '';
    try {
      const x = new URL(s, location.href);
      if (x.protocol === 'https:' || x.protocol === 'mailto:') return x.href;
      if (/^https?:$/.test(x.protocol) && x.origin === location.origin) return x.href;
    } catch (e) { /* invalid */ }
    return '';
  }
  const wait = (ms, signal) => new Promise(res => {
    if (signal && signal.aborted) return res();
    const t = setTimeout(res, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
  });
  /* AbortController tied to a parent signal plus a timeout */
  function linkAbort(parent, ms) {
    const ac = new AbortController();
    let timedOut = false;
    const onAbort = () => ac.abort();
    if (parent) parent.addEventListener('abort', onAbort, { once: true });
    const t = setTimeout(() => { timedOut = true; ac.abort(); }, ms);
    return { signal: ac.signal, timedOut: () => timedOut, done() { clearTimeout(t); if (parent) parent.removeEventListener('abort', onAbort); } };
  }

  /* ── data, read live from portfolioData with page-text fallbacks (nothing invented) ── */
  function person() {
    const p = getPD().person || {}, L = p.links || {};
    const domLink = re => {
      const a = [...document.querySelectorAll('#contact a[href], footer a[href]')].find(x => re.test(x.getAttribute('href') || ''));
      return a ? a.getAttribute('href') : '';
    };
    return {
      name: str(p.name) || txt(document.querySelector('.footer-name')) || 'Renso Anthony L. Casalme',
      school: str(p.school) || 'De La Salle Lipa',
      program: str(p.program) || 'BS Information Technology',
      gradYear: str(p.gradYear) || '2027',
      email: str(p.email) || domLink(/^mailto:/i).replace(/^mailto:/i, '').split('?')[0],
      github: safeUrl(L.github) || safeUrl(domLink(/github\.com/i)),
      linkedin: safeUrl(L.linkedin) || safeUrl(domLink(/linkedin\.com/i)),
      facebook: safeUrl(L.facebook) || safeUrl(domLink(/facebook\.com/i))
    };
  }
  function interests() {
    const i = getPD().interests;
    if (Array.isArray(i) && i.length) return i.map(str).filter(Boolean);
    return [...document.querySelectorAll('#about .float-badge')].map(txt).filter(Boolean);
  }
  function education() {
    const e = getPD().education;
    if (Array.isArray(e) && e.length) {
      return e.map(x => ({ school: str(x.school), years: str(x.years), sub: str(x.sub) || str(x.level), current: !!x.current })).filter(x => x.school);
    }
    return [...document.querySelectorAll('#education .tl-item')].map(it => ({
      school: txt(it.querySelector('.tl-school')), years: txt(it.querySelector('.tl-year')),
      sub: txt(it.querySelector('.tl-sub')), current: /current/i.test(txt(it.querySelector('.tl-badge')))
    })).filter(x => x.school);
  }
  function certs() {
    const c = getPD().certs;
    if (Array.isArray(c) && c.length) {
      return c.map(x => ({ title: str(x.title), type: str(x.type), date: str(x.date), issuer: str(x.issuer), verify: safeUrl(x.verifyUrl) })).filter(x => x.title);
    }
    return [...document.querySelectorAll('#certGrid .cert-card')].map(card => {
      const m = card.querySelectorAll('.cert-meta span');
      return { title: txt(card.querySelector('.cert-title')), type: txt(card.querySelector('.cert-type')), date: txt(m[0]), issuer: txt(m[1]), verify: '' };
    }).filter(x => x.title);
  }
  function aboutParas() {
    const story = str((getPD().about || {}).story);
    if (story) return story.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    let ps = [...document.querySelectorAll('#about .about-right > p')].map(txt).filter(Boolean);
    if (!ps.length) ps = [...document.querySelectorAll('#about p')].map(txt).filter(s => s.length > 60);
    return ps;
  }
  /* PD.now = { updated, focus, next:{label,target}, entries:[{date,text,href}] } (an array of entries also works) */
  function nowLog() {
    const n = getPD().now;
    if (!n) return null;
    const isArr = Array.isArray(n);
    const entries = isArr ? n : (Array.isArray(n.entries) ? n.entries : []);
    const rows = entries.map(e => (typeof e === 'string'
      ? { date: '', text: str(e), href: '' }
      : { date: str(e && (e.date || e.dateISO)), text: str(e && (e.text || e.title || e.note)), href: safeUrl(e && e.href) })).filter(r => r.text);
    const focus = isArr ? '' : str(n.focus);
    const next = !isArr && n.next && str(n.next.label) ? { label: str(n.next.label), target: str(n.next.target) } : null;
    if (!focus && !rows.length && !next) return null;
    return { updated: isArr ? '' : str(n.updated), focus, rows, next };
  }
  const resumeUrl = () => safeUrl((getPD().resume || {}).pdf);
  function sections() {
    return [...document.querySelectorAll('section[id]')]
      .filter(s => !(s.parentElement && s.parentElement.closest('section')) && !wrap.contains(s) && s.getClientRects().length)
      .map(s => s.id);
  }

  /* ── files for ls / cat (TERM_FILES registry) ── */
  const FILES = window.TERM_FILES = Object.assign({
    'about.txt': {
      read(io) { const ps = aboutParas(); if (!ps.length) return io.err('cat: about.txt: file is empty'); ps.forEach((p, i) => { if (i) io.print(''); io.print(p); }); }
    },
    'now.log': {
      exists: () => !!nowLog(),
      read(io) {
        const n = nowLog();
        if (!n) return io.err('cat: now.log: No such file or directory');
        if (n.updated) {
          const d = new Date(n.updated + (/^\d{4}-\d{2}-\d{2}$/.test(n.updated) ? 'T00:00:00' : ''));
          const days = isNaN(d) ? null : Math.max(0, Math.floor((Date.now() - d.getTime()) / 864e5));
          io.dim(`# now.log, updated ${n.updated}${days == null ? '' : ` (${days} day${days === 1 ? '' : 's'} ago)`}`);
        }
        if (n.focus) io.line(io.span('focus  ', 't-dim'), n.focus);
        n.rows.forEach(r => io.line(r.date ? io.span(r.date.padEnd(11), 't-dim') : '', r.text, r.href ? ' ' : '', r.href ? io.a('↗', r.href, 'Link for: ' + r.text) : ''));
        if (n.next) io.line(io.span('next   ', 't-dim'), n.next.label, n.next.target ? io.span(` (target ${n.next.target})`, 't-dim') : '');
      }
    },
    'resume.pdf': {
      exists: () => !!resumeUrl(),
      read(io) { io.err('cat: resume.pdf: binary file (try: open resume)'); }
    }
  }, window.TERM_FILES || {});
  const fileVisible = (name, all) => {
    const f = FILES[name];
    if (!f || f.hidden) return false;
    if (name.startsWith('.') && !all) return false;
    return typeof f.exists !== 'function' || !!f.exists();
  };
  const fileNames = all => Object.keys(FILES).filter(n => fileVisible(n, all));
  const fileExists = name => own(FILES, name) && (typeof FILES[name].exists !== 'function' || !!FILES[name].exists());

  /* ── output machinery ── */
  let cwd = '';
  const promptText = () => `renso@dlsl:~${cwd ? '/' + cwd : ''}$`;
  function updatePrompt() {
    if (psEl) psEl.textContent = promptText();
    if (titleEl) titleEl.textContent = `renso@dlsl: ~${cwd ? '/' + cwd : ''}`;
  }
  const scrollOut = () => { out.scrollTop = out.scrollHeight; };
  function trim() { while (out.childElementCount > 160) out.firstElementChild.remove(); }

  let batchT = 0, batchI = 0;
  function animateLine(line) {
    if (!motionOK()) return;
    const now = performance.now();
    if (now - batchT > 80) batchI = 0;
    batchT = now;
    const len = Math.max(1, Math.min(60, line.textContent.length));
    line.style.setProperty('--td', Math.min(260, 40 + len * 5) + 'ms');
    line.style.setProperty('--ts', String(len));
    line.style.setProperty('--tdl', Math.min(batchI, 30) * 26 + 'ms');
    batchI++;
    line.classList.add('term-type');
    line.addEventListener('animationend', () => line.classList.remove('term-type'), { once: true });
  }
  function newBlock(cmdText) {
    const blk = el('div', { class: 'term-block' });
    if (cmdText != null) blk.append(el('div', { class: 'term-line term-echo' }, el('span', { class: 'term-ps' }, promptText()), ' ', cmdText));
    out.append(blk); trim(); scrollOut();
    return blk;
  }
  function addLine(blk, parts, cls, buf) {
    const line = el('div', { class: 'term-line' + (cls ? ' ' + cls : '') }, parts);
    blk.append(line);
    if (buf) buf.push(line.textContent);
    animateLine(line);
    scrollOut();
    return line;
  }
  /* rough column count, so wide tables can fold on narrow screens */
  let chW = 0;
  function cols() {
    const w = out.clientWidth;
    if (!w) return 100;
    if (!chW) { const s = el('span', { style: 'visibility:hidden;position:absolute' }, '0000000000'); out.append(s); chW = s.getBoundingClientRect().width / 10 || 8; s.remove(); }
    return Math.floor((w - 28) / chW);
  }
  function makeIO(blk, buf, signal) {
    const line = (parts, cls) => addLine(blk, parts, cls, buf);
    const io = {
      signal,
      get PD() { return getPD(); },
      print: (t, cls) => String(t == null ? '' : t).split('\n').forEach(s => line([s], cls)),
      dim:  t => io.print(t, 't-dim'),
      err:  t => io.print(t, 't-err'),
      ok:   t => io.print(t, 't-ok'),
      warn: t => io.print(t, 't-warn'),
      line: (...parts) => line(parts),
      span: (t, cls) => el('span', { class: cls || null }, t),
      a: (label, href, aria) => {
        const u = safeUrl(href);
        if (!u) return el('span', null, label);
        return el('a', { href: u, target: u.startsWith('mailto:') ? null : '_blank', rel: 'noopener noreferrer', 'aria-label': aria || null }, label);
      },
      btn: (label, cmdline) => el('button', { type: 'button', class: 'term-run', 'data-cmd': cmdline, title: 'Run: ' + cmdline }, label),
      sleep: ms => (motionOK() ? wait(ms, signal) : Promise.resolve()),
      wait: ms => wait(ms, signal),
      cols,
      clear: () => out.replaceChildren(),
      close: opts => close(opts)
    };
    return io;
  }

  /* ── commands ── */
  const S = (label, help, run, extra) => Object.assign({ usage: label, help, run }, extra || {});
  const pad = (s, n) => String(s).padEnd(n);

  function cmdHelp(args, io) {
    if (args[0]) {
      const n = args[0].toLowerCase(), c = own(CMDS, n) ? CMDS[n] : null;
      if (!c) return io.err(`help: no help topics match “${args[0]}”`);
      io.print(c.usage || n);
      io.dim('  ' + (c.help || ''));
      return;
    }
    io.print('Commands (Tab completes · ↑/↓ history · Ctrl+C cancels · Esc closes)');
    const names = visibleNames();
    const w = Math.max(...names.map(n => (CMDS[n].usage || n).length)) + 2;
    const narrow = io.cols() < w + 34;
    names.forEach(n => {
      const c = CMDS[n];
      if (narrow) { io.line(io.span(c.usage || n, 't-acc')); io.dim('    ' + (c.help || '')); }
      else io.line(io.span(pad(c.usage || n, w), 't-acc'), io.span(c.help || '', 't-dim'));
    });
  }
  function cmdLs(args, io) {
    const all = args.some(a => /^-[a-z]*a/i.test(a));
    const dirs = sections().filter(id => id !== 'home');
    const items = [];
    if (all) items.push(io.span('./', 't-dim'), '  ', io.span('../', 't-dim'), '  ');
    dirs.forEach(d => { items.push(io.btn(d + '/', 'cd ' + d), '  '); });
    fileNames(all).forEach(f => { items.push(io.span(f), '  '); });
    items.pop();
    io.line(...items);
  }
  function goSection(id, focusIt) {
    const sec = document.getElementById(id);
    if (!sec) return;
    const nav = document.getElementById('navbar');
    const navH = nav ? nav.offsetHeight : 68;
    const top = id === 'home' ? 0 : Math.max(0, sec.getBoundingClientRect().top + window.scrollY - navH);
    if (motionOK() && window.gsap && typeof window.ScrollToPlugin !== 'undefined') {
      window.gsap.to(window, { scrollTo: { y: top, autoKill: true }, duration: 0.9, ease: 'power3.inOut' });
    } else {
      window.scrollTo({ top, behavior: 'instant' });
    }
    if (focusIt) {
      const h = sec.querySelector('h1, h2, h3') || sec;
      if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
  }
  function cmdCd(args, io) {
    const raw = args[0] || '~';
    const t = raw.toLowerCase().replace(/^~\/?|^\.?\//, '').replace(/\/+$/, '');
    if (t === '.' ) return;
    const target = (t === '' || t === '~' || t === '..' || t === 'home') ? 'home' : t;
    if (!sections().includes(target)) {
      if (fileExists(raw)) return io.err(`cd: not a directory: ${raw}`);
      return io.err(`cd: no such file or directory: ${raw}`);
    }
    cwd = target === 'home' ? '' : target;
    updatePrompt();
    if (isPhone()) { close({ restore: false }); goSection(target, true); return; }
    goSection(target, false);
    io.dim(target === 'home' ? '→ back to the top' : `→ scrolled to #${target}`);
  }
  function cmdCat(args, io) {
    if (!args.length) return io.err('usage: cat <file>   (try: ls)');
    args.forEach(name => {
      if (sections().includes(name.replace(/\/+$/, ''))) return io.err(`cat: ${name}: Is a directory`);
      if (!fileExists(name)) return io.err(`cat: ${name}: No such file or directory`);
      return FILES[name].read(io);
    });
  }
  function cmdWhoami(args, io) {
    const p = person();
    io.print('renso');
    io.print(p.name, 't-acc');
    io.dim(`${p.program} student · ${p.school} · graduating ${p.gradYear}`);
    const i = interests();
    if (i.length) io.dim('interests: ' + i.join(', '));
  }
  async function cmdTrace(args, io) {
    const t = (args[0] || '').toLowerCase();
    if (!t) return io.err('usage: traceroute renso');
    if (t !== 'renso') return io.err(`traceroute: ${args[0]}: only “renso” is mapped here. A web page cannot set IP TTLs, so a real traceroute is impossible from a browser.`);
    const hops = education();
    io.dim(`traceroute to renso (career path), ${hops.length + 1} hops max: education printed as hops`);
    for (let i = 0; i < hops.length; i++) {
      await io.sleep(160);
      if (io.signal.aborted) return;
      const h = hops[i];
      io.line(io.span(String(i + 1).padStart(2) + '  ', 't-dim'), io.span(h.school, 't-acc'), h.current ? io.span('  ← current', 't-ok') : '');
      const meta = [h.years, h.sub].filter(Boolean).join(' · ');
      if (meta) io.dim('    ' + meta);
    }
    await io.sleep(520);
    if (io.signal.aborted) return;
    io.line(io.span(String(hops.length + 1).padStart(2) + '  ', 't-dim'), io.span('* * * your company? (request timed out — hire to complete the route)', 't-warn'));
  }
  function cmdCerts(args, io) {
    const list = certs();
    if (!list.length) return io.err('certs: no certificates found');
    const canOpen = typeof window.openModal === 'function';
    io.dim(`${list.length} certificates and trainings:`);
    list.forEach((c, i) => {
      io.line(io.span(`[${i + 1}] `, 't-dim'), canOpen ? io.btn(c.title, `open cert ${i + 1}`) : io.span(c.title, 't-acc'));
      const meta = [c.type, c.issuer, c.date].filter(Boolean).join(' · ');
      if (meta) io.dim('    ' + meta);
      if (c.verify) io.line(io.span('    verify: ', 't-dim'), io.a(c.verify.replace(/^https:\/\//, ''), c.verify, 'Verify credential: ' + c.title));
    });
    if (canOpen) io.dim('open one with: open cert <n>');
  }
  function openTargets() {
    const p = person(), list = [];
    if (p.github) list.push({ name: 'github', url: p.github });
    if (p.linkedin) list.push({ name: 'linkedin', url: p.linkedin });
    if (p.facebook) list.push({ name: 'facebook', url: p.facebook });
    if (p.email) list.push({ name: 'email', url: 'mailto:' + p.email });
    const r = resumeUrl();
    if (r) list.push({ name: 'resume', url: r });
    return list;
  }
  function cmdOpen(args, io) {
    const name = (args[0] || '').toLowerCase().replace(/\.pdf$/, '');
    const targets = openTargets();
    const canCert = typeof window.openModal === 'function' && certs().length > 0;
    if (!name) return io.err(`usage: open <${targets.map(t => t.name).concat(canCert ? ['cert <n>'] : []).join(' | ')}>`);
    if (name === 'cert' || name === 'certs') {
      const total = certs().length, n = parseInt(args[1], 10);
      if (!canCert) return io.err('open: cert: certificates are not available here');
      if (!(n >= 1 && n <= total)) return io.err(`open: cert: pick a number from 1 to ${total} (see: certs)`);
      io.dim(`opening certificate ${n}…`);
      close();
      window.openModal(n - 1);
      return;
    }
    const t = targets.find(x => x.name === name);
    if (!t) return io.err(`open: ${args[0]}: No such file or directory`);
    io.line('opening ', io.a(t.url.replace(/^mailto:/, '').replace(/^https:\/\//, ''), t.url), ' …');
    if (t.url.startsWith('mailto:')) window.location.href = t.url;
    else window.open(t.url, '_blank', 'noopener,noreferrer');
  }
  function cmdContact(args, io) {
    const p = person();
    const rows = [
      ['email', p.email ? 'mailto:' + p.email : '', p.email],
      ['github', p.github, p.github], ['linkedin', p.linkedin, p.linkedin], ['facebook', p.facebook, p.facebook]
    ].filter(r => r[1]);
    if (!rows.length) return io.err('contact: no contact details found');
    rows.forEach(([k, href, label]) => io.line(io.span(pad(k, 10), 't-dim'), io.a(label.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, ''), href)));
    io.dim('open one with: open <name>');
  }
  function isSelfHost(h) {
    let host = h.toLowerCase();
    try { if (/^[a-z]+:\/\//.test(host)) host = new URL(host).host; } catch (e) { return false; }
    host = host.replace(/\/.*$/, '');
    return host === location.host.toLowerCase() || host === location.hostname.toLowerCase();
  }
  async function cmdPing(args, io) {
    let count = 4, host = '';
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-c' || args[i] === '-n') {
        count = parseInt(args[++i], 10);
        if (!(count >= 1 && count <= 10)) return io.err('ping: -c takes a number from 1 to 10');
      } else if (/^-/.test(args[i])) return io.err(`ping: unsupported option ${args[i]} (supported: -c <count>)`);
      else host = args[i];
    }
    if (!/^https?:$/.test(location.protocol)) return io.err('ping: this page is not served over HTTP(S), so there is nothing to time');
    if (host && !isSelfHost(host)) {
      return io.err(`ping: ${host}: a web page can only time requests to its own origin (CORS and this site's Content-Security-Policy block the rest). Try plain “ping”, or “dig ${host}”.`);
    }
    const self = location.host, url = location.href.split('#')[0];
    const scheme = location.protocol === 'https:' ? 'HTTPS' : 'HTTP';
    io.dim(`PING ${self}: PING over ${scheme} (browsers cannot send ICMP), timing HEAD ${location.pathname}`);
    const times = [];
    let sent = 0;
    for (let i = 1; i <= count && !io.signal.aborted; i++) {
      sent++;
      const lk = linkAbort(io.signal, 5000);
      const t0 = performance.now();
      try {
        const res = await fetch(url, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin', signal: lk.signal });
        const ms = performance.now() - t0;
        times.push(ms);
        io.print(`${res.status} from ${self}: seq=${i} time=${ms.toFixed(1)} ms`);
      } catch (e) {
        if (io.signal.aborted) { sent--; break; }
        io.err(lk.timedOut() ? `Request timed out (seq=${i})` : `seq=${i}: ${(e && e.message) || 'network error'}`);
      } finally { lk.done(); }
      if (i < count) await io.wait(250);
    }
    io.print('');
    io.print(`--- ${self} ping statistics ---`);
    const recv = times.length, loss = sent ? Math.round((1 - recv / sent) * 100) : 0;
    io.print(`${sent} requests sent, ${recv} responses, ${loss}% loss`);
    if (recv) {
      const min = Math.min(...times), max = Math.max(...times), avg = times.reduce((a, b) => a + b, 0) / recv;
      io.print(`rtt min/avg/max = ${min.toFixed(1)}/${avg.toFixed(1)}/${max.toFixed(1)} ms`);
    }
  }
  function protoOf(href) {
    const map = p => (p === 'h2' ? 'HTTP/2' : p === 'h3' ? 'HTTP/3' : /^http\/1\.[01]$/i.test(p || '') ? p.toUpperCase() : '');
    try {
      const r = performance.getEntriesByName(href).filter(e => e.nextHopProtocol).pop();
      const v = r && map(r.nextHopProtocol);
      if (v) return v;
      const n = performance.getEntriesByType('navigation')[0];
      return (n && map(n.nextHopProtocol)) || 'HTTP';
    } catch (e) { return 'HTTP'; }
  }
  async function cmdCurl(args, io) {
    const flags = args.filter(a => a.startsWith('-')), rest = args.filter(a => !a.startsWith('-'));
    const head = flags.some(f => f === '--head' || (/^-[a-zA-Z]+$/.test(f) && f.includes('I')));
    if (!head) return io.err('curl: only “curl -I [path]” is supported here (it prints response headers)');
    const badFlag = flags.find(f => !(f === '--head' || /^-[sSLI]+$/.test(f)));
    if (badFlag) return io.err(`curl: option ${badFlag}: not supported here (try: curl -I)`);
    if (rest.length > 1) return io.err('curl: one URL at a time');
    let target;
    try { target = new URL(rest[0] || location.href, location.href); } catch (e) { return io.err(`curl: (3) URL rejected: ${rest[0]}`); }
    if (!/^https?:$/.test(target.protocol)) return io.err('curl: (1) only http(s) URLs');
    if (target.origin !== location.origin) {
      return io.err(`curl: (7) ${target.host}: blocked. A web page may only read headers from its own origin (CORS + this site's Content-Security-Policy).`);
    }
    target.hash = '';
    const lk = linkAbort(io.signal, 8000);
    try {
      const t0 = performance.now();
      const res = await fetch(target.href, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin', signal: lk.signal });
      const ms = Math.round(performance.now() - t0);
      io.print(`${protoOf(res.url || target.href)} ${res.status}${res.statusText ? ' ' + res.statusText : ''}`, res.ok ? 't-ok' : 't-warn');
      res.headers.forEach((v, k) => io.line(io.span(k, 't-acc'), ': ' + v));
      io.dim(`# HEAD ${target.pathname} via fetch() in ${ms} ms. Browsers hide a few headers (such as set-cookie) from scripts.`);
    } catch (e) {
      if (io.signal.aborted) return;
      io.err(lk.timedOut() ? 'curl: (28) Operation timed out' : `curl: (7) ${(e && e.message) || 'request failed'}`);
    } finally { lk.done(); }
  }
  const DNS_TYPES = { A: 1, NS: 2, CNAME: 5, SOA: 6, MX: 15, TXT: 16, AAAA: 28, CAA: 257 };
  const RCODES = ['NOERROR', 'FORMERR', 'SERVFAIL', 'NXDOMAIN', 'NOTIMP', 'REFUSED'];
  const typeName = n => Object.keys(DNS_TYPES).find(k => DNS_TYPES[k] === n) || `TYPE${n}`;
  async function cmdDig(args, io) {
    const usage = 'usage: dig <name> [A|AAAA|CNAME|MX|NS|TXT|SOA|CAA]';
    if (args.some(a => a.startsWith('@'))) io.dim(';; note: this terminal always asks cloudflare-dns.com over HTTPS; @server is ignored');
    const rest = args.filter(a => !a.startsWith('+') && !a.startsWith('@'));
    const isType = a => own(DNS_TYPES, a.toUpperCase());
    let name = '', type = 'A';
    if (rest.length === 1) name = rest[0];
    else if (rest.length === 2 && isType(rest[1])) { name = rest[0]; type = rest[1].toUpperCase(); }
    else if (rest.length === 2 && isType(rest[0])) { name = rest[1]; type = rest[0].toUpperCase(); }
    else return io.err(usage);
    let host = '';
    try { host = new URL('http://' + name.replace(/\.$/, '')).hostname; } catch (e) { host = ''; }
    const label = '[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?';
    if (!host || host.length > 253 || !new RegExp(`^${label}(?:\\.${label})*$`).test(host)) return io.err(`dig: “${name}” is not a valid domain name`);
    io.dim(`; <<>> dig over HTTPS <<>> ${host} ${type}`);
    io.dim(';; resolver: cloudflare-dns.com (DNS-over-HTTPS, JSON API). This query is sent to Cloudflare.');
    const lk = linkAbort(io.signal, 6000);
    const t0 = performance.now();
    let data;
    try {
      const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
        headers: { accept: 'application/dns-json' }, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: lk.signal
      });
      if (!res.ok) throw new Error(`resolver answered HTTP ${res.status}`);
      data = await res.json();
    } catch (e) {
      if (io.signal.aborted) return;
      return io.err(lk.timedOut()
        ? ';; connection timed out; no servers could be reached'
        : `;; request failed: ${(e && e.message) || e} (offline, blocked by an extension, or by this page's Content-Security-Policy)`);
    } finally { lk.done(); }
    const ms = Math.round(performance.now() - t0);
    const answers = Array.isArray(data.Answer) ? data.Answer.slice(0, 50) : [];
    const auth = Array.isArray(data.Authority) ? data.Authority.slice(0, 10) : [];
    const flags = ['qr', data.TC && 'tc', data.RD && 'rd', data.RA && 'ra', data.AD && 'ad', data.CD && 'cd'].filter(Boolean).join(' ');
    io.print(`;; ->>HEADER<<- status: ${RCODES[data.Status] || 'RCODE ' + data.Status}, answers: ${answers.length}`);
    io.dim(`;; flags: ${flags}`);
    const row = a => `${pad(String(a.name), 24)} ${String(a.TTL).padStart(6)}  IN  ${pad(typeName(a.type), 6)} ${String(a.data)}`;
    if (answers.length) { io.print(''); io.dim(';; ANSWER SECTION:'); answers.forEach(a => io.print(row(a))); }
    else if (auth.length) { io.print(''); io.dim(';; AUTHORITY SECTION:'); auth.forEach(a => io.print(row(a))); }
    io.print('');
    io.dim(`;; Query time: ${ms} ms`);
    io.dim(';; SERVER: https://cloudflare-dns.com/dns-query (DoH)');
  }
  function cmdHistory(args, io) {
    if (args[0] === '-c') { hist.length = 0; saveHist(); return io.dim('history cleared'); }
    if (!hist.length) return io.dim('(no commands yet)');
    hist.forEach((h, i) => io.print(`${String(i + 1).padStart(4)}  ${h}`));
  }

  const BUILTIN = {
    help:       S('help [command]', 'list commands, or explain one', cmdHelp, { complete: () => visibleNames() }),
    ls:         S('ls', 'list sections (directories) and files', cmdLs),
    cd:         S('cd <section>', 'jump to a section; cd ~ goes back to the top', cmdCd, { complete: () => sections() }),
    pwd:        S('pwd', 'print the current section', (a, io) => io.print('/home/renso' + (cwd ? '/' + cwd : ''))),
    cat:        S('cat <file>', 'print a file, e.g. cat about.txt', cmdCat, { complete: () => fileNames(false) }),
    whoami:     S('whoami', 'who this site belongs to', cmdWhoami),
    traceroute: S('traceroute renso', 'education, printed as network hops', cmdTrace, { complete: () => ['renso'] }),
    education:  S('education', 'same as traceroute renso', (a, io) => cmdTrace(['renso'], io)),
    certs:      S('certs', 'certificates and trainings', cmdCerts),
    open:       S('open <target>', 'open github, linkedin, facebook, email, resume or cert <n>', cmdOpen, {
      complete: () => openTargets().map(t => t.name).concat(typeof window.openModal === 'function' ? ['cert'] : [])
    }),
    contact:    S('contact', 'how to reach Renso', cmdContact),
    ping:       S('ping [-c n]', 'time HTTP(S) round trips to this site (not ICMP)', cmdPing, { complete: () => ['-c'] }),
    curl:       S('curl -I [path]', "show this page's real response headers", cmdCurl, { complete: () => ['-I'] }),
    dig:        S('dig <name> [type]', 'real DNS lookup over DNS-over-HTTPS (Cloudflare)', cmdDig),
    history:    S('history', 'commands you have run (history -c clears)', cmdHistory),
    clear:      S('clear', 'clear the screen', (a, io) => io.clear()),
    exit:       S('exit', 'close the terminal', (a, io) => io.close())
  };
  const alias = (target, label) => ({ hidden: true, usage: label, help: `same as ${target}`, run: (a, io) => CMDS[target].run(a, io) });
  Object.assign(BUILTIN, { '?': alias('help', '?'), man: alias('help', 'man'), dir: alias('ls', 'dir'), cls: alias('clear', 'cls'), quit: alias('exit', 'quit'), logout: alias('exit', 'logout') });
  const CMDS = window.TERM_CMDS = Object.assign(BUILTIN, window.TERM_CMDS || {});
  const visibleNames = () => Object.keys(CMDS).filter(n => CMDS[n] && !CMDS[n].hidden && typeof CMDS[n].run === 'function');

  /* ── history (sessionStorage is a convenience only) ── */
  const HKEY = 'renso.term.history';
  let hist = [];
  try { hist = JSON.parse(sessionStorage.getItem(HKEY) || '[]'); if (!Array.isArray(hist)) hist = []; } catch (e) { hist = []; }
  hist = hist.filter(h => typeof h === 'string').slice(-50);
  function saveHist() { try { sessionStorage.setItem(HKEY, JSON.stringify(hist.slice(-50))); } catch (e) { /* storage blocked */ } }
  function pushHist(line) { if (hist[hist.length - 1] !== line) hist.push(line); if (hist.length > 50) hist.shift(); saveHist(); }
  let hIdx = -1, draft = '';
  function histNav(d) {
    if (!hist.length) return;
    if (hIdx === -1) { if (d > 0) return; draft = input.value; hIdx = hist.length; }
    hIdx = Math.max(0, Math.min(hist.length, hIdx + d));
    input.value = hIdx === hist.length ? draft : hist[hIdx];
    if (hIdx === hist.length) hIdx = -1;
    const end = input.value.length;
    requestAnimationFrame(() => input.setSelectionRange(end, end));
  }

  /* ── execution (serialised, so typed-ahead commands run in order) ── */
  let queue = Promise.resolve(), current = null;
  function tokenize(s) {
    return (s.match(/"[^"]*"|'[^']*'|\S+/g) || []).map(t => t.replace(/^(["'])([\s\S]*)\1$/, '$2'));
  }
  async function exec(line) {
    const raw = String(line == null ? '' : line).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300);
    const blk = newBlock(raw);
    if (!raw) return '';
    pushHist(raw);
    const toks = tokenize(raw);
    const name = (toks[0] || '').toLowerCase(), args = toks.slice(1);
    const buf = [], ac = new AbortController();
    current = ac;
    wrap.classList.add('is-busy');
    const io = makeIO(blk, buf, ac.signal);
    try {
      const cmd = own(CMDS, name) ? CMDS[name] : null;
      if (!cmd || typeof cmd.run !== 'function') io.err(`command not found: ${toks[0]} — try help`);
      else {
        const r = await cmd.run(args, io);
        if (typeof r === 'string' && r) io.print(r);
      }
    } catch (e) {
      if (!ac.signal.aborted) io.err(`${name}: ${(e && e.message) || e}`);
    } finally {
      if (current === ac) current = null;
      wrap.classList.remove('is-busy');
    }
    return buf.join('\n');
  }
  function enqueue(line) {
    const p = queue.then(() => exec(line));
    queue = p.catch(() => {});
    return p;
  }
  function runFromUI(cmd) {
    const p = queue.then(async () => {
      if (motionOK()) {
        for (let i = 1; i <= cmd.length; i++) { input.value = cmd.slice(0, i); await wait(14); }
        await wait(70);
      }
      input.value = '';
      return exec(cmd);
    });
    queue = p.catch(() => {});
    return p;
  }

  /* ── Tab completion ── */
  function commonPrefix(list) {
    let p = list[0] || '';
    list.forEach(s => { while (p && !s.toLowerCase().startsWith(p.toLowerCase())) p = p.slice(0, -1); });
    return p;
  }
  function complete() {
    const v = input.value, lead = v.match(/^\s*/)[0], body = v.slice(lead.length);
    const toks = body.split(/\s+/);
    let cands, prefix, base;
    if (toks.length === 1) { prefix = toks[0]; base = ''; cands = visibleNames(); }
    else {
      const name = toks[0].toLowerCase(), c = own(CMDS, name) ? CMDS[name] : null;
      prefix = toks[toks.length - 1]; base = body.slice(0, body.length - prefix.length);
      try { cands = c && typeof c.complete === 'function' ? (c.complete(toks.slice(1, -1)) || []) : []; } catch (e) { cands = []; }
    }
    const m = cands.filter(x => String(x).toLowerCase().startsWith(prefix.toLowerCase()));
    if (!m.length) return;
    if (m.length === 1) { input.value = lead + base + m[0] + ' '; return; }
    const cp = commonPrefix(m);
    if (cp.length > prefix.length) { input.value = lead + base + cp; return; }
    const blk = newBlock(v);
    addLine(blk, [m.join('  ')], 't-dim');
  }

  /* ── open / close, focus trap, backtick key ── */
  let isOpen = false, lastFocus = null, greeted = false;
  function greet() {
    const blk = el('div', { class: 'term-block' });
    out.prepend(blk);
    const say = (t, cls) => addLine(blk, [t], cls);
    say('renso@dlsl web terminal. Commands run in your browser; ping, curl and dig make real network requests.', 't-dim');
    say(coarse() ? 'Tap a command below, or type help.' : 'Type help, or click a command below. Tab completes · ↑/↓ history · Esc closes.', 't-dim');
  }
  function buildChips() {
    if (!chipsEl) return;
    const list = ['help', 'ls', 'whoami', 'traceroute renso', 'certs', 'cat about.txt'];
    if (nowLog()) list.push('cat now.log');
    list.push('contact', 'ping', 'curl -I', 'dig github.com');
    if (resumeUrl()) list.push('open resume');
    list.push('clear');
    chipsEl.replaceChildren(...list.map(c => el('button', { type: 'button', class: 'term-chip', 'data-cmd': c }, c)));
  }
  const vv = window.visualViewport;
  function fitViewport() {
    if (!isOpen) return;
    if (vv && isPhone()) { win.style.height = Math.round(vv.height) + 'px'; win.style.top = Math.round(vv.offsetTop) + 'px'; }
    else { win.style.height = ''; win.style.top = ''; }
    scrollOut();
  }
  const focusDefault = () => { if (coarse()) out.focus({ preventScroll: true }); else input.focus({ preventScroll: true }); };
  function open(cmd) {
    if (!isOpen) {
      isOpen = true;
      lastFocus = document.activeElement;
      buildChips();
      updatePrompt();
      wrap.hidden = false;
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
      document.documentElement.classList.add('term-open');
      wrap.classList.remove('term-anim');
      if (motionOK()) { void wrap.offsetWidth; wrap.classList.add('term-anim'); }
      if (!greeted) { greeted = true; greet(); }
      fitViewport();
      focusDefault();
    } else focusDefault();
    if (cmd) return enqueue(String(cmd));
    return Promise.resolve('');
  }
  function close(opts) {
    if (!isOpen) return;
    isOpen = false;
    if (current) current.abort();
    wrap.hidden = true;
    wrap.classList.remove('term-anim');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('term-open');
    win.style.height = ''; win.style.top = '';
    if (opts && opts.restore === false) return;
    const back = lastFocus && lastFocus !== document.body && document.contains(lastFocus) ? lastFocus : toggle;
    if (back && typeof back.focus === 'function') back.focus({ preventScroll: true });
  }

  if (toggle) toggle.addEventListener('click', () => open());
  wrap.querySelectorAll('[data-term-close]').forEach(b => b.addEventListener('click', () => close()));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = input.value;
    input.value = ''; hIdx = -1;
    enqueue(v);
  });
  input.addEventListener('input', () => { hIdx = -1; });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp') { e.preventDefault(); histNav(-1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); histNav(1); }
    else if (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'c' || e.key === 'C') && input.selectionStart === input.selectionEnd) {
      e.preventDefault();
      if (current) { current.abort(); const b = out.lastElementChild; if (b) addLine(b, ['^C'], 't-dim'); }
      else { const blk = newBlock(input.value); addLine(blk, ['^C'], 't-dim'); input.value = ''; }
    }
  });
  wrap.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    if (e.target === input && !e.shiftKey && input.value.trim()) { e.preventDefault(); complete(); return; }
    const f = [...win.querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])')].filter(n => !n.disabled && n.getClientRects().length);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  document.addEventListener('focusin', e => { if (isOpen && !wrap.contains(e.target)) focusDefault(); });
  const runClick = e => { const b = e.target.closest('[data-cmd]'); if (b) runFromUI(b.dataset.cmd); };
  if (chipsEl) chipsEl.addEventListener('click', runClick);
  out.addEventListener('click', runClick);

  /* ` opens the terminal; ignored while typing, never stops propagation (the Konami listener still sees every key) */
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (!(e.key === '`' || (e.key === 'Dead' && e.code === 'Backquote'))) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault();
    if (isOpen) close(); else open();
  });

  if (vv) { vv.addEventListener('resize', fitViewport); vv.addEventListener('scroll', fitViewport); }
  window.addEventListener('resize', fitViewport);
  document.addEventListener('motionchange', e => {
    if (e.detail && e.detail.on) return;
    out.querySelectorAll('.term-type').forEach(n => n.classList.remove('term-type'));
    wrap.classList.remove('term-anim');
  });

  window.__termRun = cmd => enqueue(String(cmd == null ? '' : cmd));
  window.openTerminal = open;
})();
