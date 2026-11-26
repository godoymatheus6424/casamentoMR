// Finanças: telas. Celular: uma coluna, com abas embaixo. Computador (≥1024px): menu lateral, painel em grade
// e listas em formato de tabela (as colunas extras só aparecem na tela larga).
import { fin, setScope, toggleHidden, valuesHidden, saveFinSettings, fupdate } from './data.js';
import {
  thisMonth, addMonths, monthLabel, monthOf, monthSummary, monthEntries, accountBalances, totalBalance, upcoming, history,
  recurringTotals, categoryOf, myCategories, sources, isCouple, partnerName, firstName, FREQ_LABEL, ACCOUNT_TYPES, mySide, autoFixed,
  invoiceDue, invoiceClosing, dayIn, forecast, dailyBudget, dailyLeft, installmentPlans, invoiceStatus, invoicePayments, invoiceEntries, invoiceTotal, currentInvoiceKey, cardUsed, recurringHits, fulfilledRecurring, WEDDING_CAT,
} from './model.js';
import {
  txForm, recurringForm, confirmOccurrence, markPaid, accountForm, cardForm, payInvoiceForm, removeInvoicePayment, categoryForm,
  goalForm, goalDepositForm, entryInfo, adjustBalanceForm, dailyBudgetForm, addSheet,
} from './forms.js';
import { state } from '../store.js';
import { api } from '../api.js';
import { names } from '../domain.js';
import { html, icon, raw, money, fmtDate, todayISO, shiftISO, sum, norm, run, downloadCSV, csvMoney, toast, openModal } from '../ui.js';

export const ui = { month: thisMonth(), day: '', wday: '', extDay: '', ext: 'tudo', q: '', plan: 'fixos', catKind: 'expense', cardKey: '', cardId: '' };

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
  if (e.paid) return { label: `${e.kind === 'income' ? 'recebido' : 'pago'}${e.assumed ? ' · auto' : ''}`, cls: 'green' };
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
      <span class="fin-row-title">${e.description || c.name}${e.recurringId || e.rec ? html`<span class="fin-mini" title="Fixo">${icon('repeat')}</span>` : ''}${e.attachments?.length ? html`<span class="fin-mini" title="Tem comprovante">${icon('clip')}</span>` : ''}${ownerTag(e.owner)}</span>
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


// ---------------------------------------------------------------------------
// Início: o mês em foco (o que falta, calendário e o que ainda vem)
// ---------------------------------------------------------------------------
const compact = (v) => {
  const n = Math.abs(Number(v) || 0);
  if (n >= 1000) return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: n >= 10000 ? 0 : 1 })}k`;
  return Math.round(n).toLocaleString('pt-BR');
};
// O que acontece em cada dia do mês: lançamentos e fixos (sem as compras do cartão, que entram como a fatura no vencimento).
function dayMap(key) {
  const map = new Map();
  const push = (e) => { if (!map.has(e.date)) map.set(e.date, []); map.get(e.date).push(e); };
  for (const e of monthEntries(key)) if (!e.card && e.kind !== 'transfer' && e.month === key && monthOf(e.date) === key) push(e);
  for (const src of sources()) {
    for (const card of src.items.cards) {
      const inv = invoiceStatus(src, card, key);
      if (inv.total <= 0) continue;
      push({ id: `inv:${card.id}:${key}`, invoiceOf: card, invoice: key, owner: src.owner, src, kind: 'expense', description: `Fatura ${card.name}${inv.partial ? ' (restante)' : ''}`, amount: inv.partial ? inv.left : inv.total, date: invoiceDue(card, key), paid: inv.isPaid, partial: inv.partial });
    }
  }
  return map;
}
function dayRow(e) {
  const c = e.invoiceOf ? { emoji: '💳', color: e.invoiceOf.color || '#1C1C1E', name: 'Fatura' } : categoryOf(e.src, e.categoryId);
  const st = e.invoiceOf ? (e.paid ? { label: 'paga', cls: 'green' } : e.partial ? { label: 'paga em parte', cls: 'orange' } : { label: 'fatura', cls: 'gray' }) : statusOf(e);
  const mine = e.owner === 'me' && !e.readonly;
  const month = e.invoice || e.month || monthOf(e.date);
  const late = !e.paid && e.date < todayISO();
  return html`<div class="fin-row" role="button" tabindex="0" data-act="entry" data-id="${e.id}" data-month="${month}">
    ${bubble(c)}
    <span class="fin-row-main"><span class="fin-row-title">${e.description || c.name}${ownerTag(e.owner)}</span><span class="fin-row-meta ${late ? 'red' : ''}">${[c.name, e.party, e.shareLabel].filter(Boolean).join(' · ')}</span></span>
    <span class="fin-row-end"><span class="fin-row-amt ${e.kind}">${amt(e.amount, { sign: true, kind: e.kind })}</span>
      ${!e.paid && mine ? html`<button type="button" class="fin-chip-btn" data-act="quick-pay" data-id="${e.id}" data-month="${month}">${e.kind === 'income' ? 'Recebi' : 'Paguei'}</button>` : html`<span class="fin-pill ${st.cls}">${st.label}</span>`}</span>
  </div>`;
}
function calendar(key, map) {
  const [y, m] = key.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay(); // 0 = domingo
  const days = new Date(y, m, 0).getDate();
  const today = todayISO();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(html`<span class="fin-cal-cell empty"></span>`);
  for (let d = 1; d <= days; d++) {
    const iso = `${key}-${String(d).padStart(2, '0')}`;
    const items = map.get(iso) || [];
    const out = sum(items.filter((e) => e.kind === 'expense'), (e) => e.amount);
    const inc = sum(items.filter((e) => e.kind === 'income'), (e) => e.amount);
    const pending = items.some((e) => !e.paid);
    const cls = [iso === today && 'today', iso < today && 'past', iso === ui.day && 'sel', items.length && 'has', pending && iso < today && 'late'].filter(Boolean).join(' ');
    cells.push(html`<button type="button" class="fin-cal-cell ${cls}" data-act="cal-day" data-v="${iso}" aria-label="${d}: ${items.length ? `${items.length} lançamento(s)` : 'nada'}">
      <span class="fin-cal-d">${d}</span>
      ${inc ? html`<span class="fin-cal-in amt">+${compact(inc)}</span>` : ''}
      ${out ? html`<span class="fin-cal-out amt">−${compact(out)}</span>` : ''}
      <span class="fin-cal-names d-only">${items.slice(0, 2).map((e) => html`<i class="${e.kind}">${e.description}</i>`)}${items.length > 2 ? html`<i class="more">+${items.length - 2}</i>` : ''}</span>
    </button>`);
  }
  return html`<div class="fin-cal">
    <div class="fin-cal-week">${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((w) => html`<span>${w}</span>`)}</div>
    <div class="fin-cal-grid">${cells}</div>
  </div>`;
}

function monthView() {
  const key = ui.month;
  const now = thisMonth();
  const today = todayISO();
  const isNow = key === now;
  const s = monthSummary(key);
  const map = dayMap(key);
  const all = [...map.values()].flat();
  // Dia escolhido: hoje (no mês atual) ou o primeiro dia com movimento.
  if (!ui.day || monthOf(ui.day) !== key) ui.day = isNow ? today : ([...map.keys()].sort()[0] || `${key}-01`);
  const dayItems = (map.get(ui.day) || []).sort((a, b) => (a.kind === 'income' ? -1 : 1) - (b.kind === 'income' ? -1 : 1));
  // "Ainda neste mês": só o que falta, de hoje em diante (e o que atrasou neste mês).
  const left = all.filter((e) => !e.paid && (key > now || e.date >= today || (isNow && e.date < today))).sort((a, b) => a.date.localeCompare(b.date));
  const toPay = sum(left.filter((e) => e.kind === 'expense'), (e) => e.amount);
  const toGet = sum(left.filter((e) => e.kind === 'income'), (e) => e.amount);
  // Pendências de meses anteriores: uma linha só (o mês recomeça limpo).
  const older = isNow ? olderPending() : [];
  const over = s.categories.filter((g) => g.budget > 0 && g.total > g.budget);
  const bal = totalBalance();
  const dayLabel = (() => { const t = new Date(`${ui.day}T12:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); })();

  return html`
    ${pageHead('Visão geral do mês', { back: '#/fin', month: true })}
    <div class="fin-month-view">
      <section class="fv-kpis">
        ${key < now ? html`
          <div class="fin-card fin-kpi"><span class="fin-label">Entrou</span><strong class="fin-kpi-amt pos">${amt(s.income.total)}</strong></div>
          <div class="fin-card fin-kpi"><span class="fin-label">Saiu</span><strong class="fin-kpi-amt">${amt(s.expense.total)}</strong></div>
          <div class="fin-card fin-kpi"><span class="fin-label">${s.balance >= 0 ? 'Sobrou' : 'Faltou'}</span><strong class="fin-kpi-amt ${s.balance < 0 ? 'neg' : 'pos'}">${amt(s.balance, { sign: true })}</strong></div>`
        : html`
          <a class="fin-card fin-kpi" href="#/fin/contas"><span class="fin-label">Saldo hoje ${icon('chevron')}</span><strong class="fin-kpi-amt ${bal < 0 ? 'neg' : ''}">${amt(bal)}</strong><small>somando suas contas</small></a>
          <div class="fin-card fin-kpi"><span class="fin-label">${isNow ? 'Falta pagar até o fim do mês' : `A pagar em ${monthLabel(key).replace(/ de \d+$/, '').toLowerCase()}`}</span>
            <strong class="fin-kpi-amt">${amt(toPay)}</strong>
            <small>${toGet > 0 ? html`e <b class="pos">${amt(toGet)}</b> a receber` : 'nada a receber'}</small></div>
          <div class="fin-card fin-kpi fin-kpi-hero"><span class="fin-label">Vai sobrar no fim do mês</span><strong class="fin-kpi-amt ${forecast(key) < 0 ? 'neg' : 'pos'}">${amt(forecast(key))}</strong><small>saldo previsto em ${dayIn(key, 31).split('-').reverse().slice(0, 2).join('/')}</small></div>`}
      </section>

      ${older.length ? html`<button type="button" class="fin-card fin-notice fv-older" data-act="older">${icon('alert')}<span><b>${older.length} ${older.length === 1 ? 'pendência' : 'pendências'} de meses anteriores</b> (${amt(sum(older, (e) => e.amount))}). Toque para resolver ou marcar como pago.</span>${icon('chevron')}</button>` : ''}
      ${over.length ? html`<a class="fin-card fin-notice warn" href="#/fin/planejar" data-act="seg-plan" data-v="orcamento">${icon('alert')}<span>Passou do limite em <b>${over.map((g) => g.cat.name).join(', ')}</b>.</span></a>` : ''}

      <section class="fv-cal">
        <div class="fin-card">${calendar(key, map)}</div>
      </section>

      <div class="fv-side">
      <section class="fv-day">
        ${sectionHead(ui.day === today ? `Hoje, ${dayLabel.toLowerCase()}` : dayLabel)}
        ${dayItems.length ? html`<div class="fin-card fin-list">${dayItems.map(dayRow)}</div>` : html`<div class="fin-card fin-empty small"><p>Nada previsto neste dia.</p></div>`}
      </section>

      <section class="fv-left">
        ${sectionHead(key < now ? 'Ficou pendente' : key > now ? 'Previsto no mês' : 'Ainda neste mês', left.length ? html`<span class="fin-muted">${left.length}</span>` : '')}
        ${left.length ? html`<div class="fin-card fin-list">${left.map((e) => html`<div class="fv-left-row">${html`<span class="fv-date ${e.date < today ? 'late' : ''}">${e.date.slice(8)}<small>${new Date(`${e.date}T12:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</small></span>`}${dayRow(e)}</div>`)}</div>`
          : html`<div class="fin-card fin-empty small">${icon('tick')}<strong>${key < now ? 'Nada ficou pendente' : 'Tudo em dia'}</strong><p>${key < now ? '' : 'Não falta pagar nem receber nada neste mês.'}</p></div>`}
      </section>
      </div>
    </div>
  `;
}
// ---------------------------------------------------------------------------
// Início: assistente do dia, linha da semana e o que vem depois
// ---------------------------------------------------------------------------
// Movimentos de vários meses juntos, por dia (para a semana e os próximos dias).
function daysAhead(months = 3) {
  const map = new Map();
  for (let i = -1; i < months; i++) for (const [d, items] of dayMap(addMonths(thisMonth(), i))) map.set(d, [...(map.get(d) || []), ...items]);
  return map;
}
const daysUntil = (iso) => Math.round((new Date(`${iso}T12:00`) - new Date(`${todayISO()}T12:00`)) / 86400e3);
const whenLabel = (n) => (n === 0 ? 'hoje' : n === 1 ? 'amanhã' : n < 0 ? `há ${-n} ${-n === 1 ? 'dia' : 'dias'}` : `daqui ${n} dias`);
const listNames = (items) => {
  const names = items.slice(0, 2).map((e) => `${e.description} (${money(e.amount)})`);
  return items.length > 2 ? `${names.join(', ')} e mais ${items.length - 2}` : names.join(' e ');
};

// Meia-lua do mês: enche do verde (começo) ao vermelho (fim), com o dia de hoje grande no centro.
function monthGauge(dt, weekday, monthName) {
  const day = dt.getDate();
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  const p = last > 1 ? (day - 1) / (last - 1) : 1;
  const left = last - day;
  const R = 86, cx = 100, cy = 100;
  const ang = Math.PI * (1 - p);
  const kx = (cx + R * Math.cos(ang)).toFixed(1), ky = (cy - R * Math.sin(ang)).toFixed(1);
  const hue = Math.round(130 * (1 - p)); // 130 = verde, 0 = vermelho
  const arc = `M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx + R} ${cy}`;
  const mon = monthName.slice(0, 3);
  return html`<div class="fin-gauge" style="--knob:hsl(${hue} 75% 42%)">
    <div class="fin-gauge-arc">
    <svg viewBox="0 0 200 112" aria-hidden="true">
      <defs><linearGradient id="fin-month-grad" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#34C759"/><stop offset=".55" stop-color="#FFCC00"/><stop offset=".8" stop-color="#FF9500"/><stop offset="1" stop-color="#FF3B30"/>
      </linearGradient></defs>
      <path d="${arc}" fill="none" stroke="var(--f-track)" stroke-width="12" stroke-linecap="round"/>
      <path d="${arc}" fill="none" stroke="url(#fin-month-grad)" stroke-width="12" stroke-linecap="round" pathLength="100" stroke-dasharray="${(p * 100).toFixed(2)} 100"/>
      <circle cx="${kx}" cy="${ky}" r="9" fill="#fff" stroke="var(--knob)" stroke-width="4"/>
    </svg>
    <div class="fin-gauge-center"><strong>${day}</strong></div>
    </div>
    <div class="fin-gauge-legend"><span>1 ${mon}</span><b>${weekday}</b><span>${last} ${mon}</span></div>
    <p class="fin-gauge-left">${left === 0 ? 'Último dia do mês' : left === 1 ? 'Falta 1 dia para acabar o mês' : `Faltam ${left} dias para acabar ${monthName}`}</p>
  </div>`;
}

function home() {
  const today = todayISO();
  const now = thisMonth();
  const map = daysAhead(3);
  const name = firstName(state.user?.name);
  const hour = new Date().getHours();
  const hello = hour < 5 ? 'Boa noite' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const week = Array.from({ length: 7 }, (_, i) => shiftISO(today, { d: i }));
  if (!week.includes(ui.wday)) ui.wday = today;
  const pending = (d) => (map.get(d) || []).filter((e) => !e.paid);
  const todayOut = pending(today).filter((e) => e.kind === 'expense');
  const todayIn = pending(today).filter((e) => e.kind === 'income');
  const weekOut = week.flatMap((d) => pending(d)).filter((e) => e.kind === 'expense');
  const late = [...map.entries()].filter(([d]) => d < today).flatMap(([, items]) => items.filter((e) => !e.paid));
  const after = [...map.entries()].filter(([d]) => d > week[6]).sort(([a], [b]) => a.localeCompare(b)).flatMap(([, items]) => items.filter((e) => !e.paid)).slice(0, 6);
  const selItems = (map.get(ui.wday) || []).sort((a, b) => (a.kind === 'income' ? -1 : 1) - (b.kind === 'income' ? -1 : 1));
  const bal = totalBalance();
  const end = forecast(now);
  const daily = dailyBudget();
  const dt = new Date(`${today}T12:00`);
  const weekday = ((w) => w.charAt(0).toUpperCase() + w.slice(1))(dt.toLocaleDateString('pt-BR', { weekday: 'long' }));
  const monthName = dt.toLocaleDateString('pt-BR', { month: 'long' });
  const selLabel = ui.wday === today ? 'Hoje' : (() => { const t = new Date(`${ui.wday}T12:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); })();

  return html`
    <header class="fin-head fin-head-home">
      <div class="fin-head-row"><div class="fin-head-title"><p class="fin-sub">${hello}${name ? `, ${name}` : ''}</p></div>
        <div class="fin-head-actions">${eyeBtn()}<a class="fin-round m-only" href="#/inicio" title="Casamento" aria-label="Abrir o casamento">${icon('heart')}</a></div></div>
      ${coupleBanner()}
    </header>
    <div class="fin-home2">
      <div class="h2-left">
      <section class="fin-card fin-today">
        ${monthGauge(dt, weekday, monthName)}
        <div class="fin-today-msg">
          <p class="big">${todayOut.length ? html`Hoje vence ${listNames(todayOut)}.` : 'Sem gastos programados para hoje.'}</p>
          ${todayIn.length ? html`<p>💰 Hoje entra ${listNames(todayIn)}.</p>` : ''}
          <p>${weekOut.length ? html`Nos próximos 7 dias saem <b>${amt(sum(weekOut, (e) => e.amount))}</b> em ${weekOut.length} ${weekOut.length === 1 ? 'conta' : 'contas'}.` : 'Semana tranquila: nada a pagar nos próximos 7 dias.'}</p>
          ${late.length ? html`<p class="red">⚠️ ${late.length === 1 ? 'Tem 1 conta atrasada' : `Tem ${late.length} contas atrasadas`} (${amt(sum(late, (e) => e.amount))}). <button type="button" class="fin-link" data-act="older">Resolver</button></p>` : ''}
        </div>
      </section>

      <section class="fin-card fin-week">
        <div class="fin-week-strip">${week.map((d) => {
          const items = map.get(d) || [];
          const out = items.filter((e) => e.kind === 'expense' && !e.paid);
          const inc = items.filter((e) => e.kind === 'income' && !e.paid);
          const wd = new Date(`${d}T12:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
          return html`<button type="button" class="fin-wday ${d === ui.wday ? 'sel' : ''} ${d === today ? 'today' : ''}" data-act="week-day" data-v="${d}">
            <small>${d === today ? 'hoje' : wd}</small><strong>${Number(d.slice(8))}</strong>
            <span class="fin-dots">${out.length ? html`<i class="out"></i>` : ''}${inc.length ? html`<i class="in"></i>` : ''}</span>
            ${out.length ? html`<em class="amt">−${compact(sum(out, (e) => e.amount))}</em>` : html`<em> </em>`}
          </button>`;
        })}</div>
        <div class="fin-week-day">
          <h3>${selLabel}</h3>
          ${selItems.length ? html`<div class="fin-list">${selItems.map(dayRow)}</div>` : html`<p class="fin-muted">Nada programado${ui.wday === today ? ' para hoje' : ' neste dia'}.</p>`}
        </div>
      </section>

      <a class="fin-card fin-goto" href="#/fin/mes">${icon('calendar')}<span><b>Visão geral do mês</b><small>Calendário de ${monthLabel(now).toLowerCase()} com o previsto de cada dia</small></span>${icon('chevron')}</a>
      </div>
      <div class="h2-right">
      <section class="fv-money">
        <div class="fin-card fin-kpi">
          <span class="fin-label">Saldo hoje</span>
          <strong class="fin-kpi-amt ${bal < 0 ? 'neg' : ''}">${amt(bal)}</strong>
          <button type="button" class="fin-link" data-act="adjust">${icon('edit')} Não bate? Ajustar saldo</button>
        </div>
        <div class="fin-card fin-kpi fin-kpi-hero">
          <span class="fin-label">Previsão para o fim do mês</span>
          <strong class="fin-kpi-amt ${end < 0 ? 'neg' : 'pos'}">${amt(end)}</strong>
          <small>${!daily ? 'sem contar mercado, comida e outros gastos do dia a dia' : dailyLeft(now) > 0 ? html`já descontando ${amt(dailyLeft(now))} que ainda devem sair no dia a dia (de ${amt(daily)} por mês)` : html`os ${amt(daily)} de gastos do dia a dia deste mês já foram lançados`}</small>
          <button type="button" class="fin-link" data-act="daily">${icon('edit')} ${daily ? 'Mudar gastos do dia a dia' : 'Incluir gastos do dia a dia'}</button>
        </div>
      </section>
      <section class="fin-section fv-after">
        ${sectionHead('Depois desta semana', html`<a href="#/fin/mes">Mês inteiro</a>`)}
        ${after.length ? html`<div class="fin-card fin-list">${after.map((e) => html`<div class="fv-left-row"><span class="fv-date in" title="${e.date.split('-').reverse().join('/')}"><small>daqui</small>${daysUntil(e.date)}<small>${daysUntil(e.date) === 1 ? 'dia' : 'dias'}</small></span>${dayRow(e)}</div>`)}</div>`
          : html`<div class="fin-card fin-empty small"><p>Nada programado nas próximas semanas.</p></div>`}
      </section>

      </div>
    </div>
  `;
}

// Pendências de meses anteriores (abre numa janela, sem poluir o mês atual).
const olderPending = () => [1, 2, 3].flatMap((i) => [...dayMap(addMonths(thisMonth(), -i)).values()].flat().filter((e) => !e.paid)).sort((a, b) => a.date.localeCompare(b.date));
function olderSheet() {
  openModal({
    title: 'Pendências de meses anteriores',
    live: true,
    body: (m) => {
      const list = olderPending();
      if (!list.length) { setTimeout(() => m.close()); return html`<p class="form-intro">Tudo resolvido.</p>`; }
      return html`<p class="form-intro">Marque como pago o que já foi resolvido, ou abra para ajustar ou pular. Elas não aparecem no mês atual.</p>
        <div class="fin-list fin-older-list">${list.map((e) => html`<div class="fv-left-row"><span class="fv-date late">${e.date.slice(8)}<small>${monthLabel(monthOf(e.date), { short: true })}</small></span>${dayRow(e)}</div>`)}</div>`;
    },
    onMount(m) {
      m.body.onclick = (ev) => {
        const a = ev.target.closest('[data-act]');
        if (!a) return;
        const e = findEntry(a.dataset.id, a.dataset.month);
        if (!e) return;
        if (a.dataset.act === 'quick-pay') quickPay(e);
        else if (a.dataset.act === 'entry') { m.close(); openEntry(e); }
      };
    },
  });
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
  const shown = ui.extDay && monthOf(ui.extDay) === ui.month ? list.filter((e) => e.date === ui.extDay) : list;
  const days = new Map();
  for (const e of [...shown].reverse()) { if (!days.has(e.date)) days.set(e.date, []); days.get(e.date).push(e); }
  const count = (k) => all.filter(EXT_FILTERS[k]).length;
  const dayHead = (d, items) => {
    const net = sum(items, (e) => (e.kind === 'income' ? e.amount : e.kind === 'expense' ? -e.amount : 0));
    const raw0 = new Date(`${d}T12:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const label = d === todayISO() ? `Hoje, ${raw0}` : raw0.charAt(0).toUpperCase() + raw0.slice(1);
    return html`<div class="fin-ext-day-head ${d === todayISO() ? 'today' : ''}"><span>${label}</span><span class="amt ${net > 0 ? 'pos' : ''}">${net ? `${net > 0 ? '+' : '−'} ${money(Math.abs(net))}` : ''}</span></div>`;
  };
  return html`
    ${pageHead('Extrato', { month: true, actions: html`<button type="button" class="fin-round" data-act="export" title="Exportar planilha" aria-label="Exportar planilha">${icon('download')}</button>` })}
    <div class="fin-toolbar">
      <label class="fin-search">${icon('search')}<input type="search" id="fin-q" value="${ui.q}" placeholder="Buscar descrição, categoria, loja…" autocomplete="off" enterkeyhint="search"></label>
      <div class="fin-chips">${[['tudo', 'Tudo'], ['receitas', 'Receitas'], ['despesas', 'Despesas'], ['pendentes', 'Pendentes'], ['cartao', 'Cartão']].map(([k, l]) => html`<button type="button" class="fin-chip ${ui.ext === k ? 'on' : ''}" data-act="ext-filter" data-v="${k}">${l}<span>${count(k)}</span></button>`)}</div>
    </div>
    ${dayStrip(list)}
    <div class="fin-ext-sum">
      <div><span class="fin-label">Entradas</span><b class="pos">${amt(inc)}</b></div>
      <div><span class="fin-label">Saídas</span><b class="neg">${amt(exp)}</b></div>
      <div><span class="fin-label">Resultado</span><b>${amt(inc - exp, { sign: true })}</b></div>
      <div><span class="fin-label">Despesas pendentes</span><b>${amt(pend)}</b></div>
    </div>
    ${shown.length ? html`<div class="fin-ext-days">${[...days.entries()].map(([d, items]) => html`<section class="fin-ext-day">${dayHead(d, items)}<div class="fin-tx-grid">${items.map(entryCard)}</div></section>`)}</div>`
      : ui.extDay ? html`<div class="fin-card fin-empty small">
          <p>${q || ui.ext !== 'tudo' ? 'Nada com esse filtro' : 'Nada lançado'} ${ui.extDay === todayISO() ? 'hoje' : `em ${fmtDate(ui.extDay, { day: 'numeric', month: 'long' })}`}.</p>
          <div class="fin-empty-actions">
            ${ui.extDay === todayISO() ? html`<button type="button" class="fin-btn" data-act="ext-add">${icon('plus')}Lançar</button>` : ''}
            <button type="button" class="fin-btn ghost" data-act="ext-day" data-v="">Ver o mês todo</button>
          </div>
        </div>`
      : emptyCard('list', q ? 'Nada encontrado' : 'Nenhum lançamento', q ? 'Tente outra busca.' : 'Use o botão + para lançar receitas, despesas e compras no cartão.')}
  `;
}
// Fita com os dias do mês (como uma agenda): pontinhos mostram o que há em cada dia; tocar filtra o dia.
function dayStrip(list) {
  const [y, m] = ui.month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const today = todayISO();
  const sel = ui.extDay && monthOf(ui.extDay) === ui.month ? ui.extDay : '';
  const byDay = new Map();
  for (const e of list) { if (!byDay.has(e.date)) byDay.set(e.date, []); byDay.get(e.date).push(e); }
  const days = Array.from({ length: last }, (_, i) => `${ui.month}-${String(i + 1).padStart(2, '0')}`);
  return html`<div class="fin-dstrip-wrap">
    <button type="button" class="fin-dstrip-all ${sel ? '' : 'on'}" data-act="ext-day" data-v="">Mês<small>todo</small></button>
    <div class="fin-dstrip" role="group" aria-label="Dias de ${monthLabel(ui.month)}">
      ${days.map((d) => {
        const items = byDay.get(d) || [];
        const inc = items.some((e) => e.kind === 'income');
        const late = items.some((e) => statusOf(e).cls === 'red');
        const exp = items.some((e) => e.kind === 'expense' || e.kind === 'transfer');
        const wd = new Date(`${d}T12:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').slice(0, 3);
        return html`<button type="button" class="fin-dday ${d === sel ? 'on' : ''} ${d === today ? 'today' : ''} ${items.length ? '' : 'empty'} ${d < today ? 'past' : ''}" data-act="ext-day" data-v="${d === sel ? '' : d}" aria-pressed="${d === sel ? 'true' : 'false'}" title="${fmtDate(d)}${items.length ? ` · ${items.length} ${items.length === 1 ? 'lançamento' : 'lançamentos'}` : ''}">
          <small>${wd}</small><strong>${Number(d.slice(8))}</strong>
          <span class="fin-dday-dots">${inc ? html`<i class="inc"></i>` : ''}${late ? html`<i class="late"></i>` : exp ? html`<i class="exp"></i>` : ''}</span>
        </button>`;
      })}
    </div>
  </div>`;
}
// Card de um lançamento (extrato): categoria e situação no topo, descrição, detalhes e o valor em destaque.
function entryCard(e) {
  const c = e.kind === 'transfer' ? { emoji: '↔️', color: '#8E8E93', name: 'Transferência' } : categoryOf(e.src, e.categoryId);
  const st = statusOf(e);
  const where = e.card ? `💳 ${e.card.name}` : e.kind === 'transfer' ? '' : (e.src.items.accounts.find((a) => a.id === e.accountId)?.name || (e.owner === 'wedding' ? 'Casamento' : ''));
  // Sem repetir o que já aparece no título (ex.: "Uber" na descrição e no estabelecimento).
  const party = e.party && !norm(e.description || '').includes(norm(e.party)) ? e.party : '';
  const details = [party, e.installments && `parcela ${e.installment}/${e.installments}`, e.shareLabel].filter(Boolean).join(' · ');
  const statusEl = canToggle(e)
    ? html`<button type="button" class="fin-pill fin-pill-btn ${st.cls}" data-act="toggle-paid" data-id="${e.id}" data-month="${e.month || ''}" title="${e.paid ? 'Marcar como pendente' : e.kind === 'income' ? 'Marcar como recebido' : 'Marcar como pago'}">${e.paid ? '✓ ' : ''}${st.label}</button>`
    : html`<span class="fin-pill ${st.cls}">${st.label}</span>`;
  return html`<div class="fin-tx-card ${e.kind} ${st.cls === 'red' ? 'late' : ''}" role="button" tabindex="0" data-act="entry" data-id="${e.id}" data-month="${e.month || ''}" style="--c:${c.color || '#8E8E93'}">
    <div class="fin-tx-top">${bubble(c, 'sm')}<span class="fin-tx-icons">${e.recurringId || e.rec ? html`<span class="fin-mini" title="Fixo">${icon('repeat')}</span>` : ''}${e.attachments?.length ? html`<span class="fin-mini" title="Tem comprovante">${icon('clip')}</span>` : ''}${ownerTag(e.owner)}</span>${statusEl}</div>
    <div class="fin-tx-title">${e.description || c.name}</div>
    <div class="fin-tx-meta">${[...new Set([c.name, where].filter(Boolean))].join(' · ')}</div>
    ${details ? html`<div class="fin-tx-meta">${details}</div>` : ''}
    <div class="fin-tx-amt ${e.kind}">${amt(e.amount, { sign: true, kind: e.kind })}</div>
  </div>`;
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
    const due = dayIn(key, r.day || 1);
    if (autoFixed(src) && due <= todayISO()) return html`<span class="fin-pill green">✓ ${r.kind === 'income' ? 'recebido' : 'pago'} · auto</span>`;
    return html`<span class="fin-pill ${due < todayISO() ? 'red' : 'orange'}">${r.kind === 'income' ? 'a receber' : 'a pagar'} dia ${r.day}</span>`;
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
        <div><span class="fin-label">Gastos fixos neste mês</span><strong class="neg">${amt(t.expense)}</strong>${t.parcels > 0 ? html`<small class="fin-muted">inclui ${amt(t.parcels)} de parcelas</small>` : ''}</div>
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
    ${parcelsSection()}
  `;
}
// Parcelas em andamento: casamento (por fornecedor, a sua parte) e compras parceladas.
function parcelsSection() {
  const plans = installmentPlans();
  if (!plans.length) return '';
  const short = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '').replace(' de ', '/');
  const row = (pl) => {
    const c = pl.wedding ? WEDDING_CAT : categoryOf(pl.src, pl.next.categoryId);
    const paidN = pl.total - pl.left;
    const meta = [
      pl.left === 1 ? 'última parcela' : `faltam ${pl.left} de ${pl.total}`,
      pl.left > 1 ? `até ${short(pl.end)}` : '',
      pl.card ? `💳 ${pl.card.name}` : '',
      pl.wedding && pl.shareLabel ? pl.shareLabel.replace(/ de R\$.*/, '') : '',
    ].filter(Boolean).join(' · ');
    return html`<div class="fin-row tr" role="button" tabindex="0" data-act="${pl.wedding ? 'plan-wedding' : 'entry'}" data-id="${pl.next.id}" data-month="${pl.next.month || ''}">
      ${bubble(c)}
      <span class="fin-row-main"><span class="fin-row-title">${pl.title}${ownerTag(pl.owner)}</span><span class="fin-row-meta">${meta}</span>
        <span class="fin-plan-bar">${meter(paidN / pl.total, c.color || 'var(--f-blue)')}</span></span>
      <span class="td d-only">${pl.wedding ? 'Casamento' : c.name}</span>
      <span class="td d-only">${pl.card ? 'fatura de' : 'próxima'} ${shortDate(pl.nextDate)}</span>
      <span class="td d-only">falta ${amt(pl.leftAmount)}</span>
      <span class="fin-row-end"><span class="fin-row-amt expense">${amt(pl.perMonth)}<small class="fin-muted">/mês</small></span><span class="m-only fin-muted small-date">${pl.card ? 'fatura de' : 'próxima'} ${shortDate(pl.nextDate)}</span></span>
    </div>`;
  };
  const wedding = plans.filter((p) => p.wedding);
  const others = plans.filter((p) => !p.wedding);
  const head = tableHead(['Parcelas', 'Categoria', 'Próxima', 'Falta pagar', 'Por mês']);
  return html`
    ${wedding.length ? html`<section class="fin-section">
      ${sectionHead('Parcelas do casamento', html`<span class="fin-muted">falta ${amt(sum(wedding, (p) => p.leftAmount))}</span>`)}
      <div class="fin-table">${head}<div class="fin-card fin-list">${wedding.map(row)}</div></div>
    </section>` : ''}
    ${others.length ? html`<section class="fin-section">
      ${sectionHead('Compras parceladas', html`<span class="fin-muted">falta ${amt(sum(others, (p) => p.leftAmount))}</span>`)}
      <div class="fin-table">${head}<div class="fin-card fin-list">${others.map(row)}</div></div>
    </section>` : ''}`;
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
  const inv = invoiceStatus(src, card, key);
  const total = inv.total;
  const pays = invoicePayments(card, key);
  const due = invoiceDue(card, key), closing = invoiceClosing(card, key);
  const today = todayISO();
  const st = inv.isPaid ? ['green', 'Paga'] : inv.partial ? [due < today ? 'red' : 'orange', due < today ? 'Paga em parte · vencida' : 'Paga em parte'] : due < today && total > 0 ? ['red', 'Vencida'] : closing <= today ? ['orange', 'Fechada'] : ['blue', 'Aberta'];
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
          <div class="fin-invoice-dates"><span>Fecha <b>${fmtDate(closing)}</b></span><span>Vence <b>${fmtDate(due)}</b></span></div>
          ${inv.hasPayments ? html`<div class="fin-inv-paid">
            ${meter(total > 0 ? inv.paid / total : 1, inv.isPaid ? 'var(--f-green)' : 'var(--f-orange)')}
            <div class="fin-inv-paid-row"><span>Pago <b class="pos">${amt(inv.paid)}</b></span>${inv.left > 0 ? html`<span>Falta <b class="neg">${amt(inv.left)}</b></span>` : ''}</div>
            <div class="fin-inv-pays">${pays.map((p, i) => html`<div class="fin-inv-pay"><span>${p.date ? fmtDate(p.date) : 'pagamento'}${p.accountId ? html` · ${fin.items.accounts.find((a) => a.id === p.accountId)?.name || ''}` : ''}</span><b class="amt">${money(p.amount != null ? p.amount : total)}</b>${mine ? html`<button type="button" class="btn-icon sm" data-act="inv-unpay" data-v="${i}" title="Desfazer este pagamento" aria-label="Desfazer este pagamento">${icon('x')}</button>` : ''}</div>`)}</div>
          </div>` : ''}
          ${mine ? html`<div class="fin-invoice-actions">
            ${!inv.isPaid && total > 0 ? html`<button type="button" class="fin-btn" data-act="inv-pay">${inv.partial ? `Pagar o restante (${money(inv.left)})` : 'Pagar fatura'}</button>` : ''}
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
      ${item('#/fin/mes', 'calendar', 'red', 'Visão geral do mês')}
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
      <div class="fin-actions-row"><button type="button" class="fin-btn ghost" data-act="adjust">${icon('edit')} Ajustar saldo</button><button type="button" class="fin-btn ghost" data-act="transfer">${icon('swap')} Transferir entre contas</button><button type="button" class="fin-btn ghost" data-act="new-account">${icon('plus')} Nova conta</button></div>
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
  const proj = Array.from({ length: 6 }, (_, i) => { const k = addMonths(thisMonth(), i); return { key: k, bal: forecast(k) }; });
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
    <section class="fin-section">${sectionHead('Previsão')}
      <div class="fin-card fin-list">
        <button type="button" class="fin-switch-row fin-row-btn" data-act="daily"><span class="fin-row-main"><span class="fin-row-title">Gastos do dia a dia por mês</span><span class="fin-row-meta">Mercado, comida, transporte… A previsão do fim do mês desconta o que ainda deve sair disso.</span></span><span class="fin-row-detail">${st.dailyBudget ? money(st.dailyBudget) : 'Não definido'}</span>${icon('chevron')}</button>
        <button type="button" class="fin-switch-row fin-row-btn" data-act="adjust"><span class="fin-row-main"><span class="fin-row-title">Ajustar saldo das contas</span><span class="fin-row-meta">Quando o saldo do app não bater com o do banco.</span></span>${icon('chevron')}</button>
      </div>
    </section>
    <section class="fin-section">${sectionHead('Atalho do iPhone')}
      <div class="fin-card fin-list">
        <button type="button" class="fin-switch-row fin-row-btn" data-act="shortcut"><span class="fin-row-main"><span class="fin-row-title">Lançar pela Central de Controle</span><span class="fin-row-meta">Um atalho do iPhone pergunta o valor e a descrição e lança na hora, sem abrir o site. Também funciona no botão de Ação e na Siri.</span></span>${icon('chevron')}</button>
      </div>
    </section>
    <section class="fin-section">${sectionHead('Fixos')}
      <div class="fin-card fin-list">
        ${sw('autoFixed', st.autoFixed !== false, 'Fixos se confirmam sozinhos no dia', 'Salário, aluguel, contas: no dia, contam como recebidos ou pagos, sem você precisar confirmar. Se o valor for outro (luz, água) ou não acontecer, toque nele para ajustar ou pular.')}
      </div>
    </section>
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
    <p class="fin-foot fin-version">Versão do site: <b>${state.status?.build || '—'}</b>${state.status?.startedAt ? html` · no ar desde ${new Date(state.status.startedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</p>
    </div>
  `;
}

// Atalho do iPhone: chave pessoal + passo a passo para montar o atalho no app Atalhos.
async function shortcutDialog() {
  const url = `${location.origin}/api/atalho`;
  const st = { info: null, token: '', busy: false, err: '' };
  const copyBtn = (v, label) => html`<button type="button" class="fin-copy" data-copy="${v}">${icon('paste')}<span>${label}</span></button>`;
  const codeRow = (label, v, hint = '') => html`<div class="fin-code-row"><span class="fin-label">${label}</span><code>${v}</code>${hint ? html`<small class="fin-muted">${hint}</small>` : ''}${copyBtn(v, 'Copiar')}</div>`;
  const m = openModal({
    title: 'Atalho do iPhone',
    body: () => {
      if (!st.info) return html`<div class="fin-loading"><span class="spinner"></span></div>`;
      const on = st.info.active;
      const aiPrompt = `Crie um atalho chamado "Lançar gasto" com exatamente estas 3 ações, nesta ordem, sem usar nenhum modelo de IA dentro do atalho:
1. Pedir Entrada, do tipo Texto, com a pergunta "Quanto e com o quê? (ex.: 45,90 mercado)".
2. Obter Conteúdo do URL, no endereço ${url}, método POST, corpo da solicitação JSON com três campos de texto: "chave" com o valor ${st.token || 'COLE_SUA_CHAVE_AQUI'}, "tipo" com o valor "gasto" e "texto" com a Entrada Fornecida da ação 1.
3. Mostrar Notificação com o Conteúdo do URL.`;
      const used = st.info.lastUsedAt ? `usada pela última vez em ${new Date(st.info.lastUsedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'ainda não usada';
      return html`<div class="fin-shortcut">
        <p>Crie um atalho no app <b>Atalhos</b> que pergunta <b>quanto e com o quê</b> (ex.: <i>45,90 mercado</i>) e lança o gasto direto nas suas finanças. Depois coloque esse atalho na <b>Central de Controle</b>, no <b>botão de Ação</b> ou chame pela <b>Siri</b>.</p>
        ${st.err ? html`<p class="fin-err">${st.err}</p>` : ''}
        <div class="fin-card fin-shortcut-key">
          ${codeRow('Endereço', url)}
          ${st.token ? codeRow('Sua chave', st.token, 'Copie agora: por segurança ela não aparece de novo. Se perder, é só gerar outra.')
            : html`<div class="fin-code-row"><span class="fin-label">Sua chave</span><span>${on ? html`Ligada · ${used}` : 'Nenhuma chave ainda'}</span></div>`}
          <div class="fin-shortcut-actions">
            <button type="button" class="fin-btn" data-sc="new" ${st.busy ? raw('disabled') : ''}>${on ? 'Gerar nova chave' : 'Gerar chave'}</button>
            ${on ? html`<button type="button" class="fin-btn ghost danger" data-sc="off" ${st.busy ? raw('disabled') : ''}>Desligar</button>` : ''}
          </div>
          ${on && !st.token ? html`<small class="fin-muted">Gerar uma nova chave desliga a anterior: atualize o atalho com a nova.</small>` : ''}
        </div>
        <p class="fin-muted">A chave só serve para lançar gastos e recebimentos; com ela não dá para ver nada das suas finanças. Não compartilhe.</p>

        <h3>Jeito fácil: pedir para a IA do app Atalhos</h3>
        <p>Se ao tocar em <b>+</b> no app Atalhos abrir uma conversa com a IA, copie o texto abaixo e cole lá.${st.token ? ' O texto já vem com a sua chave.' : html` Dica: toque em <b>${st.info.active ? 'Gerar nova chave' : 'Gerar chave'}</b> acima antes de copiar, assim o texto já vem com a chave.`}</p>
        <div class="fin-code-row fin-prompt"><code>${aiPrompt}</code>${copyBtn(aiPrompt, 'Copiar texto')}</div>
        <p class="fin-muted">Depois confira se o atalho ficou com estas 3 ações. Se a IA errar alguma coisa, dá para tocar na ação e corrigir à mão:</p>
        <ol class="fin-steps">
          <li><b>Pedir Entrada</b> (Texto): <i>"Quanto e com o quê?"</i>. Você responde tudo junto, por exemplo <code>45,90 mercado</code>.</li>
          <li><b>Obter Conteúdo do URL</b>: o <b>endereço</b> acima, método <b>POST</b>, corpo <b>JSON</b> com 3 campos de texto:<br>
            <code>chave</code> → sua chave · <code>tipo</code> → <code>gasto</code> · <code>texto</code> → <b>Entrada Fornecida</b></li>
          <li><b>Mostrar Notificação</b> com <b>Conteúdo do URL</b>. Ela confirma o que foi lançado.</li>
        </ol>
        <p class="fin-muted">Para recebimentos, duplique o atalho, chame de <b>Lançar recebimento</b> e troque <code>gasto</code> por <code>recebimento</code>.</p>

        <h3>Colocar na Central de Controle</h3>
        <ol class="fin-steps">
          <li>Abra a Central de Controle (deslize do canto de cima à direita).</li>
          <li>Toque e segure num espaço vazio, toque em <b>Adicionar um Controle</b> e procure <b>Atalho</b>.</li>
          <li>Escolha <b>Lançar gasto</b>. Pronto: um toque abre as perguntas.</li>
        </ol>
        <p class="fin-muted">Precisa de iOS 18 ou mais novo. Em iPhones com botão de Ação: Ajustes › Botão de Ação › Atalho. Pela Siri: "E aí Siri, lançar gasto".</p>

        <details class="fin-more"><summary>Campos opcionais</summary>
          <p class="fin-muted">A categoria e a conta são escolhidas sozinhas: o mesmo que você usou da última vez para essa descrição (ex.: "Mercado"). Se quiser fixar, adicione no JSON:</p>
          <ul class="fin-muted">
            <li><code>categoria</code> → nome da categoria (ex.: Mercado)</li>
            <li><code>conta</code> → nome da conta (ex.: Nubank)</li>
            <li><code>cartao</code> → nome do cartão, para lançar como compra no cartão</li>
          </ul>
        </details>
      </div>`;
    },
    onMount: (mm) => {
      mm.body.querySelectorAll('[data-copy]').forEach((b) => {
        b.onclick = async () => {
          try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copiado'); } catch { toast('Não deu para copiar: toque e segure no texto para copiar.'); }
        };
      });
      mm.body.querySelectorAll('[data-sc]').forEach((b) => {
        b.onclick = async () => {
          if (b.dataset.sc === 'off' && !confirm('Desligar a chave? O atalho para de funcionar até você gerar outra.')) return;
          st.busy = true; st.err = ''; mm.render();
          try {
            if (b.dataset.sc === 'new') { const r = await api('POST', '/api/fin-token'); st.token = r.token; st.info = { active: true, createdAt: r.createdAt, lastUsedAt: null }; }
            else { await api('DELETE', '/api/fin-token'); st.token = ''; st.info = { active: false }; }
          } catch (e) { st.err = e.message; }
          st.busy = false; mm.render();
        };
      });
    },
  });
  try { st.info = await api('GET', '/api/fin-token'); } catch (e) { st.info = { active: false }; st.err = e.message; }
  m.render();
}

// ---------------------------------------------------------------------------
// Rotas e eventos
// ---------------------------------------------------------------------------
export const FIN_ROUTES = {
  '': { title: 'Início', tab: '', render: home },
  mes: { title: 'Visão geral do mês', tab: '', render: monthView },
  extrato: { title: 'Extrato', tab: 'extrato', render: extrato, enter: () => { ui.month = thisMonth(); ui.extDay = todayISO(); } },
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
function quickPay(e) {
  if (!e) return;
  if (e.invoiceOf) payInvoiceForm(e.invoiceOf, e.invoice);
  else if (e.virtual) confirmOccurrence(e);
  else if (e.tx) run(() => markPaid(e.tx));
}
// Pagar/receber com um toque (ou desfazer).
function togglePaid(e) {
  if (!e || !canToggle(e)) return;
  if (e.virtual) { confirmOccurrence(e); return; }
  if (e.paid) run(async () => { await fupdate('transactions', e.tx.id, { paid: false }); toast('Marcado como pendente'); });
  else run(() => markPaid(e.tx));
}

export function mountFin(el, emitView) {
  // Fita de dias do extrato: deixa o dia escolhido (ou hoje) no meio.
  const strip = el.querySelector('.fin-dstrip');
  const focusDay = strip && (strip.querySelector('.fin-dday.on') || strip.querySelector('.fin-dday.today'));
  if (focusDay) strip.scrollLeft = focusDay.offsetLeft - strip.clientWidth / 2 + focusDay.offsetWidth / 2;
  el.onclick = (ev) => {
    const a = ev.target.closest('[data-act]');
    if (!a || !el.contains(a)) return;
    const act = a.dataset.act;
    const id = a.dataset.id;
    switch (act) {
      case 'hide': toggleHidden(); break;
      case 'scope': setScope(a.dataset.v); break;
      case 'month': ui.month = addMonths(ui.month, Number(a.dataset.d)); ui.day = ''; ui.extDay = ''; emitView(); break;
      case 'month-today': ui.month = thisMonth(); ui.day = ''; ui.extDay = ''; emitView(); break;
      case 'goto-month': ui.month = a.dataset.v; ui.day = ''; ui.extDay = ''; emitView(); break;
      case 'seg': if (a.dataset.group === 'plan') ui.plan = a.dataset.v; else if (a.dataset.group === 'cat') ui.catKind = a.dataset.v; emitView(); break;
      case 'seg-plan': ui.plan = a.dataset.v; break; // o link segue para #/fin/planejar
      case 'ext-day': ui.extDay = a.dataset.v; emitView(); break;
      case 'ext-add': addSheet(); break;
      case 'ext-filter': ui.ext = a.dataset.v; if (location.hash.startsWith('#/fin/extrato')) emitView(); break;
      case 'entry': openEntry(findEntry(id, a.dataset.month)); break;
      case 'toggle-paid': togglePaid(findEntry(id, a.dataset.month)); break;
      case 'quick-pay': quickPay(findEntry(id, a.dataset.month)); break;
      case 'cal-day': ui.day = a.dataset.v; emitView(); break;
      case 'week-day': ui.wday = a.dataset.v; emitView(); break;
      case 'plan-wedding': location.hash = '#/orcamento?pagamentos'; break;
      case 'adjust': adjustBalanceForm(); break;
      case 'daily': dailyBudgetForm(); break;
      case 'shortcut': shortcutDialog(); break;
      case 'older': olderSheet(); break;
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
      case 'inv-pay': case 'inv-unpay': case 'card-buy': case 'card-edit': {
        const card = fin.items.cards.find((c) => c.id === ui.cardId);
        if (!card) break;
        const key = ui.cardKey.startsWith(`${card.id}:`) ? ui.cardKey.split(':')[1] : currentInvoiceKey(card);
        if (act === 'inv-pay') payInvoiceForm(card, key);
        else if (act === 'inv-unpay') run(() => removeInvoicePayment(card, key, Number(a.dataset.v)));
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
