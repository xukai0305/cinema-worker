// 관(영상) 추가: ROOMS에 한 줄만 더하면 됨
const EPOCH = Date.UTC(2026, 0, 1);
const ROOMS = [
  { id: '797', title: '닉쭈', sub: '닉쭈시네마 797관',
    video: 'https://res.cloudinary.com/dduysrkk7/video/upload/vc_h264,ac_aac,f_mp4/v1792340486/p099zm2lmgxvdhezumac.mp4' },
];
const H = { 'Access-Control-Allow-Origin': '*', 'content-type': 'application/json' };

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === '/api/rooms') {
      const rooms = await Promise.all(ROOMS.map(async r => {
        let n = 0;
        try { n = (await (await env.ROOM.get(env.ROOM.idFromName(r.id)).fetch('https://do/count')).json()).n; } catch {}
        return { ...r, n };
      }));
      return new Response(JSON.stringify({ epoch: EPOCH, rooms }), { headers: H });
    }
    const m = u.pathname.match(/^\/ws\/(\w+)$/);
    if (m && ROOMS.some(r => r.id === m[1])) return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(req);
    return new Response('cinema ok');
  },
};

export class Room {
  constructor() { this.c = new Map(); this.seats = {}; }
  bc(o, ex) { const s = JSON.stringify(o); for (const [w] of this.c) if (w !== ex) try { w.send(s); } catch {} }
  pub(p) { return { t: 'p', id: p.id, name: p.name, seat: p.seat, x: p.x, z: p.z, ry: p.ry, sit: p.sit }; }
  async fetch(req) {
    if (new URL(req.url).pathname === '/count') return Response.json({ n: Object.keys(this.seats).length });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('ws only', { status: 426 });
    const [cl, sv] = Object.values(new WebSocketPair());
    sv.accept();
    const p = { id: crypto.randomUUID().slice(0, 8), name: '관객', seat: null, x: 0, z: 0, ry: 0, sit: true };
    this.c.set(sv, p);
    sv.send(JSON.stringify({ t: 'init', id: p.id, now: Date.now(), seats: this.seats,
      players: [...this.c.values()].filter(q => q.seat && q !== p).map(q => this.pub(q)) }));
    sv.addEventListener('message', e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'seat') {
        const s = String(m.seat);
        if (!/^[A-K]([1-9]|1[0-2])$/.test(s) || (this.seats[s] && this.seats[s] !== p.id))
          return sv.send(JSON.stringify({ t: 'seat_fail' }));
        if (p.seat) delete this.seats[p.seat];
        p.seat = s; p.sit = true; p.name = String(m.name || '관객').slice(0, 20); this.seats[s] = p.id;
        sv.send(JSON.stringify({ t: 'seat_ok', seat: s }));
        this.bc({ t: 'seats', seats: this.seats });
        this.bc(this.pub(p), sv);
      } else if (!p.seat) return;
      else if (m.t === 'move') { p.x = +m.x || 0; p.z = +m.z || 0; p.ry = +m.ry || 0; p.sit = !!m.sit; this.bc(this.pub(p), sv); }
      else if (m.t === 'chat') this.bc({ t: 'chat', id: p.id, m: String(m.m).slice(0, 60) });
      else if (m.t === 'react') this.bc({ t: 'react', id: p.id });
    });
    const bye = () => {
      if (!this.c.delete(sv)) return;
      if (p.seat) { delete this.seats[p.seat]; this.bc({ t: 'leave', id: p.id }); this.bc({ t: 'seats', seats: this.seats }); }
    };
    sv.addEventListener('close', bye); sv.addEventListener('error', bye);
    return new Response(null, { status: 101, webSocket: cl });
  }
}
