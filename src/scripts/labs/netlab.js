/* ══════════════════════════════════════════════════════════
   FEATURE 49 — BREAK/FIX NETWORK LAB (#netLab)
   Five-device IPv4 simulator: Visitor PC → SW1 → R1 → R2 →
   Resume Server. One fault per load (crypto.getRandomValues);
   visitors inspect devices, change their config in real forms
   and ping until resume.lab answers.
   Engine: unsigned 32-bit math, ARP next-hop resolution (routers
   ignore ARP from senders outside the interface subnet),
   longest-prefix routing with recursive static next hops,
   ordered extended ACLs with implicit deny (router-generated
   packets skip outbound ACLs), TTL per router hop, and a real
   return path for replies and ICMP errors.
   window.__netlabSelfTest() runs every fault broken → fixed.
   Owner slots (render nothing while empty): PD.resume.pdf,
   PD.netlab.hint, PD.netlab.explore.
══════════════════════════════════════════════════════════ */
(function netLab() {
  'use strict';
  const PD = window.PD || {};
  const motionOK = window.motionOK || (() => !matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ── 1 · IPv4 math (unsigned 32-bit) ───────────────────── */
  const ip2n = s => {
    const p = String(s == null ? '' : s).trim().split('.');
    if (p.length !== 4) return NaN;
    let n = 0;
    for (const o of p) {
      if (!/^(0|[1-9]\d{0,2})$/.test(o) || +o > 255) return NaN;
      n = n * 256 + Number(o);
    }
    return n >>> 0;
  };
  const n2ip = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  const isIp = n => typeof n === 'number' && n === n;
  const inv = m => (~m) >>> 0;
  const maskOk = m => isIp(m) && ((inv(m) & (inv(m) + 1)) >>> 0) === 0;
  const bits = m => { let c = 0; for (let x = m >>> 0; x; x >>>= 1) c += x & 1; return c; };
  const lenMask = l => (l <= 0 ? 0 : l >= 32 ? 0xFFFFFFFF : (0xFFFFFFFF << (32 - l)) >>> 0);
  const netOf = (a, m) => (a & m) >>> 0;
  const sameNet = (a, b, m) => netOf(a, m) === netOf(b, m);
  const bcastOf = (a, m) => (netOf(a, m) | inv(m)) >>> 0;
  const cidr = (a, m) => n2ip(netOf(a, m)) + '/' + bits(m);
  const fIp = f => ip2n(f.ip);
  const fMask = f => ip2n(f.mask);
  const fOk = f => isIp(fIp(f)) && maskOk(fMask(f)) && fMask(f) !== 0;
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ── 2 · Lab topology + fault scenarios ─────────────────── */
  const NAME = 'resume.lab';
  const ACL = 'LAN-PROTECT';
  const ORDER = ['PC', 'SW1', 'R1', 'R2', 'SRV'];
  const SEGS = { LAN1: ['PC', 'R1'], WAN: ['R1', 'R2'], LAN2: ['R2', 'SRV'] };
  const WIRES = [['PC', 'SW1'], ['SW1', 'R1'], ['R1', 'R2'], ['R2', 'SRV']];
  const via = (a, b) => ((a === 'PC' && b === 'R1') || (a === 'R1' && b === 'PC')) ? [a, 'SW1', b] : [a, b];

  function baseline() {
    return {
      PC: { id: 'PC', kind: 'host', name: 'Visitor PC', ttl0: 128, prompt: 'C:\\Users\\visitor>',
        ifaces: [{ id: 'e0', name: 'Ethernet0', short: 'Ethernet0', ip: '192.168.1.10', mask: '255.255.255.0', seg: 'LAN1' }],
        gw: '192.168.1.1', hosts: { [NAME]: '10.0.0.20' } },
      SW1: { id: 'SW1', kind: 'switch', name: 'SW1', ifaces: [] },
      R1: { id: 'R1', kind: 'router', name: 'R1', ttl0: 255,
        ifaces: [
          { id: 'g0', name: 'GigabitEthernet0/0', short: 'G0/0', desc: 'LAN via SW1', ip: '192.168.1.1', mask: '255.255.255.0', seg: 'LAN1', aclIn: '', aclOut: ACL },
          { id: 'g1', name: 'GigabitEthernet0/1', short: 'G0/1', desc: 'Link to R2', ip: '10.1.1.1', mask: '255.255.255.252', seg: 'WAN', aclIn: '', aclOut: '' }],
        routes: [{ net: '10.0.0.0', mask: '255.255.255.0', nh: '10.1.1.2' }],
        acls: { [ACL]: [
          { seq: 10, action: 'deny', proto: 'icmp', src: 'any', dst: '192.168.1.0 0.0.0.255', icmp: 'echo', log: true },
          { seq: 20, action: 'permit', proto: 'ip', src: 'any', dst: 'any', icmp: '', log: false }] } },
      R2: { id: 'R2', kind: 'router', name: 'R2', ttl0: 255,
        ifaces: [
          { id: 'g0', name: 'GigabitEthernet0/0', short: 'G0/0', desc: 'Link to R1', ip: '10.1.1.2', mask: '255.255.255.252', seg: 'WAN', aclIn: '', aclOut: '' },
          { id: 'g1', name: 'GigabitEthernet0/1', short: 'G0/1', desc: 'Server LAN', ip: '10.0.0.1', mask: '255.255.255.0', seg: 'LAN2', aclIn: '', aclOut: '' }],
        routes: [{ net: '192.168.1.0', mask: '255.255.255.0', nh: '10.1.1.1' }],
        acls: {} },
      SRV: { id: 'SRV', kind: 'host', name: 'Resume Server', ttl0: 128, prompt: 'C:\\Users\\Administrator>',
        ifaces: [{ id: 'e0', name: 'Ethernet0', short: 'Ethernet0', ip: '10.0.0.20', mask: '255.255.255.0', seg: 'LAN2' }],
        gw: '10.0.0.1' }
    };
  }

  const FAULTS = [
    { id: 'pc-gateway', label: 'Wrong default gateway on the Visitor PC',
      apply: S => { S.PC.gw = '192.168.1.254'; }, fix: S => { S.PC.gw = '192.168.1.1'; },
      expect: { failAt: 'PC', line: 'Reply from 192.168.1.10: Destination host unreachable.' },
      what: 'The Visitor PC’s default gateway was 192.168.1.254, an address nobody on the LAN owns. Its ARP request for the gateway went unanswered, so Windows reported “Destination host unreachable” from the PC’s own IP. The gateway has to be R1’s G0/0 address, 192.168.1.1.',
      check: 'ipconfig on the PC, then ping 192.168.1.1 and arp -a to see whether the gateway answers.' },
    { id: 'r2-mask', label: 'Subnet mask mismatch on R2',
      apply: S => { S.R2.ifaces[1].mask = '255.255.255.240'; }, fix: S => { S.R2.ifaces[1].mask = '255.255.255.0'; },
      expect: { failAt: 'R2', line: 'Reply from 10.1.1.2: Destination host unreachable.' },
      what: 'R2’s G0/1 had mask 255.255.255.240 (/28), so its connected network was 10.0.0.0/28 (10.0.0.0 to 10.0.0.15). The server at 10.0.0.20 fell outside it, R2 had no other route for it and answered with ICMP host unreachable. The server LAN is a /24, so the mask must be 255.255.255.0.',
      check: 'show ip route on R2 (the C line shows 10.0.0.0/28) or show ip interface GigabitEthernet0/1.' },
    { id: 'r1-route', label: 'Missing static route on R1',
      apply: S => { S.R1.routes = []; }, fix: S => { S.R1.routes = [{ net: '10.0.0.0', mask: '255.255.255.0', nh: '10.1.1.2' }]; },
      expect: { failAt: 'R1', line: 'Reply from 192.168.1.1: Destination host unreachable.' },
      what: 'R1 had no route to 10.0.0.0/24 and no default route, so it dropped the request and sent back ICMP host unreachable. ip route 10.0.0.0 255.255.255.0 10.1.1.2 (or a default route toward R2) fixes it; R2 already had its route back to 192.168.1.0/24.',
      check: 'show ip route on R1, and tracert from the PC to see the last hop that answers.' },
    { id: 'r1-acl', label: 'Access list on R1 dropping the replies',
      apply: S => { S.R1.acls[ACL][0].icmp = 'echo-reply'; }, fix: S => { S.R1.acls[ACL][0].icmp = 'echo'; },
      expect: { failAt: 'R1', line: 'Request timed out.', dir: 'reply' },
      what: 'The request reached the server, but R1’s outbound ACL LAN-PROTECT on G0/0 denied ICMP echo-reply in line 10, so the reply died on the way back and the PC only saw a timeout. The line was meant to stop outside hosts pinging into the LAN (echo), not the replies to the LAN’s own pings.',
      check: 'show access-lists on R1 (line 10’s match counter climbs with every ping) and the %SEC-6-IPACCESSLOGDP log message.' },
    { id: 'hosts-typo', label: 'Typo in the PC’s hosts file',
      apply: S => { S.PC.hosts[NAME] = '10.0.0.200'; }, fix: S => { S.PC.hosts[NAME] = '10.0.0.20'; },
      expect: { failAt: 'R2', line: 'Request timed out.' },
      what: 'resume.lab resolved to 10.0.0.200, a typo in the PC’s hosts file. R2 routed the packet onto the server LAN and sent an ARP request for 10.0.0.200, nobody answered, and the packet was dropped without any error coming back. The “Pinging resume.lab [10.0.0.200]” line gave it away.',
      check: 'Read the address in the “Pinging …” line, check the hosts file or DNS record, then ping the server by IP.' },
    { id: 'srv-gateway', label: 'Wrong default gateway on the server',
      apply: S => { S.SRV.gw = '10.0.0.254'; }, fix: S => { S.SRV.gw = '10.0.0.1'; },
      expect: { failAt: 'SRV', line: 'Request timed out.', dir: 'reply' },
      what: 'The request arrived, but the server’s default gateway was 10.0.0.254, which nobody owns, so its reply to 192.168.1.10 never left the server LAN. Every hop toward the server was healthy; the return path was the problem. The gateway has to be R2’s G0/1 address, 10.0.0.1.',
      check: 'ipconfig on the server. A packet capture there would show requests arriving and no replies leaving.' }
  ];

  const HINTS = [
    'Start with the exact output. “Reply from <the PC’s own IP>: Destination host unreachable” means the PC could not reach its next hop on the local network. “Reply from <a router>” means that router gave up on the packet. “Request timed out” means something dropped the request or its reply without reporting back.',
    'Work bottom-up along the path. Check the PC’s IP address, mask and default gateway, then each router interface. Devices that share a link must agree on the subnet, and a host’s default gateway has to be inside the host’s own subnet.',
    'Then check routing in both directions: each router needs a route to the destination (directly connected networks count automatically), and the reply needs a route back. Access lists are read top-down, the first matching line wins, and traffic that matches no line is denied.'
  ];

  /* ── 3 · Forwarding engine ──────────────────────────────── */
  function connected(R) {
    return R.ifaces.filter(fOk).map(f => ({ type: 'C', ad: 0, net: netOf(fIp(f), fMask(f)), mask: fMask(f), iface: f }));
  }
  /* static next hop → connected interface, recursively through other static routes (IOS-style) */
  function resolveNh(R, nh, skip, depth) {
    const c = connected(R).filter(r => sameNet(nh, r.net, r.mask)).sort((a, b) => b.mask - a.mask)[0];
    if (c) return { iface: c.iface, nh };
    if (depth <= 0) return null;
    let best = null;
    R.routes.forEach((rt, i) => {
      if (i === skip) return;
      const net = ip2n(rt.net), m = ip2n(rt.mask), h = ip2n(rt.nh);
      if (!isIp(net) || !maskOk(m) || !isIp(h) || !sameNet(nh, net, m)) return;
      if (best && m <= best.m) return;
      const r = resolveNh(R, h, i, depth - 1);
      if (r) best = { m, r };
    });
    return best ? best.r : null;
  }
  function rib(R) {
    const out = connected(R);
    R.routes.forEach((rt, i) => {
      const net = ip2n(rt.net), m = ip2n(rt.mask), h = ip2n(rt.nh);
      if (!isIp(net) || !maskOk(m) || netOf(net, m) !== net || !isIp(h)) return;
      if (R.ifaces.some(f => fIp(f) === h)) return;
      const r = resolveNh(R, h, i, 3);
      if (r) out.push({ type: 'S', ad: 1, net, mask: m, nhRaw: h, iface: r.iface, nh: r.nh });
    });
    return out;
  }
  function lookup(R, dst) {
    let best = null;
    for (const r of rib(R)) {
      if (!sameNet(dst, r.net, r.mask)) continue;
      if (!best || r.mask > best.mask || (r.mask === best.mask && r.ad < best.ad)) best = r;
    }
    return best;
  }

  const ICMP_T = { 'echo-reply': 0, unreachable: 3, echo: 8, 'time-exceeded': 11 };
  function parseAddr(s) {
    const t = String(s == null ? '' : s).trim().toLowerCase().split(/\s+/);
    if (t.length === 1 && t[0] === 'any') return { any: true };
    if (t.length === 2 && t[0] === 'host' && isIp(ip2n(t[1]))) return { a: ip2n(t[1]), w: 0 };
    if (t.length === 2 && isIp(ip2n(t[0])) && isIp(ip2n(t[1]))) { const w = ip2n(t[1]); return { a: (ip2n(t[0]) & ~w) >>> 0, w }; }
    return null;
  }
  const fmtAddr = p => (p.any ? 'any' : p.w === 0 ? 'host ' + n2ip(p.a) : n2ip(p.a) + ' ' + n2ip(p.w));
  const addrHit = (p, ip) => p.any || ((ip & ~p.w) >>> 0) === p.a;
  const aceText = a => [a.action, a.proto, a.src, a.dst].join(' ') + (a.proto === 'icmp' && a.icmp ? ' ' + a.icmp : '') + (a.log ? ' log' : '');
  function aceHit(a, pkt) {
    if (a.proto !== 'ip' && a.proto !== 'icmp') return false;            /* tcp/udp lines never match ICMP */
    if (a.proto === 'icmp' && a.icmp && ICMP_T[a.icmp] !== pkt.type) return false;
    const s = parseAddr(a.src), d = parseAddr(a.dst);
    return !!(s && d && addrHit(s, pkt.src) && addrHit(d, pkt.dst));
  }
  function aclEval(R, name, pkt) {
    const list = R.acls && R.acls[name];
    if (!list || !list.length) return { permit: true, empty: true };     /* IOS: an empty or undefined ACL permits all */
    for (const a of list.slice().sort((x, y) => x.seq - y.seq)) if (aceHit(a, pkt)) return { permit: a.action === 'permit', ace: a };
    return { permit: false, implicit: true };
  }

  function makeCtx() {
    const hops = [], aclHits = [], syslog = [];
    return {
      hops, aclHits, syslog,
      note(at, who, text, status) { hops.push({ kind: 'note', at, who, text, status: status || 'info' }); },
      move(from, to, pkt) { hops.push({ kind: 'move', from, to, pkt }); }
    };
  }

  function hostRoute(H, dst) {
    const f = H.ifaces[0], a = fIp(f), m = fMask(f);
    if (!fOk(f)) return { ok: false, why: 'noaddr', text: 'has no valid IPv4 address and mask, so it can’t send anything' };
    if (sameNet(a, dst, m)) return { ok: true, f, nh: dst, text: `${n2ip(dst)} is on its own subnet ${cidr(a, m)} → deliver directly` };
    const g = ip2n(H.gw);
    if (!String(H.gw || '').trim() || !isIp(g)) return { ok: false, why: 'nogw', text: `${n2ip(dst)} is outside ${cidr(a, m)} and no default gateway is set → no route` };
    if (!sameNet(a, g, m)) return { ok: false, why: 'gwoff', text: `${n2ip(dst)} is outside ${cidr(a, m)}, and the default gateway ${n2ip(g)} is not inside that subnet either, so it can’t be used → no route` };
    return { ok: true, f, nh: g, text: `${n2ip(dst)} is outside ${cidr(a, m)} → send to default gateway ${n2ip(g)}` };
  }

  function arp(S, from, f, nh) {
    const me = fIp(f);
    for (const id of SEGS[f.seg] || []) {
      if (id === from) continue;
      const peer = S[id], pf = peer.ifaces.find(x => x.seg === f.seg);
      if (!pf || fIp(pf) !== nh) continue;
      if (peer.kind === 'router' && !(fOk(pf) && sameNet(me, fIp(pf), fMask(pf))))
        return { ok: false, text: `ARP for ${n2ip(nh)}: ${peer.name} ${pf.short} owns that address but ignores the request, because the sender ${n2ip(me)} is not inside ${cidr(fIp(pf), fMask(pf))}` };
      return { ok: true, dev: id, f: pf, text: `ARP: ${n2ip(nh)} is ${peer.name}${peer.kind === 'router' ? ' ' + pf.short : ''}` };
    }
    return { ok: false, text: `ARP for ${n2ip(nh)} got no reply: no device on this link has that address` };
  }

  function aclDrop(R, who, name, dir, v, pkt, ctx, done) {
    const line = v.implicit ? 'no line matches, so the implicit “deny any” at the end applies' : `line ${v.ace.seq} (${aceText(v.ace)}) matches`;
    let text = `${done.length ? done.join('; ') + '; ' : ''}ACL ${name} ${dir}: ${line} → packet dropped`;
    if (v.ace && v.ace.log) {
      const msg = `%SEC-6-IPACCESSLOGDP: list ${name} denied icmp ${n2ip(pkt.src)} -> ${n2ip(pkt.dst)} (${pkt.type}/${pkt.code}), 1 packet`;
      ctx.syslog.push({ dev: R.id, line: msg });
      text += `. Log: ${msg}`;
    }
    text += pkt.err ? '.' : `. ICMP “administratively prohibited” goes back to the sender ${n2ip(pkt.src)}.`;
    ctx.note(R.id, who, text, 'fail');
    return { fate: 'dropped', dev: R.id, why: 'acl', icmp: pkt.err ? null : { type: 3, code: 13 } };
  }

  function routerStep(S, R, inF, pkt, local, ctx) {
    const who = local ? R.name : `${R.name} (in ${inF.short})`;
    const done = [];
    if (!local && inF.aclIn) {
      const v = aclEval(R, inF.aclIn, pkt);
      if (v.ace) ctx.aclHits.push({ dev: R.id, acl: inF.aclIn, seq: v.ace.seq });
      if (!v.permit) return aclDrop(R, who, inF.aclIn, 'in', v, pkt, ctx, done);
      done.push(v.empty ? `ACL ${inF.aclIn} in is empty (permits all)` : `ACL ${inF.aclIn} in: line ${v.ace.seq} permits`);
    }
    if (!local && R.ifaces.some(f => fOk(f) && fIp(f) === pkt.dst)) {
      ctx.note(R.id, who, `${done.length ? done.join('; ') + '; ' : ''}the packet is addressed to this router.`);
      return { fate: 'delivered', dev: R.id, ttl: pkt.ttl };
    }
    if (!local) {
      if (pkt.ttl <= 1) {
        ctx.note(R.id, who, `TTL is ${pkt.ttl} and would reach 0 → packet dropped; ICMP “time exceeded” goes back to ${n2ip(pkt.src)}.`, 'fail');
        return { fate: 'dropped', dev: R.id, why: 'ttl', icmp: pkt.err ? null : { type: 11, code: 0 } };
      }
      done.push(`TTL ${pkt.ttl}→${pkt.ttl - 1}`);
      pkt.ttl -= 1;
    }
    const rt = lookup(R, pkt.dst);
    if (!rt) {
      ctx.note(R.id, who, `${done.length ? done.join('; ') + '; ' : ''}no route to ${n2ip(pkt.dst)} and no default route → packet dropped${pkt.err ? '' : `; ICMP host unreachable goes back to ${n2ip(pkt.src)}`}.`, 'fail');
      return { fate: 'dropped', dev: R.id, why: 'noroute', icmp: pkt.err ? null : { type: 3, code: 1 } };
    }
    done.push(rt.type === 'C'
      ? `${cidr(rt.net, rt.mask)} is directly connected → out ${rt.iface.short}`
      : `${rt.mask === 0 ? 'default route' : 'static route'} ${cidr(rt.net, rt.mask)} via ${n2ip(rt.nhRaw)} → out ${rt.iface.short}`);
    if (!local && rt.iface.aclOut) {
      const v = aclEval(R, rt.iface.aclOut, pkt);
      if (v.ace) ctx.aclHits.push({ dev: R.id, acl: rt.iface.aclOut, seq: v.ace.seq });
      if (!v.permit) return aclDrop(R, who, rt.iface.aclOut, 'out', v, pkt, ctx, done);
      done.push(v.empty ? `ACL ${rt.iface.aclOut} out is empty (permits all)` : `ACL ${rt.iface.aclOut} out: line ${v.ace.seq} permits`);
    }
    const a = arp(S, R.id, rt.iface, rt.type === 'C' ? pkt.dst : rt.nh);
    if (!a.ok) {
      ctx.note(R.id, who, `${done.join('; ')}. ${a.text} → the packet is dropped and no error goes back.`, 'fail');
      return { fate: 'dropped', dev: R.id, why: 'arp' };
    }
    ctx.note(R.id, who, done.join('; ') + '.');
    return { next: { dev: a.dev, f: a.f } };
  }

  function transport(S, origin, pkt, ctx) {
    let at = origin, inF = null, local = true;
    for (let guard = 0; guard < 600; guard++) {
      const D = S[at];
      let next;
      if (D.kind === 'router') {
        const r = routerStep(S, D, inF, pkt, local, ctx);
        if (!r.next) return Object.assign({ local }, r);
        next = r.next;
      } else {
        if (!local) {
          if (fIp(D.ifaces[0]) === pkt.dst) return { fate: 'delivered', dev: at, ttl: pkt.ttl };
          ctx.note(at, D.name, `the packet is for ${n2ip(pkt.dst)}, not this host → discarded.`, 'fail');
          return { fate: 'dropped', dev: at, why: 'notmine' };
        }
        const h = hostRoute(D, pkt.dst);
        if (!h.ok) { ctx.note(at, D.name, h.text + '.', 'fail'); return { fate: 'dropped', dev: at, why: h.why, local: true }; }
        const a = arp(S, at, h.f, h.nh);
        if (!a.ok) { ctx.note(at, D.name, `${h.text}. ${a.text}.`, 'fail'); return { fate: 'dropped', dev: at, why: 'arp', local: true }; }
        ctx.note(at, D.name, `${h.text}. ${a.text}.`);
        next = { dev: a.dev, f: a.f };
      }
      const path = via(at, next.dev);
      for (let i = 0; i < path.length - 1; i++) ctx.move(path[i], path[i + 1], pkt.kind);
      at = next.dev; inF = next.f; local = false;
    }
    return { fate: 'dropped', dev: at, why: 'loop' };
  }

  const ICMP_MSG = { '3/0': 'Destination net unreachable.', '3/1': 'Destination host unreachable.', '3/13': 'Destination net unreachable.', '11/0': 'TTL expired in transit.' };

  /* simulatePing(S) → { ok, solved, out[], hops[], failAt, reason, dir, responder, ttl, received, aclHits[], syslog[] } — never mutates S */
  function simulatePing(S) {
    const ctx = makeCtx();
    const res = { ok: false, solved: false, out: [], hops: ctx.hops, aclHits: ctx.aclHits, syslog: ctx.syslog,
      failAt: null, reason: '', dir: 'request', responder: null, ttl: null, target: '', received: 0 };
    const pcF = S.PC.ifaces[0], me = fIp(pcF);
    const raw = String((S.PC.hosts || {})[NAME] || '').trim();
    const dst = ip2n(raw);
    if (!isIp(dst)) {
      res.out.push(`Ping request could not find host ${NAME}. Please check the name and try again.`);
      ctx.note('PC', 'Visitor PC', `${NAME} has no valid entry in the hosts file, so the name can’t be turned into an IP address.`, 'fail');
      res.failAt = 'PC'; res.reason = 'name';
      return res;
    }
    res.target = n2ip(dst);
    res.out.push(`Pinging ${NAME} [${n2ip(dst)}] with 32 bytes of data:`);
    ctx.note('PC', 'Visitor PC', `${NAME} resolves to ${n2ip(dst)} (hosts file).`);
    if (fOk(pcF) && dst === me) {
      res.out.push(`Reply from ${n2ip(dst)}: bytes=32 time<1ms TTL=128`);
      ctx.note('PC', 'Visitor PC', 'that is the PC’s own address, so it answered itself.', 'ok');
      Object.assign(res, { ok: true, responder: 'PC', ttl: 128, received: 1 });
      return res;
    }
    const req = { src: isIp(me) ? me : 0, dst, ttl: S.PC.ttl0, type: 8, code: 0, kind: 'req' };
    const r1 = transport(S, 'PC', req, ctx);
    if (r1.fate === 'dropped') {
      res.failAt = r1.dev; res.reason = r1.why;
      if (r1.dev === 'PC' && r1.local) {
        if (r1.why === 'arp') { res.out.push(`Reply from ${n2ip(me)}: Destination host unreachable.`); res.received = 1; }
        else res.out.push('PING: transmit failed. General failure.');
        return res;
      }
      if (r1.icmp) {
        const R = S[r1.dev], back = lookup(R, req.src);
        if (back) {
          const err = { src: fIp(back.iface), dst: req.src, ttl: R.ttl0, type: r1.icmp.type, code: r1.icmp.code, kind: 'err', err: true };
          const r2 = transport(S, r1.dev, err, ctx);
          if (r2.fate === 'delivered' && r2.dev === 'PC') {
            const msg = ICMP_MSG[err.type + '/' + err.code] || 'Destination host unreachable.';
            res.out.push(`Reply from ${n2ip(err.src)}: ${msg}`);
            res.received = 1;
            ctx.note('PC', 'Visitor PC', `Reply from ${n2ip(err.src)}: ${msg}`, 'fail');
            return res;
          }
        } else ctx.note(r1.dev, R.name, `has no route back to ${n2ip(req.src)}, so its error message is lost too.`, 'fail');
      }
      res.out.push('Request timed out.');
      ctx.note('PC', 'Visitor PC', 'nothing came back before the timeout → “Request timed out.”', 'fail');
      return res;
    }
    const T = S[r1.dev];
    res.responder = r1.dev;
    ctx.note(r1.dev, T.name, `echo request received (TTL ${r1.ttl}); sending an echo reply to ${n2ip(me)}.`);
    const rep = { src: dst, dst: me, ttl: T.ttl0, type: 0, code: 0, kind: 'rep' };
    const r3 = transport(S, r1.dev, rep, ctx);
    if (r3.fate === 'delivered' && r3.dev === 'PC') {
      const line = `Reply from ${n2ip(dst)}: bytes=32 time<1ms TTL=${r3.ttl}`;
      Object.assign(res, { ok: true, ttl: r3.ttl, solved: r1.dev === 'SRV', received: 1 });
      res.out.push(line);
      ctx.note('PC', 'Visitor PC', line, 'ok');
      return res;
    }
    Object.assign(res, { dir: 'reply', failAt: r3.dev, reason: r3.why });
    if (r3.icmp) ctx.note(r3.dev, S[r3.dev].name, `its error message goes to the reply’s sender ${n2ip(rep.src)}, not to the PC.`);
    res.out.push('Request timed out.');
    ctx.note('PC', 'Visitor PC', 'the reply never arrived → “Request timed out.”', 'fail');
    return res;
  }

  /* ── 4 · CLI renderers (IOS / Windows wording) ──────────── */
  const padR = (s, n) => (s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length));
  const sortAcl = list => list.slice().sort((a, b) => a.seq - b.seq);
  const ROUTE_CODES = [
    'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP',
    '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
    '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2',
    '       E1 - OSPF external type 1, E2 - OSPF external type 2',
    '       i - IS-IS, su - IS-IS summary, L1 - IS-IS level-1, L2 - IS-IS level-2',
    '       ia - IS-IS inter area, * - candidate default, U - per-user static route',
    '       o - ODR, P - periodic downloaded static route, H - NHRP, l - LISP',
    '       + - replicated route, % - next hop override'
  ];
  const classfulLen = n => { const a = n >>> 24; return a < 128 ? 8 : a < 192 ? 16 : 24; };
  function showIpRoute(R) {
    const entries = [];
    let gwlr = 'Gateway of last resort is not set';
    R.ifaces.filter(fOk).forEach(f => {
      entries.push({ code: 'C', net: netOf(fIp(f), fMask(f)), len: bits(fMask(f)), txt: `is directly connected, ${f.name}` });
      entries.push({ code: 'L', net: fIp(f), len: 32, txt: `is directly connected, ${f.name}` });
    });
    rib(R).filter(r => r.type === 'S').forEach(r => {
      if (r.mask === 0) gwlr = `Gateway of last resort is ${n2ip(r.nhRaw)} to network 0.0.0.0`;
      entries.push({ code: r.mask === 0 ? 'S*' : 'S', net: r.net, len: bits(r.mask), txt: `[1/0] via ${n2ip(r.nhRaw)}` });
    });
    const out = ROUTE_CODES.concat(['', gwlr, '']);
    const top = e => out.push(padR(e.code, 6) + `${n2ip(e.net)}/${e.len} ${e.txt}`);
    entries.filter(e => e.len < classfulLen(e.net)).sort((a, b) => a.net - b.net || a.len - b.len).forEach(top);
    const groups = new Map();
    entries.filter(e => e.len >= classfulLen(e.net)).forEach(e => {
      const cl = classfulLen(e.net), major = netOf(e.net, lenMask(cl));
      if (!groups.has(major)) groups.set(major, { cl, list: [] });
      groups.get(major).list.push(e);
    });
    [...groups.keys()].sort((a, b) => a - b).forEach(major => {
      const g = groups.get(major), list = g.list.sort((a, b) => a.net - b.net || a.len - b.len);
      const lens = [...new Set(list.map(e => e.len))];
      if (list.length === 1 && list[0].len === g.cl) { top(list[0]); return; }
      out.push(lens.length > 1
        ? `      ${n2ip(major)}/${g.cl} is variably subnetted, ${list.length} subnets, ${lens.length} masks`
        : `      ${n2ip(major)}/${lens[0]} is subnetted, ${list.length} subnets`);
      list.forEach(e => out.push(padR(e.code, 9) + `${n2ip(e.net)}/${e.len} ${e.txt}`));
    });
    return out.join('\n');
  }
  const showIpIntBrief = R => ['Interface              IP-Address      OK? Method Status                Protocol']
    .concat(R.ifaces.map(f => padR(f.name, 23) + padR(f.ip || 'unassigned', 16) + 'YES manual ' + padR('up', 22) + 'up')).join('\n');
  function showAcls(R, hits) {
    const out = [];
    Object.keys(R.acls || {}).forEach(name => {
      out.push(`Extended IP access list ${name}`);
      sortAcl(R.acls[name]).forEach(a => {
        const n = hits[`${R.id}|${name}|${a.seq}`] || 0;
        out.push(`    ${a.seq} ${aceText(a)}${n ? ` (${n} match${n === 1 ? '' : 'es'})` : ''}`);
      });
    });
    return out.join('\n');
  }
  function showRun(R) {
    const L = ['Building configuration...', '', '! trimmed to the lines this lab uses', '!', `hostname ${R.name}`, '!'];
    R.ifaces.forEach(f => {
      L.push(`interface ${f.name}`, ` description ${f.desc}`, ` ip address ${f.ip} ${f.mask}`);
      if (f.aclIn) L.push(` ip access-group ${f.aclIn} in`);
      if (f.aclOut) L.push(` ip access-group ${f.aclOut} out`);
      L.push('!');
    });
    R.routes.forEach(r => L.push(`ip route ${r.net} ${r.mask} ${r.nh}`));
    if (R.routes.length) L.push('!');
    Object.keys(R.acls || {}).forEach(name => {
      L.push(`ip access-list extended ${name}`);
      sortAcl(R.acls[name]).forEach(a => L.push(' ' + padR(a.action, 7) + aceText(a).slice(a.action.length + 1)));
      L.push('!');
    });
    L.push('end');
    return L.join('\n');
  }
  const ipconfig = H => ['Windows IP Configuration', '', '', `Ethernet adapter ${H.ifaces[0].name}:`, '',
    '   Connection-specific DNS Suffix  . :',
    `   IPv4 Address. . . . . . . . . . . : ${H.ifaces[0].ip}`,
    `   Subnet Mask . . . . . . . . . . . : ${H.ifaces[0].mask}`,
    `   Default Gateway . . . . . . . . . : ${H.gw || ''}`].join('\n');
  const SW_STATUS = ['Port      Name               Status       Vlan       Duplex  Speed Type',
    'Fa0/1     Visitor PC         connected    1          a-full  a-100 10/100BaseTX',
    'Gi0/1     Uplink to R1       connected    1          a-full a-1000 10/100/1000BaseTX'].join('\n');
  function cliFor(D, hits, logs) {
    if (D.kind === 'switch') return [{ cmd: 'show interfaces status', out: SW_STATUS }];
    if (D.kind === 'host') {
      const c = [{ cmd: 'ipconfig', out: ipconfig(D) }];
      if (D.hosts) c.push({ cmd: 'type C:\\Windows\\System32\\drivers\\etc\\hosts', out: D.hosts[NAME] ? padR(D.hosts[NAME], 16) + NAME : '' });
      return c;
    }
    const c = [
      { cmd: 'show ip interface brief', out: showIpIntBrief(D) },
      { cmd: 'show ip route', out: showIpRoute(D) },
      { cmd: 'show access-lists', out: showAcls(D, hits) },
      { cmd: 'show running-config', out: showRun(D) }];
    const mine = logs.filter(l => l.dev === D.id).map(l => l.line);
    if (mine.length) c.push({ cmd: 'show logging | include IPACCESSLOG', out: mine.slice(-6).join('\n') });
    return c;
  }

  /* ── 5 · Self-test: every fault broken → fixed ─────────── */
  window.__netlabSelfTest = function netlabSelfTest() {
    const results = [];
    const check = (name, cond, info) => results.push({ name, pass: !!cond, info: info || '' });
    const last = r => r.out[r.out.length - 1];
    check('ip2n is unsigned (255.255.255.255 = 4294967295)', ip2n('255.255.255.255') === 4294967295);
    check('ip2n rejects 256 and leading zeros', !isIp(ip2n('256.1.1.1')) && !isIp(ip2n('01.2.3.4')) && !isIp(ip2n('1.2.3')));
    check('addresses above 128.0.0.0 compare correctly', sameNet(ip2n('200.10.1.5'), ip2n('200.10.1.250'), lenMask(24)) && !sameNet(ip2n('200.10.1.5'), ip2n('200.10.2.5'), lenMask(24)));
    check('192.168.1.10/29 is in 192.168.1.8/29', netOf(ip2n('192.168.1.10'), lenMask(29)) === ip2n('192.168.1.8') && bcastOf(ip2n('192.168.1.10'), lenMask(29)) === ip2n('192.168.1.15'));
    check('mask validation', maskOk(lenMask(24)) && maskOk(0) && maskOk(lenMask(32)) && !maskOk(ip2n('255.0.255.0')));
    const base = simulatePing(baseline());
    check('baseline: server replies with TTL=126', base.ok && base.solved && base.ttl === 126 && last(base) === 'Reply from 10.0.0.20: bytes=32 time<1ms TTL=126', base.out.join(' | '));
    FAULTS.forEach(f => {
      const S = baseline(); f.apply(S);
      const b = simulatePing(S);
      check(`${f.id}: broken → fails at ${f.expect.failAt}`, !b.ok && b.failAt === f.expect.failAt && last(b) === f.expect.line && b.dir === (f.expect.dir || 'request'), `${b.failAt} · ${last(b)} · ${b.dir}`);
      f.fix(S);
      const x = simulatePing(S);
      check(`${f.id}: fixed → TTL=126 reply`, x.ok && x.solved && x.ttl === 126, x.out.join(' | '));
    });
    let S = baseline(), r;
    S.R1.routes = [{ net: '0.0.0.0', mask: '0.0.0.0', nh: '10.1.1.2' }];
    check('default route on R1 also reaches the server', simulatePing(S).solved);
    S = baseline(); S.R1.routes = [{ net: '10.0.0.0', mask: '255.255.255.0', nh: '10.0.0.1' }, { net: '10.0.0.1', mask: '255.255.255.255', nh: '10.1.1.2' }];
    check('recursive static next hop resolves', simulatePing(S).solved);
    S = baseline(); S.R1.routes = [{ net: '10.0.0.0', mask: '255.255.255.0', nh: '10.9.9.9' }];
    r = simulatePing(S);
    check('unresolvable next hop is not installed', !r.ok && r.failAt === 'R1' && last(r) === 'Reply from 192.168.1.1: Destination host unreachable.');
    S = baseline(); FAULTS[3].apply(S); S.R1.ifaces[0].aclOut = '';
    check('unapplying the ACL also fixes the ACL fault', simulatePing(S).solved);
    S = baseline(); S.R1.acls[ACL] = [{ seq: 10, action: 'permit', proto: 'tcp', src: 'any', dst: 'any', icmp: '', log: false }];
    r = simulatePing(S);
    check('implicit deny drops the reply', !r.ok && r.failAt === 'R1' && r.dir === 'reply' && r.hops.some(h => /implicit/.test(h.text || '')));
    S = baseline(); S.R1.ifaces[0].aclIn = ACL; S.R1.ifaces[0].aclOut = ''; S.R1.acls[ACL][0].dst = 'any';
    r = simulatePing(S);
    check('inbound deny → admin-prohibited from R1', !r.ok && r.failAt === 'R1' && last(r) === 'Reply from 192.168.1.1: Destination net unreachable.', last(r));
    S = baseline(); S.R1.ifaces[0].mask = '255.255.255.248';
    r = simulatePing(S);
    check('router ignores ARP from outside its subnet', !r.ok && r.failAt === 'PC' && last(r) === 'Reply from 192.168.1.10: Destination host unreachable.');
    S = baseline(); S.PC.ifaces[0].mask = '255.255.255.248';
    r = simulatePing(S);
    check('gateway outside the host subnet is unusable', !r.ok && last(r) === 'PING: transmit failed. General failure.');
    S = baseline(); S.PC.hosts[NAME] = '';
    check('empty hosts entry → name not found', /could not find host/.test(last(simulatePing(S))));
    S = baseline(); S.PC.hosts[NAME] = '10.1.1.2';
    r = simulatePing(S);
    check('pinging R2 gets an IOS reply (TTL 254), not a solve', r.ok && !r.solved && r.ttl === 254);
    S = baseline(); S.PC.hosts[NAME] = '172.16.0.1';
    S.R1.routes = [{ net: '0.0.0.0', mask: '0.0.0.0', nh: '10.1.1.2' }]; S.R2.routes = [{ net: '0.0.0.0', mask: '0.0.0.0', nh: '10.1.1.1' }];
    r = simulatePing(S);
    check('routing loop ends in TTL expired', !r.ok && last(r) === 'Reply from 10.1.1.2: TTL expired in transit.', last(r));
    check('show ip route (R1) lists S 10.0.0.0/24', /\nS {8}10\.0\.0\.0\/24 \[1\/0\] via 10\.1\.1\.2/.test(showIpRoute(baseline().R1)));
    const failed = results.filter(x => !x.pass);
    return { pass: failed.length === 0, total: results.length, failed: failed.map(x => `${x.name} — ${x.info}`), results };
  };

  /* ── 6 · UI ─────────────────────────────────────────────── */
  const root = document.getElementById('netLab');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const stage = $('nlabStage'), logEl = $('nlabLog'), term = $('nlabTerm'), nowEl = $('nlabNow'),
    panel = $('nlabPanel'), side = $('nlabSide'), sheet = $('nlabSheet'), reward = $('nlabReward'),
    hintsEl = $('nlabHints'), pingBtn = $('nlabPing'), hintBtn = $('nlabHint'), resetBtn = $('nlabReset'),
    newBtn = $('nlabNew'), pingsEl = $('nlabPings'), solvedEl = $('nlabSolved'), ticketNo = $('nlabTicketNo'), skip = $('nlabSkip');
  if (!stage || !logEl || !term || !panel || !side || !pingBtn) return;

  const SVGNS = 'http://www.w3.org/2000/svg';
  function setAttrs(n, attrs) {
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'hidden' || k === 'disabled') n[k] = v;
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    return n;
  }
  const add = (n, kids) => { kids.flat(9).forEach(k => { if (k != null && k !== false) n.append(k.nodeType ? k : String(k)); }); return n; };
  const el = (tag, attrs, ...kids) => add(setAttrs(document.createElement(tag), attrs), kids);
  const sv = (tag, attrs, ...kids) => add(setAttrs(document.createElementNS(SVGNS, tag), attrs), kids);
  const icon = cls => el('i', { class: cls, 'aria-hidden': 'true' });
  const str = v => (typeof v === 'string' ? v.trim() : '');
  const safeHref = u => {
    const s = str(u);
    if (!s) return '';
    try { return /^https?:$/.test(new URL(s, location.href).protocol) ? s : ''; } catch (e) { return ''; }
  };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const motionOn = () => { try { return !!motionOK() && !!window.gsap && !gsap.globalTimeline.paused(); } catch (e) { return false; } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rnd = n => { try { return crypto.getRandomValues(new Uint32Array(1))[0] % n; } catch (e) { return Math.floor(Math.random() * n); } };
  const mqPhone = matchMedia('(max-width: 599.98px)');
  const navH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 68;

  const NL = PD.netlab && typeof PD.netlab === 'object' ? PD.netlab : {};
  const resumePdf = safeHref(PD.resume && PD.resume.pdf);
  const ownerHint = str(NL.hint);
  const first = (PD.person && str(PD.person.name).split(/\s+/)[0]) || 'Renso';

  /* persisted progress (per browser, optional) */
  const STORE = 'renso.netlab.v1';
  const store = (() => {
    try { const j = JSON.parse(localStorage.getItem(STORE) || '{}'); if (j && typeof j === 'object' && j.solved && typeof j.solved === 'object') return j; } catch (e) { /* storage blocked */ }
    return { solved: {} };
  })();
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(store)); } catch (e) { /* storage blocked */ } };
  const solvedCount = () => FAULTS.filter(f => store.solved[f.id]).length;

  /* lab state */
  let fault = null, S = null, pings = 0, solved = false, running = false, runToken = 0, tween = null;
  let selected = null, lastRes = null, hintLevel = 0, hits = {}, logs = [], cliState = { open: false, idx: 0 }, cliRefresh = null;
  const termHist = [];

  /* skip link: résumé PDF when the owner adds one, contact otherwise */
  if (skip && resumePdf) {
    skip.href = resumePdf; skip.target = '_blank'; skip.rel = 'noopener noreferrer';
    skip.replaceChildren('Skip — just show me the résumé (PDF) ', icon('fa-solid fa-arrow-up-right-from-square'));
  }

  /* in-page links inside the lab (#contact): scroll under the fixed navbar, honour motion, move focus */
  root.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || !root.contains(a)) return;
    let t = null;
    try { t = document.querySelector(a.getAttribute('href')); } catch (err) { t = null; }
    if (!t) return;
    if (e.defaultPrevented && motionOn()) return;          /* the site's own smooth-scroll already handles it */
    e.preventDefault();
    window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - navH(), behavior: motionOn() ? 'smooth' : 'instant' });
    if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
    try { t.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
  });

  /* ── 6a · topology SVG ── */
  const META = {
    PC: { kind: 'pc', aria: 'Visitor PC', fa: 'fa-solid fa-desktop', title: 'Visitor PC', sub: 'Windows · 1 network adapter' },
    SW1: { kind: 'switch', aria: 'Switch SW1', fa: 'fa-solid fa-network-wired', title: 'SW1 · Layer 2 switch', sub: '2 ports in use · VLAN 1' },
    R1: { kind: 'router', aria: 'Router R1', fa: 'fa-solid fa-route', title: 'R1 · router', sub: 'IOS · 2 interfaces' },
    R2: { kind: 'router', aria: 'Router R2', fa: 'fa-solid fa-route', title: 'R2 · router', sub: 'IOS · 2 interfaces' },
    SRV: { kind: 'server', aria: 'Resume Server', fa: 'fa-solid fa-server', title: 'Resume Server', sub: `Windows · hosts ${NAME}` }
  };
  function drawIcon(kind) {
    if (kind === 'pc') return [sv('rect', { class: 'nlab-ib', x: -24, y: -22, width: 48, height: 32, rx: 4 }), sv('rect', { class: 'nlab-iscr', x: -19, y: -17, width: 38, height: 22, rx: 2 }), sv('path', { class: 'nlab-im', d: 'M-6 10v7M6 10v7M-14 18h28' })];
    if (kind === 'switch') return [sv('rect', { class: 'nlab-ib', x: -28, y: -15, width: 56, height: 30, rx: 6 }), sv('path', { class: 'nlab-im', d: 'M-16-5H10M6-9l4 4-4 4M16 5H-10M-6 1l-4 4 4 4' })];
    if (kind === 'router') return [sv('circle', { class: 'nlab-ib', r: 24 }), sv('path', { class: 'nlab-im', d: 'M-13-13-4-4M-4-10v6h-6M13 13 4 4M4 10V4h6M4-4l9-9M7-13h6v6M-4 4l-9 9M-7 13h-6V7' })];
    return [sv('rect', { class: 'nlab-ib', x: -18, y: -26, width: 36, height: 52, rx: 5 }), sv('path', { class: 'nlab-im', d: 'M-10-14h20M-10-4h20M-10 6h20' }), sv('circle', { class: 'nlab-led', cx: 8, cy: 17, r: 2.6 })];
  }
  const svg = sv('svg', { class: 'nlab-svg', role: 'group', 'aria-label': 'Lab network: Visitor PC, switch SW1, router R1, router R2 and the Resume Server, connected in a line. Each device is a button that opens its configuration.' });
  const gWires = sv('g', { 'aria-hidden': 'true' }), gLbl = sv('g', { 'aria-hidden': 'true' }), gDevs = sv('g');
  const wires = WIRES.map(([a, b]) => { const l = sv('line', { class: 'nlab-wire' }); gWires.append(l); return { a, b, l }; });
  const nets = [['LAN1', '192.168.1.0/24'], ['WAN', '10.1.1.0/30'], ['LAN2', '10.0.0.0/24']].map(([id, t]) => { const n = sv('text', { class: 'nlab-net', text: t }); gLbl.append(n); return { id, n }; });
  const ifl = [['R1', 0, -1], ['R1', 1, 1], ['R2', 0, -1], ['R2', 1, 1]].map(([d, i, dir]) => { const n = sv('text', { class: 'nlab-if' }); gLbl.append(n); return { d, i, dir, n }; });
  const devs = {};
  ORDER.forEach((id, idx) => {
    const g = sv('g', { class: 'nlab-dev', role: 'button', tabindex: '0', 'data-dev': id });
    const hit = sv('rect', { class: 'nlab-hit', rx: 16 }), ring = sv('rect', { class: 'nlab-focus', rx: 16 });
    const halo = sv('circle', { class: 'nlab-halo', r: 36 });
    const name = sv('text', { class: 'nlab-name' }), sub = sv('text', { class: 'nlab-subl' });
    g.append(hit, halo, sv('g', { class: 'nlab-ico' }, drawIcon(META[id].kind)), ring, name, sub);
    g.addEventListener('click', () => openDevice(id));
    g.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); openDevice(id); return; }
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      let j = step ? idx + step : e.key === 'Home' ? 0 : e.key === 'End' ? ORDER.length - 1 : -1;
      if (j < 0 && !step) return;
      e.preventDefault();
      j = Math.max(0, Math.min(ORDER.length - 1, j));
      devs[ORDER[j]].g.focus();
    });
    gDevs.append(g);
    devs[id] = { g, hit, ring, name, sub };
  });
  const dot = sv('g', { class: 'nlab-dot', 'aria-hidden': 'true' }, sv('circle', { class: 'nlab-dot-glow', r: 15 }), sv('circle', { class: 'nlab-dot-core', r: 8 }));
  const xMark = sv('g', { class: 'nlab-x', 'aria-hidden': 'true' }, sv('circle', { r: 12 }), sv('path', { d: 'M-4.5-4.5 4.5 4.5M4.5-4.5-4.5 4.5' }));
  svg.append(gWires, gLbl, gDevs, dot, xMark);
  stage.append(svg);

  let L = null;
  function place() {
    const w = Math.round(stage.clientWidth);
    if (!w) return;                                      /* hidden (Explore tab) */
    const vertical = mqPhone.matches || w < 520;
    const P = {};
    let H;
    if (!vertical) {
      const y = 94, pad = Math.max(74, Math.min(120, w * 0.085)), step = (w - 2 * pad) / 4;
      ORDER.forEach((id, i) => { P[id] = [Math.round(pad + i * step), y]; });
      H = 196;
    } else {
      const top = 52, step = 116;
      ORDER.forEach((id, i) => { P[id] = [56, top + i * step]; });
      H = top * 2 + step * 4 - 6;
    }
    L = { w, H, P, vertical };
    setAttrs(svg, { viewBox: `0 0 ${w} ${H}`, width: w, height: H });
    wires.forEach(x => setAttrs(x.l, { x1: P[x.a][0], y1: P[x.a][1], x2: P[x.b][0], y2: P[x.b][1] }));
    ORDER.forEach(id => {
      const d = devs[id], [x, y] = P[id];
      d.g.setAttribute('transform', `translate(${x} ${y})`);
      const box = vertical ? { x: -42, y: -42, width: Math.max(96, Math.min(w - x - 6, 300) + 42), height: 84 } : { x: -50, y: -44, width: 100, height: 132 };
      setAttrs(d.hit, box); setAttrs(d.ring, box);
      setAttrs(d.name, vertical ? { x: 48, y: -3, 'text-anchor': 'start' } : { x: 0, y: 60, 'text-anchor': 'middle' });
      setAttrs(d.sub, vertical ? { x: 48, y: 16, 'text-anchor': 'start' } : { x: 0, y: 78, 'text-anchor': 'middle' });
    });
    const mid = (a, b) => [(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2];
    const spots = { LAN1: vertical ? mid('PC', 'SW1') : P.SW1, WAN: mid('R1', 'R2'), LAN2: mid('R2', 'SRV') };
    nets.forEach(({ id, n }) => setAttrs(n, vertical ? { x: spots[id][0] + 48, y: spots[id][1] + 4, 'text-anchor': 'start' } : { x: spots[id][0], y: spots[id][1] - 54, 'text-anchor': 'middle' }));
    ifl.forEach(({ d, i, dir, n }) => {
      n.textContent = S ? S[d].ifaces[i].short : '';
      const [x, y] = P[d];
      setAttrs(n, vertical ? { x: x - 9, y: y + (dir < 0 ? -36 : 46), 'text-anchor': 'end' } : { x: x + dir * 42, y: y - 9, 'text-anchor': dir < 0 ? 'end' : 'start' });
    });
    if (dot.classList.contains('is-on') && dotAt && P[dotAt]) setDot(P[dotAt]);
    if (xAt && P[xAt]) xMark.setAttribute('transform', `translate(${P[xAt][0] + 27} ${P[xAt][1] - 27})`);
    updateLabels();
  }
  function updateLabels() {
    if (!S || !L) return;
    const pc = S.PC.ifaces[0], srv = S.SRV.ifaces[0];
    const pre = f => (fOk(f) ? `${f.ip}/${bits(fMask(f))}` : f.ip || 'no address');
    const subs = { PC: pre(pc), SW1: 'Layer 2 switch', R1: 'router', R2: 'router', SRV: L.vertical ? `${NAME} · ${srv.ip}` : srv.ip };
    ORDER.forEach(id => { devs[id].name.textContent = id === 'PC' ? 'Visitor PC' : id === 'SRV' ? 'Resume Server' : id; devs[id].sub.textContent = subs[id]; });
    updateDevAria();
  }
  function updateDevAria() {
    if (!S) return;
    const sum = { PC: `IP ${S.PC.ifaces[0].ip}`, SW1: 'Layer 2 switch', R1: '2 interfaces', R2: '2 interfaces', SRV: `IP ${S.SRV.ifaces[0].ip}` };
    ORDER.forEach(id => {
      const st = lastRes && !lastRes.ok && lastRes.failAt === id ? ` Last ping stopped here${lastRes.dir === 'reply' ? ' on the way back' : ''}.` : '';
      devs[id].g.setAttribute('aria-label', `${META[id].aria}, ${sum[id]}.${st} Opens its configuration.`);
      devs[id].g.classList.toggle('is-sel', selected === id);
    });
  }

  let dotAt = null, xAt = null;
  function setDot(p) { dot.setAttribute('transform', `translate(${p[0]} ${p[1]})`); }
  function dotKind(k) { dot.setAttribute('class', `nlab-dot is-on k-${k}`); }
  function clearMarks() {
    ORDER.forEach(id => devs[id].g.classList.remove('is-fail', 'is-ok'));
    wires.forEach(x => x.l.classList.remove('is-lit'));
    xMark.classList.remove('is-on'); xAt = null;
    dot.setAttribute('class', 'nlab-dot'); dotAt = null;
  }
  function markFail(id) {
    devs[id].g.classList.add('is-fail');
    xAt = id;
    if (L) xMark.setAttribute('transform', `translate(${L.P[id][0] + 27} ${L.P[id][1] - 27})`);
    xMark.classList.add('is-on');
  }
  async function hop(from, to, kind, token) {
    dotKind(kind);
    if (!L || !motionOn()) { dotAt = to; if (L) setDot(L.P[to]); await sleep(150); return; }
    setDot(L.P[from]);
    await new Promise(resolve => {
      const st = { t: 0 };
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      tween = gsap.to(st, {
        t: 1, duration: 0.34, ease: 'power1.inOut', onComplete: fin,
        onUpdate: () => { if (token === runToken && L) { const A = L.P[from], B = L.P[to]; setDot([A[0] + (B[0] - A[0]) * st.t, A[1] + (B[1] - A[1]) * st.t]); } }
      });
      setTimeout(fin, 1100);                              /* never hang if the timeline gets paused mid-hop */
    });
    tween = null; dotAt = to;
    if (L) setDot(L.P[to]);
  }
  document.addEventListener('motionchange', () => { if (!motionOn() && tween) { try { tween.progress(1); } catch (e) { /* ignore */ } } });

  /* ── 6b · terminal + hop log ── */
  function termRender() {
    const kids = [];
    termHist.slice(-2).forEach(p => {
      kids.push(el('span', { class: 't-cmd', text: S.PC.prompt + p.cmd }), '\n');
      if (p.lines.length) kids.push('\n');
      p.lines.forEach(l => kids.push(el('span', { class: l.c, text: l.t }), '\n'));
      kids.push('\n');
    });
    kids.push(el('span', { class: 't-cmd', text: S.PC.prompt }), el('span', { class: 't-caret', 'aria-hidden': 'true', text: '_' }));
    term.replaceChildren(...kids);
    term.scrollTop = term.scrollHeight;
  }
  function addLog(who, text, status) {
    logEl.append(el('li', { class: `is-${status || 'info'}` }, who ? el('strong', { text: who + ': ' }) : null, text));
    if (nowEl) { nowEl.textContent = (who ? who + ': ' : '') + text; nowEl.className = `nlab-now is-${status || 'info'}`; }
  }
  function compress(h) {
    if (h.length <= 64) return h;
    return h.slice(0, 26).concat([{ kind: 'note', at: 'R1', who: 'R1 ⇄ R2', text: 'the two routers keep handing the packet back and forth; each pass lowers the TTL by one …', status: 'info' }], h.slice(-26));
  }

  /* ── 6c · ping run ── */
  async function ping() {
    if (running) return;
    running = true;
    const token = ++runToken;
    pings += 1;
    setBusy(true);
    clearMarks();
    updateStats();
    const res = simulatePing(S);
    res.aclHits.forEach(x => { const k = `${x.dev}|${x.acl}|${x.seq}`; hits[k] = (hits[k] || 0) + 1; });
    res.syslog.forEach(x => logs.push(x));
    const entry = { cmd: `ping -n 1 ${NAME}`, lines: [] };
    termHist.push(entry);
    if (/^Pinging /.test(res.out[0])) entry.lines.push({ t: res.out[0], c: 't-out' });
    termRender();
    logEl.replaceChildren();
    addLog('', `Ping ${pings}: ping -n 1 ${NAME}`, 'head');
    if (L) { dotKind('req'); setDot(L.P.PC); dotAt = 'PC'; }
    for (const h of compress(res.hops)) {
      if (token !== runToken) return;
      if (h.kind === 'note') {
        addLog(h.who, h.text, h.status);
        if (h.status === 'fail' && h.at === res.failAt && !res.ok && xAt == null) markFail(h.at);
      } else await hop(h.from, h.to, h.pkt, token);
    }
    if (token !== runToken) return;
    finish(res, entry);
  }
  function finish(res, entry) {
    const target = res.target || NAME;
    res.out.slice(/^Pinging /.test(res.out[0]) ? 1 : 0).forEach(t => entry.lines.push({ t, c: res.ok ? 't-ok' : 't-bad' }));
    if (res.target) {
      entry.lines.push({ t: '', c: '' }, { t: `Ping statistics for ${target}:`, c: 't-out' },
        { t: `    Packets: Sent = 1, Received = ${res.received}, Lost = ${1 - res.received} (${res.received ? 0 : 100}% loss),`, c: 't-out' });
      if (res.ok) entry.lines.push({ t: 'Approximate round trip times in milli-seconds:', c: 't-out' }, { t: '    Minimum = 0ms, Maximum = 0ms, Average = 0ms', c: 't-out' });
    }
    termRender();
    lastRes = res;
    if (res.ok) {
      ORDER.forEach(id => devs[id].g.classList.add('is-ok'));
      wires.forEach(x => x.l.classList.add('is-lit'));
    } else if (res.failAt && xAt == null) markFail(res.failAt);
    if (res.ok && !res.solved) addLog('Note', `that reply came from ${res.target}, not from the résumé server. resume.lab has to answer from 10.0.0.20 to close the ticket.`, 'info');
    if (res.solved && !solved) onSolved();
    updateDevAria();
    if (hintsEl && !hintsEl.hidden) renderHints();
    if (cliRefresh) cliRefresh();
    running = false;
    setBusy(false);
  }
  function setBusy(on) {
    pingBtn.setAttribute('aria-disabled', on ? 'true' : 'false');
    stage.setAttribute('aria-busy', on ? 'true' : 'false');
    pingBtn.replaceChildren(icon(on ? 'fa-solid fa-ellipsis' : 'fa-solid fa-paper-plane'), on ? ' Pinging…' : ` Ping ${NAME}`);
  }
  function cancelRun() {
    runToken += 1;
    if (tween) { try { tween.kill(); } catch (e) { /* ignore */ } tween = null; }
    running = false;
    setBusy(false);
  }
  function updateStats() {
    if (pingsEl) pingsEl.textContent = `Pings on this ticket: ${pings}`;
    if (solvedEl) solvedEl.textContent = `Faults solved in this browser: ${solvedCount()} of ${FAULTS.length}`;
  }

  /* ── 6d · reward ── */
  function onSolved() {
    solved = true;
    const prev = store.solved[fault.id];
    store.solved[fault.id] = prev ? Math.min(prev, pings) : pings;
    persist();
    updateStats();
    addLog('', `Ticket closed: solved in ${plural(pings, 'ping')}.`, 'ok');
    renderReward();
    if (typeof window.showToast === 'function') { try { window.showToast(`Lab solved in ${plural(pings, 'ping')}`, 'success', 3200); } catch (e) { /* ignore */ } }
  }
  function renderReward() {
    if (!reward) return;
    const acts = [];
    if (resumePdf) acts.push(el('a', { class: 'nlab-btn nlab-btn-pri', href: resumePdf, target: '_blank', rel: 'noopener noreferrer' }, icon('fa-solid fa-file-pdf'), ` Open ${first}’s résumé (PDF)`));
    else {
      acts.push(el('a', { class: 'nlab-btn nlab-btn-pri', href: '#contact' }, icon('fa-solid fa-paper-plane'), ` Contact ${first}`));
      acts.push(el('button', { type: 'button', class: 'nlab-btn', title: 'Opens the print dialog: choose “Save as PDF”', onclick: () => window.print() }, icon('fa-solid fa-print'), ' Save résumé (PDF)'));
    }
    acts.push(el('button', { type: 'button', class: 'nlab-btn nlab-btn-ghost', onclick: newFault }, icon('fa-solid fa-shuffle'), ' Try another fault'));
    reward.replaceChildren(
      el('span', { class: 'nlab-reward-ico', 'aria-hidden': 'true' }, icon('fa-solid fa-check')),
      el('div', { class: 'nlab-reward-txt' },
        el('p', { class: 'nlab-reward-k', text: `${NAME} answered · ticket closed` }),
        el('h4', { class: 'nlab-reward-t', id: 'nlabRewardT', text: `Solved in ${plural(pings, 'ping')}` }),
        el('p', null, el('strong', { text: 'What was wrong: ' }), fault.what),
        el('p', null, el('strong', { text: 'How to confirm it on real equipment: ' }), fault.check),
        el('div', { class: 'nlab-reward-acts' }, acts)));
    reward.setAttribute('role', 'region');
    reward.setAttribute('aria-labelledby', 'nlabRewardT');
    reward.hidden = false;
  }

  /* ── 6e · hints ── */
  function renderHints() {
    const kids = [el('p', { class: 'nlab-hk', text: 'Lab hints · a bottom-up checklist' }),
      el('ol', { class: 'nlab-hl' }, HINTS.slice(0, hintLevel).map(t => el('li', { text: t })))];
    if (lastRes && !lastRes.ok && lastRes.failAt) kids.push(el('p', { class: 'nlab-hstop' }, icon('fa-solid fa-location-crosshairs'), ` Your last ping stopped at ${S[lastRes.failAt].name}${lastRes.dir === 'reply' ? ', on the way back' : ''}.`));
    if (hintLevel < HINTS.length) kids.push(el('button', { type: 'button', class: 'nlab-btn nlab-btn-sm', onclick: () => { hintLevel += 1; renderHints(); const li = hintsEl.querySelectorAll('.nlab-hl li'); if (li.length) { li[li.length - 1].setAttribute('tabindex', '-1'); li[li.length - 1].focus(); } } }, icon('fa-solid fa-plus'), ' Another hint'));
    if (ownerHint) kids.push(el('div', { class: 'nlab-owner' }, el('p', { class: 'nlab-hk', text: `How ${first} troubleshoots` }), ownerHint.split(/\n\s*\n/).map(t => el('p', { text: t.trim() }))));
    hintsEl.replaceChildren(...kids);
  }
  if (hintBtn && hintsEl) hintBtn.addEventListener('click', () => {
    const open = hintsEl.hidden;
    if (open && hintLevel === 0) hintLevel = 1;
    if (open) renderHints();
    hintsEl.hidden = !open;
    hintBtn.setAttribute('aria-expanded', String(open));
  });

  /* ── 6f · device panel (side column, or a bottom sheet under 600px) ── */
  const sheetMode = () => !!sheet && mqPhone.matches && typeof sheet.showModal === 'function';
  function openDevice(id) {
    selected = id;
    updateDevAria();
    renderPanel();
    const h = $('nlabPanelT');
    if (sheetMode()) {
      if (!sheet.open) {
        sheet.replaceChildren(el('div', { class: 'nlab-grab', 'aria-hidden': 'true' }), panel);
        try { sheet.showModal(); } catch (e) { side.append(panel); }
      }
      if (h) h.focus();
      return;
    }
    if (h) h.focus({ preventScroll: true });
    const r = panel.getBoundingClientRect();
    if (r.top < navH() || r.top > window.innerHeight - 160) panel.scrollIntoView({ block: 'nearest', behavior: motionOn() ? 'smooth' : 'instant' });
  }
  function closePanel() {
    if (sheet && sheet.open) { sheet.close(); return; }
    const was = selected;
    selected = null; cliRefresh = null;
    updateDevAria();
    renderPanel();
    if (was && devs[was]) devs[was].g.focus({ preventScroll: true });
  }
  if (sheet) {
    sheet.addEventListener('close', () => {
      side.append(panel);
      if (selected && devs[selected]) devs[selected].g.focus({ preventScroll: true });
    });
    sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });
  }
  const onMq = () => { if (!mqPhone.matches && sheet && sheet.open) sheet.close(); schedulePlace(); };
  if (mqPhone.addEventListener) mqPhone.addEventListener('change', onMq); else if (mqPhone.addListener) mqPhone.addListener(onMq);

  function renderPanel() {
    cliRefresh = null;
    if (!selected) {
      panel.replaceChildren(
        el('p', { class: 'nlab-hk', text: 'Device configuration' }),
        el('p', { class: 'nlab-empty', text: 'Select a device in the diagram (or below) to inspect it and change its settings.' }),
        el('div', { class: 'nlab-devlist' }, ORDER.map(id => el('button', { type: 'button', class: 'nlab-btn nlab-btn-sm', onclick: () => openDevice(id) }, icon(META[id].fa), ' ' + (id === 'PC' ? 'Visitor PC' : id === 'SRV' ? 'Resume Server' : id)))));
      return;
    }
    const D = S[selected], M = META[selected];
    const head = el('div', { class: 'nlab-ph' },
      el('span', { class: 'nlab-ph-ico', 'aria-hidden': 'true' }, icon(M.fa)),
      el('div', { class: 'nlab-ph-t' }, el('h4', { id: 'nlabPanelT', tabindex: '-1', text: M.title }), el('p', { text: M.sub })),
      el('button', { type: 'button', class: 'nlab-close', 'aria-label': 'Close the configuration panel', onclick: closePanel }, icon('fa-solid fa-xmark')));
    const body = D.kind === 'switch'
      ? el('div', { class: 'nlab-sw' },
        el('p', { text: 'SW1 is a Layer 2 switch. It forwards Ethernet frames by MAC address inside one VLAN and needs no IP settings to carry this traffic.' }),
        el('p', { text: 'Both ports are up in VLAN 1: Fa0/1 to the Visitor PC and Gi0/1 to R1 G0/0.' }))
      : configForm(D);
    panel.replaceChildren(head, body, cliBlock(D));
  }

  function cliBlock(D) {
    const det = el('details', { class: 'nlab-cli' }, el('summary', null, icon('fa-solid fa-terminal'), ' Command-line view'));
    if (cliState.open) det.open = true;
    det.addEventListener('toggle', () => { cliState.open = det.open; });
    const bar = el('div', { class: 'nlab-cli-cmds', role: 'group', 'aria-label': 'Choose a command' });
    const pre = el('pre', { class: 'nlab-term nlab-cli-out', tabindex: '0', 'aria-label': `${D.name} command output` });
    const prompt = D.kind === 'host' ? D.prompt : `${D.name}#`;
    let idx = 0;
    const draw = () => {
      const cmds = cliFor(S[D.id], hits, logs);
      idx = Math.min(idx, cmds.length - 1);
      bar.replaceChildren(...cmds.map((c, i) => el('button', { type: 'button', class: 'nlab-chipbtn', 'aria-pressed': String(i === idx), onclick: () => { idx = i; cliState.idx = i; draw(); } }, c.cmd)));
      pre.replaceChildren(el('span', { class: 't-cmd', text: prompt + cmds[idx].cmd }), '\n', cmds[idx].out);
    };
    idx = cliState.idx || 0;
    draw();
    cliRefresh = draw;
    det.append(bar, pre);
    return det;
  }

  const HOST_MASKS = []; for (let l = 8; l <= 30; l++) HOST_MASKS.push(n2ip(lenMask(l)));
  const ROUTE_MASKS = ['0.0.0.0']; for (let l = 8; l <= 32; l++) ROUTE_MASKS.push(n2ip(lenMask(l)));
  let uidN = 0;

  function configForm(D0) {
    const draft = clone(D0);
    const form = el('form', { class: 'nlab-form', novalidate: true });
    const summary = el('p', { class: 'nlab-formerr', role: 'alert' });
    const status = el('p', { class: 'nlab-status', role: 'status' });
    const reg = new Map();
    const uid = () => `nlab-c${++uidN}`;

    function wrapField(key, label, ctl, help) {
      const id = uid(), errId = id + '-e';
      ctl.id = id;
      const err = el('p', { class: 'nlab-err', id: errId, hidden: true });
      ctl.setAttribute('aria-describedby', help ? `${errId} ${id}-h` : errId);
      reg.set(key, { ctl, err });
      return el('div', { class: 'nlab-field' }, el('label', { for: id, text: label }), ctl, help ? el('p', { class: 'nlab-help', id: id + '-h', text: help }) : null, err);
    }
    const onEdit = (key, ctl) => () => { const r = reg.get(key); if (r) { r.err.hidden = true; ctl.removeAttribute('aria-invalid'); } status.textContent = ''; };
    function textField(key, label, obj, prop, opts) {
      const o = opts || {};
      const ctl = el('input', { type: 'text', class: 'nlab-ctl', value: obj[prop] == null ? '' : String(obj[prop]), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', inputmode: o.free ? null : 'decimal', placeholder: o.placeholder || null });
      ctl.addEventListener('input', () => { obj[prop] = ctl.value; onEdit(key, ctl)(); });
      return wrapField(key, label, ctl, o.help);
    }
    function selectField(key, label, obj, prop, options) {
      const ctl = el('select', { class: 'nlab-ctl' }, options.map(o => el('option', { value: o.value, text: o.label })));
      if (!options.some(o => o.value === obj[prop])) ctl.append(el('option', { value: obj[prop], text: obj[prop] }));
      ctl.value = obj[prop];
      ctl.addEventListener('change', () => { obj[prop] = ctl.value; onEdit(key, ctl)(); });
      return wrapField(key, label, ctl);
    }
    const maskOpts = list => list.map(m => ({ value: m, label: `${m}  /${bits(ip2n(m))}` }));
    const grid = (...k) => el('div', { class: 'nlab-grid' }, k);
    const fs = (legend, ...k) => el('fieldset', { class: 'nlab-fs' }, el('legend', { text: legend }), k);

    const parts = [];
    if (D0.kind === 'host') {
      const f = draft.ifaces[0];
      parts.push(fs(`${f.name} · IPv4`, grid(
        textField('ip0', 'IPv4 address', f, 'ip'),
        selectField('mask0', 'Subnet mask', f, 'mask', maskOpts(HOST_MASKS)),
        textField('gw', 'Default gateway', draft, 'gw'))));
      if (draft.hosts) parts.push(fs('Name resolution · hosts file', grid(textField('hosts', `${NAME} resolves to`, draft.hosts, NAME))));
    } else {
      const aclNames = Object.keys(draft.acls || {});
      const aclOpts = [{ value: '', label: 'none' }].concat(aclNames.map(n => ({ value: n, label: n })));
      draft.ifaces.forEach((f, i) => {
        parts.push(fs(`${f.name} · ${f.desc}`, grid(
          textField(`ip${i}`, 'IP address', f, 'ip'),
          selectField(`mask${i}`, 'Subnet mask', f, 'mask', maskOpts(HOST_MASKS)),
          aclNames.length ? selectField(`in${i}`, 'ACL applied inbound', f, 'aclIn', aclOpts) : null,
          aclNames.length ? selectField(`out${i}`, 'ACL applied outbound', f, 'aclOut', aclOpts) : null)));
      });
      /* static routes */
      const rBox = el('div', { class: 'nlab-rows' });
      const rFs = fs('Static routes');
      const addR = el('button', { type: 'button', class: 'nlab-btn nlab-btn-sm' }, icon('fa-solid fa-plus'), ' Add static route');
      const drawRoutes = focusIdx => {
        [...reg.keys()].filter(k => /^rt\d/.test(k)).forEach(k => reg.delete(k));
        rBox.replaceChildren(...(draft.routes.length ? draft.routes.map((rt, i) => el('div', { class: 'nlab-row' },
          el('p', { class: 'nlab-row-t', text: `Route ${i + 1}` }),
          grid(textField(`rt${i}.net`, 'Destination network', rt, 'net'),
            selectField(`rt${i}.mask`, 'Mask', rt, 'mask', maskOpts(ROUTE_MASKS)),
            textField(`rt${i}.nh`, 'Next hop', rt, 'nh')),
          el('button', { type: 'button', class: 'nlab-btn nlab-btn-sm nlab-btn-ghost', 'aria-label': `Remove route ${i + 1}`, onclick: () => { draft.routes.splice(i, 1); drawRoutes(-1); addR.focus(); } }, icon('fa-solid fa-trash-can'), ' Remove')))
          : [el('p', { class: 'nlab-empty', text: 'No static routes configured.' })]));
        if (focusIdx >= 0) { const r = reg.get(`rt${focusIdx}.net`); if (r) r.ctl.focus(); }
      };
      addR.addEventListener('click', () => { draft.routes.push({ net: '', mask: '255.255.255.0', nh: '' }); drawRoutes(draft.routes.length - 1); });
      drawRoutes(-1);
      rFs.append(rBox, addR);
      parts.push(rFs);
      /* access lists */
      aclNames.forEach(name => {
        const aBox = el('div', { class: 'nlab-rows' });
        const aFs = fs(`ip access-list extended ${name}`);
        const addA = el('button', { type: 'button', class: 'nlab-btn nlab-btn-sm' }, icon('fa-solid fa-plus'), ' Add line');
        const list = draft.acls[name];
        const drawAces = focusIdx => {
          [...reg.keys()].filter(k => k.indexOf(`acl:${name}:`) === 0).forEach(k => reg.delete(k));
          list.sort((a, b) => a.seq - b.seq);
          aBox.replaceChildren(...(list.length ? list.map((a, i) => {
            const k = `acl:${name}:${i}`;
            const icmpSel = selectField(`${k}.icmp`, 'ICMP type', a, 'icmp', [{ value: '', label: 'any type' }, { value: 'echo', label: 'echo' }, { value: 'echo-reply', label: 'echo-reply' }, { value: 'unreachable', label: 'unreachable' }, { value: 'time-exceeded', label: 'time-exceeded' }]);
            const icmpCtl = reg.get(`${k}.icmp`).ctl;
            icmpCtl.disabled = a.proto !== 'icmp';
            const protoSel = selectField(`${k}.proto`, 'Protocol', a, 'proto', ['ip', 'icmp', 'tcp', 'udp'].map(v => ({ value: v, label: v })));
            reg.get(`${k}.proto`).ctl.addEventListener('change', () => { icmpCtl.disabled = a.proto !== 'icmp'; if (a.proto !== 'icmp') { a.icmp = ''; icmpCtl.value = ''; } });
            const logId = uid();
            const logBox = el('input', { type: 'checkbox', id: logId, class: 'nlab-check', checked: !!a.log });
            logBox.addEventListener('change', () => { a.log = logBox.checked; status.textContent = ''; });
            return el('div', { class: 'nlab-row' },
              el('p', { class: 'nlab-row-t', text: `Line ${a.seq}` }),
              grid(selectField(`${k}.action`, 'Action', a, 'action', [{ value: 'permit', label: 'permit' }, { value: 'deny', label: 'deny' }]),
                protoSel,
                textField(`${k}.src`, 'Source', a, 'src', { free: true, help: 'any · host A.B.C.D · A.B.C.D wildcard' }),
                textField(`${k}.dst`, 'Destination', a, 'dst', { free: true }),
                icmpSel),
              el('div', { class: 'nlab-row-foot' },
                el('label', { class: 'nlab-checkl', for: logId }, logBox, ' log matches'),
                el('button', { type: 'button', class: 'nlab-btn nlab-btn-sm nlab-btn-ghost', 'aria-label': `Remove line ${a.seq}`, onclick: () => { list.splice(i, 1); drawAces(-1); addA.focus(); } }, icon('fa-solid fa-trash-can'), ' Remove')));
          }) : [el('p', { class: 'nlab-empty', text: 'No lines: an empty access list permits everything.' })]));
          if (focusIdx >= 0) { const r = reg.get(`acl:${name}:${focusIdx}.action`); if (r) r.ctl.focus(); }
        };
        addA.addEventListener('click', () => {
          const seq = list.reduce((m, a) => Math.max(m, a.seq), 0) + 10;
          list.push({ seq, action: 'permit', proto: 'ip', src: 'any', dst: 'any', icmp: '', log: false });
          drawAces(list.length - 1);
        });
        drawAces(-1);
        aFs.append(el('p', { class: 'nlab-help', text: 'Lines are checked top-down; the first match wins and anything unmatched is denied.' }), aBox, addA);
        parts.push(aFs);
      });
    }

    let wantPing = false;
    const btnPing = el('button', { type: 'submit', class: 'nlab-btn nlab-btn-pri', onclick: () => { wantPing = true; } }, icon('fa-solid fa-paper-plane'), ' Apply & ping');
    const btnApply = el('button', { type: 'submit', class: 'nlab-btn', onclick: () => { wantPing = false; } }, icon('fa-solid fa-check'), ' Apply');
    const btnRevert = el('button', { type: 'button', class: 'nlab-btn nlab-btn-ghost', onclick: () => { renderPanel(); const h = $('nlabPanelT'); if (h) h.focus(); } }, icon('fa-solid fa-rotate-left'), ' Revert');
    form.append(...parts, summary, el('div', { class: 'nlab-form-acts' }, btnPing, btnApply, btnRevert), status);
    summary.hidden = true;

    form.addEventListener('submit', e => {
      e.preventDefault();
      const andPing = wantPing; wantPing = false;
      reg.forEach(r => { r.err.hidden = true; r.err.textContent = ''; r.ctl.removeAttribute('aria-invalid'); });
      const errs = validate(D0.id, draft);
      const keys = [...errs.keys()].filter(k => reg.has(k));
      if (keys.length) {
        keys.forEach(k => { const r = reg.get(k); r.err.textContent = errs.get(k); r.err.hidden = false; r.ctl.setAttribute('aria-invalid', 'true'); });
        summary.textContent = `Fix ${plural(keys.length, 'field')} before applying.`;
        summary.hidden = false;
        status.textContent = '';
        reg.get(keys[0]).ctl.focus();
        return;
      }
      summary.hidden = true;
      normalize(draft);
      Object.keys(draft.acls || {}).forEach(n => {
        if (JSON.stringify(draft.acls[n]) !== JSON.stringify(S[D0.id].acls[n])) Object.keys(hits).forEach(k => { if (k.indexOf(`${D0.id}|${n}|`) === 0) delete hits[k]; });
      });
      S[D0.id] = clone(draft);
      Object.assign(D0, clone(draft));
      updateLabels();
      if (cliRefresh) cliRefresh();
      status.textContent = andPing ? `Applied to ${D0.name}. Pinging…` : `Applied to ${D0.name}. Ping again to test it.`;
      if (andPing) {
        if (sheet && sheet.open) sheet.close();
        ping();
      }
    });
    return form;
  }

  function normalize(D) {
    const c = s => { const n = ip2n(s); return isIp(n) ? n2ip(n) : str(s); };
    D.ifaces.forEach(f => { f.ip = c(f.ip); });
    if ('gw' in D) D.gw = c(D.gw);
    if (D.hosts) D.hosts[NAME] = c(D.hosts[NAME]);
    (D.routes || []).forEach(r => { r.net = c(r.net); r.nh = c(r.nh); });
    Object.keys(D.acls || {}).forEach(n => D.acls[n].forEach(a => {
      a.src = fmtAddr(parseAddr(a.src)); a.dst = fmtAddr(parseAddr(a.dst));
      if (a.proto !== 'icmp') a.icmp = '';
    }));
  }

  function validate(id, D) {
    const errs = new Map();
    const unicast = (key, v, label) => {
      const n = ip2n(v);
      if (!isIp(n)) { errs.set(key, `${label}: enter four numbers 0–255 separated by dots, like 192.168.1.10.`); return null; }
      const a = n >>> 24;
      if (a === 0 || a === 127 || a >= 224) { errs.set(key, `${n2ip(n)} can’t be assigned to an interface (reserved, loopback or multicast range).`); return null; }
      return n;
    };
    const neighbours = seg => (SEGS[seg] || []).filter(x => x !== id).map(x => ({ dev: S[x], f: S[x].ifaces.find(q => q.seg === seg) })).filter(x => x.f);
    D.ifaces.forEach((f, i) => {
      const n = unicast(`ip${i}`, f.ip, 'IP address');
      const m = ip2n(f.mask);
      if (n == null || !maskOk(m)) return;
      if (n === netOf(n, m) || n === bcastOf(n, m)) { errs.set(`ip${i}`, `${n2ip(n)} is the ${n === netOf(n, m) ? 'network' : 'broadcast'} address of ${cidr(n, m)}. Pick a host address.`); return; }
      const clash = neighbours(f.seg).find(x => fIp(x.f) === n);
      if (clash) { errs.set(`ip${i}`, `${n2ip(n)} is already used by ${clash.dev.name}${clash.dev.kind === 'router' ? ' ' + clash.f.short : ''} on this link.`); return; }
      D.ifaces.forEach((g, j) => {
        if (j >= i) return;
        const gn = ip2n(g.ip), gm = ip2n(g.mask);
        if (!isIp(gn) || !maskOk(gm)) return;
        const small = Math.min(m, gm) >>> 0;
        if (sameNet(n, gn, small)) errs.set(`ip${i}`, `Overlaps with ${g.short} (${cidr(gn, gm)}). Each router interface needs its own subnet.`);
      });
    });
    if ('gw' in D && str(D.gw)) {
      const g = ip2n(D.gw);
      if (!isIp(g)) errs.set('gw', 'Default gateway: enter an IPv4 address, or leave it empty.');
      else if (g === ip2n(D.ifaces[0].ip)) errs.set('gw', 'The default gateway can’t be the host’s own address.');
    }
    if (D.hosts && str(D.hosts[NAME]) && !isIp(ip2n(D.hosts[NAME]))) errs.set('hosts', 'Enter the IPv4 address the name should point to, or leave it empty.');
    (D.routes || []).forEach((r, i) => {
      const net = ip2n(r.net), m = ip2n(r.mask), nh = ip2n(r.nh);
      if (!isIp(net)) errs.set(`rt${i}.net`, 'Destination network: enter an IPv4 network address, like 10.0.0.0.');
      else if (maskOk(m) && netOf(net, m) !== net) errs.set(`rt${i}.net`, `%Inconsistent address and mask — ${n2ip(net)} has host bits set for /${bits(m)}; the network is ${n2ip(netOf(net, m))}.`);
      if (!isIp(nh)) errs.set(`rt${i}.nh`, 'Next hop: enter the IPv4 address of the neighbouring router.');
      else if (D.ifaces.some(f => ip2n(f.ip) === nh)) errs.set(`rt${i}.nh`, 'The next hop can’t be one of this router’s own addresses.');
    });
    Object.keys(D.acls || {}).forEach(name => D.acls[name].forEach((a, i) => {
      ['src', 'dst'].forEach(p => { if (!parseAddr(a[p])) errs.set(`acl:${name}:${i}.${p}`, 'Use any, host A.B.C.D, or A.B.C.D followed by a wildcard mask such as 0.0.0.255.'); });
    }));
    return errs;
  }

  /* ── 6g · faults: load / reset / new ── */
  function pickFault(exclude) {
    let pool = FAULTS.filter(f => f.id !== exclude && !store.solved[f.id]);
    if (!pool.length) pool = FAULTS.filter(f => f.id !== exclude);
    return pool[rnd(pool.length)];
  }
  function loadFault(f, keepCount) {
    cancelRun();
    fault = f;
    S = baseline();
    f.apply(S);
    hits = {}; logs = []; lastRes = null;
    if (!keepCount) {
      pings = 0; solved = false;
      termHist.length = 0;
      if (reward) { reward.hidden = true; reward.replaceChildren(); }
      if (ticketNo) ticketNo.textContent = `Ticket NL-${1000 + rnd(9000)}`;
    }
    clearMarks();
    if (sheet && sheet.open) sheet.close();
    if (selected) renderPanel(); else renderPanel();
    logEl.replaceChildren();
    addLog('', keepCount ? 'Configuration reset to how this ticket started. Your ping count is kept.' : `Press “Ping ${NAME}” to send one echo request from the Visitor PC. Every hop it takes is listed here.`, 'info');
    termRender();
    updateStats();
    updateLabels();
    place();
    if (hintsEl && !hintsEl.hidden) renderHints();
  }
  function newFault() { loadFault(pickFault(fault && fault.id), false); }
  /* demo / test hook: Renso can open a specific fault in an interview, the harness can drive the lab */
  window.__netlab = {
    faults: () => FAULTS.map(f => f.id),
    current: () => (fault ? fault.id : null),
    load: id => { const f = FAULTS.find(x => x.id === id); if (f) loadFault(f, false); return !!f; },
    ping: () => new Promise(res => { ping(); const t = setInterval(() => { if (!running) { clearInterval(t); res(lastRes); } }, 60); }),
    state: () => clone(S),
    fix: () => { if (fault) { fault.fix(S); if (selected) renderPanel(); updateLabels(); } }
  };

  pingBtn.addEventListener('click', () => { if (pingBtn.getAttribute('aria-disabled') !== 'true') ping(); });
  if (resetBtn) resetBtn.addEventListener('click', () => { if (fault) loadFault(fault, true); });
  if (newBtn) newBtn.addEventListener('click', newFault);

  /* ── 6h · Explore my build (owner data; renders nothing while empty) ── */
  (function explore() {
    const EX = NL.explore && typeof NL.explore === 'object' ? NL.explore : null;
    if (!EX) return;
    const devices = (Array.isArray(EX.devices) ? EX.devices : []).filter(d => d && str(d.name) && d.outputs && typeof d.outputs === 'object' && Object.keys(d.outputs).some(k => str(d.outputs[k])));
    const rows = (Array.isArray(EX.addressing) ? EX.addressing : []).filter(r => r && typeof r === 'object' && (str(r.device) || str(r.ip)));
    const tabs = $('nlabTabs'), fix = $('nlabFix'), pane = $('nlabExplore');
    if ((!devices.length && !rows.length) || !tabs || !fix || !pane) return;
    const tFix = el('button', { type: 'button', role: 'tab', class: 'nlab-tab', id: 'nlabTabFix', 'aria-controls': 'nlabFix', 'aria-selected': 'true' }, icon('fa-solid fa-screwdriver-wrench'), ' Break/Fix lab');
    const tExp = el('button', { type: 'button', role: 'tab', class: 'nlab-tab', id: 'nlabTabExp', 'aria-controls': 'nlabExplore', 'aria-selected': 'false', tabindex: '-1' }, icon('fa-solid fa-diagram-project'), ' Explore my build');
    tabs.replaceChildren(tFix, tExp);
    tabs.hidden = false;
    setAttrs(fix, { role: 'tabpanel', 'aria-labelledby': 'nlabTabFix' });
    setAttrs(pane, { role: 'tabpanel', 'aria-labelledby': 'nlabTabExp' });
    const pick = t => {
      [[tFix, fix], [tExp, pane]].forEach(([b, p]) => { const on = b === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; p.hidden = !on; });
      if (t === tFix) schedulePlace();
    };
    [tFix, tExp].forEach((b, i, all) => {
      b.addEventListener('click', () => pick(b));
      b.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        const nb = all[(e.key === 'Home' ? 0 : e.key === 'End' ? 1 : (i + 1) % 2)];
        pick(nb); nb.focus();
      });
    });
    const title = str(EX.title) || `${first}’s Packet Tracer build`;
    const kids = [el('h4', { class: 'nlab-ex-t', text: title })];
    if (str(EX.summary)) kids.push(el('p', { class: 'nlab-ex-p', text: str(EX.summary) }));
    if (str(EX.configuredBy)) kids.push(el('p', { class: 'nlab-ex-p' }, el('strong', { text: 'What I configured myself: ' }), str(EX.configuredBy)));
    const img = safeHref(EX.image);
    if (img) kids.push(el('figure', { class: 'nlab-ex-fig' }, el('img', { src: img, alt: str(EX.imageAlt) || `${title}: topology screenshot`, loading: 'lazy', decoding: 'async' })));
    if (devices.length) {
      const devBar = el('div', { class: 'nlab-cli-cmds', role: 'group', 'aria-label': 'Device' });
      const cmdBar = el('div', { class: 'nlab-cli-cmds', role: 'group', 'aria-label': 'Command' });
      const pre = el('pre', { class: 'nlab-term', id: 'topoCli', tabindex: '0', 'aria-label': 'Device output' });
      let di = 0, ci = 0;
      const draw = () => {
        const d = devices[di], cmds = Object.keys(d.outputs).filter(k => str(d.outputs[k]));
        ci = Math.min(ci, cmds.length - 1);
        devBar.replaceChildren(...devices.map((x, i) => el('button', { type: 'button', class: 'nlab-chipbtn', 'aria-pressed': String(i === di), onclick: () => { di = i; ci = 0; draw(); } }, str(x.name))));
        cmdBar.replaceChildren(...cmds.map((c, i) => el('button', { type: 'button', class: 'nlab-chipbtn', 'aria-pressed': String(i === ci), onclick: () => { ci = i; draw(); } }, c)));
        const pc = /^(pc|server|host|laptop)$/i.test(str(d.role));
        pre.replaceChildren(el('span', { class: 't-cmd', text: (pc ? 'C:\\>' : `${str(d.name)}#`) + cmds[ci] }), '\n', d.outputs[cmds[ci]]);
      };
      draw();
      kids.push(el('p', { class: 'nlab-hk', text: 'Device output' }), devBar, cmdBar, pre);
      if (str(devices[0].notes)) kids.push(el('p', { class: 'nlab-help', text: str(devices[0].notes) }));
    }
    if (rows.length) {
      const cols = [['device', 'Device'], ['interface', 'Interface'], ['ip', 'IP address'], ['mask', 'Subnet mask'], ['gateway', 'Default gateway']].filter(([k]) => rows.some(r => str(r[k])));
      kids.push(el('p', { class: 'nlab-hk', text: 'Addressing table' }),
        el('div', { class: 'nlab-tablewrap', role: 'region', 'aria-label': 'Addressing table', tabindex: '0' },
          el('table', { class: 'nlab-table' },
            el('thead', null, el('tr', null, cols.map(([, h]) => el('th', { scope: 'col', text: h })))),
            el('tbody', null, rows.map(r => el('tr', null, cols.map(([k]) => el('td', { text: str(r[k]) }))))))));
    }
    const pkt = safeHref(EX.pkt);
    if (pkt) kids.push(el('a', { class: 'nlab-btn', href: pkt, download: '' }, icon('fa-solid fa-download'), ' Download the .pkt file'));
    pane.replaceChildren(...kids);
  })();

  /* ── 6i · boot ── */
  let placeQueued = false;
  function schedulePlace() { if (placeQueued) return; placeQueued = true; requestAnimationFrame(() => { placeQueued = false; place(); }); }
  if (window.ResizeObserver) new ResizeObserver(schedulePlace).observe(stage);
  else window.addEventListener('resize', schedulePlace, { passive: true });
  loadFault(pickFault(null), false);
})();
