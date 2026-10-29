/* ══════════════════════════════════════════════════════════
   FEATURE 53 — RECRUITER CTF (3 hidden flags)
   Flag 1: base64 in an HTML comment (view-source, CtfComment.astro)
   Flag 2: ROT13 from hire() in the browser console, or `hire` in the terminal
   Flag 3: a comment in /robots.txt (public/robots.txt)
   Answers are checked against SHA-256 hashes, so the flags themselves
   never appear in this file. Progress is kept in localStorage (optional).
══════════════════════════════════════════════════════════ */
(function ctf() {
  const HASHES = [
    '9220ddf4beb5f5b4e62f4fd77db0ff2af96760061ed1c7494dc85dc82ea87f26',
    'd38168ff076dffc1f1d371f44255ff9e7f6d36ce60d4d0e76de77840f836f702',
    '49b8063fabd4c945521f2dea4b5ceaf748d5566ee5921b768b1546c2d8e3c186',
  ];
  const CODE = 'CTF-0D0D9D';                         // shown once all three are found
  const FLAG2_ROT13 = 'ERAFB{p0af0y3_y0tt3q_np25rnq7}';
  const KEY = 'renso.ctf.v1';
  const PD = window.PD || {};
  const person = PD.person || {};
  const links = person.links || {};
  const email = person.email || '';

  /* ── flag 2: the console (and the terminal on phones) ── */
  const card = () => [
    `${person.name || 'Renso Anthony L. Casalme'} · ${person.program || 'BS Information Technology'}, ${person.school || 'De La Salle Lipa'} (${person.gradYear || 2027})`,
    email ? `Email:    ${email}` : '',
    links.github ? `GitHub:   ${links.github}` : '',
    links.linkedin ? `LinkedIn: ${links.linkedin}` : '',
    '',
    `CTF flag 2 of 3 (ROT13): ${FLAG2_ROT13}`,
  ].filter((l, i, a) => l || (i > 0 && a[i - 1]));
  window.hire = () => {
    console.log(card().join('\n'));
    return 'Thanks for stopping by. Decode the ROT13 line and submit it in the footer.';
  };
  console.log('%cRecruiter? Type hire()', 'font:700 14px/1.6 monospace;color:#e0484f;background:#0c0a0b;padding:4px 10px;border-radius:4px');
  window.TERM_CMDS = window.TERM_CMDS || {};
  window.TERM_CMDS.hire = { help: 'for recruiters', hidden: true, run(args, io) { card().forEach(l => io.print(l)); } };

  /* ── the footer panel ── */
  const form = document.getElementById('ctfForm');
  if (!form) return;
  const input = document.getElementById('ctfIn');
  const msg = document.getElementById('ctfMsg');
  const count = document.getElementById('ctfCount');
  const prog = document.getElementById('ctfProg');
  const hints = document.querySelectorAll('#ctfHints li');
  const win = document.getElementById('ctfWin');
  const el = window.el || ((tag, attrs, ...kids) => { const n = document.createElement(tag); Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v)); n.append(...kids); return n; });

  let found = [];
  try { found = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { found = []; }
  found = Array.isArray(found) ? found.filter(n => [0, 1, 2].includes(n)) : [];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(found)); } catch (e) { /* storage blocked: progress lasts this visit only */ } };

  function render() {
    count.textContent = `${found.length}/3`;
    prog.value = found.length;
    hints.forEach((li, i) => li.classList.toggle('is-found', found.includes(i)));
    if (found.length < 3) { win.hidden = true; return; }
    const subject = encodeURIComponent(`CTF solved: ${CODE}`);
    win.replaceChildren(
      el('p', { class: 'ctf-win-t' }, 'All 3 flags found. You think like an analyst.'),
      el('p', null, 'Your code is ', el('b', null, CODE), '. Send it to Renso and say hello:'),
      email ? el('p', null, el('span', { class: 'ctf-email' }, email), ' ',
        el('a', { href: `mailto:${email}?subject=${subject}`, class: 'ctf-mail' }, 'Write an email')) : null);
    win.hidden = false;
  }

  async function sha256(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = input.value.trim();
    if (!/^RENSO\{[^{}\s]+\}$/.test(v)) { msg.textContent = 'Flags look like RENSO{…}.'; return; }
    if (!(window.crypto && crypto.subtle)) { msg.textContent = 'This browser cannot check flags here; it works on the live (HTTPS) site.'; return; }
    const i = HASHES.indexOf(await sha256(v));
    if (i < 0) { msg.textContent = 'Not a flag (yet). Keep looking.'; return; }
    if (found.includes(i)) { msg.textContent = `Flag ${i + 1} was already found.`; return; }
    found.push(i); found.sort(); save();
    msg.textContent = found.length === 3 ? 'Flag found: that was the last one!' : `Flag ${i + 1} found. ${3 - found.length} to go.`;
    input.value = '';
    render();
    if (typeof window.showToast === 'function') window.showToast(found.length === 3 ? 'CTF complete' : `Flag ${i + 1} of 3 found`, 'success');
  });
  render();
})();
