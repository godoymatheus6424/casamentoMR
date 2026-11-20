// Planejador de Casamento — servidor sem dependências externas (Node.js 22.13+).
// Banco: SQLite embutido (node:sqlite). Senhas: scrypt. Sessões: cookie HttpOnly + token CSRF.

import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { BUDGET_CATEGORIES, TASK_TEMPLATE } from './public/js/seed.js';

// ---------------------------------------------------------------------------
// Configuração (variáveis de ambiente opcionais)
// ---------------------------------------------------------------------------
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
const PUBLIC_DIR = path.join(ROOT, 'public');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 25;
const MAX_UPLOAD = MAX_UPLOAD_MB * 1024 * 1024;
const MAX_JSON = 2 * 1024 * 1024;
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const SESSION_SHORT = 12 * HOUR;
const SESSION_LONG = 30 * DAY;
const MAX_USERS = 6;
const LOGIN_MAX_PER_IP = 10;      // tentativas por IP a cada 15 min
const LOCK_AFTER = 5;             // falhas seguidas por usuário
const LOCK_TIME = 15 * MIN;

const COLLECTIONS = new Set(['vendors', 'payments', 'budget', 'tasks', 'guests', 'tables', 'timeline', 'gifts', 'notes']);
const FILE_CATEGORIES = new Set(['contrato', 'orcamento', 'comprovante', 'inspiracao', 'documento', 'outros']);
const FILE_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  zip: 'application/zip',
};
const INLINE_TYPES = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'txt']);
const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

// ---------------------------------------------------------------------------
// Banco de dados
// ---------------------------------------------------------------------------
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'casamento.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    failed INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL,
    ttl INTEGER NOT NULL,
    persistent INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ip TEXT,
    ua TEXT
  );
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    coll TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_items_coll ON items(coll);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ext TEXT NOT NULL,
    size INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT 'outros',
    vendor_id TEXT,
    note TEXT,
    created_at INTEGER NOT NULL,
    uploaded_by INTEGER
  );
`);

const stmtCache = new Map();
function S(sql) {
  let s = stmtCache.get(sql);
  if (!s) { s = db.prepare(sql); stmtCache.set(sql, s); }
  return s;
}
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
function isHttps(req) {
  return !!req.socket.encrypted || (TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
}
function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '?';
}
function send(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Conteúdo muito grande.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) {
  const ct = String(req.headers['content-type'] || '');
  const buf = await readBody(req, MAX_JSON);
  if (!buf.length) return {};
  if (!ct.includes('application/json')) throw new HttpError(415, 'Use JSON.');
  try {
    const v = JSON.parse(buf.toString('utf8'));
    if (!v || typeof v !== 'object') throw new Error();
    return v;
  } catch { throw new HttpError(400, 'JSON inválido.'); }
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!(k in out)) out[k] = part.slice(i + 1).trim();
  }
  return out;
}
function sessionCookie(req, value, maxAgeSec) {
  const parts = [`sid=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (isHttps(req)) parts.push('Secure');
  if (maxAgeSec != null) parts.push(`Max-Age=${maxAgeSec}`);
  return parts.join('; ');
}

// ---------------------------------------------------------------------------
// Senhas (scrypt)
// ---------------------------------------------------------------------------
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
function scryptAsync(pw, salt, params) {
  return new Promise((ok, fail) => crypto.scrypt(pw, salt, 64, params, (e, k) => (e ? fail(e) : ok(k))));
}
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(pw.normalize('NFKC'), salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function verifyPassword(pw, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const key = await scryptAsync(pw.normalize('NFKC'), Buffer.from(salt, 'base64'), { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem });
  const expected = Buffer.from(hash, 'base64');
  return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}
const DUMMY_HASH = await hashPassword(crypto.randomBytes(16).toString('hex'));

function validateNewUser(b) {
  const name = String(b.name || '').trim();
  const username = String(b.username || '').trim();
  const password = String(b.password || '');
  if (!name || name.length > 60) throw new HttpError(400, 'Informe um nome (até 60 caracteres).');
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) throw new HttpError(400, 'O usuário deve ter de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado.');
  validatePassword(password);
  return { name, username, password };
}
function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');
  if (pw.length > 200) throw new HttpError(400, 'A senha é longa demais.');
  if (!/[A-Za-zÀ-ÿ]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, 'A senha deve conter letras e números.');
}

// ---------------------------------------------------------------------------
// Limite de tentativas
// ---------------------------------------------------------------------------
const attempts = new Map();
function rateBucket(ip) {
  const now = Date.now();
  let a = attempts.get(ip);
  if (!a || a.reset < now) { a = { n: 0, reset: now + 15 * MIN }; attempts.set(ip, a); }
  if (a.n >= LOGIN_MAX_PER_IP) {
    throw new HttpError(429, `Muitas tentativas. Tente novamente em ${Math.ceil((a.reset - now) / MIN)} min.`);
  }
  return a;
}

// ---------------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------------
function createSession(req, res, userId, persistent) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const ttl = persistent ? SESSION_LONG : SESSION_SHORT;
  S(`INSERT INTO sessions (token_hash, user_id, csrf, ttl, persistent, created_at, last_seen, expires_at, ip, ua)
     VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    sha256(token), userId, crypto.randomBytes(24).toString('base64url'), ttl, persistent ? 1 : 0,
    now, now, now + ttl, clientIp(req), String(req.headers['user-agent'] || '').slice(0, 250));
  res.setHeader('Set-Cookie', sessionCookie(req, token, persistent ? Math.floor(ttl / 1000) : null));
}
function getSession(req) {
  const token = parseCookies(req).sid;
  if (!token || token.length > 100) return null;
  const h = sha256(token);
  const now = Date.now();
  const s = S(`SELECT s.*, u.name, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(h);
  if (!s) return null;
  if (s.expires_at <= now) { S('DELETE FROM sessions WHERE token_hash = ?').run(h); return null; }
  if (now - s.last_seen > 5 * MIN) {
    S('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?').run(now, now + s.ttl, h);
  }
  return { ...s, token, tokenHash: h };
}

// ---------------------------------------------------------------------------
// Código de configuração (primeiro acesso)
// ---------------------------------------------------------------------------
const userCount = () => S('SELECT COUNT(*) AS n FROM users').get().n;
let setupCode = null;
function ensureSetupCode() {
  if (userCount() > 0) { setupCode = null; return; }
  if (!setupCode) {
    const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    setupCode = process.env.SETUP_CODE || Array.from({ length: 8 }, () => abc[crypto.randomInt(abc.length)]).join('');
  }
}

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------
function rowToItem(r) {
  return { ...JSON.parse(r.data), id: r.id, _created: r.created_at, _updated: r.updated_at, _by: r.updated_by };
}
function cleanData(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Dados inválidos.');
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === 'id' || k === '__proto__' || k.startsWith('_') || k.length > 64) continue;
    out[k] = v;
  }
  if (JSON.stringify(out).length > 200_000) throw new HttpError(413, 'Registro muito grande.');
  return out;
}
function checkColl(c) {
  if (!COLLECTIONS.has(c)) throw new HttpError(404, 'Coleção desconhecida.');
  return c;
}
function insertItem(coll, data, userId, now = Date.now()) {
  const id = crypto.randomUUID();
  S('INSERT INTO items (id, coll, data, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?)')
    .run(id, coll, JSON.stringify(data), now, now, userId);
  return { ...data, id, _created: now, _updated: now, _by: userId };
}
function getSettings() {
  const r = S('SELECT value FROM settings WHERE key = ?').get('wedding');
  return r ? JSON.parse(r.value) : {};
}
function setSettings(obj) {
  S('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('wedding', JSON.stringify(obj));
}
function fileToJson(f) {
  return {
    id: f.id, name: f.name, ext: f.ext, size: f.size, category: f.category,
    vendorId: f.vendor_id, note: f.note || '', createdAt: f.created_at, uploadedBy: f.uploaded_by,
  };
}
function sanitizeFileName(name) {
  const base = String(name).split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim();
  return (base || 'arquivo').slice(0, 180);
}
function contentDisposition(inline, name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
function seedWorkspace(userId, b) {
  const now = Date.now();
  setSettings({
    partner1: String(b.partner1 || '').trim().slice(0, 60),
    partner2: String(b.partner2 || '').trim().slice(0, 60),
    date: /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : '',
  });
  BUDGET_CATEGORIES.forEach(([name, pct], i) => insertItem('budget', { name, planned: 0, pct, order: i }, userId, now + i));
  TASK_TEMPLATE.forEach(([period, title], i) => insertItem('tasks', { title, period, done: false, order: i }, userId, now + i));
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------
const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, auth: opts.auth !== false });
}

route('GET', '/api/status', ({ res }) => {
  send(res, 200, { needsSetup: userCount() === 0, maxUploadMb: MAX_UPLOAD_MB });
}, { auth: false });

route('POST', '/api/setup', async ({ req, res }) => {
  if (userCount() > 0) throw new HttpError(409, 'O sistema já foi configurado. Faça login.');
  const rl = rateBucket(clientIp(req));
  const b = await readJson(req);
  ensureSetupCode();
  if (!safeEqual(String(b.code || '').trim().toUpperCase(), setupCode)) {
    rl.n++;
    throw new HttpError(403, 'Código de configuração inválido. Confira o código exibido na janela do servidor.');
  }
  const u = validateNewUser(b);
  const hash = await hashPassword(u.password);
  const userId = tx(() => {
    if (userCount() > 0) throw new HttpError(409, 'O sistema já foi configurado.');
    const r = S('INSERT INTO users (username, name, pass_hash, created_at) VALUES (?,?,?,?)').run(u.username, u.name, hash, Date.now());
    const id = Number(r.lastInsertRowid);
    seedWorkspace(id, b);
    return id;
  });
  setupCode = null;
  createSession(req, res, userId, true);
  send(res, 201, { ok: true });
}, { auth: false });

route('POST', '/api/login', async ({ req, res }) => {
  const rl = rateBucket(clientIp(req));
  const b = await readJson(req);
  const username = String(b.username || '').trim();
  const password = String(b.password || '');
  if (!username || !password || password.length > 256) throw new HttpError(400, 'Informe usuário e senha.');
  const user = S('SELECT * FROM users WHERE username = ?').get(username);
  const now = Date.now();
  if (user && user.locked_until > now) {
    throw new HttpError(429, `Acesso bloqueado temporariamente por excesso de tentativas. Tente em ${Math.ceil((user.locked_until - now) / MIN)} min.`);
  }
  const valid = await verifyPassword(password, user ? user.pass_hash : DUMMY_HASH);
  if (!user || !valid) {
    rl.n++;
    if (user) {
      const failed = user.failed + 1;
      const lock = failed >= LOCK_AFTER;
      S('UPDATE users SET failed = ?, locked_until = ? WHERE id = ?').run(lock ? 0 : failed, lock ? now + LOCK_TIME : 0, user.id);
    }
    await sleep(250 + crypto.randomInt(250));
    throw new HttpError(401, 'Usuário ou senha incorretos.');
  }
  S('UPDATE users SET failed = 0, locked_until = 0 WHERE id = ?').run(user.id);
  createSession(req, res, user.id, !!b.remember);
  send(res, 200, { ok: true });
}, { auth: false });

route('POST', '/api/logout', ({ req, res, session }) => {
  S('DELETE FROM sessions WHERE token_hash = ?').run(session.tokenHash);
  send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
});

route('GET', '/api/me', ({ req, res, session }) => {
  const headers = {};
  if (session.persistent) headers['Set-Cookie'] = sessionCookie(req, session.token, Math.floor(session.ttl / 1000));
  send(res, 200, {
    user: { id: session.user_id, name: session.name, username: session.username },
    csrf: session.csrf,
  }, headers);
});

route('PUT', '/api/me', async ({ req, res, session }) => {
  const b = await readJson(req);
  const name = String(b.name || '').trim();
  if (!name || name.length > 60) throw new HttpError(400, 'Informe um nome (até 60 caracteres).');
  S('UPDATE users SET name = ? WHERE id = ?').run(name, session.user_id);
  send(res, 200, { ok: true, name });
});

route('POST', '/api/password', async ({ req, res, session }) => {
  const b = await readJson(req);
  const user = S('SELECT * FROM users WHERE id = ?').get(session.user_id);
  if (!(await verifyPassword(String(b.current || ''), user.pass_hash))) throw new HttpError(400, 'A senha atual está incorreta.');
  validatePassword(b.next);
  const hash = await hashPassword(b.next);
  S('UPDATE users SET pass_hash = ? WHERE id = ?').run(hash, user.id);
  S('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(user.id, session.tokenHash);
  send(res, 200, { ok: true });
});

route('GET', '/api/users', ({ res, session }) => {
  const users = S('SELECT id, name, username, created_at FROM users ORDER BY id').all()
    .map((u) => ({ id: u.id, name: u.name, username: u.username, createdAt: u.created_at, isMe: u.id === session.user_id }));
  send(res, 200, users);
});

route('POST', '/api/users', async ({ req, res }) => {
  if (userCount() >= MAX_USERS) throw new HttpError(400, `Limite de ${MAX_USERS} usuários atingido.`);
  const u = validateNewUser(await readJson(req));
  if (S('SELECT id FROM users WHERE username = ?').get(u.username)) throw new HttpError(409, 'Esse nome de usuário já existe.');
  const hash = await hashPassword(u.password);
  const r = S('INSERT INTO users (username, name, pass_hash, created_at) VALUES (?,?,?,?)').run(u.username, u.name, hash, Date.now());
  send(res, 201, { id: Number(r.lastInsertRowid), name: u.name, username: u.username });
});

route('DELETE', '/api/users/:id', ({ res, params, session }) => {
  const id = Number(params.id);
  if (id === session.user_id) throw new HttpError(400, 'Você não pode remover o próprio acesso.');
  tx(() => {
    S('DELETE FROM sessions WHERE user_id = ?').run(id);
    S('DELETE FROM users WHERE id = ?').run(id);
  });
  send(res, 200, { ok: true });
});

route('GET', '/api/sessions', ({ res, session }) => {
  const rows = S('SELECT token_hash, created_at, last_seen, ip, ua FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen DESC')
    .all(session.user_id, Date.now());
  send(res, 200, rows.map((r) => ({ createdAt: r.created_at, lastSeen: r.last_seen, ip: r.ip, ua: r.ua, current: r.token_hash === session.tokenHash })));
});

route('POST', '/api/sessions/revoke-others', ({ res, session }) => {
  const r = S('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(session.user_id, session.tokenHash);
  send(res, 200, { ok: true, removed: Number(r.changes) });
});

route('GET', '/api/data', ({ res }) => {
  const items = {};
  for (const c of COLLECTIONS) items[c] = [];
  for (const r of S('SELECT * FROM items ORDER BY created_at').all()) if (items[r.coll]) items[r.coll].push(rowToItem(r));
  const files = S('SELECT * FROM files ORDER BY created_at DESC').all().map(fileToJson);
  const users = S('SELECT id, name FROM users').all().map((u) => ({ id: u.id, name: u.name }));
  send(res, 200, { settings: getSettings(), items, files, users });
});

route('PUT', '/api/settings', async ({ req, res }) => {
  const merged = { ...getSettings(), ...cleanData(await readJson(req)) };
  setSettings(merged);
  send(res, 200, merged);
});

route('POST', '/api/items/:coll', async ({ req, res, params, session }) => {
  const coll = checkColl(params.coll);
  send(res, 201, insertItem(coll, cleanData(await readJson(req)), session.user_id));
});

route('POST', '/api/items/:coll/bulk', async ({ req, res, params, session }) => {
  const coll = checkColl(params.coll);
  const b = await readJson(req);
  if (!Array.isArray(b.items) || b.items.length > 3000) throw new HttpError(400, 'Lista inválida.');
  const now = Date.now();
  const created = tx(() => b.items.map((d, i) => insertItem(coll, cleanData(d), session.user_id, now + i)));
  send(res, 201, created);
});

route('PUT', '/api/items/:coll/:id', async ({ req, res, params, session }) => {
  const coll = checkColl(params.coll);
  if (!isUuid(params.id)) throw new HttpError(400, 'ID inválido.');
  const row = S('SELECT * FROM items WHERE id = ? AND coll = ?').get(params.id, coll);
  if (!row) throw new HttpError(404, 'Registro não encontrado (talvez tenha sido excluído).');
  const merged = { ...JSON.parse(row.data), ...cleanData(await readJson(req)) };
  const data = JSON.stringify(merged);
  if (data.length > 200_000) throw new HttpError(413, 'Registro muito grande.');
  const now = Date.now();
  S('UPDATE items SET data = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(data, now, session.user_id, params.id);
  send(res, 200, rowToItem({ ...row, data, updated_at: now, updated_by: session.user_id }));
});

route('DELETE', '/api/items/:coll/:id', ({ res, params }) => {
  const coll = checkColl(params.coll);
  if (!isUuid(params.id)) throw new HttpError(400, 'ID inválido.');
  let cascaded = false;
  tx(() => {
    S('DELETE FROM items WHERE id = ? AND coll = ?').run(params.id, coll);
    if (coll === 'vendors') {
      S(`DELETE FROM items WHERE coll = 'payments' AND json_extract(data, '$.vendorId') = ?`).run(params.id);
      S('UPDATE files SET vendor_id = NULL WHERE vendor_id = ?').run(params.id);
      cascaded = true;
    }
    if (coll === 'tables') {
      S(`UPDATE items SET data = json_set(data, '$.tableId', NULL), updated_at = ? WHERE coll = 'guests' AND json_extract(data, '$.tableId') = ?`)
        .run(Date.now(), params.id);
      cascaded = true;
    }
  });
  send(res, 200, { ok: true, cascaded });
});

route('POST', '/api/files', async ({ req, res, session }) => {
  res.setHeader('Connection', 'close');
  let rawName;
  try { rawName = decodeURIComponent(String(req.headers['x-file-name'] || '')); }
  catch { throw new HttpError(400, 'Nome de arquivo inválido.'); }
  const name = sanitizeFileName(rawName);
  const ext = path.extname(name).slice(1).toLowerCase();
  if (!FILE_TYPES[ext]) throw new HttpError(415, 'Tipo de arquivo não permitido. Use PDF, imagens, Word, Excel ou texto.');
  if (Number(req.headers['content-length'] || 0) > MAX_UPLOAD) throw new HttpError(413, `Arquivo maior que ${MAX_UPLOAD_MB} MB.`);
  const cat = String(req.headers['x-category'] || '');
  const category = FILE_CATEGORIES.has(cat) ? cat : 'outros';
  const vendorHeader = String(req.headers['x-vendor-id'] || '');
  const vendorId = isUuid(vendorHeader) ? vendorHeader : null;
  let note = '';
  try { note = decodeURIComponent(String(req.headers['x-note'] || '')).slice(0, 500); } catch { /* ignora */ }

  const id = crypto.randomUUID();
  const tmp = path.join(TMP_DIR, id);
  let size = 0;
  try {
    await pipeline(req, async function* (source) {
      for await (const chunk of source) {
        size += chunk.length;
        if (size > MAX_UPLOAD) throw new HttpError(413, `Arquivo maior que ${MAX_UPLOAD_MB} MB.`);
        yield chunk;
      }
    }, fs.createWriteStream(tmp, { flags: 'wx' }));
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  if (size === 0) { fs.rmSync(tmp, { force: true }); throw new HttpError(400, 'Arquivo vazio.'); }
  fs.renameSync(tmp, path.join(UPLOAD_DIR, id));
  const now = Date.now();
  S('INSERT INTO files (id, name, ext, size, category, vendor_id, note, created_at, uploaded_by) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, name, ext, size, category, vendorId, note, now, session.user_id);
  send(res, 201, fileToJson(S('SELECT * FROM files WHERE id = ?').get(id)));
});

route('GET', '/api/files/:id', ({ res, params, url }) => {
  if (!isUuid(params.id)) throw new HttpError(400, 'ID inválido.');
  const f = S('SELECT * FROM files WHERE id = ?').get(params.id);
  if (!f) throw new HttpError(404, 'Arquivo não encontrado.');
  const p = path.join(UPLOAD_DIR, f.id);
  let st;
  try { st = fs.statSync(p); } catch { throw new HttpError(404, 'Arquivo não encontrado no disco.'); }
  const inline = url.searchParams.get('download') !== '1' && INLINE_TYPES.has(f.ext);
  if (f.ext === 'pdf') res.removeHeader('Content-Security-Policy'); // o visualizador de PDF do navegador precisa disso
  else res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.writeHead(200, {
    'Content-Type': FILE_TYPES[f.ext] || 'application/octet-stream',
    'Content-Length': st.size,
    'Content-Disposition': contentDisposition(inline, f.name),
    'Cache-Control': 'private, max-age=3600',
  });
  fs.createReadStream(p).pipe(res);
});

route('PUT', '/api/files/:id', async ({ req, res, params }) => {
  if (!isUuid(params.id)) throw new HttpError(400, 'ID inválido.');
  const f = S('SELECT * FROM files WHERE id = ?').get(params.id);
  if (!f) throw new HttpError(404, 'Arquivo não encontrado.');
  const b = await readJson(req);
  let name = f.name;
  if (typeof b.name === 'string' && b.name.trim()) {
    name = sanitizeFileName(b.name);
    if (path.extname(name).slice(1).toLowerCase() !== f.ext) name = `${name}.${f.ext}`;
  }
  const category = FILE_CATEGORIES.has(b.category) ? b.category : f.category;
  const vendorId = b.vendorId === undefined ? f.vendor_id : (isUuid(b.vendorId) ? b.vendorId : null);
  const note = typeof b.note === 'string' ? b.note.slice(0, 500) : f.note;
  S('UPDATE files SET name = ?, category = ?, vendor_id = ?, note = ? WHERE id = ?').run(name, category, vendorId, note, f.id);
  send(res, 200, fileToJson(S('SELECT * FROM files WHERE id = ?').get(f.id)));
});

route('DELETE', '/api/files/:id', ({ res, params }) => {
  if (!isUuid(params.id)) throw new HttpError(400, 'ID inválido.');
  S('DELETE FROM files WHERE id = ?').run(params.id);
  fs.rmSync(path.join(UPLOAD_DIR, params.id), { force: true });
  send(res, 200, { ok: true });
});

route('GET', '/api/export', ({ res }) => {
  const items = {};
  for (const c of COLLECTIONS) items[c] = [];
  for (const r of S('SELECT * FROM items ORDER BY created_at').all()) if (items[r.coll]) items[r.coll].push(rowToItem(r));
  const body = JSON.stringify({
    app: 'planejador-casamento', version: 1, exportedAt: new Date().toISOString(),
    settings: getSettings(), items, files: S('SELECT * FROM files').all().map(fileToJson),
  }, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="casamento-backup-${stamp}.json"`,
    'Cache-Control': 'no-store',
  });
  res.end(body);
});

// ---------------------------------------------------------------------------
// Servidor HTTP
// ---------------------------------------------------------------------------
function securityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
    "font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

function checkOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'Origem não permitida.');
  const origin = req.headers.origin;
  if (!origin) return;
  let host;
  try { host = new URL(origin).host; } catch { throw new HttpError(403, 'Origem não permitida.'); }
  const expected = (TRUST_PROXY && req.headers['x-forwarded-host']) || req.headers.host;
  if (host !== expected) throw new HttpError(403, 'Origem não permitida.');
}

async function handleApi(req, res, url) {
  let params = null;
  const r = routes.find((rt) => {
    if (rt.method !== req.method) return false;
    const m = rt.re.exec(url.pathname);
    if (!m) return false;
    params = Object.fromEntries(rt.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    return true;
  });
  if (!r) throw new HttpError(404, 'Rota não encontrada.');
  const mutating = req.method !== 'GET' && req.method !== 'HEAD';
  if (mutating) checkOrigin(req);
  let session = null;
  if (r.auth) {
    session = getSession(req);
    if (!session) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
    if (mutating && !safeEqual(String(req.headers['x-csrf-token'] || ''), session.csrf)) {
      throw new HttpError(403, 'Token de segurança inválido. Recarregue a página.');
    }
  }
  await r.handler({ req, res, url, params, session });
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Método não permitido.');
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(404, 'Não encontrado.');
  let st;
  try { st = fs.statSync(file); } catch { st = null; }
  if (!st || !st.isFile()) throw new HttpError(404, 'Não encontrado.');
  res.writeHead(200, {
    'Content-Type': STATIC_MIME[path.extname(file)] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    securityHeaders(req, res);
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url.pathname);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : (e instanceof URIError ? 400 : 500);
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Erro interno do servidor.' : e.message });
    else res.destroy();
  }
});

// Limpeza periódica
setInterval(() => {
  const now = Date.now();
  S('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  for (const [ip, a] of attempts) if (a.reset < now) attempts.delete(ip);
  for (const f of fs.readdirSync(TMP_DIR)) {
    const p = path.join(TMP_DIR, f);
    try { if (now - fs.statSync(p).mtimeMs > DAY) fs.rmSync(p, { force: true }); } catch { /* ignora */ }
  }
}, HOUR).unref();

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

ensureSetupCode();
server.listen(PORT, HOST, () => {
  console.log('\n  Planejador de Casamento rodando!\n');
  console.log(`  Neste computador:   http://localhost:${PORT}`);
  if (HOST === '0.0.0.0') for (const ip of lanAddresses()) console.log(`  Celular / tablet:   http://${ip}:${PORT}  (mesma rede Wi-Fi)`);
  console.log(`  Dados salvos em:    ${DATA_DIR}`);
  if (setupCode) {
    console.log('\n  ==============================================');
    console.log(`   PRIMEIRO ACESSO - codigo de configuracao: ${setupCode}`);
    console.log('  ==============================================');
  }
  console.log('\n  Para parar o servidor, feche esta janela ou pressione Ctrl+C.\n');
});

function shutdown() {
  server.close();
  try { db.close(); } catch { /* ignora */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
