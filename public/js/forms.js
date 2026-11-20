// Formulários e componentes compartilhados entre telas.
import { state, create, update, remove, bulkCreate, saveSettings, uploadFile, updateFile, deleteFile, byId } from './store.js';
import { html, icon, formModal, openModal, toast, todayISO, shiftISO, money, moneyInput, parseMoney, fmtSize, fmtDate, confirmDialog, selectOptions, sum, run } from './ui.js';
import { PAYMENT_METHODS, FILE_CATEGORIES, fileCategory, IMAGE_EXT, paymentsOf, telLink, waLink, igLink, webLink } from './domain.js';

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
export function paymentForm(p = {}, { vendorId } = {}) {
  const vendors = [...state.items.vendors].sort((a, b) => a.name.localeCompare(b.name));
  formModal({
    title: p.id ? 'Editar pagamento' : 'Novo pagamento',
    values: { vendorId: vendorId || '', dueDate: todayISO(), ...p },
    fields: [
      { name: 'description', label: 'Descrição', required: true, full: true, placeholder: 'Ex.: Sinal, Parcela 2/5…' },
      { name: 'vendorId', label: 'Fornecedor', type: 'select', full: true, options: [{ value: '', label: '— Nenhum —' }, ...vendors.map((v) => ({ value: v.id, label: v.name }))] },
      { name: 'amount', label: 'Valor', type: 'money', required: true },
      { name: 'dueDate', label: 'Vencimento', type: 'date' },
      { name: 'method', label: 'Forma de pagamento', type: 'select', options: PAYMENT_METHODS.map((m) => ({ value: m, label: m || '—' })) },
      { name: 'paidDate', label: 'Data do pagamento', type: 'date' },
      { name: 'paid', label: 'Já foi pago', type: 'checkbox', full: true },
      { name: 'notes', label: 'Observações', type: 'textarea', full: true, rows: 2 },
    ],
    onSubmit: async (d) => {
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

export function installmentsForm(vendor) {
  const scheduled = sum(paymentsOf(vendor.id), (p) => p.amount);
  const remaining = Math.max(0, (Number(vendor.price) || 0) - scheduled);
  formModal({
    title: 'Gerar parcelas',
    intro: `Cria parcelas mensais para ${vendor.name}. Você pode editar cada uma depois.`,
    values: { total: remaining || '', count: 3, first: todayISO(), entry: '' },
    fields: [
      { name: 'total', label: 'Valor total a parcelar', type: 'money', required: true },
      { name: 'count', label: 'Número de parcelas', type: 'number', min: 1, max: 60, required: true },
      { name: 'entry', label: 'Entrada / sinal (opcional)', type: 'money', hint: 'Descontada do total e lançada como primeira parcela.' },
      { name: 'first', label: 'Primeiro vencimento', type: 'date', required: true },
      { name: 'method', label: 'Forma de pagamento', type: 'select', options: PAYMENT_METHODS.map((m) => ({ value: m, label: m || '—' })) },
    ],
    submitLabel: 'Gerar',
    onSubmit: async (d) => {
      const count = Math.round(d.count);
      if (!(count >= 1 && count <= 60)) throw new Error('Informe de 1 a 60 parcelas.');
      const totalC = Math.round(d.total * 100);
      const entryC = Math.round((d.entry || 0) * 100);
      if (totalC <= 0) throw new Error('Informe o valor total.');
      if (entryC >= totalC) throw new Error('A entrada deve ser menor que o total.');
      const list = [];
      if (entryC > 0) list.push({ vendorId: vendor.id, description: 'Entrada / sinal', amount: entryC / 100, dueDate: d.first, method: d.method, paid: false });
      const rest = totalC - entryC;
      const each = Math.floor(rest / count);
      for (let i = 0; i < count; i++) {
        const amt = i === count - 1 ? rest - each * (count - 1) : each;
        list.push({
          vendorId: vendor.id,
          description: `Parcela ${i + 1}/${count}`,
          amount: amt / 100,
          dueDate: shiftISO(d.first, { m: entryC > 0 ? i + 1 : i }),
          method: d.method,
          paid: false,
        });
      }
      await bulkCreate('payments', list);
      toast(`${list.length} parcelas criadas`);
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
