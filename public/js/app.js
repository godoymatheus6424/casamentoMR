import { api, setCsrf, setWorkspace } from './api.js';
import { state, loadAll, onChange, refreshMe } from './store.js';
import { html, icon, closeAllModals, openModal, fmtDateLong, daysBetween, todayISO, plural, applyTheme } from './ui.js';
import { coupleTitle, ROLE_LABELS } from './domain.js';
import { renderAuth, setLoggedInHandler, authScreen, INVITE_ROLE } from './auth.js';
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
import settings, { deleteMyAccount } from './views/settings.js';
import { PLANNER_ROUTES, PLANNER_TABS } from './views/planner.js';
import { isFinHash, renderFinShell, renderFinView, leaveFin } from './fin/shell.js';
import { fin, loadFin } from './fin/data.js';

const COUPLE_ROUTES = [
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
const COUPLE_TABS = ['inicio', 'tarefas', 'fornecedores', 'convidados'];
// Finanças: só para os noivos (família e assessoria ficam só no casamento).
const finAllowed = () => ['owner', 'couple'].includes(state.workspace?.role);
const FIN_LINK = { id: 'fin', label: 'Finanças', icon: 'chart' };
// Noivos e família usam o planejador completo; a assessoria tem telas próprias, só de consulta.
const plannerWs = () => state.workspace?.role === 'planner';
const routes = () => (plannerWs() ? PLANNER_ROUTES : COUPLE_ROUTES);
const tabs = () => (plannerWs() ? PLANNER_TABS : COUPLE_TABS);
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
  state.workspaceCount = me.workspaceCount || 0;
  setCsrf(me.csrf);
  setWorkspace(me.workspace?.id);
  // Abriu um link de convite já conectado(a): confirma antes de aceitar com esta conta.
  const invite = inviteTokenFromHash();
  if (invite) return renderAcceptInvite(invite);
  // Assessoria sem casamento aberto (ainda não recebeu acesso, ou saiu de todos): fica no perfil.
  if (!me.workspace) return renderPlannerHome();
  // Vindo da página inicial ou das telas de acesso: os noivos abrem nas finanças; os demais, no casamento.
  if (/^#?\/?(entrar|cadastro|esqueci|redefinir)?(\?.*)?$/.test(location.hash)) history.replaceState(null, '', finAllowed() ? '#/fin' : '#/inicio');
  else if (isFinHash() && !finAllowed()) history.replaceState(null, '', '#/inicio');
  await loadAll();
  renderShell();
}
setLoggedInHandler(async () => startSession(await api('GET', '/api/me')));

// Outra aba trocou de casamento (a sessão é a mesma): recarrega para mostrar o casamento certo.
let reloading = false;
window.addEventListener('workspace:changed', () => {
  if (reloading) return;
  reloading = true;
  closeAllModals();
  api('GET', '/api/me').then(startSession).catch(() => location.reload()).finally(() => { reloading = false; });
});

const isPlanner = () => state.user?.kind === 'planner';

function inviteTokenFromHash() {
  const m = /^#\/convite\?(.*)$/.exec(location.hash);
  return m ? new URLSearchParams(m[1]).get('token') : null;
}
async function renderAcceptInvite(token) {
  let info;
  try { info = await api('GET', `/api/invites/info?token=${encodeURIComponent(token)}`); }
  catch (e) {
    authScreen(html`<h1>Convite</h1><p class="muted center">${e.message}</p><button type="button" class="btn btn-ghost btn-block" data-go>Continuar</button>`, { back: false });
    document.querySelector('[data-go]').onclick = async () => { history.replaceState(null, '', '#/inicio'); startSession(await api('GET', '/api/me')); };
    return;
  }
  // Os perfis são independentes: só um perfil de assessoria aceita convite de assessoria com a sessão aberta.
  // Convite de noivos/família sempre cria uma conta nova (conta de noivos tem um casamento só).
  const fits = info.role === 'planner' && isPlanner();
  const who = `${state.user.name} (${state.user.email || state.user.username})`;
  const why = info.role === 'planner'
    ? `Este convite é para um perfil de assessoria, e você está na conta de noivos de ${who}. Os dois perfis são separados: saia para entrar no seu perfil de assessoria ou criar um.`
    : isPlanner()
      ? `Este convite é para noivos ou família, e você está no perfil de assessoria de ${who}. Saia para criar a conta deste casamento.`
      : `Você está na conta de ${who}, que já pertence a um casamento. Cada conta de noivos tem um casamento só: saia para criar a conta deste convite.`;
  authScreen(html`<h1>Aceitar convite</h1>
    <p class="muted center">Acesso ao planejamento do casamento <strong>${info.wedding}</strong>, como <strong>${INVITE_ROLE[info.role] || 'convidado(a)'}</strong>.</p>
    ${fits ? html`<p class="muted center small">Você está no perfil de assessoria de ${who}.</p>` : html`<p class="hint">${icon('alert')} ${why}</p>`}
    <p class="form-error" role="alert"></p>
    <div class="planner-actions">
      ${fits ? html`<button type="button" class="btn btn-primary btn-block" data-accept>Aceitar e abrir o casamento</button>` : ''}
      <button type="button" class="btn ${fits ? 'btn-ghost' : 'btn-primary'} btn-block" data-other>${fits ? 'Usar outro perfil' : 'Sair e continuar com o convite'}</button>
      ${fits ? '' : html`<button type="button" class="btn btn-ghost btn-block" data-back>Voltar para a minha conta</button>`}
    </div>`, { back: false });
  const card = document.querySelector('.auth-card');
  const back = card.querySelector('[data-back]');
  if (back) back.onclick = async () => { history.replaceState(null, '', '#/inicio'); startSession(await api('GET', '/api/me')); };
  card.querySelector('[data-accept]')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.classList.add('loading');
    try {
      await api('POST', '/api/invites/accept', { token });
      history.replaceState(null, '', '#/inicio');
      await startSession(await api('GET', '/api/me'));
    } catch (ex) { b.classList.remove('loading'); card.querySelector('.form-error').textContent = ex.message; }
  });
  card.querySelector('[data-other]').onclick = async () => {
    try { await api('POST', '/api/logout'); } catch { /* ignora */ }
    location.reload(); // o endereço continua com o convite: abre a tela para criar conta ou entrar
  };
}
const ROLE = { ...ROLE_LABELS, member: 'Família / amigo' };

// Casamentos da pessoa (a assessoria costuma ter vários), em botões para abrir cada um.
function weddingList(list) {
  const today = todayISO();
  return html`<div class="ws-list">${list.map((w) => {
    const days = w.date ? daysBetween(today, w.date) : null;
    return html`<button type="button" class="ws-item ${w.current ? 'current' : ''}" data-ws="${w.id}" ${w.current ? 'disabled' : ''}>
      <span class="ws-days">${days == null ? '—' : days > 0 ? html`<strong>${days}</strong><small>${days === 1 ? 'dia' : 'dias'}</small>` : days === 0 ? html`<strong>Hoje</strong>` : html`<small>realizado</small>`}</span>
      <span class="ws-info"><strong>${w.name}</strong><small>${w.date ? fmtDateLong(w.date) : 'Data a definir'}${w.place ? ` · ${w.place}` : ''}</small><small>${ROLE[w.role] || ''}${w.access !== 'full' ? ' · só leitura' : ''}</small></span>
      ${w.current ? html`<span class="badge b-ok">aberto</span>` : icon('chevron')}
    </button>`;
  })}</div>`;
}
function bindWeddingList(root, onDone = () => {}) {
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ws]');
    if (!b || b.disabled) return;
    b.classList.add('loading');
    try {
      await api('POST', '/api/workspaces/switch', { id: b.dataset.ws });
      onDone();
      closeAllModals();
      history.replaceState(null, '', '#/inicio');
      await startSession(await api('GET', '/api/me'));
    } catch { b.classList.remove('loading'); }
  });
}

// A assessora adiciona um casamento digitando o código de acesso que os noivos passaram.
function joinForm() {
  return html`<form class="join-form" novalidate>
    <label for="join-code">Adicionar casamento</label>
    <div class="join-row">
      <input id="join-code" name="code" placeholder="Código dos noivos (ex.: K7QM-3XPA)" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" required>
      <button type="submit" class="btn btn-primary">Adicionar</button>
    </div>
    <small class="join-hint">Os noivos encontram o código em Configurações › Assessoria.</small>
    <p class="form-error" role="alert"></p>
  </form>`;
}
function bindJoin(root) {
  const f = root.querySelector('.join-form');
  if (!f) return;
  f.code.oninput = () => {
    const v = f.code.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    f.code.value = v.length > 4 ? `${v.slice(0, 4)}-${v.slice(4)}` : v;
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = f.querySelector('.form-error');
    const btn = f.querySelector('[type=submit]');
    err.textContent = '';
    if (f.code.value.replace(/-/g, '').length !== 8) { err.textContent = 'O código tem 8 letras e números.'; return; }
    btn.disabled = true; btn.classList.add('loading');
    try {
      await api('POST', '/api/planner/join', { code: f.code.value });
      closeAllModals();
      history.replaceState(null, '', '#/inicio');
      await startSession(await api('GET', '/api/me'));
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false; btn.classList.remove('loading');
    }
  };
}

// Perfil da assessoria sem casamento aberto: lista (ou como adicionar o primeiro), conta e sair.
async function renderPlannerHome() {
  let list = [];
  try { list = await api('GET', '/api/workspaces'); } catch { /* lista vazia */ }
  document.title = 'Meus casamentos · BRIDEx';
  authScreen(html`<h1>Meus casamentos</h1>
    <p class="muted center">Olá, ${state.user.name.split(' ')[0]}. ${list.length ? 'Escolha o casamento que deseja abrir.' : ''}</p>
    ${list.length ? weddingList(list) : html`<div class="planner-empty">
      <p>Ainda não há casamentos no seu perfil.</p>
      <p class="muted small">Peça a cada casal o <strong>código de acesso da assessoria</strong> e digite abaixo. O casamento aparece aqui na hora, para consulta.</p>
    </div>`}
    ${joinForm()}
    <div class="planner-actions">
      <button type="button" class="btn btn-ghost btn-block" data-act="logout">${icon('logout')}<span>Sair</span></button>
    </div>
    <p class="auth-switch small"><button type="button" class="link-btn muted" data-act="delete">Excluir meu perfil</button></p>`, { wide: true, back: false });
  const card = document.querySelector('.auth-card');
  bindWeddingList(card);
  bindJoin(card);
  card.querySelector('[data-act="logout"]').onclick = logout;
  card.querySelector('[data-act="delete"]').onclick = deleteMyAccount;
}


window.addEventListener('auth:expired', () => {
  if (!state.user) return;
  state.user = null;
  closeAllModals();
  renderAuth('Sua sessão expirou. Entre novamente.');
});

// Telas de acesso também respondem ao endereço (#/cadastro, #/esqueci, #/redefinir…)
window.addEventListener('hashchange', () => { if (!state.user && state.status) renderAuth(); });

// Versão nova publicada com a página aberta: avisa para recarregar (o código da tela é o antigo).
let updateShown = false;
function checkNewVersion() {
  api('GET', '/api/status').then((s) => {
    if (updateShown || !s?.build || !state.status?.build || s.build === state.status.build) return;
    updateShown = true;
    const bar = document.createElement('div');
    bar.className = 'update-bar';
    bar.innerHTML = '<span>Há uma versão nova do site.</span><button type="button">Atualizar agora</button>';
    bar.querySelector('button').onclick = () => location.reload();
    document.body.append(bar);
  }).catch(() => {});
}
setInterval(() => { if (document.visibilityState === 'visible') checkNewVersion(); }, 10 * 60e3);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkNewVersion();
  if (document.visibilityState === 'visible' && state.user && Date.now() - state.loadedAt > 60e3) {
    refreshMe().then(loadAll).then(() => (fin.loaded && isFinHash() ? loadFin() : null)).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Estrutura principal
// ---------------------------------------------------------------------------
let shellBound = false;
let shellMode = null; // 'fin' (finanças) ou 'wedding' (casamento)
const wantedMode = () => (isFinHash() && finAllowed() ? 'fin' : 'wedding');
// Monta a estrutura certa para o endereço atual (a de finanças ou a do casamento), se ainda não estiver na tela.
function ensureShell() {
  const mode = wantedMode();
  if (mode === shellMode && document.getElementById('view')) return;
  shellMode = mode;
  if (mode === 'fin') renderFinShell(app);
  else { leaveFin(); renderWeddingShell(); }
}
function renderShell() {
  shellMode = null;
  ensureShell();
  if (!shellBound) {
    shellBound = true;
    window.addEventListener('hashchange', () => {
      if (!state.user) return;
      closeAllModals();
      const invite = inviteTokenFromHash();
      if (invite) { shellMode = null; renderAcceptInvite(invite); return; }
      if (isFinHash() && !finAllowed()) { history.replaceState(null, '', '#/inicio'); }
      ensureShell();
      renderView(true);
    });
    onChange(() => { if (state.user && document.getElementById('view')) renderView(false); });
    window.addEventListener('app:logout', logout);
  }
  renderView(true);
}
function renderWeddingShell() {
  app.innerHTML = String(html`<div class="shell">
    <aside class="sidebar">
      <a class="brand" href="#/inicio">
        <span class="brand-mark">${icon('heart')}</span>
        <span class="brand-text"><strong id="brand-title"></strong><small id="brand-sub"></small></span>
      </a>
      ${isPlanner() ? html`<button type="button" class="ws-switch" data-switch title="Meus casamentos">${icon('users')}<span>Meus casamentos</span></button>` : ''}
      <nav class="nav" aria-label="Seções">
        ${finAllowed() ? html`<a href="#/fin" class="nav-fin" title="Finanças">${icon('chart')}<span>Finanças</span></a>` : ''}
        ${routes().map((r) => html`<a href="#/${r.id}" data-route="${r.id}" title="${r.label}">${icon(r.icon)}<span>${r.label}</span></a>`)}
      </nav>
      <div class="side-foot">
        <span class="me">${icon('user')}<span>${state.user.name}</span></span>
        <button type="button" class="btn-icon" data-logout title="Sair" aria-label="Sair">${icon('logout')}</button>
      </div>
    </aside>
    <main class="main" id="main"><div id="plan-banner"></div><div id="view" class="view"></div></main>
    <nav class="tabbar" aria-label="Navegação rápida">
      ${tabs().map((id) => { const r = routes().find((x) => x.id === id); return html`<a href="#/${r.id}" data-route="${r.id}">${icon(r.icon)}<span>${r.short || r.label}</span></a>`; })}
      <button type="button" data-more>${icon('more')}<span>Mais</span></button>
    </nav>
  </div>`);
  app.querySelector('[data-logout]').onclick = logout;
  app.querySelector('[data-more]').onclick = openMore;
  app.querySelector('[data-switch]')?.addEventListener('click', openSwitcher);
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
      ${finAllowed() ? html`<a href="#/fin" class="more-fin">${icon(FIN_LINK.icon)}<span>${FIN_LINK.label}</span></a>` : ''}
      ${routes().map((r) => html`<a href="#/${r.id}" class="${r.id === current ? 'active' : ''}">${icon(r.icon)}<span>${r.short || r.label}</span></a>`)}
    </nav>
    ${isPlanner() ? html`<button type="button" class="btn btn-ghost btn-block more-switch" data-sw>${icon('users')}<span>Meus casamentos</span></button>` : ''}
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
  openModal({
    title: 'Meus casamentos',
    body: html`${weddingList(list)}${isPlanner() ? joinForm() : ''}`,
    onMount(m) { bindWeddingList(m.body); bindJoin(m.body); },
  });
}

function routeFromHash() {
  const id = location.hash.replace(/^#\/?/, '').split(/[?/]/)[0] || 'inicio';
  return routes().find((r) => r.id === id) || routes()[0];
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
  if (shellMode === 'fin') return renderFinView(navigated);
  const el = document.getElementById('view');
  if (!el) return;
  const r = routeFromHash();

  document.querySelectorAll('[data-route]').forEach((a) => {
    const on = a.dataset.route === r.id;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const more = document.querySelector('[data-more]');
  if (more) more.classList.toggle('active', !tabs().includes(r.id));

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
