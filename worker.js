import { ROOMS as DEFAULT } from './rooms.js';
const EPOCH = Date.UTC(2026, 0, 1);
const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,x-admin',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'content-type': 'application/json' };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: H });
const clamp = (v, a, b, d) => Math.max(a, Math.min(b, Math.round(+v) || d));
function clean(list) {
  const seen = new Set(), out = [];
  for (const l of (Array.isArray(list) ? list : []).slice(0, 20)) {
    const id = /^\w{1,12}$/.test(l.id || '') && !seen.has(l.id) ? l.id : Math.random().toString(36).slice(2, 8);
    seen.add(id);
    out.push({ id, title: String(l.title || '제목 없음').slice(0, 40), video: String(l.video || '').slice(0, 500),
      rows: clamp(l.rows, 1, 15, 11), cols: clamp(l.cols, 1, 20, 12),
      startAt: Math.max(0, Math.round(+l.startAt) || 0), dur: clamp(l.dur, 0, 86400, 0) });
  }
  return out;
}
const cfg = env => env.ROOM.get(env.ROOM.idFromName('__cfg'));
async function getRooms(env) {
  try { const s = await (await cfg(env).fetch('https://do/cfg')).json(); if (Array.isArray(s)) return s; } catch {}
  return DEFAULT.map((r, i) => ({ ...r, id: String(i + 1), rows: r.rows || 11, cols: r.cols || 12, startAt: r.startAt || 0, dur: r.dur || 0 }));
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
    if (u.pathname === '/api/rooms') {
      const rooms = await Promise.all((await getRooms(env)).map(async (r, i) => {
        let n = 0;
        try { n = (await (await env.ROOM.get(env.ROOM.idFromName(r.id)).fetch('https://do/count')).json()).n; } catch {}
        return { ...r, hall: i + 1, n };
      }));
      return J({ epoch: EPOCH, rooms });
    }
    if (u.pathname.startsWith('/api/admin/')) {
      if (!env.ADMIN_PW) return J({ ok: false, err: 'ADMIN_PW 비밀번호가 서버에 설정되지 않았어요' });
      if (req.headers.get('x-admin') !== env.ADMIN_PW) return J({ ok: false, err: '비밀번호가 맞지 않아요' }, 401);
      if (u.pathname === '/api/admin/check') return J({ ok: true });
      if (u.pathname === '/api/admin/rooms' && req.method === 'POST') {
        const list = clean(await req.json().catch(() => []));
        await cfg(env).fetch('https://do/cfg', { method: 'POST', body: JSON.stringify(list) });
        return J({ ok: true });
      }
    }
    const m = u.pathname.match(/^\/ws\/(\w+)$/);
    if (m) {
      const r = (await getRooms(env)).find(x => x.id === m[1]);
      if (r) {
        u.searchParams.set('r', r.rows); u.searchParams.set('c', r.cols);
        return env.ROOM.get(env.ROOM.idFromName(r.id)).fetch(new Request(u, req));
      }
    }
    return new Response('cinema ok');
  },
};

export class Room {
  constructor(state) { this.st = state.storage; this.c = new Map(); this.seats = {}; this.rows = 11; this.cols = 12; }
  bc(o, ex) { const s = JSON.stringify(o); for (const [w] of this.c) if (w !== ex) try { w.send(s); } catch {} }
  pub(p) { return { t: 'p', id: p.id, name: p.name, seat: p.seat, x: p.x, z: p.z, ry: p.ry, sit: p.sit }; }
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === '/cfg') {
      if (req.method === 'POST') { await this.st.put('rooms', await req.json()); return Response.json({ ok: true }); }
      return Response.json((await this.st.get('rooms')) ?? null);
    }
    if (u.pathname === '/count') return Response.json({ n: Object.keys(this.seats).length });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('ws only', { status: 426 });
    if (u.searchParams.get('r')) { this.rows = +u.searchParams.get('r'); this.cols = +u.searchParams.get('c'); }
    const [cl, sv] = Object.values(new WebSocketPair());
    sv.accept();
    const p = { id: crypto.randomUUID().slice(0, 8), name: '관객', seat: null, x: 0, z: 0, ry: 0, sit: true };
    this.c.set(sv, p);
    sv.send(JSON.stringify({ t: 'init', id: p.id, now: Date.now(), seats: this.seats,
      players: [...this.c.values()].filter(q => q.seat && q !== p).map(q => this.pub(q)) }));
    sv.addEventListener('message', e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'ping') return sv.send('{"t":"pong"}');
      if (m.t === 'seat') {
        const s = String(m.seat), ri = 'ABCDEFGHIJKLMNO'.indexOf(s[0]), n = +s.slice(1);
        if (ri < 0 || ri >= this.rows || !Number.isInteger(n) || n < 1 || n > this.cols || (this.seats[s] && this.seats[s] !== p.id))
          return sv.send(JSON.stringify({ t: 'seat_fail' }));
        if (p.seat) delete this.seats[p.seat];
        p.seat = s; p.sit = true; p.name = String(m.name || '관객').slice(0, 20); this.seats[s] = p.id;
        sv.send(JSON.stringify({ t: 'seat_ok', seat: s }));
        this.bc({ t: 'seats', seats: this.seats });
        this.bc(this.pub(p), sv);
      } else if (!p.seat) return;
      else if (m.t === 'move') { p.x = +m.x || 0; p.z = +m.z || 0; p.ry = +m.ry || 0; p.sit = !!m.sit; this.bc(this.pub(p), sv); }
      else if (m.t === 'chat') this.bc({ t: 'chat', id: p.id, m: String(m.m).slice(0, 60) });
      else if (m.t === 'react' && ['🐷', '🧡', '💜', '❤️'].includes(m.e)) this.bc({ t: 'react', id: p.id, e: m.e });
    });
    const bye = () => {
      if (!this.c.delete(sv)) return;
      if (p.seat) { delete this.seats[p.seat]; this.bc({ t: 'leave', id: p.id }); this.bc({ t: 'seats', seats: this.seats }); }
    };
    sv.addEventListener('close', bye); sv.addEventListener('error', bye);
    return new Response(null, { status: 101, webSocket: cl });
  }
}
