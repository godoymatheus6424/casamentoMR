import { onChange } from './store.js';

// ---------------------------------------------------------------------------
// Templates HTML com escape automático (proteção contra XSS)
// ---------------------------------------------------------------------------
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s ?? ''));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
function val(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  return esc(v);
}
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += val(values[i]) + strings[i + 1];
  return new Raw(out);
}

// ---------------------------------------------------------------------------
// Ícones
// ---------------------------------------------------------------------------
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
  tick: '<path d="m5 12 5 5 9-10"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/><path d="M16 4.1a4 4 0 0 1 0 7.8"/><path d="M22 21c0-3-1.8-5.6-4.5-6.6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M2 13h20"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M3 7h16a2 2 0 0 1 2 2v3h-5a2 2 0 0 0 0 4h5"/>',
  tables: '<circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="3.5" r="1.5"/><circle cx="12" cy="20.5" r="1.5"/><circle cx="3.5" cy="12" r="1.5"/><circle cx="20.5" cy="12" r="1.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  note: '<path d="M5 3h10l4 4v14H5z"/><path d="M9 10h6M9 14h6M9 18h4"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9"/><path d="M12 8v13"/><path d="M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5"/><path d="M12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  upload: '<path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.8 7L4 20.5 5.5 16A8 8 0 1 1 21 12z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  insta: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  heart: '<path d="M12 20s-8-4.9-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.1-8 11-8 11z"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  clip: '<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 10v4M18 10v4"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  paste: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h3"/>',
};
export function icon(name, cls = '') {
  return raw(`<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`);
}

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export function parseISO(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function fmtDate(s, opts) {
  const d = parseISO(s);
  return d ? d.toLocaleDateString('pt-BR', opts || { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}
export const fmtDateShort = (s) => fmtDate(s, { day: '2-digit', month: 'short' }).replace('.', '');
export const fmtDateLong = (s) => fmtDate(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export function fmtDateTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function daysBetween(a, b) {
  const da = parseISO(a), db = parseISO(b);
  if (!da || !db) return null;
  return Math.round((db - da) / 86400000);
}
export function shiftISO(iso, { m = 0, d = 0 } = {}) {
  const x = parseISO(iso);
  if (!x) return null;
  if (m) {
    const day = x.getDate();
    x.setDate(1);
    x.setMonth(x.getMonth() + m);
    x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  }
  if (d) x.setDate(x.getDate() + d);
  return toISO(x);
}
export const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const moneyShort = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  if (Math.abs(n) >= 1e4) return 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
  return money(n);
};
export const moneyInput = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export function parseMoney(s) {
  if (s == null) return null;
  s = String(s).replace(/[R$\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
export function fmtSize(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  return `${(b / 1024 / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`;
}
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const sum = (arr, fn) => arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0);
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const initials = (name) => String(name || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// ---------------------------------------------------------------------------
// Componentes pequenos
// ---------------------------------------------------------------------------
export const badge = (label, kind = 'muted') => html`<span class="badge b-${kind}">${label}</span>`;
export function progress(ratio, kind = '') {
  const p = Math.max(0, Math.min(100, Math.round((Number(ratio) || 0) * 100)));
  return html`<div class="bar ${kind}" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p}%"></span></div>`;
}
export function pageHead(title, sub, actions) {
  return html`<header class="page-head"><div class="page-title"><h1>${title}</h1>${sub ? html`<p class="sub">${sub}</p>` : ''}</div>${actions ? html`<div class="actions">${actions}</div>` : ''}</header>`;
}
export function chips(group, options, current) {
  return html`<div class="chips" role="tablist">${options.map((o) => html`<button type="button" class="chip ${o.value === current ? 'active' : ''}" data-act="chip" data-group="${group}" data-val="${o.value}">${o.label}${o.count != null ? html` <span class="chip-n">${o.count}</span>` : ''}</button>`)}</div>`;
}
export function searchBox(id, value, placeholder = 'Buscar…') {
  return html`<label class="search">${icon('search')}<input type="search" id="${id}" value="${value}" placeholder="${placeholder}" autocomplete="off" enterkeyhint="search"></label>`;
}
export function empty(iconName, title, text, action) {
  return html`<div class="empty">${icon(iconName)}<h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action || ''}</div>`;
}
export function selectOptions(options, current) {
  return options.map((o) => {
    const opt = typeof o === 'object' ? o : { value: o, label: o };
    return html`<option value="${opt.value}" ${String(opt.value) === String(current ?? '') ? raw('selected') : ''}>${opt.label}</option>`;
  });
}

// ---------------------------------------------------------------------------
// Tema (automático / claro / escuro)
// ---------------------------------------------------------------------------
// Tema: "dark" (padrão, o verde-floresta do site), "light" (papel) ou "auto" (segue o aparelho).
export function getTheme() {
  let t = 'dark';
  try { t = localStorage.getItem('theme') || 'dark'; } catch { /* ignora */ }
  return ['dark', 'light', 'auto'].includes(t) ? t : 'dark';
}
export function applyTheme() {
  document.documentElement.dataset.theme = getTheme();
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
export function toast(msg, kind = 'ok') {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`;
  t.textContent = msg;
  root.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, kind === 'error' ? 5000 : 2600);
}
export async function run(fn) {
  try { return await fn(); }
  catch (e) { console.error(e); toast(e.message || 'Algo deu errado.', 'error'); }
}

// ---------------------------------------------------------------------------
// Modais
// ---------------------------------------------------------------------------
const stack = [];
export function openModal({ title = '', body = '', footer = null, size = '', live = false, onMount, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true"><div class="modal-head"><h2></h2><button type="button" class="btn-icon" data-close aria-label="Fechar">${icon('x')}</button></div><div class="modal-body"></div><div class="modal-foot"></div></div>`;
  const box = overlay.firstElementChild;
  const head = box.querySelector('h2');
  const bodyEl = box.querySelector('.modal-body');
  const foot = box.querySelector('.modal-foot');
  let closed = false;
  const m = {
    overlay, box, body: bodyEl, foot,
    setTitle(t) { head.textContent = t; box.setAttribute('aria-label', t); },
    close, render,
    get closed() { return closed; },
  };
  function render() {
    if (closed) return;
    const scroll = bodyEl.scrollTop;
    bodyEl.innerHTML = String(typeof body === 'function' ? body(m) : body);
    if (footer == null) foot.hidden = true;
    else foot.innerHTML = String(typeof footer === 'function' ? footer(m) : footer);
    bodyEl.scrollTop = scroll;
    onMount?.(m);
  }
  const unsub = live ? onChange(render) : null;
  function close() {
    if (closed) return;
    closed = true;
    unsub?.();
    const i = stack.indexOf(m);
    if (i >= 0) stack.splice(i, 1);
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 200);
    if (!stack.length) document.body.classList.remove('modal-open');
    onClose?.();
  }
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  box.querySelector('[data-close]').addEventListener('click', close);
  document.getElementById('modal-root').append(overlay);
  stack.push(m);
  document.body.classList.add('modal-open');
  m.setTitle(title);
  render();
  requestAnimationFrame(() => {
    overlay.classList.add('open');
    if (matchMedia('(pointer: fine)').matches) {
      const f = bodyEl.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=file]):not([type=search]), textarea, select');
      f?.focus();
    }
  });
  return m;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close(); });
export function closeAllModals() { [...stack].forEach((m) => m.close()); }

export function confirmDialog(message, { title = 'Confirmar', ok = 'Excluir', danger = true } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title, size: 'sm',
      body: html`<p class="confirm-text">${message}</p>`,
      footer: html`<span class="spacer"></span><button type="button" class="btn btn-ghost" data-no>Cancelar</button><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${ok}</button>`,
      onMount(m) {
        m.foot.querySelector('[data-yes]').onclick = () => { answered = true; resolve(true); m.close(); };
        m.foot.querySelector('[data-no]').onclick = () => m.close();
      },
      onClose() { if (!answered) resolve(false); },
    });
  });
}

// ---------------------------------------------------------------------------
// Formulários
// ---------------------------------------------------------------------------
function normOptions(opts) {
  return (opts || []).map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
}
function fieldHtml(f, v) {
  const id = `f_${f.name}`;
  const type = f.type || 'text';
  const common = html`id="${id}" name="${f.name}" ${f.required ? raw('required') : ''} ${f.placeholder ? html`placeholder="${f.placeholder}"` : ''}`;
  let control;
  switch (type) {
    case 'textarea':
      control = html`<textarea ${common} rows="${f.rows || 3}">${v ?? ''}</textarea>`;
      break;
    case 'select':
      control = html`<select ${common}>${selectOptions(normOptions(f.options), v ?? f.default ?? '')}</select>`;
      break;
    case 'checkbox':
      return html`<div class="field ${f.full ? 'full' : ''} field-check"><label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${v ? raw('checked') : ''}><span>${f.label}</span></label>${f.hint ? html`<small>${f.hint}</small>` : ''}</div>`;
    case 'money':
      control = html`<div class="input-prefix"><span>R$</span><input type="text" inputmode="decimal" ${common} value="${moneyInput(v)}" autocomplete="off"></div>`;
      break;
    case 'number':
      control = html`<input type="number" inputmode="numeric" ${common} value="${v ?? f.default ?? ''}" ${f.min != null ? html`min="${f.min}"` : ''} ${f.max != null ? html`max="${f.max}"` : ''} step="${f.step || 1}">`;
      break;
    default: {
      const list = f.list?.length ? `${id}_list` : null;
      control = html`<input type="${type}" ${common} value="${v ?? f.default ?? ''}" ${list ? html`list="${list}"` : ''} ${f.autocomplete ? html`autocomplete="${f.autocomplete}"` : ''} ${type === 'text' && f.noCaps ? raw('autocapitalize="none"') : ''}>${list ? html`<datalist id="${list}">${f.list.map((x) => html`<option value="${x}"></option>`)}</datalist>` : ''}`;
    }
  }
  return html`<div class="field ${f.full ? 'full' : ''}"><label for="${id}">${f.label}${f.required ? html`<span class="req" aria-hidden="true"> *</span>` : ''}</label>${control}${f.hint ? html`<small>${f.hint}</small>` : ''}</div>`;
}

function collect(form, fields) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'html') continue;
    const el = form.elements[f.name];
    if (!el) continue;
    let v;
    switch (f.type) {
      case 'checkbox': v = el.checked; break;
      case 'number': v = el.value === '' ? null : Number(el.value); break;
      case 'money':
        v = parseMoney(el.value);
        if (Number.isNaN(v)) throw Object.assign(new Error(`Valor inválido em "${f.label}".`), { field: f.name });
        break;
      default: v = el.value.trim();
    }
    if (f.required && (v === '' || v == null)) throw Object.assign(new Error(`Preencha "${f.label}".`), { field: f.name });
    out[f.name] = v;
  }
  return out;
}

export function formModal({ title, fields, values = {}, submitLabel = 'Salvar', onSubmit, onDelete, deleteConfirm, size = '', intro }) {
  return openModal({
    title, size,
    body: html`${intro ? html`<p class="form-intro">${intro}</p>` : ''}<form class="form-grid" novalidate>${fields.map((f) => (f.type === 'html' ? html`<div class="field full">${f.html}</div>` : fieldHtml(f, values[f.name])))}<p class="form-error full" role="alert"></p><button type="submit" hidden></button></form>`,
    footer: html`${onDelete ? html`<button type="button" class="btn btn-danger-ghost" data-del>${icon('trash')}<span>Excluir</span></button>` : ''}<span class="spacer"></span><button type="button" class="btn btn-ghost" data-cancel>Cancelar</button><button type="button" class="btn btn-primary" data-save>${submitLabel}</button>`,
    onMount(m) {
      const form = m.body.querySelector('form');
      const err = form.querySelector('.form-error');
      const saveBtn = m.foot.querySelector('[data-save]');
      const save = async () => {
        err.textContent = '';
        form.querySelectorAll('.invalid').forEach((x) => x.classList.remove('invalid'));
        let data;
        try { data = collect(form, fields); }
        catch (e) {
          err.textContent = e.message;
          const bad = e.field && form.elements[e.field];
          if (bad) { bad.closest('.field')?.classList.add('invalid'); bad.focus(); }
          return;
        }
        saveBtn.disabled = true;
        saveBtn.classList.add('loading');
        try { await onSubmit(data, m); m.close(); }
        catch (e) { err.textContent = e.message || 'Não foi possível salvar.'; }
        finally { saveBtn.disabled = false; saveBtn.classList.remove('loading'); }
      };
      form.onsubmit = (e) => { e.preventDefault(); save(); };
      saveBtn.onclick = save;
      m.foot.querySelector('[data-cancel]').onclick = () => m.close();
      const del = m.foot.querySelector('[data-del]');
      if (del) {
        del.onclick = async () => {
          if (!(await confirmDialog(deleteConfirm || 'Tem certeza que deseja excluir? Essa ação não pode ser desfeita.'))) return;
          try { await onDelete(); m.close(); } catch (e) { err.textContent = e.message; }
        };
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Exportação CSV (abre direto no Excel)
// ---------------------------------------------------------------------------
export function downloadCSV(filename, rows) {
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // evita injeção de fórmulas
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const csvMoney = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
