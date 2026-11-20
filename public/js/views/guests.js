import { state, create, update, remove, bulkCreate, emit } from '../store.js';
import { html, icon, pageHead, chips, searchBox, empty, formModal, openModal, toast, run, norm, sum, plural, initials, downloadCSV, selectOptions } from '../ui.js';
import { RSVP, sideOptions, sideLabel, guestPeople, waLink } from '../domain.js';

const ui = { rsvp: 'todos', side: '', group: '', q: '', sort: 'nome' };
const DEFAULT_GROUPS = ['Família', 'Amigos', 'Trabalho', 'Padrinhos', 'Faculdade', 'Vizinhos'];

const groupsList = () => [...new Set([...DEFAULT_GROUPS, ...state.items.guests.map((g) => g.group).filter(Boolean)])].sort();
const tableOptions = () => [{ value: '', label: '— Sem mesa —' }, ...[...state.items.tables].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true })).map((t) => ({ value: t.id, label: t.name }))];

export function guestForm(g = {}) {
  formModal({
    title: g.id ? 'Editar convidado' : 'Novo convidado',
    size: 'lg',
    values: { side: 'ambos', adults: 1, children: 0, rsvp: 'pendente', tableId: '', ...g },
    fields: [
      { name: 'name', label: 'Nome (ou família)', required: true, full: true, placeholder: 'Ex.: Tia Maria e Tio João' },
      { name: 'side', label: 'Lado', type: 'select', options: sideOptions() },
      { name: 'group', label: 'Grupo', list: groupsList(), placeholder: 'Família, Amigos…' },
      { name: 'adults', label: 'Adultos', type: 'number', min: 0, max: 50 },
      { name: 'children', label: 'Crianças', type: 'number', min: 0, max: 50 },
      { name: 'rsvp', label: 'Presença', type: 'select', options: RSVP.map((r) => ({ value: r.key, label: r.label })) },
      { name: 'tableId', label: 'Mesa', type: 'select', options: tableOptions() },
      { name: 'phone', label: 'Telefone / WhatsApp', type: 'tel' },
      { name: 'email', label: 'E-mail', type: 'email' },
      { name: 'address', label: 'Endereço (para o convite)', full: true },
      { name: 'diet', label: 'Restrições alimentares', full: true, placeholder: 'Vegetariano, alergia a…' },
      { name: 'invited', label: 'Convite entregue', type: 'checkbox' },
      { name: 'saveTheDate', label: 'Save the date enviado', type: 'checkbox' },
      { name: 'notes', label: 'Observações', type: 'textarea', full: true, rows: 2 },
    ],
    onSubmit: async (d) => {
      d.adults = d.adults ?? 0;
      d.children = d.children ?? 0;
      if (g.id) await update('guests', g.id, d); else await create('guests', d);
      toast(g.id ? 'Convidado atualizado' : 'Convidado adicionado');
    },
    onDelete: g.id ? async () => { await remove('guests', g.id); toast('Convidado removido'); } : null,
  });
}

function parseImport(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const cols = (line.includes('\t') ? line.split('\t') : line.split(';')).map((c) => c.trim());
    const [name, group, adults, children, phone] = cols;
    const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };
    return { name, group: group || '', adults: int(adults, 1), children: int(children, 0), phone: phone || '' };
  }).filter((g) => g.name && !/^nome$/i.test(g.name));
}

function importDialog() {
  openModal({
    title: 'Importar da planilha',
    size: 'lg',
    body: html`<p class="form-intro">Copie as linhas da sua planilha do Excel / Google Sheets e cole abaixo. Uma linha por convite, nas colunas:</p>
      <div class="import-cols"><span>Nome</span><span>Grupo</span><span>Adultos</span><span>Crianças</span><span>Telefone</span></div>
      <p class="hint small">Só o nome é obrigatório. Também aceita colunas separadas por ponto e vírgula (;).</p>
      <form class="form-grid" novalidate>
        <div class="field full"><label for="imp_text">Dados</label><textarea id="imp_text" rows="9" placeholder="Maria Souza&#9;Família&#9;2&#9;1&#9;11999999999"></textarea></div>
        <div class="field"><label for="imp_side">Lado</label><select id="imp_side">${selectOptions(sideOptions(), 'ambos')}</select></div>
        <div class="field"><label>Prévia</label><p class="imp-preview muted">Nada colado ainda.</p></div>
        <p class="form-error full" role="alert"></p>
      </form>`,
    footer: html`<span class="spacer"></span><button type="button" class="btn btn-ghost" data-cancel>Cancelar</button><button type="button" class="btn btn-primary" data-ok>Importar</button>`,
    onMount(m) {
      const ta = m.body.querySelector('#imp_text');
      const prev = m.body.querySelector('.imp-preview');
      ta.oninput = () => {
        const list = parseImport(ta.value);
        prev.textContent = list.length ? `${plural(list.length, 'convite', 'convites')} · ${plural(sum(list, guestPeople), 'pessoa', 'pessoas')}` : 'Nada colado ainda.';
      };
      m.foot.querySelector('[data-cancel]').onclick = () => m.close();
      const ok = m.foot.querySelector('[data-ok]');
      ok.onclick = async () => {
        const list = parseImport(ta.value);
        if (!list.length) { m.body.querySelector('.form-error').textContent = 'Cole pelo menos uma linha com nome.'; return; }
        const side = m.body.querySelector('#imp_side').value;
        ok.disabled = true; ok.classList.add('loading');
        const r = await run(() => bulkCreate('guests', list.map((g) => ({ ...g, side, rsvp: 'pendente', tableId: '' }))));
        ok.disabled = false; ok.classList.remove('loading');
        if (r) { toast(`${plural(r.length, 'convite importado', 'convites importados')}`); m.close(); }
      };
    },
  });
}

function exportGuests() {
  const tables = Object.fromEntries(state.items.tables.map((t) => [t.id, t.name]));
  const rows = [['Nome', 'Lado', 'Grupo', 'Adultos', 'Crianças', 'Presença', 'Mesa', 'Telefone', 'E-mail', 'Endereço', 'Restrições', 'Convite entregue', 'Observações']];
  for (const g of [...state.items.guests].sort((a, b) => a.name.localeCompare(b.name))) {
    rows.push([g.name, sideLabel(g.side), g.group, g.adults, g.children, RSVP.find((r) => r.key === g.rsvp)?.label || 'Pendente', tables[g.tableId] || '', g.phone, g.email, g.address, g.diet, g.invited ? 'Sim' : 'Não', g.notes]);
  }
  downloadCSV('convidados.csv', rows);
}

export default {
  render() {
    const all = state.items.guests;
    const people = sum(all, guestPeople);
    const by = (k) => sum(all.filter((g) => (g.rsvp || 'pendente') === k), guestPeople);
    const adults = sum(all, (g) => g.adults), kids = sum(all, (g) => g.children);
    const est = Number(state.settings.guestEstimate) || 0;
    const tables = Object.fromEntries(state.items.tables.map((t) => [t.id, t.name]));
    const q = norm(ui.q.trim());
    const list = all.filter((g) => {
      if (ui.rsvp !== 'todos' && (g.rsvp || 'pendente') !== ui.rsvp) return false;
      if (ui.side && g.side !== ui.side) return false;
      if (ui.group && g.group !== ui.group) return false;
      if (q && !norm(`${g.name} ${g.group || ''} ${g.notes || ''} ${g.phone || ''}`).includes(q)) return false;
      return true;
    }).sort((a, b) => {
      if (ui.sort === 'grupo') return String(a.group || '~').localeCompare(String(b.group || '~')) || a.name.localeCompare(b.name);
      if (ui.sort === 'recente') return (b._created || 0) - (a._created || 0);
      return a.name.localeCompare(b.name);
    });
    const sides = sideOptions();
    const groups = [...new Set(all.map((g) => g.group).filter(Boolean))].sort();

    return html`
      ${pageHead('Convidados', `${plural(all.length, 'convite', 'convites')} · ${plural(people, 'pessoa', 'pessoas')}${est ? ` (estimativa: ${est})` : ''}`,
        html`<button type="button" class="btn btn-ghost" data-act="import" title="Colar da planilha">${icon('paste')}<span class="hide-sm">Importar</span></button>
             <button type="button" class="btn btn-ghost hide-sm" data-act="export">${icon('download')}<span>Exportar</span></button>
             <button type="button" class="btn btn-primary" data-act="add">${icon('plus')}<span>Convidado</span></button>`)}
      <div class="kpis kpis-4">
        <div class="kpi"><small>Confirmados</small><strong class="text-ok">${by('confirmado')}</strong></div>
        <div class="kpi"><small>Pendentes</small><strong class="text-warn">${by('pendente')}</strong></div>
        <div class="kpi"><small>Não vão</small><strong class="text-danger">${by('recusado')}</strong></div>
        <div class="kpi"><small>Adultos · Crianças</small><strong>${adults} · ${kids}</strong></div>
      </div>
      ${people ? html`<div class="stack-bar" aria-hidden="true">
        <span class="sb-ok" style="flex:${by('confirmado')}"></span><span class="sb-warn" style="flex:${by('pendente')}"></span><span class="sb-danger" style="flex:${by('recusado')}"></span>
      </div>
      <div class="side-split">${sides.map((s) => html`<span><strong>${sum(all.filter((g) => g.side === s.value), guestPeople)}</strong> ${s.label.replace('Lado de ', '')}</span>`)}</div>` : ''}
      <div class="toolbar">
        ${searchBox('q-guests', ui.q, 'Buscar convidado…')}
        <select class="select-sm" id="side-guests" aria-label="Lado"><option value="">Todos os lados</option>${selectOptions(sides, ui.side)}</select>
        ${groups.length ? html`<select class="select-sm" id="group-guests" aria-label="Grupo"><option value="">Todos os grupos</option>${groups.map((g) => html`<option ${g === ui.group ? 'selected' : ''}>${g}</option>`)}</select>` : ''}
        <select class="select-sm" id="sort-guests" aria-label="Ordenar">${selectOptions([{ value: 'nome', label: 'Ordem: nome' }, { value: 'grupo', label: 'Ordem: grupo' }, { value: 'recente', label: 'Ordem: recentes' }], ui.sort)}</select>
      </div>
      ${chips('rsvp', [{ value: 'todos', label: 'Todos', count: all.length }, ...RSVP.map((r) => ({ value: r.key, label: r.label, count: all.filter((g) => (g.rsvp || 'pendente') === r.key).length }))], ui.rsvp)}
      ${!all.length ? empty('users', 'Nenhum convidado ainda', 'Adicione um por um ou cole a lista direto da sua planilha antiga.',
        html`<div class="empty-actions"><button type="button" class="btn btn-primary" data-act="import">${icon('paste')}<span>Importar da planilha</span></button><button type="button" class="btn btn-ghost" data-act="add">Adicionar manualmente</button></div>`)
        : !list.length ? empty('search', 'Ninguém encontrado', 'Nenhum convidado corresponde ao filtro.')
        : html`<div class="card list">${list.map((g) => {
          const n = guestPeople(g);
          const wa = waLink(g.phone);
          return html`<div class="row clickable guest-row" data-act="edit" data-id="${g.id}">
            <span class="avatar side-${g.side || 'ambos'}">${initials(g.name)}</span>
            <div class="row-main">
              <div class="row-title">${g.name}</div>
              <div class="row-meta">
                <span>${sideLabel(g.side)}</span>
                ${g.group ? html`<span>${g.group}</span>` : ''}
                <span>${plural(Number(g.adults) || 0, 'adulto', 'adultos')}${Number(g.children) ? ` + ${plural(Number(g.children), 'criança', 'crianças')}` : ''}</span>
                ${g.tableId && tables[g.tableId] ? html`<span>${icon('tables')} ${tables[g.tableId]}</span>` : ''}
                ${g.diet ? html`<span title="${g.diet}">🍽 ${g.diet}</span>` : ''}
                ${g.invited ? html`<span class="text-ok" title="Convite entregue">${icon('mail')}</span>` : ''}
              </div>
            </div>
            ${wa ? html`<a class="btn-icon hide-sm" href="${wa}" target="_blank" rel="noopener noreferrer" data-act="link" title="WhatsApp" aria-label="WhatsApp">${icon('chat')}</a>` : ''}
            <span class="people-n" title="${plural(n, 'pessoa', 'pessoas')}">${n}</span>
            <select class="pill-select rsvp-${g.rsvp || 'pendente'}" data-act="rsvp" data-id="${g.id}" aria-label="Presença">${selectOptions(RSVP.map((r) => ({ value: r.key, label: r.label })), g.rsvp || 'pendente')}</select>
          </div>`;
        })}</div>`}`;
  },

  mount(el) {
    el.onclick = (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      switch (a.dataset.act) {
        case 'add': guestForm(); break;
        case 'edit': guestForm(state.items.guests.find((g) => g.id === a.dataset.id)); break;
        case 'import': importDialog(); break;
        case 'export': exportGuests(); break;
        case 'chip': ui[a.dataset.group] = a.dataset.val; emit(); break;
      }
    };
    el.oninput = (e) => { if (e.target.id === 'q-guests') { ui.q = e.target.value; emit(); } };
    el.onchange = (e) => {
      const t = e.target;
      if (t.id === 'side-guests') { ui.side = t.value; emit(); }
      else if (t.id === 'group-guests') { ui.group = t.value; emit(); }
      else if (t.id === 'sort-guests') { ui.sort = t.value; emit(); }
      else if (t.dataset.act === 'rsvp') run(() => update('guests', t.dataset.id, { rsvp: t.value }));
    };
  },
};
