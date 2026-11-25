// Finanças: regras e cálculos. Tudo derivado dos registros salvos, sem nada guardado em duplicidade.
//
// - Lançamento (transaction): receita, despesa ou transferência. "paid" = já aconteceu (recebido/pago).
//   Compra no cartão (cardId) entra no mês da fatura, e fica paga quando a fatura é paga.
// - Fixo (recurring): receita ou gasto que se repete (todo mês ou todo ano). Cada mês ganha uma ocorrência
//   prevista; ao confirmar, vira um lançamento com recurringId + period. Fixo no cartão entra direto na fatura.
// - Casamento: as parcelas dos fornecedores entram como despesas da categoria "Casamento".
import { fin } from './data.js';
import { todayISO, shiftISO, sum, norm } from '../ui.js';
import { state } from '../store.js';
import { names, splitPeople, shareOf, splitLabel } from '../domain.js';

const pad = (n) => String(n).padStart(2, '0');
export const monthOf = (iso) => String(iso || '').slice(0, 7);
export const thisMonth = () => monthOf(todayISO());
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function monthLabel(key, { short = false } = {}) {
  const [y, m] = key.split('-').map(Number);
  const s = new Date(y, m - 1, 15).toLocaleDateString('pt-BR', short ? { month: 'short' } : { month: 'long', year: 'numeric' }).replace('.', '');
  return s[0].toUpperCase() + s.slice(1);
}
// Dia do mês, limitado ao último dia (dia 31 em fevereiro = 28/29).
export function dayIn(key, day) {
  const [y, m] = key.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${key}-${pad(Math.min(Math.max(1, Number(day) || 1), last))}`;
}
export const monthsBetween = (a, b) => {
  const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
};

export const ACCOUNT_TYPES = [
  { value: 'corrente', label: 'Conta corrente' },
  { value: 'poupanca', label: 'Poupança' },
  { value: 'carteira', label: 'Dinheiro / carteira' },
  { value: 'investimento', label: 'Investimentos' },
  { value: 'beneficio', label: 'Vale (VR/VA)' },
  { value: 'outra', label: 'Outra' },
];
export const COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5856D6', '#FF2D55', '#5AC8FA', '#FFCC00', '#30B0C7', '#A2845E', '#8E8E93', '#1C1C1E'];
export const COLOR_NAMES = { '#007AFF': 'Azul', '#34C759': 'Verde', '#FF9500': 'Laranja', '#FF3B30': 'Vermelho', '#AF52DE': 'Roxo', '#5856D6': 'Índigo', '#FF2D55': 'Rosa', '#5AC8FA': 'Azul-claro', '#FFCC00': 'Amarelo', '#30B0C7': 'Turquesa', '#A2845E': 'Marrom', '#8E8E93': 'Cinza', '#1C1C1E': 'Preto' };
export const WEDDING_CAT = { id: '__wedding', kind: 'expense', name: 'Casamento', emoji: '💍', color: '#AF52DE', virtual: true };
const NO_CAT = { id: '', name: 'Sem categoria', emoji: '•', color: '#8E8E93', virtual: true };
const TRANSFER_CAT = { id: '__transfer', name: 'Transferência', emoji: '↔️', color: '#8E8E93', virtual: true };

// ---------------------------------------------------------------------------
// Fontes de dados conforme a visão: só as minhas, ou as minhas + as do par.
// ---------------------------------------------------------------------------
export const isCouple = () => fin.scope === 'couple' && !!fin.partner;
export function sources() {
  const list = [{ owner: 'me', items: fin.items, settings: fin.settings }];
  if (isCouple() && fin.partner.shared && fin.partner.items) list.push({ owner: 'partner', items: fin.partner.items, settings: fin.partner.settings || {} });
  return list;
}
export const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
export const partnerName = () => firstName(fin.partner?.name) || 'Seu par';
const weddingIncluded = () => isCouple() || fin.settings.weddingInPersonal !== false;

// Qual dos noivos (p1/p2, como no casamento) é cada um. Escolhido em Ajustes; sem escolha, pelo primeiro nome.
export function guessSide() {
  const me = norm(firstName(state.user?.name));
  const n = names();
  if (me && norm(firstName(n.p2)) === me) return 'p2';
  return 'p1';
}
export const mySide = () => (fin.settings.weddingSide === 'p1' || fin.settings.weddingSide === 'p2' ? fin.settings.weddingSide : guessSide());
export const partnerSide = () => {
  const s = fin.partner?.settings?.weddingSide;
  return s === 'p1' || s === 'p2' ? s : mySide() === 'p1' ? 'p2' : 'p1';
};
// Fração de um pagamento do casamento que cabe a um lado (pela divisão do fornecedor).
function weddingShare(p, side) {
  const v = p.vendorId ? fin.wedding.vendors.find((x) => x.id === p.vendorId) : null;
  return shareOf(splitPeople(v?.split), side);
}

export function categoryOf(src, id) {
  if (id === WEDDING_CAT.id) return WEDDING_CAT;
  if (id === TRANSFER_CAT.id) return TRANSFER_CAT;
  return src.items.categories.find((c) => c.id === id) || NO_CAT;
}
export function myCategories(kind) {
  return [...fin.items.categories].filter((c) => !kind || c.kind === kind).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Cartões: a qual fatura uma compra pertence
// ---------------------------------------------------------------------------
// A fatura é identificada pelo mês de vencimento. Compras a partir do dia de fechamento vão para a seguinte.
// Ex.: fecha dia 28 e vence dia 5 → compra em 30/01 fecha em 28/02 e vence em 05/03 (fatura "2027-03").
export function invoiceKey(card, iso) {
  const day = Number(iso.slice(8, 10));
  const closing = Number(card.closingDay) || 1;
  const due = Number(card.dueDay) || 10;
  let k = monthOf(iso);
  if (day >= closing) k = addMonths(k, 1);   // já fechou: entra na fatura que fecha no mês seguinte
  if (due <= closing) k = addMonths(k, 1);   // vence no mês seguinte ao fechamento
  return k;
}
export const invoiceDue = (card, key) => dayIn(key, card.dueDay || 10);
export function invoiceClosing(card, key) {
  const due = Number(card.dueDay) || 10, closing = Number(card.closingDay) || 1;
  return dayIn(due <= closing ? addMonths(key, -1) : key, closing);
}

// ---------------------------------------------------------------------------
// Fixos: em quais meses ocorrem
// ---------------------------------------------------------------------------
// Um fixo só gera ocorrências a partir do mês em que foi cadastrado (os meses anteriores já passaram
// e não devem aparecer como atrasados nem dobrar os relatórios).
const createdMonth = (r) => {
  if (!r._created) return '';
  const d = new Date(r._created);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
export function recurringHits(r, key) {
  if (r.active === false) return false;
  if (r.start && key < r.start) return false;
  const cm = createdMonth(r);
  if (cm && key < cm && (!r.start || r.start <= cm)) return false;
  if (r.end && key > r.end) return false;
  if (r.frequency === 'yearly') return Number(key.slice(5, 7)) === Number(r.month || (r.start || key).slice(5, 7));
  if (r.frequency === 'interval') return monthsBetween(r.start || key, key) % Math.max(1, Number(r.every) || 1) === 0;
  return true;
}
export const FREQ_LABEL = (r) => (r.frequency === 'yearly' ? 'todo ano' : r.frequency === 'interval' ? `a cada ${r.every || 2} meses` : 'todo mês');
// Fixos sem cartão que ainda não foram confirmados no mês (o confirmado vira lançamento).
function recurringOccurrence(src, r, key) {
  return {
    id: `rec:${r.id}:${key}`, virtual: true, owner: src.owner, src, rec: r,
    kind: r.kind, description: r.description, amount: Number(r.amount) || 0,
    date: dayIn(key, r.day || 1), period: key, paid: false,
    categoryId: r.categoryId, accountId: r.accountId, cardId: r.cardId || '', party: r.party || '',
  };
}

// ---------------------------------------------------------------------------
// Movimentos de um mês (lançamentos, fixos previstos, compras por fatura e casamento)
// ---------------------------------------------------------------------------
function cardOf(src, id) { return id ? src.items.cards.find((c) => c.id === id) : null; }
function entryFromTx(src, t) {
  const card = cardOf(src, t.cardId);
  const e = { ...t, owner: src.owner, src, tx: t, amount: Number(t.amount) || 0 };
  if (card) {
    e.card = card;
    e.invoice = invoiceKey(card, t.date);
    e.paid = !!card.paidInvoices?.[e.invoice];
    e.month = e.invoice;
  } else e.month = monthOf(t.date);
  return e;
}
function weddingEntries() {
  if (!weddingIncluded()) return [];
  const vendors = new Map(fin.wedding.vendors.map((v) => [v.id, v]));
  const src = { owner: 'wedding', items: { categories: [], cards: [], accounts: [] } };
  const sides = isCouple() ? [mySide(), partnerSide()] : [mySide()];
  const out = [];
  for (const p of fin.wedding.payments) {
    if (!p.dueDate && !p.paidDate) continue;
    const v = vendors.get(p.vendorId);
    const people = splitPeople(v?.split);
    // Só a parte de quem está nesta visão (eu, ou eu + meu par). Quem não divide, não vê.
    const share = sum([...new Set(sides)], (side) => shareOf(people, side));
    if (share <= 0) continue;
    const full = Number(p.amount) || 0;
    const date = p.paid ? (p.paidDate || p.dueDate) : p.dueDate;
    out.push({
      id: `w:${p.id}`, owner: 'wedding', src, wedding: p, kind: 'expense', readonly: true,
      description: v ? `${v.name} · ${p.description || 'pagamento'}` : (p.description || 'Pagamento do casamento'),
      amount: Math.round(full * share * 100) / 100, fullAmount: full, date, month: monthOf(date), paid: !!p.paid,
      categoryId: WEDDING_CAT.id, party: v?.name || '', method: p.method,
      accountId: fin.settings.weddingAccountId || '',
      split: people, shareLabel: share < 0.999 ? `${isCouple() ? 'parte do casal' : 'sua parte'} de ${money2(full)}` : '',
      splitText: splitLabel(people),
    });
  }
  return out;
}
const money2 = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Todos os movimentos (sem os fixos previstos), com cache por versão dos dados.
let cacheKey = null, cacheAll = null;
function allEntries() {
  const key = `${fin.loadedAt}|${fin.scope}|${fin.version || 0}`;
  if (cacheKey === key && cacheAll) return cacheAll;
  const out = [];
  for (const src of sources()) for (const t of src.items.transactions) if (!t.skipped) out.push(entryFromTx(src, t));
  out.push(...weddingEntries());
  cacheKey = key; cacheAll = out;
  return out;
}

// Fixos já cumpridos no mês: confirmados (recurringId + period) ou lançados à mão com o mesmo nome
// (ex.: lançou "Salário" como receita comum, em vez de confirmar o fixo).
export function fulfilledRecurring(src, key) {
  const done = new Set();
  const manual = new Set();
  for (const t of src.items.transactions) {
    if (t.recurringId && t.period === key) done.add(t.recurringId);
    else if (!t.recurringId && monthOf(t.date) === key && t.description) manual.add(`${t.kind}|${norm(t.description).trim()}`);
  }
  for (const r of src.items.recurring) if (!done.has(r.id) && manual.has(`${r.kind}|${norm(r.description).trim()}`)) done.add(r.id);
  return done;
}

// Fixos no cartão (assinaturas) que caem numa fatura: a cobrança pode ser até 2 meses antes do vencimento.
function cardRecurring(src, key, onlyCard = null) {
  const out = [];
  for (const r of src.items.recurring) {
    const card = cardOf(src, r.cardId);
    if (!card || (onlyCard && card.id !== onlyCard.id)) continue;
    for (const m of [addMonths(key, -2), addMonths(key, -1), key]) {
      if (!recurringHits(r, m) || src.items.transactions.some((t) => t.recurringId === r.id && t.period === m)) continue;
      const occ = recurringOccurrence(src, r, m);
      if (invoiceKey(card, occ.date) !== key) continue;
      Object.assign(occ, { card, invoice: key, month: key, paid: !!card.paidInvoices?.[key], auto: true });
      out.push(occ);
    }
  }
  return out;
}

// Movimentos de um mês, incluindo os fixos previstos (ainda não confirmados).
export function monthEntries(key) {
  const out = allEntries().filter((e) => e.month === key);
  for (const src of sources()) {
    const done = fulfilledRecurring(src, key);
    for (const r of src.items.recurring) {
      if (r.cardId && cardOf(src, r.cardId)) continue; // no cartão: ver cardRecurring
      if (done.has(r.id) || !recurringHits(r, key)) continue;
      const occ = recurringOccurrence(src, r, key);
      occ.month = key;
      out.push(occ);
    }
    out.push(...cardRecurring(src, key));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || String(a.description).localeCompare(String(b.description)));
}

// Resumo do mês: receitas e despesas (feitas e previstas), por categoria.
export function monthSummary(key) {
  const list = monthEntries(key).filter((e) => e.kind !== 'transfer');
  const inc = list.filter((e) => e.kind === 'income');
  const exp = list.filter((e) => e.kind === 'expense');
  const byCat = new Map();
  for (const e of exp) {
    const c = categoryOf(e.src, e.categoryId);
    const k = c.virtual ? c.id : c.name; // na visão do casal, junta categorias de mesmo nome
    const g = byCat.get(k) || { key: k, cat: c, total: 0, budget: 0, entries: [] };
    g.total += e.amount;
    g.entries.push(e);
    byCat.set(k, g);
  }
  for (const src of sources()) {
    for (const c of src.items.categories) {
      if (c.kind !== 'expense' || !(Number(c.budget) > 0)) continue;
      const g = byCat.get(c.name) || { key: c.name, cat: c, total: 0, budget: 0, entries: [] };
      g.budget += Number(c.budget);
      byCat.set(c.name, g);
    }
  }
  const income = { done: sum(inc.filter((e) => e.paid), (e) => e.amount), total: sum(inc, (e) => e.amount) };
  const expense = { done: sum(exp.filter((e) => e.paid), (e) => e.amount), total: sum(exp, (e) => e.amount) };
  return {
    key, entries: list, income, expense,
    balance: income.total - expense.total,
    categories: [...byCat.values()].sort((a, b) => b.total - a.total),
  };
}

// ---------------------------------------------------------------------------
// Saldos das contas (só o que já aconteceu)
// ---------------------------------------------------------------------------
export function accountBalances() {
  const out = [];
  const srcs = sources();
  for (const src of srcs) {
    const bal = new Map(src.items.accounts.map((a) => [a.id, Number(a.initialBalance) || 0]));
    const add = (id, v) => { if (bal.has(id)) bal.set(id, bal.get(id) + v); };
    for (const t of src.items.transactions) {
      if (t.skipped || !t.paid || t.cardId) continue;
      const v = Number(t.amount) || 0;
      if (t.kind === 'income') add(t.accountId, v);
      else if (t.kind === 'expense') add(t.accountId, -v);
      else if (t.kind === 'transfer') { add(t.accountId, -v); add(t.toAccountId, v); }
    }
    // Faturas pagas saem da conta escolhida no pagamento (ou da conta padrão do cartão).
    for (const card of src.items.cards) {
      for (const [k, info] of Object.entries(card.paidInvoices || {})) {
        const acc = (typeof info === 'object' && info.accountId) || card.accountId;
        // Usa o valor pago guardado; sem ele, o total atual da fatura.
        add(acc, -(typeof info === 'object' && info.amount != null ? Number(info.amount) || 0 : invoiceTotal(src, card, k)));
      }
    }
    // Cada um paga a própria parte do casamento pela conta escolhida em Ajustes.
    const wAcc = src.settings?.weddingAccountId;
    if (wAcc && bal.has(wAcc)) {
      const side = src.owner === 'me' ? mySide() : partnerSide();
      add(wAcc, -sum(fin.wedding.payments.filter((p) => p.paid), (p) => (Number(p.amount) || 0) * weddingShare(p, side)));
    }
    for (const a of src.items.accounts) out.push({ account: a, owner: src.owner, balance: bal.get(a.id) });
  }
  return out;
}
export const totalBalance = () => sum(accountBalances().filter((b) => b.account.includeInTotal !== false), (b) => b.balance);

// ---------------------------------------------------------------------------
// Faturas
// ---------------------------------------------------------------------------
export function invoiceEntries(src, card, key) {
  const out = [];
  for (const t of src.items.transactions) {
    if (t.skipped || t.cardId !== card.id) continue;
    // No cartão, a situação é a da fatura (não a do lançamento).
    if (invoiceKey(card, t.date) === key) out.push({ ...t, owner: src.owner, src, tx: t, card, amount: Number(t.amount) || 0, invoice: key, paid: !!card.paidInvoices?.[key] });
  }
  out.push(...cardRecurring(src, key, card));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
export function invoiceTotal(src, card, key) {
  return sum(invoiceEntries(src, card, key), (e) => (e.kind === 'income' ? -e.amount : e.amount));
}
// Fatura "atual": a que recebe as compras de hoje.
export const currentInvoiceKey = (card) => invoiceKey(card, todayISO());
// Limite usado: tudo o que está em faturas ainda não pagas (inclui parcelas futuras).
export function cardUsed(src, card) {
  const keys = new Set();
  for (const t of src.items.transactions) if (t.cardId === card.id && !t.skipped) keys.add(invoiceKey(card, t.date));
  keys.add(currentInvoiceKey(card));
  let used = 0;
  for (const k of keys) if (!card.paidInvoices?.[k]) used += invoiceTotal(src, card, k);
  return used;
}

// ---------------------------------------------------------------------------
// Próximos vencimentos (para a tela inicial)
// ---------------------------------------------------------------------------
export function upcoming(days = 20) {
  const today = todayISO();
  const limit = shiftISO(today, { d: days });
  const out = [];
  for (const k of [addMonths(thisMonth(), -1), thisMonth(), addMonths(thisMonth(), 1)]) {
    for (const e of monthEntries(k)) {
      if (e.paid || e.card || e.kind === 'transfer') continue;
      if (e.date <= limit) out.push({ ...e, late: e.date < today });
    }
  }
  // Faturas abertas que vencem no período.
  for (const src of sources()) {
    for (const card of src.items.cards) {
      for (const k of [thisMonth(), addMonths(thisMonth(), 1)]) {
        const due = invoiceDue(card, k);
        if (card.paidInvoices?.[k] || due > limit) continue;
        const total = invoiceTotal(src, card, k);
        if (total <= 0) continue;
        out.push({ id: `inv:${card.id}:${k}`, invoiceOf: card, invoice: k, owner: src.owner, src, kind: 'expense', description: `Fatura ${card.name}`, amount: total, date: due, late: due < today, categoryId: '' });
      }
    }
  }
  const seen = new Set();
  return out.filter((e) => (seen.has(e.id) ? false : seen.add(e.id))).sort((a, b) => a.date.localeCompare(b.date));
}

// Os últimos N meses (para gráficos): receitas e despesas de cada mês.
export function history(months = 12, end = thisMonth()) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const k = addMonths(end, -i);
    const s = monthSummary(k);
    out.push({ key: k, income: s.income.total, expense: s.expense.total, incomeDone: s.income.done, expenseDone: s.expense.done });
  }
  return out;
}

// Totais dos fixos (o "custo de vida" mensal e a renda fixa).
export function recurringTotals() {
  const month = thisMonth();
  let income = 0, expense = 0;
  for (const src of sources()) {
    for (const r of src.items.recurring) {
      if (r.active === false || (r.end && r.end < month)) continue;
      const v = Number(r.amount) || 0;
      const monthly = r.frequency === 'yearly' ? v / 12 : r.frequency === 'interval' ? v / Math.max(1, Number(r.every) || 1) : v;
      if (r.kind === 'income') income += monthly; else expense += monthly;
    }
  }
  return { income, expense, free: income - expense };
}

// Lista de "de onde vem / para onde vai" já usados (sugestões no formulário).
export function knownParties(kind) {
  const set = new Set();
  for (const t of fin.items.transactions) if (t.party && (!kind || t.kind === kind)) set.add(t.party);
  for (const r of fin.items.recurring) if (r.party && (!kind || r.kind === kind)) set.add(r.party);
  return [...set].sort((a, b) => a.localeCompare(b)).slice(0, 200);
}
