import { state, create, update, remove, emit } from '../store.js';
import { html, icon, pageHead, chips, searchBox, empty, formModal, toast, run, norm, sum, money, fmtDate, todayISO, plural, downloadCSV, csvMoney } from '../ui.js';

const ui = { filter: 'todos', q: '' };
const TYPES = ['Presente', 'PIX / dinheiro', 'Lista de presentes', 'Cota de lua de mel', 'Outro'];

function giftForm(g = {}) {
  formModal({
    title: g.id ? 'Editar presente' : 'Registrar presente',
    values: { type: 'Presente', date: todayISO(), ...g },
    fields: [
      { name: 'item', label: 'Presente', required: true, full: true, placeholder: 'Ex.: Jogo de panelas' },
      { name: 'from', label: 'Quem deu', list: state.items.guests.map((x) => x.name).sort() },
      { name: 'type', label: 'Tipo', type: 'select', options: TYPES },
      { name: 'value', label: 'Valor (opcional)', type: 'money' },
      { name: 'date', label: 'Recebido em', type: 'date' },
      { name: 'thanked', label: 'Agradecimento enviado', type: 'checkbox', full: true },
      { name: 'notes', label: 'Observações', type: 'textarea', full: true, rows: 2 },
    ],
    onSubmit: async (d) => { if (g.id) await update('gifts', g.id, d); else await create('gifts', d); toast('Presente salvo'); },
    onDelete: g.id ? async () => { await remove('gifts', g.id); toast('Presente excluído'); } : null,
  });
}

export default {
  render() {
    const all = state.items.gifts;
    const pending = all.filter((g) => !g.thanked).length;
    const q = norm(ui.q.trim());
    const list = all.filter((g) => {
      if (ui.filter === 'agradecer' && g.thanked) return false;
      if (ui.filter === 'agradecidos' && !g.thanked) return false;
      if (q && !norm(`${g.item} ${g.from} ${g.notes || ''}`).includes(q)) return false;
      return true;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return html`
      ${pageHead('Presentes', `${plural(all.length, 'presente recebido', 'presentes recebidos')}${sum(all, (g) => g.value) ? ` · ${money(sum(all, (g) => g.value))}` : ''}`,
        html`${all.length ? html`<button type="button" class="btn btn-ghost hide-sm" data-act="export">${icon('download')}<span>Exportar</span></button>` : ''}<button type="button" class="btn btn-primary" data-act="add">${icon('plus')}<span>Presente</span></button>`)}
      ${all.length ? html`<div class="toolbar">${searchBox('q-gifts', ui.q, 'Buscar presente ou pessoa…')}</div>
      ${chips('filter', [{ value: 'todos', label: 'Todos', count: all.length }, { value: 'agradecer', label: 'Falta agradecer', count: pending }, { value: 'agradecidos', label: 'Agradecidos', count: all.length - pending }], ui.filter)}` : ''}
      ${!all.length ? empty('gift', 'Nenhum presente registrado', 'Anote cada presente e quem deu para não esquecer nenhum agradecimento.', html`<button type="button" class="btn btn-primary" data-act="add">${icon('plus')}<span>Registrar presente</span></button>`)
        : !list.length ? empty('search', 'Nada encontrado', '')
        : html`<div class="card list">${list.map((g) => html`<div class="row clickable ${g.thanked ? 'is-done' : ''}" data-act="edit" data-id="${g.id}">
          <input type="checkbox" class="tick" data-act="thank" data-id="${g.id}" ${g.thanked ? 'checked' : ''} aria-label="Agradecimento enviado" title="Agradecimento enviado">
          <div class="row-main"><div class="row-title">${g.item}</div>
            <div class="row-meta">${g.from ? html`<span>${icon('user')} ${g.from}</span>` : ''}<span>${g.type || 'Presente'}</span>${g.date ? html`<span>${fmtDate(g.date)}</span>` : ''}${g.thanked ? html`<span class="text-ok">agradecido</span>` : ''}</div>
          </div>
          ${g.value ? html`<strong class="amount">${money(g.value)}</strong>` : ''}
        </div>`)}</div>`}`;
  },
  mount(el) {
    el.onclick = (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      switch (a.dataset.act) {
        case 'add': giftForm(); break;
        case 'edit': giftForm(state.items.gifts.find((g) => g.id === a.dataset.id)); break;
        case 'thank': run(() => update('gifts', a.dataset.id, { thanked: a.checked })); break;
        case 'chip': ui[a.dataset.group] = a.dataset.val; emit(); break;
        case 'export': {
          const rows = [['Presente', 'Quem deu', 'Tipo', 'Valor', 'Data', 'Agradecido', 'Observações']];
          for (const g of state.items.gifts) rows.push([g.item, g.from, g.type, csvMoney(g.value), fmtDate(g.date), g.thanked ? 'Sim' : 'Não', g.notes]);
          downloadCSV('presentes.csv', rows);
          break;
        }
      }
    };
    el.oninput = (e) => { if (e.target.id === 'q-gifts') { ui.q = e.target.value; emit(); } };
  },
};
