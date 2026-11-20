import { state, create, update, remove, bulkCreate } from '../store.js';
import { html, icon, pageHead, empty, formModal, toast, run, fmtDateLong, confirmDialog } from '../ui.js';
import { coupleTitle } from '../domain.js';
import { TIMELINE_TEMPLATE } from '../seed.js';

// Ordena considerando que horários de madrugada (antes das 06:00) vêm depois da meia-noite.
const sortKey = (t) => { const h = String(t.time || '99:99'); return (h < '06:00' ? '2' : '1') + h; };

function itemForm(it = {}) {
  formModal({
    title: it.id ? 'Editar momento' : 'Novo momento',
    values: it,
    fields: [
      { name: 'time', label: 'Horário', type: 'time', required: true },
      { name: 'title', label: 'O que acontece', required: true },
      { name: 'place', label: 'Local' },
      { name: 'responsible', label: 'Responsável', placeholder: 'Cerimonial, fotógrafo, padrinho…' },
      { name: 'notes', label: 'Detalhes', type: 'textarea', full: true, rows: 3, placeholder: 'Música de entrada, quem participa, o que levar…' },
    ],
    onSubmit: async (d) => { if (it.id) await update('timeline', it.id, d); else await create('timeline', d); toast('Cronograma atualizado'); },
    onDelete: it.id ? async () => { await remove('timeline', it.id); toast('Momento excluído'); } : null,
  });
}

export default {
  render() {
    const items = [...state.items.timeline].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const s = state.settings;
    return html`
      ${pageHead('Cronograma do dia', s.date ? fmtDateLong(s.date) : 'O passo a passo do grande dia',
        html`${items.length ? html`<button type="button" class="btn btn-ghost" data-act="print">${icon('printer')}<span class="hide-sm">Imprimir</span></button>` : ''}<button type="button" class="btn btn-primary" data-act="add">${icon('plus')}<span>Momento</span></button>`)}
      <div class="print-only print-head"><h1>${coupleTitle()}</h1><p>${s.date ? fmtDateLong(s.date) : ''}</p></div>
      ${!items.length ? empty('clock', 'Monte o roteiro do dia', 'Do making of ao fim da festa: horários, locais e responsáveis. Ótimo para compartilhar com cerimonial, fotógrafo e padrinhos.',
        html`<div class="empty-actions"><button type="button" class="btn btn-primary" data-act="template">Usar roteiro sugerido</button><button type="button" class="btn btn-ghost" data-act="add">Começar do zero</button></div>`)
        : html`<ol class="timeline">${items.map((it) => html`<li class="tl-item" data-act="edit" data-id="${it.id}">
          <time>${it.time}</time>
          <div class="tl-body">
            <strong>${it.title}</strong>
            <div class="row-meta">${it.place ? html`<span>${icon('pin')} ${it.place}</span>` : ''}${it.responsible ? html`<span>${icon('user')} ${it.responsible}</span>` : ''}</div>
            ${it.notes ? html`<p class="prewrap small">${it.notes}</p>` : ''}
          </div>
        </li>`)}</ol>`}`;
  },
  mount(el) {
    el.onclick = async (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      switch (a.dataset.act) {
        case 'add': itemForm(); break;
        case 'edit': itemForm(state.items.timeline.find((x) => x.id === a.dataset.id)); break;
        case 'print': window.print(); break;
        case 'template':
          if (state.items.timeline.length && !(await confirmDialog('Adicionar o roteiro sugerido?', { ok: 'Adicionar', danger: false }))) return;
          run(async () => {
            await bulkCreate('timeline', TIMELINE_TEMPLATE.map(([time, title, place, responsible]) => ({ time, title, place, responsible })));
            toast('Roteiro sugerido adicionado — ajuste os horários!');
          });
          break;
      }
    };
  },
};
