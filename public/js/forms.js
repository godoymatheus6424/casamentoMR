// Formulários e componentes compartilhados entre telas.
import { state, create, update, updateMany, remove, removePayments, bulkCreate, saveSettings, uploadFile, updateFile, deleteFile, byId, emit } from './store.js';
import { api } from './api.js';
import { html, raw, icon, formModal, openModal, toast, todayISO, shiftISO, money, moneyInput, parseMoney, fmtSize, fmtDate, confirmDialog, selectOptions, sum, run } from './ui.js';
import { PAYMENT_METHODS, FILE_CATEGORIES, fileCategory, IMAGE_EXT, paymentsOf, telLink, waLink, igLink, webLink, names, vendorSplit, splitLabel, splitPeople, DEFAULT_SPLIT } from './domain.js';

export function weddingForm() {
  formModal({
    title: 'Detalhes do casamento',
    size: 'lg',
    values: state.settings,
    fields: [
      { name: 'partner1', label: 'Nome de um(a) noivo(a)' },
      { name: 'partner2', label: 'Nome do(a) outro(a)' },
      { name: 'date', label: 'Data do casamento', type: 'date' },
      { name: 'time', label: 'Horário da cerimônia', type: 'time' },
      { name: 'ceremonyPlace', label: 'Local da cerimônia' },
      { name: 'ceremonyAddress', label: 'Endereço da cerimônia' },
      { name: 'receptionPlace', label: 'Local da recepção' },
      { name: 'receptionAddress', label: 'Endereço da recepção' },
      { name: 'guestEstimate', label: 'Nº estimado de convidados', type: 'number', min: 0 },
      { name: 'budgetTotal', label: 'Orçamento total', type: 'money' },
      { name: 'style', label: 'Estilo', placeholder: 'Ex.: rústico, clássico, praia, boho…' },
      { name: 'dressCode', label: 'Traje', placeholder: 'Ex.: esporte fino' },
      { name: 'palette', label: 'Paleta de cores', placeholder: 'Ex.: terracota, oliva, #c9a27e', hint: 'Separe por vírgulas. Cores reconhecidas aparecem como amostras.' },
      { name: 'hashtag', label: 'Hashtag / site', placeholder: '#anaepedro' },
      { name: 'overview', label: 'Nossa visão para o casamento', type: 'textarea', full: true, rows: 4, placeholder: 'Como vocês imaginam o dia? O que é prioridade? O que não pode faltar?' },
    ],
    onSubmit: async (d) => { await saveSettings(d); toast('Detalhes salvos'); },
  });
}

// ---------------------------------------------------------------------------
// Pagamentos / parcelas
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Quem paga um pagamento: como o fornecedor (padrão), só um dos noivos, ou outra divisão
// ---------------------------------------------------------------------------
function payerOptions(vendor, { custom = true, followLabel = '' } = {}) {
  const n = names();
  return [
    { value: 'vendor', label: followLabel || (vendor ? `Como o fornecedor (${splitLabel(vendorSplit(vendor))})` : `Os dois (${n.p1} e ${n.p2})`) },
    { value: 'p1', label: `Só ${n.p1}` },
    { value: 'p2', label: `Só ${n.p2}` },
    ...(custom ? [{ value: 'custom', label: 'Outra divisão…' }] : []),
  ];
}
function payerValues(split) {
  if (!split) return { payer: 'vendor', payP1: true, payP2: true, payOthers: '' };
  const others = (split.others || []).join(', ');
  if (split.p1 !== false && split.p2 === false && !others) return { payer: 'p1', payP1: true, payP2: false, payOthers: '' };
  if (split.p1 === false && split.p2 !== false && !others) return { payer: 'p2', payP1: false, payP2: true, payOthers: '' };
  return { payer: 'custom', payP1: split.p1 !== false, payP2: split.p2 !== false, payOthers: others };
}
function payerFields(vendor, opts = {}) {
  const n = names();
  const custom = (v) => v.payer === 'custom';
  return [
    { name: 'payer', label: 'Quem paga', type: 'select', full: true, options: payerOptions(vendor, opts) },
    { name: 'payP1', label: n.p1, type: 'checkbox', showIf: custom },
    { name: 'payP2', label: n.p2, type: 'checkbox', showIf: custom },
    { name: 'payOthers', label: 'Também dividem', full: true, placeholder: 'Ex.: Pais da noiva (separe por vírgula)', showIf: custom },
  ];
}
// Converte o que foi escolhido em split (null = segue o fornecedor).
function payerSplit(d) {
  const payer = d.payer || 'vendor';
  if (payer === 'vendor') return null;
  if (payer === 'p1') return { p1: true, p2: false, others: [] };
  if (payer === 'p2') return { p1: false, p2: true, others: [] };
  const others = String(d.payOthers || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6);
  if (!d.payP1 && !d.payP2 && !others.length) throw Object.assign(new Error('Marque pelo menos uma pessoa que paga.'), { field: 'payP1' });
  return { p1: !!d.payP1, p2: !!d.payP2, others };
}

// ---------------------------------------------------------------------------
// Dividir todas as parcelas (de um fornecedor ou do casamento inteiro)
// ---------------------------------------------------------------------------
const sameSplit = (a, b) => JSON.stringify(splitPeople(a).map((p) => p.key)) === JSON.stringify(splitPeople(b).map((p) => p.key));
export function splitAllDialog({ vendors = [], loose = [], title = 'Dividir todas as parcelas' } = {}) {
  const n = names();
  const pays = [...vendors.flatMap((v) => paymentsOf(v.id)), ...loose];
  const own = vendors.flatMap((v) => paymentsOf(v.id)).filter((p) => p.split);
  const first = vendors[0]?.split || DEFAULT_SPLIT;
  const allSame = vendors.every((v) => sameSplit(v.split, first));
  const start = allSame ? first : DEFAULT_SPLIT;
  const what = vendors.length === 1 && !loose.length
    ? `${pays.length} ${pays.length === 1 ? 'pagamento' : 'pagamentos'} de ${vendors[0].name}`
    : `${pays.length} ${pays.length === 1 ? 'pagamento' : 'pagamentos'} de ${vendors.length} ${vendors.length === 1 ? 'fornecedor' : 'fornecedores'}`;
  formModal({
    title,
    intro: `Marque quem divide. O valor de cada parcela é dividido em partes iguais entre os marcados (${what}). Nas finanças, cada um vê só a sua parte.`,
    values: { p1: start.p1 !== false, p2: start.p2 !== false, others: (start.others || []).join(', '), override: false },
    fields: [
      { name: 'p1', label: n.p1, type: 'checkbox' },
      { name: 'p2', label: n.p2, type: 'checkbox' },
      { name: 'others', label: 'Também dividem (opcional)', full: true, placeholder: 'Ex.: Pais da noiva (separe por vírgula)' },
      ...(own.length ? [{ name: 'override', label: `Mudar também ${own.length === 1 ? 'o pagamento' : `os ${own.length} pagamentos`} com divisão própria (ex.: entrada de um só)`, type: 'checkbox', full: true, hint: 'Desmarcado, essas exceções continuam como estão.' }] : []),
    ],
    submitLabel: 'Dividir',
    onSubmit: async (d) => {
      const others = String(d.others || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6);
      if (!d.p1 && !d.p2 && !others.length) throw Object.assign(new Error('Marque pelo menos uma pessoa.'), { field: 'p1' });
      const split = { p1: !!d.p1, p2: !!d.p2, others };
      for (const v of vendors) if (!sameSplit(v.split, split) || !v.split) await update('vendors', v.id, { split }, { silent: true });
      if (d.override) for (const p of own) await update('payments', p.id, { split: null }, { silent: true });
      for (const p of loose) if (!p.split || !sameSplit(p.split, split)) await update('payments', p.id, { split }, { silent: true });
      emit();
      const k = splitPeople(split).length;
      toast(k === 1 ? `Tudo fica com ${splitPeople(split)[0].label}` : `Dividido em ${k}: ${splitLabel(splitPeople(split))}`);
    },
  });
}

// ---------------------------------------------------------------------------
// Seleção de vários pagamentos (excluir ou mudar quem paga de uma vez)
// ---------------------------------------------------------------------------
export const paySel = { scope: '', ids: new Set() };
export const selOn = (scope) => paySel.scope === scope;
export function selStart(scope) { paySel.scope = scope; paySel.ids = new Set(); emit(); }
export function selEnd() { if (!paySel.scope) return; paySel.scope = ''; paySel.ids = new Set(); emit(); }
export function selToggle(id) { if (paySel.ids.has(id)) paySel.ids.delete(id); else paySel.ids.add(id); emit(); }
window.addEventListener('hashchange', () => { paySel.scope = ''; paySel.ids = new Set(); });
export function selBar(visibleIds) {
  const n = [...paySel.ids].filter((id) => visibleIds.includes(id)).length;
  const all = n === visibleIds.length && n > 0;
  return html`<div class="sel-bar">
    <label class="check small"><input type="checkbox" data-act="sel-all" ${all ? raw('checked') : ''}><span>${n ? `${n} ${n === 1 ? 'selecionado' : 'selecionados'}` : 'Marcar todos'}</span></label>
    <span class="spacer"></span>
    <button type="button" class="btn btn-ghost btn-sm" data-act="sel-payer" ${n ? '' : raw('disabled')}>${icon('users')}<span>Quem paga</span></button>
    <button type="button" class="btn btn-danger-ghost btn-sm" data-act="sel-del" ${n ? '' : raw('disabled')}>${icon('trash')}<span>Excluir</span></button>
    <button type="button" class="btn btn-ghost btn-sm" data-act="sel-cancel">Cancelar</button>
  </div>`;
}
// Trata os botões da barra; devolve true se a ação era da seleção.
export async function selAction(act, visibleIds) {
  const ids = [...paySel.ids].filter((id) => visibleIds.includes(id));
  if (act === 'sel-cancel') { selEnd(); return true; }
  if (act === 'sel-all') { paySel.ids = ids.length === visibleIds.length ? new Set() : new Set(visibleIds); emit(); return true; }
  if (act === 'sel-del') {
    if (!ids.length) return true;
    if (!(await confirmDialog(`Excluir ${ids.length === 1 ? 'o pagamento selecionado' : `os ${ids.length} pagamentos selecionados`}? Não dá para desfazer.`, { ok: 'Excluir' }))) return true;
    await run(async () => { await removePayments(ids); paySel.ids = new Set(); selEnd(); toast(ids.length === 1 ? 'Pagamento excluído' : `${ids.length} pagamentos excluídos`); });
    return true;
  }
  if (act === 'sel-payer') {
    if (!ids.length) return true;
    formModal({
      title: 'Quem paga',
      intro: `Vale para ${ids.length === 1 ? 'o pagamento selecionado' : `os ${ids.length} pagamentos selecionados`}.`,
      values: { payer: 'vendor', payP1: true, payP2: true, payOthers: '' },
      fields: payerFields(null, { followLabel: 'Como o fornecedor de cada um' }),
      onSubmit: async (d) => {
        const split = payerSplit(d);
        await updateMany('payments', ids, () => ({ split }));
        selEnd();
        toast('Divisão atualizada');
      },
    });
    return true;
  }
  return false;
}

export function paymentForm(p = {}, { vendorId } = {}) {
  const vendors = [...state.items.vendors].sort((a, b) => a.name.localeCompare(b.name));
  const vendor = byId('vendors', p.vendorId || vendorId);
  formModal({
    title: p.id ? 'Editar pagamento' : 'Novo pagamento',
    values: { vendorId: vendorId || '', dueDate: todayISO(), ...p, ...payerValues(p.split) },
    fields: [
      { name: 'description', label: 'Descrição', required: true, full: true, placeholder: 'Ex.: Sinal, Parcela 2/5…' },
      { name: 'vendorId', label: 'Fornecedor', type: 'select', full: true, options: [{ value: '', label: '— Nenhum —' }, ...vendors.map((v) => ({ value: v.id, label: v.name }))] },
      { name: 'amount', label: 'Valor', type: 'money', required: true },
      { name: 'dueDate', label: 'Vencimento', type: 'date' },
      { name: 'method', label: 'Forma de pagamento', type: 'select', options: PAYMENT_METHODS.map((m) => ({ value: m, label: m || '—' })) },
      { name: 'paidDate', label: 'Data do pagamento', type: 'date' },
      { name: 'paid', label: 'Já foi pago', type: 'checkbox', full: true },
      ...payerFields(vendor),
      { name: 'notes', label: 'Observações', type: 'textarea', full: true, rows: 2 },
    ],
    onSubmit: async (d) => {
      d.split = payerSplit(d);
      delete d.payer; delete d.payP1; delete d.payP2; delete d.payOthers;
      if (d.paid && !d.paidDate) d.paidDate = todayISO();
      if (!d.paid) d.paidDate = d.paidDate || '';
      if (p.id) await update('payments', p.id, d); else await create('payments', d);
      toast('Pagamento salvo');
    },
    onDelete: p.id ? async () => { await remove('payments', p.id); toast('Pagamento excluído'); } : null,
  });
}

export async function togglePaid(p, paid) {
  await update('payments', p.id, { paid, paidDate: paid ? (p.paidDate || todayISO()) : '' });
  toast(paid ? 'Marcado como pago' : 'Marcado como pendente');
}

// Data no dia escolhido do mês (ou no último dia, nos meses mais curtos).
// month0 pode passar de 11 (vira o ano seguinte).
function dayInMonth(year, month0, day) {
  const first = new Date(year, month0, 1);
  const y = first.getFullYear(), m = first.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

export function installmentsForm(vendor) {
  const scheduled = sum(paymentsOf(vendor.id), (p) => p.amount);
  const price = Number(vendor.price) || 0;
  const remaining = Math.max(0, price - scheduled);
  const now = new Date();
  // Meses para a 1ª parcela: do mês atual a 3 anos à frente.
  const months = Array.from({ length: 36 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: label[0].toUpperCase() + label.slice(1) };
  });
  const intro = price
    ? `Valor de ${vendor.name}: ${money(price)}${scheduled ? `, com ${money(scheduled)} já lançados em pagamentos. Falta parcelar ${money(remaining)}` : ''}. Você pode editar cada parcela depois.`
    : `Cria parcelas mensais para ${vendor.name}. Você pode editar cada uma depois.`;
  formModal({
    title: 'Gerar parcelas',
    intro,
    values: { total: remaining || '', count: 3, day: 10, start: months[1].value, entry: '', entryDate: todayISO(), entryPayer: 'vendor', parcelPayer: 'vendor' },
    fields: [
      { name: 'total', label: 'Valor a parcelar', type: 'money', required: true, full: true, hint: price ? 'Já vem com o valor que ainda não tem parcela.' : '' },
      { name: 'count', label: 'Número de parcelas', type: 'number', min: 1, max: 60, required: true },
      { name: 'day', label: 'Dia do pagamento', type: 'number', min: 1, max: 31, required: true, hint: 'Nos meses mais curtos, cai no último dia.' },
      { name: 'start', label: 'Mês da 1ª parcela', type: 'select', options: months, full: true },
      { name: 'entry', label: 'Entrada / sinal (opcional)', type: 'money', hint: 'Sai do valor e vira um pagamento à parte.' },
      { name: 'entryDate', label: 'Data da entrada', type: 'date', showIf: (v) => parseMoney(v.entry) > 0 },
      { name: 'entryPayer', label: 'Quem paga a entrada', type: 'select', full: true, options: payerOptions(vendor, { custom: false }), showIf: (v) => parseMoney(v.entry) > 0 },
      { name: 'parcelPayer', label: 'Quem paga as parcelas', type: 'select', full: true, options: payerOptions(vendor, { custom: false }) },
      { name: 'method', label: 'Forma de pagamento', type: 'select', full: true, options: PAYMENT_METHODS.map((m) => ({ value: m, label: m || '—' })) },
    ],
    submitLabel: 'Gerar',
    onSubmit: async (d) => {
      const count = Math.round(d.count);
      if (!(count >= 1 && count <= 60)) throw new Error('Informe de 1 a 60 parcelas.');
      const day = Math.round(d.day);
      if (!(day >= 1 && day <= 31)) throw Object.assign(new Error('O dia do pagamento vai de 1 a 31.'), { field: 'day' });
      const totalC = Math.round(d.total * 100);
      const entryC = Math.round((d.entry || 0) * 100);
      if (totalC <= 0) throw new Error('Informe o valor a parcelar.');
      if (entryC >= totalC) throw new Error('A entrada deve ser menor que o valor a parcelar.');
      if (entryC > 0 && !d.entryDate) throw Object.assign(new Error('Informe a data da entrada.'), { field: 'entryDate' });
      const [y, m] = d.start.split('-').map(Number);
      const list = [];
      const entrySplit = payerSplit({ payer: d.entryPayer });
      const parcelSplit = payerSplit({ payer: d.parcelPayer });
      if (entryC > 0) list.push({ vendorId: vendor.id, description: 'Entrada / sinal', amount: entryC / 100, dueDate: d.entryDate, method: d.method, paid: false, split: entrySplit });
      const rest = totalC - entryC;
      const each = Math.floor(rest / count);
      for (let i = 0; i < count; i++) {
        list.push({
          vendorId: vendor.id,
          description: `Parcela ${i + 1}/${count}`,
          amount: (i === count - 1 ? rest - each * (count - 1) : each) / 100,
          dueDate: dayInMonth(y, m - 1 + i, day),
          method: d.method,
          paid: false,
          split: parcelSplit,
        });
      }
      const created = await bulkCreate('payments', list);
      toast(`${list.length} ${list.length === 1 ? 'pagamento criado' : 'pagamentos criados'}`);
      const upcoming = created.filter(isUpcoming);
      if (upcoming.length) setTimeout(() => calendarDialog(upcoming, { intro: 'Parcelas criadas. Quer colocar na sua agenda, com aviso antes de cada vencimento?' }), 250);
    },
  });
}

// ---------------------------------------------------------------------------
// Pagamentos na agenda (Calendário da Apple, Outlook e Google Agenda)
// ---------------------------------------------------------------------------
// Cópia avulsa: a agenda não acompanha mudanças feitas depois no app.
export const isUpcoming = (p) => !p.paid && !!p.dueDate && p.dueDate >= todayISO();

function paymentTitle(p) {
  const vendor = p.vendorId ? byId('vendors', p.vendorId)?.name : '';
  return `Pagar ${vendor ? `${vendor}: ` : ''}${p.description || 'pagamento'} (${money(p.amount)})`;
}
function googleLink(p) {
  const vendor = p.vendorId ? byId('vendors', p.vendorId)?.name : '';
  const details = [
    vendor && `Fornecedor: ${vendor}`,
    `Valor: ${money(p.amount)}`,
    p.method && `Forma de pagamento: ${p.method}`,
    p.notes && `Observações: ${p.notes}`,
    `\nDepois de pagar, marque como pago no BRIDEx: ${location.origin}/#/orcamento?pagamentos`,
  ].filter(Boolean).join('\n');
  const d = (iso) => iso.replace(/-/g, '');
  const q = new URLSearchParams({ action: 'TEMPLATE', text: paymentTitle(p), dates: `${d(p.dueDate)}/${d(shiftISO(p.dueDate, { d: 1 }))}`, details });
  return `https://calendar.google.com/calendar/render?${q}`;
}

// Abre o arquivo .ics: no iPhone aparece "Adicionar ao Calendário"; no computador, o arquivo é baixado.
async function openCalendarFile(list) {
  const { url } = await api('POST', '/api/calendar/link', { ids: list.map((p) => p.id) });
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  // No app instalado na tela de início, o arquivo precisa abrir no navegador.
  if (!(standalone && window.open(url, '_blank'))) location.href = url;
}

export function calendarDialog(payments, { intro } = {}) {
  const list = payments.filter((p) => p.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (!list.length) { toast('Nenhum pagamento a vencer para colocar na agenda.'); return; }
  const n = list.length;
  const all = n === 1 ? 'este pagamento' : `os ${n} pagamentos`;
  openModal({
    title: 'Adicionar à agenda',
    size: 'lg',
    body: html`
      <p class="form-intro">${intro || ''} Cada pagamento vira um evento no dia do vencimento${n > 1 ? `, de ${fmtDate(list[0].dueDate)} a ${fmtDate(list[n - 1].dueDate)}` : ` (${fmtDate(list[0].dueDate)})`}.</p>
      <div class="cal-opts">
        <div class="cal-opt">
          <h3>iPhone, Mac ou Outlook</h3>
          <p class="muted small">Coloca ${all} de uma vez, com aviso na véspera e no dia, às 9h. No iPhone, toque em "Adicionar tudo".</p>
          <button type="button" class="btn btn-primary btn-sm" data-act="ics">${icon('calendar')}<span>Adicionar ${n === 1 ? '' : 'todos'}</span></button>
        </div>
        <div class="cal-opt">
          <h3>Google Agenda</h3>
          <p class="muted small">${n === 1 ? 'Abre o evento pronto no Google: é só salvar.' : html`Use o botão "Google" de cada parcela abaixo e salve. Para colocar todos de uma vez, baixe o arquivo e, no computador, importe em calendar.google.com › Configurações › Importar e exportar.`}</p>
          ${n === 1
            ? html`<a class="btn btn-ghost btn-sm" href="${googleLink(list[0])}" target="_blank" rel="noopener" data-act="link">${icon('calendar')}<span>Abrir no Google</span></a>`
            : html`<button type="button" class="btn btn-ghost btn-sm" data-act="ics">${icon('download')}<span>Baixar arquivo</span></button>`}
        </div>
      </div>
      ${n > 1 ? html`<div class="list cal-list">${list.map((p) => html`<div class="row">
        <div class="row-main"><div class="row-title">${p.description}</div>
          <div class="row-meta"><span>${icon('calendar')} ${fmtDate(p.dueDate)}</span>${p.vendorId && byId('vendors', p.vendorId) ? html`<span>${byId('vendors', p.vendorId).name}</span>` : ''}<span>${money(p.amount)}</span></div>
        </div>
        <div class="row-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-act="ics-one" data-id="${p.id}" title="iPhone, Mac ou Outlook">Apple</button>
          <a class="btn btn-ghost btn-sm" href="${googleLink(p)}" target="_blank" rel="noopener" data-act="link">Google</a>
        </div>
      </div>`)}</div>` : ''}
      <p class="hint">${icon('alert')} A agenda guarda uma cópia: se você mudar a data ou o valor aqui depois, apague o evento antigo e adicione de novo. No Google, o aviso segue o padrão de notificação da sua agenda.</p>`,
    onMount(m) {
      m.body.onclick = (e) => {
        const a = e.target.closest('[data-act]');
        if (!a || a.dataset.act === 'link') return;
        if (a.dataset.act === 'ics') run(() => openCalendarFile(list));
        if (a.dataset.act === 'ics-one') run(() => openCalendarFile(list.filter((p) => p.id === a.dataset.id)));
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Arquivos
// ---------------------------------------------------------------------------
export const fileUrl = (f, download = false) => `/api/files/${f.id}${download ? '?download=1' : ''}`;

export function fileRow(f, { showVendor = true } = {}) {
  const vendor = f.vendorId ? byId('vendors', f.vendorId) : null;
  const isImg = IMAGE_EXT.has(f.ext);
  return html`<div class="row file-row">
    <a class="file-thumb ${isImg ? 'is-img' : ''}" href="${fileUrl(f)}" target="_blank" rel="noopener" data-act="link">
      ${isImg ? html`<img src="${fileUrl(f)}" alt="" loading="lazy">` : html`<span class="ext">${f.ext}</span>`}
    </a>
    <div class="row-main">
      <a class="row-title link" href="${fileUrl(f)}" target="_blank" rel="noopener" data-act="link">${f.name}</a>
      <div class="row-meta"><span>${fileCategory(f.category).label}</span><span>${fmtSize(f.size)}</span><span>${new Date(f.createdAt).toLocaleDateString('pt-BR')}</span>${showVendor && vendor ? html`<span>${icon('briefcase')} ${vendor.name}</span>` : ''}</div>
      ${f.note ? html`<div class="row-note">${f.note}</div>` : ''}
    </div>
    <div class="row-actions">
      <a class="btn-icon" href="${fileUrl(f, true)}" title="Baixar" aria-label="Baixar" data-act="link">${icon('download')}</a>
      <button type="button" class="btn-icon" data-act="file-edit" data-id="${f.id}" title="Editar" aria-label="Editar">${icon('edit')}</button>
    </div>
  </div>`;
}

export function fileEditForm(f) {
  const vendors = [...state.items.vendors].sort((a, b) => a.name.localeCompare(b.name));
  formModal({
    title: 'Editar arquivo',
    values: { ...f, name: f.name.replace(new RegExp(`\\.${f.ext}$`, 'i'), ''), vendorId: f.vendorId || '' },
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true },
      { name: 'category', label: 'Categoria', type: 'select', options: FILE_CATEGORIES.map((c) => ({ value: c.key, label: c.label })) },
      { name: 'vendorId', label: 'Fornecedor', type: 'select', options: [{ value: '', label: '— Nenhum —' }, ...vendors.map((v) => ({ value: v.id, label: v.name }))] },
      { name: 'note', label: 'Observação', type: 'textarea', full: true, rows: 2 },
    ],
    onSubmit: async (d) => { await updateFile(f.id, d); toast('Arquivo atualizado'); },
    onDelete: async () => { await deleteFile(f.id); toast('Arquivo excluído'); },
    deleteConfirm: `Excluir "${f.name}" definitivamente?`,
  });
}

export async function uploadMany(files, opts) {
  const list = [...files];
  let ok = 0;
  for (const file of list) {
    const r = await run(() => uploadFile(file, opts));
    if (r) ok++;
  }
  if (ok) toast(ok === 1 ? 'Arquivo enviado' : `${ok} arquivos enviados`);
  return ok;
}

export function uploadDialog({ category = 'outros', vendorId = '', files: preset = null } = {}) {
  const vendors = [...state.items.vendors].sort((a, b) => a.name.localeCompare(b.name));
  let chosen = preset ? [...preset] : [];
  openModal({
    title: 'Enviar arquivos',
    body: () => html`<form class="form-grid" novalidate>
      <div class="field full">
        <label class="dropzone" for="up_files">
          ${icon('upload')}
          <strong>Toque para escolher arquivos</strong>
          <small>PDF, fotos, Word, Excel… até ${state.maxUploadMb} MB cada</small>
          <input type="file" id="up_files" multiple hidden>
        </label>
        <ul class="chosen"></ul>
      </div>
      <div class="field"><label for="up_cat">Categoria</label><select id="up_cat">${selectOptions(FILE_CATEGORIES.map((c) => ({ value: c.key, label: c.label })), category)}</select></div>
      <div class="field"><label for="up_vendor">Fornecedor (opcional)</label><select id="up_vendor">${selectOptions([{ value: '', label: '— Nenhum —' }, ...vendors.map((v) => ({ value: v.id, label: v.name }))], vendorId)}</select></div>
      <div class="field full"><label for="up_note">Observação (opcional)</label><input id="up_note" type="text"></div>
      <p class="form-error full" role="alert"></p>
    </form>`,
    footer: html`<span class="spacer"></span><button type="button" class="btn btn-ghost" data-cancel>Cancelar</button><button type="button" class="btn btn-primary" data-send>${icon('upload')}<span>Enviar</span></button>`,
    onMount(m) {
      const input = m.body.querySelector('#up_files');
      const ul = m.body.querySelector('.chosen');
      const showChosen = () => { ul.innerHTML = String(html`${chosen.map((f) => html`<li>${icon('file')}<span>${f.name}</span><small>${fmtSize(f.size)}</small></li>`)}`); };
      showChosen();
      input.onchange = () => { chosen = [...input.files]; showChosen(); };
      m.foot.querySelector('[data-cancel]').onclick = () => m.close();
      const send = m.foot.querySelector('[data-send]');
      send.onclick = async () => {
        const err = m.body.querySelector('.form-error');
        if (!chosen.length) { err.textContent = 'Escolha pelo menos um arquivo.'; return; }
        send.disabled = true;
        send.classList.add('loading');
        const ok = await uploadMany(chosen, {
          category: m.body.querySelector('#up_cat').value,
          vendorId: m.body.querySelector('#up_vendor').value,
          note: m.body.querySelector('#up_note').value.trim(),
        });
        send.disabled = false;
        send.classList.remove('loading');
        if (ok) m.close();
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Contatos
// ---------------------------------------------------------------------------
export function contactLinks(v, { labels = false } = {}) {
  const links = [];
  const tel = telLink(v.phone), wa = waLink(v.phone), ig = igLink(v.instagram), web = webLink(v.website);
  const a = (href, ic, label, ext = true) => html`<a class="contact-link" href="${href}" ${ext ? html`target="_blank" rel="noopener noreferrer"` : ''} data-act="link" title="${label}" aria-label="${label}">${icon(ic)}${labels ? html`<span>${label}</span>` : ''}</a>`;
  if (tel) links.push(a(tel, 'phone', 'Ligar', false));
  if (wa) links.push(a(wa, 'chat', 'WhatsApp'));
  if (v.email) links.push(a(`mailto:${v.email}`, 'mail', 'E-mail', false));
  if (ig) links.push(a(ig, 'insta', 'Instagram'));
  if (web) links.push(a(web, 'link', 'Site'));
  return links.length ? html`<div class="contacts">${links}</div>` : '';
}

export function stars(n) {
  n = Number(n) || 0;
  if (!n) return '';
  return html`<span class="stars" title="${n} de 5">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
}

export { money, moneyInput, parseMoney, confirmDialog };
