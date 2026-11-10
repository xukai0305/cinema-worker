import { ROOMS as DEFAULT } from './rooms.js';
const EPOCH = Date.UTC(2026, 0, 1);
const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,x-admin,range',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'content-type': 'application/json' };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: H });
const clamp = (v, a, b, d) => Math.max(a, Math.min(b, Math.round(+v) || d));
function clean(list) {
  const seen = new Set(), out = [];
  for (const l of (Array.isArray(list) ? list : []).slice(0, 20)) {
    const id = /^\w{1,12}$/.test(l.id || '') && !seen.has(l.id) ? l.id : Math.random().toString(36).slice(2, 8);
    seen.add(id);
    const rv = Array.isArray(l.videos) && l.videos.length ? l.videos : [l.video], rt = Array.isArray(l.vt) ? l.vt : [];
    const pr = rv.map((x, i) => [String(x || '').trim().slice(0, 500), String(rt[i] || '').slice(0, 40)]).filter(p => p[0]).slice(0, 30);
    const vs = pr.map(p => p[0]), vt = pr.map(p => p[1]);
    const pst = String(l.poster || '');
    const th0 = ['cinema', 'dvd'].includes(l.theme) ? l.theme : 'cinema';
    const url = x => /^https?:\/\//.test(String(x || '')) ? String(x).slice(0, 500) : '';
    out.push({ id, title: String(l.title || '제목 없음').slice(0, 40), video: vs[0] || '', videos: vs, vt,
      theme: th0, xb: (Array.isArray(l.xb) ? l.xb : []).map(url).filter(Boolean).slice(0, 2), bigBanner: url(l.bigBanner), roseText: String(l.roseText || '').slice(0, 24),
      banner: String(l.banner || '').slice(0, 40), notice: String(l.notice || '').slice(0, 60), waitImg: url(l.waitImg),
      photos: (Array.isArray(l.photos) ? l.photos : []).map(url).filter(Boolean).slice(0, th0 === 'dvd' ? 18 : 10),
      goods: (Array.isArray(l.goods) ? l.goods : []).map(g => ({ n: String((g && g.n) || '').slice(0, 30), u: url(g && g.u) })).filter(g => g.u).slice(0, 12),
      durs: Array.isArray(l.durs) && l.durs.length === vs.length ? l.durs.map(x => clamp(x, 0, 86400, 0)) : [], loop: !!l.loop,
      rows: th0 === 'dvd' ? 1 : th0 === 'cafe' ? clamp(l.rows, 1, 5, 3) : clamp(l.rows, 1, 15, 11), cols: th0 === 'dvd' ? 5 : th0 === 'cafe' ? clamp(l.cols, 1, 8, 4) : clamp(l.cols, 1, 20, 12),
      cpType: ['link', 'code'].includes(l.cpType) ? l.cpType : '', cpValue: String(l.cpValue || '').slice(0, 300), cpLabel: String(l.cpLabel || '').slice(0, 30), egg: !!l.egg,
      startAt: Math.max(0, Math.round(+l.startAt) || 0), dur: clamp(l.dur, 0, 86400, 0),
      repeat: [1, 7, -1].includes(+l.repeat) ? +l.repeat : 0,
      poster: /^https?:\/\//.test(pst) ? pst.slice(0, 500) : (/^data:image\/(jpeg|png|webp);base64,[\w+\/=]+$/.test(pst) && pst.length <= 60000 ? pst : ''),
      code: String(l.code || '').trim().slice(0, 20) });
  }
  return out;
}
let RC = { t: 0, v: null };
const cfg = env => env.ROOM.get(env.ROOM.idFromName('__cfg'));
async function getRooms(env) {
  try { const s = await (await cfg(env).fetch('https://do/cfg')).json(); if (Array.isArray(s)) return s.map(r => ['cinema', 'dvd'].includes(r.theme) ? r : { ...r, theme: 'cinema' }); } catch {}
  return DEFAULT.map((r, i) => ({ ...r, id: String(i + 1), rows: r.rows || 11, cols: r.cols || 12, startAt: r.startAt || 0, dur: r.dur || 0, repeat: r.repeat || 0, poster: r.poster || '', code: r.code || '', videos: r.videos || (r.video ? [r.video] : []), durs: r.durs || [], loop: !!r.loop, vt: r.vt || [], theme: r.theme || 'cinema', banner: r.banner || '', notice: r.notice || '', waitImg: r.waitImg || '', photos: r.photos || [], goods: r.goods || [], xb: r.xb || [], bigBanner: r.bigBanner || '', roseText: r.roseText || '' }));
}

const sign = async (env, url) => {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ADMIN_PW || 'x'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const b = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(url)));
  return [...b.slice(0, 12)].map(x => x.toString(16).padStart(2, '0')).join('');
};
// 영상 프록시: CORS·Referer(핫링크) 때문에 직접 재생이 안 되는 영상을 서버가 대신 받아서 전달해요
async function proxy(req, env, u) {
  let t; try { t = new URL(u.searchParams.get('u') || ''); } catch { return new Response('bad url', { status: 400, headers: H }); }
  if (!/^https?:$/.test(t.protocol)) return new Response('bad url', { status: 400, headers: H });
  const sig = u.searchParams.get('s') || '';
  let ok = sig && sig === await sign(env, t.href);
  if (!ok) {
    for (const r of await getRooms(env)) for (const v of (r.videos && r.videos.length ? r.videos : [r.video])) { try { if (new URL(v).host === t.host) ok = true; } catch {} }
  }
  if (!ok) return new Response('forbidden', { status: 403, headers: H });
  const h = new Headers({ 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' });
  if (req.headers.get('range')) h.set('range', req.headers.get('range'));
  const res = await fetch(t.href, { headers: h, redirect: 'follow' });
  const ct = res.headers.get('content-type') || '';
  if (/mpegurl/i.test(ct) || /\.m3u8$/i.test(t.pathname)) {
    const base = res.url || t.href, self = u.origin + '/api/proxy?u=';
    const wrap = async x => { const a = new URL(x, base).href; return self + encodeURIComponent(a) + '&s=' + await sign(env, a); };
    const lines = (await res.text()).split('\n'), out = [];
    for (const ln of lines) {
      const l = ln.trim();
      if (!l) out.push(ln);
      else if (l.startsWith('#')) {
        const m = [...l.matchAll(/URI="([^"]+)"/g)]; let r = l;
        for (const x of m) r = r.replace(x[0], 'URI="' + await wrap(x[1]) + '"');
        out.push(r);
      } else out.push(await wrap(l));
    }
    return new Response(out.join('\n'), { status: res.status, headers: { ...H, 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'no-store' } });
  }
  const oh = new Headers(res.headers);
  oh.delete('set-cookie'); oh.set('Access-Control-Allow-Origin', '*');
  oh.set('Access-Control-Expose-Headers', 'content-length,content-range,accept-ranges');
  oh.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return new Response(res.body, { status: res.status, headers: oh });
}

export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
    if (u.pathname === '/api/proxy' && req.method === 'GET') return proxy(req, env, u);
    const im = u.pathname.match(/^\/api\/img\/([0-9a-f]{12})$/);
    if (im && req.method === 'GET') {
      const ck = caches.default, hit = await ck.match(req);
      if (hit) return hit;
      const r = await cfg(env).fetch('https://do/img?id=' + im[1]);
      if (r.status !== 200) return new Response('not found', { status: 404, headers: H });
      const res = new Response(r.body, { headers: { 'content-type': r.headers.get('content-type') || 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' } });
      ctx.waitUntil(ck.put(req, res.clone()));
      return res;
    }
    if (u.pathname === '/api/coupon' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})), r = (await getRooms(env)).find(x => x.id === b.id);
      if (!r || (r.code && String(b.code || '') !== r.code) || !r.cpType || !r.cpValue) return J({ ok: false }, 404);
      return J({ ok: true, type: r.cpType, value: r.cpValue, label: r.cpLabel || '쿠폰' });
    }
    if (u.pathname === '/api/rooms') {
      if (RC.v && Date.now() - RC.t < 3000) return new Response(RC.v, { headers: H });
      const rooms = await Promise.all((await getRooms(env)).map(async (r, i) => {
        let n = 0;
        try { n = (await (await env.ROOM.get(env.ROOM.idFromName(r.id)).fetch('https://do/count')).json()).n; } catch {}
        const { code, cpValue, ...pub } = r; pub.hasCp = !!(r.cpType && cpValue);
        return { ...pub, video: code ? '' : r.video, videos: code ? [] : (r.videos && r.videos.length ? r.videos : (r.video ? [r.video] : [])), vt: code ? [] : (r.vt || []), goods: code ? [] : (r.goods || []), photos: code ? [] : (r.photos || []), priv: !!code, hall: i + 1, n };
      }));
      const body = JSON.stringify({ epoch: EPOCH, rooms }); RC = { t: Date.now(), v: body };
      return new Response(body, { headers: H });
    }
    if (u.pathname === '/api/join' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})), r = (await getRooms(env)).find(x => x.id === b.id);
      if (!r) return J({ ok: false, err: '없는 상영관이에요' }, 404);
      if (r.code && String(b.code || '') !== r.code) return J({ ok: false, err: '상영 코드가 맞지 않아요' }, 403);
      return J({ ok: true, video: r.video, videos: r.videos && r.videos.length ? r.videos : (r.video ? [r.video] : []), vt: r.vt || [], goods: r.goods || [], photos: r.photos || [] });
    }
    if (u.pathname.startsWith('/api/admin/')) {
      if (!env.ADMIN_PW) return J({ ok: false, err: 'ADMIN_PW 비밀번호가 서버에 설정되지 않았어요' });
      if (req.headers.get('x-admin') !== env.ADMIN_PW) return J({ ok: false, err: '비밀번호가 맞지 않아요' }, 401);
      if (u.pathname === '/api/admin/check') return J({ ok: true, rooms: await getRooms(env) });
      if (u.pathname === '/api/admin/rooms' && req.method === 'POST') {
        const list = clean(await req.json().catch(() => []));
        await cfg(env).fetch('https://do/cfg', { method: 'POST', body: JSON.stringify(list) }); RC = { t: 0, v: null };
        return J({ ok: true });
      }
      if (u.pathname === '/api/admin/img' && req.method === 'POST') {
        const b = await req.arrayBuffer(), ct = (req.headers.get('content-type') || '').split(';')[0];
        if (!/^image\/(jpeg|png|webp)$/.test(ct) || b.byteLength > 900000 || b.byteLength < 100) return J({ ok: false, err: '이미지 형식이나 크기가 올바르지 않아요' }, 400);
        const id = [...crypto.getRandomValues(new Uint8Array(6))].map(x => x.toString(16).padStart(2, '0')).join('');
        await cfg(env).fetch('https://do/img?id=' + id + '&ct=' + encodeURIComponent(ct), { method: 'POST', body: b });
        return J({ ok: true, url: u.origin + '/api/img/' + id });
      }
    }
    const m = u.pathname.match(/^\/ws\/(\w+)$/);
    if (m) {
      const r = (await getRooms(env)).find(x => x.id === m[1]);
      if (r) {
        if (r.code && u.searchParams.get('k') !== r.code) return new Response('forbidden', { status: 403 });
        u.searchParams.set('r', r.rows); u.searchParams.set('c', r.cols);
        return env.ROOM.get(env.ROOM.idFromName(r.id)).fetch(new Request(u, req));
      }
    }
    return new Response('cinema ok');
  },
};

const lk = o => ({ c: Number.isInteger(o && o.c) && o.c >= 0 && o.c < 5 ? o.c : -1, h: Number.isInteger(o && o.h) && o.h >= 0 && o.h < 3 ? o.h : 0 });

export class Room {
  constructor(state) { this.st = state.storage; this.c = new Map(); this.seats = {}; this.rows = 11; this.cols = 12; this.dirty = new Set(); this.tm = 0; }
  flush() { this.tm = 0; const a = []; for (const q of this.dirty) if (this.c.has(q.ws)) a.push([q.id, q.x, q.z, q.ry, q.sit ? 1 : 0]); this.dirty.clear(); if (a.length) this.bc({ t: 'ps', a }); }
  bc(o, ex) { const s = JSON.stringify(o); for (const [w] of this.c) if (w !== ex) try { w.send(s); } catch {} }
  pub(p) { return { t: 'p', id: p.id, name: p.name, seat: p.seat, x: p.x, z: p.z, ry: p.ry, sit: p.sit, act: p.act || '', look: p.look || null }; }
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === '/cfg') {
      if (req.method === 'POST') {
        const rooms = await req.json(); await this.st.put('rooms', rooms);
        try { // 안 쓰는 이미지 정리 (올린 지 1시간 지난 것만)
          const used = new Set([...JSON.stringify(rooms).matchAll(/\/api\/img\/([0-9a-f]{12})/g)].map(m => m[1])), metas = await this.st.list({ prefix: 'im:' });
          for (const [k, v] of metas) { const id = k.slice(3); if (!used.has(id) && Date.now() - (v.t || 0) > 3600e3) await this.st.delete(['im:' + id, 'img:' + id]); }
        } catch {}
        return Response.json({ ok: true });
      }
      return Response.json((await this.st.get('rooms')) ?? null);
    }
    if (u.pathname === '/img') {
      const id = u.searchParams.get('id') || '';
      if (!/^[0-9a-f]{12}$/.test(id)) return new Response('bad', { status: 400 });
      if (req.method === 'POST') { await this.st.put('img:' + id, { ct: u.searchParams.get('ct') || 'image/jpeg', b: await req.arrayBuffer() }); await this.st.put('im:' + id, { t: Date.now() }); return Response.json({ ok: true }); }
      const o = await this.st.get('img:' + id);
      return o ? new Response(o.b, { headers: { 'content-type': o.ct } }) : new Response('nf', { status: 404 });
    }
    if (u.pathname === '/count') return Response.json({ n: Object.keys(this.seats).length });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('ws only', { status: 426 });
    if (u.searchParams.get('r')) { this.rows = +u.searchParams.get('r'); this.cols = +u.searchParams.get('c'); }
    const [cl, sv] = Object.values(new WebSocketPair());
    sv.accept();
    const p = { id: crypto.randomUUID().slice(0, 8), name: '관객', seat: null, x: 0, z: 0, ry: 0, sit: true, ws: sv };
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
        p.seat = s; p.sit = true; p.look = lk(m.look); p.name = String(m.name || '관객').slice(0, 20); this.seats[s] = p.id;
        sv.send(JSON.stringify({ t: 'seat_ok', seat: s }));
        this.bc({ t: 'seats', seats: this.seats });
        this.bc(this.pub(p), sv);
      } else if (!p.seat) return;
      else if (m.t === 'move') { p.x = +m.x || 0; p.z = +m.z || 0; p.ry = +m.ry || 0; p.sit = !!m.sit; this.dirty.add(p); if (!this.tm) this.tm = setTimeout(() => this.flush(), 120); }
      else if (m.t === 'chat') this.bc({ t: 'chat', id: p.id, m: String(m.m).slice(0, 60) });
      else if (m.t === 'react' && ['🐷', '🧡', '💜', '❤️'].includes(m.e)) this.bc({ t: 'react', id: p.id, e: m.e });
      else if (m.t === 'look') { p.look = lk(m); this.bc(this.pub(p), sv); }
      else if (m.t === 'act') { p.act = ['lo', 'lp', 'pc', 'sq'].includes(m.a) ? m.a : ''; this.bc(this.pub(p), sv); }
    });
    const bye = () => {
      if (!this.c.delete(sv)) return; this.dirty.delete(p);
      if (p.seat) { delete this.seats[p.seat]; this.bc({ t: 'leave', id: p.id }); this.bc({ t: 'seats', seats: this.seats }); }
    };
    sv.addEventListener('close', bye); sv.addEventListener('error', bye);
    return new Response(null, { status: 101, webSocket: cl });
  }
}
