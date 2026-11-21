// Ferramenta de administração (linha de comando).
//   node admin.js espacos
//   node admin.js plano <e-mail ou id do espaço> <teste|mensal|anual|vitalicio|cancelado> [AAAA-MM-DD]
//   node admin.js teste <e-mail ou id do espaço> <dias>
// No Easypanel: aba "Console" do app → su-exec node node admin.js espacos
// (o "su-exec node" roda com o mesmo usuário do site, para não bagunçar as permissões do banco)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, workspaceAccess, PLAN_LABELS } from './lib/db.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const db = openDb(path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data')));
const DAY = 86400e3;
const PLANS = { teste: 'trial', mensal: 'monthly', anual: 'annual', vitalicio: 'lifetime', cancelado: 'canceled' };
const fmt = (ms) => (ms ? new Date(ms).toLocaleDateString('pt-BR') : '—');
const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

function findWorkspace(ref) {
  if (!ref) return null;
  const byId = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(ref);
  if (byId) return byId;
  return db.prepare(`SELECT w.* FROM workspaces w JOIN memberships m ON m.workspace_id = w.id JOIN users u ON u.id = m.user_id
                     WHERE u.email = ? COLLATE NOCASE OR u.username = ? ORDER BY (m.role = 'owner') DESC LIMIT 1`).get(ref, ref);
}

const [cmd, ref, arg] = process.argv.slice(2);

if (cmd === 'espacos') {
  const rows = db.prepare(`
    SELECT w.*, (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = w.id AND m.role = 'owner' LIMIT 1) AS owner,
           (SELECT COUNT(*) FROM memberships m WHERE m.workspace_id = w.id) AS members,
           (SELECT COALESCE(SUM(size), 0) FROM files f WHERE f.workspace_id = w.id) AS bytes
    FROM workspaces w ORDER BY w.created_at DESC`).all();
  if (!rows.length) console.log('Nenhum espaço ainda.');
  for (const w of rows) {
    console.log(`\n${w.name}  [${w.id}]`);
    console.log(`  dono: ${w.owner || '—'} · pessoas: ${w.members} · arquivos: ${mb(w.bytes)} · criado em ${fmt(w.created_at)}`);
    console.log(`  plano: ${PLAN_LABELS[w.plan] || w.plan} · acesso: ${workspaceAccess(w) === 'full' ? 'completo' : 'SÓ LEITURA'}` +
      (w.plan === 'trial' ? ` · teste até ${fmt(w.trial_ends_at)}` : '') +
      (w.paid_until ? ` · pago até ${fmt(w.paid_until)}` : ''));
  }
  const totals = db.prepare("SELECT plan, COUNT(*) AS n FROM workspaces GROUP BY plan").all();
  console.log(`\nTotal: ${rows.length} espaço(s) — ${totals.map((t) => `${PLAN_LABELS[t.plan] || t.plan}: ${t.n}`).join(', ')}`);
} else if (cmd === 'plano') {
  const ws = findWorkspace(ref);
  const plan = PLANS[arg];
  if (!ws || !plan) {
    console.error('Uso: node admin.js plano <e-mail ou id> <teste|mensal|anual|vitalicio|cancelado> [AAAA-MM-DD]');
    process.exit(1);
  }
  const until = process.argv[5];
  let paidUntil = null;
  if (plan === 'monthly' || plan === 'annual') {
    paidUntil = until ? new Date(`${until}T23:59:59`).getTime() : Date.now() + (plan === 'annual' ? 365 : 31) * DAY;
    if (!Number.isFinite(paidUntil)) { console.error('Data inválida. Use AAAA-MM-DD.'); process.exit(1); }
  }
  db.prepare('UPDATE workspaces SET plan = ?, paid_until = ? WHERE id = ?').run(plan, paidUntil, ws.id);
  console.log(`OK: "${ws.name}" agora está no plano ${PLAN_LABELS[plan]}${paidUntil ? ` (pago até ${fmt(paidUntil)})` : ''}.`);
} else if (cmd === 'teste') {
  const ws = findWorkspace(ref);
  const days = Number(arg);
  if (!ws || !(days > 0)) { console.error('Uso: node admin.js teste <e-mail ou id> <dias>'); process.exit(1); }
  const ends = Date.now() + days * DAY;
  db.prepare("UPDATE workspaces SET plan = 'trial', trial_ends_at = ?, paid_until = NULL WHERE id = ?").run(ends, ws.id);
  console.log(`OK: teste de "${ws.name}" vai até ${fmt(ends)}.`);
} else {
  console.log(`Comandos:
  node admin.js espacos                              lista os casamentos cadastrados
  node admin.js plano <e-mail|id> <plano> [AAAA-MM-DD] muda o plano (teste, mensal, anual, vitalicio, cancelado)
  node admin.js teste <e-mail|id> <dias>             estende o período de teste`);
}
db.close();
