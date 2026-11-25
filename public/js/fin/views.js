// Finanças: telas. Celular: uma coluna, com abas embaixo. Computador (≥1024px): menu lateral, painel em grade
// e listas em formato de tabela (as colunas extras só aparecem na tela larga).
import { fin, setScope, toggleHidden, valuesHidden, saveFinSettings, fupdate } from './data.js';
import {
  thisMonth, addMonths, monthLabel, monthOf, monthSummary, monthEntries, accountBalances, totalBalance, upcoming, history,
  recurringTotals, categoryOf, myCategories, sources, isCouple, partnerName, firstName, FREQ_LABEL, ACCOUNT_TYPES, mySide,
  invoiceDue, invoiceClosing, invoiceEntries, invoiceTotal, currentInvoiceKey, cardUsed, recurringHits, fulfilledRecurring, WEDDING_CAT,
} from './model.js';
import {
  txForm, recurringForm, confirmOccurrence, markPaid, accountForm, cardForm, payInvoiceForm, reopenInvoice, categoryForm,
  goalForm, goalDepositForm, entryInfo,
} from './forms.js';
import { state } from '../store.js';
import { names } from '../domain.js';
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
const initial = () => partnerName().slice(0, 1).toUpperCase() || 'P';
const ownerTag = (owner) => (isCouple() && owner === 'partner' ? html`<span class="fin-owner" title="De ${partnerName()}">${initial()}</span>` : '');
const shortDate = (iso) => fmtDate(iso, { day: '2-digit', month: 'short' }).replace('.', '');

// Cabeçalho: título, mês (no computador fica na mesma linha) e ações.
function pageHead(title, { sub = '', back = '', actions = '', month = false } = {}) {
  return html`<header class="fin-head">
    ${back ? html`<a class="fin-back" href="${back}">${icon('back')}<span>Voltar</span></a>` : ''}
    <div class="fin-head-row">
      <div class="fin-head-title"><h1>${title}</h1>${sub ? html`<p class="fin-sub">${sub}</p>` : ''}</div>
      ${month ? html`<div class="fin-head-tools">${monthNav()}</div>` : ''}
      <div class="fin-head-actions">${eyeBtn()}${actions}</div>
    </div>
    ${coupleBanner()}
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
// Aviso de que a tela está na visão do casal (a chave fica no menu).
function coupleBanner() {
  if (!isCouple()) return '';
  return html`<div class="fin-couple-bar">
    ${icon('users')}<span><b>Visão do casal</b> · você e ${partnerName()}${fin.partner?.shared ? '' : html` <span class="fin-muted">(${partnerName()} ainda não liberou as finanças dele(a))</span>`}</span>
    <button type="button" data-act="scope" data-v="me">Só as minhas</button>
  </div>`;
}
function seg(group, options, current) {
  return html`<div class="fin-seg">${options.map((o) => html`<button type="button" class="${o.value === current ? 'on' : ''}" data-act="seg" data-group="${group}" data-v="${o.value}">${o.label}</button>`)}</div>`;
}
const meter = (ratio, color = 'var(--f-blue)') => html`<div class="fin-meter"><span style="width:${Math.max(0, Math.min(100, ratio * 100))}%;background:${color}"></span></div>`;
const emptyCard = (ic, title, text, action = '') => html`<div class="fin-card fin-empty">${icon(ic)}<strong>${title}</strong>${text ? html`<p>${text}</p>` : ''}${action}</div>`;
const sectionHead = (title, link = '') => html`<div class="fin-section-head"><h2>${title}</h2>${link}</div>`;

function statusOf(e) {
  const late = !e.paid && !e.card && e.date < todayISO();
  if (e.kind === 'transfer') return { label: 'transferência', cls: 'gray' };
  if (e.card) return { label: e.paid ? 'fatura paga' : 'na fatura', cls: e.paid ? 'green' : 'gray' };
  if (e.paid) return { label: e.kind === 'income' ? 'recebido' : 'pago', cls: 'green' };
  if (e.virtual) return { label: late ? 'atrasado' : 'previsto', cls: late ? 'red' : 'gray' };
  return { label: late ? 'atrasado' : 'pendente', cls: late ? 'red' : 'orange' };
}
const canToggle = (e) => e.owner === 'me' && !e.readonly && !e.card && e.kind !== 'transfer' && (e.tx || e.virtual);

// Linha de um movimento. Com { table: true }, ganha as colunas da tabela (só aparecem no computador).
function entryRow(e, { table = false, showDate = false } = {}) {
  const c = e.kind === 'transfer' ? { emoji: '↔️', color: '#8E8E93', name: 'Transferência' } : categoryOf(e.src, e.categoryId);
  const st = statusOf(e);
  const where = e.card ? `💳 ${e.card.name}` : e.kind === 'transfer' ? '' : (e.src.items.accounts.find((a) => a.id === e.accountId)?.name || (e.owner === 'wedding' ? 'Casamento' : ''));
  const meta = [showDate && shortDate(e.date), c.name, e.card && `💳 ${e.card.name}`, e.party, e.shareLabel].filter(Boolean).join(' · ');
  const statusEl = canToggle(e)
    ? html`<button type="button" class="fin-pill fin-pill-btn ${st.cls}" data-act="toggle-paid" data-id="${e.id}" data-month="${e.month || ''}" title="${e.paid ? 'Marcar como pendente' : e.kind === 'income' ? 'Marcar como recebido' : 'Marcar como pago'}">${e.paid ? '✓ ' : ''}${st.label}</button>`
    : html`<span class="fin-pill ${st.cls}">${st.label}</span>`;
  const showPill = !e.paid && !e.card && e.kind !== 'transfer';
  return html`<div class="fin-row ${table ? 'tr' : ''}" role="button" tabindex="0" data-act="entry" data-id="${e.id}" data-month="${e.month || ''}">
    ${bubble(c)}
    <span class="fin-row-main">
      <span class="fin-row-title">${e.description || c.name}${e.recurringId || e.rec ? html`<span class="fin-mini" title="Fixo">${icon('repeat')}</span>` : ''}${ownerTag(e.owner)}</span>
      <span class="fin-row-meta ${table ? 'm-only' : ''}">${meta}</span>
      ${table ? html`<span class="fin-row-meta d-only">${[showDate && shortDate(e.date), e.party, e.installments && `parcela ${e.installment}/${e.installments}`, e.shareLabel].filter(Boolean).join(' · ') || ' '}</span>` : ''}
    </span>
    ${table ? html`<span class="td d-only">${c.name}</span><span class="td d-only">${where}</span><span class="td d-only">${statusEl}</span>` : ''}
    <span class="fin-row-end">
      <span class="fin-row-amt ${e.kind}">${amt(e.amount, { sign: true, kind: e.kind })}</span>
      ${showPill ? html`<span class="${table ? 'm-only' : ''}">${statusEl}</span>` : ''}
    </span>
  </div>`;
}
const tableHead = (cols = ['Descrição', 'Categoria', 'Conta / cartão', 'Situação', 'Valor']) =>
  html`<div class="fin-thead d-only"><span></span>${cols.map((c) => html`<span>${c}</span>`)}</div>`;

// Gráfico de rosca (gastos por categoria).
function donut(parts, { size = 148, stroke = 18, center = '' } = {}) {
  const total = sum(parts, (p) => p.value);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let off = 0;
  const segs = total > 0 ? parts.filter((p) => p.value > 0).map((p) => {
    const len = (p.value / total) * c;
    const s = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${p.color}" stroke-width="${stroke}" stroke-dasharray="${Math.max(0, len - 2)} ${c}" stroke-dashoffset="${-off}"/>`;
    off += len;
    return s;
  }).join('') : '';
  return html`<div class="fin-donut" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--f-track)" stroke-width="${stroke}"/><g transform="rotate(-90 ${size / 2} ${size / 2})">${raw(segs)}</g></svg>
    <div class="fin-donut-center">${center}</div>
  </div>`;
}
// Barras por mês (receitas x despesas).
function bars(data, { height = 170 } = {}) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  return html`<div class="fin-bars" style="height:${height}px" role="img" aria-label="Receitas e despesas por mês">
    ${data.map((d) => html`<button type="button" class="fin-bar-col ${d.key === ui.month ? 'now' : ''}" data-act="goto-month" data-v="${d.key}" title="${monthLabel(d.key)}: receitas ${money(d.income)}, despesas ${money(d.expense)}">
      <span class="fin-bar-pair">
        <span class="fin-bar inc" style="height:${(d.income / max) * 100}%"></span>
        <span class="fin-bar exp" style="height:${(d.expense / max) * 100}%"></span>
      </span>
      <small>${monthLabel(d.key, { short: true })}</small>
    </button>`)}
  </div>`;
}
const legend = (items) => html`<div class="fin-legend">${items.map(([cls, label]) => html`<span><i class="${cls}"></i>${label}</span>`)}</div>`;

// Saldo previsto no fim de um mês (do mês atual em diante): saldo de hoje + o que ainda falta entrar e sair.
function forecast(key) {
  let bal = totalBalance();
  for (let k = thisMonth(); k <= key; k = addMonths(k, 1)) {
    const s = monthSummary(k);
    bal += (s.income.total - s.income.done) - (s.expense.total - s.expense.done);
  }
  return bal;
}

// ---------------------------------------------------------------------------
// Início (painel)
// ---------------------------------------------------------------------------
function home() {
  const key = ui.month;
  const now = thisMonth();
  const s = monthSummary(key);
  const name = firstName(state.user?.name);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const bal = totalBalance();
  const cats = s.categories.filter((g) => g.total > 0);
  const topCats = cats.slice(0, 7);
  const next = upcoming(30).slice(0, 8);
  const recT = recurringTotals();
  const cards = sources().flatMap((src) => src.items.cards.map((card) => ({ src, card })));
  const goals = sources().flatMap((src) => src.items.goals.map((g) => ({ src, g })));
  const over = s.categories.filter((g) => g.budget > 0 && g.total > g.budget);
  const flow = history(6, key > now ? key : now);
  const committed = s.income.total > 0 ? s.expense.total / s.income.total : 0;
  const recent = monthEntries(key).filter((e) => !e.virtual).slice(-6).reverse();

  return html`
    ${pageHead(isCouple() ? 'Finanças do casal' : 'Finanças', { sub: `${hello}${name ? `, ${name}` : ''}`, month: true, actions: html`<a class="fin-round m-only" href="#/inicio" title="Casamento" aria-label="Abrir o casamento">${icon('heart')}</a>` })}
    <div class="fin-home">
      <section class="h-kpis">
        <a class="fin-card fin-kpi fin-kpi-hero" href="#/fin/contas">
          <span class="fin-label">Saldo em contas ${icon('chevron')}</span>
          <strong class="fin-kpi-amt ${bal < 0 ? 'neg' : ''}">${amt(bal)}</strong>
          <small>${key >= now ? html`Previsto no fim de ${monthLabel(key).replace(/ de \d+$/, '').toLowerCase()}: <b>${amt(forecast(key))}</b>` : html`Resultado do mês: <b class="${s.balance < 0 ? 'neg' : 'pos'}">${amt(s.balance, { sign: true })}</b>`}</small>
        </a>
        <a class="fin-card fin-kpi" href="#/fin/extrato" data-act="ext-filter" data-v="receitas">
          <span class="fin-kpi-ic green">${icon('up')}</span>
          <span class="fin-label">Receitas</span>
          <strong class="fin-kpi-amt">${amt(s.income.total)}</strong>
          <small>${s.income.total - s.income.done > 0.005 ? html`${amt(s.income.done)} recebido · falta ${amt(s.income.total - s.income.done)}` : 'tudo recebido'}</small>
        </a>
        <a class="fin-card fin-kpi" href="#/fin/extrato" data-act="ext-filter" data-v="despesas">
          <span class="fin-kpi-ic red">${icon('down')}</span>
          <span class="fin-label">Despesas</span>
          <strong class="fin-kpi-amt">${amt(s.expense.total)}</strong>
          <small>${s.expense.total - s.expense.done > 0.005 ? html`${amt(s.expense.done)} pago · falta ${amt(s.expense.total - s.expense.done)}` : 'tudo pago'}</small>
        </a>
        <div class="fin-card fin-kpi">
          <span class="fin-kpi-ic ${s.balance < 0 ? 'red' : 'blue'}">${icon('wallet')}</span>
          <span class="fin-label">${s.balance >= 0 ? 'Sobra no mês' : 'Falta no mês'}</span>
          <strong class="fin-kpi-amt ${s.balance < 0 ? 'neg' : 'pos'}">${amt(s.balance, { sign: true })}</strong>
          ${s.income.total > 0 ? html`${meter(committed, committed > 1 ? 'var(--f-red)' : committed > 0.85 ? 'var(--f-orange)' : 'var(--f-green)')}<small>${Math.round(committed * 100)}% da renda comprometida</small>` : html`<small>Cadastre suas receitas</small>`}
        </div>
      </section>

      ${over.length ? html`<div class="fin-card fin-notice warn h-full">${icon('alert')}<span>Passou do limite em <b>${over.map((g) => g.cat.name).join(', ')}</b>. <a href="#/fin/planejar" data-act="seg-plan" data-v="orcamento">Ver orçamento</a></span></div>` : ''}

      <div class="h-left">
      <section class="h-flow">
        ${sectionHead('Entradas e saídas', html`<a href="#/fin/relatorios">Relatórios</a>`)}
        <div class="fin-card">${bars(flow, { height: 150 })}${legend([['inc', 'Receitas'], ['exp', 'Despesas']])}</div>
      </section>
      <section class="h-cats">
        ${sectionHead('Gastos por categoria', html`<a href="#/fin/planejar" data-act="seg-plan" data-v="orcamento">Orçamento</a>`)}
        ${topCats.length ? html`<div class="fin-card fin-cats">
          ${donut(topCats.map((g) => ({ value: g.total, color: g.cat.color })), { center: html`<small>Gastos</small><strong>${amt(s.expense.total)}</strong>` })}
          <div class="fin-cat-list">${topCats.map((g) => html`<div class="fin-cat-item">
            ${bubble(g.cat, 'sm')}
            <span class="fin-cat-name">${g.cat.name}${g.budget ? html`<small class="${g.total > g.budget ? 'red' : ''}">${Math.round((g.total / g.budget) * 100)}% do limite</small>` : ''}</span>
            <span class="fin-cat-val">${amt(g.total)}<small>${s.expense.total ? Math.round((g.total / s.expense.total) * 100) : 0}%</small></span>
          </div>`)}</div>
        </div>` : emptyCard('pie', 'Nenhum gasto neste mês', 'Use o botão + para lançar uma despesa.')}
      </section>
      <section class="h-recent">
        ${sectionHead('Últimos lançamentos', html`<a href="#/fin/extrato" data-act="ext-filter" data-v="tudo">Extrato</a>`)}
        ${recent.length ? html`<div class="fin-card fin-list">${recent.map((e) => entryRow(e, { showDate: true }))}</div>` : emptyCard('list', 'Nada lançado neste mês', '')}
      </section>
      </div>
      <div class="h-right">
      <section class="h-next">
        ${sectionHead('A pagar e a receber', html`<a href="#/fin/extrato" data-act="ext-filter" data-v="pendentes">Ver todos</a>`)}
        ${next.length ? html`<div class="fin-card fin-list">${next.map(upcomingRow)}</div>` : emptyCard('tick', 'Nada pendente', 'Nos próximos 30 dias não há contas a pagar nem a receber.')}
      </section>
      <section class="h-cards">
        ${sectionHead('Cartões', html`<a href="#/fin/cartoes">Faturas</a>`)}
        ${cards.length ? html`<div class="fin-card fin-list">${cards.map(({ src, card }) => {
          const k = currentInvoiceKey(card);
          const total = invoiceTotal(src, card, k);
          const limit = Number(card.limit) || 0;
          return html`<a class="fin-row" href="#/fin/cartoes" data-act="pick-card" data-id="${card.id}">
            <span class="fin-bubble" style="--c:${card.color || '#1C1C1E'}">💳</span>
            <span class="fin-row-main"><span class="fin-row-title">${card.name}${ownerTag(src.owner)}</span><span class="fin-row-meta">Vence ${shortDate(invoiceDue(card, k))}${limit ? ` · ${Math.round((cardUsed(src, card) / limit) * 100)}% do limite` : ''}</span></span>
            <span class="fin-row-end"><span class="fin-row-amt">${amt(total)}</span>${card.paidInvoices?.[k] ? html`<span class="fin-pill green">paga</span>` : ''}</span>
          </a>`;
        })}</div>` : emptyCard('card', 'Sem cartões', '', html`<button type="button" class="fin-btn ghost" data-act="new-card">Cadastrar cartão</button>`)}
      </section>
      <section class="h-fixed">
        ${sectionHead('Fixos por mês', html`<a href="#/fin/planejar" data-act="seg-plan" data-v="fixos">Planejar</a>`)}
        <div class="fin-card fin-fixed">
          <div><span class="fin-label">Renda fixa</span><strong class="pos">${amt(recT.income)}</strong></div>
          <div><span class="fin-label">Gastos fixos</span><strong class="neg">${amt(recT.expense)}</strong></div>
          <div><span class="fin-label">Livre</span><strong>${amt(recT.free)}</strong></div>
        </div>
      </section>
      <section class="h-goals">
        ${sectionHead('Metas', html`<a href="#/fin/metas">Ver todas</a>`)}
        ${goals.length ? html`<div class="fin-card fin-list">${goals.slice(0, 4).map(({ src, g }) => {
          const r = (Number(g.saved) || 0) / (Number(g.target) || 1);
          return html`<a class="fin-row fin-goal-row" href="#/fin/metas"><span class="fin-goal-emoji">${g.emoji || '🎯'}</span><span class="fin-row-main"><span class="fin-row-title">${g.name}${ownerTag(src.owner)}</span>${meter(r, g.color || 'var(--f-green)')}</span><span class="fin-row-end"><span class="fin-row-amt">${Math.round(Math.min(1, r) * 100)}%</span></span></a>`;
        })}</div>` : emptyCard('target', 'Sem metas', '', html`<button type="button" class="fin-btn ghost" data-act="new-goal">Criar meta</button>`)}
      </section>
      </div>
    </div>
  `;
}
function upcomingRow(e) {
  const c = e.invoiceOf ? { emoji: '💳', color: e.invoiceOf.color || '#1C1C1E' } : categoryOf(e.src, e.categoryId);
  const days = Math.round((new Date(`${e.date}T12:00`) - new Date(`${todayISO()}T12:00`)) / 86400e3);
  const when = e.late ? `atrasado ${-days} ${-days === 1 ? 'dia' : 'dias'}` : days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days} dias`;
  const mine = e.owner === 'me' && !e.readonly;
  const month = e.invoice || e.month || monthOf(e.date);
  return html`<div class="fin-row" role="button" tabindex="0" data-act="entry" data-id="${e.id}" data-month="${month}">
    ${bubble(c)}
    <span class="fin-row-main"><span class="fin-row-title">${e.description}${ownerTag(e.owner)}</span><span class="fin-row-meta ${e.late ? 'red' : ''}">${shortDate(e.date)} · ${when}</span></span>
    <span class="fin-row-end"><span class="fin-row-amt ${e.kind}">${amt(e.amount, { sign: true, kind: e.kind })}</span>
      ${mine ? html`<button type="button" class="fin-chip-btn" data-act="quick-pay" data-id="${e.id}" data-month="${month}">${e.kind === 'income' ? 'Recebi' : 'Paguei'}</button>` : ''}</span>
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
  const pend = sum(list.filter((e) => !e.paid && !e.card && e.kind === 'expense'), (e) => e.amount);
  const days = new Map();
  for (const e of [...list].reverse()) { if (!days.has(e.date)) days.set(e.date, []); days.get(e.date).push(e); }
  const count = (k) => all.filter(EXT_FILTERS[k]).length;
  return html`
    ${pageHead('Extrato', { month: true, actions: html`<button type="button" class="fin-round" data-act="export" title="Exportar planilha" aria-label="Exportar planilha">${icon('download')}</button>` })}
    <div class="fin-toolbar">
      <label class="fin-search">${icon('search')}<input type="search" id="fin-q" value="${ui.q}" placeholder="Buscar descrição, categoria, loja…" autocomplete="off" enterkeyhint="search"></label>
      <div class="fin-chips">${[['tudo', 'Tudo'], ['receitas', 'Receitas'], ['despesas', 'Despesas'], ['pendentes', 'Pendentes'], ['cartao', 'Cartão']].map(([k, l]) => html`<button type="button" class="fin-chip ${ui.ext === k ? 'on' : ''}" data-act="ext-filter" data-v="${k}">${l}<span>${count(k)}</span></button>`)}</div>
    </div>
    <div class="fin-ext-sum">
      <div><span class="fin-label">Entradas</span><b class="pos">${amt(inc)}</b></div>
      <div><span class="fin-label">Saídas</span><b class="neg">${amt(exp)}</b></div>
      <div><span class="fin-label">Resultado</span><b>${amt(inc - exp, { sign: true })}</b></div>
      <div><span class="fin-label">Despesas pendentes</span><b>${amt(pend)}</b></div>
    </div>
    ${list.length ? html`<div class="fin-table">${tableHead()}<div class="fin-card fin-list">${[...days.entries()].map(([d, items]) => {
      const net = sum(items, (e) => (e.kind === 'income' ? e.amount : e.kind === 'expense' ? -e.amount : 0));
      const raw0 = new Date(`${d}T12:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      const label = d === todayISO() ? `Hoje, ${raw0}` : raw0.charAt(0).toUpperCase() + raw0.slice(1);
      return html`<div class="fin-day-head"><span>${label}</span><span class="amt">${net ? `${net > 0 ? '+' : '−'} ${money(Math.abs(net))}` : ''}</span></div>${items.map((e) => entryRow(e, { table: true }))}`;
    })}</div></div>` : emptyCard('list', q ? 'Nada encontrado' : 'Nenhum lançamento', q ? 'Tente outra busca.' : 'Use o botão + para lançar receitas, despesas e compras no cartão.')}
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
    ${pageHead('Planejar', { month: ui.plan === 'orcamento' })}
    ${seg('plan', [{ value: 'fixos', label: 'Fixos (todo mês)' }, { value: 'orcamento', label: 'Orçamento por categoria' }], ui.plan)}
    ${ui.plan === 'orcamento' ? orcamento() : fixos()}
  `;
}
function fixos() {
  const t = recurringTotals();
  const key = thisMonth();
  const all = sources().flatMap((src) => src.items.recurring.map((r) => ({ src, r })));
  const status = (src, r) => {
    if (r.active === false) return html`<span class="fin-pill gray">pausado</span>`;
    if (!recurringHits(r, key)) return html`<span class="fin-pill gray">não cai este mês</span>`;
    if (r.cardId) return html`<span class="fin-pill gray">no cartão</span>`;
    const t2 = src.items.transactions.find((x) => x.recurringId === r.id && x.period === key);
    if (t2?.skipped) return html`<span class="fin-pill gray">pulado</span>`;
    if (t2 || fulfilledRecurring(src, key).has(r.id)) return html`<span class="fin-pill green">✓ ${r.kind === 'income' ? 'recebido' : 'pago'}</span>`;
    const late = `${key}-${String(r.day).padStart(2, '0')}` < todayISO();
    return html`<span class="fin-pill ${late ? 'red' : 'orange'}">${r.kind === 'income' ? 'a receber' : 'a pagar'}</span>`;
  };
  const row = ({ src, r }) => {
    const c = categoryOf(src, r.categoryId);
    const card = r.cardId ? src.items.cards.find((x) => x.id === r.cardId) : null;
    const acc = !card && src.items.accounts.find((a) => a.id === r.accountId);
    return html`<div class="fin-row tr ${r.active === false ? 'off' : ''}" role="button" tabindex="0" data-act="rec" data-id="${r.id}" data-owner="${src.owner}">
      ${bubble(c)}
      <span class="fin-row-main"><span class="fin-row-title">${r.description}${ownerTag(src.owner)}</span>
        <span class="fin-row-meta">${FREQ_LABEL(r)}, dia ${r.day}${r.party ? ` · ${r.party}` : ''}${r.variable ? ' · valor varia' : ''}</span></span>
      <span class="td d-only">${c.name}</span>
      <span class="td d-only">${card ? `💳 ${card.name}` : acc ? acc.name : ''}</span>
      <span class="td d-only">${status(src, r)}</span>
      <span class="fin-row-end"><span class="fin-row-amt ${r.kind}">${amt(r.amount)}</span><span class="m-only">${status(src, r)}</span></span>
    </div>`;
  };
  const inc = all.filter((x) => x.r.kind === 'income');
  const exp = all.filter((x) => x.r.kind === 'expense').sort((a, b) => b.r.amount - a.r.amount);
  const ratio = t.income > 0 ? t.expense / t.income : 0;
  const head = tableHead(['Descrição', 'Categoria', 'Conta / cartão', 'Este mês', 'Valor']);
  return html`
    <section class="fin-card fin-fixed-sum">
      <div class="fin-fixed">
        <div><span class="fin-label">Renda fixa por mês</span><strong class="pos">${amt(t.income)}</strong></div>
        <div><span class="fin-label">Gastos fixos por mês</span><strong class="neg">${amt(t.expense)}</strong></div>
        <div><span class="fin-label">Sobra para o resto</span><strong>${amt(t.free)}</strong></div>
      </div>
      ${t.income > 0 ? html`${meter(ratio, ratio > 0.7 ? 'var(--f-red)' : ratio > 0.5 ? 'var(--f-orange)' : 'var(--f-green)')}<small class="fin-muted">${Math.round(ratio * 100)}% da renda fixa já tem destino todo mês${ratio > 0.5 ? ' (o ideal é ficar abaixo de 50%)' : ''}.</small>` : ''}
    </section>
    <section class="fin-section">
      ${sectionHead('Receitas fixas', html`<button type="button" class="fin-link" data-act="new-rec" data-v="income">${icon('plus')} Adicionar</button>`)}
      ${inc.length ? html`<div class="fin-table">${head}<div class="fin-card fin-list">${inc.map(row)}</div></div>` : emptyCard('up', 'Quanto você ganha?', 'Cadastre o salário e outras rendas: de onde vem, quanto e em que dia cai.', html`<button type="button" class="fin-btn" data-act="new-rec" data-v="income">Adicionar receita fixa</button>`)}
    </section>
    <section class="fin-section">
      ${sectionHead('Gastos fixos', html`<button type="button" class="fin-link" data-act="new-rec" data-v="expense">${icon('plus')} Adicionar</button>`)}
      ${exp.length ? html`<div class="fin-table">${head}<div class="fin-card fin-list">${exp.map(row)}</div></div>` : emptyCard('repeat', 'Gastos que se repetem', 'Aluguel, condomínio, luz, internet, academia, assinaturas… Cada mês eles aparecem como previstos.', html`<button type="button" class="fin-btn" data-act="new-rec" data-v="expense">Adicionar gasto fixo</button>`)}
    </section>
  `;
}
function orcamento() {
  const s = monthSummary(ui.month);
  const withBudget = s.categories.filter((g) => g.budget > 0);
  const without = s.categories.filter((g) => !g.budget && g.total > 0);
  const totalB = sum(withBudget, (g) => g.budget), spentB = sum(withBudget, (g) => g.total);
  const mine = new Set(fin.items.categories.map((c) => c.id));
  const card = (g) => {
    const r = g.budget ? g.total / g.budget : 0;
    const color = !g.budget ? 'var(--f-blue)' : r > 1 ? 'var(--f-red)' : r > 0.8 ? 'var(--f-orange)' : 'var(--f-green)';
    const editable = !g.cat.virtual && mine.has(g.cat.id);
    return html`<button type="button" class="fin-card fin-budget" ${editable ? html`data-act="cat" data-id="${g.cat.id}"` : raw('disabled')}>
      <span class="fin-budget-top">${bubble(g.cat, 'sm')}<span class="fin-budget-name">${g.cat.name}</span>${g.budget ? html`<span class="fin-budget-pct ${r > 1 ? 'red' : ''}">${Math.round(r * 100)}%</span>` : ''}</span>
      <span class="fin-budget-val">${amt(g.total)}${g.budget ? html`<small> de ${amt(g.budget)}</small>` : ''}</span>
      ${g.budget ? meter(r, color) : ''}
      <small class="${r > 1 ? 'red' : 'fin-muted'}">${g.budget ? (r > 1 ? html`Passou ${amt(g.total - g.budget)}` : html`Restam ${amt(g.budget - g.total)}`) : editable ? 'Toque para definir um limite' : 'Categoria automática'}</small>
    </button>`;
  };
  const unused = myCategories('expense').filter((c) => !s.categories.some((g) => g.cat.id === c.id || g.cat.name === c.name));
  return html`
    ${withBudget.length ? html`<section class="fin-card fin-budget-total">
      <div><span class="fin-label">Gasto nas categorias com limite</span><strong class="fin-kpi-amt">${amt(spentB)} <small>de ${amt(totalB)}</small></strong></div>
      ${meter(totalB ? spentB / totalB : 0, spentB > totalB ? 'var(--f-red)' : 'var(--f-green)')}
    </section>` : emptyCard('target', 'Defina limites por categoria', 'Ex.: Mercado R$ 1.200, Restaurantes R$ 400. Toque numa categoria abaixo para colocar o limite.')}
    ${withBudget.length ? html`<section class="fin-section">${sectionHead('Com limite')}<div class="fin-grid">${withBudget.map(card)}</div></section>` : ''}
    ${without.length ? html`<section class="fin-section">${sectionHead('Gastos sem limite')}<div class="fin-grid">${without.map(card)}</div></section>` : ''}
    ${unused.length ? html`<section class="fin-section">${sectionHead('Sem gastos neste mês', html`<a href="#/fin/categorias">Gerenciar categorias</a>`)}
      <div class="fin-tags">${unused.map((c) => html`<button type="button" class="fin-tag" data-act="cat" data-id="${c.id}">${c.emoji} ${c.name}${c.budget ? html` <small>${money(c.budget)}</small>` : ''}</button>`)}</div>
    </section>` : ''}
  `;
}

// ---------------------------------------------------------------------------
// Cartões
// ---------------------------------------------------------------------------
function cartoes() {
  const list = sources().flatMap((src) => src.items.cards.map((card) => ({ src, card })));
  if (!list.length) {
    return html`${pageHead('Cartões')}
      ${emptyCard('card', 'Nenhum cartão', 'Cadastre seus cartões com o dia de fechamento e de vencimento. As compras e parcelas caem na fatura certa sozinhas.', html`<button type="button" class="fin-btn" data-act="new-card">Cadastrar cartão</button>`)}`;
  }
  const cur = list.find((x) => x.card.id === ui.cardId) || list[0];
  ui.cardId = cur.card.id;
  const { src, card } = cur;
  const key = ui.cardKey.startsWith(`${card.id}:`) ? ui.cardKey.split(':')[1] : currentInvoiceKey(card);
  const items = invoiceEntries(src, card, key).map((e) => ({ ...e, month: key }));
  const total = invoiceTotal(src, card, key);
  const paid = card.paidInvoices?.[key];
  const due = invoiceDue(card, key), closing = invoiceClosing(card, key);
  const today = todayISO();
  const st = paid ? ['green', 'Paga'] : due < today ? ['red', 'Vencida'] : closing <= today ? ['orange', 'Fechada'] : ['blue', 'Aberta'];
  const used = cardUsed(src, card);
  const limit = Number(card.limit) || 0;
  const mine = src.owner === 'me';
  const byCat = new Map();
  for (const e of items) { const c = categoryOf(e.src, e.categoryId); const g = byCat.get(c.name) || { c, v: 0 }; g.v += e.amount; byCat.set(c.name, g); }
  return html`
    ${pageHead('Cartões', { actions: html`<button type="button" class="fin-round" data-act="new-card" aria-label="Novo cartão" title="Novo cartão">${icon('plus')}</button>` })}
    <div class="fin-cards-layout">
      <div class="fin-cards-side">
        <div class="fin-cards-strip">${list.map(({ src: s2, card: c }) => html`<button type="button" class="fin-cc ${c.id === card.id ? 'on' : ''}" style="--c:${c.color || '#1C1C1E'}" data-act="pick-card" data-id="${c.id}">
          <span class="fin-cc-name">${c.name}${s2.owner === 'partner' ? ` · ${partnerName()}` : ''}</span>
          <span class="fin-cc-amt">${amt(invoiceTotal(s2, c, currentInvoiceKey(c)))}</span>
          <span class="fin-cc-meta">fecha dia ${c.closingDay} · vence dia ${c.dueDay}</span>
        </button>`)}</div>
        ${limit ? html`<section class="fin-card fin-limit">
          <div class="fin-limit-row"><span class="fin-label">Limite usado</span><span>${amt(used)} <small>de ${amt(limit)}</small></span></div>
          ${meter(used / limit, used / limit > 0.9 ? 'var(--f-red)' : used / limit > 0.7 ? 'var(--f-orange)' : 'var(--f-blue)')}
          <small class="fin-muted">Disponível: ${amt(Math.max(0, limit - used))} (conta as parcelas futuras)</small>
        </section>` : ''}
        ${byCat.size ? html`<section class="fin-card fin-cat-list d-only">${[...byCat.values()].sort((a, b) => b.v - a.v).slice(0, 6).map((g) => html`<div class="fin-cat-item">${bubble(g.c, 'sm')}<span class="fin-cat-name">${g.c.name}</span><span class="fin-cat-val">${amt(g.v)}</span></div>`)}</section>` : ''}
      </div>
      <div class="fin-cards-main">
        <div class="fin-month">
          <button type="button" class="fin-round sm" data-act="inv" data-d="-1" aria-label="Fatura anterior">${icon('back')}</button>
          <span class="fin-month-label">Fatura de ${monthLabel(key)}</span>
          <button type="button" class="fin-round sm" data-act="inv" data-d="1" aria-label="Próxima fatura">${icon('chevron')}</button>
        </div>
        <section class="fin-card fin-invoice">
          <div class="fin-invoice-top">
            <div><span class="fin-label">Total da fatura</span><strong class="fin-kpi-amt big">${amt(total)}</strong></div>
            <span class="fin-pill ${st[0]}">${st[1]}</span>
          </div>
          <div class="fin-invoice-dates"><span>Fecha <b>${fmtDate(closing)}</b></span><span>Vence <b>${fmtDate(due)}</b></span>${paid && typeof paid === 'object' ? html`<span>Paga em <b>${fmtDate(paid.date)}</b></span>` : ''}</div>
          ${mine ? html`<div class="fin-invoice-actions">
            ${paid ? html`<button type="button" class="fin-btn ghost" data-act="inv-reopen">Desfazer pagamento</button>` : total > 0 ? html`<button type="button" class="fin-btn" data-act="inv-pay">Pagar fatura</button>` : ''}
            <button type="button" class="fin-btn ghost" data-act="card-buy">${icon('plus')} Compra</button>
            <button type="button" class="fin-btn ghost" data-act="card-edit">${icon('edit')} Editar cartão</button>
          </div>` : ''}
        </section>
        ${items.length ? html`<section class="fin-section">${sectionHead(`Compras (${items.length})`)}
          <div class="fin-table">${tableHead(['Descrição', 'Categoria', 'Cartão', 'Situação', 'Valor'])}<div class="fin-card fin-list">${items.map((e) => entryRow(e, { table: true, showDate: true }))}</div></div></section>`
          : emptyCard('card', 'Fatura vazia', 'Nenhuma compra nesta fatura.')}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Mais e subtelas
// ---------------------------------------------------------------------------
function mais() {
  const accs = accountBalances().filter((b) => b.owner === 'me');
  const item = (href, ic, cls, label, detail = '') => html`<a class="fin-row" href="${href}"><span class="fin-add-ic sm ${cls}">${icon(ic)}</span><span class="fin-row-main"><span class="fin-row-title">${label}</span></span><span class="fin-row-detail">${detail}</span>${icon('chevron')}</a>`;
  return html`
    ${pageHead('Mais')}
    ${fin.partner ? html`<div class="fin-card fin-list">
      <label class="fin-switch-row"><span class="fin-add-ic sm purple">${icon('users')}</span><span class="fin-row-main"><span class="fin-row-title">Visão do casal</span><span class="fin-row-meta">Somar as suas finanças com as de ${partnerName()}${fin.partner.shared ? '' : ` (${partnerName()} ainda não liberou)`}</span></span><input type="checkbox" class="fin-switch" data-scope ${isCouple() ? raw('checked') : ''}></label>
    </div>` : ''}
    <div class="fin-card fin-list">
      ${item('#/fin/contas', 'bank', 'blue', 'Contas', html`${accs.length} · ${amt(sum(accs, (b) => b.balance))}`)}
      ${item('#/fin/categorias', 'tag', 'orange', 'Categorias', String(fin.items.categories.length))}
      ${item('#/fin/metas', 'target', 'purple', 'Metas', String(fin.items.goals.length))}
      ${item('#/fin/relatorios', 'chart', 'green', 'Relatórios')}
    </div>
    <div class="fin-card fin-list">
      ${item('#/fin/ajustes', 'settings', 'gray', 'Ajustes')}
      <button type="button" class="fin-row" data-act="export"><span class="fin-add-ic sm gray">${icon('download')}</span><span class="fin-row-main"><span class="fin-row-title">Exportar planilha (CSV)</span></span>${icon('chevron')}</button>
    </div>
    <div class="fin-card fin-list">${item('#/inicio', 'heart', 'pink', 'Casamento', 'Planejamento')}</div>
    <div class="fin-card fin-list">
      <button type="button" class="fin-row" data-act="logout"><span class="fin-add-ic sm red">${icon('logout')}</span><span class="fin-row-main"><span class="fin-row-title red">Sair</span></span><span class="fin-row-detail">${state.user?.name || ''}</span></button>
    </div>
  `;
}

function contas() {
  const list = accountBalances();
  const total = sum(list.filter((b) => b.account.includeInTotal !== false), (b) => b.balance);
  const type = (t) => ACCOUNT_TYPES.find((x) => x.value === t)?.label || 'Conta';
  const ico = (t) => (t === 'carteira' ? '👛' : t === 'investimento' ? '📈' : t === 'poupanca' ? '🐷' : t === 'beneficio' ? '🍽️' : '🏦');
  return html`
    ${pageHead('Contas', { back: '#/fin/mais', actions: html`<button type="button" class="fin-round" data-act="new-account" aria-label="Nova conta" title="Nova conta">${icon('plus')}</button>` })}
    <section class="fin-card fin-kpi fin-kpi-hero wide"><span class="fin-label">Saldo total</span><strong class="fin-kpi-amt big ${total < 0 ? 'neg' : ''}">${amt(total)}</strong>
      <div class="fin-actions-row"><button type="button" class="fin-btn ghost" data-act="transfer">${icon('swap')} Transferir entre contas</button><button type="button" class="fin-btn ghost" data-act="new-account">${icon('plus')} Nova conta</button></div>
    </section>
    <div class="fin-grid accounts">${list.map((b) => html`<button type="button" class="fin-card fin-acc" ${b.owner === 'me' ? html`data-act="account" data-id="${b.account.id}"` : raw('disabled')}>
      <span class="fin-acc-top"><span class="fin-bubble" style="--c:${b.account.color || '#007AFF'}">${ico(b.account.type)}</span><span class="fin-row-main"><span class="fin-row-title">${b.account.name}${ownerTag(b.owner)}</span><span class="fin-row-meta">${type(b.account.type)}${b.account.includeInTotal === false ? ' · fora do total' : ''}</span></span></span>
      <strong class="fin-acc-amt ${b.balance < 0 ? 'neg' : ''}">${amt(b.balance)}</strong>
    </button>`)}</div>
    <p class="fin-foot">O saldo é o "saldo hoje" informado no cadastro mais tudo o que já foi recebido ou pago: lançamentos, transferências, faturas pagas${fin.settings.weddingAccountId ? ' e os pagamentos do casamento' : ''}.</p>
  `;
}

function categorias() {
  const list = myCategories(ui.catKind);
  return html`
    ${pageHead('Categorias', { back: '#/fin/mais', actions: html`<button type="button" class="fin-round" data-act="new-cat" aria-label="Nova categoria" title="Nova categoria">${icon('plus')}</button>` })}
    ${seg('cat', [{ value: 'expense', label: 'Despesas' }, { value: 'income', label: 'Receitas' }], ui.catKind)}
    <div class="fin-grid cats">${list.map((c) => html`<button type="button" class="fin-card fin-catbox" data-act="cat" data-id="${c.id}">${bubble(c)}<span class="fin-row-main"><span class="fin-row-title">${c.name}</span><span class="fin-row-meta">${c.budget ? `Limite de ${money(c.budget)}/mês` : ui.catKind === 'expense' ? 'Sem limite' : ' '}</span></span></button>`)}</div>
    ${ui.catKind === 'expense' ? html`<p class="fin-foot">${WEDDING_CAT.emoji} "Casamento" é automática: recebe as parcelas dos fornecedores.</p>` : ''}
  `;
}

function metas() {
  const list = sources().flatMap((src) => src.items.goals.map((g) => ({ src, g })));
  const today = todayISO();
  return html`
    ${pageHead('Metas', { back: '#/fin/mais', actions: html`<button type="button" class="fin-round" data-act="new-goal" aria-label="Nova meta" title="Nova meta">${icon('plus')}</button>` })}
    ${list.length ? html`<div class="fin-grid goals">${list.map(({ src, g }) => {
      const saved = Number(g.saved) || 0, target = Number(g.target) || 0;
      const r = target ? saved / target : 0;
      let perMonth = '';
      if (g.deadline && g.deadline > today && saved < target) {
        const months = Math.max(1, Math.round((new Date(`${g.deadline}T12:00`) - new Date(`${today}T12:00`)) / (30.44 * 86400e3)));
        perMonth = html`Guarde ${amt((target - saved) / months)} por mês até ${fmtDate(g.deadline, { month: 'short', year: 'numeric' }).replace('.', '')}`;
      }
      return html`<article class="fin-card fin-goal">
        <div class="fin-goal-top"><span class="fin-goal-emoji">${g.emoji || '🎯'}</span><div><strong>${g.name}${ownerTag(src.owner)}</strong><small>${amt(saved)} de ${amt(target)}</small></div><span class="fin-goal-pct">${Math.round(Math.min(1, r) * 100)}%</span></div>
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
    ${pageHead('Relatórios', { back: '#/fin/mais', month: true })}
    <div class="fin-cols">
      <section class="fin-section span-2">${sectionHead('Últimos 12 meses')}
        <div class="fin-card">
          ${bars(h)}
          ${legend([['inc', 'Receitas'], ['exp', 'Despesas']])}
          ${closed.length ? html`<div class="fin-fixed top-line">
            <div><span class="fin-label">Média de receitas</span><strong class="pos">${amt(avgInc)}</strong></div>
            <div><span class="fin-label">Média de gastos</span><strong class="neg">${amt(avgExp)}</strong></div>
            <div><span class="fin-label">Média que sobra</span><strong>${amt(avgInc - avgExp)}</strong></div>
          </div><small class="fin-muted">Média dos últimos ${closed.length} meses fechados. Toque numa barra para ver o mês.</small>` : ''}
        </div>
      </section>
      <section class="fin-section">${sectionHead(`Gastos por categoria · ${monthLabel(ui.month, { short: true })}`)}
        ${cats.length ? html`<div class="fin-card fin-cats">
          ${donut(cats.map((g) => ({ value: g.total, color: g.cat.color })), { center: html`<small>Total</small><strong>${amt(s.expense.total)}</strong>` })}
          <div class="fin-cat-list">${cats.map((g) => html`<div class="fin-cat-item">${bubble(g.cat, 'sm')}<span class="fin-cat-name">${g.cat.name}</span><span class="fin-cat-val">${amt(g.total)}<small>${Math.round((g.total / s.expense.total) * 100)}%</small></span></div>`)}</div>
        </div>` : emptyCard('pie', 'Sem gastos neste mês', '')}
      </section>
      <section class="fin-section">${sectionHead('Saldo previsto')}
        <div class="fin-card fin-proj">${proj.map((p) => html`<div class="fin-proj-row"><span>${monthLabel(p.key, { short: true })}</span><span class="fin-proj-bar"><span class="${p.bal < 0 ? 'neg' : ''}" style="width:${(Math.abs(p.bal) / maxProj) * 100}%"></span></span><b class="${p.bal < 0 ? 'neg' : ''}">${amt(p.bal)}</b></div>`)}
          <small class="fin-muted">Saldo de hoje + receitas e gastos previstos (fixos, parcelas, faturas e casamento) até o fim de cada mês.</small></div>
      </section>
      ${s.expense.total > 0 ? html`<section class="fin-section">${sectionHead('Fixos x variáveis')}
        <div class="fin-card">
          <div class="fin-split"><span class="fixed" style="flex:${fixed || 0.0001}"></span><span class="var" style="flex:${variable || 0.0001}"></span></div>
          ${legend([['fixed', html`Fixos ${amt(fixed)}`], ['var', html`Variáveis ${amt(variable)}`]])}
        </div></section>` : ''}
      ${topParties.length ? html`<section class="fin-section">${sectionHead('Para onde vai o dinheiro')}
        <div class="fin-card fin-list">${topParties.map(([p, v]) => html`<div class="fin-row static"><span class="fin-row-main"><span class="fin-row-title">${p}</span></span><span class="fin-row-amt">${amt(v)}</span></div>`)}</div></section>` : ''}
    </div>
  `;
}

function ajustes() {
  const st = fin.settings;
  const sw = (name, on, label, hint) => html`<label class="fin-switch-row"><span class="fin-row-main"><span class="fin-row-title">${label}</span>${hint ? html`<span class="fin-row-meta">${hint}</span>` : ''}</span><input type="checkbox" class="fin-switch" data-set="${name}" ${on ? raw('checked') : ''}></label>`;
  return html`
    ${pageHead('Ajustes', { back: '#/fin/mais' })}
    <div class="fin-narrow">
    ${fin.partner ? html`<section class="fin-section">${sectionHead('Visão do casal')}
      <div class="fin-card fin-list">
        <label class="fin-switch-row"><span class="fin-row-main"><span class="fin-row-title">Ver as finanças do casal</span><span class="fin-row-meta">Soma as suas com as de ${partnerName()} em todas as telas (também fica no menu).</span></span><input type="checkbox" class="fin-switch" data-scope ${isCouple() ? raw('checked') : ''}></label>
        ${sw('shareWithCouple', st.shareWithCouple !== false, `Mostrar minhas finanças para ${partnerName()}`, `Na visão do casal, ${partnerName()} vê suas contas, lançamentos, cartões e metas (só para ler). Desligado, ficam só com você.`)}
      </div>
      <p class="fin-foot">${fin.partner.shared ? `${partnerName()} compartilha as finanças com você.` : `${partnerName()} não compartilha as finanças com você.`}</p></section>` : ''}
    <section class="fin-section">${sectionHead('Casamento')}
      <div class="fin-card fin-list">
        <label class="fin-switch-row"><span class="fin-row-main"><span class="fin-row-title">Você no casamento</span><span class="fin-row-meta">Cada fornecedor diz quem paga (Fornecedor › Editar › Quem paga). Aqui entra só a sua parte.</span></span>
          <select class="fin-select" data-set="weddingSide">${['p1', 'p2'].map((k) => html`<option value="${k}" ${mySide() === k ? raw('selected') : ''}>${names()[k]}</option>`)}</select>
        </label>
        ${sw('weddingInPersonal', st.weddingInPersonal !== false, 'Pagamentos do casamento nas minhas finanças', 'Sua parte das parcelas dos fornecedores entra como despesa da categoria Casamento. Na visão do casal entra a parte dos dois.')}
        <label class="fin-switch-row"><span class="fin-row-main"><span class="fin-row-title">Conta que paga a sua parte</span><span class="fin-row-meta">Sua parte dos pagamentos já feitos sai do saldo desta conta.</span></span>
          <select class="fin-select" data-set="weddingAccountId"><option value="">Nenhuma</option>${fin.items.accounts.map((a) => html`<option value="${a.id}" ${a.id === st.weddingAccountId ? raw('selected') : ''}>${a.name}</option>`)}</select>
        </label>
      </div>
    </section>
    <p class="fin-foot">Família e assessoria do casamento não têm acesso às finanças.</p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Rotas e eventos
// ---------------------------------------------------------------------------
export const FIN_ROUTES = {
  '': { title: 'Início', tab: '', render: home },
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
  return null;
}
function openEntry(e) {
  if (!e) return;
  if (e.invoiceOf) { ui.cardId = e.invoiceOf.id; ui.cardKey = `${e.invoiceOf.id}:${e.invoice}`; location.hash = '#/fin/cartoes'; return; }
  if (e.readonly || e.owner !== 'me') { entryInfo(e); return; }
  if (e.virtual) { if (e.auto || e.card) recurringForm(e.rec); else confirmOccurrence(e); return; }
  txForm(e.tx);
}
// Pagar/receber com um toque (ou desfazer).
function togglePaid(e) {
  if (!e || !canToggle(e)) return;
  if (e.virtual) { confirmOccurrence(e); return; }
  if (e.paid) run(async () => { await fupdate('transactions', e.tx.id, { paid: false }); toast('Marcado como pendente'); });
  else run(() => markPaid(e.tx));
}

export function mountFin(el, emitView) {
  el.onclick = (ev) => {
    const a = ev.target.closest('[data-act]');
    if (!a || !el.contains(a)) return;
    const act = a.dataset.act;
    const id = a.dataset.id;
    switch (act) {
      case 'hide': toggleHidden(); break;
      case 'scope': setScope(a.dataset.v); break;
      case 'month': ui.month = addMonths(ui.month, Number(a.dataset.d)); emitView(); break;
      case 'month-today': ui.month = thisMonth(); emitView(); break;
      case 'goto-month': ui.month = a.dataset.v; emitView(); break;
      case 'seg': if (a.dataset.group === 'plan') ui.plan = a.dataset.v; else if (a.dataset.group === 'cat') ui.catKind = a.dataset.v; emitView(); break;
      case 'seg-plan': ui.plan = a.dataset.v; break; // o link segue para #/fin/planejar
      case 'ext-filter': ui.ext = a.dataset.v; if (location.hash.startsWith('#/fin/extrato')) emitView(); break;
      case 'entry': openEntry(findEntry(id, a.dataset.month)); break;
      case 'toggle-paid': togglePaid(findEntry(id, a.dataset.month)); break;
      case 'quick-pay': {
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
  // Linhas clicáveis também abrem com Enter (teclado).
  el.onkeydown = (ev) => {
    if (ev.key !== 'Enter' || ev.target.getAttribute('role') !== 'button') return;
    ev.preventDefault();
    ev.target.click();
  };
  el.oninput = (ev) => {
    if (ev.target.id === 'fin-q') { ui.q = ev.target.value; emitView(); }
  };
  el.onchange = (ev) => {
    if (ev.target.matches('[data-scope]')) { setScope(ev.target.checked ? 'couple' : 'me'); return; }
    const k = ev.target.dataset.set;
    if (!k) return;
    const v = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
    run(async () => { await saveFinSettings({ [k]: v }); toast('Ajuste salvo'); });
  };
}
