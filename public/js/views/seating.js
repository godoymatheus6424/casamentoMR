import { state, create, update, remove, bulkCreate, updateMany, emit } from '../store.js';
import { html, icon, pageHead, searchBox, empty, formModal, openModal, toast, run, norm, sum, plural, selectOptions } from '../ui.js';
import { guestPeople, sideLabel } from '../domain.js';

const ui = { q: '', onlyConfirmed: false };
const sortTables = (list) => [...list].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true }));

function tableForm(t = {}) {
  formModal({
    title: t.id ? 'Editar mesa' : 'Nova mesa',
    values: { seats: 8, ...t },
    fields: [
      { name: 'name', label: 'Nome da mesa', required: true, placeholder: 'Ex.: Mesa 1, Família da noiva' },
      { name: 'seats', label: 'Lugares', type: 'number', min: 1, max: 100, required: true },
      { name: 'notes', label: 'Observações', type: 'textarea', full: true, rows: 2 },
    ],
    onSubmit: async (d) => { if (t.id) await update('tables', t.id, d); else await create('tables', d); toast('Mesa salva'); },
    onDelete: t.id ? async () => { await remove('tables', t.id); toast('Mesa excluída'); } : null,
    deleteConfirm: 'Excluir esta mesa? Os convidados dela ficarão sem mesa.',
  });
}

function bulkTablesForm() {
  const n = state.items.tables.length;
  formModal({
    title: 'Criar várias mesas',
    values: { count: 10, seats: 8, prefix: 'Mesa', start: n + 1 },
    fields: [
      { name: 'count', label: 'Quantidade de mesas', type: 'number', min: 1, max: 200, required: true },
      { name: 'seats', label: 'Lugares por mesa', type: 'number', min: 1, max: 100, required: true },
      { name: 'prefix', label: 'Nome', required: true },
      { name: 'start', label: 'Começar a numeração em', type: 'number', min: 0 },
    ],
    submitLabel: 'Criar',
    onSubmit: async (d) => {
      const count = Math.min(200, Math.max(1, Math.round(d.count)));
      const start = Math.round(d.start ?? 1);
      await bulkCreate('tables', Array.from({ length: count }, (_, i) => ({ name: `${d.prefix} ${start + i}`, seats: d.seats })));
      toast(`${count} mesas criadas`);
    },
  });
}

function seatDialog(table) {
  let q = '';
  const picked = new Set();
  openModal({
    title: `Adicionar à ${table.name}`,
    body: () => {
      const seated = sum(state.items.guests.filter((g) => g.tableId === table.id), guestPeople);
      const free = (Number(table.seats) || 0) - seated;
      const list = state.items.guests
        .filter((g) => !g.tableId && g.rsvp !== 'recusado' && (!q || norm(g.name + ' ' + (g.group || '')).includes(norm(q))))
        .sort((a, b) => (a.rsvp === 'confirmado' ? 0 : 1) - (b.rsvp === 'confirmado' ? 0 : 1) || a.name.localeCompare(b.name));
      const pickedPeople = sum(state.items.guests.filter((g) => picked.has(g.id)), guestPeople);
      return html`<p class="form-intro">${plural(Math.max(0, free), 'lugar livre', 'lugares livres')}${pickedPeople ? html` · <strong class="${pickedPeople > free ? 'text-danger' : ''}">${plural(pickedPeople, 'pessoa selecionada', 'pessoas selecionadas')}</strong>` : ''}</p>
        ${searchBox('seat-q', q, 'Buscar convidado sem mesa…')}
        ${list.length ? html`<div class="pick-list">${list.map((g) => html`<label class="pick">
          <input type="checkbox" value="${g.id}" ${picked.has(g.id) ? 'checked' : ''}>
          <span class="pick-name">${g.name}<small>${sideLabel(g.side)}${g.group ? ` · ${g.group}` : ''}${g.rsvp === 'confirmado' ? ' · confirmado' : ''}</small></span>
          <span class="people-n">${guestPeople(g)}</span>
        </label>`)}</div>` : html`<p class="muted pad">${q ? 'Ninguém encontrado.' : 'Todos os convidados já têm mesa.'}</p>`}`;
    },
    footer: html`<span class="spacer"></span><button type="button" class="btn btn-ghost" data-cancel>Cancelar</button><button type="button" class="btn btn-primary" data-ok>Adicionar</button>`,
    onMount(m) {
      const input = m.body.querySelector('#seat-q');
      input.oninput = () => {
        q = input.value;
        const pos = input.selectionStart;
        m.render();
        const ni = m.body.querySelector('#seat-q');
        ni.focus(); ni.setSelectionRange(pos, pos);
      };
      m.body.onchange = (e) => {
        if (e.target.type !== 'checkbox') return;
        if (e.target.checked) picked.add(e.target.value); else picked.delete(e.target.value);
        m.render();
      };
      m.foot.querySelector('[data-cancel]').onclick = () => m.close();
      m.foot.querySelector('[data-ok]').onclick = async () => {
        if (!picked.size) { m.close(); return; }
        await run(async () => {
          await updateMany('guests', [...picked], () => ({ tableId: table.id }));
          toast(`${plural(picked.size, 'convite adicionado', 'convites adicionados')} à ${table.name}`);
          m.close();
        });
      };
    },
  });
}

export default {
  render() {
    const tables = sortTables(state.items.tables);
    const guests = state.items.guests.filter((g) => g.rsvp !== 'recusado');
    const seats = sum(tables, (t) => t.seats);
    const seatedPeople = sum(guests.filter((g) => g.tableId), guestPeople);
    const q = norm(ui.q.trim());
    const unseated = guests.filter((g) => !g.tableId && (!ui.onlyConfirmed || g.rsvp === 'confirmado') && (!q || norm(g.name).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    const unseatedPeople = sum(guests.filter((g) => !g.tableId), guestPeople);
    const tableOpts = [{ value: '', label: 'Escolher mesa…' }, ...tables.map((t) => ({ value: t.id, label: t.name }))];

    return html`
      ${pageHead('Mapa de mesas', `${plural(tables.length, 'mesa', 'mesas')} · ${seats} lugares · ${seatedPeople} pessoas sentadas`,
        html`<button type="button" class="btn btn-ghost" data-act="bulk">${icon('grid')}<span class="hide-sm">Várias mesas</span></button><button type="button" class="btn btn-primary" data-act="add">${icon('plus')}<span>Mesa</span></button>`)}
      ${!tables.length ? empty('tables', 'Nenhuma mesa ainda', 'Crie as mesas e distribua os convidados. Convidados que não vão (recusados) não aparecem aqui.',
        html`<div class="empty-actions"><button type="button" class="btn btn-primary" data-act="bulk">Criar várias mesas</button><button type="button" class="btn btn-ghost" data-act="add">Criar uma mesa</button></div>`)
        : html`<div class="seating">
        <section class="card unseated">
          <header class="card-head"><h2>Sem mesa</h2><span class="badge b-${unseatedPeople ? 'warn' : 'ok'}">${plural(unseatedPeople, 'pessoa', 'pessoas')}</span></header>
          <div class="pad-x">${searchBox('q-seat', ui.q, 'Buscar…')}
            <label class="check small"><input type="checkbox" id="only-conf" ${ui.onlyConfirmed ? 'checked' : ''}><span>Só confirmados</span></label></div>
          ${unseated.length ? html`<div class="list compact">${unseated.map((g) => html`<div class="row">
            <div class="row-main"><div class="row-title">${g.name}</div><div class="row-meta"><span>${plural(guestPeople(g), 'pessoa', 'pessoas')}</span>${g.group ? html`<span>${g.group}</span>` : ''}</div></div>
            <select class="select-sm" data-act="assign" data-id="${g.id}" aria-label="Mesa para ${g.name}">${selectOptions(tableOpts, '')}</select>
          </div>`)}</div>` : html`<p class="muted pad">${unseatedPeople ? 'Ninguém encontrado.' : 'Todos os convidados estão sentados. ✨'}</p>`}
        </section>
        <div class="table-grid">${tables.map((t) => {
          const list = state.items.guests.filter((g) => g.tableId === t.id);
          const occ = sum(list, guestPeople);
          const cap = Number(t.seats) || 0;
          const pct = cap ? Math.min(100, Math.round((occ / cap) * 100)) : 0;
          const over = occ > cap;
          return html`<article class="card table-card ${over ? 'over' : ''}">
            <header>
              <div class="ring" style="--p:${pct}"><span>${occ}/${cap}</span></div>
              <div class="tc-title"><h3>${t.name}</h3><small class="${over ? 'text-danger' : 'muted'}">${over ? `${occ - cap} acima da capacidade` : `${plural(cap - occ, 'lugar livre', 'lugares livres')}`}</small></div>
              <button type="button" class="btn-icon" data-act="edit" data-id="${t.id}" aria-label="Editar mesa">${icon('edit')}</button>
            </header>
            ${list.length ? html`<ul class="seat-list">${list.sort((a, b) => a.name.localeCompare(b.name)).map((g) => html`<li>
              <span>${g.name}${guestPeople(g) > 1 ? html` <small>+${guestPeople(g) - 1}</small>` : ''}</span>
              <button type="button" class="btn-icon sm" data-act="unseat" data-id="${g.id}" aria-label="Tirar da mesa">${icon('x')}</button>
            </li>`)}</ul>` : html`<p class="muted small">Mesa vazia</p>`}
            <button type="button" class="btn btn-ghost btn-sm btn-block" data-act="seat" data-id="${t.id}">${icon('plus')}<span>Adicionar convidados</span></button>
          </article>`;
        })}</div>
      </div>`}`;
  },

  mount(el) {
    el.onclick = (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const id = a.dataset.id;
      switch (a.dataset.act) {
        case 'add': tableForm(); break;
        case 'bulk': bulkTablesForm(); break;
        case 'edit': tableForm(state.items.tables.find((t) => t.id === id)); break;
        case 'seat': seatDialog(state.items.tables.find((t) => t.id === id)); break;
        case 'unseat': run(() => update('guests', id, { tableId: '' })); break;
      }
    };
    el.oninput = (e) => { if (e.target.id === 'q-seat') { ui.q = e.target.value; emit(); } };
    el.onchange = (e) => {
      const t = e.target;
      if (t.id === 'only-conf') { ui.onlyConfirmed = t.checked; emit(); }
      else if (t.dataset.act === 'assign' && t.value) run(() => update('guests', t.dataset.id, { tableId: t.value }));
    };
  },
};
