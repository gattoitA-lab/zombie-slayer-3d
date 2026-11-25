// Zombie Slayer 3D — backend account (Cloudflare Worker + D1)
// API: /api/salt, /api/register, /api/login, /api/session, /api/save, /api/logout, /api/health
// La password non arriva mai al server: il browser calcola un verifier PBKDF2 con il salt
// ricevuto da /api/salt e il server conserva solo SHA-256(verifier).
const ALLOWED = new Set([
  'https://gattoita-lab.github.io',
  'http://127.0.0.1:8765',
  'http://localhost:8765'
]);
const MAX_SAVE = 180000;
const SESSION_MS = 1000 * 60 * 60 * 24 * 120;

function cors(req) {
  const h = new Headers();
  const o = req.headers.get('origin') || '';
  if (ALLOWED.has(o)) h.set('access-control-allow-origin', o);
  h.set('vary', 'origin');
  h.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  h.set('access-control-allow-headers', 'content-type,authorization');
  h.set('access-control-max-age', '86400');
  return h;
}
function json(data, status, req) {
  const h = cors(req);
  h.set('content-type', 'application/json; charset=utf-8');
  h.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { status: status || 200, headers: h });
}
const fail = (code, status, req) => json({ e: code }, status, req);

const b64en = u8 => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const rnd = n => { const u = new Uint8Array(n); crypto.getRandomValues(u); return b64en(u); };
const hex = u8 => [...u8].map(x => x.toString(16).padStart(2, '0')).join('');
async function sha256(t) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))); }
function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

let SCHEMA = null;
function ensureSchema(db) {
  if (SCHEMA) return SCHEMA;
  SCHEMA = db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,lname TEXT UNIQUE NOT NULL,name TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL,save TEXT NOT NULL,created INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions(th TEXT PRIMARY KEY,uid TEXT NOT NULL,exp INTEGER NOT NULL)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS sessions_uid ON sessions(uid)`)
  ]).catch(e => { SCHEMA = null; throw e; });
  return SCHEMA;
}

const hits = new Map();
function tooMany(ip) {
  const n = Date.now();
  let h = hits.get(ip);
  if (!h || n - h.t > 60000) { h = { t: n, c: 0 }; hits.set(ip, h); }
  h.c++;
  if (hits.size > 4000) hits.clear();
  return h.c > 60;
}

const bearer = req => {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
};
async function tokenUser(db, tok) {
  if (!tok) return null;
  const th = await sha256(tok);
  return await db.prepare('SELECT u.id AS id,u.name AS name,u.save AS save FROM sessions s JOIN users u ON u.id=s.uid WHERE s.th=? AND s.exp>?')
    .bind(th, Date.now()).first();
}
async function newSession(db, uid) {
  const tok = rnd(32);
  const th = await sha256(tok);
  await db.prepare('DELETE FROM sessions WHERE uid=? AND exp<=?').bind(uid, Date.now()).run();
  await db.prepare('INSERT INTO sessions(th,uid,exp) VALUES(?,?,?)').bind(th, uid, Date.now() + SESSION_MS).run();
  return tok;
}
function parseSave(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const VER_RE = /^[A-Za-z0-9+/=]{40,64}$/;
const SALT_RE = /^[A-Za-z0-9+/=]{16,32}$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    if (url.pathname === '/api/health') return json({ ok: 1 }, 200, req);
    if (!env.DB) return fail('nodb', 500, req);

    const ip = req.headers.get('cf-connecting-ip') || 'x';
    try {
      await ensureSchema(env.DB);
    } catch (e) {
      return fail('schema', 500, req);
    }

    if (url.pathname === '/api/salt') {
      if (req.method !== 'POST') return fail('method', 405, req);
      if (tooMany(ip)) return fail('rate', 429, req);
      let b = null;
      try { b = await req.json(); } catch { return fail('json', 400, req); }
      const u = String(b && b.u || '').trim();
      if (!NAME_RE.test(u)) return fail('user', 400, req);
      const row = await env.DB.prepare('SELECT salt FROM users WHERE lname=?').bind(u.toLowerCase()).first();
      // per un nome inesistente si restituisce comunque un salt casuale, così non si può
      // capire quali nomi utente esistono
      return json({ salt: row ? row.salt : rnd(16) }, 200, req);
    }

    if (url.pathname === '/api/register' || url.pathname === '/api/login') {
      if (req.method !== 'POST') return fail('method', 405, req);
      if (tooMany(ip)) return fail('rate', 429, req);
      let b = null;
      try { b = await req.json(); } catch { return fail('json', 400, req); }
      const u = String(b && b.u || '').trim();
      const v = String(b && b.v || '');
      if (!NAME_RE.test(u)) return fail('user', 400, req);
      if (!VER_RE.test(v)) return fail('pass', 400, req);
      const lname = u.toLowerCase();

      if (url.pathname === '/api/register') {
        const salt = String(b && b.salt || '');
        if (!SALT_RE.test(salt)) return fail('salt', 400, req);
        const ex = await env.DB.prepare('SELECT id FROM users WHERE lname=?').bind(lname).first();
        if (ex) return fail('exists', 409, req);
        let save = b.save;
        if (typeof save !== 'string') save = JSON.stringify(save || {});
        if (save.length > MAX_SAVE) return fail('big', 413, req);
        const hash = await sha256(v), id = crypto.randomUUID();
        try {
          await env.DB.prepare('INSERT INTO users(id,lname,name,salt,hash,save,created) VALUES(?,?,?,?,?,?,?)')
            .bind(id, lname, u, salt, hash, save, Date.now()).run();
        } catch (e) {
          return fail('exists', 409, req);
        }
        const tok = await newSession(env.DB, id);
        return json({ uid: id, name: u, save: parseSave(save), token: tok }, 200, req);
      }

      const row = await env.DB.prepare('SELECT id,name,hash,save FROM users WHERE lname=?').bind(lname).first();
      if (!row) return fail('bad', 401, req);
      const hash = await sha256(v);
      if (!safeEq(hash, row.hash)) return fail('bad', 401, req);
      const tok = await newSession(env.DB, row.id);
      const save = parseSave(row.save);
      if (!save) return fail('corrupt', 500, req);
      return json({ uid: row.id, name: row.name, save, token: tok }, 200, req);
    }

    if (url.pathname === '/api/session') {
      const u = await tokenUser(env.DB, bearer(req));
      if (!u) return fail('auth', 401, req);
      const save = parseSave(u.save);
      if (!save) return fail('corrupt', 500, req);
      return json({ uid: u.id, name: u.name, save }, 200, req);
    }

    if (url.pathname === '/api/save') {
      if (req.method !== 'POST') return fail('method', 405, req);
      const u = await tokenUser(env.DB, bearer(req));
      if (!u) return fail('auth', 401, req);
      let b = null;
      try { b = await req.json(); } catch { return fail('json', 400, req); }
      let save = b && b.save;
      if (typeof save !== 'string') save = JSON.stringify(save || {});
      if (save.length > MAX_SAVE) return fail('big', 413, req);
      await env.DB.prepare('UPDATE users SET save=? WHERE id=?').bind(save, u.id).run();
      return json({ ok: 1 }, 200, req);
    }

    if (url.pathname === '/api/logout') {
      if (req.method !== 'POST') return fail('method', 405, req);
      const tok = bearer(req);
      if (tok) {
        const th = await sha256(tok);
        await env.DB.prepare('DELETE FROM sessions WHERE th=?').bind(th).run();
      }
      return json({ ok: 1 }, 200, req);
    }

    return fail('notfound', 404, req);
  }
};
