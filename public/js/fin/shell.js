// Finanças: estrutura da tela e troca de telas.
// Celular: abas embaixo + botão "+". Computador (≥1024px): menu lateral com todas as seções.
import { fin, loadFin, valuesHidden, setScope } from './data.js';
import { FIN_ROUTES, mountFin } from './views.js';
import { isCouple, partnerName } from './model.js';
import { addSheet } from './forms.js';
import { state } from '../store.js';
import { html, icon, raw } from '../ui.js';

const TABS = [
  { id: '', label: 'Início', icon: 'home' },
  { id: 'extrato', label: 'Extrato', icon: 'list' },
  { id: 'planejar', label: 'Planejar', icon: 'repeat' },
  { id: 'cartoes', label: 'Cartões', icon: 'card' },
  { id: 'mais', label: 'Mais', icon: 'more' },
];
const SIDE = [
  { id: '', label: 'Início', icon: 'home' },
  { id: 'mes', label: 'Visão geral do mês', icon: 'calendar' },
  { id: 'extrato', label: 'Extrato', icon: 'list' },
  { id: 'planejar', label: 'Fixos e orçamento', icon: 'repeat' },
  { id: 'cartoes', label: 'Cartões', icon: 'card' },
  { id: 'contas', label: 'Contas', icon: 'bank' },
  { id: 'metas', label: 'Metas', icon: 'target' },
  { id: 'relatorios', label: 'Relatórios', icon: 'chart' },
  { id: 'categorias', label: 'Categorias', icon: 'tag' },
];
export const isFinHash = () => /^#\/fin(\/|\?|$)/.test(location.hash);
const finRoute = () => location.hash.replace(/^#\/fin\/?/, '').split(/[?/]/)[0];
const href = (id) => `#/fin${id ? `/${id}` : ''}`;

function setThemeColor(c) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c);
}

export function renderFinShell(app) {
  document.body.classList.add('fin-mode');
  setThemeColor('#f2f2f7');
  app.innerHTML = String(html`<div class="fin">
    <div class="fin-glow" aria-hidden="true"><span></span><span></span><span></span></div>
    <aside class="fin-side" aria-label="Menu das finanças">
      <div class="fin-brand"><span class="fin-brand-ic">${icon('wallet')}</span><span><strong>Finanças</strong><small>${state.user?.name || ''}</small></span></div>
      <button type="button" class="fin-btn fin-side-add" data-fab>${icon('plus')}<span>Novo lançamento</span><kbd>N</kbd></button>
      <nav class="fin-side-nav">
        ${SIDE.map((t) => html`<a href="${href(t.id)}" data-side="${t.id}">${icon(t.icon)}<span>${t.label}</span></a>`)}
      </nav>
      <div class="fin-side-foot">
        <div id="fin-side-couple"></div>
        <a href="#/fin/ajustes" data-side="ajustes">${icon('settings')}<span>Ajustes</span></a>
        <a href="#/inicio" class="fin-side-wedding">${icon('heart')}<span>Casamento</span>${icon('chevron')}</a>
        <button type="button" data-logout>${icon('logout')}<span>Sair</span></button>
      </div>
    </aside>
    <main class="fin-main"><div id="view" class="fin-view"></div></main>
    <div class="fin-dock">
      <nav class="fin-tabbar" aria-label="Finanças">
        ${TABS.map((t) => html`<a href="${href(t.id)}" data-fin-tab="${t.id}">${icon(t.icon)}<span>${t.label}</span></a>`)}
      </nav>
      <button type="button" class="fin-fab" data-fab aria-label="Adicionar" title="Adicionar (N)">${icon('plus')}</button>
    </div>
  </div>`);
  app.querySelectorAll('[data-fab]').forEach((b) => { b.onclick = () => addSheet(); });
  app.querySelector('[data-logout]').onclick = () => window.dispatchEvent(new Event('app:logout'));
  app.querySelector('.fin-side').addEventListener('change', (e) => {
    if (e.target.matches('[data-scope]')) setScope(e.target.checked ? 'couple' : 'me');
  });
}
export function leaveFin() {
  document.body.classList.remove('fin-mode');
  setThemeColor('#161e19');
}

// Atalho: N abre "Adicionar" (fora de campos de texto e sem janela aberta).
document.addEventListener('keydown', (e) => {
  if (!document.body.classList.contains('fin-mode') || document.body.classList.contains('modal-open')) return;
  if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  e.preventDefault();
  addSheet();
});

function renderSideCouple() {
  const el = document.getElementById('fin-side-couple');
  if (!el) return;
  el.innerHTML = fin.partner ? String(html`<label class="fin-side-switch" title="Somar as suas finanças com as de ${partnerName()}">
    ${icon('users')}<span>Visão do casal</span><input type="checkbox" class="fin-switch sm" data-scope ${isCouple() ? raw('checked') : ''}>
  </label>`) : '';
}

let loading = null;
export function renderFinView(navigated) {
  const el = document.getElementById('view');
  if (!el) return;
  const id = finRoute();
  const r = FIN_ROUTES[id] || FIN_ROUTES[''];
  const routeId = FIN_ROUTES[id] ? id : '';
  if (navigated) r.enter?.(); // ex.: o extrato sempre abre no dia de hoje
  document.querySelectorAll('[data-fin-tab]').forEach((a) => {
    const on = a.dataset.finTab === r.tab;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-side]').forEach((a) => {
    const on = a.dataset.side === routeId;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.querySelector('.fin')?.classList.toggle('hide-values', valuesHidden());
  document.title = `${r.title} · Finanças`;

  // Dados ainda não carregados (ou antigos, por exemplo depois de mexer no casamento): busca antes.
  if (!fin.loaded || (navigated && Date.now() - fin.loadedAt > 30e3)) {
    if (!fin.loaded) el.innerHTML = '<div class="fin-loading"><span class="spinner"></span></div>';
    if (!loading) loading = loadFin().catch((e) => { el.innerHTML = String(html`<div class="fin-card fin-empty">${icon('alert')}<strong>Não foi possível abrir as finanças</strong><p>${e.message}</p></div>`); }).finally(() => { loading = null; });
    if (!fin.loaded) return;
  }
  renderSideCouple();

  const active = document.activeElement;
  const keepFocus = !navigated && active?.id && el.contains(active) ? { id: active.id, sel: [active.selectionStart, active.selectionEnd] } : null;
  el.onclick = el.oninput = el.onchange = el.onkeydown = null;
  try {
    el.innerHTML = String(r.render());
    mountFin(el, () => renderFinView(false));
  } catch (e) {
    console.error(e);
    el.innerHTML = String(html`<div class="fin-card fin-empty">${icon('alert')}<strong>Algo deu errado nesta tela</strong><p>${e.message}</p></div>`);
  }
  if (keepFocus) {
    const n = document.getElementById(keepFocus.id);
    if (n) { n.focus(); try { n.setSelectionRange(keepFocus.sel[0], keepFocus.sel[1]); } catch { /* ignora */ } }
  }
  if (navigated) { el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); window.scrollTo(0, 0); }
}
