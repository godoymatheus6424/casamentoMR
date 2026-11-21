// Banco de dados (SQLite embutido) + migrações automáticas.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 3;

// Papéis no casamento: dono(a) e par = "noivos" (gerenciam acessos); assessoria e família editam o planejamento.
export const ROLES = ['owner', 'couple', 'planner', 'member'];
export const MANAGER_ROLES = new Set(['owner', 'couple']);

// Esquema original (versão de um casamento só). Mantido para bancos novos e antigos.
const BASE_SCHEMA = `
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
`;

// Versão 2: vários casais (workspaces) no mesmo servidor.
function migrateV2(db) {
  db.exec(`
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      settings TEXT NOT NULL DEFAULT '{}',
      plan TEXT NOT NULL DEFAULT 'trial',
      trial_ends_at INTEGER,
      paid_until INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE memberships (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, workspace_id)
    );
    CREATE INDEX idx_memberships_ws ON memberships(workspace_id);
    ALTER TABLE users ADD COLUMN email TEXT;
    ALTER TABLE users ADD COLUMN terms_accepted_at INTEGER;
    CREATE UNIQUE INDEX idx_users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;
    ALTER TABLE items ADD COLUMN workspace_id TEXT;
    CREATE INDEX idx_items_ws ON items(workspace_id, coll);
    ALTER TABLE files ADD COLUMN workspace_id TEXT;
    CREATE INDEX idx_files_ws ON files(workspace_id);
    ALTER TABLE sessions ADD COLUMN workspace_id TEXT;
    CREATE TABLE password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // O casamento que já existia vira o primeiro espaço, com plano vitalício.
  const users = db.prepare('SELECT id FROM users ORDER BY id').all();
  if (!users.length) return;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'wedding'").get();
  const settings = row ? JSON.parse(row.value) : {};
  const name = [settings.partner1, settings.partner2].filter((x) => x && String(x).trim()).join(' & ') || 'Nosso casamento';
  const wsId = crypto.randomUUID();
  const now = Date.now();
  db.prepare("INSERT INTO workspaces (id, name, settings, plan, created_at) VALUES (?, ?, ?, 'lifetime', ?)")
    .run(wsId, name, JSON.stringify(settings), now);
  const addMember = db.prepare('INSERT INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, ?, ?, ?)');
  users.forEach((u, i) => addMember.run(u.id, wsId, i === 0 ? 'owner' : 'member', now));
  db.prepare('UPDATE items SET workspace_id = ?').run(wsId);
  db.prepare('UPDATE files SET workspace_id = ?').run(wsId);
  db.prepare('UPDATE sessions SET workspace_id = ?').run(wsId);
}

// Versão 3: lembra o último casamento aberto (para quem participa de vários, como assessoras).
function migrateV3(db) {
  db.exec('ALTER TABLE users ADD COLUMN last_workspace_id TEXT;');
}

export function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'casamento.db');
  const isNew = !fs.existsSync(file);
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  db.exec(BASE_SCHEMA);

  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version < SCHEMA_VERSION) {
    // Cópia de segurança antes de mexer na estrutura de um banco com dados.
    const hasData = db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0;
    if (!isNew && hasData) {
      const backup = path.join(dataDir, `casamento-antes-v${SCHEMA_VERSION}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
      db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
      console.log(`  Backup criado antes da atualização do banco: ${backup}`);
    }
    db.exec('BEGIN');
    try {
      if (version < 2) migrateV2(db);
      if (version < 3) migrateV3(db);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  // Rede de segurança: se o site voltou temporariamente para a versão antiga (um casamento só),
  // o que foi cadastrado nesse período fica sem casamento. Com um único espaço, devolve tudo para ele.
  const spaces = db.prepare('SELECT id FROM workspaces LIMIT 2').all();
  if (spaces.length === 1) {
    const ws = spaces[0].id;
    const a = db.prepare('UPDATE items SET workspace_id = ? WHERE workspace_id IS NULL').run(ws).changes;
    const b = db.prepare('UPDATE files SET workspace_id = ? WHERE workspace_id IS NULL').run(ws).changes;
    if (a || b) console.log(`  ${a + b} registro(s) sem casamento foram devolvidos ao casamento existente.`);
  }
  return db;
}

// Cache de prepared statements + transação.
export function helpers(db) {
  const cache = new Map();
  const S = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = db.prepare(sql); cache.set(sql, s); }
    return s;
  };
  const tx = (fn) => {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  return { S, tx };
}

// Regras de acesso pela assinatura.
export const PLAN_LABELS = {
  trial: 'Teste grátis', monthly: 'Mensal', annual: 'Anual', lifetime: 'Vitalício', canceled: 'Cancelado',
};
export function workspaceAccess(ws, now = Date.now()) {
  if (ws.plan === 'lifetime') return 'full';
  if (ws.plan === 'trial') return ws.trial_ends_at && ws.trial_ends_at > now ? 'full' : 'readonly';
  if (ws.plan === 'monthly' || ws.plan === 'annual') return !ws.paid_until || ws.paid_until > now ? 'full' : 'readonly';
  return 'readonly';
}
