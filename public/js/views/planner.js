// Telas da assessoria: só consulta. O servidor já entrega apenas o que a assessoria pode ver
// (fornecedores sem valores, contratos e documentos, convidados, mesas, cronograma) e recusa qualquer gravação,
// exceto as anotações da assessoria para os noivos.
import { state, emit, byId, create, update, remove } from '../store.js';
import {
  html, icon, pageHead, chips, searchBox, empty, openModal, norm, plural, sum, badge, initials, downloadCSV,
  selectOptions, fmtDate, fmtDateLong, fmtDateTime, fmtSize, daysBetween, todayISO, getTheme, applyTheme, formModal, toast, run,
} from '../ui.js';
import {
  coupleTitle, VENDOR_STATUS, vendorStatus, RSVP, FILE_CATEGORIES, IMAGE_EXT, fileCategory, sideOptions, sideLabel,
  guestPeople, waLink, mapsLink, missingCategories, contractedVendors, filesOf, userName,
} from '../domain.js';
import { contactLinks, stars, fileUrl } from '../forms.js';
import { accountForm, passwordForm, devicesDialog, leaveWorkspace, deleteMyAccount } from './settings.js';

const PLANNER_CATS = new Set(['contrato', 'documento', 'inspiracao', 'outros']);
const sortKey = (t) => { const h = String(t.time || '99:99'); return (h < '06:00' ? '2' : '1') + h; };
const readonlyNote = html`<p class="ro-note">${icon('shield')}<span>Acesso de assessoria: somente consulta. Para pedir uma mudança, deixe uma <a href="#/anotacoes" class="link">anotação para os noivos</a>.</span></p>`;

function fileRow(f, { showVendor = true } = {}) {
  const vendor = f.vendorId ? byId('vendors', f.vendorId) : null;
  const isImg = IMAGE_EXT.has(f.ext);
  return html`<div class="row file-row">
    <a class="file-thumb ${isImg ? 'is-img' : ''}" href="${fileUrl(f)}" target="_blank" rel="noopener">
      ${isImg ? html`<img src="${fileUrl(f)}" alt="" loading="lazy">` : html`<span class="ext">${f.ext}</span>`}
    </a>
    <div class="row-main">
      <a class="row-title link" href="${fileUrl(f)}" target="_blank" rel="noopener">${f.name}</a>
      <div class="row-meta"><span>${fileCategory(f.category).label}</span><span>${fmtSize(f.size)}</span><span>${new Date(f.createdAt).toLocaleDateString('pt-BR')}</span>${showVendor && vendor ? html`<span>${icon('briefcase')} ${vendor.name}</span>` : ''}</div>
      ${f.note ? html`<div class="row-note">${f.note}</div>` : ''}
    </div>
    <div class="row-actions">
      <a class="btn-icon" href="${fileUrl(f)}" target="_blank" rel="noopener" title="Abrir" aria-label="Abrir">${icon('eye')}</a>
      <a class="btn-icon" href="${fileUrl(f, true)}" title="Baixar" aria-label="Baixar">${icon('download')}</a>
    </div>
  </div>`;
}

function infoItem(ic, label, value, link) {
  if (!value) return '';
  return html`<div class="info-item">${icon(ic)}<div><small>${label}</small>${link ? html`<a href="${link}" target="_blank" rel="noopener noreferrer" class="link">${value}</a>` : html`<span>${value}</span>`}</div></div>`;
}

// ---------------------------------------------------------------------------
// Fornecedor (detalhe)
// ---------------------------------------------------------------------------
function openVendor(id) {
  const v = byId('vendors', id);
  if (!v) return;
  const st = vendorStatus(v.status);
  const files = filesOf(id);
  openModal({
    title: v.name,
    size: 'lg',
    body: html`
      <div class="vd-head">${v.category ? html`<span class="eyebrow">${v.category}</span>` : ''}${badge(st.label, st.kind)}${stars(v.rating)}</div>
      <div class="info-list ro-contacts">
        ${infoItem('user', 'Pessoa de contato', v.contactName)}
        ${infoItem('phone', 'Telefone / WhatsApp', v.phone, waLink(v.phone))}
        ${infoItem('mail', 'E-mail', v.email, v.email ? `mailto:${v.email}` : null)}
        ${infoItem('insta', 'Instagram', v.instagram)}
        ${infoItem('link', 'Site', v.website)}
      </div>
      ${contactLinks(v, { labels: true })}
      ${!v.contactName && !v.phone && !v.email && !v.instagram && !v.website ? html`<p class="muted small">Os noivos ainda não cadastraram contatos deste fornecedor.</p>` : ''}
      <section class="vd-section">
        <div class="sec-head"><h3>Contrato e documentos</h3></div>
        ${files.length ? html`<div class="list">${files.map((f) => fileRow(f, { showVendor: false }))}</div>` : html`<p class="muted small">Nenhum contrato ou documento anexado.</p>`}
      </section>
      ${v.included ? html`<section class="vd-section"><h3>O que está incluso</h3><p class="prewrap">${v.included}</p></section>` : ''}
      ${v.notes ? html`<section class="vd-section"><h3>Observações</h3><p class="prewrap">${v.notes}</p></section>` : ''}
      ${v.contractDate ? html`<p class="muted small">Contrato assinado em ${fmtDate(v.contractDate)}</p>` : ''}`,
  });
}

// ---------------------------------------------------------------------------
// Visão geral
// ---------------------------------------------------------------------------
const overview = {
  render() {
    const s = state.settings;
    const I = state.items;
    const days = s.date ? daysBetween(todayISO(), s.date) : null;
    const people = sum(I.guests, guestPeople);
    const conf = sum(I.guests.filter((g) => g.rsvp === 'confirmado'), guestPeople);
    const vContr = contractedVendors().sort((a, b) => (a.category || '').localeCompare(b.category || ''));
    const { missing } = missingCategories();
    const moments = [...I.timeline].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const contracts = state.files.filter((f) => f.category === 'contrato').length;

    return html`
      <section class="hero">
        <div class="hero-text">
          <p class="eyebrow">${s.date ? fmtDateLong(s.date) : 'Data a definir'}${s.time ? ` · ${s.time}` : ''}</p>
          <h1 class="hero-title">${coupleTitle()}</h1>
          ${s.receptionPlace || s.ceremonyPlace ? html`<p class="hero-place">${icon('pin')} ${s.ceremonyPlace || s.receptionPlace}${s.ceremonyPlace && s.receptionPlace && s.ceremonyPlace !== s.receptionPlace ? ` · ${s.receptionPlace}` : ''}</p>` : ''}
          <span class="badge b-accent">Assessoria · consulta</span>
        </div>
        <div class="countdown">${days == null ? html`<div class="cd-label">Ainda sem data</div>`
          : days === 0 ? html`<div class="cd-num">Hoje</div><div class="cd-label">é o grande dia!</div>`
          : days < 0 ? html`<div class="cd-num">${-days}</div><div class="cd-label">${-days === 1 ? 'dia' : 'dias'} desde o casamento</div>`
          : html`<div class="cd-num">${days}</div><div class="cd-label">${days === 1 ? 'dia' : 'dias'} para o casamento</div>`}</div>
      </section>

      <div class="stats">
        <a class="stat" href="#/fornecedores"><span class="stat-label">${icon('briefcase')} Fornecedores</span><strong>${vContr.length}<small> contratados</small></strong><span class="stat-foot">${missing.length ? `${missing.length} categorias sem contratar` : 'nada faltando'}</span></a>
        <a class="stat" href="#/convidados"><span class="stat-label">${icon('users')} Confirmados</span><strong>${conf}<small> / ${people}</small></strong><span class="stat-foot">${plural(I.guests.length, 'convite', 'convites')}</span></a>
        <a class="stat" href="#/documentos"><span class="stat-label">${icon('file')} Contratos</span><strong>${contracts}</strong><span class="stat-foot">${plural(state.files.length, 'arquivo', 'arquivos')} no total</span></a>
        <a class="stat" href="#/cronograma"><span class="stat-label">${icon('clock')} Cronograma</span><strong>${moments.length}<small> momentos</small></strong><span class="stat-foot">${moments[0] ? `começa às ${moments[0].time}` : 'ainda não montado'}</span></a>
      </div>

      <div class="dash-grid">
        <div class="dash-col">
          <section class="card">
            <header class="card-head"><h2>Fornecedores contratados</h2><a href="#/fornecedores" class="link-more">Ver todos ${icon('chevron')}</a></header>
            ${vContr.length ? html`<div class="list">${vContr.map((v) => html`<div class="row clickable" data-act="open" data-id="${v.id}">
              <div class="row-main"><div class="row-title">${v.name}</div><div class="row-meta"><span>${v.category || 'Sem categoria'}</span>${v.contactName ? html`<span>${icon('user')} ${v.contactName}</span>` : ''}${filesOf(v.id).length ? html`<span>${icon('clip')} ${filesOf(v.id).length}</span>` : ''}</div></div>
              ${contactLinks(v)}
            </div>`)}</div>` : html`<p class="muted pad">Nenhum fornecedor contratado ainda.</p>`}
          </section>
          ${moments.length ? html`<section class="card">
            <header class="card-head"><h2>Roteiro do dia</h2><a href="#/cronograma" class="link-more">Cronograma ${icon('chevron')}</a></header>
            <div class="list">${moments.slice(0, 6).map((it) => html`<div class="row"><div class="date-chip">${it.time}</div><div class="row-main"><div class="row-title">${it.title}</div><div class="row-meta">${it.place ? html`<span>${icon('pin')} ${it.place}</span>` : ''}${it.responsible ? html`<span>${icon('user')} ${it.responsible}</span>` : ''}</div></div></div>`)}</div>
          </section>` : ''}
        </div>
        <div class="dash-col">
          <section class="card">
            <header class="card-head"><h2>O casamento</h2></header>
            <div class="info-list">
              ${infoItem('heart', 'Cerimônia', [s.ceremonyPlace, s.ceremonyAddress].filter(Boolean).join(' — '), mapsLink(s.ceremonyAddress || s.ceremonyPlace))}
              ${infoItem('pin', 'Recepção', [s.receptionPlace, s.receptionAddress].filter(Boolean).join(' — '), mapsLink(s.receptionAddress || s.receptionPlace))}
              ${infoItem('users', 'Convidados estimados', s.guestEstimate ? `${s.guestEstimate} pessoas` : '')}
              ${infoItem('sparkle', 'Estilo', s.style)}
              ${infoItem('user', 'Traje', s.dressCode)}
              ${infoItem('link', 'Hashtag / site', s.hashtag)}
            </div>
            ${s.overview ? html`<blockquote class="vision">${s.overview}</blockquote>` : ''}
            ${!s.ceremonyPlace && !s.receptionPlace && !s.style && !s.overview ? html`<p class="muted pad">Os noivos ainda não preencheram os detalhes do casamento.</p>` : ''}
          </section>
          <section class="card">
            <header class="card-head"><h2>Anotações para os noivos</h2><a href="#/anotacoes" class="link-more">Ver todas ${icon('chevron')}</a></header>
            ${I.notes.length ? html`<div class="mini-notes">${[...I.notes].sort((a, b) => (b._updated || 0) - (a._updated || 0)).slice(0, 3).map((n) => html`<a href="#/anotacoes" class="mini-note note-${n.color || 'creme'}"><strong>${n.title || 'Sem título'}</strong><p>${String(n.body || '').slice(0, 160)}</p></a>`)}</div>`
              : html`<div class="pad"><p class="muted small">Recados, pendências e lembretes que você deixar aqui aparecem para os noivos.</p><a href="#/anotacoes" class="btn btn-ghost btn-sm">${icon('plus')}<span>Escrever anotação</span></a></div>`}
          </section>
          ${missing.length ? html`<section class="card">
            <header class="card-head"><h2>Ainda falta contratar</h2></header>
            <div class="tag-cloud">${missing.map((c) => html`<span class="tag-btn is-static">${c.name}</span>`)}</div>
          </section>` : ''}
        </div>
      </div>`;
  },
  mount(el) {
    el.onclick = (e) => { const a = e.target.closest('[data-act="open"]'); if (a && !e.target.closest('a')) openVendor(a.dataset.id); };
  },
};

// ---------------------------------------------------------------------------
// Fornecedores
// ---------------------------------------------------------------------------
const vui = { status: 'todos', q: '' };
function exportContacts() {
  const rows = [['Fornecedor', 'Categoria', 'Status', 'Contato', 'Telefone', 'E-mail', 'Instagram', 'Site']];
  for (const v of [...state.items.vendors].sort((a, b) => (a.category || '').localeCompare(b.category || ''))) {
    rows.push([v.name, v.category, vendorStatus(v.status).label, v.contactName, v.phone, v.email, v.instagram, v.website]);
  }
  downloadCSV('contatos-fornecedores.csv', rows);
}
const vendors = {
  render() {
    const all = state.items.vendors;
    const q = norm(vui.q.trim());
    const counts = Object.fromEntries(VENDOR_STATUS.map((s) => [s.key, all.filter((v) => (v.status || 'pesquisando') === s.key).length]));
    const list = all.filter((v) => {
      if (vui.status !== 'todos' && (v.status || 'pesquisando') !== vui.status) return false;
      return !q || norm(`${v.name} ${v.category} ${v.contactName || ''}`).includes(q);
    }).sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    return html`
      ${pageHead('Fornecedores', `${plural(contractedVendors().length, 'contratado', 'contratados')} · ${plural(all.length, 'fornecedor', 'fornecedores')}`,
        all.length ? html`<button type="button" class="btn btn-ghost" data-act="export">${icon('download')}<span>Exportar contatos</span></button>` : '')}
      ${readonlyNote}
      <div class="toolbar">${searchBox('q-pvendors', vui.q, 'Buscar fornecedor…')}</div>
      ${chips('status', [{ value: 'todos', label: 'Todos', count: all.length }, ...VENDOR_STATUS.map((s) => ({ value: s.key, label: s.label, count: counts[s.key] }))], vui.status)}
      ${!all.length ? empty('briefcase', 'Nenhum fornecedor ainda', 'Quando os noivos cadastrarem fornecedores, eles aparecem aqui com contatos e contratos.')
        : !list.length ? empty('search', 'Nada encontrado', 'Nenhum fornecedor corresponde ao filtro.')
        : html`<div class="vendor-grid">${list.map((v) => {
          const st = vendorStatus(v.status);
          const nFiles = filesOf(v.id).length;
          return html`<article class="card vendor-card ${v.status === 'descartado' ? 'is-muted' : ''}" data-act="open" data-id="${v.id}" tabindex="0">
            <div class="vc-top"><span class="eyebrow" title="${v.category || 'Sem categoria'}">${v.category || 'Sem categoria'}</span>${badge(st.label, st.kind)}</div>
            <h3>${v.name}</h3>
            ${v.contactName ? html`<p class="muted small">${icon('user')} ${v.contactName}</p>` : ''}
            ${v.phone ? html`<p class="muted small">${icon('phone')} ${v.phone}</p>` : ''}
            <div class="vc-foot">${contactLinks(v)}<span class="vc-meta">${stars(v.rating)}${nFiles ? html`<span title="Contratos e documentos">${icon('clip')} ${nFiles}</span>` : ''}</span></div>
          </article>`;
        })}</div>`}`;
  },
  mount(el) {
    el.onclick = (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'open') openVendor(a.dataset.id);
      else if (a.dataset.act === 'chip') { vui[a.dataset.group] = a.dataset.val; emit(); }
      else if (a.dataset.act === 'export') exportContacts();
    };
    el.onkeydown = (e) => { if (e.key === 'Enter' && e.target.matches('.vendor-card')) openVendor(e.target.dataset.id); };
    el.oninput = (e) => { if (e.target.id === 'q-pvendors') { vui.q = e.target.value; emit(); } };
  },
};

// ---------------------------------------------------------------------------
// Convidados
// ---------------------------------------------------------------------------
const gui = { rsvp: 'todos', side: '', q: '' };
function exportGuests() {
  const tables = Object.fromEntries(state.items.tables.map((t) => [t.id, t.name]));
  const rows = [['Nome', 'Lado', 'Grupo', 'Adultos', 'Crianças', 'Presença', 'Mesa', 'Telefone', 'Restrições']];
  for (const g of [...state.items.guests].sort((a, b) => a.name.localeCompare(b.name))) {
    rows.push([g.name, sideLabel(g.side), g.group, g.adults, g.children, RSVP.find((r) => r.key === g.rsvp)?.label || 'Pendente', tables[g.tableId] || '', g.phone, g.diet]);
  }
  downloadCSV('convidados.csv', rows);
}
const guests = {
  render() {
    const all = state.items.guests;
    const people = sum(all, guestPeople);
    const by = (k) => sum(all.filter((g) => (g.rsvp || 'pendente') === k), guestPeople);
    const tables = Object.fromEntries(state.items.tables.map((t) => [t.id, t.name]));
    const q = norm(gui.q.trim());
    const list = all.filter((g) => {
      if (gui.rsvp !== 'todos' && (g.rsvp || 'pendente') !== gui.rsvp) return false;
      if (gui.side && g.side !== gui.side) return false;
      return !q || norm(`${g.name} ${g.group || ''} ${g.phone || ''}`).includes(q);
    }).sort((a, b) => a.name.localeCompare(b.name));
    return html`
      ${pageHead('Convidados', `${plural(all.length, 'convite', 'convites')} · ${plural(people, 'pessoa', 'pessoas')}`,
        all.length ? html`<button type="button" class="btn btn-ghost" data-act="export">${icon('download')}<span>Exportar lista</span></button>` : '')}
      ${readonlyNote}
      <div class="kpis kpis-4">
        <div class="kpi"><small>Confirmados</small><strong class="text-ok">${by('confirmado')}</strong></div>
        <div class="kpi"><small>Pendentes</small><strong class="text-warn">${by('pendente')}</strong></div>
        <div class="kpi"><small>Não vão</small><strong class="text-danger">${by('recusado')}</strong></div>
        <div class="kpi"><small>Adultos · Crianças</small><strong>${sum(all, (g) => g.adults)} · ${sum(all, (g) => g.children)}</strong></div>
      </div>
      <div class="toolbar">
        ${searchBox('q-pguests', gui.q, 'Buscar convidado…')}
        <select class="select-sm" id="side-pguests" aria-label="Lado"><option value="">Todos os lados</option>${selectOptions(sideOptions(), gui.side)}</select>
      </div>
      ${chips('rsvp', [{ value: 'todos', label: 'Todos', count: all.length }, ...RSVP.map((r) => ({ value: r.key, label: r.label, count: all.filter((g) => (g.rsvp || 'pendente') === r.key).length }))], gui.rsvp)}
      ${!all.length ? empty('users', 'Nenhum convidado ainda', 'A lista de convidados dos noivos aparece aqui.')
        : !list.length ? empty('search', 'Ninguém encontrado', 'Nenhum convidado corresponde ao filtro.')
        : html`<div class="card list">${list.map((g) => {
          const r = RSVP.find((x) => x.key === (g.rsvp || 'pendente')) || RSVP[0];
          return html`<div class="row guest-row">
            <span class="avatar side-${g.side || 'ambos'}">${initials(g.name)}</span>
            <div class="row-main">
              <div class="row-title">${g.name}</div>
              <div class="row-meta">
                <span>${sideLabel(g.side)}</span>${g.group ? html`<span>${g.group}</span>` : ''}
                <span>${plural(Number(g.adults) || 0, 'adulto', 'adultos')}${Number(g.children) ? ` + ${plural(Number(g.children), 'criança', 'crianças')}` : ''}</span>
                ${g.tableId && tables[g.tableId] ? html`<span>${icon('tables')} ${tables[g.tableId]}</span>` : ''}
                ${g.diet ? html`<span title="${g.diet}">🍽 ${g.diet}</span>` : ''}
              </div>
            </div>
            <span class="people-n" title="${plural(guestPeople(g), 'pessoa', 'pessoas')}">${guestPeople(g)}</span>
            ${badge(r.label, r.kind)}
          </div>`;
        })}</div>`}`;
  },
  mount(el) {
    el.onclick = (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'chip') { gui[a.dataset.group] = a.dataset.val; emit(); }
      else if (a.dataset.act === 'export') exportGuests();
    };
    el.oninput = (e) => { if (e.target.id === 'q-pguests') { gui.q = e.target.value; emit(); } };
    el.onchange = (e) => { if (e.target.id === 'side-pguests') { gui.side = e.target.value; emit(); } };
  },
};

// ---------------------------------------------------------------------------
// Cronograma do dia
// ---------------------------------------------------------------------------
const timeline = {
  render() {
    const items = [...state.items.timeline].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const s = state.settings;
    return html`
      ${pageHead('Cronograma do dia', s.date ? fmtDateLong(s.date) : 'O passo a passo do grande dia',
        items.length ? html`<button type="button" class="btn btn-ghost" data-act="print">${icon('printer')}<span>Imprimir</span></button>` : '')}
      ${readonlyNote}
      <div class="print-only print-head"><h1>${coupleTitle()}</h1><p>${s.date ? fmtDateLong(s.date) : ''}</p></div>
      ${!items.length ? empty('clock', 'Roteiro ainda não montado', 'Quando os noivos montarem o cronograma do dia, ele aparece aqui.')
        : html`<ol class="timeline">${items.map((it) => html`<li class="tl-item is-static">
          <time>${it.time}</time>
          <div class="tl-body">
            <strong>${it.title}</strong>
            <div class="row-meta">${it.place ? html`<span>${icon('pin')} ${it.place}</span>` : ''}${it.responsible ? html`<span>${icon('user')} ${it.responsible}</span>` : ''}</div>
            ${it.notes ? html`<p class="prewrap small">${it.notes}</p>` : ''}
          </div>
        </li>`)}</ol>`}`;
  },
  mount(el) { el.onclick = (e) => { if (e.target.closest('[data-act="print"]')) window.print(); }; },
};

// ---------------------------------------------------------------------------
// Contratos e documentos
// ---------------------------------------------------------------------------
const dui = { cat: 'todos', q: '' };
const documents = {
  render() {
    const all = state.files;
    const q = norm(dui.q.trim());
    const vendorName = (id) => byId('vendors', id)?.name || '';
    const list = all.filter((f) => (dui.cat === 'todos' || f.category === dui.cat) && (!q || norm(`${f.name} ${f.note} ${vendorName(f.vendorId)}`).includes(q)));
    const cats = FILE_CATEGORIES.filter((c) => PLANNER_CATS.has(c.key));
    return html`
      ${pageHead('Contratos e documentos', plural(all.length, 'arquivo', 'arquivos'))}
      ${readonlyNote}
      <div class="toolbar">${searchBox('q-pdocs', dui.q, 'Buscar arquivo ou fornecedor…')}</div>
      ${chips('cat', [{ value: 'todos', label: 'Todos', count: all.length }, ...cats.map((c) => ({ value: c.key, label: c.label, count: all.filter((f) => f.category === c.key).length }))], dui.cat)}
      ${!all.length ? empty('file', 'Nenhum documento ainda', 'Os contratos e documentos que os noivos enviarem aparecem aqui.')
        : !list.length ? empty('search', 'Nada encontrado', 'Nenhum arquivo corresponde ao filtro.')
        : html`<div class="card list">${list.map((f) => fileRow(f))}</div>`}`;
  },
  mount(el) {
    el.onclick = (e) => { const a = e.target.closest('[data-act="chip"]'); if (a) { dui[a.dataset.group] = a.dataset.val; emit(); } };
    el.oninput = (e) => { if (e.target.id === 'q-pdocs') { dui.q = e.target.value; emit(); } };
  },
};

// ---------------------------------------------------------------------------
// Anotações para os noivos (a única coisa que a assessoria escreve)
// ---------------------------------------------------------------------------
const NOTE_COLORS = [
  { value: 'creme', label: 'Creme' }, { value: 'rosa', label: 'Rosa' }, { value: 'salvia', label: 'Sálvia' },
  { value: 'azul', label: 'Azul' }, { value: 'lilas', label: 'Lilás' }, { value: 'areia', label: 'Areia' },
];
function noteForm(n = {}) {
  formModal({
    title: n.id ? 'Editar anotação' : 'Anotação para os noivos',
    size: 'lg',
    intro: n.id ? '' : 'Os noivos veem esta anotação nas Anotações deles, marcada como da assessoria.',
    values: { color: 'creme', ...n },
    fields: [
      { name: 'title', label: 'Título', full: true, placeholder: 'Ex.: Pendências da semana' },
      { name: 'body', label: 'Anotação', type: 'textarea', full: true, rows: 10, placeholder: 'Recados, pendências, decisões da reunião, lembretes…' },
      { name: 'color', label: 'Cor', type: 'select', options: NOTE_COLORS },
      { name: 'pinned', label: 'Destacar na visão geral dos noivos', type: 'checkbox' },
    ],
    onSubmit: async (d) => {
      if (!d.title && !d.body) throw new Error('Escreva um título ou um texto.');
      if (n.id) await update('notes', n.id, d); else await create('notes', d);
      toast(n.id ? 'Anotação salva' : 'Anotação enviada aos noivos');
    },
    onDelete: n.id ? async () => { await remove('notes', n.id); toast('Anotação excluída'); } : null,
  });
}
const nui = { q: '' };
const notes = {
  render() {
    const all = state.items.notes;
    const q = norm(nui.q.trim());
    const list = all.filter((n) => !q || norm(`${n.title} ${n.body}`).includes(q))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b._updated || 0) - (a._updated || 0));
    return html`
      ${pageHead('Anotações para os noivos', 'Recados, pendências e lembretes que os noivos veem', html`<button type="button" class="btn btn-primary" data-act="add">${icon('plus')}<span>Anotação</span></button>`)}
      ${all.length ? html`<div class="toolbar">${searchBox('q-pnotes', nui.q, 'Buscar nas anotações…')}</div>` : ''}
      ${!all.length ? empty('note', 'Nenhuma anotação ainda', 'Escreva pendências, resumos de reunião e lembretes. Os noivos veem tudo nas Anotações deles; as anotações pessoais do casal continuam privadas.', html`<button type="button" class="btn btn-primary" data-act="add">${icon('plus')}<span>Escrever anotação</span></button>`)
        : !list.length ? empty('search', 'Nada encontrado', '')
        : html`<div class="notes-grid">${list.map((n) => html`<article class="note note-${n.color || 'creme'}" data-act="edit" data-id="${n.id}" tabindex="0">
          <header>${n.title ? html`<h3>${n.title}</h3>` : ''}${n.pinned ? html`<span class="pin on" title="Destacada para os noivos">${icon('star')}</span>` : ''}</header>
          ${n.body ? html`<p class="prewrap">${n.body}</p>` : ''}
          <footer>${fmtDateTime(n._updated)}${userName(n._by) ? ` · ${userName(n._by)}` : ''}</footer>
        </article>`)}</div>`}`;
  },
  mount(el) {
    el.onclick = (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'add') noteForm();
      else if (a.dataset.act === 'edit') noteForm(state.items.notes.find((x) => x.id === a.dataset.id));
    };
    el.onkeydown = (e) => { if (e.key === 'Enter' && e.target.matches('.note')) noteForm(state.items.notes.find((x) => x.id === e.target.dataset.id)); };
    el.oninput = (e) => { if (e.target.id === 'q-pnotes') { nui.q = e.target.value; emit(); } };
  },
};

// ---------------------------------------------------------------------------
// Configurações do perfil de assessoria
// ---------------------------------------------------------------------------
const settings = {
  render() {
    return html`
      ${pageHead('Meu perfil')}
      <div class="settings-grid">
       <div class="settings-col">
        <section class="card">
          <header class="card-head"><h2>${icon('user')} Perfil de assessoria</h2></header>
          <div class="list">
            <div class="row clickable" data-act="account"><div class="row-main"><div class="row-title">${state.user.name}</div><div class="row-meta"><span>${state.user.email || 'sem e-mail'}</span></div></div>${icon('edit')}</div>
            <div class="row clickable" data-act="password"><div class="row-main"><div class="row-title">${state.user.hasPassword === false ? 'Criar senha' : 'Alterar senha'}</div>${state.user.google ? html`<div class="row-meta"><span>Conectado ao Google${state.user.hasPassword === false ? ': entra sem senha' : ''}</span></div>` : ''}</div>${icon('chevron')}</div>
            <div class="row clickable" data-act="devices"><div class="row-main"><div class="row-title">Dispositivos conectados</div><div class="row-meta"><span>Veja onde seu perfil está aberto</span></div></div>${icon('chevron')}</div>
          </div>
        </section>
        <section class="card">
          <header class="card-head"><h2>${icon('sparkle')} Aparência</h2></header>
          <div class="pad field"><label for="theme-sel">Tema</label><select id="theme-sel">${selectOptions([{ value: 'dark', label: 'Verde-floresta (padrão, como o site)' }, { value: 'light', label: 'Claro (papel)' }, { value: 'auto', label: 'Automático (segue o aparelho)' }], getTheme())}</select></div>
        </section>
       </div>
       <div class="settings-col">
        <section class="card">
          <header class="card-head"><h2>${icon('shield')} O que a assessoria acessa</h2></header>
          <ul class="pad sec-list">
            <li>Visão geral do casamento, locais e roteiro do dia.</li>
            <li>Fornecedores com contatos, contratos e documentos.</li>
            <li>Lista de convidados e confirmações.</li>
            <li>Anotações para os noivos: recados e pendências que eles veem.</li>
            <li>Fora isso, somente consulta: quem cadastra, edita e convida pessoas são os noivos. Orçamento, pagamentos e as anotações pessoais do casal ficam só com eles.</li>
          </ul>
        </section>
        <section class="card">
          <header class="card-head"><h2>${icon('logout')} ${state.workspace?.name || 'Este casamento'}</h2></header>
          <p class="pad muted">Sair remove o seu acesso a este casamento. Seu perfil e os outros casamentos continuam.</p>
          <div class="pad actions"><button type="button" class="btn btn-danger-ghost" data-act="leave">${icon('logout')}<span>Sair deste casamento</span></button><button type="button" class="btn btn-danger-ghost" data-act="delme">${icon('trash')}<span>Excluir meu perfil</span></button></div>
        </section>
       </div>
      </div>`;
  },
  mount(el) {
    el.onclick = (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      switch (a.dataset.act) {
        case 'account': accountForm(); break;
        case 'password': passwordForm(); break;
        case 'devices': devicesDialog(); break;
        case 'leave': leaveWorkspace(); break;
        case 'delme': deleteMyAccount(); break;
      }
    };
    el.onchange = (e) => {
      if (e.target.id === 'theme-sel') { try { localStorage.setItem('theme', e.target.value); } catch { /* ignora */ } applyTheme(); }
    };
  },
};

export const PLANNER_ROUTES = [
  { id: 'inicio', label: 'Visão geral', short: 'Início', icon: 'home', view: overview },
  { id: 'fornecedores', label: 'Fornecedores', icon: 'briefcase', view: vendors },
  { id: 'convidados', label: 'Convidados', icon: 'users', view: guests },
  { id: 'cronograma', label: 'Cronograma do dia', short: 'Cronograma', icon: 'clock', view: timeline },
  { id: 'documentos', label: 'Contratos e documentos', short: 'Contratos', icon: 'file', view: documents },
  { id: 'anotacoes', label: 'Anotações para os noivos', short: 'Anotações', icon: 'note', view: notes },
  { id: 'config', label: 'Meu perfil', icon: 'settings', view: settings },
];
export const PLANNER_TABS = ['inicio', 'fornecedores', 'convidados', 'documentos'];
