// Finanças: estrutura da tela (abas embaixo, botão +) e troca de telas.
import { fin, loadFin, valuesHidden } from './data.js';
import { FIN_ROUTES, mountFin } from './views.js';
import { addSheet } from './forms.js';
import { html, icon } from '../ui.js';

const TABS = [
  { id: '', label: 'Início', icon: 'home' },
  { id: 'extrato', label: 'Extrato', icon: 'list' },
  { id: 'planejar', label: 'Planejar', icon: 'repeat' },
  { id: 'cartoes', label: 'Cartões', icon: 'card' },
  { id: 'mais', label: 'Mais', icon: 'more' },
];
export const isFinHash = () => /^#\/fin(\/|\?|$)/.test(location.hash);
const finRoute = () => location.hash.replace(/^#\/fin\/?/, '').split(/[?/]/)[0];

function setThemeColor(c) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c);
}

export function renderFinShell(app) {
  document.body.classList.add('fin-mode');
  setThemeColor('#f2f2f7');
  app.innerHTML = String(html`<div class="fin">
    <div class="fin-glow" aria-hidden="true"><span></span><span></span><span></span></div>
    <main class="fin-main"><div id="view" class="fin-view"></div></main>
    <div class="fin-dock">
      <nav class="fin-tabbar" aria-label="Finanças">
        ${TABS.map((t) => html`<a href="#/fin${t.id ? `/${t.id}` : ''}" data-fin-tab="${t.id}">${icon(t.icon)}<span>${t.label}</span></a>`)}
      </nav>
      <button type="button" class="fin-fab" data-fab aria-label="Adicionar" title="Adicionar">${icon('plus')}</button>
    </div>
  </div>`);
  app.querySelector('[data-fab]').onclick = () => addSheet();
}
export function leaveFin() {
  document.body.classList.remove('fin-mode');
  setThemeColor('#161e19');
}

let loading = null;
export function renderFinView(navigated) {
  const el = document.getElementById('view');
  if (!el) return;
  const id = finRoute();
  const r = FIN_ROUTES[id] || FIN_ROUTES[''];
  document.querySelectorAll('[data-fin-tab]').forEach((a) => {
    const on = a.dataset.finTab === r.tab;
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

  const active = document.activeElement;
  const keepFocus = !navigated && active?.id && el.contains(active) ? { id: active.id, sel: [active.selectionStart, active.selectionEnd] } : null;
  el.onclick = el.oninput = el.onchange = null;
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
