/* ══════════════════════════════════════════════════════════
   FEATURE 48 — SUBNET LAB (IPv4 calculator · bit grid · quiz)
   Unsigned 32-bit maths (>>> 0) with explicit /31 (RFC 3021)
   and /32 cases. Shareable via #subnet=a.b.c.d/p (replaceState,
   no page jump). window.__subnetSelfTest() checks the maths.
══════════════════════════════════════════════════════════ */
(function subnetLab() {
  const PD = window.PD || {};
  const motionOK = () => (typeof window.motionOK === 'function'
    ? !!window.motionOK()
    : !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches));

  /* tiny DOM builder: strings always become text nodes */
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

  /* ── 1. IPv4 maths (all values are unsigned 32-bit integers) ── */
  const toStr  = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  const toBin  = n => (n >>> 0).toString(2).padStart(32, '0');
  const dotted = b => b.match(/.{8}/g).join('.');
  const maskOf = p => (p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0);   /* << 32 is a no-op in JS, hence /0 */
  const fmtN   = n => n.toLocaleString('en-US');

  function parseAddr(s, what = 'address') {
    const parts = String(s).split('.');
    if (parts.length !== 4) return { error: `An IPv4 ${what} has exactly 4 octets separated by dots; this one has ${parts.length}.` };
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const t = parts[i];
      if (t === '') return { error: `Octet ${i + 1} of the ${what} is empty.` };
      if (!/^\d+$/.test(t)) return { error: `Octet ${i + 1} of the ${what} (“${t}”) is not a whole number.` };
      if (t.length > 1 && t[0] === '0') return { error: `Octet ${i + 1} of the ${what} (“${t}”) has a leading zero. Some tools read that as octal, so write it without the zero.` };
      const o = Number(t);
      if (o > 255) return { error: `Octet ${i + 1} of the ${what} (${t}) is out of range: each octet is 0 to 255.` };
      v = ((v << 8) | o) >>> 0;
    }
    return { value: v };
  }

  /* contiguous mask → prefix length, otherwise -1 */
  function prefixFromMask(m) {
    const w = (~m) >>> 0;
    if ((w & (w + 1)) !== 0) return -1;
    let p = 0;
    for (let b = 31; b >= 0 && ((m >>> b) & 1); b--) p++;
    return p;
  }

  /* "a.b.c.d/p", "a.b.c.d/m.m.m.m", "a.b.c.d m.m.m.m" or "a.b.c.d" (+ fallback prefix) */
  function parseCIDR(input, fallbackPrefix) {
    const s = String(input == null ? '' : input).trim();
    if (!s) return { error: 'Enter an IPv4 address, for example 192.168.10.77/26.' };
    if (s.includes(':')) return { error: 'That looks like an IPv6 address. This lab covers IPv4 only.' };
    let addrPart = s, pfxPart = null;
    if (s.includes('/')) {
      const bits = s.split('/');
      if (bits.length > 2) return { error: 'Use a single “/” between the address and the prefix.' };
      addrPart = bits[0].trim(); pfxPart = bits[1].trim();
      if (pfxPart === '') return { error: 'The prefix after “/” is empty. Use a number from 0 to 32.' };
    } else if (/\s/.test(s)) {
      const bits = s.split(/\s+/);
      if (bits.length > 2) return { error: 'Use “address/prefix” or “address mask”, for example 10.0.0.0 255.255.252.0.' };
      addrPart = bits[0]; pfxPart = bits[1];
    }
    const a = parseAddr(addrPart, 'address');
    if (a.error) return a;
    let prefix;
    if (pfxPart == null) {
      if (fallbackPrefix == null) return { error: 'Add a prefix length, for example /24.' };
      prefix = fallbackPrefix;
    } else if (/^\d+$/.test(pfxPart)) {
      prefix = Number(pfxPart);
      if (prefix > 32) return { error: `Prefix /${pfxPart} is out of range. Use /0 to /32.` };
    } else if (/^-\d+$/.test(pfxPart)) {
      return { error: `Prefix /${pfxPart} is out of range. Use /0 to /32.` };
    } else if (pfxPart.includes('.')) {
      const m = parseAddr(pfxPart, 'mask');
      if (m.error) return m;
      prefix = prefixFromMask(m.value);
      if (prefix < 0) return { error: `${pfxPart} is not a valid subnet mask: its 1-bits must be contiguous from the left.` };
    } else {
      return { error: `Prefix “${pfxPart}” must be a number from 0 to 32, or a dotted mask such as 255.255.255.0.` };
    }
    return { ip: a.value, prefix, hadPrefix: pfxPart != null };
  }

  /* special-use IPv4 blocks (most specific first where they overlap) */
  const SPECIAL = [
    ['255.255.255.255', 32, 'Limited broadcast', 'RFC 919'],
    ['0.0.0.0', 8, '“This network” (not routable)', 'RFC 1122'],
    ['10.0.0.0', 8, 'Private', 'RFC 1918'],
    ['100.64.0.0', 10, 'Shared address space (carrier-grade NAT)', 'RFC 6598'],
    ['127.0.0.0', 8, 'Loopback', 'RFC 1122'],
    ['169.254.0.0', 16, 'Link-local (APIPA)', 'RFC 3927'],
    ['172.16.0.0', 12, 'Private', 'RFC 1918'],
    ['192.0.2.0', 24, 'Documentation (TEST-NET-1)', 'RFC 5737'],
    ['192.0.0.0', 24, 'IETF protocol assignments', 'RFC 6890'],
    ['192.88.99.0', 24, 'Former 6to4 relay anycast (deprecated)', 'RFC 7526'],
    ['192.168.0.0', 16, 'Private', 'RFC 1918'],
    ['198.18.0.0', 15, 'Benchmarking', 'RFC 2544'],
    ['198.51.100.0', 24, 'Documentation (TEST-NET-2)', 'RFC 5737'],
    ['203.0.113.0', 24, 'Documentation (TEST-NET-3)', 'RFC 5737'],
    ['224.0.0.0', 4, 'Multicast', 'RFC 5771'],
    ['240.0.0.0', 4, 'Reserved for future use', 'RFC 1112']
  ].map(([a, p, label, rfc]) => ({ base: parseAddr(a).value, p, label, rfc, cidr: `${a}/${p}` }));

  function classOf(ip) {
    const a = ip >>> 24;
    return a < 128 ? 'A' : a < 192 ? 'B' : a < 224 ? 'C' : a < 240 ? 'D' : 'E';
  }
  function specialOf(ip) {
    return SPECIAL.find(s => ((ip & maskOf(s.p)) >>> 0) === s.base) || null;
  }

  function calc(ip, p) {
    ip = ip >>> 0;
    const mask = maskOf(p), wild = (~mask) >>> 0;
    const net = (ip & mask) >>> 0, top = (net | wild) >>> 0;
    const r = { ip, prefix: p, mask, wild, net, total: 2 ** (32 - p), cls: classOf(ip), special: specialOf(ip) };
    if (p === 32)      Object.assign(r, { bc: null, first: net, last: net, usable: 1 });
    else if (p === 31) Object.assign(r, { bc: null, first: net, last: top, usable: 2 });   /* RFC 3021 */
    else               Object.assign(r, { bc: top, first: (net + 1) >>> 0, last: (top - 1) >>> 0, usable: 2 ** (32 - p) - 2 });
    return r;
  }

  function typeNote(r) {
    const c = r.cls;
    const cls = c === 'D' ? 'Class D (multicast range)'
      : c === 'E' ? 'Class E (reserved range)'
      : `Class ${c} (historic classful label; routing today uses CIDR)`;
    const sp = r.special ? `${r.special.label}: ${r.special.cidr}, ${r.special.rfc}` : 'Public address (no special-use range matched)';
    let role = '';
    if (r.prefix === 32) role = 'A /32 is a single-host route: network, first and last host are the same address.';
    else if (r.prefix === 31) role = 'A /31 is a point-to-point link: both addresses are usable and there is no broadcast (RFC 3021).';
    else if (r.ip === r.net) role = `${toStr(r.ip)} is the network address itself, so it cannot be assigned to a host.`;
    else if (r.ip === r.bc) role = `${toStr(r.ip)} is this subnet’s broadcast address, so it cannot be assigned to a host.`;
    return { cls, sp, role };
  }

  /* worked solution, "block size" method, for prefixes /1–/30 */
  function explain(r) {
    const p = r.prefix, steps = [];
    steps.push(`/${p} means ${p} network bits and ${32 - p} host bits, so the mask is ${toStr(r.mask)}.`);
    if (p % 8 === 0) {
      const k = p / 8;
      steps.push(`/${p} ends exactly on an octet boundary: keep the first ${k} octet${k === 1 ? '' : 's'} of ${toStr(r.ip)}.`);
      steps.push(`Network: set the remaining octets to 0, giving ${toStr(r.net)}. Broadcast: set them to 255, giving ${toStr(r.bc)}.`);
    } else {
      const k = Math.floor(p / 8), sh = 24 - 8 * k;
      const mOct = (r.mask >>> sh) & 255, block = 256 - mOct;
      const aOct = (r.ip >>> sh) & 255, q = Math.floor(aOct / block), nOct = q * block;
      const ord = ['first', 'second', 'third', 'fourth'][k];
      const starts = [];
      for (let s = 0; s < 256 && starts.length < 3; s += block) starts.push(s);
      const startList = starts.join(', ') + (3 * block < 256 ? ', …' : '.');
      steps.push(`The interesting octet is the ${ord} one (mask value ${mOct}). Block size = 256 − ${mOct} = ${block}, so subnets in that octet start at ${startList}`);
      steps.push(`${aOct} ÷ ${block} = ${q} remainder ${aOct % block}, so the address sits in the block that starts at ${nOct}. Octets to the left stay, octets to the right become 0: network ${toStr(r.net)}.`);
      const next = nOct + block === 256 ? 'the end of the octet' : `the next block at ${nOct + block}`;
      steps.push(`The broadcast is the last address before ${next}: ${toStr(r.bc)}.`);
    }
    steps.push(`Usable hosts = 2^${32 - p} − 2 = ${fmtN(r.total)} − 2 = ${fmtN(r.usable)} (the network and broadcast addresses are reserved).`);
    return steps;
  }

  /* ── 2. quiz generator (crypto.getRandomValues, rejection-sampled) ── */
  const cryptoObj = window.crypto || null;
  function rand32() {
    const b = new Uint32Array(1);
    if (cryptoObj && cryptoObj.getRandomValues) cryptoObj.getRandomValues(b);
    else b[0] = Math.floor(Math.random() * 0x100000000);
    return b[0];
  }
  function randInt(n) {
    const lim = Math.floor(0x100000000 / n) * n;
    let x;
    do { x = rand32(); } while (x >= lim);
    return x % n;
  }
  const POOLS = [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16]].map(([a, p]) => ({ base: parseAddr(a).value, p }));
  function newQuestion() {
    for (let guard = 0; guard < 50; guard++) {
      const pool = POOLS[randInt(POOLS.length)];
      const minP = Math.max(pool.p, 8);
      const p = randInt(4) === 0 && minP < 20 ? minP + randInt(20 - minP) : 20 + randInt(11);   /* mostly /20–/30 */
      const ip = (pool.base | (rand32() & ~maskOf(pool.p))) >>> 0;
      const r = calc(ip, p);
      if (r.ip !== r.net && r.ip !== r.bc) return r;
    }
    return calc(parseAddr('192.168.10.77').value, 26);
  }
  function answerIP(s) {
    const t = String(s || '').trim().replace(/\s*\/\s*\d+$/, '');
    const r = parseAddr(t);
    return r.error ? null : r.value;
  }
  function answerInt(s) {
    const t = String(s || '').replace(/[\s,_]/g, '');
    return /^\d+$/.test(t) ? Number(t) : null;
  }

  /* ── 3. self-test (window.__subnetSelfTest) ── */
  function selfTest() {
    const failures = []; let pass = 0;
    const check = (name, got, want) => { if (got === want) pass++; else failures.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
    const good = [
      ['0.0.0.0/0',            { prefix: 0, net: '0.0.0.0', bc: '255.255.255.255', first: '0.0.0.1', last: '255.255.255.254', usable: 4294967294, total: 4294967296, mask: '0.0.0.0', wild: '255.255.255.255' }],
      ['203.0.113.9/0',        { net: '0.0.0.0', bc: '255.255.255.255', usable: 4294967294 }],
      ['10.20.30.40/8',        { net: '10.0.0.0', bc: '10.255.255.255', first: '10.0.0.1', last: '10.255.255.254', usable: 16777214, total: 16777216, mask: '255.0.0.0', wild: '0.255.255.255' }],
      ['192.168.1.130/24',     { net: '192.168.1.0', bc: '192.168.1.255', first: '192.168.1.1', last: '192.168.1.254', usable: 254, total: 256, mask: '255.255.255.0', wild: '0.0.0.255' }],
      ['192.168.10.77/26',     { net: '192.168.10.64', bc: '192.168.10.127', first: '192.168.10.65', last: '192.168.10.126', usable: 62, total: 64, mask: '255.255.255.192', wild: '0.0.0.63' }],
      ['172.16.5.6/30',        { net: '172.16.5.4', bc: '172.16.5.7', first: '172.16.5.5', last: '172.16.5.6', usable: 2, total: 4, mask: '255.255.255.252', wild: '0.0.0.3' }],
      ['10.0.0.1/31',          { net: '10.0.0.0', bc: null, first: '10.0.0.0', last: '10.0.0.1', usable: 2, total: 2, mask: '255.255.255.254', wild: '0.0.0.1' }],
      ['8.8.8.8/32',           { net: '8.8.8.8', bc: null, first: '8.8.8.8', last: '8.8.8.8', usable: 1, total: 1, mask: '255.255.255.255', wild: '0.0.0.0' }],
      ['255.255.255.255/32',   { net: '255.255.255.255', bc: null, first: '255.255.255.255', usable: 1 }],
      ['200.1.2.3/1',          { net: '128.0.0.0', bc: '255.255.255.255', mask: '128.0.0.0', usable: 2147483646 }],
      ['172.23.145.201/21',    { net: '172.23.144.0', bc: '172.23.151.255', usable: 2046, mask: '255.255.248.0' }],
      ['10.0.0.0/255.255.252.0', { prefix: 22, net: '10.0.0.0', bc: '10.0.3.255', usable: 1022 }],
      [' 192.168.0.1 255.255.255.0 ', { prefix: 24, net: '192.168.0.0', bc: '192.168.0.255' }],
      ['10.1.1.1/08',          { prefix: 8, net: '10.0.0.0' }]
    ];
    good.forEach(([inp, exp]) => {
      const p = parseCIDR(inp);
      if (p.error) { failures.push(`${JSON.stringify(inp)}: unexpected error “${p.error}”`); return; }
      const r = calc(p.ip, p.prefix);
      const view = { prefix: r.prefix, net: toStr(r.net), bc: r.bc == null ? null : toStr(r.bc), first: toStr(r.first), last: toStr(r.last), usable: r.usable, total: r.total, mask: toStr(r.mask), wild: toStr(r.wild) };
      Object.keys(exp).forEach(k => check(`${inp.trim()} ${k}`, view[k], exp[k]));
    });
    const bad = ['', '   ', '1.2.3', '1.2.3.4.5', '256.1.1.1', '1.2.3.4/33', '1.2.3.4/-1', 'a.b.c.d', '01.2.3.4', '1..2.3',
      '1.2.3.4/', '1.2.3.4/24/1', '10.0.0.0/255.0.255.0', '10.0.0.0/255.255.256.0', '::1', '1.2.3.4/2x', '1.2.3.4', '1.2.3.4 255.255.255.0 x'];
    bad.forEach(inp => { const p = parseCIDR(inp); if (p.error) pass++; else failures.push(`${JSON.stringify(inp)}: accepted but should be rejected`); });
    check('fallback prefix', parseCIDR('10.0.0.5', 30).prefix, 30);
    const ip = s => parseAddr(s).value;
    check('class 10.1.1.1', classOf(ip('10.1.1.1')), 'A');
    check('class 172.16.0.1', classOf(ip('172.16.0.1')), 'B');
    check('class 192.168.0.1', classOf(ip('192.168.0.1')), 'C');
    check('class 224.0.0.5', classOf(ip('224.0.0.5')), 'D');
    check('class 250.0.0.1', classOf(ip('250.0.0.1')), 'E');
    check('special 10.9.8.7', (specialOf(ip('10.9.8.7')) || {}).cidr, '10.0.0.0/8');
    check('special 172.31.255.1', (specialOf(ip('172.31.255.1')) || {}).cidr, '172.16.0.0/12');
    check('not special 172.32.0.1', specialOf(ip('172.32.0.1')), null);
    check('special 169.254.1.1', (specialOf(ip('169.254.1.1')) || {}).label, 'Link-local (APIPA)');
    check('special 127.0.0.1', (specialOf(ip('127.0.0.1')) || {}).label, 'Loopback');
    check('special 100.100.0.1', (specialOf(ip('100.100.0.1')) || {}).rfc, 'RFC 6598');
    check('not special 8.8.8.8', specialOf(ip('8.8.8.8')), null);
    check('binary 192.168.10.77', dotted(toBin(ip('192.168.10.77'))), '11000000.10101000.00001010.01001101');
    const ex = explain(calc(ip('172.23.145.201'), 21)).join(' ');
    check('explain /21 block size', ex.includes('Block size = 256 − 248 = 8'), true);
    check('explain /21 network', ex.includes('network 172.23.144.0'), true);
    check('explain /21 broadcast', ex.includes('172.23.151.255'), true);
    const ex24 = explain(calc(ip('192.168.1.130'), 24)).join(' ');
    check('explain /24 boundary', ex24.includes('octet boundary') && ex24.includes('192.168.1.255'), true);
    let genOK = true;
    for (let i = 0; i < 300; i++) {
      const q = newQuestion();
      if (q.prefix < 8 || q.prefix > 30 || q.ip === q.net || q.ip === q.bc || !q.special || q.special.label !== 'Private') { genOK = false; failures.push(`quiz generator produced ${toStr(q.ip)}/${q.prefix}`); break; }
    }
    if (genOK) pass++;
    check('answer with prefix', answerIP(' 172.23.144.0/21 '), ip('172.23.144.0'));
    check('answer hosts with comma', answerInt('2,046'), 2046);
    return { ok: failures.length === 0, pass, fail: failures.length, failures };
  }
  window.__subnetSelfTest = selfTest;

  /* ── 4. UI ── */
  const root = document.getElementById('subnetLab');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const input = $('cidrIn'), range = $('prefixRange'), pfxOut = $('prefixOut'), errEl = $('cidrErr');
  const results = $('snResults'), bitsWrap = $('snBits'), form = $('snForm');
  if (!input || !range || !results || !bitsWrap) return;
  const dd = { net: $('snNet'), bc: $('snBc'), first: $('snFirst'), last: $('snLast'), usable: $('snUsable'),
    total: $('snTotal'), mask: $('snMask'), wild: $('snWild'), bin: $('snBin'), type: $('snType') };
  const legNet = $('snLegNet'), legHost = $('snLegHost');

  /* 32 bit cells in 4 octets */
  const cells = [], octVals = [], octMasks = [];
  bitsWrap.replaceChildren();
  for (let o = 0; o < 4; o++) {
    const row = el('div', { class: 'sn-oct-bits' });
    for (let b = 0; b < 8; b++) { const c = el('span', { class: 'sn-bit' }, '0'); cells.push(c); row.append(c); }
    const v = el('span', { class: 'sn-oct-val' }), m = el('span', { class: 'sn-oct-mask' });
    octVals.push(v); octMasks.push(m);
    bitsWrap.append(el('div', { class: 'sn-oct' }, v, row, m));
  }
  bitsWrap.addEventListener('animationend', e => { e.target.classList.remove('flip'); e.target.style.animationDelay = ''; });

  const setText = (node, v) => { if (node && node.textContent !== v) node.textContent = v; };
  function binRow(label, n, p) {
    const s = dotted(toBin(n));
    const cut = p === 0 ? 0 : p + Math.floor((p - 1) / 8);
    return el('span', { class: 'sn-binrow' },
      el('span', { class: 'sn-binlab' }, label), ' ',
      el('code', { class: 'sn-bincode' }, el('span', { class: 'n' }, s.slice(0, cut)), s.slice(cut)), ' ',
      el('span', { class: 'sn-bindec' }, toStr(n)));
  }

  let cur = null;
  function render(r, animate) {
    const bin = toBin(r.ip), canFlip = animate && motionOK();
    cells.forEach((c, i) => {
      const v = bin[i];
      if (c.textContent !== v) {
        c.textContent = v;
        if (canFlip) { c.classList.remove('flip'); void c.offsetWidth; c.style.animationDelay = (i % 8) * 14 + 'ms'; c.classList.add('flip'); }
      }
      const isNet = i < r.prefix;
      c.classList.toggle('is-net', isNet);
      c.classList.toggle('is-host', !isNet);
      c.classList.toggle('is-edge', i === r.prefix - 1 && r.prefix < 32);
    });
    for (let o = 0; o < 4; o++) {
      setText(octVals[o], String((r.ip >>> (24 - 8 * o)) & 255));
      setText(octMasks[o], String((r.mask >>> (24 - 8 * o)) & 255));
    }
    setText(legNet, `${r.prefix} network bit${r.prefix === 1 ? '' : 's'}`);
    setText(legHost, `${32 - r.prefix} host bit${32 - r.prefix === 1 ? '' : 's'}`);

    range.value = String(r.prefix);
    range.style.setProperty('--p', r.prefix);
    range.setAttribute('aria-valuetext', `/${r.prefix}: ${r.prefix} network bits, ${32 - r.prefix} host bits`);
    setText(pfxOut, '/' + r.prefix);

    setText(dd.net, `${toStr(r.net)}/${r.prefix}`);
    setText(dd.bc, r.bc == null ? (r.prefix === 31 ? 'None: /31 point-to-point (RFC 3021)' : 'None: single host (/32)') : toStr(r.bc));
    setText(dd.first, toStr(r.first));
    setText(dd.last, toStr(r.last));
    setText(dd.usable, fmtN(r.usable));
    setText(dd.total, `${fmtN(r.total)} (2^${32 - r.prefix})`);
    setText(dd.mask, toStr(r.mask));
    setText(dd.wild, toStr(r.wild));
    const binKey = `${r.ip}/${r.prefix}`;
    if (dd.bin && dd.bin.dataset.key !== binKey) {
      dd.bin.dataset.key = binKey;
      dd.bin.replaceChildren(binRow('address', r.ip, r.prefix), binRow('AND mask', r.mask, r.prefix), binRow('= network', r.net, r.prefix));
    }
    const t = typeNote(r), typeKey = [t.cls, t.sp, t.role].join('|');
    if (dd.type && dd.type.dataset.key !== typeKey) {
      dd.type.dataset.key = typeKey;
      const parts = [el('span', { class: 'sn-tline' }, t.cls), ' ', el('span', { class: 'sn-tline' }, t.sp)];
      if (t.role) parts.push(' ', el('span', { class: 'sn-tline sn-trole' }, t.role));
      dd.type.replaceChildren(...parts);
    }
    cur = r;
  }

  /* errors: shown after a short pause while typing, at once on Enter / blur */
  let errTimer = 0, pending = null;
  function showError(msg) {
    errEl.textContent = msg;
    input.setAttribute('aria-invalid', 'true');
    results.classList.add('is-stale');
  }
  function clearError() {
    clearTimeout(errTimer); pending = null;
    if (errEl.textContent) errEl.textContent = '';
    input.removeAttribute('aria-invalid');
    results.classList.remove('is-stale');
  }

  /* share: #subnet=a.b.c.d/p via replaceState (never adds history, never jumps) */
  const HASH_RE = /^#subnet=(.+)$/;
  let hashTimer = 0;
  const shareHash = () => `#subnet=${toStr(cur.ip)}/${cur.prefix}`;
  function syncHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      const h = location.hash;
      if (h && !HASH_RE.test(h) && h !== '#lab') return;   /* never clobber another feature's hash */
      const next = shareHash();
      if (h !== next) { try { history.replaceState(history.state, '', next); } catch (e) { /* sandboxed */ } }
    }, 350);
  }
  function readHash() {
    const m = HASH_RE.exec(location.hash);
    if (!m) return null;
    let raw;
    try { raw = decodeURIComponent(m[1]); } catch (e) { raw = m[1]; }
    const r = parseCIDR(raw);
    return r.error ? { error: r.error, raw } : r;
  }

  function apply(parsed, opts = {}) {
    render(calc(parsed.ip, parsed.prefix), opts.animate !== false);
    clearError();
    if (opts.syncInput) input.value = `${toStr(parsed.ip)}/${parsed.prefix}`;
    if (opts.user !== false) syncHash();
  }

  input.addEventListener('input', () => {
    const r = parseCIDR(input.value, cur ? cur.prefix : 24);
    if (r.error) {
      pending = r.error;
      results.classList.add('is-stale');
      clearTimeout(errTimer);
      errTimer = setTimeout(() => { if (pending) showError(pending); }, 800);
    } else {
      apply(r);
    }
  });
  input.addEventListener('blur', () => { if (pending) showError(pending); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const r = parseCIDR(input.value, cur ? cur.prefix : 24);
    if (r.error) { showError(r.error); return; }
    apply(r, { syncInput: true });
  });

  let busyTimer = 0;
  range.addEventListener('input', () => {
    results.setAttribute('aria-busy', 'true');       /* let screen readers read the settled result, not every step */
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => results.removeAttribute('aria-busy'), 450);
    apply({ ip: cur ? cur.ip : parseAddr('192.168.10.77').value, prefix: Number(range.value) }, { syncInput: true });
  });

  /* copy share link */
  const copyBtn = $('snCopy'), statusEl = $('snStatus');
  let statusTimer = 0;
  function say(msg) {
    statusEl.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { statusEl.textContent = ''; }, 6000);
  }
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    if (!cur) return;
    const url = location.href.split('#')[0] + shareHash();
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; }
    catch (e) {
      try {
        const ta = el('textarea', { readonly: true, 'aria-hidden': 'true', style: 'position:fixed;top:0;left:-9999px;opacity:0' });
        ta.value = url; document.body.append(ta); ta.select();
        ok = document.execCommand('copy'); ta.remove();
      } catch (e2) { ok = false; }
    }
    syncHash();
    say(ok ? `Link copied: ${url}` : `Copy is blocked here. Link: ${url}`);
  });

  /* quiz */
  const quizBtn = $('snQuizBtn'), quiz = $('snQuiz'), qText = $('snQText'), qForm = $('snQForm'),
    qNet = $('snQNet'), qBc = $('snQBc'), qHosts = $('snQHosts'), qResult = $('snQResult'),
    qNew = $('snQNew'), qShow = $('snQShow');
  const fbOf = inp => $(inp.id + 'Fb');
  let q = null, checked = false;
  const score = { full: 0, asked: 0 };
  function newQ() {
    q = newQuestion(); checked = false;
    qText.textContent = `${toStr(q.ip)}/${q.prefix}`;
    [qNet, qBc, qHosts].forEach(i => { i.value = ''; i.removeAttribute('aria-invalid'); const f = fbOf(i); f.className = 'sn-fb'; f.textContent = ''; });
    qResult.replaceChildren();
    qShow.hidden = true;
  }
  function feedback(inp, ok, answer, empty) {
    const f = fbOf(inp);
    inp.setAttribute('aria-invalid', ok ? 'false' : 'true');
    f.className = 'sn-fb ' + (ok ? 'is-ok' : 'is-bad');
    f.replaceChildren(el('i', { class: 'fa-solid ' + (ok ? 'fa-check' : 'fa-xmark'), 'aria-hidden': 'true' }),
      ok ? ' Correct' : (empty ? ` Answer: ${answer}` : ` Not quite. Answer: ${answer}`));
  }
  if (quizBtn && quiz && qForm) {
    quizBtn.addEventListener('click', () => {
      const opening = quiz.hidden;
      quiz.hidden = !opening;
      quizBtn.setAttribute('aria-expanded', String(opening));
      if (opening) {
        if (!q) newQ();
        qNet.focus({ preventScroll: true });
        quiz.scrollIntoView({ block: 'nearest', behavior: motionOK() ? 'smooth' : 'instant' });
      }
    });
    qNew.addEventListener('click', () => { newQ(); qNet.focus(); });
    qForm.addEventListener('submit', e => {
      e.preventDefault();
      if (!q) newQ();
      const okNet = answerIP(qNet.value) === q.net;
      const okBc = answerIP(qBc.value) === q.bc;
      const okHosts = answerInt(qHosts.value) === q.usable;
      feedback(qNet, okNet, toStr(q.net), !qNet.value.trim());
      feedback(qBc, okBc, toStr(q.bc), !qBc.value.trim());
      feedback(qHosts, okHosts, fmtN(q.usable), !qHosts.value.trim());
      const n = okNet + okBc + okHosts;
      if (!checked) { checked = true; score.asked++; if (n === 3) score.full++; }
      qResult.replaceChildren(
        el('p', { class: 'sn-qscore' }, n === 3 ? '3 of 3 correct. Nicely done.' : `${n} of 3 correct. Here is the working:`),
        el('ol', { class: 'sn-steps' }, explain(q).map(s => el('li', null, s))),
        el('p', { class: 'sn-session' }, `This session: ${score.full} of ${score.asked} question${score.asked === 1 ? '' : 's'} fully correct.`));
      qShow.hidden = false;
    });
    qShow.addEventListener('click', () => {
      if (!q) return;
      apply({ ip: q.ip, prefix: q.prefix }, { syncInput: true });
      root.querySelector('.sn-bitsbox').scrollIntoView({ block: 'center', behavior: motionOK() ? 'smooth' : 'instant' });
      input.focus({ preventScroll: true });
    });
  }

  /* owner's own Python version: renders ONLY when PD.ipcalc has content (hidden-slot rule) */
  (function pythonVersion() {
    const ic = (PD && PD.ipcalc) || {};
    const code = typeof ic.code === 'string' ? ic.code.replace(/\s+$/, '') : '';
    let repo = '';
    try { const u = new URL(String(ic.repo || '').trim()); if (u.protocol === 'https:') repo = u.href; } catch (e) { repo = ''; }
    if (!code && !repo) return;
    root.append(el('details', { class: 'sn-py' },
      el('summary', null, el('i', { class: 'fa-brands fa-python', 'aria-hidden': 'true' }), 'My Python version'),
      repo ? el('p', { class: 'sn-py-link' },
        el('a', { href: repo, target: '_blank', rel: 'noopener noreferrer' }, el('i', { class: 'fa-brands fa-github', 'aria-hidden': 'true' }), ' View the repository on GitHub')) : null,
      code ? el('pre', { class: 'sn-py-code', tabindex: '0', 'aria-label': 'Python source code' }, el('code', null, code)) : null));
  })();

  /* motion switched off mid-flip: settle instantly */
  document.addEventListener('motionchange', e => {
    if (!(e.detail && e.detail.on)) cells.forEach(c => { c.classList.remove('flip'); c.style.animationDelay = ''; });
  });

  /* initial state: #subnet=… wins over the default value */
  function revealCard() {
    const go = () => root.scrollIntoView({ block: 'start', behavior: motionOK() ? 'smooth' : 'instant' });
    if (document.readyState === 'complete') setTimeout(go, 250);
    else window.addEventListener('load', () => setTimeout(go, 250), { once: true });
  }
  const fromHash = readHash();
  const initial = parseCIDR(input.value, 26);
  if (fromHash && !fromHash.error) {
    apply(fromHash, { syncInput: true, animate: false, user: false });
    revealCard();
  } else {
    render(calc(initial.error ? parseAddr('192.168.10.77').value : initial.ip, initial.error ? 26 : initial.prefix), false);
    if (fromHash && fromHash.error) { input.value = fromHash.raw; showError(fromHash.error); revealCard(); }
  }
  window.addEventListener('hashchange', () => {
    const h = readHash();
    if (!h) return;
    if (h.error) { input.value = h.raw; showError(h.error); }
    else apply(h, { syncInput: true, user: false });
    revealCard();
  });
})();
