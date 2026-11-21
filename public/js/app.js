import { api, setCsrf } from './api.js';
import { state, loadAll, onChange, refreshMe } from './store.js';
import { html, icon, closeAllModals, openModal, fmtDateLong, daysBetween, todayISO, plural, applyTheme } from './ui.js';
import { coupleTitle } from './domain.js';
import { renderAuth, setLoggedInHandler } from './auth.js';
import dashboard from './views/dashboard.js';
import tasks from './views/tasks.js';
import vendors from './views/vendors.js';
import budget from './views/budget.js';
import guests from './views/guests.js';
import seating from './views/seating.js';
import timeline from './views/timeline.js';
import documents from './views/documents.js';
import notes from './views/notes.js';
import gifts from './views/gifts.js';
import settings from './views/settings.js';

const ROUTES = [
  { id: 'inicio', label: 'Visão geral', short: 'Início', icon: 'home', view: dashboard },
  { id: 'tarefas', label: 'Tarefas', icon: 'check', view: tasks },
  { id: 'fornecedores', label: 'Fornecedores', icon: 'briefcase', view: vendors },
  { id: 'orcamento', label: 'Orçamento', icon: 'wallet', view: budget },
  { id: 'convidados', label: 'Convidados', icon: 'users', view: guests },
  { id: 'mesas', label: 'Mesas', icon: 'tables', view: seating },
  { id: 'cronograma', label: 'Cronograma do dia', short: 'Cronograma', icon: 'clock', view: timeline },
  { id: 'documentos', label: 'Documentos', icon: 'file', view: documents },
  { id: 'anotacoes', label: 'Anotações', icon: 'note', view: notes },
  { id: 'presentes', label: 'Presentes', icon: 'gift', view: gifts },
  { id: 'config', label: 'Configurações', icon: 'settings', view: settings },
];
const TABS = ['inicio', 'tarefas', 'fornecedores', 'convidados'];
const app = document.getElementById('app');

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
async function boot() {
  applyTheme();
  try {
    state.status = await api('GET', '/api/status');
    state.maxUploadMb = state.status.maxUploadMb || 25;
    let me = null;
    if (!state.status.needsSetup) {
      try { me = await api('GET', '/api/me', undefined, { allow401: true }); }
      catch (e) { if (e.status !== 401) throw e; }
    }
    if (!me) return renderAuth();
    await startSession(me);
  } catch (e) {
    app.innerHTML = String(html`<div class="boot error">${icon('alert')}<p>Não foi possível conectar ao servidor.</p><small>${e.message}</small><button class="btn btn-primary">Tentar novamente</button></div>`);
    app.querySelector('button').onclick = () => location.reload();
  }
}

async function startSession(me) {
  state.user = me.user;
  state.workspace = me.workspace;
  state.workspaceCount = me.workspaceCount || 1;
  setCsrf(me.csrf);
  await loadAll();
  renderShell();
}
setLoggedInHandler(async () => startSession(await api('GET', '/api/me')));

window.addEventListener('auth:expired', () => {
  if (!state.user) return;
  state.user = null;
  closeAllModals();
  renderAuth('Sua sessão expirou. Entre novamente.');
});

// Telas de acesso também respondem ao endereço (#/cadastro, #/esqueci, #/redefinir…)
window.addEventListener('hashchange', () => { if (!state.user && state.status) renderAuth(); });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user && Date.now() - state.loadedAt > 60e3) {
    refreshMe().then(loadAll).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Estrutura principal
// ---------------------------------------------------------------------------
let shellBound = false;
function renderShell() {
  app.innerHTML = String(html`<div class="shell">
    <aside class="sidebar">
      <a class="brand" href="#/inicio">
        <span class="brand-mark">${icon('heart')}</span>
        <span class="brand-text"><strong id="brand-title"></strong><small id="brand-sub"></small></span>
      </a>
      ${state.workspaceCount > 1 ? html`<button type="button" class="ws-switch" data-switch title="Trocar de casamento">${icon('users')}<span>Trocar casamento</span></button>` : ''}
      <nav class="nav" aria-label="Seções">
        ${ROUTES.map((r) => html`<a href="#/${r.id}" data-route="${r.id}" title="${r.label}">${icon(r.icon)}<span>${r.label}</span></a>`)}
      </nav>
      <div class="side-foot">
        <span class="me">${icon('user')}<span>${state.user.name}</span></span>
        <button type="button" class="btn-icon" data-logout title="Sair" aria-label="Sair">${icon('logout')}</button>
      </div>
    </aside>
    <main class="main" id="main"><div id="plan-banner"></div><div id="view" class="view"></div></main>
    <nav class="tabbar" aria-label="Navegação rápida">
      ${TABS.map((id) => { const r = ROUTES.find((x) => x.id === id); return html`<a href="#/${r.id}" data-route="${r.id}">${icon(r.icon)}<span>${r.short || r.label}</span></a>`; })}
      <button type="button" data-more>${icon('more')}<span>Mais</span></button>
    </nav>
  </div>`);
  app.querySelector('[data-logout]').onclick = logout;
  app.querySelector('[data-more]').onclick = openMore;
  app.querySelector('[data-switch]')?.addEventListener('click', openSwitcher);
  if (!shellBound) {
    shellBound = true;
    window.addEventListener('hashchange', () => { if (state.user) { closeAllModals(); renderView(true); } });
    onChange(() => { if (state.user) renderView(false); });
  }
  renderView(true);
}

async function logout() {
  try { await api('POST', '/api/logout'); } catch { /* ignora */ }
  state.user = null;
  location.hash = '';
  location.reload();
}

function openMore() {
  const current = routeFromHash().id;
  return openModal({
    title: 'Menu',
    size: 'sheet',
    body: html`<nav class="more-grid">
      ${ROUTES.map((r) => html`<a href="#/${r.id}" class="${r.id === current ? 'active' : ''}">${icon(r.icon)}<span>${r.short || r.label}</span></a>`)}
    </nav>
    ${state.workspaceCount > 1 ? html`<button type="button" class="btn btn-ghost btn-block more-switch" data-sw>${icon('users')}<span>Trocar de casamento</span></button>` : ''}
    <div class="more-foot"><span class="me">${icon('user')} ${state.user.name}</span><button type="button" class="btn btn-ghost btn-sm" data-out>${icon('logout')}<span>Sair</span></button></div>`,
    onMount(mm) {
      mm.body.querySelectorAll('a').forEach((a) => { a.onclick = () => mm.close(); });
      mm.body.querySelector('[data-out]').onclick = logout;
      const sw = mm.body.querySelector('[data-sw]');
      if (sw) sw.onclick = () => { mm.close(); openSwitcher(); };
    },
  });
}

// Lista dos casamentos da pessoa (assessoras) e troca entre eles
async function openSwitcher() {
  let list;
  try { list = await api('GET', '/api/workspaces'); } catch (e) { return; }
  const today = todayISO();
  const ROLE = { owner: 'Noivo(a)', couple: 'Noivo(a)', planner: 'Assessoria', member: 'Família / amigo' };
  openModal({
    title: 'Meus casamentos',
    body: html`<div class="ws-list">${list.map((w) => {
      const days = w.date ? daysBetween(today, w.date) : null;
      return html`<button type="button" class="ws-item ${w.current ? 'current' : ''}" data-ws="${w.id}" ${w.current ? 'disabled' : ''}>
        <span class="ws-days">${days == null ? '—' : days > 0 ? html`<strong>${days}</strong><small>${days === 1 ? 'dia' : 'dias'}</small>` : days === 0 ? html`<strong>Hoje</strong>` : html`<small>realizado</small>`}</span>
        <span class="ws-info"><strong>${w.name}</strong><small>${w.date ? fmtDateLong(w.date) : 'Data a definir'}${w.place ? ` · ${w.place}` : ''}</small><small>${ROLE[w.role] || ''}${w.access !== 'full' ? ' · só leitura' : ''}</small></span>
        ${w.current ? html`<span class="badge b-ok">aberto</span>` : icon('chevron')}
      </button>`;
    })}</div>`,
    onMount(m) {
      m.body.onclick = async (e) => {
        const b = e.target.closest('[data-ws]');
        if (!b || b.disabled) return;
        b.classList.add('loading');
        try {
          await api('POST', '/api/workspaces/switch', { id: b.dataset.ws });
          closeAllModals();
          history.replaceState(null, '', '#/inicio');
          await startSession(await api('GET', '/api/me'));
        } catch { b.classList.remove('loading'); }
      };
    },
  });
}

function routeFromHash() {
  const id = location.hash.replace(/^#\/?/, '').split(/[?/]/)[0] || 'inicio';
  return ROUTES.find((r) => r.id === id) || ROUTES[0];
}

// Aviso de período de teste / modo só leitura
function renderBanner() {
  const el = document.getElementById('plan-banner');
  const ws = state.workspace;
  if (!el || !ws) return;
  let content = '';
  const manager = ws.role === 'owner' || ws.role === 'couple';
  if (ws.access === 'readonly') {
    content = manager
      ? html`<div class="plan-banner danger">${icon('alert')}<span>${ws.plan === 'trial' ? 'Seu período de teste terminou.' : 'Sua assinatura não está ativa.'} Os dados continuam disponíveis para consulta, mas não dá para editar.</span><a href="#/config" class="btn btn-sm btn-primary">Ver planos</a></div>`
      : html`<div class="plan-banner danger">${icon('alert')}<span>Este casamento está em modo só leitura: os noivos precisam ativar a assinatura para que todos voltem a editar.</span></div>`;
  } else if (manager && ws.plan === 'trial' && ws.trialEndsAt) {
    const days = Math.max(0, Math.ceil((ws.trialEndsAt - Date.now()) / 86400e3));
    content = html`<div class="plan-banner ${days <= 3 ? 'warn' : ''}">${icon('sparkle')}<span>Teste grátis: ${days <= 0 ? 'termina hoje' : `${plural(days, 'dia restante', 'dias restantes')}`}.</span><a href="#/config" class="link">Ver planos</a></div>`;
  }
  el.innerHTML = String(content);
}

function renderView(navigated) {
  const el = document.getElementById('view');
  if (!el) return;
  const r = routeFromHash();

  document.querySelectorAll('[data-route]').forEach((a) => {
    const on = a.dataset.route === r.id;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const more = document.querySelector('[data-more]');
  if (more) more.classList.toggle('active', !TABS.includes(r.id));

  const title = coupleTitle();
  document.getElementById('brand-title').textContent = title;
  const s = state.settings;
  const days = s.date ? daysBetween(todayISO(), s.date) : null;
  document.getElementById('brand-sub').textContent =
    days == null ? 'Data a definir' : days > 0 ? `faltam ${plural(days, 'dia', 'dias')}` : days === 0 ? 'é hoje!' : fmtDateLong(s.date);
  document.title = `${r.label} · ${title}`;
  renderBanner();

  // preserva o foco (ex.: campo de busca) entre re-renderizações
  const active = document.activeElement;
  let focusId = null, sel = null;
  if (!navigated && active && el.contains(active) && active.id) {
    focusId = active.id;
    try { sel = [active.selectionStart, active.selectionEnd]; } catch { /* ignora */ }
  }
  el.onclick = el.oninput = el.onchange = el.onkeydown = el.ondragover = el.ondragleave = el.ondrop = null;
  try {
    el.innerHTML = String(r.view.render());
    r.view.mount?.(el);
  } catch (e) {
    console.error(e);
    el.innerHTML = String(html`<div class="empty">${icon('alert')}<h3>Algo deu errado nesta tela</h3><p>${e.message}</p></div>`);
  }
  el.classList.toggle('enter', !!navigated);
  if (focusId) {
    const n = document.getElementById(focusId);
    if (n) { n.focus(); if (sel && n.setSelectionRange && sel[0] != null) try { n.setSelectionRange(sel[0], sel[1]); } catch { /* ignora */ } }
  }
  if (navigated) window.scrollTo(0, 0);
}

boot();
