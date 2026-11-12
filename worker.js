import { ROOMS as DEFAULT } from './rooms.js';
const IMGBB_MAX=32000000, MP4_MAX=20*1024*1024, IMAGE_CHUNK=1024*1024;
const chunkKey=(id,i)=>'imgpart:'+id+':'+i;
const bannerSeconds=value=>Number.isInteger(value)&&value>=3&&value<=60?value:9;
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
      theme: th0, special: !!l.special, hidden: !!l.hidden,
      banner: String(l.banner || '').slice(0, 40), notice: String(l.notice || '').slice(0, 60), waitImg: url(l.waitImg), endImg: url(l.endImg),
      photos: (Array.isArray(l.photos) ? l.photos : []).map(url).filter(Boolean).slice(0, th0 === 'dvd' ? 18 : 10),
      goods: (Array.isArray(l.goods) ? l.goods : []).map(g => ({ n: String((g && g.n) || '').slice(0, 30), u: url(g && g.u) })).filter(g => g.u).slice(0, 12),
      durs: Array.isArray(l.durs) && l.durs.length === vs.length ? l.durs.map(x => clamp(x, 0, 86400, 0)) : [], loop: !!l.loop,
      rows: th0 === 'dvd' ? 1 : clamp(l.rows, 1, 15, 11), cols: th0 === 'dvd' ? 5 : clamp(l.cols, 1, 20, 12),
      cpType: ['link', 'code'].includes(l.cpType) ? l.cpType : '', cpValue: String(l.cpValue || '').slice(0, 300), cpLabel: String(l.cpLabel || '').slice(0, 30), egg: !!l.egg,
      eggPrizes: (Array.isArray(l.eggPrizes) ? l.eggPrizes : []).map(p => ({ label: String((p && p.label) || '').slice(0, 30) || '쿠폰', type: ['code', 'link', 'none'].includes(p && p.type) ? p.type : 'code', value: String((p && p.value) || '').slice(0, 300), w: clamp(p && p.w, 0, 1000, 0) })).filter(p => p.type === 'none' || p.value).slice(0, 10),
      startAt: Math.max(0, Math.round(+l.startAt) || 0), dur: clamp(l.dur, 0, 86400, 0),
      repeat: [1, 7, -1].includes(+l.repeat) ? +l.repeat : 0,
      poster: /^https?:\/\//.test(pst) ? pst.slice(0, 500) : (/^data:image\/(jpeg|png|webp);base64,[\w+\/=]+$/.test(pst) && pst.length <= 60000 ? pst : ''),
      code: String(l.code || '').trim().slice(0, 20) });
  }
  return out;
}
let RC = { t: 0, v: null };
const cfg = env => env.ROOM.get(env.ROOM.idFromName('__cfg'));
async function getBannerSeconds(env){
  try{return bannerSeconds(await (await cfg(env).fetch('https://do/banner')).json())}catch{return 9}
}
async function getRooms(env) {
  try { const s = await (await cfg(env).fetch('https://do/cfg')).json(); if (Array.isArray(s)) return s.map(r => ['cinema', 'dvd'].includes(r.theme) ? r : { ...r, theme: 'cinema' }); } catch {}
  return DEFAULT.map((r, i) => ({ ...r, id: String(i + 1), rows: r.rows || 11, cols: r.cols || 12, startAt: r.startAt || 0, dur: r.dur || 0, repeat: r.repeat || 0, poster: r.poster || '', code: r.code || '', videos: r.videos || (r.video ? [r.video] : []), durs: r.durs || [], loop: !!r.loop, vt: r.vt || [], theme: r.theme || 'cinema', banner: r.banner || '', notice: r.notice || '', waitImg: r.waitImg || '', photos: r.photos || [], goods: r.goods || [] }));
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

async function saveMedia(env,origin,b,ct){
  const id=[...crypto.getRandomValues(new Uint8Array(6))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const saved=await cfg(env).fetch('https://do/img?id='+id+'&ct='+encodeURIComponent(ct),{method:'POST',body:b});
  if(!saved.ok)return J({ok:false,err:'파일 저장에 실패했어요'},502);
  const suffix=ct==='video/mp4'?'.mp4':ct==='image/gif'?'?format=gif':'';
  return J({ok:true,url:origin+'/api/img/'+id+suffix});
}
const isMP4=b=>b.byteLength>=16&&new TextDecoder().decode(b.slice(4,8))==='ftyp';
async function uploadToImgBB(env,req,type){
  if(!env.IMGBB_API_KEY)return J({ok:false,err:'Cloudflare 워커에 IMGBB_API_KEY를 Secret으로 설정해 주세요'},503);
  if(!req.body)return J({ok:false,err:'이미지 파일을 읽을 수 없어요'},400);
  const endpoint=new URL('https://api.imgbb.com/1/upload');
  endpoint.searchParams.set('key',env.IMGBB_API_KEY.trim());
  const boundary='sosocinema-'+crypto.randomUUID(),ext=type==='image/jpeg'?'jpg':type.split('/')[1];
  const enc=new TextEncoder();
  const head=enc.encode('--'+boundary+'\r\nContent-Disposition: form-data; name="image"; filename="poster.'+ext+'"\r\nContent-Type: '+type+'\r\n\r\n');
  const tail=enc.encode('\r\n--'+boundary+'--\r\n');
  const gif=type==='image/gif',signature=new Uint8Array(6);
  let count=0,invalid=0;
  const multipart=req.body.pipeThrough(new TransformStream({
    start(controller){controller.enqueue(head)},
    transform(chunk,controller){
      if(count+chunk.byteLength>IMGBB_MAX){invalid=413;throw new Error('size')}
      if(gif&&count<6){
        signature.set(chunk.subarray(0,6-count),count);
        if(count+chunk.byteLength>=6&&!/^GIF8[79]a$/.test(new TextDecoder().decode(signature))){
          invalid=400;throw new Error('signature');
        }
      }
      count+=chunk.byteLength;
      controller.enqueue(chunk);
    },
    flush(controller){
      if(count<(gif?14:1)){invalid=400;throw new Error('empty')}
      controller.enqueue(tail);
    }
  }));
  const timeout=AbortSignal.timeout(90000);
  const length=Number(req.headers.get('content-length'));
  let body=multipart;
  if(Number.isSafeInteger(length)&&length>0&&typeof FixedLengthStream!=='undefined'){
    const fixed=new FixedLengthStream(head.byteLength+length+tail.byteLength);
    multipart.pipeTo(fixed.writable,{signal:timeout}).catch(()=>{});
    body=fixed.readable;
  }
  const fileError=()=>invalid===413
    ? J({ok:false,err:'이미지는 32MB 이하로 올려 주세요'},413)
    : J({ok:false,err:'이미지 파일을 읽을 수 없어요'},400);
  try{
    const response=await fetch(endpoint.href,{
      method:'POST',body,headers:{'content-type':'multipart/form-data; boundary='+boundary},
      redirect:'manual',signal:timeout
    });
    const data=await response.json().catch(()=>null);
    if(invalid)return fileError();
    const url=data?.data?.image?.url||data?.data?.url;
    if(!response.ok||!data?.success||typeof url!=='string'||!/^https:\/\/i\.ibb\.co\//i.test(url))
      return J({ok:false,err:'ImgBB에 이미지를 저장하지 못했어요 (HTTP '+response.status+')'},502);
    return J({ok:true,url});
  }catch{
    if(invalid)return fileError();
    return J({ok:false,err:timeout.aborted?'ImgBB 업로드 응답이 90초 안에 오지 않았어요.':'Cloudflare 워커가 ImgBB로 파일을 전송하는 중 연결이 끊겼어요.'},502);
  }
}
function mediaRange(header,size){
  if(!header)return {start:0,end:size-1};
  const m=/^bytes=(\d*)-(\d*)$/.exec(header);
  if(!m||(!m[1]&&!m[2]))return null;
  const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
  const end=m[1]&&m[2]?Math.min(size-1,Number(m[2])):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size)return null;
  return {start,end};
}

export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
    if (u.pathname === '/api/proxy' && req.method === 'GET') return proxy(req, env, u);
    const im = u.pathname.match(/^\/api\/img\/([0-9a-f]{12})(\.mp4)?$/);
    if (im && req.method === 'GET') {
      const range=im[2]?req.headers.get('range'):null;
      const ck=caches.default,hit=range?null:await ck.match(req);
      if(hit)return hit;
      const r=await cfg(env).fetch('https://do/img?id='+im[1],range?{headers:{range}}:undefined);
      if(r.status===404)return new Response('not found',{status:404,headers:H});
      const headers=new Headers(r.headers);
      headers.set('Access-Control-Allow-Origin','*');
      headers.set('Cross-Origin-Resource-Policy','cross-origin');
      if(r.ok)headers.set('cache-control','public, max-age=31536000, immutable');
      const res=new Response(r.body,{status:r.status,headers});
      if(r.status===200&&!range)ctx.waitUntil(ck.put(req,res.clone()));
      return res;
    }
    if (u.pathname === '/api/egg' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})), r = (await getRooms(env)).find(x => x.id === b.id);
      if (!r || r.hidden || !r.egg || !(r.eggPrizes || []).length || (r.code && String(b.code || '') !== r.code)) return J({ ok: false, err: '지금은 참여할 수 없어요' }, 404);
      const cid = String(b.cid || '').slice(0, 64); if (cid.length < 8) return J({ ok: false }, 400);
      const rr = await env.ROOM.get(env.ROOM.idFromName(r.id)).fetch('https://do/egg', { method: 'POST', body: JSON.stringify({ cid, ip: req.headers.get('cf-connecting-ip') || '', prizes: r.eggPrizes }) });
      return J(await rr.json(), rr.status);
    }
    if (u.pathname === '/api/coupon' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})), r = (await getRooms(env)).find(x => x.id === b.id);
      if (!r || (r.code && String(b.code || '') !== r.code) || !r.cpType || !r.cpValue) return J({ ok: false }, 404);
      return J({ ok: true, type: r.cpType, value: r.cpValue, label: r.cpLabel || '쿠폰' });
    }
    if (u.pathname === '/api/rooms') {
      if (RC.v && Date.now() - RC.t < 3000) return new Response(RC.v, { headers: H });
      const rooms = (await Promise.all((await getRooms(env)).map(async (r, i) => {
        let n = 0;
        try { n = (await (await env.ROOM.get(env.ROOM.idFromName(r.id)).fetch('https://do/count')).json()).n; } catch {}
        const { code, cpValue, eggPrizes, ...pub } = r; pub.hasCp = !!(r.cpType && cpValue); pub.eggRand = !!(r.egg && (eggPrizes || []).length);
        return { ...pub, video: code ? '' : r.video, videos: code ? [] : (r.videos && r.videos.length ? r.videos : (r.video ? [r.video] : [])), vt: code ? [] : (r.vt || []), goods: code ? [] : (r.goods || []), endImg: code ? '' : (r.endImg || ''), photos: code ? [] : (r.photos || []), priv: !!code, hall: i + 1, n };
      }))).filter(r => !r.hidden);
      const body = JSON.stringify({ epoch: EPOCH, rooms, bannerSeconds:await getBannerSeconds(env) }); RC = { t: Date.now(), v: body };
      return new Response(body, { headers: H });
    }
    if (u.pathname === '/api/join' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})), r = (await getRooms(env)).find(x => x.id === b.id);
      if (!r) return J({ ok: false, err: '없는 상영관이에요' }, 404);
      if (r.hidden) return J({ ok: false, err: '닫힌 상영관이에요' }, 403);
      if (r.code && String(b.code || '') !== r.code) return J({ ok: false, err: '상영 코드가 맞지 않아요' }, 403);
      return J({ ok: true, video: r.video, videos: r.videos && r.videos.length ? r.videos : (r.video ? [r.video] : []), vt: r.vt || [], goods: r.goods || [], photos: r.photos || [], endImg: r.endImg || '' });
    }
    if (u.pathname === '/api/guest') {
      const st = cfg(env);
      try { // 예전 방별 방명록을 전체 방명록으로 한 번 합치기
        const f = await (await st.fetch('https://do/guest?flag=1')).json();
        if (!f.done) {
          const all = [];
          for (const r of await getRooms(env)) { try { const j = await (await env.ROOM.get(env.ROOM.idFromName(r.id)).fetch('https://do/guest?raw=1')).json(); all.push(...(j.all || [])); } catch {} }
          await st.fetch('https://do/guest', { method: 'PUT', body: JSON.stringify(all) });
        }
      } catch {}
      const rr = req.method === 'POST'
        ? await st.fetch('https://do/guest', { method: 'POST', body: JSON.stringify({ ...(await req.json().catch(() => ({}))), ip: req.headers.get('cf-connecting-ip') || '' }) })
        : await st.fetch('https://do/guest?p=' + encodeURIComponent(u.searchParams.get('p') || '0'));
      return J(await rr.json(), rr.status);
    }
    if (u.pathname.startsWith('/api/admin/')) {
      if (!env.ADMIN_PW) return J({ ok: false, err: 'ADMIN_PW 비밀번호가 서버에 설정되지 않았어요' });
      const aip = encodeURIComponent(req.headers.get('cf-connecting-ip') || '-'), au = a => cfg(env).fetch('https://do/auth?a=' + a + '&ip=' + aip).then(r => r.json()).catch(() => ({}));
      if ((await au('chk')).locked) return J({ ok: false, err: '시도 횟수가 많아 15분간 잠겼어요' }, 429);
      if (req.headers.get('x-admin') !== env.ADMIN_PW) { await au('fail'); return J({ ok: false, err: '비밀번호가 맞지 않아요' }, 401); }
      if (u.pathname === '/api/admin/check') await au('ok');
      if (u.pathname === '/api/admin/check') {
        const [rooms,seconds]=await Promise.all([getRooms(env),getBannerSeconds(env)]);
        return J({ok:true,rooms,bannerSeconds:seconds});
      }
      if (u.pathname === '/api/admin/rooms' && req.method === 'POST') {
        const input=await req.json().catch(()=>null);
        const rooms=Array.isArray(input)?input:input?.rooms;
        if(!Array.isArray(rooms))return J({ok:false,err:'상영관 목록을 확인해 주세요'},400);
        const seconds=input?.bannerSeconds;
        if(seconds!==undefined&&bannerSeconds(seconds)!==seconds)return J({ok:false,err:'배너 간격은 3~60초로 입력해 주세요'},400);
        const result=await cfg(env).fetch('https://do/cfg',{method:'POST',body:JSON.stringify({rooms:clean(rooms),bannerSeconds:seconds})});
        if(!result.ok)return J({ok:false,err:'상영관 설정을 저장하지 못했어요'},502);
        RC={t:0,v:null};
        return J({ ok: true });
      }
      if (u.pathname === '/api/admin/img' && req.method === 'POST') {
        const ct = (req.headers.get('content-type') || '').split(';')[0];
        if (!/^image\/(jpeg|png|webp|gif)$/.test(ct) && ct!=='video/mp4') return J({ ok: false, err: '지원하지 않는 이미지 형식이에요' }, 400);
        const mp4=ct==='video/mp4',max=mp4?MP4_MAX:IMGBB_MAX;
        const tooBig=()=>J({ok:false,err:mp4?'MP4는 20MB 이하로 올려 주세요':'이미지는 32MB 이하로 올려 주세요'},413);
        if(Number(req.headers.get('content-length'))>max)return tooBig();
        if(!mp4)return uploadToImgBB(env,req,ct);
        const b=await req.arrayBuffer();
        if(b.byteLength>max)return tooBig();
        if(!isMP4(b))return J({ok:false,err:'MP4 파일을 읽을 수 없어요'},400);
        try{return await saveMedia(env,u.origin,b,ct)}
        catch{return J({ok:false,err:'소소시네마 저장소에 파일을 기록하지 못했어요'},502)}
      }
      const dr = id => env.ROOM.get(env.ROOM.idFromName(String(id || '')));
      if (u.pathname === '/api/admin/guest' && req.method === 'POST') {
        const b = await req.json().catch(() => ({})), st = cfg(env);
        if (b.act === 'list') return J(await (await st.fetch('https://do/guest?raw=1')).json());
        return J(await (await st.fetch('https://do/guest', { method: 'DELETE', body: JSON.stringify(b.act === 'clear' ? { all: true } : { ts: b.ts, t: b.t }) })).json());
      }
      if (u.pathname === '/api/admin/words' && req.method === 'POST') {
        const b = await req.json().catch(() => ({})), st = cfg(env);
        if (Array.isArray(b.words)) { await st.fetch('https://do/bw', { method: 'POST', body: JSON.stringify({ words: b.words }) }); return J({ ok: true }); }
        return J({ ok: true, ...(await (await st.fetch('https://do/bw')).json()) });
      }
      if (u.pathname === '/api/admin/stats' && req.method === 'POST') {
        const out = {}; for (const r of await getRooms(env)) { try { out[r.id] = await (await dr(r.id).fetch('https://do/stat')).json(); } catch {} }
        return J({ ok: true, stats: out });
      }
      if (u.pathname === '/api/admin/users' && req.method === 'POST') { const b = await req.json().catch(() => ({})); return J(await (await dr(b.id).fetch('https://do/users')).json()); }
      if (u.pathname === '/api/admin/kick' && req.method === 'POST') { const b = await req.json().catch(() => ({})); return J(await (await dr(b.id).fetch('https://do/kick', { method: 'POST', body: JSON.stringify({ pid: b.pid }) })).json()); }
    }
    const m = u.pathname.match(/^\/ws\/(\w+)$/);
    if (m) {
      const r = (await getRooms(env)).find(x => x.id === m[1]);
      if (r && r.hidden) return new Response('closed', { status: 403 });
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
  constructor(state, env) { this.env = env; this.st = state.storage; this.c = new Map(); this.seats = {}; this.rows = 11; this.cols = 12; this.dirty = new Set(); this.tm = 0; }
  flush() { this.tm = 0; const a = []; for (const q of this.dirty) if (this.c.has(q.ws)) a.push([q.id, q.x, q.z, q.ry, q.sit ? 1 : 0]); this.dirty.clear(); if (a.length) this.bc({ t: 'ps', a }); }
  bc(o, ex) { const s = JSON.stringify(o); for (const [w] of this.c) if (w !== ex) try { w.send(s); } catch {} }
  pub(p) { return { t: 'p', id: p.id, name: p.name, seat: p.seat, x: p.x, z: p.z, ry: p.ry, sit: p.sit, act: p.act || '', look: p.look || null }; }
  async words() { if (Date.now() - (this.bwT || 0) > 60000) { this.bwT = Date.now(); try { const r = await this.env.ROOM.get(this.env.ROOM.idFromName('__cfg')).fetch('https://do/bw'); this.bw = (await r.json()).words || []; } catch {} } return this.bw || []; }
  mask(t) { for (const w of this.bw || []) t = t.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), x => '*'.repeat(x.length)); return t; }
  chat(p, raw) { const now = Date.now(); if (now - (p.lc || 0) < 1200) return; p.lc = now; const t = this.mask(String(raw || '').trim().slice(0, 60)); if (t) this.bc({ t: 'chat', id: p.id, m: t }); }
  async bump() { const s = (await this.st.get('stat')) || { v: 0, pk: 0, last: 0 }; s.v++; s.last = Date.now(); s.pk = Math.max(s.pk, Object.keys(this.seats).length); await this.st.put('stat', s); }
  async fetch(req) {
    const u = new URL(req.url);
    if(u.pathname==='/banner')return Response.json(bannerSeconds(await this.st.get('bannerSeconds')));
    if (u.pathname === '/auth') { // 관리자 비밀번호 무차별 대입 방지: IP당 5번 틀리면 15분 잠금
      const k = 'lk:' + (u.searchParams.get('ip') || '-'), a = u.searchParams.get('a'), now = Date.now();
      let s = (await this.st.get(k)) || { n: 0, t: 0 };
      if (now - s.t > 900e3) s = { n: 0, t: 0 };
      if (a === 'fail') { s = { n: s.n + 1, t: now }; await this.st.put(k, s); }
      else if (a === 'ok' && s.n) await this.st.delete(k);
      return Response.json({ locked: s.n >= 5 });
    }
    if (u.pathname === '/cfg') {
      if (req.method === 'POST') {
        const input=await req.json(),rooms=Array.isArray(input)?input:input.rooms;
        const values={rooms};
        if(input.bannerSeconds!==undefined)values.bannerSeconds=bannerSeconds(input.bannerSeconds);
        await this.st.put(values);
        try { // 안 쓰는 이미지 정리 (올린 지 1시간 지난 것만)
          const used = new Set([...JSON.stringify(rooms).matchAll(/\/api\/img\/([0-9a-f]{12})/g)].map(m => m[1])), metas = await this.st.list({ prefix: 'im:' });
          for (const [k, v] of metas) { const id = k.slice(3); if (!used.has(id) && Date.now() - (v.t || 0) > 3600e3) await this.st.delete(['im:' + id, 'img:' + id, ...Array.from({length:v.parts||0},(_,i)=>chunkKey(id,i))]); }
        } catch {}
        return Response.json({ ok: true });
      }
      return Response.json((await this.st.get('rooms')) ?? null);
    }
    if (u.pathname === '/img') {
      const id = u.searchParams.get('id') || '';
      if (!/^[0-9a-f]{12}$/.test(id)) return new Response('bad', { status: 400 });
      if (req.method === 'POST') {
        const b=await req.arrayBuffer(), ct=u.searchParams.get('ct')||'image/jpeg';
        if(b.byteLength>MP4_MAX)return new Response(null,{status:413});
        const parts=b.byteLength>IMAGE_CHUNK?Math.ceil(b.byteLength/IMAGE_CHUNK):0;
        const entries={['im:'+id]:{t:Date.now(),parts},['img:'+id]:parts?{ct,parts,size:b.byteLength}:{ct,b}};
        for(let i=0;i<parts;i++)entries[chunkKey(id,i)]=b.slice(i*IMAGE_CHUNK,(i+1)*IMAGE_CHUNK);
        await this.st.put(entries,{noCache:true});
        return Response.json({ok:true});
      }
      const o=await this.st.get('img:'+id);
      if(!o)return new Response('nf',{status:404});
      const range=o.ct==='video/mp4'?req.headers.get('range'):null,size=o.parts?o.size:o.b.byteLength;
      const bounds=mediaRange(range,size),headers=new Headers({'content-type':o.ct});
      if(o.ct==='video/mp4')headers.set('accept-ranges','bytes');
      if(!bounds){headers.set('content-range','bytes */'+size);return new Response(null,{status:416,headers})}
      const {start,end}=bounds,status=range?206:200;
      headers.set('content-length',String(end-start+1));
      if(range)headers.set('content-range','bytes '+start+'-'+end+'/'+size);
      if(!o.parts)return new Response(range?o.b.slice(start,end+1):o.b,{status,headers});
      const first=Math.floor(start/IMAGE_CHUNK),last=Math.floor(end/IMAGE_CHUNK);
      const keys=Array.from({length:last-first+1},(_,i)=>chunkKey(id,first+i));
      const pieces=await this.st.get(keys,{noCache:true});
      if(keys.some(key=>!pieces.has(key)))return new Response('nf',{status:404});
      let i=0;
      const stream=new ReadableStream({pull(controller){
        const key=keys[i],chunk=new Uint8Array(pieces.get(key)),offset=(first+i)*IMAGE_CHUNK;
        controller.enqueue(chunk.subarray(Math.max(0,start-offset),Math.min(chunk.byteLength,end-offset+1)));
        pieces.delete(key);
        if(++i===keys.length)controller.close();
      }});
      return new Response(stream,{status,headers});
    }
    if (u.pathname === '/guest') {
      let g = (await this.st.get('gb')) || [];
      if (u.searchParams.get('flag')) return Response.json({ done: !!(await this.st.get('gbm')) });
      if (u.searchParams.get('raw')) return Response.json({ all: g });
      if (req.method === 'PUT') {
        const a = await req.json().catch(() => []);
        const m = [...g, ...(Array.isArray(a) ? a : [])].filter(x => x && x.t).sort((p, q) => (q.ts || 0) - (p.ts || 0)).slice(0, 300);
        await this.st.put('gb', m); await this.st.put('gbm', 1); return Response.json({ ok: true });
      }
      if (req.method === 'DELETE') { const b = await req.json().catch(() => ({})); g = b.all ? [] : g.filter(x => !(x.ts === b.ts && x.t === b.t)); await this.st.put('gb', g); return Response.json({ ok: true, total: g.length }); }
      if (req.method === 'POST') {
        const b = await req.json().catch(() => ({})), t = String(b.t || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        if (!t) return Response.json({ ok: false }, { status: 400 });
        this.gl = this.gl || {}; if (Object.keys(this.gl).length > 200) this.gl = {};
        const now = Date.now(); if (now - (this.gl[b.ip] || 0) < 10000) return Response.json({ ok: false, err: 'wait' }, { status: 429 });
        this.gl[b.ip] = now;
        g.unshift({ n: String(b.n || '관객').slice(0, 12), t, c: Number.isInteger(b.c) && b.c >= 0 && b.c < 5 ? b.c : 0, ts: now });
        await this.st.put('gb', g.slice(0, 300)); return Response.json({ ok: true });
      }
      const p = Math.max(0, parseInt(u.searchParams.get('p')) || 0);
      return Response.json({ ok: true, total: g.length, notes: g.slice(p * 10, p * 10 + 10) });
    }
    if (u.pathname === '/bw') {
      if (req.method === 'POST') { const b = await req.json().catch(() => ({})); await this.st.put('bw', (Array.isArray(b.words) ? b.words : []).map(x => String(x).trim().slice(0, 20)).filter(Boolean).slice(0, 200)); return Response.json({ ok: true }); }
      return Response.json({ words: (await this.st.get('bw')) || [] });
    }
    if (u.pathname === '/stat') { const s = (await this.st.get('stat')) || { v: 0, pk: 0, last: 0 }; return Response.json({ ...s, on: Object.keys(this.seats).length, egg: (await this.st.get('egc')) || {} }); }
    if (u.pathname === '/egg' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})), cid = String(b.cid || ''), prizes = Array.isArray(b.prizes) ? b.prizes : [];
      if (!cid || !prizes.length) return Response.json({ ok: false }, { status: 400 });
      const had = await this.st.get('eg:' + cid); if (had) return Response.json({ ok: true, again: true, prize: had });
      const ip = String(b.ip || ''), ik = 'ei:' + ip, n = ip ? ((await this.st.get(ik)) || 0) : 0;
      if (n >= 3) return Response.json({ ok: false, err: '이미 참여했어요' }, { status: 429 });
      const tot = prizes.reduce((q, p) => q + (+p.w || 0), 0); let pick = prizes[prizes.length - 1];
      if (tot > 0) { let r = Math.random() * tot; for (const p of prizes) { r -= +p.w || 0; if (r < 0) { pick = p; break; } } }
      const prize = { label: pick.label, type: pick.type, value: pick.value };
      await this.st.put('eg:' + cid, prize); if (ip) await this.st.put(ik, n + 1);
      const cnt = (await this.st.get('egc')) || {}; cnt[prize.label] = (cnt[prize.label] || 0) + 1; await this.st.put('egc', cnt);
      return Response.json({ ok: true, prize });
    }
    if (u.pathname === '/users') return Response.json({ ok: true, users: [...this.c.values()].filter(q => q.seat).map(q => ({ id: q.id, name: q.name, seat: q.seat })) });
    if (u.pathname === '/kick' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})), q = [...this.c.values()].find(x => x.id === b.pid);
      if (!q) return Response.json({ ok: false });
      if (q.ip) { const ban = (await this.st.get('ban')) || {}; for (const k in ban) if (ban[k] < Date.now()) delete ban[k]; ban[q.ip] = Date.now() + 864e5; await this.st.put('ban', ban); }
      try { q.ws.close(1008, 'kicked'); } catch {}
      return Response.json({ ok: true });
    }
    if (u.pathname === '/count') return Response.json({ n: Object.keys(this.seats).length });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('ws only', { status: 426 });
    if (u.searchParams.get('r')) { this.rows = +u.searchParams.get('r'); this.cols = +u.searchParams.get('c'); }
    const ip = req.headers.get('cf-connecting-ip') || '';
    if (ip) { const ban = (await this.st.get('ban')) || {}; if (ban[ip] && ban[ip] > Date.now()) return new Response('banned', { status: 403 }); }
    this.words();
    const [cl, sv] = Object.values(new WebSocketPair());
    sv.accept();
    const p = { id: crypto.randomUUID().slice(0, 8), name: '관객', seat: null, x: 0, z: 0, ry: 0, sit: true, ws: sv, ip };
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
        p.seat = s; p.sit = true; p.look = lk(m.look); p.name = this.mask(String(m.name || '관객').slice(0, 20)); this.seats[s] = p.id;
        sv.send(JSON.stringify({ t: 'seat_ok', seat: s }));
        if (!p.counted) { p.counted = 1; this.bump(); }
        this.bc({ t: 'seats', seats: this.seats });
        this.bc(this.pub(p), sv);
      } else if (!p.seat) return;
      else if (m.t === 'move') { p.x = +m.x || 0; p.z = +m.z || 0; p.ry = +m.ry || 0; p.sit = !!m.sit; this.dirty.add(p); if (!this.tm) this.tm = setTimeout(() => this.flush(), 120); }
      else if (m.t === 'chat') this.chat(p, m.m);
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
