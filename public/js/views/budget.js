import { state, create, update, remove, updateMany, saveSettings, emit } from '../store.js';
import { html, icon, pageHead, chips, empty, formModal, toast, money, moneyShort, fmtDate, fmtDateShort, todayISO, progress, badge, run, sum, confirmDialog, downloadCSV, csvMoney } from '../ui.js';
import { budgetCats, contractedVendors, paidOf, splitTotals, paymentSplitTag } from '../domain.js';
import { paymentForm, togglePaid, calendarDialog, isUpcoming } from '../forms.js';
import { BUDGET_CATEGORIES } from '../seed.js';
import { openVendor, vendorForm } from './vendors.js';

const ui = { tab: 'categorias', pay: 'apagar' };

// Quanto cada pessoa paga no casamento (conforme o "Quem paga" de cada fornecedor).
function splitCard() {
  const rows = splitTotals().filter((r) => r.contracted > 0.004 || r.paid > 0.004);
  if (!rows.length) return '';
  return html`<section class="card split-card">
    <header class="card-head"><h2>Quanto cada um paga</h2><small class="muted">Pela divisão marcada em cada fornecedor</small></header>
    <div class="split-table">
      <div class="split-tr head"><span>Pessoa</span><span>Parte do contratado</span><span>Já pagou</span><span>Falta</span></div>
      ${rows.map((r) => html`<div class="split-tr"><span><strong>${r.label}</strong></span><span>${money(r.contracted)}</span><span class="text-ok">${money(r.paid)}</span><span>${money(Math.max(0, r.contracted - r.paid))}</span></div>`)}
    </div>
  </section>`;
}

function totalForm() {
  formModal({
    title: 'Orçamento total',
    values: { budgetTotal: state.settings.budgetTotal },
    fields: [{ name: 'budgetTotal', label: 'Quanto vocês pretendem investir no casamento?', type: 'money', full: true }],
    onSubmit: async (d) => { await saveSettings(d); toast('Orçamento atualizado'); },
  });
}

function categoryForm(c = {}) {
  formModal({
    title: c.id ? 'Editar categoria' : 'Nova categoria',
    values: c,
    fields: [
      { name: 'name', label: 'Categoria', required: true, full: true },
      { name: 'planned', label: 'Valor planejado', type: 'money', full: true },
    ],
    onSubmit: async (d) => {
      if (c.id) {
        const old = c.name;
        await update('budget', c.id, d);
        if (old !== d.name) {
          const ids = state.items.vendors.filter((v) => v.category === old).map((v) => v.id);
          if (ids.length) await updateMany('vendors', ids, () => ({ category: d.name }));
        }
      } else {
        await create('budget', { ...d, order: state.items.budget.length });
      }
      toast('Categoria salva');
    },
    onDelete: c.id ? async () => { await remove('budget', c.id); toast('Categoria excluída'); } : null,
    deleteConfirm: 'Excluir esta categoria do orçamento? Os fornecedores continuam cadastrados.',
  });
}

async function suggest() {
  const total = Number(state.settings.budgetTotal) || 0;
  if (!total) { toast('Defina primeiro o orçamento total.', 'error'); totalForm(); return; }
  const pctByName = Object.fromEntries(BUDGET_CATEGORIES);
  const cats = budgetCats().filter((c) => (c.pct ?? pctByName[c.name]) != null);
  if (!cats.length) { toast('Nenhuma categoria padrão encontrada.', 'error'); return; }
  if (!(await confirmDialog(`Distribuir ${money(total)} entre as categorias usando percentuais típicos de casamentos no Brasil? Os valores planejados atuais serão substituídos.`, { ok: 'Distribuir', danger: false, title: 'Sugerir distribuição' }))) return;
  await run(async () => {
    await updateMany('budget', cats.map((c) => c.id), (id) => {
      const c = cats.find((x) => x.id === id);
      return { planned: Math.round((total * (c.pct ?? pctByName[c.name])) / 100) };
    });
    toast('Distribuição aplicada');
  });
}

function categoriesTab(total) {
  const cats = budgetCats();
  const contracted = contractedVendors();
  const names = new Set(cats.map((c) => c.name));
  const orphan = contracted.filter((v) => !names.has(v.category));
  const planned = sum(cats, (c) => c.planned);
  const row = (c, vendors) => {
    const contr = sum(vendors, (v) => v.price);
    const paid = sum(vendors, (v) => paidOf(v.id));
    const p = Number(c.planned) || 0;
    const over = p && contr > p;
    return html`<div class="row budget-row ${c.id ? 'clickable' : ''}" ${c.id ? html`data-act="cat" data-id="${c.id}"` : ''}>
      <div class="row-main">
        <div class="budget-line"><span class="row-title">${c.name}</span><span class="budget-nums"><strong class="${over ? 'text-danger' : ''}">${money(contr)}</strong><span class="muted"> / ${p ? money(p) : '—'}</span></span></div>
        ${progress(p ? contr / p : contr ? 1 : 0, over ? 'danger' : '')}
        <div class="row-meta">
          ${vendors.length ? vendors.map((v) => html`<button type="button" class="link-chip" data-act="vendor" data-id="${v.id}">${v.name}</button>`) : html`<span>nenhum fornecedor contratado</span>`}
          ${paid ? html`<span class="text-ok">pago ${money(paid)}</span>` : ''}
          ${over ? html`<span class="text-danger">${money(contr - p)} acima</span>` : ''}
        </div>
      </div>
    </div>`;
  };
  return html`
    <div class="tab-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-act="suggest">${icon('sparkle')}<span>Sugerir distribuição</span></button>
      <button type="button" class="btn btn-ghost btn-sm" data-act="addcat">${icon('plus')}<span>Categoria</span></button>
    </div>
    ${total && Math.abs(planned - total) > 1 ? html`<p class="hint">${icon('alert')} A soma planejada por categoria é ${money(planned)} (${Math.round((planned / total) * 100)}% do orçamento total).</p>` : ''}
    ${!cats.length && !orphan.length ? empty('wallet', 'Nenhuma categoria', 'Crie categorias para distribuir o orçamento.') : html`<div class="card list">
      ${cats.map((c) => row(c, contracted.filter((v) => v.category === c.name)))}
      ${orphan.length ? row({ name: 'Outras categorias' }, orphan) : ''}
    </div>`}
    <p class="hint small">${icon('alert')} O valor "contratado" soma os fornecedores com status <strong>Contratado</strong> de cada categoria.</p>`;
}

function paymentsTab() {
  const today = todayISO();
  const all = state.items.payments;
  const late = (p) => !p.paid && p.dueDate && p.dueDate < today;
  const filters = {
    apagar: (p) => !p.paid,
    atrasados: late,
    pagos: (p) => p.paid,
    todos: () => true,
  };
  const list = all.filter(filters[ui.pay]).sort((a, b) => {
    const k = ui.pay === 'pagos' ? -1 : 1;
    return k * (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
  });
  const vendorName = (id) => state.items.vendors.find((v) => v.id === id)?.name || '';
  // agrupa por mês
  const groups = [];
  for (const p of list) {
    const key = p.dueDate ? p.dueDate.slice(0, 7) : 'sem-data';
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, items: [] }; groups.push(g); }
    g.items.push(p);
  }
  const monthLabel = (k) => (k === 'sem-data' ? 'Sem vencimento' : new Date(`${k}-15T12:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  return html`
    <div class="tab-actions">
      ${chips('pay', [
        { value: 'apagar', label: 'A pagar', count: all.filter(filters.apagar).length },
        { value: 'atrasados', label: 'Atrasados', count: all.filter(late).length },
        { value: 'pagos', label: 'Pagos', count: all.filter(filters.pagos).length },
        { value: 'todos', label: 'Todos', count: all.length },
      ], ui.pay)}
      <span class="spacer"></span>
      ${all.some(isUpcoming) ? html`<button type="button" class="btn btn-ghost btn-sm" data-act="calpay" title="Adicionar à agenda">${icon('calendar')}<span>Agenda</span></button>` : ''}
      <button type="button" class="btn btn-ghost btn-sm hide-sm" data-act="exportpay">${icon('download')}<span>Exportar</span></button>
      <button type="button" class="btn btn-ghost btn-sm" data-act="addpay">${icon('plus')}<span>Pagamento</span></button>
    </div>
    ${!list.length ? empty('money', ui.pay === 'atrasados' ? 'Nada atrasado' : 'Nenhum pagamento', 'Cadastre parcelas pelo fornecedor (botão "Gerar parcelas") ou adicione pagamentos avulsos aqui.')
      : groups.map((g) => html`<section class="group">
        <h2 class="group-title">${monthLabel(g.key)}<span class="group-n">${money(sum(g.items, (p) => p.amount))}</span></h2>
        <div class="card list">${g.items.map((p) => html`<div class="row clickable" data-act="editpay" data-id="${p.id}">
          <input type="checkbox" class="tick" data-act="paytoggle" data-id="${p.id}" ${p.paid ? 'checked' : ''} aria-label="Pago">
          <div class="date-chip ${late(p) ? 'late' : ''} ${p.paid ? 'done' : ''}">${p.dueDate ? fmtDateShort(p.dueDate) : '—'}</div>
          <div class="row-main"><div class="row-title">${p.description}</div>
            <div class="row-meta">${p.vendorId ? html`<span>${vendorName(p.vendorId)}</span>` : ''}${p.method ? html`<span>${p.method}</span>` : ''}${p.split ? html`<span class="split-tag">${icon('users')} ${paymentSplitTag(p)}</span>` : ''}${p.paid ? html`<span class="text-ok">pago${p.paidDate ? ` em ${fmtDate(p.paidDate)}` : ''}</span>` : late(p) ? html`<span class="text-danger">vencido</span>` : ''}</div>
          </div>
          <strong class="amount ${p.paid ? 'muted' : ''}">${money(p.amount)}</strong>
        </div>`)}</div>
      </section>`)}`;
}

function exportPayments() {
  const vendorName = (id) => state.items.vendors.find((v) => v.id === id)?.name || '';
  const rows = [['Vencimento', 'Descrição', 'Fornecedor', 'Valor', 'Forma', 'Pago', 'Data do pagamento', 'Observações']];
  for (const p of [...state.items.payments].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))) {
    rows.push([fmtDate(p.dueDate), p.description, vendorName(p.vendorId), csvMoney(p.amount), p.method, p.paid ? 'Sim' : 'Não', fmtDate(p.paidDate), p.notes]);
  }
  downloadCSV('pagamentos.csv', rows);
}

export default {
  render() {
    if (location.hash.includes('pagamentos')) { ui.tab = 'pagamentos'; history.replaceState(null, '', '#/orcamento'); }
    const total = Number(state.settings.budgetTotal) || 0;
    const contracted = sum(contractedVendors(), (v) => v.price);
    const paid = sum(state.items.payments.filter((p) => p.paid), (p) => p.amount);
    const toPay = Math.max(0, contracted - paid);
    const free = total - contracted;
    return html`
      ${pageHead('Orçamento', 'Planejado × contratado × pago')}
      <div class="kpis kpis-4">
        <button type="button" class="kpi kpi-btn" data-act="total"><small>Orçamento total ${icon('edit')}</small><strong>${total ? moneyShort(total) : 'Definir'}</strong></button>
        <div class="kpi"><small>Contratado</small><strong>${moneyShort(contracted)}</strong>${total ? html`<span class="kpi-foot">${Math.round((contracted / total) * 100)}% do total</span>` : ''}</div>
        <div class="kpi"><small>Pago</small><strong class="text-ok">${moneyShort(paid)}</strong><span class="kpi-foot">falta ${moneyShort(toPay)}</span></div>
        <div class="kpi"><small>${free >= 0 ? 'Disponível' : 'Acima do orçamento'}</small><strong class="${free < 0 ? 'text-danger' : ''}">${total ? moneyShort(Math.abs(free)) : '—'}</strong></div>
      </div>
      ${total ? html`<div class="card progress-card">${progress(contracted / total, contracted > total ? 'danger' : '')}<span>${money(contracted)} contratados de ${money(total)}</span></div>` : ''}
      ${splitCard()}
      <div class="tabs" role="tablist">
        <button type="button" class="tab ${ui.tab === 'categorias' ? 'active' : ''}" data-act="tab" data-val="categorias">Por categoria</button>
        <button type="button" class="tab ${ui.tab === 'pagamentos' ? 'active' : ''}" data-act="tab" data-val="pagamentos">Pagamentos</button>
      </div>
      ${ui.tab === 'categorias' ? categoriesTab(total) : paymentsTab()}`;
  },

  mount(el) {
    el.onclick = (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const id = a.dataset.id;
      switch (a.dataset.act) {
        case 'total': totalForm(); break;
        case 'tab': ui.tab = a.dataset.val; emit(); break;
        case 'chip': ui[a.dataset.group] = a.dataset.val; emit(); break;
        case 'cat': categoryForm(state.items.budget.find((c) => c.id === id)); break;
        case 'addcat': categoryForm(); break;
        case 'suggest': suggest(); break;
        case 'vendor': e.stopPropagation(); openVendor(id); break;
        case 'addpay': paymentForm(); break;
        case 'editpay': paymentForm(state.items.payments.find((p) => p.id === id)); break;
        case 'paytoggle': run(() => togglePaid(state.items.payments.find((p) => p.id === id), a.checked)); break;
        case 'exportpay': exportPayments(); break;
        case 'calpay': calendarDialog(state.items.payments.filter(isUpcoming)); break;
        case 'addvendor': vendorForm(); break;
      }
    };
  },
};
