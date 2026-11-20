import { state, create, update, remove, emit } from '../store.js';
import { html, icon, pageHead, searchBox, empty, formModal, toast, run, norm, fmtDateTime } from '../ui.js';
import { userName } from '../domain.js';

const ui = { q: '' };
const COLORS = [
  { value: 'creme', label: 'Creme' }, { value: 'rosa', label: 'Rosa' }, { value: 'salvia', label: 'Sálvia' },
  { value: 'azul', label: 'Azul' }, { value: 'lilas', label: 'Lilás' }, { value: 'areia', label: 'Areia' },
];

function noteForm(n = {}) {
  formModal({
    title: n.id ? 'Editar anotação' : 'Nova anotação',
    size: 'lg',
    values: { color: 'creme', ...n },
    fields: [
      { name: 'title', label: 'Título', full: true, placeholder: 'Ex.: Ideias para a decoração' },
      { name: 'body', label: 'Anotação', type: 'textarea', full: true, rows: 10 },
      { name: 'color', label: 'Cor', type: 'select', options: COLORS },
      { name: 'pinned', label: 'Fixar na visão geral', type: 'checkbox' },
    ],
    onSubmit: async (d) => {
      if (!d.title && !d.body) throw new Error('Escreva um título ou um texto.');
      if (n.id) await update('notes', n.id, d); else await create('notes', d);
      toast('Anotação salva');
    },
    onDelete: n.id ? async () => { await remove('notes', n.id); toast('Anotação excluída'); } : null,
  });
}

export default {
  render() {
    const q = norm(ui.q.trim());
    const list = state.items.notes
      .filter((n) => !q || norm(`${n.title} ${n.body}`).includes(q))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b._updated || 0) - (a._updated || 0));
    return html`
      ${pageHead('Anotações', 'Ideias, reuniões, decisões e tudo mais', html`<button type="button" class="btn btn-primary" data-act="add">${icon('plus')}<span>Anotação</span></button>`)}
      ${state.items.notes.length ? html`<div class="toolbar">${searchBox('q-notes', ui.q, 'Buscar nas anotações…')}</div>` : ''}
      ${!state.items.notes.length ? empty('note', 'Nenhuma anotação ainda', 'Use para registrar reuniões com fornecedores, ideias, músicas, votos, listas de compras…', html`<button type="button" class="btn btn-primary" data-act="add">${icon('plus')}<span>Criar anotação</span></button>`)
        : !list.length ? empty('search', 'Nada encontrado', '')
        : html`<div class="notes-grid">${list.map((n) => html`<article class="note note-${n.color || 'creme'}" data-act="edit" data-id="${n.id}" tabindex="0">
          <header>${n.title ? html`<h3>${n.title}</h3>` : ''}<button type="button" class="pin ${n.pinned ? 'on' : ''}" data-act="pin" data-id="${n.id}" title="${n.pinned ? 'Desafixar' : 'Fixar na visão geral'}" aria-label="Fixar">${icon('star')}</button></header>
          ${n.body ? html`<p class="prewrap">${n.body}</p>` : ''}
          <footer>${fmtDateTime(n._updated)}${userName(n._by) ? ` · ${userName(n._by)}` : ''}</footer>
        </article>`)}</div>`}`;
  },
  mount(el) {
    el.onclick = (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const n = state.items.notes.find((x) => x.id === a.dataset.id);
      switch (a.dataset.act) {
        case 'add': noteForm(); break;
        case 'edit': noteForm(n); break;
        case 'pin': run(() => update('notes', n.id, { pinned: !n.pinned })); break;
      }
    };
    el.onkeydown = (e) => { if (e.key === 'Enter' && e.target.matches('.note')) noteForm(state.items.notes.find((x) => x.id === e.target.dataset.id)); };
    el.oninput = (e) => { if (e.target.id === 'q-notes') { ui.q = e.target.value; emit(); } };
  },
};
