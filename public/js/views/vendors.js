import { state, create, update, remove, byId, emit } from '../store.js';
import { html, icon, pageHead, chips, searchBox, empty, formModal, openModal, toast, money, moneyShort, fmtDate, todayISO, progress, badge, run, norm, sum, plural, downloadCSV, csvMoney, confirmDialog } from '../ui.js';
import { VENDOR_STATUS, vendorStatus, vendorCategoryOptions, paymentsOf, paidOf, filesOf } from '../domain.js';
import { paymentForm, installmentsForm, togglePaid, fileRow, fileEditForm, uploadMany, contactLinks, stars } from '../forms.js';

const ui = { status: 'todos', cat: '', q: '' };

export function vendorForm(v = {}, { category } = {}) {
  formModal({
    title: v.id ? 'Editar fornecedor' : 'Novo fornecedor',
    size: 'lg',
    values: { status: 'pesquisando', category: category || '', ...v, rating: v.rating ? String(v.rating) : '' },
    fields: [
      { name: 'name', label: 'Nome do fornecedor', required: true, full: true },
      { name: 'category', label: 'Categoria', type: 'select', options: vendorCategoryOptions(v.category || category) },
      { name: 'status', label: 'Status', type: 'select', options: VENDOR_STATUS.map((s) => ({ value: s.key, label: s.label })) },
      { name: 'price', label: 'Valor (orçado ou contratado)', type: 'money' },
      { name: 'contractDate', label: 'Data do contrato', type: 'date' },
      { name: 'contactName', label: 'Pessoa de contato' },
      { name: 'phone', label: 'Telefone / WhatsApp', type: 'tel', placeholder: '(11) 99999-9999' },
      { name: 'email', label: 'E-mail', type: 'email' },
      { name: 'instagram', label: 'Instagram', placeholder: '@perfil', noCaps: true },
      { name: 'website', label: 'Site', type: 'url', placeholder: 'https://' },
      { name: 'rating', label: 'Avaliação', type: 'select', options: [{ value: '', label: '—' }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: '★'.repeat(n) }))] },
      { name: 'included', label: 'O que está incluso', type: 'textarea', full: true, rows: 3, placeholder: 'Itens, horas de cobertura, quantidade de convidados…' },
      { name: 'notes', label: 'Observações', type: 'textarea', full: true, rows: 3, placeholder: 'Condições, multa de cancelamento, prazos…' },
    ],
    onSubmit: async (d) => {
      d.rating = d.rating ? Number(d.rating) : null;
      const saved = v.id ? await update('vendors', v.id, d) : await create('vendors', d);
      toast('Fornecedor salvo');
      if (!v.id) setTimeout(() => openVendor(saved.id), 250);
    },
    onDelete: v.id ? async () => { await remove('vendors', v.id); toast('Fornecedor excluído'); } : null,
    deleteConfirm: 'Excluir este fornecedor? As parcelas ligadas a ele também serão excluídas. Os arquivos continuam em Documentos.',
  });
}

export function openVendor(id) {
  const today = todayISO();
  openModal({
    title: '',
    size: 'lg',
    live: true,
    body: (m) => {
      const v = byId('vendors', id);
      if (!v) { setTimeout(() => m.close()); return ''; }
      m.setTitle(v.name);
      const st = vendorStatus(v.status);
      const pays = paymentsOf(id).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
      const price = Number(v.price) || 0;
      const paid = paidOf(id);
      const scheduled = sum(pays, (p) => p.amount);
      const files = filesOf(id);
      return html`
        <div class="vd-head">
          ${v.category ? html`<span class="eyebrow">${v.category}</span>` : ''}
          ${badge(st.label, st.kind)}
          ${stars(v.rating)}
        </div>
        ${v.contactName ? html`<p class="muted">${icon('user')} ${v.contactName}${v.phone ? ` · ${v.phone}` : ''}</p>` : v.phone ? html`<p class="muted">${icon('phone')} ${v.phone}</p>` : ''}
        ${contactLinks(v, { labels: true })}

        <div class="kpis">
          <div class="kpi"><small>Valor</small><strong>${price ? money(price) : '—'}</strong></div>
          <div class="kpi"><small>Pago</small><strong class="text-ok">${money(paid)}</strong></div>
          <div class="kpi"><small>Falta pagar</small><strong>${money(Math.max(0, price - paid))}</strong></div>
        </div>
        ${price ? progress(paid / price, 'ok') : ''}
        ${price && Math.abs(price - scheduled) > 0.009 && pays.length ? html`<p class="hint">${icon('alert')} As parcelas somam ${money(scheduled)} — ${scheduled < price ? `faltam ${money(price - scheduled)} sem parcela definida` : `${money(scheduled - price)} acima do valor`}.</p>` : ''}

        <section class="vd-section">
          <div class="sec-head"><h3>Pagamentos</h3>
            <div class="sec-actions">
              ${price ? html`<button type="button" class="btn btn-ghost btn-sm" data-act="gen">Gerar parcelas</button>` : ''}
              <button type="button" class="btn btn-ghost btn-sm" data-act="addpay">${icon('plus')}<span>Pagamento</span></button>
            </div>
          </div>
          ${pays.length ? html`<div class="list">${pays.map((p) => {
            const late = !p.paid && p.dueDate && p.dueDate < today;
            return html`<div class="row clickable" data-act="editpay" data-id="${p.id}">
              <input type="checkbox" class="tick" data-act="paytoggle" data-id="${p.id}" ${p.paid ? 'checked' : ''} aria-label="Pago">
              <div class="row-main"><div class="row-title">${p.description}</div>
                <div class="row-meta">${p.dueDate ? html`<span class="${late ? 'text-danger' : ''}">${icon('calendar')} ${fmtDate(p.dueDate)}</span>` : ''}${p.method ? html`<span>${p.method}</span>` : ''}${p.paid ? html`<span class="text-ok">pago${p.paidDate ? ` em ${fmtDate(p.paidDate)}` : ''}</span>` : late ? html`<span class="text-danger">vencido</span>` : ''}</div>
              </div>
              <strong class="amount ${p.paid ? 'muted' : ''}">${money(p.amount)}</strong>
            </div>`;
          })}</div>` : html`<p class="muted small">Nenhum pagamento cadastrado.${price ? ' Use "Gerar parcelas" para dividir o valor.' : ''}</p>`}
        </section>

        <section class="vd-section">
          <div class="sec-head"><h3>Contrato e arquivos</h3>
            <label class="btn btn-ghost btn-sm">${icon('upload')}<span>Enviar</span><input type="file" multiple hidden data-act="upload"></label>
          </div>
          ${files.length ? html`<div class="list">${files.map((f) => fileRow(f, { showVendor: false }))}</div>` : html`<p class="muted small">Envie aqui a cópia do contrato, orçamentos e comprovantes.</p>`}
        </section>

        ${v.included ? html`<section class="vd-section"><h3>O que está incluso</h3><p class="prewrap">${v.included}</p></section>` : ''}
        ${v.notes ? html`<section class="vd-section"><h3>Observações</h3><p class="prewrap">${v.notes}</p></section>` : ''}
        ${v.contractDate ? html`<p class="muted small">Contrato assinado em ${fmtDate(v.contractDate)}</p>` : ''}`;
    },
    footer: html`<button type="button" class="btn btn-danger-ghost" data-act="del">${icon('trash')}<span>Excluir</span></button><span class="spacer"></span><button type="button" class="btn btn-primary" data-act="edit">${icon('edit')}<span>Editar</span></button>`,
    onMount(m) {
      const handler = async (e) => {
        const a = e.target.closest('[data-act]');
        if (!a) return;
        const v = byId('vendors', id);
        if (!v) return;
        const pid = a.dataset.id;
        switch (a.dataset.act) {
          case 'edit': vendorForm(v); break;
          case 'del':
            if (await confirmDialog('Excluir este fornecedor? As parcelas ligadas a ele também serão excluídas. Os arquivos continuam em Documentos.')) {
              await run(async () => { await remove('vendors', id); toast('Fornecedor excluído'); m.close(); });
            }
            break;
          case 'gen': installmentsForm(v); break;
          case 'addpay': paymentForm({}, { vendorId: id }); break;
          case 'editpay': paymentForm(state.items.payments.find((p) => p.id === pid)); break;
          case 'paytoggle': run(() => togglePaid(state.items.payments.find((p) => p.id === pid), a.checked)); break;
          case 'file-edit': fileEditForm(state.files.find((f) => f.id === pid)); break;
        }
      };
      m.body.onclick = handler;
      m.foot.onclick = handler;
      m.body.onchange = (e) => {
        if (e.target.dataset.act === 'upload' && e.target.files.length) {
          const isContract = byId('vendors', id)?.status === 'contratado';
          uploadMany(e.target.files, { category: isContract ? 'contrato' : 'orcamento', vendorId: id });
        }
      };
    },
  });
}

function exportVendors() {
  const rows = [['Fornecedor', 'Categoria', 'Status', 'Valor', 'Pago', 'Contato', 'Telefone', 'E-mail', 'Instagram', 'Site', 'Observações']];
  for (const v of state.items.vendors) {
    rows.push([v.name, v.category, vendorStatus(v.status).label, csvMoney(v.price), csvMoney(paidOf(v.id)), v.contactName, v.phone, v.email, v.instagram, v.website, v.notes]);
  }
  downloadCSV('fornecedores.csv', rows);
}

export default {
  render() {
    const all = state.items.vendors;
    const q = norm(ui.q.trim());
    const counts = Object.fromEntries(VENDOR_STATUS.map((s) => [s.key, all.filter((v) => (v.status || 'pesquisando') === s.key).length]));
    const list = all.filter((v) => {
      if (ui.status !== 'todos' && (v.status || 'pesquisando') !== ui.status) return false;
      if (ui.cat && v.category !== ui.cat) return false;
      if (q && !norm(`${v.name} ${v.category} ${v.contactName || ''} ${v.notes || ''}`).includes(q)) return false;
      return true;
    }).sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    const contracted = all.filter((v) => v.status === 'contratado');
    const totalContracted = sum(contracted, (v) => v.price);
    const cats = [...new Set(all.map((v) => v.category).filter(Boolean))].sort();

    return html`
      ${pageHead('Fornecedores', `${plural(contracted.length, 'contratado', 'contratados')} · ${money(totalContracted)}`,
        html`<button type="button" class="btn btn-ghost hide-sm" data-act="export" title="Exportar para Excel">${icon('download')}<span>Exportar</span></button><button type="button" class="btn btn-primary" data-act="add">${icon('plus')}<span>Novo fornecedor</span></button>`)}
      <div class="toolbar">
        ${searchBox('q-vendors', ui.q, 'Buscar fornecedor…')}
        ${cats.length ? html`<select class="select-sm" id="cat-vendors" aria-label="Categoria"><option value="">Todas as categorias</option>${cats.map((c) => html`<option ${c === ui.cat ? 'selected' : ''}>${c}</option>`)}</select>` : ''}
      </div>
      ${chips('status', [{ value: 'todos', label: 'Todos', count: all.length }, ...VENDOR_STATUS.map((s) => ({ value: s.key, label: s.label, count: counts[s.key] }))], ui.status)}
      ${!all.length ? empty('briefcase', 'Nenhum fornecedor ainda', 'Cadastre os fornecedores que vocês estão pesquisando ou já contrataram — com valores, contatos, parcelas e a cópia do contrato.', html`<button type="button" class="btn btn-primary" data-act="add">${icon('plus')}<span>Adicionar fornecedor</span></button>`)
        : !list.length ? empty('search', 'Nada encontrado', 'Nenhum fornecedor corresponde ao filtro.')
        : html`<div class="vendor-grid">${list.map((v) => {
          const st = vendorStatus(v.status);
          const price = Number(v.price) || 0;
          const paid = paidOf(v.id);
          const nFiles = filesOf(v.id).length;
          return html`<article class="card vendor-card ${v.status === 'descartado' ? 'is-muted' : ''}" data-act="open" data-id="${v.id}" tabindex="0">
            <div class="vc-top"><span class="eyebrow">${v.category || 'Sem categoria'}</span>${badge(st.label, st.kind)}</div>
            <h3>${v.name}</h3>
            ${v.contactName ? html`<p class="muted small">${v.contactName}</p>` : ''}
            <div class="vc-price">${price ? moneyShort(price) : html`<span class="muted">sem valor</span>`}</div>
            ${v.status === 'contratado' && price ? html`${progress(paid / price, 'ok')}<p class="small muted">Pago ${money(paid)} de ${money(price)}</p>` : ''}
            <div class="vc-foot">${contactLinks(v)}<span class="vc-meta">${stars(v.rating)}${nFiles ? html`<span title="Arquivos">${icon('clip')} ${nFiles}</span>` : ''}</span></div>
          </article>`;
        })}</div>`}`;
  },

  mount(el) {
    el.onclick = (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      switch (a.dataset.act) {
        case 'add': vendorForm({}, { category: ui.cat }); break;
        case 'open': openVendor(a.dataset.id); break;
        case 'chip': ui[a.dataset.group] = a.dataset.val; emit(); break;
        case 'export': exportVendors(); break;
      }
    };
    el.onkeydown = (e) => {
      if (e.key === 'Enter' && e.target.matches('.vendor-card')) openVendor(e.target.dataset.id);
    };
    el.oninput = (e) => { if (e.target.id === 'q-vendors') { ui.q = e.target.value; emit(); } };
    el.onchange = (e) => { if (e.target.id === 'cat-vendors') { ui.cat = e.target.value; emit(); } };
  },
};
