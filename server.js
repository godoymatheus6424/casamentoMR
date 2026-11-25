// BRIDEx (planejador de casamento) — servidor sem dependências externas (Node.js 22.13+).
// Vários casais no mesmo servidor: cada casal tem um "espaço" (workspace) isolado.
// Banco: SQLite embutido (node:sqlite). Senhas: scrypt. Sessões: cookie HttpOnly + token CSRF.

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { BUDGET_CATEGORIES, TASK_TEMPLATE } from './public/js/seed.js';
import { openDb, helpers, workspaceAccess, PLAN_LABELS, MANAGER_ROLES } from './lib/db.js';
import { sendMail, emailLayout } from './lib/mail.js';
import { paymentsCalendar } from './lib/ics.js';

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
const SIGNUP_OPEN = process.env.SIGNUP_OPEN === '1';
// Temporário (fase de testes): o mesmo e-mail pode ter várias contas. UNIQUE_EMAIL=1 volta a exigir e-mail único
// para contas novas. No login com e-mail repetido, entra a conta cuja senha confere (a mais recente primeiro).
const UNIQUE_EMAIL = process.env.UNIQUE_EMAIL === '1';
const APP_URL = (process.env.APP_URL || '').replace(/\/+$/, '');
// Login com o Google: GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET. Rodando no computador, também lê o arquivo
// client_secret_*.json baixado do Google Cloud, se estiver na pasta do projeto (fica fora do git e do Docker).
const GOOGLE = (() => {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return { id: process.env.GOOGLE_CLIENT_ID.trim(), secret: process.env.GOOGLE_CLIENT_SECRET.trim() };
  }
  try {
    const f = fs.readdirSync(ROOT).find((n) => /^client_secret_.*\.json$/.test(n));
    const w = f && JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')).web;
    return w?.client_id && w?.client_secret ? { id: w.client_id, secret: w.client_secret } : null;
  } catch { return null; }
})();
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 25;
const MAX_UPLOAD = MAX_UPLOAD_MB * 1024 * 1024;
const QUOTA_MB = Number(process.env.QUOTA_MB) || 1024;
const QUOTA = QUOTA_MB * 1024 * 1024;
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS) || 14;
const PRICING = { monthly: process.env.PRICE_MONTHLY || '9,90', annual: process.env.PRICE_ANNUAL || '89' };
const MAX_JSON = 2 * 1024 * 1024;
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const SESSION_SHORT = 12 * HOUR;
const SESSION_LONG = 30 * DAY;
const RESET_TTL = HOUR;
const INVITE_TTL = 7 * DAY;     // validade do link de convite
const MAX_MEMBERS = 8;
const LOGIN_MAX_PER_IP = 10;      // tentativas por IP a cada 15 min
const LOCK_AFTER = 5;             // falhas seguidas por usuário
const LOCK_TIME = 15 * MIN;

const COLLECTIONS = new Set(['vendors', 'payments', 'budget', 'tasks', 'guests', 'tables', 'timeline', 'gifts', 'notes']);
const FILE_CATEGORIES = new Set(['contrato', 'orcamento', 'comprovante', 'inspiracao', 'documento', 'outros']);
// Assessoria: só consulta (a única escrita são as anotações para os noivos). Vê fornecedores (com contatos), contratos e documentos, convidados, mesas e cronograma.
// Nada financeiro (orçamento, pagamentos, valores, comprovantes) e nada pessoal dos noivos (tarefas, anotações, presentes).
const PLANNER_FILE_CATS = new Set(['contrato', 'documento', 'inspiracao', 'outros']);
const PLANNER_READONLY = 'O acesso da assessoria é só para consulta (e anotações para os noivos). Para mudar algo, fale com os noivos.';
// A assessoria escreve anotações para os noivos: cria, edita e exclui só as anotações da assessoria.
function checkPlannerNote(session, coll, row) {
  if (session.role !== 'planner') return;
  if (coll !== 'notes' || (row && !JSON.parse(row.data).fromPlanner)) throw new HttpError(403, PLANNER_READONLY);
}
// Código de acesso da assessoria: 8 caracteres sem os que confundem (0/O, 1/I/L), mostrado como XXXX-XXXX.
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const fmtCode = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
function newPlannerCode(ws) {
  for (;;) {
    const code = Array.from({ length: 8 }, () => CODE_ABC[crypto.randomInt(CODE_ABC.length)]).join('');
    try { S('UPDATE workspaces SET planner_code = ? WHERE id = ?').run(code, ws); return code; }
    catch (e) { if (!/UNIQUE/i.test(String(e.message))) throw e; } // colisão (raríssima): tenta outro
  }
}
function plannerCode(ws) {
  return S('SELECT planner_code FROM workspaces WHERE id = ?').get(ws)?.planner_code || newPlannerCode(ws);
}
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
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

// ---------------------------------------------------------------------------
// Banco de dados
// ---------------------------------------------------------------------------
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });
const db = openDb(DATA_DIR);
const { S, tx } = helpers(db);

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const normEmail = (s) => String(s || '').trim().toLowerCase();
const isEmail = (s) => s.length <= 254 && /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/.test(s);

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
function appUrl(req) {
  return APP_URL || `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`;
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
  const key = await scryptAsync(String(pw).normalize('NFKC'), Buffer.from(salt, 'base64'), { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem });
  const expected = Buffer.from(hash, 'base64');
  return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}
const DUMMY_HASH = await hashPassword(crypto.randomBytes(16).toString('hex'));
// Conta criada pelo Google: sem senha (nunca confere com nenhuma). A pessoa pode criar uma senha depois.
const NO_PASSWORD = '!sem-senha';
const hasPassword = (hash) => !String(hash || '').startsWith('!');

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');
  if (pw.length > 200) throw new HttpError(400, 'A senha é longa demais.');
  if (!/[A-Za-zÀ-ÿ]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, 'A senha deve conter letras e números.');
}
function validateNewUser(b) {
  const name = String(b.name || '').trim();
  const email = normEmail(b.email);
  const password = String(b.password || '');
  if (!name || name.length > 60) throw new HttpError(400, 'Informe um nome (até 60 caracteres).');
  if (!isEmail(email)) throw new HttpError(400, 'Informe um e-mail válido.');
  validatePassword(password);
  return { name, email, password };
}
// "username" é único no banco: com e-mail repetido, as contas novas ganham um sufixo interno (o login continua pelo e-mail).
function uniqueUsername(email) {
  if (!S('SELECT 1 FROM users WHERE username = ?').get(email)) return email;
  return `${email}#${crypto.randomBytes(4).toString('hex')}`;
}
function emailTaken(email, exceptUserId = 0) {
  if (!UNIQUE_EMAIL) return false;
  return !!S('SELECT 1 FROM users WHERE (email = ? COLLATE NOCASE OR username = ?) AND id <> ?').get(email, email, exceptUserId);
}

// ---------------------------------------------------------------------------
// Limite de tentativas (por IP e por tipo de ação)
// ---------------------------------------------------------------------------
const attempts = new Map();
function rateBucket(key, max = LOGIN_MAX_PER_IP) {
  const now = Date.now();
  let a = attempts.get(key);
  if (!a || a.reset < now) { a = { n: 0, reset: now + 15 * MIN }; attempts.set(key, a); }
  if (a.n >= max) throw new HttpError(429, `Muitas tentativas. Tente novamente em ${Math.ceil((a.reset - now) / MIN)} min.`);
  return a;
}

// ---------------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------------
// Casamento aberto ao entrar: o último usado; senão, o próprio; senão, o mais recente.
function defaultWorkspace(userId) {
  const last = S('SELECT last_workspace_id AS id FROM users WHERE id = ?').get(userId)?.id;
  if (last && S('SELECT 1 FROM memberships WHERE user_id = ? AND workspace_id = ?').get(userId, last)) return last;
  return S("SELECT workspace_id FROM memberships WHERE user_id = ? ORDER BY (role = 'owner') DESC, created_at DESC LIMIT 1").get(userId)?.workspace_id || null;
}
function createSession(req, res, userId, persistent, workspaceId = null) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const ttl = persistent ? SESSION_LONG : SESSION_SHORT;
  S(`INSERT INTO sessions (token_hash, user_id, workspace_id, csrf, ttl, persistent, created_at, last_seen, expires_at, ip, ua)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    sha256(token), userId, workspaceId, crypto.randomBytes(24).toString('base64url'), ttl, persistent ? 1 : 0,
    now, now, now + ttl, clientIp(req), String(req.headers['user-agent'] || '').slice(0, 250));
  res.setHeader('Set-Cookie', sessionCookie(req, token, persistent ? Math.floor(ttl / 1000) : null));
}
function getSession(req) {
  const token = parseCookies(req).sid;
  if (!token || token.length > 100) return null;
  const h = sha256(token);
  const now = Date.now();
  const q = () => S(`SELECT s.*, u.name, u.username, u.email, u.kind, m.role,
                            w.name AS ws_name, w.plan, w.trial_ends_at, w.paid_until
                     FROM sessions s
                     JOIN users u ON u.id = s.user_id
                     LEFT JOIN memberships m ON m.user_id = s.user_id AND m.workspace_id = s.workspace_id
                     LEFT JOIN workspaces w ON w.id = s.workspace_id
                     WHERE s.token_hash = ?`).get(h);
  let s = q();
  if (!s) return null;
  if (s.expires_at <= now) { S('DELETE FROM sessions WHERE token_hash = ?').run(h); return null; }
  // Perdeu o acesso ao casamento aberto: vai para outro dele; sem nenhum, só a assessoria continua conectada
  // (no perfil, sem casamento aberto).
  if (!s.workspace_id || !s.role) {
    const next = defaultWorkspace(s.user_id);
    if (!next && s.kind !== 'planner') { S('DELETE FROM sessions WHERE token_hash = ?').run(h); return null; }
    if (next !== s.workspace_id) { S('UPDATE sessions SET workspace_id = ? WHERE token_hash = ?').run(next, h); s = q(); }
  }
  if (now - s.last_seen > 5 * MIN) {
    S('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?').run(now, now + s.ttl, h);
  }
  return { ...s, token, tokenHash: h, access: s.workspace_id ? workspaceAccess(s, now) : 'none' };
}
function workspaceInfo(s) {
  const used = S('SELECT COALESCE(SUM(size), 0) AS n FROM files WHERE workspace_id = ?').get(s.workspace_id).n;
  return {
    id: s.workspace_id, name: s.ws_name, role: s.role,
    plan: s.plan, planLabel: PLAN_LABELS[s.plan] || s.plan, access: s.access,
    trialEndsAt: s.trial_ends_at, paidUntil: s.paid_until,
    usedBytes: used, quotaBytes: QUOTA,
  };
}

// ---------------------------------------------------------------------------
// Código de configuração (instalação própria, sem cadastro público)
// ---------------------------------------------------------------------------
const userCount = () => S('SELECT COUNT(*) AS n FROM users').get().n;
let setupCode = null;
function ensureSetupCode() {
  if (SIGNUP_OPEN || userCount() > 0) { setupCode = null; return; }
  if (!setupCode) {
    const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    setupCode = process.env.SETUP_CODE || Array.from({ length: 8 }, () => abc[crypto.randomInt(abc.length)]).join('');
  }
}

// ---------------------------------------------------------------------------
// Dados (sempre filtrados pelo espaço do casal)
// ---------------------------------------------------------------------------
function rowToItem(r) {
  return { ...JSON.parse(r.data), id: r.id, _created: r.created_at, _updated: r.updated_at, _by: r.updated_by };
}
function cleanData(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Dados inválidos.');
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    // fromPlanner é definido só pelo servidor (anotação escrita pela assessoria).
    if (k === 'id' || k === '__proto__' || k === 'fromPlanner' || k.startsWith('_') || k.length > 64) continue;
    out[k] = v;
  }
  if (JSON.stringify(out).length > 200_000) throw new HttpError(413, 'Registro muito grande.');
  return out;
}
function checkColl(c) {
  if (!COLLECTIONS.has(c)) throw new HttpError(404, 'Coleção desconhecida.');
  return c;
}
function insertItem(ws, coll, data, userId, now = Date.now()) {
  const id = crypto.randomUUID();
  S('INSERT INTO items (id, workspace_id, coll, data, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?,?)')
    .run(id, ws, coll, JSON.stringify(data), now, now, userId);
  return { ...data, id, _created: now, _updated: now, _by: userId };
}
function getSettings(ws) {
  const r = S('SELECT settings FROM workspaces WHERE id = ?').get(ws);
  return r ? JSON.parse(r.settings) : {};
}
function coupleName(s) {
  return [s.partner1, s.partner2].map((x) => String(x || '').trim()).filter(Boolean).join(' & ') || 'Nosso casamento';
}
// Arquivo privado (comprovante das finanças) de outra pessoa: para quem pergunta, ele não existe.
const notMine = (f, session) => !!f.owner_user_id && f.owner_user_id !== session.user_id;
function fileToJson(f) {
  return {
    id: f.id, name: f.name, ext: f.ext, size: f.size, category: f.category,
    vendorId: f.vendor_id, note: f.note || '', createdAt: f.created_at, uploadedBy: f.uploaded_by,
    ...(f.owner_user_id ? { private: true } : {}),
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
function vendorInWorkspace(ws, id) {
  return isUuid(id) && !!S("SELECT 1 FROM items WHERE id = ? AND coll = 'vendors' AND workspace_id = ?").get(id, ws);
}
function exportWorkspace(ws) {
  const items = {};
  for (const c of COLLECTIONS) items[c] = [];
  for (const r of S('SELECT * FROM items WHERE workspace_id = ? ORDER BY created_at').all(ws)) if (items[r.coll]) items[r.coll].push(rowToItem(r));
  // Comprovantes das finanças (privados de cada um) ficam fora dos Documentos do casamento.
  return { items, files: S('SELECT * FROM files WHERE workspace_id = ? AND owner_user_id IS NULL ORDER BY created_at DESC').all(ws).map(fileToJson) };
}

// O que a assessoria recebe do casamento (ver PLANNER_FILE_CATS).
function plannerData(items, files, settings) {
  const out = {};
  for (const c of COLLECTIONS) out[c] = [];
  out.vendors = items.vendors.map(({ price, split, ...v }) => v); // sem valores nem divisão (financeiro)
  out.guests = items.guests;
  out.tables = items.tables;
  out.timeline = items.timeline;
  out.notes = items.notes.filter((n) => n.fromPlanner); // só as anotações da assessoria
  // Só os nomes das categorias, para mostrar o que ainda falta contratar.
  out.budget = items.budget.map((b) => ({ id: b.id, name: b.name, order: b.order, skip: b.skip }));
  const { budgetTotal, ...st } = settings;
  return { items: out, files: files.filter((f) => PLANNER_FILE_CATS.has(f.category)), settings: st };
}

// Cria usuário + espaço do casal + modelos iniciais. Chamar dentro de tx().
function createAccount({ name, email, hash, partner1, partner2, date, plan, googleSub = null }) {
  const now = Date.now();
  const r = S('INSERT INTO users (username, email, name, pass_hash, google_sub, terms_accepted_at, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(uniqueUsername(email), email, name, hash, googleSub, now, now);
  const userId = Number(r.lastInsertRowid);
  const settings = {
    partner1: String(partner1 || '').trim().slice(0, 60),
    partner2: String(partner2 || '').trim().slice(0, 60),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : '',
  };
  const ws = crypto.randomUUID();
  S('INSERT INTO workspaces (id, name, settings, plan, trial_ends_at, created_at) VALUES (?,?,?,?,?,?)')
    .run(ws, coupleName(settings), JSON.stringify(settings), plan, plan === 'trial' ? now + TRIAL_DAYS * DAY : null, now);
  S("INSERT INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(userId, ws, now);
  BUDGET_CATEGORIES.forEach(([n, pct], i) => insertItem(ws, 'budget', { name: n, planned: 0, pct, order: i }, userId, now + i));
  TASK_TEMPLATE.forEach(([period, title], i) => insertItem(ws, 'tasks', { title, period, done: false, order: i }, userId, now + i));
  return { userId, ws };
}

// Quem fica sem nenhum casamento perde a conta, exceto a assessoria (o perfil é dela, não do casal).
function dropOrphanUser(uid) {
  if (S('SELECT 1 FROM memberships WHERE user_id = ?').get(uid)) return false;
  return S("DELETE FROM users WHERE id = ? AND kind <> 'planner'").run(uid).changes > 0;
}

// Convites por link: os noivos geram um link (vale 7 dias, uso único) e mandam como quiserem (WhatsApp…).
// Quem abre cria a própria conta ou entra na que já tem. Não depende de envio de e-mail e os noivos
// nunca definem a senha de ninguém. O banco guarda só o hash do token.
function findInvite(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const inv = S(`SELECT i.*, w.name AS ws_name, w.settings FROM invites i JOIN workspaces w ON w.id = i.workspace_id
                 WHERE i.token_hash = ?`).get(sha256(token));
  return inv && !inv.used_at && inv.expires_at > Date.now() ? inv : null;
}
const INVALID_INVITE = 'Este convite é inválido, já foi usado ou expirou. Peça um novo link aos noivos.';

// Confere e-mail e senha (com bloqueio por tentativas). Usado no login e ao aceitar convite com conta existente.
// kind ('couple' | 'planner'): só aceita contas desse tipo; os dois perfis são independentes.
const KIND_HINT = {
  couple: 'Este e-mail e senha são de um perfil de assessoria. Use a opção "Assessoria" para entrar.',
  planner: 'Este e-mail e senha são de uma conta de noivos. O perfil de assessoria é separado: crie um, se ainda não tiver.',
};
async function checkCredentials(req, login, password, kind = null) {
  const rl = rateBucket(`login:${clientIp(req)}`);
  login = String(login || '').trim();
  password = String(password || '');
  if (!login || !password || password.length > 256) throw new HttpError(400, 'Informe e-mail e senha.');
  // Com e-mail repetido (fase de testes), testa a senha em cada conta, da mais recente para a mais antiga.
  const now = Date.now();
  const all = S('SELECT * FROM users WHERE email = ? COLLATE NOCASE OR username = ? ORDER BY (email IS NOT NULL) DESC, id DESC LIMIT 10').all(login, login);
  const open = all.filter((u) => !(u.locked_until > now));
  if (all.length && !open.length) {
    const until = Math.min(...all.map((u) => u.locked_until));
    throw new HttpError(429, `Acesso bloqueado temporariamente por excesso de tentativas. Tente em ${Math.ceil((until - now) / MIN)} min.`);
  }
  const ofKind = kind ? open.filter((u) => u.kind === kind) : open;
  let user = ofKind[0] || null, valid = false, otherKind = false;
  if (!open.length) await verifyPassword(password, DUMMY_HASH);
  for (const u of ofKind) {
    if (await verifyPassword(password, u.pass_hash)) { user = u; valid = true; break; }
  }
  if (!valid && kind) {
    for (const u of open) if (u.kind !== kind && await verifyPassword(password, u.pass_hash)) { otherKind = true; break; }
    if (otherKind) throw new HttpError(403, KIND_HINT[kind], 'wrong_kind');
  }
  if (!user || !valid) {
    rl.n++;
    if (user) {
      const failed = user.failed + 1;
      const lock = failed >= LOCK_AFTER;
      S('UPDATE users SET failed = ?, locked_until = ? WHERE id = ?').run(lock ? 0 : failed, lock ? now + LOCK_TIME : 0, user.id);
    }
    await sleep(250 + crypto.randomInt(250));
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  }
  S('UPDATE users SET failed = 0, locked_until = 0 WHERE id = ?').run(user.id);
  return user;
}

function deleteWorkspace(ws) {
  const fileIds = S('SELECT id FROM files WHERE workspace_id = ?').all(ws).map((f) => f.id);
  tx(() => {
    const members = S('SELECT user_id FROM memberships WHERE workspace_id = ?').all(ws).map((m) => m.user_id);
    S('DELETE FROM items WHERE workspace_id = ?').run(ws);
    S('DELETE FROM files WHERE workspace_id = ?').run(ws);
    S('DELETE FROM sessions WHERE workspace_id = ?').run(ws);
    S('DELETE FROM workspaces WHERE id = ?').run(ws); // memberships saem em cascata
    for (const uid of members) {
      dropOrphanUser(uid);
    }
  });
  for (const id of fileIds) fs.rmSync(path.join(UPLOAD_DIR, id), { force: true });
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------
const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  const auth = opts.auth !== false;
  // ws: a rota precisa de um casamento aberto (a assessoria pode estar conectada sem nenhum).
  routes.push({ method, re, keys, handler, auth, ws: auth && opts.ws !== false, write: !!opts.write, team: !!opts.team, plannerNotes: !!opts.plannerNotes, owner: !!opts.owner, manage: !!opts.manage });
}

route('GET', '/api/status', ({ res }) => {
  send(res, 200, {
    needsSetup: !SIGNUP_OPEN && userCount() === 0,
    signupOpen: SIGNUP_OPEN,
    google: !!GOOGLE,
    maxUploadMb: MAX_UPLOAD_MB,
    trialDays: TRIAL_DAYS,
    pricing: PRICING,
  });
}, { auth: false });

// Instalação própria (sem cadastro público): primeira conta com código exibido no servidor.
route('POST', '/api/setup', async ({ req, res }) => {
  if (SIGNUP_OPEN) throw new HttpError(404, 'Use o cadastro.');
  if (userCount() > 0) throw new HttpError(409, 'O sistema já foi configurado. Faça login.');
  const rl = rateBucket(`setup:${clientIp(req)}`);
  const b = await readJson(req);
  ensureSetupCode();
  if (!safeEqual(String(b.code || '').trim().toUpperCase(), setupCode)) {
    rl.n++;
    throw new HttpError(403, 'Código de configuração inválido. Confira o código exibido na janela do servidor.');
  }
  const u = validateNewUser(b);
  const hash = await hashPassword(u.password);
  const acc = tx(() => {
    if (userCount() > 0) throw new HttpError(409, 'O sistema já foi configurado.');
    return createAccount({ ...b, ...u, hash, plan: 'lifetime' });
  });
  setupCode = null;
  createSession(req, res, acc.userId, true, acc.ws);
  send(res, 201, { ok: true });
}, { auth: false });

// Cadastro público (SIGNUP_OPEN=1): cria a conta com período de teste.
route('POST', '/api/signup', async ({ req, res }) => {
  if (!SIGNUP_OPEN) throw new HttpError(403, 'O cadastro não está aberto.');
  const rl = rateBucket(`signup:${clientIp(req)}`, 5);
  rl.n++;
  const b = await readJson(req);
  if (b.acceptTerms !== true) throw new HttpError(400, 'É preciso aceitar os Termos de Uso e a Política de Privacidade.');
  const u = validateNewUser(b);
  if (emailTaken(u.email)) throw new HttpError(409, 'Já existe uma conta com esse e-mail. Faça login ou recupere a senha.');
  const hash = await hashPassword(u.password);
  // Perfil de assessoria: só a conta, sem casamento próprio. Os casamentos chegam quando os noivos dão acesso.
  if (b.kind === 'planner') {
    const userId = tx(() => {
      if (emailTaken(u.email)) throw new HttpError(409, 'Já existe uma conta com esse e-mail.');
      const now = Date.now();
      return Number(S("INSERT INTO users (username, email, name, pass_hash, kind, terms_accepted_at, created_at) VALUES (?,?,?,?,'planner',?,?)")
        .run(uniqueUsername(u.email), u.email, u.name, hash, now, now).lastInsertRowid);
    });
    createSession(req, res, userId, true, null);
    return send(res, 201, { ok: true });
  }
  const acc = tx(() => {
    if (emailTaken(u.email)) throw new HttpError(409, 'Já existe uma conta com esse e-mail.');
    return createAccount({ ...b, ...u, hash, plan: 'trial' });
  });
  createSession(req, res, acc.userId, true, acc.ws);
  send(res, 201, { ok: true });
}, { auth: false });

route('POST', '/api/login', async ({ req, res }) => {
  const b = await readJson(req);
  const kind = ['couple', 'planner'].includes(b.kind) ? b.kind : null;
  const user = await checkCredentials(req, b.username || b.email, b.password, kind);
  const ws = defaultWorkspace(user.id);
  if (!ws && user.kind !== 'planner') throw new HttpError(403, 'Sua conta não está ligada a nenhum casamento. Peça um link de convite aos noivos.');
  createSession(req, res, user.id, !!b.remember, ws);
  send(res, 200, { ok: true });
}, { auth: false });

// ---------------------------------------------------------------------------
// Login com o Google (OAuth 2.0 com PKCE). A aba escolhida define o tipo de conta (noivos ou assessoria).
// Primeira vez: cria a conta sem senha. Já existe conta do mesmo tipo com o mesmo e-mail: liga o Google a ela.
// ---------------------------------------------------------------------------
const googleStates = new Map(); // state -> { verifier, nonce, kind, invite, exp }
const googleRedirect = (req) => `${appUrl(req)}/api/auth/google/callback`;
function stateCookie(req, value, maxAge) {
  const parts = [`gst=${value}`, 'Path=/api/auth/google', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (isHttps(req)) parts.push('Secure');
  return parts.join('; ');
}
function redirect(res, location, headers = {}) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', ...headers });
  res.end();
}
function accountAuth(userId) {
  const u = S('SELECT pass_hash, google_sub FROM users WHERE id = ?').get(userId);
  return { hasPassword: hasPassword(u?.pass_hash), google: !!u?.google_sub };
}

route('GET', '/api/auth/google/start', ({ req, res, url }) => {
  if (!GOOGLE) throw new HttpError(404, 'Login com o Google não configurado.');
  rateBucket(`gstart:${clientIp(req)}`, 40).n++;
  const now = Date.now();
  for (const [k, v] of googleStates) if (v.exp < now) googleStates.delete(k);
  const state = crypto.randomBytes(24).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const nonce = crypto.randomBytes(16).toString('base64url');
  const invite = String(url.searchParams.get('invite') || '').slice(0, 100);
  googleStates.set(state, { verifier, nonce, kind: url.searchParams.get('kind') === 'planner' ? 'planner' : 'couple', invite, exp: now + 10 * MIN });
  const q = new URLSearchParams({
    client_id: GOOGLE.id, redirect_uri: googleRedirect(req), response_type: 'code', scope: 'openid email profile',
    state, nonce, prompt: 'select_account',
    code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
  });
  redirect(res, `https://accounts.google.com/o/oauth2/v2/auth?${q}`, { 'Set-Cookie': stateCookie(req, state, 600) });
}, { auth: false });

route('GET', '/api/auth/google/callback', async ({ req, res, url }) => {
  const state = String(url.searchParams.get('state') || '');
  const st = googleStates.get(state);
  googleStates.delete(state);
  const back = (code, kind = st?.kind, invite = st?.invite) => redirect(res,
    invite ? `/#/convite?token=${encodeURIComponent(invite)}&erro=${code}` : `/#/entrar?${kind === 'planner' ? 'perfil=assessoria&' : ''}erro=${code}`,
    { 'Set-Cookie': stateCookie(req, '', 0) });
  // O state precisa ser o mesmo guardado neste navegador: impede que alguém "logue" você na conta dele.
  if (!GOOGLE || !st || st.exp < Date.now() || !safeEqual(parseCookies(req).gst || '', state)) return back('google_falhou');
  if (url.searchParams.get('error') || !url.searchParams.get('code')) return back('google_cancelado');

  let claims;
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: url.searchParams.get('code'), client_id: GOOGLE.id, client_secret: GOOGLE.secret,
        redirect_uri: googleRedirect(req), grant_type: 'authorization_code', code_verifier: st.verifier,
      }),
    });
    const tok = await r.json();
    if (!r.ok || !tok.id_token) throw new Error(tok.error || 'sem id_token');
    // O id_token veio direto do Google (HTTPS, com a nossa chave secreta): basta conferir os campos.
    claims = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString('utf8'));
  } catch (e) {
    console.error('Login com o Google falhou:', e.message);
    return back('google_falhou');
  }
  const okIss = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  if (!okIss || claims.aud !== GOOGLE.id || claims.exp * 1000 < Date.now() || claims.nonce !== st.nonce || !claims.sub) return back('google_falhou');
  if (!claims.email || claims.email_verified !== true) return back('google_email');

  const sub = String(claims.sub);
  const email = normEmail(claims.email);
  const name = String(claims.name || claims.given_name || email.split('@')[0]).trim().slice(0, 60);
  const now = Date.now();
  let userId = null, ws = null;

  // Convite do par/família (ou de assessoria antigo) pelo Google: sempre uma conta nova para esse casamento,
  // ou o perfil de assessoria já ligado a este Google.
  if (st.invite) {
    const inv = findInvite(st.invite);
    if (!inv) return back('convite_invalido');
    const kind = inv.role === 'planner' ? 'planner' : 'couple';
    const linked = S('SELECT id, kind FROM users WHERE google_sub = ?').get(sub);
    if (linked && !(kind === 'planner' && linked.kind === 'planner')) return back('google_ja_ligado');
    try {
      tx(() => {
        userId = linked ? linked.id : Number(S('INSERT INTO users (username, email, name, pass_hash, kind, google_sub, terms_accepted_at, created_at) VALUES (?,?,?,?,?,?,?,?)')
          .run(uniqueUsername(email), email, name, NO_PASSWORD, kind, sub, now, now).lastInsertRowid);
        const used = S('UPDATE invites SET used_at = ?, used_by = ? WHERE id = ? AND used_at IS NULL').run(now, userId, inv.id);
        if (!used.changes) throw new HttpError(404, INVALID_INVITE);
        if (!S('SELECT 1 FROM memberships WHERE user_id = ? AND workspace_id = ?').get(userId, inv.workspace_id)) {
          const n = S('SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ?').get(inv.workspace_id).n;
          if (n >= MAX_MEMBERS) throw new HttpError(400, 'limite');
          S('INSERT INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, ?, ?, ?)').run(userId, inv.workspace_id, inv.role, now);
        }
        S('UPDATE users SET last_workspace_id = ? WHERE id = ?').run(inv.workspace_id, userId);
      });
    } catch (e) {
      return back(e.message === 'limite' ? 'convite_limite' : 'convite_invalido');
    }
    createSession(req, res, userId, true, inv.workspace_id);
    res.setHeader('Set-Cookie', [res.getHeader('Set-Cookie'), stateCookie(req, '', 0)]);
    return redirect(res, '/#/');
  }

  const kind = st.kind;
  let user = S('SELECT * FROM users WHERE google_sub = ?').get(sub);
  if (user && user.kind !== kind) return back(user.kind === 'planner' ? 'google_e_assessoria' : 'google_e_noivos');
  if (!user) {
    // Conta já existente com este e-mail (o Google confirmou o e-mail): liga o Google a ela.
    user = S('SELECT * FROM users WHERE email = ? COLLATE NOCASE AND kind = ? AND google_sub IS NULL ORDER BY id DESC LIMIT 1').get(email, kind);
    if (user) S('UPDATE users SET google_sub = ?, failed = 0, locked_until = 0 WHERE id = ?').run(sub, user.id);
  }
  if (user) {
    userId = user.id;
    ws = defaultWorkspace(userId);
    if (!ws && kind !== 'planner') return back('sem_casamento');
  } else {
    if (!SIGNUP_OPEN) return back('cadastro_fechado');
    try { rateBucket(`signup:${clientIp(req)}`, 5).n++; } catch { return back('muitas_tentativas'); }
    if (kind === 'planner') {
      userId = Number(S("INSERT INTO users (username, email, name, pass_hash, kind, google_sub, terms_accepted_at, created_at) VALUES (?,?,?,?,'planner',?,?,?)")
        .run(uniqueUsername(email), email, name, NO_PASSWORD, sub, now, now).lastInsertRowid);
    } else {
      const acc = tx(() => createAccount({ name, email, hash: NO_PASSWORD, plan: 'trial', googleSub: sub }));
      userId = acc.userId; ws = acc.ws;
    }
  }
  createSession(req, res, userId, true, ws);
  res.setHeader('Set-Cookie', [res.getHeader('Set-Cookie'), stateCookie(req, '', 0)]);
  redirect(res, '/#/');
}, { auth: false });

route('POST', '/api/password/forgot', async ({ req, res }) => {
  const rl = rateBucket(`forgot:${clientIp(req)}`, 5);
  rl.n++;
  const email = normEmail((await readJson(req)).email);
  const user = isEmail(email) ? S('SELECT id, name, email FROM users WHERE email = ? COLLATE NOCASE ORDER BY id DESC').get(email) : null;
  if (user) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    tx(() => {
      S('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
      S('INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)').run(sha256(token), user.id, now + RESET_TTL, now);
    });
    const link = `${appUrl(req)}/#/redefinir?token=${token}`;
    const mail = emailLayout({
      title: 'Redefinir sua senha',
      intro: `Olá, ${user.name}! Recebemos um pedido para redefinir a sua senha do BRIDEx. O link vale por 1 hora.`,
      buttonText: 'Criar nova senha',
      buttonUrl: link,
      outro: 'Se não foi você, ignore este e-mail: sua senha continua a mesma.',
    });
    // Envio em segundo plano: a resposta leva o mesmo tempo existindo ou não a conta.
    sendMail({ to: user.email, subject: 'Redefinição de senha · BRIDEx', ...mail });
  }
  await sleep(300 + crypto.randomInt(300));
  send(res, 200, { ok: true });
}, { auth: false });

route('POST', '/api/password/reset', async ({ req, res }) => {
  const rl = rateBucket(`reset:${clientIp(req)}`);
  const b = await readJson(req);
  const token = String(b.token || '');
  const row = token.length >= 20 && token.length <= 100 ? S('SELECT * FROM password_resets WHERE token_hash = ?').get(sha256(token)) : null;
  if (!row || row.expires_at < Date.now()) {
    rl.n++;
    throw new HttpError(400, 'Este link é inválido ou expirou. Peça um novo em "Esqueci minha senha".');
  }
  validatePassword(b.password);
  const hash = await hashPassword(b.password);
  tx(() => {
    S('UPDATE users SET pass_hash = ?, failed = 0, locked_until = 0 WHERE id = ?').run(hash, row.user_id);
    S('DELETE FROM password_resets WHERE user_id = ?').run(row.user_id);
    S('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
  });
  send(res, 200, { ok: true });
}, { auth: false });

route('POST', '/api/logout', ({ req, res, session }) => {
  S('DELETE FROM sessions WHERE token_hash = ?').run(session.tokenHash);
  send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
}, { ws: false });

route('GET', '/api/me', ({ req, res, session }) => {
  const headers = {};
  if (session.persistent) headers['Set-Cookie'] = sessionCookie(req, session.token, Math.floor(session.ttl / 1000));
  send(res, 200, {
    user: { id: session.user_id, name: session.name, username: session.username, email: session.email, kind: session.kind, ...accountAuth(session.user_id) },
    csrf: session.csrf,
    workspace: session.workspace_id ? workspaceInfo(session) : null,
    workspaceCount: S('SELECT COUNT(*) AS n FROM memberships WHERE user_id = ?').get(session.user_id).n,
  }, headers);
}, { ws: false });

route('PUT', '/api/me', async ({ req, res, session }) => {
  const b = await readJson(req);
  const name = String(b.name || '').trim();
  if (!name || name.length > 60) throw new HttpError(400, 'Informe um nome (até 60 caracteres).');
  let email = session.email;
  if (b.email !== undefined) {
    email = normEmail(b.email);
    if (!isEmail(email)) throw new HttpError(400, 'Informe um e-mail válido.');
    if (emailTaken(email, session.user_id)) throw new HttpError(409, 'Esse e-mail já está em uso por outra conta.');
  }
  S('UPDATE users SET name = ?, email = ? WHERE id = ?').run(name, email, session.user_id);
  send(res, 200, { ok: true, name, email });
}, { ws: false });

// Excluir a própria conta (LGPD): assessoria e convidados. Quem criou um casamento exclui pelo casamento.
route('DELETE', '/api/me', async ({ req, res, session }) => {
  const b = await readJson(req);
  const user = S('SELECT pass_hash FROM users WHERE id = ?').get(session.user_id);
  // Sem senha (conta do Google): a confirmação é a palavra EXCLUIR, digitada na tela.
  if (hasPassword(user.pass_hash) ? !(await verifyPassword(String(b.password || ''), user.pass_hash)) : String(b.confirm || '').trim().toUpperCase() !== 'EXCLUIR') {
    throw new HttpError(400, hasPassword(user.pass_hash) ? 'Senha incorreta.' : 'Digite EXCLUIR para confirmar.');
  }
  const own = S("SELECT w.name FROM memberships m JOIN workspaces w ON w.id = m.workspace_id WHERE m.user_id = ? AND m.role = 'owner' LIMIT 1").get(session.user_id);
  if (own) throw new HttpError(400, `Você criou o casamento "${own.name}". Para apagar tudo, abra esse casamento e use "Excluir conta e todos os dados" em Configurações.`);
  // Comprovantes privados das finanças saem junto com a conta.
  for (const f of S('SELECT id FROM files WHERE owner_user_id = ?').all(session.user_id)) fs.rmSync(path.join(UPLOAD_DIR, f.id), { force: true });
  S('DELETE FROM files WHERE owner_user_id = ?').run(session.user_id);
  S('DELETE FROM users WHERE id = ?').run(session.user_id); // acessos, sessões e links saem em cascata
  send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
}, { ws: false });

route('POST', '/api/password', async ({ req, res, session }) => {
  const b = await readJson(req);
  const user = S('SELECT * FROM users WHERE id = ?').get(session.user_id);
  // Conta criada pelo Google ainda sem senha: cria a primeira sem pedir a atual.
  if (hasPassword(user.pass_hash) && !(await verifyPassword(String(b.current || ''), user.pass_hash))) throw new HttpError(400, 'A senha atual está incorreta.');
  validatePassword(b.next);
  const hash = await hashPassword(b.next);
  S('UPDATE users SET pass_hash = ? WHERE id = ?').run(hash, user.id);
  S('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(user.id, session.tokenHash);
  send(res, 200, { ok: true });
}, { ws: false });

// Pessoas com acesso ao casamento
route('GET', '/api/users', ({ res, session }) => {
  const rows = S(`SELECT u.id, u.name, u.username, u.email, u.created_at, m.role
                  FROM memberships m JOIN users u ON u.id = m.user_id
                  WHERE m.workspace_id = ? ORDER BY m.created_at, u.id`).all(session.workspace_id);
  send(res, 200, rows.map((u) => ({
    id: u.id, name: u.name, email: u.email || '', username: u.username, role: u.role, createdAt: u.created_at, isMe: u.id === session.user_id,
  })));
});

// Noivos convidam pessoas (o par, a assessoria ou família/amigos) gerando um link de convite.
route('POST', '/api/invites', async ({ req, res, session }) => {
  const b = await readJson(req);
  if (b.role === 'planner') throw new HttpError(400, 'A assessoria entra com o código de acesso do casamento (em Configurações › Assessoria).');
  const role = b.role === 'couple' ? 'couple' : 'member';
  const label = String(b.name || '').trim().slice(0, 60);
  const ws = session.workspace_id;
  const n = S('SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ?').get(ws).n;
  if (n >= MAX_MEMBERS) throw new HttpError(400, `Limite de ${MAX_MEMBERS} pessoas por casamento atingido.`);
  const open = S('SELECT COUNT(*) AS n FROM invites WHERE workspace_id = ? AND used_at IS NULL AND expires_at > ?').get(ws, Date.now()).n;
  if (open >= 20) throw new HttpError(400, 'Há convites demais em aberto. Cancele os que não serão usados.');
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  S('INSERT INTO invites (token_hash, workspace_id, role, label, created_by, created_at, expires_at) VALUES (?,?,?,?,?,?,?)')
    .run(sha256(token), ws, role, label, session.user_id, now, now + INVITE_TTL);
  send(res, 201, { url: `${appUrl(req)}/#/convite?token=${token}`, role, name: label, expiresAt: now + INVITE_TTL });
}, { manage: true, write: true });

route('GET', '/api/invites', ({ res, session }) => {
  const rows = S(`SELECT id, role, label, created_at, expires_at FROM invites
                  WHERE workspace_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at`).all(session.workspace_id, Date.now());
  send(res, 200, rows.map((r) => ({ id: r.id, role: r.role, name: r.label, createdAt: r.created_at, expiresAt: r.expires_at })));
}, { manage: true });

route('DELETE', '/api/invites/:id', ({ res, params, session }) => {
  S('DELETE FROM invites WHERE id = ? AND workspace_id = ?').run(Number(params.id), session.workspace_id);
  send(res, 200, { ok: true });
}, { manage: true });

// Tela do convite (antes de entrar): de qual casamento é e com que tipo de acesso.
route('GET', '/api/invites/info', ({ req, res, url }) => {
  const rl = rateBucket(`inviteinfo:${clientIp(req)}`, 30);
  const inv = findInvite(url.searchParams.get('token'));
  if (!inv) { rl.n++; throw new HttpError(404, INVALID_INVITE); }
  const st = JSON.parse(inv.settings);
  send(res, 200, { wedding: inv.ws_name, date: st.date || '', role: inv.role, name: inv.label });
}, { auth: false });

// Aceitar o convite: com a sessão atual, entrando com uma conta existente ou criando uma conta nova.
route('POST', '/api/invites/accept', async ({ req, res }) => {
  const rl = rateBucket(`invite:${clientIp(req)}`, 20);
  const b = await readJson(req);
  const inv = findInvite(b.token);
  if (!inv) { rl.n++; throw new HttpError(404, INVALID_INVITE); }
  const session = getSession(req);
  // Convite de assessoria só entra num perfil de assessoria. Convite de noivos/família cria uma conta nova:
  // conta de noivos pertence a um casamento só.
  const kind = inv.role === 'planner' ? 'planner' : 'couple';
  let userId = null, newUser = null;
  if (session && !b.mode) {
    if (!safeEqual(String(req.headers['x-csrf-token'] || ''), session.csrf)) throw new HttpError(403, 'Token de segurança inválido. Recarregue a página.');
    userId = session.user_id;
  } else if (b.mode === 'login') {
    if (kind !== 'planner') throw new HttpError(400, 'Este convite cria uma conta nova para este casamento. Use "Criar conta".');
    userId = (await checkCredentials(req, b.email, b.password, 'planner')).id;
  } else {
    if (b.acceptTerms !== true) throw new HttpError(400, 'É preciso aceitar os Termos de Uso e a Política de Privacidade.');
    const u = validateNewUser(b);
    if (emailTaken(u.email)) throw new HttpError(409, 'Já existe uma conta com esse e-mail. Use "Já tenho conta" para entrar com ela.');
    newUser = { ...u, hash: await hashPassword(u.password) };
  }
  if (userId) {
    const u = S('SELECT kind FROM users WHERE id = ?').get(userId);
    if (kind === 'planner' && u.kind !== 'planner') {
      throw new HttpError(409, 'Este convite é para um perfil de assessoria e você está numa conta de noivos. Saia e entre (ou crie) o seu perfil de assessoria.', 'wrong_kind');
    }
    if (kind === 'couple') {
      throw new HttpError(409, u.kind === 'planner'
        ? 'Este convite é para noivos ou família, e você está no perfil de assessoria. Saia e crie uma conta para este casamento.'
        : 'Sua conta já pertence a um casamento. Para este convite, saia e crie uma conta nova.', 'wrong_kind');
    }
  }
  // Conta nova, acesso e uso do convite numa transação só: se algo falhar, nada fica pela metade.
  tx(() => {
    if (newUser) {
      if (emailTaken(newUser.email)) throw new HttpError(409, 'Já existe uma conta com esse e-mail.');
      const now = Date.now();
      userId = Number(S('INSERT INTO users (username, email, name, pass_hash, kind, terms_accepted_at, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(uniqueUsername(newUser.email), newUser.email, newUser.name, newUser.hash, kind, now, now).lastInsertRowid);
    }
    // Uso único: marca como usado na mesma transação (dois cliques no mesmo link não viram dois acessos).
    const used = S('UPDATE invites SET used_at = ?, used_by = ? WHERE id = ? AND used_at IS NULL').run(Date.now(), userId, inv.id);
    if (!used.changes) throw new HttpError(404, INVALID_INVITE);
    if (!S('SELECT 1 FROM memberships WHERE user_id = ? AND workspace_id = ?').get(userId, inv.workspace_id)) {
      const n = S('SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ?').get(inv.workspace_id).n;
      if (n >= MAX_MEMBERS) throw new HttpError(400, `Este casamento já tem o limite de ${MAX_MEMBERS} pessoas. Fale com os noivos.`);
      S('INSERT INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, ?, ?, ?)').run(userId, inv.workspace_id, inv.role, Date.now());
    }
    S('UPDATE users SET last_workspace_id = ? WHERE id = ?').run(inv.workspace_id, userId);
  });
  if (session && !b.mode) S('UPDATE sessions SET workspace_id = ? WHERE token_hash = ?').run(inv.workspace_id, session.tokenHash);
  else createSession(req, res, userId, true, inv.workspace_id);
  send(res, newUser ? 201 : 200, { ok: true, wedding: inv.ws_name });
}, { auth: false });

// Noivos mudam o tipo de acesso de alguém (ex.: marcar o par como noivo(a)).
route('PUT', '/api/users/:id', async ({ req, res, params, session }) => {
  const id = Number(params.id);
  const role = (await readJson(req)).role;
  if (!['couple', 'member'].includes(role)) throw new HttpError(400, 'Tipo de acesso inválido. A assessoria entra só pelo convite de assessoria.');
  if (id === session.user_id) throw new HttpError(400, 'Você não pode mudar o próprio tipo de acesso.');
  const m = S('SELECT role FROM memberships WHERE user_id = ? AND workspace_id = ?').get(id, session.workspace_id);
  if (!m) throw new HttpError(404, 'Pessoa não encontrada neste casamento.');
  if (m.role === 'owner') throw new HttpError(403, 'Não é possível mudar o acesso de quem criou o casamento.');
  if (m.role === 'planner') throw new HttpError(400, 'A assessoria tem um perfil próprio, só de consulta. Para tirar o acesso, remova a pessoa.');
  S('UPDATE memberships SET role = ? WHERE user_id = ? AND workspace_id = ?').run(role, id, session.workspace_id);
  send(res, 200, { ok: true, role });
}, { manage: true });

route('DELETE', '/api/users/:id', ({ res, params, session }) => {
  const id = Number(params.id);
  if (id === session.user_id) throw new HttpError(400, 'Para sair deste casamento, use "Sair deste casamento".');
  tx(() => {
    const m = S('SELECT role FROM memberships WHERE user_id = ? AND workspace_id = ?').get(id, session.workspace_id);
    if (!m) throw new HttpError(404, 'Pessoa não encontrada neste casamento.');
    if (m.role === 'owner') throw new HttpError(403, 'Não é possível remover quem criou o casamento.');
    S('DELETE FROM memberships WHERE user_id = ? AND workspace_id = ?').run(id, session.workspace_id);
    // As sessões abertas nesse casamento passam para outro casamento da pessoa (ver getSession);
    // sem nenhum, a assessoria fica no perfil e as demais contas são apagadas (sessões em cascata).
    dropOrphanUser(id);
  });
  send(res, 200, { ok: true });
}, { manage: true });

// Código de acesso da assessoria: só os noivos veem e podem trocar (trocar não remove quem já entrou).
route('GET', '/api/planner-code', ({ res, session }) => {
  send(res, 200, { code: fmtCode(plannerCode(session.workspace_id)) });
}, { manage: true });

route('POST', '/api/planner-code/rotate', ({ res, session }) => {
  send(res, 200, { code: fmtCode(newPlannerCode(session.workspace_id)) });
}, { manage: true });

// A assessora digita, no próprio perfil, o código que cada casal passou: o casamento entra para consulta.
route('POST', '/api/planner/join', async ({ req, res, session }) => {
  if (session.kind !== 'planner') throw new HttpError(403, 'Só perfis de assessoria adicionam casamentos por código.');
  const rlIp = rateBucket(`plannercode:${clientIp(req)}`, 10);
  const rlUser = rateBucket(`plannercode:u${session.user_id}`, 10);
  const code = normCode((await readJson(req)).code);
  const ws = code.length === 8 ? S('SELECT id, name FROM workspaces WHERE planner_code = ?').get(code) : null;
  if (!ws) {
    rlIp.n++; rlUser.n++;
    await sleep(200 + crypto.randomInt(200));
    throw new HttpError(404, 'Código não encontrado. Confira com os noivos: ele fica em Configurações › Assessoria.');
  }
  const uid = session.user_id;
  tx(() => {
    if (!S('SELECT 1 FROM memberships WHERE user_id = ? AND workspace_id = ?').get(uid, ws.id)) {
      const n = S('SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ?').get(ws.id).n;
      if (n >= MAX_MEMBERS) throw new HttpError(400, `Este casamento já tem o limite de ${MAX_MEMBERS} pessoas. Fale com os noivos.`);
      S("INSERT INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, ?, 'planner', ?)").run(uid, ws.id, Date.now());
    }
    S('UPDATE users SET last_workspace_id = ? WHERE id = ?').run(ws.id, uid);
    S('UPDATE sessions SET workspace_id = ? WHERE token_hash = ?').run(ws.id, session.tokenHash);
  });
  send(res, 200, { ok: true, wedding: ws.name });
}, { ws: false });

// Casamentos de que a pessoa participa (assessoras costumam ter vários)
route('GET', '/api/workspaces', ({ res, session }) => {
  const rows = S(`SELECT w.id, w.name, w.settings, w.plan, w.trial_ends_at, w.paid_until, m.role
                  FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
                  WHERE m.user_id = ?`).all(session.user_id);
  send(res, 200, rows.map((w) => {
    const s = JSON.parse(w.settings);
    return { id: w.id, name: w.name, role: w.role, date: s.date || '', place: s.receptionPlace || s.ceremonyPlace || '', access: workspaceAccess(w), current: w.id === session.workspace_id };
  }).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')));
}, { ws: false });

route('POST', '/api/workspaces/switch', async ({ req, res, session }) => {
  const id = String((await readJson(req)).id || '');
  if (!S('SELECT 1 FROM memberships WHERE user_id = ? AND workspace_id = ?').get(session.user_id, id)) {
    throw new HttpError(404, 'Casamento não encontrado.');
  }
  S('UPDATE sessions SET workspace_id = ? WHERE token_hash = ?').run(id, session.tokenHash);
  S('UPDATE users SET last_workspace_id = ? WHERE id = ?').run(id, session.user_id);
  send(res, 200, { ok: true });
}, { ws: false });

// Quem não é dono(a) pode sair de um casamento (ex.: a assessoria ao fim do contrato).
route('POST', '/api/workspaces/leave', ({ req, res, session }) => {
  if (session.role === 'owner') throw new HttpError(400, 'Quem criou o casamento não pode sair dele; é possível excluir a conta.');
  const uid = session.user_id;
  let next = null, deleted = false;
  tx(() => {
    S('DELETE FROM memberships WHERE user_id = ? AND workspace_id = ?').run(uid, session.workspace_id);
    S('DELETE FROM sessions WHERE user_id = ? AND workspace_id = ?').run(uid, session.workspace_id);
    next = defaultWorkspace(uid);
    if (!next) deleted = dropOrphanUser(uid); // a assessoria continua com o perfil, mesmo sem casamentos
  });
  if (!deleted) {
    createSession(req, res, uid, !!session.persistent, next);
    return send(res, 200, { ok: true, switched: !!next });
  }
  send(res, 200, { ok: true, accountDeleted: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
});

route('GET', '/api/sessions', ({ res, session }) => {
  const rows = S('SELECT token_hash, created_at, last_seen, ip, ua FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen DESC')
    .all(session.user_id, Date.now());
  send(res, 200, rows.map((r) => ({ createdAt: r.created_at, lastSeen: r.last_seen, ip: r.ip, ua: r.ua, current: r.token_hash === session.tokenHash })));
}, { ws: false });

route('POST', '/api/sessions/revoke-others', ({ res, session }) => {
  const r = S('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(session.user_id, session.tokenHash);
  send(res, 200, { ok: true, removed: Number(r.changes) });
}, { ws: false });

// Dados do casamento
route('GET', '/api/data', ({ res, session }) => {
  const ws = session.workspace_id;
  let { items, files } = exportWorkspace(ws);
  let settings = getSettings(ws);
  const users = S('SELECT u.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ?').all(ws)
    .map((u) => ({ id: u.id, name: u.name }));
  if (session.role === 'planner') ({ items, files, settings } = plannerData(items, files, settings));
  send(res, 200, { settings, items, files, users });
});

route('PUT', '/api/settings', async ({ req, res, session }) => {
  const merged = { ...getSettings(session.workspace_id), ...cleanData(await readJson(req)) };
  S('UPDATE workspaces SET settings = ?, name = ? WHERE id = ?').run(JSON.stringify(merged), coupleName(merged), session.workspace_id);
  send(res, 200, merged);
}, { write: true });

route('POST', '/api/items/:coll', async ({ req, res, params, session }) => {
  const coll = checkColl(params.coll);
  checkPlannerNote(session, coll);
  const data = cleanData(await readJson(req));
  if (session.role === 'planner') data.fromPlanner = true;
  send(res, 201, insertItem(session.workspace_id, coll, data, session.user_id));
}, { write: true, plannerNotes: true });

route('POST', '/api/items/:coll/bulk', async ({ req, res, params, session }) => {
  const coll = checkColl(params.coll);
  const b = await readJson(req);
  if (!Array.isArray(b.items) || b.items.length > 3000) throw new HttpError(400, 'Lista inválida.');
  const now = Date.now();
  const created = tx(() => b.items.map((d, i) => insertItem(session.workspace_id, coll, cleanData(d), session.user_id, now + i)));
  send(res, 201, created);
}, { write: true });

route('PUT', '/api/items/:coll/:id', async ({ req, res, params, session }) => {
  const coll = checkColl(params.coll);
  if (!isUuid(params.id)) throw new HttpError(400, 'ID inválido.');
  const row = S('SELECT * FROM items WHERE id = ? AND coll = ? AND workspace_id = ?').get(params.id, coll, session.workspace_id);
  if (!row) throw new HttpError(404, 'Registro não encontrado (talvez tenha sido excluído).');
  checkPlannerNote(session, coll, row);
  const merged = { ...JSON.parse(row.data), ...cleanData(await readJson(req)) };
  const data = JSON.stringify(merged);
  if (data.length > 200_000) throw new HttpError(413, 'Registro muito grande.');
  const now = Date.now();
  S('UPDATE items SET data = ?, updated_at = ?, updated_by = ? WHERE id = ? AND workspace_id = ?').run(data, now, session.user_id, params.id, session.workspace_id);
  send(res, 200, rowToItem({ ...row, data, updated_at: now, updated_by: session.user_id }));
}, { write: true, plannerNotes: true });

route('DELETE', '/api/items/:coll/:id', ({ res, params, session }) => {
  const coll = checkColl(params.coll);
  if (!isUuid(params.id)) throw new HttpError(400, 'ID inválido.');
  const ws = session.workspace_id;
  if (session.role === 'planner') checkPlannerNote(session, coll, S('SELECT data FROM items WHERE id = ? AND coll = ? AND workspace_id = ?').get(params.id, coll, ws) || { data: '{}' });
  let cascaded = false;
  tx(() => {
    const r = S('DELETE FROM items WHERE id = ? AND coll = ? AND workspace_id = ?').run(params.id, coll, ws);
    if (!r.changes) return;
    if (coll === 'vendors') {
      S(`DELETE FROM items WHERE coll = 'payments' AND workspace_id = ? AND json_extract(data, '$.vendorId') = ?`).run(ws, params.id);
      S('UPDATE files SET vendor_id = NULL WHERE vendor_id = ? AND workspace_id = ?').run(params.id, ws);
      cascaded = true;
    }
    if (coll === 'tables') {
      S(`UPDATE items SET data = json_set(data, '$.tableId', NULL), updated_at = ?
         WHERE coll = 'guests' AND workspace_id = ? AND json_extract(data, '$.tableId') = ?`).run(Date.now(), ws, params.id);
      cascaded = true;
    }
  });
  send(res, 200, { ok: true, cascaded });
}, { write: true, plannerNotes: true });

// Excluir vários pagamentos de uma vez (seleção na lista).
route('POST', '/api/items/payments/delete', async ({ req, res, session }) => {
  const b = await readJson(req);
  if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 500 || !b.ids.every(isUuid)) throw new HttpError(400, 'Lista inválida.');
  const ws = session.workspace_id;
  const n = tx(() => b.ids.reduce((acc, id) => acc + S("DELETE FROM items WHERE id = ? AND coll = 'payments' AND workspace_id = ?").run(id, ws).changes, 0));
  send(res, 200, { ok: true, deleted: n });
}, { write: true });

// Arquivos
route('POST', '/api/files', async ({ req, res, session }) => {
  res.setHeader('Connection', 'close');
  const ws = session.workspace_id;
  let rawName;
  try { rawName = decodeURIComponent(String(req.headers['x-file-name'] || '')); }
  catch { throw new HttpError(400, 'Nome de arquivo inválido.'); }
  const name = sanitizeFileName(rawName);
  const ext = path.extname(name).slice(1).toLowerCase();
  if (!FILE_TYPES[ext]) throw new HttpError(415, 'Tipo de arquivo não permitido. Use PDF, imagens, Word, Excel ou texto.');
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_UPLOAD) throw new HttpError(413, `Arquivo maior que ${MAX_UPLOAD_MB} MB.`);
  const used = S('SELECT COALESCE(SUM(size), 0) AS n FROM files WHERE workspace_id = ?').get(ws).n;
  const quotaMsg = `Espaço de armazenamento cheio (limite de ${QUOTA_MB >= 1024 ? `${QUOTA_MB / 1024} GB` : `${QUOTA_MB} MB`}). Exclua arquivos que não precisa mais.`;
  if (used + declared > QUOTA) throw new HttpError(413, quotaMsg);
  // X-Private: 1 = comprovante das finanças (só de quem enviou; só os noivos têm finanças).
  const priv = req.headers['x-private'] === '1';
  if (priv) checkFin(session);
  const cat = String(req.headers['x-category'] || '');
  const category = priv ? 'comprovante' : FILE_CATEGORIES.has(cat) ? cat : 'outros';
  const vendorHeader = String(req.headers['x-vendor-id'] || '');
  const vendorId = !priv && vendorInWorkspace(ws, vendorHeader) ? vendorHeader : null;
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
        if (used + size > QUOTA) throw new HttpError(413, quotaMsg);
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
  S('INSERT INTO files (id, workspace_id, name, ext, size, category, vendor_id, note, created_at, uploaded_by, owner_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, ws, name, ext, size, category, vendorId, note, now, session.user_id, priv ? session.user_id : null);
  send(res, 201, fileToJson(S('SELECT * FROM files WHERE id = ?').get(id)));
}, { write: true });

route('GET', '/api/files/:id', ({ res, params, url, session }) => {
  if (!isUuid(params.id)) throw new HttpError(400, 'ID inválido.');
  const f = S('SELECT * FROM files WHERE id = ? AND workspace_id = ?').get(params.id, session.workspace_id);
  if (!f || (session.role === 'planner' && !PLANNER_FILE_CATS.has(f.category)) || notMine(f, session)) throw new HttpError(404, 'Arquivo não encontrado.');
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

route('PUT', '/api/files/:id', async ({ req, res, params, session }) => {
  if (!isUuid(params.id)) throw new HttpError(400, 'ID inválido.');
  const ws = session.workspace_id;
  const f = S('SELECT * FROM files WHERE id = ? AND workspace_id = ?').get(params.id, ws);
  if (!f || notMine(f, session)) throw new HttpError(404, 'Arquivo não encontrado.');
  const b = await readJson(req);
  let name = f.name;
  if (typeof b.name === 'string' && b.name.trim()) {
    name = sanitizeFileName(b.name);
    if (path.extname(name).slice(1).toLowerCase() !== f.ext) name = `${name}.${f.ext}`;
  }
  const category = FILE_CATEGORIES.has(b.category) ? b.category : f.category;
  const vendorId = b.vendorId === undefined ? f.vendor_id : (vendorInWorkspace(ws, b.vendorId) ? b.vendorId : null);
  const note = typeof b.note === 'string' ? b.note.slice(0, 500) : f.note;
  S('UPDATE files SET name = ?, category = ?, vendor_id = ?, note = ? WHERE id = ? AND workspace_id = ?').run(name, category, vendorId, note, f.id, ws);
  send(res, 200, fileToJson(S('SELECT * FROM files WHERE id = ?').get(f.id)));
}, { write: true });

// Excluir arquivo é permitido mesmo em modo só leitura (libera espaço / LGPD).
route('DELETE', '/api/files/:id', ({ res, params, session }) => {
  if (!isUuid(params.id)) throw new HttpError(400, 'ID inválido.');
  const f = S('SELECT owner_user_id FROM files WHERE id = ? AND workspace_id = ?').get(params.id, session.workspace_id);
  if (f && notMine(f, session)) throw new HttpError(404, 'Arquivo não encontrado.');
  const r = S('DELETE FROM files WHERE id = ? AND workspace_id = ?').run(params.id, session.workspace_id);
  if (r.changes) fs.rmSync(path.join(UPLOAD_DIR, params.id), { force: true });
  send(res, 200, { ok: true });
}, { team: true });

// ---------------------------------------------------------------------------
// Finanças pessoais
// ---------------------------------------------------------------------------
// Cada noivo(a) tem as próprias finanças (ligadas à conta, não ao casamento). A "visão do casal" junta as
// duas, mais os pagamentos dos fornecedores do casamento. Família e assessoria não têm acesso.
const FIN_COLLS = new Set(['accounts', 'cards', 'categories', 'transactions', 'recurring', 'goals']);
const FIN_DENIED = 'As finanças ficam só com os noivos.';
const FIN_DEFAULT_CATEGORIES = [
  ['income', 'Salário', '💼', '#34C759'], ['income', 'Freelance e extras', '💻', '#30B0C7'], ['income', 'Rendimentos', '📈', '#5AC8FA'],
  ['income', 'Reembolsos', '↩️', '#64D2FF'], ['income', 'Presentes', '🎁', '#FF9F0A'], ['income', 'Outras receitas', '💰', '#A2845E'],
  ['expense', 'Moradia', '🏠', '#007AFF'], ['expense', 'Contas da casa', '💡', '#5856D6'], ['expense', 'Mercado', '🛒', '#34C759'],
  ['expense', 'Restaurantes e delivery', '🍽️', '#FF9500'], ['expense', 'Transporte', '🚗', '#5AC8FA'], ['expense', 'Saúde', '💊', '#FF3B30'],
  ['expense', 'Educação', '📚', '#AF52DE'], ['expense', 'Lazer', '🎉', '#FF2D55'], ['expense', 'Assinaturas', '📺', '#FF6482'],
  ['expense', 'Compras', '🛍️', '#FFCC00'], ['expense', 'Cuidados pessoais', '💇', '#BF5AF2'], ['expense', 'Pets', '🐾', '#A2845E'],
  ['expense', 'Viagens', '✈️', '#32ADE6'], ['expense', 'Impostos e taxas', '🧾', '#8E8E93'], ['expense', 'Presentes e doações', '🎁', '#FF9F0A'],
  ['expense', 'Investimentos', '📊', '#30D158'], ['expense', 'Outros gastos', '📦', '#8E8E93'],
];
function checkFin(session) {
  if (!MANAGER_ROLES.has(session.role)) throw new HttpError(403, FIN_DENIED);
}
function checkFinColl(c) {
  if (!FIN_COLLS.has(c)) throw new HttpError(404, 'Coleção desconhecida.');
  return c;
}
const finRow = (r) => ({ ...JSON.parse(r.data), id: r.id, _created: r.created_at, _updated: r.updated_at });
function finSettings(userId) {
  try { return JSON.parse(S('SELECT fin_settings FROM users WHERE id = ?').get(userId)?.fin_settings || '{}'); } catch { return {}; }
}
function finItems(userId) {
  const items = {};
  for (const c of FIN_COLLS) items[c] = [];
  for (const r of S('SELECT * FROM fin_items WHERE user_id = ? ORDER BY created_at').all(userId)) if (items[r.coll]) items[r.coll].push(finRow(r));
  return items;
}
function finInsert(userId, coll, data, now = Date.now()) {
  const id = crypto.randomUUID();
  S('INSERT INTO fin_items (id, user_id, coll, data, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(id, userId, coll, JSON.stringify(data), now, now);
  return { ...data, id, _created: now, _updated: now };
}
// Primeira vez: categorias prontas e uma conta, para já sair lançando.
function finSeed(userId) {
  const st = finSettings(userId);
  if (st.seeded) return;
  tx(() => {
    const now = Date.now();
    FIN_DEFAULT_CATEGORIES.forEach(([kind, name, emoji, color], i) => finInsert(userId, 'categories', { kind, name, emoji, color, order: i }, now + i));
    finInsert(userId, 'accounts', { name: 'Conta principal', type: 'corrente', initialBalance: 0, color: '#007AFF' }, now + 100);
    S('UPDATE users SET fin_settings = ? WHERE id = ?').run(JSON.stringify({ ...st, seeded: true }), userId);
  });
}

route('GET', '/api/fin', ({ res, session }) => {
  checkFin(session);
  finSeed(session.user_id);
  const ws = session.workspace_id;
  // O par (o outro noivo/a deste casamento), se tiver liberado as finanças para a visão do casal.
  const p = S(`SELECT u.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ? AND m.role IN ('owner', 'couple') AND u.id <> ? ORDER BY m.created_at LIMIT 1`).get(ws, session.user_id);
  let partner = null;
  if (p) {
    const ps = finSettings(p.id);
    partner = { id: p.id, name: p.name, shared: ps.shareWithCouple !== false };
    partner.settings = { weddingSide: ps.weddingSide || '', autoFixed: ps.autoFixed !== false, dailyBudget: ps.shareWithCouple !== false ? Number(ps.dailyBudget) || 0 : 0 };
    if (partner.shared) { partner.items = finItems(p.id); partner.settings.weddingAccountId = ps.weddingAccountId || ''; }
  }
  const wedding = { payments: [], vendors: [] };
  for (const r of S("SELECT * FROM items WHERE workspace_id = ? AND coll IN ('payments', 'vendors')").all(ws)) {
    const it = rowToItem(r);
    if (r.coll === 'vendors') wedding.vendors.push({ id: it.id, name: it.name, category: it.category, split: it.split || null });
    else wedding.payments.push({ id: it.id, vendorId: it.vendorId, description: it.description, amount: it.amount, dueDate: it.dueDate, paid: !!it.paid, paidDate: it.paidDate, method: it.method, split: it.split || null, attachments: it.attachments || [] });
  }
  send(res, 200, { settings: finSettings(session.user_id), items: finItems(session.user_id), partner, wedding });
});

route('PUT', '/api/fin/settings', async ({ req, res, session }) => {
  checkFin(session);
  const b = cleanData(await readJson(req));
  const st = { ...finSettings(session.user_id), ...b, seeded: true };
  const data = JSON.stringify(st);
  if (data.length > 20_000) throw new HttpError(413, 'Ajustes muito grandes.');
  S('UPDATE users SET fin_settings = ? WHERE id = ?').run(data, session.user_id);
  send(res, 200, st);
});

route('POST', '/api/fin/:coll', async ({ req, res, params, session }) => {
  checkFin(session);
  const coll = checkFinColl(params.coll);
  send(res, 201, finInsert(session.user_id, coll, cleanData(await readJson(req))));
});

route('POST', '/api/fin/:coll/bulk', async ({ req, res, params, session }) => {
  checkFin(session);
  const coll = checkFinColl(params.coll);
  const b = await readJson(req);
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 500) throw new HttpError(400, 'Lista inválida.');
  const now = Date.now();
  send(res, 201, tx(() => b.items.map((d, i) => finInsert(session.user_id, coll, cleanData(d), now + i))));
});

route('PUT', '/api/fin/:coll/:id', async ({ req, res, params, session }) => {
  checkFin(session);
  const coll = checkFinColl(params.coll);
  const row = S('SELECT * FROM fin_items WHERE id = ? AND coll = ? AND user_id = ?').get(params.id, coll, session.user_id);
  if (!row) throw new HttpError(404, 'Registro não encontrado (talvez tenha sido excluído).');
  const merged = { ...JSON.parse(row.data), ...cleanData(await readJson(req)) };
  const now = Date.now();
  S('UPDATE fin_items SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(merged), now, row.id);
  send(res, 200, { ...merged, id: row.id, _created: row.created_at, _updated: now });
});

route('POST', '/api/fin/:coll/delete', async ({ req, res, params, session }) => {
  checkFin(session);
  const coll = checkFinColl(params.coll);
  const b = await readJson(req);
  if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 500 || !b.ids.every(isUuid)) throw new HttpError(400, 'Lista inválida.');
  const n = tx(() => b.ids.reduce((acc, id) => acc + S('DELETE FROM fin_items WHERE id = ? AND coll = ? AND user_id = ?').run(id, coll, session.user_id).changes, 0));
  send(res, 200, { ok: true, deleted: n });
});

// ---------------------------------------------------------------------------
// Pagamentos na agenda (arquivo .ics)
// ---------------------------------------------------------------------------
// O app pede um link curto e abre o arquivo por ele. O link não depende do cookie: no iPhone, o app instalado
// na tela de início abre o arquivo no Safari, que não tem a sessão. Vale 15 minutos e só lê os pagamentos escolhidos.
const CAL_TTL = 15 * MIN;
const calendarLinks = new Map(); // token → { ws, ids, exp }
route('POST', '/api/calendar/link', async ({ req, res, session }) => {
  if (session.role === 'planner') throw new HttpError(403, 'A assessoria não tem acesso aos pagamentos.');
  const b = await readJson(req);
  if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 500 || !b.ids.every(isUuid)) throw new HttpError(400, 'Escolha os pagamentos.');
  const now = Date.now();
  for (const [t, l] of calendarLinks) if (l.exp < now) calendarLinks.delete(t);
  if (calendarLinks.size > 5000) throw new HttpError(503, 'Muitos pedidos agora. Tente de novo em alguns minutos.');
  const token = crypto.randomBytes(24).toString('base64url');
  calendarLinks.set(token, { ws: session.workspace_id, ids: [...new Set(b.ids)], exp: now + CAL_TTL });
  send(res, 200, { url: `/api/agenda/${token}/pagamentos.ics` });
});
route('GET', '/api/agenda/:token/:name', ({ res, params }) => {
  const link = calendarLinks.get(params.token);
  if (!link || link.exp < Date.now()) throw new HttpError(404, 'Link da agenda expirado. Volte ao BRIDEx e toque em "Adicionar à agenda" de novo.');
  const { items } = exportWorkspace(link.ws);
  const ids = new Set(link.ids);
  const pays = items.payments.filter((p) => ids.has(p.id) && !p.paid).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const vendors = new Map(items.vendors.map((v) => [v.id, v.name]));
  const body = paymentsCalendar(pays, { vendors, appUrl: APP_URL });
  res.writeHead(200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    // "inline" faz o iPhone mostrar "Adicionar ao Calendário"; os outros navegadores baixam o arquivo.
    'Content-Disposition': contentDisposition(true, 'pagamentos-casamento.ics'),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}, { auth: false });

route('GET', '/api/export', ({ res, session }) => {
  const ws = session.workspace_id;
  const body = JSON.stringify({
    app: 'planejador-casamento', version: 2, exportedAt: new Date().toISOString(),
    settings: getSettings(ws), ...exportWorkspace(ws),
    ...(MANAGER_ROLES.has(session.role) ? { finance: { settings: finSettings(session.user_id), items: finItems(session.user_id) } } : {}),
  }, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="casamento-backup-${stamp}.json"`,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}, { team: true });

// Excluir a conta do casal (todos os dados e arquivos) — LGPD.
route('DELETE', '/api/workspace', async ({ req, res, session }) => {
  const b = await readJson(req);
  const user = S('SELECT pass_hash FROM users WHERE id = ?').get(session.user_id);
  // Sem senha (conta do Google): a confirmação é a palavra EXCLUIR, digitada na tela.
  if (hasPassword(user.pass_hash) ? !(await verifyPassword(String(b.password || ''), user.pass_hash)) : String(b.confirm || '').trim().toUpperCase() !== 'EXCLUIR') {
    throw new HttpError(400, hasPassword(user.pass_hash) ? 'Senha incorreta.' : 'Digite EXCLUIR para confirmar.');
  }
  deleteWorkspace(session.workspace_id);
  send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
}, { owner: true });

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
    if (r.ws && !session.workspace_id) throw new HttpError(409, 'Nenhum casamento aberto. Escolha um em "Meus casamentos".', 'workspace_changed');
    // A sessão é uma só para todas as abas. Se outra aba trocou de casamento (ou o acesso foi removido),
    // esta tela ainda mostra o anterior: recusa para nada ser lido ou gravado no casamento errado.
    const shown = req.headers['x-workspace'];
    if (r.ws && shown && shown !== session.workspace_id) {
      throw new HttpError(409, 'O casamento aberto mudou em outra aba. Recarregando…', 'workspace_changed');
    }
    if (r.owner && session.role !== 'owner') throw new HttpError(403, 'Só quem criou o casamento no planejador pode fazer isso.');
    if (r.manage && !MANAGER_ROLES.has(session.role)) throw new HttpError(403, 'Só os noivos podem gerenciar quem tem acesso.');
    if ((r.write || r.team) && session.role === 'planner' && !(r.plannerNotes && params.coll === 'notes')) throw new HttpError(403, PLANNER_READONLY);
    if (r.write && session.access !== 'full') {
      throw new HttpError(402, session.plan === 'trial'
        ? 'Seu período de teste terminou. Assine para continuar editando — seus dados continuam disponíveis para consulta e download.'
        : 'Sua assinatura não está ativa. Os dados continuam disponíveis para consulta e download.');
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
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Erro interno do servidor.' : e.message, code: e.code });
    else res.destroy();
  }
});

// Limpeza periódica
setInterval(() => {
  const now = Date.now();
  S('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  S('DELETE FROM invites WHERE expires_at <= ?').run(now - 30 * DAY);
  S('DELETE FROM password_resets WHERE expires_at <= ?').run(now);
  for (const [k, a] of attempts) if (a.reset < now) attempts.delete(k);
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
  console.log('\n  BRIDEx rodando!\n');
  console.log(`  Neste computador:   http://localhost:${PORT}`);
  if (HOST === '0.0.0.0' && !TRUST_PROXY) for (const ip of lanAddresses()) console.log(`  Celular / tablet:   http://${ip}:${PORT}  (mesma rede Wi-Fi)`);
  console.log(`  Dados salvos em:    ${DATA_DIR}`);
  console.log(`  Cadastro público:   ${SIGNUP_OPEN ? `ABERTO (teste grátis de ${TRIAL_DAYS} dias)` : 'fechado'}`);
  if (SIGNUP_OPEN && !APP_URL) console.log('  ATENÇÃO: defina APP_URL (ex.: https://seudominio.com.br) para os links enviados por e-mail.');
  if (!process.env.RESEND_API_KEY) console.log('  E-mails:            não configurado (links de senha aparecem só neste log)');
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
