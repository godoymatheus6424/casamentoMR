import { state, emit } from '../store.js';
import { html, icon, pageHead, chips, searchBox, empty, norm, plural, fmtSize, sum } from '../ui.js';
import { FILE_CATEGORIES, IMAGE_EXT } from '../domain.js';
import { fileRow, fileEditForm, uploadDialog, fileUrl } from '../forms.js';

const ui = { cat: 'todos', q: '', view: 'lista' };

export default {
  render() {
    const all = state.files;
    const q = norm(ui.q.trim());
    const vendorName = (id) => state.items.vendors.find((v) => v.id === id)?.name || '';
    const list = all.filter((f) => {
      if (ui.cat !== 'todos' && f.category !== ui.cat) return false;
      if (q && !norm(`${f.name} ${f.note} ${vendorName(f.vendorId)}`).includes(q)) return false;
      return true;
    });
    const gallery = ui.view === 'galeria' || ui.cat === 'inspiracao';
    const images = list.filter((f) => IMAGE_EXT.has(f.ext));
    const others = list.filter((f) => !IMAGE_EXT.has(f.ext));

    return html`
      ${pageHead('Documentos', `${plural(all.length, 'arquivo', 'arquivos')} · ${fmtSize(sum(all, (f) => f.size))}`,
        html`<button type="button" class="btn btn-primary" data-act="upload">${icon('upload')}<span>Enviar arquivos</span></button>`)}
      <div class="dropzone-page hide-touch" data-act="upload">${icon('upload')}<span>Arraste arquivos para cá ou clique para enviar — contratos, orçamentos, comprovantes, fotos de inspiração…</span></div>
      <div class="toolbar">
        ${searchBox('q-docs', ui.q, 'Buscar arquivo…')}
        <div class="seg" role="group" aria-label="Visualização">
          <button type="button" class="${!gallery ? 'active' : ''}" data-act="view" data-val="lista" aria-label="Lista">${icon('list')}</button>
          <button type="button" class="${gallery ? 'active' : ''}" data-act="view" data-val="galeria" aria-label="Galeria">${icon('grid')}</button>
        </div>
      </div>
      ${chips('cat', [{ value: 'todos', label: 'Todos', count: all.length }, ...FILE_CATEGORIES.map((c) => ({ value: c.key, label: c.label, count: all.filter((f) => f.category === c.key).length }))], ui.cat)}
      ${!all.length ? empty('file', 'Nenhum arquivo ainda', 'Guarde aqui as cópias dos contratos, orçamentos, comprovantes de pagamento e fotos de inspiração. Tudo fica protegido pelo login.',
        html`<button type="button" class="btn btn-primary" data-act="upload">${icon('upload')}<span>Enviar arquivos</span></button>`)
        : !list.length ? empty('search', 'Nada encontrado', 'Nenhum arquivo nesta categoria.')
        : gallery ? html`
          ${images.length ? html`<div class="gallery">${images.map((f) => html`<figure class="g-item">
            <a href="${fileUrl(f)}" target="_blank" rel="noopener" data-act="link"><img src="${fileUrl(f)}" alt="${f.name}" loading="lazy"></a>
            <figcaption><span>${f.note || f.name}</span><button type="button" class="btn-icon sm" data-act="file-edit" data-id="${f.id}" aria-label="Editar">${icon('edit')}</button></figcaption>
          </figure>`)}</div>` : ''}
          ${others.length ? html`<div class="card list">${others.map((f) => fileRow(f))}</div>` : ''}`
        : html`<div class="card list">${list.map((f) => fileRow(f))}</div>`}`;
  },
  mount(el) {
    el.onclick = (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      switch (a.dataset.act) {
        case 'upload': uploadDialog({ category: ui.cat === 'todos' ? 'contrato' : ui.cat }); break;
        case 'chip': ui[a.dataset.group] = a.dataset.val; emit(); break;
        case 'view': ui.view = a.dataset.val; if (ui.view === 'lista' && ui.cat === 'inspiracao') ui.cat = 'todos'; emit(); break;
        case 'file-edit': fileEditForm(state.files.find((f) => f.id === a.dataset.id)); break;
      }
    };
    el.oninput = (e) => { if (e.target.id === 'q-docs') { ui.q = e.target.value; emit(); } };
    el.ondragover = (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); el.classList.add('dragging'); } };
    el.ondragleave = (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('dragging'); };
    el.ondrop = (e) => {
      e.preventDefault();
      el.classList.remove('dragging');
      if (e.dataTransfer.files.length) uploadDialog({ category: ui.cat === 'todos' ? 'contrato' : ui.cat, files: e.dataTransfer.files });
    };
  },
};
