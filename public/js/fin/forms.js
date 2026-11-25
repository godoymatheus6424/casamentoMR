// Finanças: janelas de cadastro e edição.
import { fin, fById, fcreate, fbulk, fupdate, fremove, saveFinSettings } from './data.js';
import {
  ACCOUNT_TYPES, COLORS, COLOR_NAMES, myCategories, knownParties, thisMonth, addMonths, monthLabel, monthOf, dayIn,
  invoiceKey, invoiceDue, invoiceTotal, sources, partnerName, categoryOf, FREQ_LABEL, accountBalances, ADJUST_CAT,
} from './model.js';
import { html, icon, formModal, openModal, toast, todayISO, shiftISO, money, fmtDate, confirmDialog, run } from '../ui.js';
import { attachField, bindAttachments } from '../forms.js';
import { uploadFile, deleteFile } from '../store.js';

// Comprovantes das finanças: privados (só de quem lançou).
const finUpload = (f) => uploadFile(f, { isPrivate: true });
const finRemove = (a) => deleteFile(a.id);
async function dropAttachments(list) { for (const t of list) for (const a of t.attachments || []) await finRemove(a).catch(() => {}); }

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const colorOptions = () => COLORS.map((c) => ({ value: c, label: COLOR_NAMES[c] || c }));
const catOptions = (kind) => [{ value: '', label: '— Sem categoria —' }, ...myCategories(kind).map((c) => ({ value: c.id, label: `${c.emoji || '•'}  ${c.name}` }))];
const accountOptions = (empty = false) => [...(empty ? [{ value: '', label: '— Nenhuma —' }] : []), ...fin.items.accounts.map((a) => ({ value: a.id, label: a.name }))];
// "Pagar com": contas e cartões no mesmo campo (a:<id> / c:<id>).
function payWithOptions() {
  return [
    ...fin.items.accounts.map((a) => ({ value: `a:${a.id}`, label: `🏦  ${a.name}` })),
    ...fin.items.cards.map((c) => ({ value: `c:${c.id}`, label: `💳  ${c.name}` })),
  ];
}
function monthOptions({ empty = '', back = 24, ahead = 36 } = {}) {
  const now = thisMonth();
  const list = [];
  for (let i = -back; i <= ahead; i++) { const k = addMonths(now, i); list.push({ value: k, label: monthLabel(k) }); }
  return empty ? [{ value: '', label: empty }, ...list] : list;
}
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthLabel(`2026-${String(i + 1).padStart(2, '0')}`).replace(/ de \d+$/, '').replace(/ \d+$/, '') }));
function needAccount() {
  if (fin.items.accounts.length) return false;
  toast('Cadastre uma conta primeiro (Mais › Contas).', 'error');
  return true;
}

// ---------------------------------------------------------------------------
// Lançamentos
// ---------------------------------------------------------------------------
const KIND_TITLE = { expense: 'despesa', income: 'receita', transfer: 'transferência' };

export function txForm(t = {}, { kind = t.kind || 'expense', card = false } = {}) {
  if (needAccount()) return;
  const isNew = !t.id;
  const group = t.group ? fin.items.transactions.filter((x) => x.group === t.group) : [];
  const values = {
    date: todayISO(), installments: 1, paid: true,
    payWith: t.cardId ? `c:${t.cardId}` : t.accountId ? `a:${t.accountId}` : card && fin.items.cards[0] ? `c:${fin.items.cards[0].id}` : `a:${fin.items.accounts[0].id}`,
    accountId: fin.items.accounts[0].id, toAccountId: fin.items.accounts[1]?.id || '',
    ...t,
  };
  if (isNew) values.paid = kind !== 'expense' || !card;
  const fields = [];
  if (kind === 'transfer') {
    fields.push(
      { name: 'amount', label: 'Valor', type: 'money', required: true, full: true },
      { name: 'accountId', label: 'Sai de', type: 'select', options: accountOptions() },
      { name: 'toAccountId', label: 'Vai para', type: 'select', options: accountOptions() },
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'description', label: 'Descrição', placeholder: 'Transferência' },
    );
  } else {
    fields.push(
      { name: 'amount', label: 'Valor', type: 'money', required: true, full: true },
      { name: 'description', label: 'Descrição', required: true, full: true, placeholder: kind === 'income' ? 'Ex.: Salário, Venda, Pix do João' : 'Ex.: Mercado, Gasolina, Jantar' },
      { name: 'categoryId', label: 'Categoria', type: 'select', options: catOptions(kind) },
      kind === 'income'
        ? { name: 'accountId', label: 'Entra na conta', type: 'select', options: accountOptions() }
        : { name: 'payWith', label: 'Pago com', type: 'select', options: payWithOptions() },
      { name: 'date', label: 'Data', type: 'date', required: true, hint: kind === 'expense' ? 'No cartão, a data da compra: o sistema acha a fatura.' : '' },
      { name: 'party', label: kind === 'income' ? 'De onde vem' : 'Para onde vai', placeholder: kind === 'income' ? 'Empresa, cliente, pessoa…' : 'Loja, pessoa, empresa…', list: knownParties(kind) },
    );
    if (kind === 'expense' && isNew) fields.push({ name: 'installments', label: 'Parcelas', type: 'number', min: 1, max: 72, hint: 'Divide o valor em parcelas mensais (no cartão, uma em cada fatura).' });
    fields.push({ name: 'paid', label: kind === 'income' ? 'Já recebi' : 'Já foi pago', type: 'checkbox', hint: kind === 'expense' ? 'No cartão, conta como pago quando a fatura for paga.' : '' });
  }
  if (kind !== 'transfer') fields.push(attachField());
  fields.push({ name: 'notes', label: 'Observações', type: 'textarea', rows: 2, full: true });
  if (group.length > 1) fields.push({ type: 'html', html: html`<p class="fin-note">${icon('repeat')} Parcela ${t.installment}/${t.installments} de uma compra de ${money(group.reduce((a, x) => a + (Number(x.amount) || 0), 0))}. A edição vale só para esta parcela. <button type="button" class="fin-link danger" data-delgroup>Excluir as ${group.length} parcelas</button></p>` });

  let attach = null;
  const m = formModal({
    title: isNew ? `Nova ${KIND_TITLE[kind]}${card ? ' no cartão' : ''}` : `Editar ${KIND_TITLE[kind]}`,
    values, fields,
    onClose: () => attach?.discard(),
    onSubmit: async (d) => {
      if (!(d.amount > 0)) throw Object.assign(new Error('Informe um valor maior que zero.'), { field: 'amount' });
      const base = { kind, amount: d.amount, description: d.description || (kind === 'transfer' ? 'Transferência' : ''), date: d.date, categoryId: d.categoryId || '', party: d.party || '', notes: d.notes || '', paid: kind === 'transfer' ? true : !!d.paid };
      if (kind === 'transfer') {
        if (d.accountId === d.toAccountId) throw new Error('Escolha contas diferentes.');
        Object.assign(base, { accountId: d.accountId, toAccountId: d.toAccountId, cardId: '' });
      } else if (kind === 'income') Object.assign(base, { accountId: d.accountId, cardId: '' });
      else {
        const [type, id] = String(d.payWith || '').split(':');
        Object.assign(base, type === 'c' ? { cardId: id, accountId: '' } : { accountId: id, cardId: '' });
      }
      if (attach) base.attachments = attach.get();
      if (!isNew) { await fupdate('transactions', t.id, base); await attach?.saved(); toast('Lançamento salvo'); return; }
      const n = Math.max(1, Math.min(72, Math.round(d.installments || 1)));
      if (n === 1) { await fcreate('transactions', base); await attach?.saved(); toast(`${kind === 'income' ? 'Receita' : kind === 'transfer' ? 'Transferência' : 'Despesa'} lançada`); return; }
      // Parcelado: uma parcela por mês, com os centavos que sobram na última.
      const totalC = Math.round(d.amount * 100), each = Math.floor(totalC / n), group = uid();
      const list = Array.from({ length: n }, (_, i) => ({
        ...base, group, installment: i + 1, installments: n,
        description: `${base.description} (${i + 1}/${n})`,
        amount: (i === n - 1 ? totalC - each * (n - 1) : each) / 100,
        date: shiftISO(d.date, { m: i }),
        paid: base.cardId ? false : i === 0 ? base.paid : false,
        attachments: i === 0 ? base.attachments || [] : [], // o comprovante da compra fica na 1ª parcela
      }));
      await fbulk('transactions', list);
      await attach?.saved();
      toast(`${n} parcelas lançadas`);
    },
    onDelete: isNew ? null : async () => { await fremove('transactions', t.id); await dropAttachments([t]); toast('Lançamento excluído'); },
    deleteConfirm: group.length > 1 ? 'Excluir só esta parcela?' : `Excluir este lançamento?${t.attachments?.length ? ' O comprovante também será apagado.' : ''}`,
  });
  if (kind !== 'transfer') attach = bindAttachments(m, { initial: t.attachments || [], upload: finUpload, remove: finRemove });
  m.body.querySelector('[data-delgroup]')?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Excluir as ${group.length} parcelas desta compra?`, { ok: 'Excluir todas' }))) return;
    await run(async () => { await fremove('transactions', group.map((x) => x.id)); await dropAttachments(group); m.close(); toast('Parcelas excluídas'); });
  });
  return m;
}

// ---------------------------------------------------------------------------
// Fixos (receitas e gastos que se repetem)
// ---------------------------------------------------------------------------
export function recurringForm(r = {}, { kind = r.kind || 'expense' } = {}) {
  if (needAccount()) return;
  const isNew = !r.id;
  const income = kind === 'income';
  // "Repete" num campo só: todo mês, a cada N meses ou uma vez por ano.
  const every = Math.max(2, Number(r.every) || 2);
  const repeatOpts = [
    { value: 'monthly', label: 'Todo mês' },
    { value: 'every:2', label: 'A cada 2 meses' },
    { value: 'every:3', label: 'A cada 3 meses (trimestral)' },
    { value: 'every:6', label: 'A cada 6 meses (semestral)' },
    { value: 'yearly', label: 'Uma vez por ano' },
  ];
  if (r.frequency === 'interval' && !repeatOpts.some((o) => o.value === `every:${every}`)) repeatOpts.splice(4, 0, { value: `every:${every}`, label: `A cada ${every} meses` });
  const repeat = r.frequency === 'yearly' ? 'yearly' : r.frequency === 'interval' ? `every:${every}` : 'monthly';
  const values = {
    day: 5, month: String(new Date().getMonth() + 1), start: thisMonth(), end: '',
    payWith: r.cardId ? `c:${r.cardId}` : `a:${r.accountId || fin.items.accounts[0].id}`, accountId: fin.items.accounts[0].id,
    ...r,
    repeat, paused: r.active === false,
    more: !isNew && !!(r.end || r.variable || r.active === false || r.notes),
  };
  if (r.month) values.month = String(r.month);
  const more = (v) => v.more;
  formModal({
    title: isNew ? (income ? 'Nova receita fixa' : 'Novo gasto fixo') : (income ? 'Receita fixa' : 'Gasto fixo'),
    intro: isNew ? (income ? 'Salário, pró-labore, aluguel que você recebe, pensão…' : 'Aluguel, condomínio, luz, internet, academia, assinaturas…') : '',
    values,
    fields: [
      { name: 'description', label: income ? 'O que é' : 'Descrição', required: true, full: true, placeholder: income ? 'Ex.: Salário' : 'Ex.: Aluguel, Netflix, Luz' },
      { name: 'amount', label: income ? 'Quanto você recebe' : 'Valor', type: 'money', required: true },
      { name: 'day', label: income ? 'Dia que cai' : 'Dia do vencimento', type: 'number', min: 1, max: 31, required: true },
      { name: 'repeat', label: 'Repete', type: 'select', options: repeatOpts },
      { name: 'month', label: 'Em qual mês', type: 'select', options: MONTHS, showIf: (v) => v.repeat === 'yearly' },
      ...(income ? [
        { name: 'party', label: 'De onde vem', placeholder: 'Empresa, cliente, pessoa…', list: knownParties(kind) },
        { name: 'accountId', label: 'Entra na conta', type: 'select', options: accountOptions() },
        { name: 'categoryId', label: 'Categoria', type: 'select', options: catOptions(kind) },
      ] : [
        { name: 'categoryId', label: 'Categoria', type: 'select', options: catOptions(kind) },
        { name: 'payWith', label: 'Pago com', type: 'select', options: payWithOptions(), hint: 'No cartão, entra sozinho em cada fatura.' },
        { name: 'party', label: 'Para onde vai', placeholder: 'Imobiliária, operadora, loja…', list: knownParties(kind) },
      ]),
      { name: 'more', label: 'Mais opções (início e fim, valor que varia, pausar)', type: 'checkbox', full: true },
      { name: 'start', label: 'Começa em', type: 'select', options: monthOptions(), showIf: more },
      { name: 'end', label: 'Termina em', type: 'select', options: monthOptions({ empty: 'Não tem fim', back: 0, ahead: 120 }), showIf: more },
      { name: 'variable', label: 'O valor muda todo mês (ex.: luz, água)', type: 'checkbox', full: true, hint: 'Use a média como valor; na hora de confirmar o mês, você ajusta.', showIf: more },
      ...(isNew ? [] : [{ name: 'paused', label: 'Pausado (não aparece nos próximos meses)', type: 'checkbox', full: true, showIf: more }]),
      { name: 'notes', label: 'Observações', type: 'textarea', rows: 2, full: true, showIf: more },
    ],
    onSubmit: async (d) => {
      if (!(d.amount > 0)) throw Object.assign(new Error('Informe um valor maior que zero.'), { field: 'amount' });
      const day = Math.round(d.day);
      if (!(day >= 1 && day <= 31)) throw Object.assign(new Error('O dia vai de 1 a 31.'), { field: 'day' });
      // Campos de "Mais opções" escondidos mantêm o que já estava salvo.
      const start = d.start ?? r.start ?? thisMonth();
      const endM = d.end ?? r.end ?? '';
      if (endM && endM < start) throw Object.assign(new Error('O fim não pode ser antes do começo.'), { field: 'end' });
      const rep = String(d.repeat || 'monthly');
      const data = {
        kind, description: d.description, amount: d.amount, day,
        frequency: rep === 'yearly' ? 'yearly' : rep.startsWith('every:') ? 'interval' : 'monthly',
        every: rep.startsWith('every:') ? Number(rep.split(':')[1]) : (r.every || 2),
        month: Number(d.month ?? r.month) || 1,
        categoryId: d.categoryId || '', party: d.party || '', start, end: endM,
        variable: d.variable ?? !!r.variable, active: d.paused === undefined ? r.active !== false : !d.paused, notes: d.notes ?? r.notes ?? '',
      };
      if (income) Object.assign(data, { accountId: d.accountId, cardId: '' });
      else {
        const [type, id] = String(d.payWith || '').split(':');
        Object.assign(data, type === 'c' ? { cardId: id, accountId: '' } : { accountId: id, cardId: '' });
      }
      if (isNew) await fcreate('recurring', data); else await fupdate('recurring', r.id, data);
      toast(income ? 'Receita fixa salva' : 'Gasto fixo salvo');
    },
    onDelete: isNew ? null : async () => { await fremove('recurring', r.id); toast('Excluído'); },
    deleteConfirm: 'Excluir este fixo? Os meses já confirmados continuam no extrato.',
  });
}

// Confirmar a ocorrência do mês de um fixo (vira lançamento), ou pular este mês.
export function confirmOccurrence(e) {
  const r = e.rec;
  const income = r.kind === 'income';
  const m = formModal({
    title: income ? 'Confirmar recebimento' : 'Confirmar pagamento',
    intro: `${r.description} · ${monthLabel(e.period)}${r.variable ? '. O valor muda todo mês: confira antes de confirmar.' : ''}`,
    values: { amount: r.amount, date: e.date > todayISO() ? todayISO() : e.date, accountId: r.accountId || fin.items.accounts[0]?.id, skip: false },
    fields: [
      { name: 'amount', label: 'Valor', type: 'money', required: true, full: true },
      { name: 'date', label: income ? 'Recebido em' : 'Pago em', type: 'date', required: true },
      { name: 'accountId', label: income ? 'Entrou na conta' : 'Saiu da conta', type: 'select', options: accountOptions() },
      { name: 'skip', label: 'Não vai acontecer este mês (pular)', type: 'checkbox', full: true },
      { type: 'html', html: html`<button type="button" class="fin-link" data-editrec>${icon('edit')} Editar o fixo (todos os meses)</button>` },
    ],
    submitLabel: 'Confirmar',
    onSubmit: async (d) => {
      const base = { kind: r.kind, description: r.description, categoryId: r.categoryId || '', party: r.party || '', recurringId: r.id, period: e.period, cardId: '' };
      if (d.skip) { await fcreate('transactions', { ...base, amount: 0, date: e.date, accountId: d.accountId, paid: false, skipped: true }); toast('Pulado neste mês'); return; }
      if (!(d.amount > 0)) throw Object.assign(new Error('Informe o valor.'), { field: 'amount' });
      await fcreate('transactions', { ...base, amount: d.amount, date: d.date, accountId: d.accountId, paid: true });
      toast(income ? 'Recebimento confirmado' : 'Pagamento confirmado');
    },
  });
  m.body.querySelector('[data-editrec]')?.addEventListener('click', () => { m.close(); recurringForm(r); });
}

// Marca um lançamento pendente como pago/recebido, sem abrir o formulário.
export async function markPaid(t) {
  await fupdate('transactions', t.id, { paid: true });
  toast(t.kind === 'income' ? 'Marcado como recebido' : 'Marcado como pago');
}

// ---------------------------------------------------------------------------
// Ajustar saldo: dizer quanto tem de verdade em cada conta
// ---------------------------------------------------------------------------
// A diferença vira um lançamento "Ajuste de saldo" (gastos ou entradas que não foram lançados).
export function adjustBalanceForm() {
  if (needAccount()) return;
  const mine = accountBalances().filter((b) => b.owner === 'me');
  const values = Object.fromEntries(mine.map((b) => [`acc_${b.account.id}`, Math.round(b.balance * 100) / 100]));
  formModal({
    title: 'Ajustar saldo',
    intro: 'Quanto tem hoje em cada conta? Confira no app do banco. A diferença entra como "Ajuste de saldo" (gastos que você não lançou), e a previsão passa a partir do valor real.',
    values,
    fields: mine.map((b) => ({ name: `acc_${b.account.id}`, label: `${b.account.name} · o app calculou ${money(b.balance)}`, type: 'money', full: true })),
    submitLabel: 'Ajustar',
    onSubmit: async (d) => {
      const today = todayISO();
      const list = [];
      for (const b of mine) {
        const real = d[`acc_${b.account.id}`];
        if (real == null || Number.isNaN(real)) continue;
        const diff = Math.round((real - b.balance) * 100) / 100;
        if (Math.abs(diff) < 0.01) continue;
        list.push({
          kind: diff < 0 ? 'expense' : 'income', amount: Math.abs(diff), date: today, accountId: b.account.id, cardId: '',
          categoryId: ADJUST_CAT.id, description: diff < 0 ? 'Ajuste de saldo (gastos não lançados)' : 'Ajuste de saldo (entradas não lançadas)',
          paid: true, adjust: true,
        });
      }
      if (!list.length) { toast('Os saldos já batem'); return; }
      await fbulk('transactions', list);
      toast(list.length === 1 ? 'Saldo ajustado' : `${list.length} saldos ajustados`);
    },
  });
}

// Gastos do dia a dia por mês (deixa a previsão realista).
export function dailyBudgetForm() {
  formModal({
    title: 'Gastos do dia a dia',
    intro: 'Quanto você costuma gastar por mês com o que não é fixo: mercado, comida, transporte, farmácia, lazer… A previsão do fim do mês desconta o que ainda deve sair disso. Lançando esses gastos, eles vão sendo abatidos desse valor.',
    values: { dailyBudget: fin.settings.dailyBudget || '' },
    fields: [{ name: 'dailyBudget', label: 'Por mês', type: 'money', full: true, hint: 'Deixe em branco para não considerar.' }],
    onSubmit: async (d) => { await saveFinSettings({ dailyBudget: d.dailyBudget || 0 }); toast('Previsão atualizada'); },
  });
}

// ---------------------------------------------------------------------------
// Contas, cartões, categorias e metas
// ---------------------------------------------------------------------------
export function accountForm(a = {}) {
  const isNew = !a.id;
  formModal({
    title: isNew ? 'Nova conta' : 'Editar conta',
    intro: isNew ? 'Banco, carteira, poupança, investimento ou vale. O saldo de hoje é o ponto de partida.' : '',
    values: { type: 'corrente', color: COLORS[fin.items.accounts.length % COLORS.length], includeInTotal: true, initialBalance: 0, ...a },
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true, placeholder: 'Ex.: Nubank, Itaú, Carteira' },
      { name: 'type', label: 'Tipo', type: 'select', options: ACCOUNT_TYPES },
      { name: 'color', label: 'Cor', type: 'select', options: colorOptions() },
      { name: 'initialBalance', label: isNew ? 'Saldo hoje' : 'Saldo inicial', type: 'money', full: true, hint: isNew ? 'Os lançamentos a partir de agora mexem neste saldo. Pode ser negativo (ex.: -150,00).' : 'O saldo de quando a conta foi cadastrada. Os lançamentos são somados a ele.' },
      { name: 'includeInTotal', label: 'Somar no saldo total', type: 'checkbox', full: true, hint: 'Desligue para investimentos ou contas que não quer ver no saldo do dia a dia.' },
    ],
    onSubmit: async (d) => {
      const data = { ...d, initialBalance: d.initialBalance || 0 };
      if (isNew) await fcreate('accounts', data); else await fupdate('accounts', a.id, data);
      toast('Conta salva');
    },
    onDelete: isNew ? null : async () => {
      if (fin.items.accounts.length === 1) throw new Error('Mantenha pelo menos uma conta.');
      await fremove('accounts', a.id);
      toast('Conta excluída');
    },
    deleteConfirm: 'Excluir esta conta? Os lançamentos ligados a ela continuam no extrato, mas sem conta.',
  });
}

export function cardForm(c = {}) {
  if (needAccount()) return;
  const isNew = !c.id;
  formModal({
    title: isNew ? 'Novo cartão' : 'Editar cartão',
    values: { closingDay: 1, dueDay: 10, color: '#1C1C1E', accountId: fin.items.accounts[0].id, ...c },
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true, placeholder: 'Ex.: Nubank, Itaú Visa' },
      { name: 'limit', label: 'Limite', type: 'money' },
      { name: 'color', label: 'Cor', type: 'select', options: colorOptions() },
      { name: 'closingDay', label: 'Dia que a fatura fecha', type: 'number', min: 1, max: 31, required: true, hint: 'Compras a partir deste dia vão para a fatura seguinte.' },
      { name: 'dueDay', label: 'Dia do vencimento', type: 'number', min: 1, max: 31, required: true },
      { name: 'accountId', label: 'Fatura paga pela conta', type: 'select', options: accountOptions(), full: true },
    ],
    onSubmit: async (d) => {
      for (const k of ['closingDay', 'dueDay']) if (!(d[k] >= 1 && d[k] <= 31)) throw Object.assign(new Error('Os dias vão de 1 a 31.'), { field: k });
      const data = { ...d, closingDay: Math.round(d.closingDay), dueDay: Math.round(d.dueDay) };
      if (isNew) await fcreate('cards', { ...data, paidInvoices: {} }); else await fupdate('cards', c.id, data);
      toast('Cartão salvo');
    },
    onDelete: isNew ? null : async () => { await fremove('cards', c.id); toast('Cartão excluído'); },
    deleteConfirm: 'Excluir este cartão? As compras feitas nele continuam no extrato, mas sem cartão.',
  });
}

export function payInvoiceForm(card, key) {
  const src = sources().find((s) => s.owner === 'me');
  const total = invoiceTotal(src, card, key);
  formModal({
    title: `Pagar fatura ${card.name}`,
    intro: `Fatura de ${monthLabel(key).toLowerCase()}, vence em ${fmtDate(invoiceDue(card, key))}. Total: ${money(total)}.`,
    values: { amount: total, date: todayISO(), accountId: card.accountId || fin.items.accounts[0]?.id },
    fields: [
      { name: 'amount', label: 'Valor pago', type: 'money', required: true, full: true },
      { name: 'date', label: 'Pago em', type: 'date', required: true },
      { name: 'accountId', label: 'Saiu da conta', type: 'select', options: accountOptions() },
    ],
    submitLabel: 'Pagar',
    onSubmit: async (d) => {
      await fupdate('cards', card.id, { paidInvoices: { ...(card.paidInvoices || {}), [key]: { date: d.date, accountId: d.accountId, amount: d.amount } } });
      toast('Fatura paga');
    },
  });
}
export async function reopenInvoice(card, key) {
  if (!(await confirmDialog('Desfazer o pagamento desta fatura?', { ok: 'Desfazer', danger: false }))) return;
  const paid = { ...(card.paidInvoices || {}) };
  delete paid[key];
  await fupdate('cards', card.id, { paidInvoices: paid });
  toast('Fatura reaberta');
}

export function categoryForm(c = {}, { kind = c.kind || 'expense' } = {}) {
  const isNew = !c.id;
  formModal({
    title: isNew ? `Nova categoria de ${kind === 'income' ? 'receita' : 'despesa'}` : 'Editar categoria',
    values: { emoji: kind === 'income' ? '💰' : '📦', color: COLORS[fin.items.categories.length % COLORS.length], ...c },
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true },
      { name: 'emoji', label: 'Emoji', placeholder: '🛒' },
      { name: 'color', label: 'Cor', type: 'select', options: colorOptions() },
      ...(kind === 'expense' ? [{ name: 'budget', label: 'Limite por mês (opcional)', type: 'money', full: true, hint: 'Aparece em Planejar › Orçamento, com aviso quando passar.' }] : []),
    ],
    onSubmit: async (d) => {
      const data = { ...d, kind, emoji: [...String(d.emoji || '').trim()].slice(0, 2).join('') || '•', budget: d.budget || 0 };
      if (isNew) await fcreate('categories', { ...data, order: 999 }); else await fupdate('categories', c.id, data);
      toast('Categoria salva');
    },
    onDelete: isNew ? null : async () => { await fremove('categories', c.id); toast('Categoria excluída'); },
    deleteConfirm: 'Excluir esta categoria? Os lançamentos dela ficam "Sem categoria".',
  });
}

export function goalForm(g = {}) {
  const isNew = !g.id;
  formModal({
    title: isNew ? 'Nova meta' : 'Editar meta',
    intro: isNew ? 'Reserva de emergência, viagem, casa, carro… Acompanhe quanto já guardou.' : '',
    values: { emoji: '🎯', color: '#34C759', saved: 0, ...g },
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true, placeholder: 'Ex.: Reserva de emergência' },
      { name: 'emoji', label: 'Emoji' },
      { name: 'color', label: 'Cor', type: 'select', options: colorOptions() },
      { name: 'target', label: 'Quanto quer juntar', type: 'money', required: true },
      { name: 'saved', label: 'Quanto já tem', type: 'money' },
      { name: 'deadline', label: 'Até quando (opcional)', type: 'date', full: true },
    ],
    onSubmit: async (d) => {
      if (!(d.target > 0)) throw Object.assign(new Error('Informe o valor da meta.'), { field: 'target' });
      const data = { ...d, saved: d.saved || 0, emoji: [...String(d.emoji || '').trim()].slice(0, 2).join('') || '🎯' };
      if (isNew) await fcreate('goals', { ...data, history: [] }); else await fupdate('goals', g.id, data);
      toast('Meta salva');
    },
    onDelete: isNew ? null : async () => { await fremove('goals', g.id); toast('Meta excluída'); },
  });
}
export function goalDepositForm(g) {
  formModal({
    title: `${g.emoji || '🎯'} ${g.name}`,
    values: { amount: '', date: todayISO(), withdraw: false },
    fields: [
      { name: 'amount', label: 'Valor', type: 'money', required: true, full: true },
      { name: 'date', label: 'Data', type: 'date' },
      { name: 'withdraw', label: 'É uma retirada (tirei dinheiro da meta)', type: 'checkbox', full: true },
    ],
    submitLabel: 'Salvar',
    onSubmit: async (d) => {
      if (!(d.amount > 0)) throw Object.assign(new Error('Informe o valor.'), { field: 'amount' });
      const v = d.withdraw ? -d.amount : d.amount;
      await fupdate('goals', g.id, { saved: Math.round(((Number(g.saved) || 0) + v) * 100) / 100, history: [...(g.history || []), { date: d.date || todayISO(), amount: v }].slice(-200) });
      toast(d.withdraw ? 'Retirada registrada' : 'Guardado!');
    },
  });
}

// ---------------------------------------------------------------------------
// Detalhes (itens do par ou do casamento: só leitura) e o menu do "+"
// ---------------------------------------------------------------------------
export function entryInfo(e) {
  const c = categoryOf(e.src, e.categoryId);
  const who = e.owner === 'partner' ? `Lançado por ${partnerName()}` : e.owner === 'wedding' ? 'Pagamento de fornecedor do casamento' : '';
  openModal({
    title: e.description || 'Lançamento',
    size: 'sm',
    body: html`<div class="fin-info">
      <div class="fin-info-amt ${e.kind}"><span class="amt">${e.kind === 'income' ? '+' : '−'} ${money(e.amount)}</span></div>
      <dl>
        <dt>Data</dt><dd>${fmtDate(e.date)}</dd>
        <dt>Categoria</dt><dd>${c.emoji} ${c.name}</dd>
        ${e.party ? html`<dt>${e.kind === 'income' ? 'De onde vem' : 'Para onde vai'}</dt><dd>${e.party}</dd>` : ''}
        ${e.card ? html`<dt>Cartão</dt><dd>${e.card.name} · fatura de ${monthLabel(e.invoice).toLowerCase()}</dd>` : ''}
        ${e.method ? html`<dt>Forma</dt><dd>${e.method}</dd>` : ''}
        ${e.split && e.split.length > 1 ? html`<dt>Valor total</dt><dd>${money(e.fullAmount)}</dd><dt>Dividido entre</dt><dd>${e.splitText} (${money(e.fullAmount / e.split.length)} cada)</dd>` : ''}
        <dt>Situação</dt><dd>${e.paid ? (e.kind === 'income' ? 'Recebido' : 'Pago') : 'Pendente'}</dd>
      </dl>
      ${e.attachments?.length && e.owner !== 'partner' ? html`<div class="attach-list">${e.attachments.map((a) => html`<div class="attach-item"><a href="/api/files/${a.id}" target="_blank" rel="noopener">${icon('clip')}<span>${a.name}</span></a></div>`)}</div>` : ''}
      ${who ? html`<p class="fin-note">${who}${e.owner === 'wedding' ? '. Para mudar, abra o casamento › Fornecedores.' : '. Só quem lançou pode editar.'}</p>` : ''}
      ${e.owner === 'wedding' ? html`<a class="btn btn-ghost btn-block" href="#/orcamento?pagamentos">${icon('heart')}<span>Abrir no casamento</span></a>` : ''}
    </div>`,
  });
}

export function addSheet() {
  const hasCards = fin.items.cards.length > 0;
  const opts = [
    { act: 'expense', ic: 'down', label: 'Despesa', cls: 'red' },
    { act: 'income', ic: 'up', label: 'Receita', cls: 'green' },
    ...(hasCards ? [{ act: 'card', ic: 'card', label: 'Compra no cartão', cls: 'ink' }] : []),
    { act: 'transfer', ic: 'swap', label: 'Transferência', cls: 'blue' },
    { act: 'rec-expense', ic: 'repeat', label: 'Gasto fixo', cls: 'orange' },
    { act: 'rec-income', ic: 'repeat', label: 'Receita fixa', cls: 'green' },
    ...(hasCards ? [] : [{ act: 'new-card', ic: 'card', label: 'Cadastrar cartão', cls: 'ink' }]),
    { act: 'goal', ic: 'target', label: 'Meta', cls: 'purple' },
  ];
  openModal({
    title: 'Adicionar',
    size: 'sheet',
    body: html`<div class="fin-add-grid">${opts.map((o) => html`<button type="button" class="fin-add-opt" data-add="${o.act}"><span class="fin-add-ic ${o.cls}">${icon(o.ic)}</span><span>${o.label}</span></button>`)}</div>`,
    onMount(m) {
      m.body.onclick = (ev) => {
        const b = ev.target.closest('[data-add]');
        if (!b) return;
        m.close();
        const a = b.dataset.add;
        setTimeout(() => {
          if (a === 'expense') txForm({}, { kind: 'expense' });
          else if (a === 'income') txForm({}, { kind: 'income' });
          else if (a === 'card') txForm({}, { kind: 'expense', card: true });
          else if (a === 'transfer') { if (fin.items.accounts.length < 2) toast('Cadastre pelo menos duas contas para transferir.', 'error'); else txForm({}, { kind: 'transfer' }); }
          else if (a === 'rec-expense') recurringForm({}, { kind: 'expense' });
          else if (a === 'rec-income') recurringForm({}, { kind: 'income' });
          else if (a === 'new-card') cardForm();
          else if (a === 'goal') goalForm();
        }, 120);
      };
    },
  });
}

export { fById, monthOf, dayIn, invoiceKey, FREQ_LABEL };
