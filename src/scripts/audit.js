/* ══════════════════════════════════════════════════════════
   FEATURE 54 — SECURITY SELF-CHECK
   Every row is a real check against this page, run in the visitor's
   browser when the report opens. PASS / WARN / INFO, each with why it
   matters and the exact check. Also available as `audit` in the terminal.
══════════════════════════════════════════════════════════ */
(function securityAudit() {
  const dlg = document.getElementById('auditDlg');
  const openBtn = document.getElementById('auditOpen');
  if (!dlg || !openBtn) return;
  const list = document.getElementById('auditList');
  const sum = document.getElementById('auditSum');
  const el = window.el;

  const cspMeta = () => document.querySelector('meta[http-equiv="content-security-policy" i]');
  const directive = (csp, name) => { const m = csp.match(new RegExp('(?:^|;)\\s*' + name + '\\s+([^;]*)')); return m ? m[1].trim() : null; };

  async function checks() {
    let head = null;
    try {
      const res = await fetch(location.href, { method: 'HEAD', cache: 'no-store' });
      head = res.headers;
    } catch (e) { head = null; }
    const h = n => (head ? head.get(n) : null);
    const resources = performance.getEntriesByType('resource').map(r => r.name);
    const hosts = [...new Set(resources.map(u => { try { return new URL(u).host; } catch (e) { return ''; } }).filter(x => x && x !== location.host))];
    const csp = cspMeta() ? cspMeta().getAttribute('content') : '';
    const scriptSrc = csp ? directive(csp, 'script-src') : null;
    const hashCount = scriptSrc ? (scriptSrc.match(/'sha(256|384|512)-/g) || []).length : 0;
    const blankLinks = [...document.querySelectorAll('a[target="_blank"]')];
    const unsafeLinks = blankLinks.filter(a => !/\bnoopener\b/.test(a.rel) && !/\bnoreferrer\b/.test(a.rel));
    const referrer = (document.querySelector('meta[name="referrer"]') || {}).content || '';
    const insecure = resources.filter(u => u.startsWith('http:') && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(u));
    const stored = (() => { try { return Object.keys(localStorage); } catch (e) { return null; } })();
    const hsts = h('strict-transport-security');
    const xfo = h('x-frame-options');
    const cspHeader = h('content-security-policy');

    return [
      { name: 'Encrypted connection (HTTPS)',
        status: location.protocol === 'https:' ? 'pass' : 'warn',
        result: location.protocol === 'https:' ? 'This page arrived over HTTPS.' : `This copy is served over ${location.protocol.replace(':', '')} (a local preview). The live site uses HTTPS.`,
        why: 'HTTPS stops anyone on the network (shared Wi-Fi, an ISP) from reading or changing the page in transit.',
        how: "location.protocol === 'https:'" },
      { name: 'HTTPS enforced for next time (HSTS)',
        status: hsts ? 'pass' : 'warn',
        result: hsts ? `Strict-Transport-Security: ${hsts}` : (head ? 'The server did not send a Strict-Transport-Security header.' : 'Could not read the response headers.'),
        why: 'HSTS tells the browser to refuse plain-HTTP versions of this site, which blocks downgrade attacks.',
        how: "(await fetch(location.href, { method: 'HEAD' })).headers.get('strict-transport-security')" },
      { name: 'Content-Security-Policy',
        status: scriptSrc && !/'unsafe-inline'|'unsafe-eval'/.test(scriptSrc) ? 'pass' : csp ? 'warn' : 'warn',
        result: !csp ? 'No policy found.' : `Scripts may only come from this site plus ${hashCount} exact inline script${hashCount === 1 ? '' : 's'} identified by hash. Inline style="" attributes are allowed (style-src-attr), a deliberate, lower-risk exception.`,
        why: 'If an attacker ever slipped a script into the page, the browser would refuse to run it. It is the main defence against cross-site scripting (XSS).',
        how: "document.querySelector('meta[http-equiv=content-security-policy]').content" },
      { name: 'Third-party requests',
        status: hosts.length ? 'warn' : 'pass',
        result: hosts.length ? `Loaded from other hosts: ${hosts.join(', ')}` : 'Zero. Fonts, icons and the animation library are bundled and served from this site.',
        why: 'Every outside host can see your visit (IP address, timing). Self-hosting everything means nobody else learns you were here.',
        how: "performance.getEntriesByType('resource').map(r => new URL(r.name).host)" },
      { name: 'Cookies',
        status: document.cookie ? 'warn' : 'pass',
        result: document.cookie ? 'Cookies are set on this page.' : 'None. No tracking, no analytics cookies, nothing to consent to.',
        why: 'Cookies can follow you around; this site does not need any.',
        how: 'document.cookie' },
      { name: 'Data kept in your browser',
        status: 'info',
        result: stored === null ? 'Browser storage is blocked here.' : stored.length ? `${stored.length} item${stored.length === 1 ? '' : 's'}, only on your device: ${stored.join(', ')}` : 'Nothing yet.',
        why: 'Only your own choices (theme, animations) and lab/CTF progress are remembered, locally. Nothing is sent anywhere.',
        how: 'Object.keys(localStorage)' },
      { name: 'Links that open new tabs',
        status: unsafeLinks.length ? 'warn' : 'pass',
        result: unsafeLinks.length ? `${unsafeLinks.length} of ${blankLinks.length} lack rel="noopener".` : `All ${blankLinks.length} use rel="noopener noreferrer".`,
        why: 'Without noopener, a page opened in a new tab can redirect this one (reverse tabnabbing).',
        how: "[...document.querySelectorAll('a[target=_blank]')].filter(a => !/noopener/.test(a.rel))" },
      { name: 'Referrer policy',
        status: referrer ? 'pass' : 'warn',
        result: referrer ? `${referrer}: other sites see only the domain, never the full address.` : 'Not set.',
        why: 'Limits what this page reveals to sites you click through to.',
        how: "document.querySelector('meta[name=referrer]').content" },
      { name: 'Mixed content',
        status: insecure.length ? 'warn' : 'pass',
        result: insecure.length ? `${insecure.length} resource(s) over plain HTTP.` : 'Every resource is loaded securely.',
        why: 'One insecure file is enough for an attacker to tamper with an otherwise secure page.',
        how: "performance.getEntriesByType('resource').filter(r => r.name.startsWith('http:'))" },
      { name: 'Clickjacking protection',
        status: xfo || (cspHeader && /frame-ancestors/.test(cspHeader)) ? 'pass' : 'warn',
        result: xfo ? `X-Frame-Options: ${xfo}` : 'Not available here: it needs an HTTP header (frame-ancestors or X-Frame-Options), and GitHub Pages does not let a static site set headers.',
        why: 'Stops other sites from loading this page invisibly inside a frame to trick clicks.',
        how: "headers.get('x-frame-options'); frame-ancestors is ignored in <meta> CSP" },
    ];
  }

  async function run() {
    sum.textContent = 'Running checks…';
    list.replaceChildren();
    const rows = await checks();
    const n = s => rows.filter(r => r.status === s).length;
    sum.textContent = `${n('pass')} pass · ${n('warn')} warn · ${n('info')} info`;
    list.append(...rows.map(r => el('li', { class: 'audit-row is-' + r.status },
      el('span', { class: 'audit-chip' }, r.status.toUpperCase()),
      el('div', { class: 'audit-txt' },
        el('p', { class: 'audit-name' }, r.name),
        el('p', { class: 'audit-res' }, r.result),
        el('details', null, el('summary', null, 'Why it matters · how it is checked'),
          el('p', null, r.why), el('pre', null, el('code', null, r.how)))))));
    return rows;
  }

  openBtn.addEventListener('click', () => { if (!dlg.open) dlg.showModal(); run(); });
  document.getElementById('auditClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => openBtn.focus());

  window.__audit = run;                                   /* test hook */
  window.TERM_CMDS = window.TERM_CMDS || {};
  window.TERM_CMDS.audit = {
    help: 'run the site security self-check',
    async run(args, io) {
      const rows = await checks();
      rows.forEach(r => io.print(`[${r.status.toUpperCase().padEnd(4)}] ${r.name}: ${r.result}`, r.status === 'pass' ? 't-ok' : r.status === 'warn' ? 't-err' : 't-dim'));
    },
  };
})();
