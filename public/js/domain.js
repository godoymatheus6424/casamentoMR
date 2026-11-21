import { state } from './store.js';
import { shiftISO, sum } from './ui.js';

export const PERIODS = [
  { key: '12', label: '12 meses ou mais antes', off: { m: -12 } },
  { key: '9', label: '9 a 12 meses antes', off: { m: -9 } },
  { key: '6', label: '6 a 9 meses antes', off: { m: -6 } },
  { key: '3', label: '3 a 6 meses antes', off: { m: -3 } },
  { key: '1', label: '1 a 3 meses antes', off: { m: -1 } },
  { key: '0', label: 'Último mês', off: { d: -7 } },
  { key: 'w', label: 'Semana do casamento', off: { d: -1 } },
  { key: 'pos', label: 'Depois do casamento', off: { m: 1 } },
  { key: '', label: 'Outras tarefas', off: null },
];
export const periodOf = (key) => PERIODS.find((p) => p.key === (key ?? '')) || PERIODS[PERIODS.length - 1];
export function taskDue(t) {
  if (t.dueDate) return t.dueDate;
  const p = periodOf(t.period);
  if (!p.off || !state.settings.date) return null;
  return shiftISO(state.settings.date, p.off);
}

export const VENDOR_STATUS = [
  { key: 'pesquisando', label: 'Pesquisando', kind: 'muted' },
  { key: 'orcamento', label: 'Orçamento recebido', kind: 'warn' },
  { key: 'negociando', label: 'Negociando', kind: 'accent' },
  { key: 'contratado', label: 'Contratado', kind: 'ok' },
  { key: 'descartado', label: 'Descartado', kind: 'muted' },
];
export const vendorStatus = (k) => VENDOR_STATUS.find((s) => s.key === k) || VENDOR_STATUS[0];

export const RSVP = [
  { key: 'pendente', label: 'Pendente', kind: 'warn' },
  { key: 'confirmado', label: 'Confirmado', kind: 'ok' },
  { key: 'recusado', label: 'Não vai', kind: 'danger' },
];

export const FILE_CATEGORIES = [
  { key: 'contrato', label: 'Contratos' },
  { key: 'orcamento', label: 'Orçamentos' },
  { key: 'comprovante', label: 'Comprovantes' },
  { key: 'inspiracao', label: 'Inspirações' },
  { key: 'documento', label: 'Documentos' },
  { key: 'outros', label: 'Outros' },
];
export const fileCategory = (k) => FILE_CATEGORIES.find((c) => c.key === k) || FILE_CATEGORIES[FILE_CATEGORIES.length - 1];
export const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

export const PAYMENT_METHODS = ['', 'PIX', 'Boleto', 'Cartão de crédito', 'Transferência', 'Dinheiro', 'Cheque'];

// Tipos de acesso ao casamento
export const ROLE_LABELS = {
  owner: 'Noivo(a)',
  couple: 'Noivo(a)',
  planner: 'Assessoria',
  member: 'Família / amigo',
};
export const ROLE_OPTIONS = [
  { value: 'couple', label: 'Noivo(a): meu par' },
  { value: 'planner', label: 'Assessoria / cerimonial' },
  { value: 'member', label: 'Família ou amigo(a)' },
];
export const isManager = (role) => role === 'owner' || role === 'couple';

export function names() {
  const s = state.settings;
  return { p1: s.partner1?.trim() || 'Noivo(a) 1', p2: s.partner2?.trim() || 'Noivo(a) 2' };
}
export function coupleTitle() {
  const s = state.settings;
  const a = s.partner1?.trim(), b = s.partner2?.trim();
  if (a && b) return `${a} & ${b}`;
  return a || b || 'Nosso casamento';
}
export function sideOptions() {
  const n = names();
  return [{ value: 'p1', label: `Lado de ${n.p1}` }, { value: 'p2', label: `Lado de ${n.p2}` }, { value: 'ambos', label: 'Dos dois' }];
}
export function sideLabel(side) {
  const n = names();
  return side === 'p1' ? n.p1 : side === 'p2' ? n.p2 : 'Dos dois';
}
export function assigneeOptions() {
  const n = names();
  return ['', n.p1, n.p2, 'Os dois', 'Assessoria', 'Família', 'Padrinhos'].map((v) => ({ value: v, label: v || '—' }));
}

export const guestPeople = (g) => (Number(g.adults) || 0) + (Number(g.children) || 0);

export function budgetCats() {
  return [...state.items.budget].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(b.name));
}
export function vendorCategoryOptions(current) {
  const list = budgetCats().map((c) => c.name);
  if (!list.includes('Outros')) list.push('Outros');
  if (current && !list.includes(current)) list.push(current);
  return list;
}
// Categorias do orçamento sem fornecedor contratado ("ainda falta contratar").
// Categorias marcadas como "não vamos contratar" (skip) vão para a lista de ocultas.
export function missingCategories() {
  const contracted = new Set(state.items.vendors.filter((v) => v.status === 'contratado').map((v) => v.category));
  const open = budgetCats().filter((c) => !contracted.has(c.name) && c.name !== 'Outros / Imprevistos');
  return { missing: open.filter((c) => !c.skip), skipped: open.filter((c) => c.skip) };
}
export const vendorsLink = (category) => `#/fornecedores?cat=${encodeURIComponent(category)}`;

export const paymentsOf = (vendorId) => state.items.payments.filter((p) => p.vendorId === vendorId);
export const paidOf = (vendorId) => sum(paymentsOf(vendorId).filter((p) => p.paid), (p) => p.amount);
export const contractedVendors = () => state.items.vendors.filter((v) => v.status === 'contratado');
export const filesOf = (vendorId) => state.files.filter((f) => f.vendorId === vendorId);
export const userName = (id) => state.users.find((u) => u.id === id)?.name || '';

export function telLink(phone) {
  const d = String(phone || '').replace(/[^\d+]/g, '');
  return d ? `tel:${d}` : null;
}
export function waLink(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  if (d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}`;
}
export function igLink(h) {
  const u = String(h || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?].*$/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(u) ? `https://instagram.com/${u}` : null;
}
export function webLink(u) {
  u = String(u || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; }
}
export const mapsLink = (q) => (q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null);
