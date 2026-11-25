// Finanças: telas.
import { fin, setScope, toggleHidden, valuesHidden, saveFinSettings, fupdate } from './data.js';
import {
  thisMonth, addMonths, monthLabel, monthOf, monthSummary, monthEntries, accountBalances, totalBalance, upcoming, history,
  recurringTotals, categoryOf, myCategories, sources, isCouple, partnerName, firstName, FREQ_LABEL, ACCOUNT_TYPES,
  invoiceKey, invoiceDue, invoiceClosing, invoiceEntries, invoiceTotal, currentInvoiceKey, cardUsed, recurringHits, fulfilledRecurring, WEDDING_CAT,
} from './model.js';
import {
  txForm, recurringForm, confirmOccurrence, markPaid, accountForm, cardForm, payInvoiceForm, reopenInvoice, categoryForm,
  goalForm, goalDepositForm, entryInfo,
} from './forms.js';
import { state } from '../store.js';
import { html, icon, raw, money, fmtDate, todayISO, sum, norm, run, downloadCSV, csvMoney, toast } from '../ui.js';

export const ui = { month: thisMonth(), ext: 'tudo', q: '', plan: 'fixos', catKind: 'expense', cardKey: '', cardId: '' };

// ---------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------
const amt = (v, { sign = false, kind = '' } = {}) => {
  const n = Number(v) || 0;
  const s = sign ? (kind === 'income' ? '+ ' : kind === 'expense' ? '− ' : n < 0 ? '− ' : '') : n < 0 ? '− ' : '';
  return html`<span class="amt">${s}${money(Math.abs(n))}</span>`;
};
const bubble = (c, size = '') => html`<span class="fin-bubble ${size}" style="--c:${c.color || '#8E8E93'}">${c.emoji || '•'}</span>`;
const ownerTag = (e) => (isCouple() && e.owner === 'partner' ? html`<span class="fin-owner">${firstName(fin.partner?.name).slice(0, 1) || 'P'}</span>` : '');

function largeTitle(title, { sub = '', back = '', actions = '' } = {}) {
  return html`<header class="fin-head">
    ${back ? html`<a class="fin-back" href="${back}">${icon('back')}<span>Voltar</span></a>` : ''}
    <div class="fin-head-row">
      <div><h1>${title}</h1>${sub ? html`<p class="fin-sub">${sub}</p>` : ''}</div>
      <div class="fin-head-actions">${actions}</div>
    </div>
  </header>`;
}
const eyeBtn = () => html`<button type="button" class="fin-round" data-act="hide" aria-label="${valuesHidden() ? 'Mostrar valores' : 'Esconder valores'}" title="${valuesHidden() ? 'Mostrar valores' : 'Esconder valores'}">${icon(valuesHidden() ? 'eyeoff' : 'eye')}</button>`;

function monthNav(key = ui.month) {
  return html`<div class="fin-month">
    <button type="button" class="fin-round sm" data-act="month" data-d="-1" aria-label="Mês anterior">${icon('back')}</button>
    <button type="button" class="fin-month-label" data-act="month-today" title="Voltar para este mês">${monthLabel(key)}</button>
    <button type="button" class="fin-round sm" data-act="month" data-d="1" aria-label="Próximo mês">${icon('chevron')}</button>
  </div>`;
}
function scopeSwitch() {
  if (!fin.partner) return '';
  return html`<div class="fin-seg" role="tablist" aria-label="Visão">
    <button type="button" role="tab" class="${isCouple() ? '' : 'on'}" aria-selected="${!isCouple()}" data-act="scope" data-v="me">Minhas</button>
    <button type="button" role="tab" class="${isCouple() ? 'on' : ''}" aria-selected="${isCouple()}" data-act="scope" data-v="couple">Do casal</button>
  </div>`;
}
function partnerNotice() {
  if (!isCouple() || fin.partner?.shared) return '';
  return html`<div class="fin-card fin-notice">${icon('users')}<span>${partnerName()} ainda não liberou as finanças para a visão do casal. Aqui aparecem só as suas e o casamento. Para liberar: Mais › Ajustes, na conta de ${partnerName()}.</span></div>`;
}
function seg(group, options, current) {
  return html`<div class="fin-seg">${options.map((o) => html`<button type="button" class="${o.value === current ? 'on' : ''}" data-act="seg" data-group="${group}" data-v="${o.value}">${o.label}</button>`)}</div>`;
}

// Linha de um movimento (lançamento, fixo previsto, compra no cartão, casamento).
function entryRow(e, { showDate = false } = {}) {
  const c = e.kind === 'transfer' ? { emoji: '↔️', color: '#8E8E93', name: 'Transferência' } : categoryOf(e.src, e.categoryId);
  const today = todayISO();
  const late = !e.paid && !e.card && e.date < today;
  const meta = [];
  if (showDate) meta.push(fmtDate(e.date, { day: '2-digit', month: 'short' }).replace('.', ''));
  meta.push(c.name);
  if (e.card) meta.push(`💳 ${e.card.name}`);
  if (e.party) meta.push(e.party);
  const status = e.kind === 'transfer' ? '' : e.virtual && !e.auto ? html`<span class="fin-pill ${late ? 'red' : 'gray'}">${late ? 'atrasado' : 'previsto'}</span>`
    : !e.paid && !e.card ? html`<span class="fin-pill ${late ? 'red' : 'orange'}">${late ? 'atrasado' : 'pendente'}</span>` : '';
  return html`<button type="button" class="fin-row" data-act="entry" data-id="${e.id}" data-month="${e.month || ''}">
    ${bubble(c)}
    <span class="fin-row-main">
      <span class="fin-row-title">${e.description || c.name}${e.recurringId || e.rec ? html` <span class="fin-mini">${icon('repeat')}</span>` : ''}${ownerTag(e)}</span>
      <span class="fin-row-meta">${meta.join(' · ')}</span>
    </span>
    <span class="fin-row-end">
      <span class="fin-row-amt ${e.kind}">${amt(e.amount, { sign: true, kind: e.kind })}</span>
      ${status}
    </span>
  </button>`;
}

// Gráfico de rosca (gastos por categoria).
function donut(parts, { size = 148, stroke = 18, center = '' } = {}) {
  const total = sum(parts, (p) => p.value);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let off = 0;
  const segs = total > 0 ? parts.filter((p) => p.value > 0).map((p) => {
    const len = (p.value / total) * c;
    const s = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${p.color}" stroke-width="${stroke}" stroke-dasharray="${Math.max(0, len - 2)} ${c}" stroke-dashoffset="${-off}" stroke-linecap="butt"/>`;
    off += len;
    return s;
  }).join('') : '';
  return html`<div class="fin-donut" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--f-track)" stroke-width="${stroke}"/><g transform="rotate(-90 ${size / 2} ${size / 2})">${raw(segs)}</g></svg>
    <div class="fin-donut-center">${center}</div>
  </div>`;
}
// Barras dos últimos meses (receitas x despesas).
function bars(data) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  return html`<div class="fin-bars" role="img" aria-label="Receitas e despesas por mês">
    ${data.map((d) => html`<div class="fin-bar-col ${d.key === thisMonth() ? 'now' : ''}" title="${monthLabel(d.key)}: receitas ${money(d.income)}, despesas ${money(d.expense)}">
      <div class="fin-bar-pair">
        <span class="fin-bar inc" style="height:${(d.income / max) * 100}%"></span>
        <span class="fin-bar exp" style="height:${(d.expense / max) * 100}%"></span>
      </div>
      <small>${monthLabel(d.key, { short: true })}</small>
    </div>`)}
  </div>`;
}
const meter = (ratio, color = 'var(--f-blue)') => html`<div class="fin-meter"><span style="width:${Math.max(0, Math.min(100, ratio * 100))}%;background:${color}"></span></div>`;
const emptyCard = (ic, title, text, action = '') => html`<div class="fin-card fin-empty">${icon(ic)}<strong>${title}</strong><p>${text}</p>${action}</div>`;

// Previsão de saldo no fim de um mês (do mês atual em diante): saldo de hoje + o que ainda falta entrar e sair.
function forecast(key) {
  let bal = totalBalance();
  for (let k = thisMonth(); k <= key; k = addMonths(k, 1)) {
    const s = monthSummary(k);
    bal += (s.income.total - s.income.done) - (s.expense.total - s.expense.done);
  }
  return bal;
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------
function home() {
  const key = ui.month;
  const s = monthSummary(key);
  const now = thisMonth();
  const name = firstName(state.user?.name);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const bal = totalBalance();
  const cats = s.categories.filter((g) => g.total > 0);
  const topCats = cats.slice(0, 6);
  const next = key === now ? upcoming(20).slice(0, 6) : [];
  const recT = recurringTotals();
  const myCards = sources().flatMap((src) => src.items.cards.map((card) => ({ src, card })));
  const goals = sources().flatMap((src) => src.items.goals.map((g) => ({ src, g })));
  const budgetOver = s.categories.filter((g) => g.budget > 0 && g.total > g.budget);

  return html`
    ${largeTitle(isCouple() ? 'Finanças do casal' : 'Finanças', { sub: `${hello}${name ? `, ${name}` : ''}`, actions: html`${eyeBtn()}<a class="fin-round" href="#/inicio" title="Casamento" aria-label="Abrir o casamento">${icon('heart')}</a>` })}
    ${scopeSwitch()}
    ${partnerNotice()}
    ${monthNav()}

    <section class="fin-card fin-hero">
      <span class="fin-label">Saldo em contas</span>
      <strong class="fin-hero-amt ${bal < 0 ? 'neg' : ''}">${amt(bal)}</strong>
      ${key >= now
        ? html`<span class="fin-hero-sub">Previsto para o fim de ${monthLabel(key).toLowerCase().replace(/ de \d+$/, '')}: <b>${amt(forecast(key))}</b></span>`
        : html`<span class="fin-hero-sub">Resultado de ${monthLabel(key).toLowerCase()}: <b class="${s.balance < 0 ? 'neg' : 'pos'}">${amt(s.balance, { sign: true })}</b></span>`}
      <a class="fin-hero-link" href="#/fin/contas">Contas ${icon('chevron')}</a>
    </section>

    <div class="fin-tiles">
      <a class="fin-card fin-tile" href="#/fin/extrato" data-act="ext-filter" data-v="receitas">
        <span class="fin-tile-ic green">${icon('up')}</span>
        <span class="fin-label">Receitas</span>
        <strong>${amt(s.income.total)}</strong>
        <small>${s.income.total - s.income.done > 0.005 ? html`${amt(s.income.done)} recebido` : 'tudo recebido'}</small>
      </a>
      <a class="fin-card fin-tile" href="#/fin/extrato" data-act="ext-filter" data-v="despesas">
        <span class="fin-tile-ic red">${icon('down')}</span>
        <span class="fin-label">Despesas</span>
        <strong>${amt(s.expense.total)}</strong>
        <small>${s.expense.total - s.expense.done > 0.005 ? html`${amt(s.expense.done)} pago` : 'tudo pago'}</small>
      </a>
    </div>

    <section class="fin-card fin-result">
      <div><span class="fin-label">${s.balance >= 0 ? 'Sobra no mês' : 'Falta no mês'}</span><strong class="${s.balance < 0 ? 'neg' : 'pos'}">${amt(s.balance, { sign: true })}</strong></div>
      ${s.income.total > 0 ? html`<div class="fin-result-bar">${meter(s.expense.total / s.income.total, s.expense.total > s.income.total ? 'var(--f-red)' : s.expense.total / s.income.total > 0.85 ? 'var(--f-orange)' : 'var(--f-green)')}<small>${Math.round((s.expense.total / s.income.total) * 100)}% da renda do mês comprometida</small></div>` : html`<small class="fin-muted">Cadastre suas receitas para ver quanto da renda está comprometida.</small>`}
    </section>

    ${budgetOver.length ? html`<div class="fin-card fin-notice warn">${icon('alert')}<span>Passou do limite em ${budgetOver.map((g) => g.cat.name).join(', ')}. <a href="#/fin/planejar" data-act="seg-plan" data-v="orcamento">Ver orçamento</a></span></div>` : ''}

    ${next.length ? html`<section class="fin-section">
      <div class="fin-section-head"><h2>Próximos vencimentos</h2><a href="#/fin/extrato" data-act="ext-filter" data-v="pendentes">Ver todos</a></div>
      <div class="fin-card fin-list">${next.map((e) => upcomingRow(e))}</div>
    </section>` : ''}

    <section class="fin-section">
      <div class="fin-section-head"><h2>Para onde foi o dinheiro</h2><a href="#/fin/relatorios">Relatórios</a></div>
      ${topCats.length ? html`<div class="fin-card fin-cats">
        ${donut(topCats.map((g) => ({ value: g.total, color: g.cat.color })), { center: html`<small>Gastos</small><strong>${amt(s.expense.total)}</strong>` })}
        <div class="fin-cat-list">${topCats.map((g) => html`<div class="fin-cat-item">
          ${bubble(g.cat, 'sm')}
          <span class="fin-cat-name">${g.cat.name}${g.budget ? html`<small>${Math.round((g.total / g.budget) * 100)}% do limite</small>` : ''}</span>
          <span class="fin-cat-val">${amt(g.total)}<small>${s.expense.total ? Math.round((g.total / s.expense.total) * 100) : 0}%</small></span>
        </div>`)}</div>
      </div>` : emptyCard('pie', 'Nenhum gasto neste mês', 'Toque no + para lançar uma despesa.')}
    </section>

    ${myCards.length ? html`<section class="fin-section">
      <div class="fin-section-head"><h2>Cartões</h2><a href="#/fin/cartoes">Ver faturas</a></div>
      <div class="fin-card fin-list">${myCards.map(({ src, card }) => {
        const k = currentInvoiceKey(card);
        const total = invoiceTotal(src, card, k);
        const paid = !!card.paidInvoices?.[k];
        return html`<a class="fin-row" href="#/fin/cartoes" data-act="pick-card" data-id="${card.id}">
          <span class="fin-bubble" style="--c:${card.color || '#1C1C1E'}">💳</span>
          <span class="fin-row-main"><span class="fin-row-title">${card.name}${src.owner === 'partner' ? html`<span class="fin-owner">${partnerName().slice(0, 1)}</span>` : ''}</span><span class="fin-row-meta">Fatura de ${monthLabel(k, { short: true })} · vence ${fmtDate(invoiceDue(card, k), { day: '2-digit', month: 'short' }).replace('.', '')}</span></span>
          <span class="fin-row-end"><span class="fin-row-amt">${amt(total)}</span>${paid ? html`<span class="fin-pill green">paga</span>` : ''}</span>
        </a>`;
      })}</div>
    </section>` : ''}

    <section class="fin-section">
      <div class="fin-section-head"><h2>Fixos do mês</h2><a href="#/fin/planejar" data-act="seg-plan" data-v="fixos">Planejar</a></div>
      <div class="fin-card fin-fixed">
        <div><span class="fin-label">Renda fixa</span><strong class="pos">${amt(recT.income)}</strong></div>
        <div><span class="fin-label">Gastos fixos</span><strong class="neg">${amt(recT.expense)}</strong></div>
        <div><span class="fin-label">Livre</span><strong>${amt(recT.free)}</strong></div>
      </div>
    </section>

    ${goals.length ? html`<section class="fin-section">
      <div class="fin-section-head"><h2>Metas</h2><a href="#/fin/metas">Ver todas</a></div>
      <div class="fin-goal-strip">${goals.slice(0, 6).map(({ g }) => {
        const r = (Number(g.saved) || 0) / (Number(g.target) || 1);
        return html`<a class="fin-card fin-goal-mini" href="#/fin/metas"><span class="fin-goal-emoji">${g.emoji || '🎯'}</span><strong>${g.name}</strong>${meter(r, g.color || 'var(--f-green)')}<small>${Math.round(Math.min(1, r) * 100)}% · ${amt(g.saved)}</small></a>`;
      })}</div>
    </section>` : ''}
  `;
}
function upcomingRow(e) {
  const c = e.invoiceOf ? { emoji: '💳', color: e.invoiceOf.color || '#1C1C1E' } : categoryOf(e.src, e.categoryId);
  const today = todayISO();
  const days = Math.round((new Date(`${e.date}T12:00`) - new Date(`${today}T12:00`)) / 86400e3);
  const when = e.late ? `atrasado ${-days} ${-days === 1 ? 'dia' : 'dias'}` : days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days} dias`;
  const mine = e.owner === 'me' && !e.readonly;
  return html`<div class="fin-row static">
    ${bubble(c)}
    <span class="fin-row-main" data-act="entry" data-id="${e.id}" data-month="${e.invoice || e.month || monthOf(e.date)}"><span class="fin-row-title">${e.description}${ownerTag(e)}</span><span class="fin-row-meta ${e.late ? 'red' : ''}">${fmtDate(e.date, { day: '2-digit', month: 'short' }).replace('.', '')} · ${when}</span></span>
    <span class="fin-row-end"><span class="fin-row-amt ${e.kind}">${amt(e.amount, { sign: true, kind: e.kind })}</span>
      ${mine ? html`<button type="button" class="fin-chip-btn" data-act="quick-pay" data-id="${e.id}" data-month="${e.invoice || e.month || monthOf(e.date)}">${e.kind === 'income' ? 'Recebi' : 'Paguei'}</button>` : ''}</span>
  </div>`;
}

// ---------------------------------------------------------------------------
// Extrato
// ---------------------------------------------------------------------------
const EXT_FILTERS = {
  tudo: () => true,
  receitas: (e) => e.kind === 'income',
  despesas: (e) => e.kind === 'expense',
  pendentes: (e) => !e.paid && !e.card && e.kind !== 'transfer',
  cartao: (e) => !!e.card,
};
function extrato() {
  const all = monthEntries(ui.month);
  const q = norm(ui.q);
  const list = all.filter(EXT_FILTERS[ui.ext] || EXT_FILTERS.tudo).filter((e) => !q || norm(`${e.description} ${e.party} ${categoryOf(e.src, e.categoryId).name} ${e.notes || ''}`).includes(q));
  const inc = sum(list.filter((e) => e.kind === 'income'), (e) => e.amount);
  const exp = sum(list.filter((e) => e.kind === 'expense'), (e) => e.amount);
  const days = new Map();
  for (const e of [...list].reverse()) { if (!days.has(e.date)) days.set(e.date, []); days.get(e.date).push(e); }
  const count = (k) => all.filter(EXT_FILTERS[k]).length;
  return html`
    ${largeTitle('Extrato', { actions: html`${eyeBtn()}<button type="button" class="fin-round" data-act="export" title="Exportar planilha" aria-label="Exportar planilha">${icon('download')}</button>` })}
    ${scopeSwitch()}
    ${monthNav()}
    <label class="fin-search">${icon('search')}<input type="search" id="fin-q" value="${ui.q}" placeholder="Buscar no mês" autocomplete="off" enterkeyhint="search"></label>
    <div class="fin-chips">${[['tudo', 'Tudo'], ['receitas', 'Receitas'], ['despesas', 'Despesas'], ['pendentes', 'Pendentes'], ['cartao', 'Cartão']].map(([k, l]) => html`<button type="button" class="fin-chip ${ui.ext === k ? 'on' : ''}" data-act="ext-filter" data-v="${k}">${l}<span>${count(k)}</span></button>`)}</div>
    <div class="fin-ext-sum">
      <span>Entradas <b class="pos">${amt(inc)}</b></span>
      <span>Saídas <b class="neg">${amt(exp)}</b></span>
    </div>
    ${list.length ? [...days.entries()].map(([d, items]) => {
      const net = sum(items, (e) => (e.kind === 'income' ? e.amount : e.kind === 'expense' ? -e.amount : 0));
      const raw0 = new Date(`${d}T12:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
      const label = raw0.charAt(0).toUpperCase() + raw0.slice(1);
      return html`<section class="fin-day">
        <div class="fin-day-head"><span>${d === todayISO() ? 'Hoje' : label}</span><span class="amt">${net ? `${net > 0 ? '+' : '−'} ${money(Math.abs(net))}` : ''}</span></div>
        <div class="fin-card fin-list">${items.map((e) => entryRow(e))}</div>
      </section>`;
    }) : emptyCard('list', q ? 'Nada encontrado' : 'Nenhum lançamento', q ? 'Tente outra busca.' : 'Use o + para lançar receitas, despesas e compras no cartão.')}
  `;
}
function exportCSV() {
  const rows = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta/Cartão', 'De onde vem / Para onde vai', 'Valor', 'Situação', 'Parcela', 'Observações']];
  const accName = (id) => fin.items.accounts.find((a) => a.id === id)?.name || '';
  const cardName = (id) => fin.items.cards.find((c) => c.id === id)?.name || '';
  const src = sources()[0];
  for (const t of [...fin.items.transactions].filter((x) => !x.skipped).sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([
      t.date, t.kind === 'income' ? 'Receita' : t.kind === 'transfer' ? 'Transferência' : 'Despesa', t.description,
      t.kind === 'transfer' ? '' : categoryOf(src, t.categoryId).name,
      t.cardId ? `Cartão ${cardName(t.cardId)}` : t.kind === 'transfer' ? `${accName(t.accountId)} → ${accName(t.toAccountId)}` : accName(t.accountId),
      t.party, csvMoney(t.kind === 'expense' ? -t.amount : t.amount), t.paid ? 'Feito' : 'Pendente',
      t.installments ? `${t.installment}/${t.installments}` : '', t.notes,
    ]);
  }
  downloadCSV(`financas-${todayISO()}.csv`, rows);
}

// ---------------------------------------------------------------------------
// Planejar: fixos e orçamento
// ---------------------------------------------------------------------------
function planejar() {
  return html`
    ${largeTitle('Planejar', { actions: eyeBtn() })}
    ${scopeSwitch()}
    ${seg('plan', [{ value: 'fixos', label: 'Fixos' }, { value: 'orcamento', label: 'Orçamento' }], ui.plan)}
    ${ui.plan === 'orcamento' ? orcamento() : fixos()}
  `;
}
function fixos() {
  const t = recurringTotals();
  const key = thisMonth();
  const all = sources().flatMap((src) => src.items.recurring.map((r) => ({ src, r })));
  const status = (src, r) => {
    if (!recurringHits(r, key)) return html`<span class="fin-pill gray">não cai este mês</span>`;
    if (r.cardId) return html`<span class="fin-pill gray">no cartão</span>`;
    const t2 = src.items.transactions.find((x) => x.recurringId === r.id && x.period === key);
    if (t2?.skipped) return html`<span class="fin-pill gray">pulado</span>`;
    if (t2 || fulfilledRecurring(src, key).has(r.id)) return html`<span class="fin-pill green">${r.kind === 'income' ? 'recebido' : 'pago'}</span>`;
    return html`<span class="fin-pill ${`${key}-${String(r.day).padStart(2, '0')}` < todayISO() ? 'red' : 'orange'}">${r.kind === 'income' ? 'a receber' : 'a pagar'}</span>`;
  };
  const row = ({ src, r }) => {
    const c = categoryOf(src, r.categoryId);
    const card = r.cardId ? src.items.cards.find((x) => x.id === r.cardId) : null;
    return html`<button type="button" class="fin-row ${r.active === false ? 'off' : ''}" data-act="rec" data-id="${r.id}" data-owner="${src.owner}">
      ${bubble(c)}
      <span class="fin-row-main"><span class="fin-row-title">${r.description}${r.owner === 'partner' || src.owner === 'partner' ? html`<span class="fin-owner">${partnerName().slice(0, 1)}</span>` : ''}</span>
        <span class="fin-row-meta">${FREQ_LABEL(r)}, dia ${r.day}${card ? ` · 💳 ${card.name}` : ''}${r.party ? ` · ${r.party}` : ''}${r.variable ? ' · valor varia' : ''}${r.active === false ? ' · pausado' : ''}</span></span>
      <span class="fin-row-end"><span class="fin-row-amt ${r.kind}">${amt(r.amount)}</span>${r.active === false ? '' : status(src, r)}</span>
    </button>`;
  };
  const inc = all.filter((x) => x.r.kind === 'income');
  const exp = all.filter((x) => x.r.kind === 'expense');
  const ratio = t.income > 0 ? t.expense / t.income : 0;
  return html`
    <section class="fin-card fin-fixed-sum">
      <div class="fin-fixed">
        <div><span class="fin-label">Renda fixa</span><strong class="pos">${amt(t.income)}</strong></div>
        <div><span class="fin-label">Gastos fixos</span><strong class="neg">${amt(t.expense)}</strong></div>
        <div><span class="fin-label">Sobra</span><strong>${amt(t.free)}</strong></div>
      </div>
      ${t.income > 0 ? html`${meter(ratio, ratio > 0.7 ? 'var(--f-red)' : ratio > 0.5 ? 'var(--f-orange)' : 'var(--f-green)')}<small class="fin-muted">${Math.round(ratio * 100)}% da renda fixa já tem destino todo mês${ratio > 0.5 ? ' (o ideal é ficar abaixo de 50%)' : ''}.</small>` : ''}
    </section>
    <section class="fin-section">
      <div class="fin-section-head"><h2>Receitas fixas</h2><button type="button" class="fin-link" data-act="new-rec" data-v="income">${icon('plus')} Adicionar</button></div>
      ${inc.length ? html`<div class="fin-card fin-list">${inc.map(row)}</div>` : emptyCard('up', 'Quanto você ganha?', 'Cadastre o salário e outras rendas: de onde vem, quanto e em que dia cai.', html`<button type="button" class="fin-btn" data-act="new-rec" data-v="income">Adicionar receita fixa</button>`)}
    </section>
    <section class="fin-section">
      <div class="fin-section-head"><h2>Gastos fixos</h2><button type="button" class="fin-link" data-act="new-rec" data-v="expense">${icon('plus')} Adicionar</button></div>
      ${exp.length ? html`<div class="fin-card fin-list">${exp.sort((a, b) => b.r.amount - a.r.amount).map(row)}</div>` : emptyCard('repeat', 'Gastos que se repetem', 'Aluguel, condomínio, luz, internet, academia, assinaturas… Cada mês eles aparecem como previstos.', html`<button type="button" class="fin-btn" data-act="new-rec" data-v="expense">Adicionar gasto fixo</button>`)}
    </section>
  `;
}
function orcamento() {
  const s = monthSummary(ui.month);
  const withBudget = s.categories.filter((g) => g.budget > 0);
  const without = s.categories.filter((g) => !g.budget && g.total > 0);
  const totalB = sum(withBudget, (g) => g.budget), spentB = sum(withBudget, (g) => g.total);
  const mine = new Set(fin.items.categories.map((c) => c.id));
  const row = (g) => {
    const r = g.budget ? g.total / g.budget : 0;
    const color = !g.budget ? 'var(--f-blue)' : r > 1 ? 'var(--f-red)' : r > 0.8 ? 'var(--f-orange)' : 'var(--f-green)';
    const editable = !g.cat.virtual && mine.has(g.cat.id);
    return html`<button type="button" class="fin-budget-row" ${editable ? html`data-act="cat" data-id="${g.cat.id}"` : raw('disabled')}>
      <span class="fin-budget-top">${bubble(g.cat, 'sm')}<span class="fin-budget-name">${g.cat.name}</span><span class="fin-budget-val">${amt(g.total)}${g.budget ? html`<small> de ${amt(g.budget)}</small>` : ''}</span></span>
      ${g.budget ? meter(r, color) : ''}
      ${g.budget ? html`<small class="${r > 1 ? 'red' : 'fin-muted'}">${r > 1 ? html`Passou ${amt(g.total - g.budget)}` : html`Restam ${amt(g.budget - g.total)}`}</small>` : ''}
    </button>`;
  };
  return html`
    ${monthNav()}
    ${withBudget.length ? html`<section class="fin-card fin-hero small">
      <span class="fin-label">Orçamento do mês</span>
      <strong class="fin-hero-amt">${amt(spentB)} <small>de ${amt(totalB)}</small></strong>
      ${meter(totalB ? spentB / totalB : 0, spentB > totalB ? 'var(--f-red)' : 'var(--f-green)')}
    </section>
    <section class="fin-section"><div class="fin-section-head"><h2>Com limite</h2></div><div class="fin-card fin-list">${withBudget.map(row)}</div></section>`
      : emptyCard('target', 'Defina limites por categoria', 'Ex.: Mercado R$ 1.200, Restaurantes R$ 400. Toque numa categoria abaixo para colocar o limite.')}
    ${without.length ? html`<section class="fin-section"><div class="fin-section-head"><h2>Sem limite</h2></div><div class="fin-card fin-list">${without.map(row)}</div></section>` : ''}
    <section class="fin-section"><div class="fin-section-head"><h2>Todas as categorias</h2><a href="#/fin/categorias">Gerenciar</a></div>
      <div class="fin-card fin-list">${myCategories('expense').filter((c) => !s.categories.some((g) => g.cat.id === c.id || g.cat.name === c.name)).map((c) => html`<button type="button" class="fin-row" data-act="cat" data-id="${c.id}">${bubble(c)}<span class="fin-row-main"><span class="fin-row-title">${c.name}</span><span class="fin-row-meta">${c.budget ? `Limite ${money(c.budget)}` : 'Sem gastos neste mês'}</span></span>${icon('chevron')}</button>`)}</div>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Cartões
// ---------------------------------------------------------------------------
function cartoes() {
  const list = sources().flatMap((src) => src.items.cards.map((card) => ({ src, card })));
  if (!list.length) {
    return html`${largeTitle('Cartões', { actions: eyeBtn() })}${scopeSwitch()}
      ${emptyCard('card', 'Nenhum cartão', 'Cadastre seus cartões com o dia de fechamento e de vencimento. As compras e parcelas caem na fatura certa sozinhas.', html`<button type="button" class="fin-btn" data-act="new-card">Cadastrar cartão</button>`)}`;
  }
  const cur = list.find((x) => x.card.id === ui.cardId) || list[0];
  ui.cardId = cur.card.id;
  const { src, card } = cur;
  const key = ui.cardKey && ui.cardKey.startsWith(`${card.id}:`) ? ui.cardKey.split(':')[1] : currentInvoiceKey(card);
  const items = invoiceEntries(src, card, key);
  const total = invoiceTotal(src, card, key);
  const paid = card.paidInvoices?.[key];
  const due = invoiceDue(card, key), closing = invoiceClosing(card, key);
  const today = todayISO();
  const st = paid ? ['green', 'Paga'] : due < today ? ['red', 'Vencida'] : closing <= today ? ['orange', 'Fechada'] : ['blue', 'Aberta'];
  const used = cardUsed(src, card);
  const limit = Number(card.limit) || 0;
  const mine = src.owner === 'me';
  return html`
    ${largeTitle('Cartões', { actions: html`${eyeBtn()}${mine || !isCouple() ? html`<button type="button" class="fin-round" data-act="new-card" aria-label="Novo cartão" title="Novo cartão">${icon('plus')}</button>` : ''}` })}
    ${scopeSwitch()}
    <div class="fin-cards-strip">${list.map(({ src: s2, card: c }) => html`<button type="button" class="fin-cc ${c.id === card.id ? 'on' : ''}" style="--c:${c.color || '#1C1C1E'}" data-act="pick-card" data-id="${c.id}">
      <span class="fin-cc-name">${c.name}${s2.owner === 'partner' ? ` · ${partnerName()}` : ''}</span>
      <span class="fin-cc-amt">${amt(invoiceTotal(s2, c, currentInvoiceKey(c)))}</span>
      <span class="fin-cc-meta">fecha dia ${c.closingDay} · vence dia ${c.dueDay}</span>
    </button>`)}</div>
    ${limit ? html`<section class="fin-card fin-limit">
      <div class="fin-limit-row"><span class="fin-label">Limite usado</span><span>${amt(used)} <small>de ${amt(limit)}</small></span></div>
      ${meter(used / limit, used / limit > 0.9 ? 'var(--f-red)' : used / limit > 0.7 ? 'var(--f-orange)' : 'var(--f-blue)')}
      <small class="fin-muted">Disponível: ${amt(Math.max(0, limit - used))}</small>
    </section>` : ''}
    <div class="fin-month">
      <button type="button" class="fin-round sm" data-act="inv" data-d="-1" aria-label="Fatura anterior">${icon('back')}</button>
      <span class="fin-month-label">Fatura de ${monthLabel(key)}</span>
      <button type="button" class="fin-round sm" data-act="inv" data-d="1" aria-label="Próxima fatura">${icon('chevron')}</button>
    </div>
    <section class="fin-card fin-invoice">
      <div class="fin-invoice-top">
        <div><span class="fin-label">Total da fatura</span><strong class="fin-hero-amt">${amt(total)}</strong></div>
        <span class="fin-pill ${st[0]}">${st[1]}</span>
      </div>
      <div class="fin-invoice-dates"><span>Fecha <b>${fmtDate(closing)}</b></span><span>Vence <b>${fmtDate(due)}</b></span></div>
      ${paid && typeof paid === 'object' ? html`<small class="fin-muted">Paga em ${fmtDate(paid.date)}${paid.amount != null ? ` · ${money(paid.amount)}` : ''}</small>` : ''}
      ${mine ? html`<div class="fin-invoice-actions">
        ${paid ? html`<button type="button" class="fin-btn ghost" data-act="inv-reopen">Desfazer pagamento</button>` : total > 0 ? html`<button type="button" class="fin-btn" data-act="inv-pay">Pagar fatura</button>` : ''}
        <button type="button" class="fin-btn ghost" data-act="card-buy">${icon('plus')} Compra</button>
        <button type="button" class="fin-btn ghost" data-act="card-edit">${icon('edit')} Cartão</button>
      </div>` : ''}
    </section>
    ${items.length ? html`<section class="fin-section"><div class="fin-section-head"><h2>Compras</h2><span class="fin-muted">${items.length}</span></div>
      <div class="fin-card fin-list">${items.map((e) => entryRow({ ...e, month: key }, { showDate: true }))}</div></section>`
      : emptyCard('card', 'Fatura vazia', 'Nenhuma compra nesta fatura.')}
  `;
}

// ---------------------------------------------------------------------------
// Mais e subtelas
// ---------------------------------------------------------------------------
function mais() {
  const accs = accountBalances().filter((b) => b.owner === 'me');
  const item = (href, ic, cls, label, detail = '') => html`<a class="fin-row" href="${href}"><span class="fin-add-ic sm ${cls}">${icon(ic)}</span><span class="fin-row-main"><span class="fin-row-title">${label}</span></span><span class="fin-row-detail">${detail}</span>${icon('chevron')}</a>`;
  return html`
    ${largeTitle('Mais')}
    <div class="fin-card fin-list">
      ${item('#/fin/contas', 'bank', 'blue', 'Contas', html`${accs.length} · ${amt(sum(accs, (b) => b.balance))}`)}
      ${item('#/fin/cartoes', 'card', 'ink', 'Cartões', String(fin.items.cards.length))}
      ${item('#/fin/categorias', 'tag', 'orange', 'Categorias', String(fin.items.categories.length))}
      ${item('#/fin/metas', 'target', 'purple', 'Metas', String(fin.items.goals.length))}
      ${item('#/fin/relatorios', 'chart', 'green', 'Relatórios')}
    </div>
    <div class="fin-card fin-list">
      ${item('#/fin/ajustes', 'settings', 'gray', 'Ajustes', fin.partner ? (fin.settings.shareWithCouple === false ? 'Privado' : 'Visão do casal') : '')}
      <button type="button" class="fin-row" data-act="export"><span class="fin-add-ic sm gray">${icon('download')}</span><span class="fin-row-main"><span class="fin-row-title">Exportar planilha (CSV)</span></span>${icon('chevron')}</button>
    </div>
    <div class="fin-card fin-list">
      ${item('#/inicio', 'heart', 'pink', 'Casamento', 'Planejamento')}
    </div>
    <div class="fin-card fin-list">
      <button type="button" class="fin-row" data-act="logout"><span class="fin-add-ic sm red">${icon('logout')}</span><span class="fin-row-main"><span class="fin-row-title red">Sair</span></span><span class="fin-row-detail">${state.user?.name || ''}</span></button>
    </div>
  `;
}

function contas() {
  const list = accountBalances();
  const total = sum(list.filter((b) => b.account.includeInTotal !== false), (b) => b.balance);
  const type = (t) => ACCOUNT_TYPES.find((x) => x.value === t)?.label || 'Conta';
  return html`
    ${largeTitle('Contas', { back: '#/fin/mais', actions: html`${eyeBtn()}<button type="button" class="fin-round" data-act="new-account" aria-label="Nova conta" title="Nova conta">${icon('plus')}</button>` })}
    ${scopeSwitch()}
    <section class="fin-card fin-hero small"><span class="fin-label">Saldo total</span><strong class="fin-hero-amt ${total < 0 ? 'neg' : ''}">${amt(total)}</strong></section>
    <div class="fin-card fin-list">${list.map((b) => html`<button type="button" class="fin-row" ${b.owner === 'me' ? html`data-act="account" data-id="${b.account.id}"` : raw('disabled')}>
      <span class="fin-bubble" style="--c:${b.account.color || '#007AFF'}">${b.account.type === 'carteira' ? '👛' : b.account.type === 'investimento' ? '📈' : b.account.type === 'poupanca' ? '🐷' : b.account.type === 'beneficio' ? '🍽️' : '🏦'}</span>
      <span class="fin-row-main"><span class="fin-row-title">${b.account.name}${b.owner === 'partner' ? html`<span class="fin-owner">${partnerName().slice(0, 1)}</span>` : ''}</span><span class="fin-row-meta">${type(b.account.type)}${b.account.includeInTotal === false ? ' · fora do total' : ''}</span></span>
      <span class="fin-row-end"><span class="fin-row-amt ${b.balance < 0 ? 'expense' : ''}">${amt(b.balance)}</span></span>
    </button>`)}</div>
    <div class="fin-actions-row">
      <button type="button" class="fin-btn ghost" data-act="transfer">${icon('swap')} Transferir entre contas</button>
    </div>
    <p class="fin-foot">O saldo é o "saldo hoje" informado no cadastro mais tudo o que já foi recebido ou pago: lançamentos, transferências, faturas pagas${fin.settings.weddingAccountId ? ' e os pagamentos do casamento' : ''}.</p>
  `;
}

function categorias() {
  const list = myCategories(ui.catKind);
  return html`
    ${largeTitle('Categorias', { back: '#/fin/mais', actions: html`<button type="button" class="fin-round" data-act="new-cat" aria-label="Nova categoria" title="Nova categoria">${icon('plus')}</button>` })}
    ${seg('cat', [{ value: 'expense', label: 'Despesas' }, { value: 'income', label: 'Receitas' }], ui.catKind)}
    <div class="fin-card fin-list">${list.map((c) => html`<button type="button" class="fin-row" data-act="cat" data-id="${c.id}">${bubble(c)}<span class="fin-row-main"><span class="fin-row-title">${c.name}</span>${c.budget ? html`<span class="fin-row-meta">Limite de ${money(c.budget)} por mês</span>` : ''}</span>${icon('chevron')}</button>`)}</div>
    ${ui.catKind === 'expense' ? html`<p class="fin-foot">${WEDDING_CAT.emoji} "Casamento" é automática: recebe as parcelas dos fornecedores.</p>` : ''}
  `;
}

function metas() {
  const list = sources().flatMap((src) => src.items.goals.map((g) => ({ src, g })));
  const today = todayISO();
  return html`
    ${largeTitle('Metas', { back: '#/fin/mais', actions: html`${eyeBtn()}<button type="button" class="fin-round" data-act="new-goal" aria-label="Nova meta" title="Nova meta">${icon('plus')}</button>` })}
    ${scopeSwitch()}
    ${list.length ? html`<div class="fin-goals">${list.map(({ src, g }) => {
      const saved = Number(g.saved) || 0, target = Number(g.target) || 0;
      const r = target ? saved / target : 0;
      let perMonth = '';
      if (g.deadline && g.deadline > today && saved < target) {
        const months = Math.max(1, Math.round((new Date(`${g.deadline}T12:00`) - new Date(`${today}T12:00`)) / (30.44 * 86400e3)));
        perMonth = html`Guarde ${amt((target - saved) / months)} por mês até ${fmtDate(g.deadline, { month: 'short', year: 'numeric' }).replace('.', '')}`;
      }
      return html`<article class="fin-card fin-goal">
        <div class="fin-goal-top"><span class="fin-goal-emoji">${g.emoji || '🎯'}</span><div><strong>${g.name}${src.owner === 'partner' ? html`<span class="fin-owner">${partnerName().slice(0, 1)}</span>` : ''}</strong><small>${amt(saved)} de ${amt(target)}</small></div><span class="fin-goal-pct">${Math.round(Math.min(1, r) * 100)}%</span></div>
        ${meter(r, g.color || 'var(--f-green)')}
        <small class="fin-muted">${r >= 1 ? '🎉 Meta alcançada!' : perMonth || html`Faltam ${amt(Math.max(0, target - saved))}`}</small>
        ${src.owner === 'me' ? html`<div class="fin-invoice-actions"><button type="button" class="fin-btn" data-act="goal-dep" data-id="${g.id}">Guardar</button><button type="button" class="fin-btn ghost" data-act="goal-edit" data-id="${g.id}">${icon('edit')} Editar</button></div>` : ''}
      </article>`;
    })}</div>` : emptyCard('target', 'Nenhuma meta ainda', 'Reserva de emergência, viagem, apartamento… Crie uma meta e vá registrando o que guarda.', html`<button type="button" class="fin-btn" data-act="new-goal">Criar meta</button>`)}
  `;
}

function relatorios() {
  const h = history(12, ui.month);
  const closed = h.filter((d) => d.key < thisMonth()).slice(-6);
  const avgInc = closed.length ? sum(closed, (d) => d.income) / closed.length : 0;
  const avgExp = closed.length ? sum(closed, (d) => d.expense) / closed.length : 0;
  const s = monthSummary(ui.month);
  const cats = s.categories.filter((g) => g.total > 0);
  const parties = new Map();
  for (const e of s.entries) if (e.kind === 'expense') { const k = e.party || '(sem destino)'; parties.set(k, (parties.get(k) || 0) + e.amount); }
  const topParties = [...parties.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const fixed = sum(s.entries.filter((e) => e.kind === 'expense' && (e.rec || e.recurringId)), (e) => e.amount);
  const variable = s.expense.total - fixed;
  const proj = [];
  let bal = totalBalance();
  for (let i = 0; i < 6; i++) {
    const k = addMonths(thisMonth(), i);
    const m = monthSummary(k);
    bal += (m.income.total - m.income.done) - (m.expense.total - m.expense.done);
    proj.push({ key: k, bal });
  }
  const maxProj = Math.max(1, ...proj.map((p) => Math.abs(p.bal)));
  return html`
    ${largeTitle('Relatórios', { back: '#/fin/mais', actions: eyeBtn() })}
    ${scopeSwitch()}
    <section class="fin-section"><div class="fin-section-head"><h2>Últimos 12 meses</h2></div>
      <div class="fin-card">
        ${bars(h)}
        <div class="fin-legend"><span><i class="inc"></i>Receitas</span><span><i class="exp"></i>Despesas</span></div>
        ${closed.length ? html`<div class="fin-fixed top-line">
          <div><span class="fin-label">Média de receitas</span><strong class="pos">${amt(avgInc)}</strong></div>
          <div><span class="fin-label">Média de gastos</span><strong class="neg">${amt(avgExp)}</strong></div>
          <div><span class="fin-label">Média que sobra</span><strong>${amt(avgInc - avgExp)}</strong></div>
        </div><small class="fin-muted">Média dos últimos ${closed.length} meses fechados.</small>` : ''}
      </div>
    </section>
    <section class="fin-section"><div class="fin-section-head"><h2>Saldo previsto</h2></div>
      <div class="fin-card fin-proj">${proj.map((p) => html`<div class="fin-proj-row"><span>${monthLabel(p.key, { short: true })}</span><span class="fin-proj-bar"><span class="${p.bal < 0 ? 'neg' : ''}" style="width:${(Math.abs(p.bal) / maxProj) * 100}%"></span></span><b class="${p.bal < 0 ? 'neg' : ''}">${amt(p.bal)}</b></div>`)}
        <small class="fin-muted">Saldo de hoje + receitas e gastos previstos (fixos, parcelas, faturas e casamento) até o fim de cada mês.</small></div>
    </section>
    ${monthNav()}
    <section class="fin-section"><div class="fin-section-head"><h2>Gastos por categoria</h2></div>
      ${cats.length ? html`<div class="fin-card fin-cats">
        ${donut(cats.map((g) => ({ value: g.total, color: g.cat.color })), { center: html`<small>Total</small><strong>${amt(s.expense.total)}</strong>` })}
        <div class="fin-cat-list">${cats.map((g) => html`<div class="fin-cat-item">${bubble(g.cat, 'sm')}<span class="fin-cat-name">${g.cat.name}</span><span class="fin-cat-val">${amt(g.total)}<small>${Math.round((g.total / s.expense.total) * 100)}%</small></span></div>`)}</div>
      </div>` : emptyCard('pie', 'Sem gastos neste mês', '')}
    </section>
    ${s.expense.total > 0 ? html`<section class="fin-section"><div class="fin-section-head"><h2>Fixos x variáveis</h2></div>
      <div class="fin-card">
        <div class="fin-split"><span class="fixed" style="flex:${fixed || 0.0001}"></span><span class="var" style="flex:${variable || 0.0001}"></span></div>
        <div class="fin-legend"><span><i class="fixed"></i>Fixos ${amt(fixed)}</span><span><i class="var"></i>Variáveis ${amt(variable)}</span></div>
      </div></section>` : ''}
    ${topParties.length ? html`<section class="fin-section"><div class="fin-section-head"><h2>Para onde vai</h2></div>
      <div class="fin-card fin-list">${topParties.map(([p, v]) => html`<div class="fin-row static"><span class="fin-row-main"><span class="fin-row-title">${p}</span></span><span class="fin-row-amt">${amt(v)}</span></div>`)}</div></section>` : ''}
  `;
}

function ajustes() {
  const st = fin.settings;
  const sw = (name, on, label, hint) => html`<label class="fin-switch-row"><span class="fin-row-main"><span class="fin-row-title">${label}</span>${hint ? html`<span class="fin-row-meta">${hint}</span>` : ''}</span><input type="checkbox" class="fin-switch" data-set="${name}" ${on ? raw('checked') : ''}></label>`;
  return html`
    ${largeTitle('Ajustes', { back: '#/fin/mais' })}
    ${fin.partner ? html`<section class="fin-section"><div class="fin-section-head"><h2>Visão do casal</h2></div>
      <div class="fin-card fin-list">${sw('shareWithCouple', st.shareWithCouple !== false, `Mostrar minhas finanças para ${partnerName()}`, `Em "Do casal", ${partnerName()} vê suas contas, lançamentos, cartões e metas (só para ler). Desligado, suas finanças ficam só com você.`)}</div>
      <p class="fin-foot">${fin.partner.shared ? `${partnerName()} compartilha as finanças com você.` : `${partnerName()} não compartilha as finanças com você.`}</p></section>` : ''}
    <section class="fin-section"><div class="fin-section-head"><h2>Casamento</h2></div>
      <div class="fin-card fin-list">
        ${sw('weddingInPersonal', st.weddingInPersonal !== false, 'Pagamentos do casamento nas minhas finanças', 'As parcelas dos fornecedores entram como despesas da categoria Casamento. Na visão do casal elas sempre entram, uma vez só.')}
        <label class="fin-switch-row"><span class="fin-row-main"><span class="fin-row-title">Conta que paga o casamento</span><span class="fin-row-meta">Os pagamentos já feitos saem do saldo desta conta. Escolha só em uma das duas contas do casal.</span></span>
          <select class="fin-select" data-set="weddingAccountId"><option value="">Nenhuma</option>${fin.items.accounts.map((a) => html`<option value="${a.id}" ${a.id === st.weddingAccountId ? raw('selected') : ''}>${a.name}</option>`)}</select>
        </label>
      </div>
    </section>
    <p class="fin-foot">Família e assessoria do casamento não têm acesso às finanças.</p>
  `;
}

// ---------------------------------------------------------------------------
// Rotas e eventos
// ---------------------------------------------------------------------------
export const FIN_ROUTES = {
  '': { title: 'Finanças', tab: '', render: home },
  extrato: { title: 'Extrato', tab: 'extrato', render: extrato },
  planejar: { title: 'Planejar', tab: 'planejar', render: planejar },
  cartoes: { title: 'Cartões', tab: 'cartoes', render: cartoes },
  mais: { title: 'Mais', tab: 'mais', render: mais },
  contas: { title: 'Contas', tab: 'mais', render: contas },
  categorias: { title: 'Categorias', tab: 'mais', render: categorias },
  metas: { title: 'Metas', tab: 'mais', render: metas },
  relatorios: { title: 'Relatórios', tab: 'mais', render: relatorios },
  ajustes: { title: 'Ajustes', tab: 'mais', render: ajustes },
};

// Encontra um movimento pelo id mostrado na tela (o mês ajuda a achar os previstos e as compras).
function findEntry(id, month) {
  if (id.startsWith('inv:')) {
    const [, cardId, key] = id.split(':');
    for (const src of sources()) { const card = src.items.cards.find((c) => c.id === cardId); if (card) return { invoiceOf: card, invoice: key, owner: src.owner, src }; }
    return null;
  }
  const months = [month, ui.month, thisMonth(), addMonths(thisMonth(), 1), addMonths(thisMonth(), -1)].filter(Boolean);
  for (const k of months) { const e = monthEntries(k).find((x) => x.id === id); if (e) return e; }
  if (ui.cardId) {
    for (const src of sources()) {
      const card = src.items.cards.find((c) => c.id === ui.cardId);
      if (!card) continue;
      const key = ui.cardKey.split(':')[1] || currentInvoiceKey(card);
      const e = invoiceEntries(src, card, key).find((x) => x.id === id);
      if (e) return e;
    }
  }
  return null;
}
function openEntry(e) {
  if (!e) return;
  if (e.invoiceOf) { ui.cardId = e.invoiceOf.id; ui.cardKey = `${e.invoiceOf.id}:${e.invoice}`; location.hash = '#/fin/cartoes'; return; }
  if (e.readonly || e.owner !== 'me') { entryInfo(e); return; }
  if (e.virtual) { if (e.auto || e.card) recurringForm(e.rec); else confirmOccurrence(e); return; }
  txForm(e.tx);
}

export function mountFin(el, emitView) {
  el.onclick = (ev) => {
    const a = ev.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    const id = a.dataset.id;
    switch (act) {
      case 'hide': toggleHidden(); break;
      case 'scope': setScope(a.dataset.v); break;
      case 'month': ui.month = addMonths(ui.month, Number(a.dataset.d)); emitView(); break;
      case 'month-today': ui.month = thisMonth(); emitView(); break;
      case 'seg': if (a.dataset.group === 'plan') ui.plan = a.dataset.v; else if (a.dataset.group === 'cat') ui.catKind = a.dataset.v; emitView(); break;
      case 'seg-plan': ui.plan = a.dataset.v; break; // o link segue para #/fin/planejar
      case 'ext-filter': ui.ext = a.dataset.v; if (location.hash.startsWith('#/fin/extrato')) emitView(); break;
      case 'entry': openEntry(findEntry(id, a.dataset.month)); break;
      case 'quick-pay': {
        ev.stopPropagation();
        const e = findEntry(id, a.dataset.month);
        if (!e) break;
        if (e.invoiceOf) payInvoiceForm(e.invoiceOf, e.invoice);
        else if (e.virtual) confirmOccurrence(e);
        else if (e.tx) run(() => markPaid(e.tx));
        break;
      }
      case 'rec': {
        const src = sources().find((s) => s.owner === a.dataset.owner);
        const r = src?.items.recurring.find((x) => x.id === id);
        if (!r) break;
        if (src.owner === 'me') recurringForm(r);
        else toast(`Fixo de ${partnerName()}: só ${partnerName()} pode editar.`);
        break;
      }
      case 'new-rec': recurringForm({}, { kind: a.dataset.v }); break;
      case 'cat': { const c = fin.items.categories.find((x) => x.id === id); if (c) categoryForm(c); break; }
      case 'new-cat': categoryForm({}, { kind: ui.catKind }); break;
      case 'account': { const acc = fin.items.accounts.find((x) => x.id === id); if (acc) accountForm(acc); break; }
      case 'new-account': accountForm(); break;
      case 'transfer': if (fin.items.accounts.length < 2) toast('Cadastre pelo menos duas contas para transferir.', 'error'); else txForm({}, { kind: 'transfer' }); break;
      case 'new-card': cardForm(); break;
      case 'pick-card': ui.cardId = id; ui.cardKey = ''; if (location.hash.startsWith('#/fin/cartoes')) emitView(); break;
      case 'inv': {
        const card = sources().flatMap((s) => s.items.cards).find((c) => c.id === ui.cardId);
        if (!card) break;
        const cur = ui.cardKey.startsWith(`${card.id}:`) ? ui.cardKey.split(':')[1] : currentInvoiceKey(card);
        ui.cardKey = `${card.id}:${addMonths(cur, Number(a.dataset.d))}`;
        emitView();
        break;
      }
      case 'inv-pay': case 'inv-reopen': case 'card-buy': case 'card-edit': {
        const card = fin.items.cards.find((c) => c.id === ui.cardId);
        if (!card) break;
        const key = ui.cardKey.startsWith(`${card.id}:`) ? ui.cardKey.split(':')[1] : currentInvoiceKey(card);
        if (act === 'inv-pay') payInvoiceForm(card, key);
        else if (act === 'inv-reopen') run(() => reopenInvoice(card, key));
        else if (act === 'card-buy') txForm({ cardId: card.id }, { kind: 'expense', card: true });
        else cardForm(card);
        break;
      }
      case 'new-goal': goalForm(); break;
      case 'goal-dep': { const g = fin.items.goals.find((x) => x.id === id); if (g) goalDepositForm(g); break; }
      case 'goal-edit': { const g = fin.items.goals.find((x) => x.id === id); if (g) goalForm(g); break; }
      case 'export': exportCSV(); toast('Planilha baixada'); break;
      case 'logout': window.dispatchEvent(new Event('app:logout')); break;
    }
  };
  el.oninput = (ev) => {
    if (ev.target.id === 'fin-q') { ui.q = ev.target.value; emitView(); }
  };
  el.onchange = (ev) => {
    const k = ev.target.dataset.set;
    if (!k) return;
    const v = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
    run(async () => { await saveFinSettings({ [k]: v }); toast('Ajuste salvo'); });
  };
}

export { fupdate };
