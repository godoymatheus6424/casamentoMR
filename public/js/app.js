import { api, setCsrf } from './api.js';
import { state, loadAll, onChange } from './store.js';
import { html, icon, closeAllModals, openModal, fmtDateLong, daysBetween, todayISO, plural, applyTheme } from './ui.js';
import { coupleTitle } from './domain.js';
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
    const st = await api('GET', '/api/status');
    state.maxUploadMb = st.maxUploadMb || 25;
    if (st.needsSetup) return renderSetup();
    let me = null;
    try { me = await api('GET', '/api/me', undefined, { allow401: true }); }
    catch (e) { if (e.status !== 401) throw e; }
    if (!me) return renderLogin();
    await startSession(me);
  } catch (e) {
    app.innerHTML = String(html`<div class="boot error">${icon('alert')}<p>Não foi possível conectar ao servidor.</p><small>${e.message}</small><button class="btn btn-primary">Tentar novamente</button></div>`);
    app.querySelector('button').onclick = () => location.reload();
  }
}

async function startSession(me) {
  state.user = me.user;
  setCsrf(me.csrf);
  await loadAll();
  renderShell();
}

window.addEventListener('auth:expired', () => {
  if (!state.user) return;
  state.user = null;
  closeAllModals();
  renderLogin('Sua sessão expirou. Entre novamente.');
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user && Date.now() - state.loadedAt > 60e3) loadAll().catch(() => {});
});

// ---------------------------------------------------------------------------
// Login e primeiro acesso
// ---------------------------------------------------------------------------
function authScreen(inner) {
  app.innerHTML = String(html`<div class="auth">
    <div class="auth-card">
      <div class="auth-mark">${icon('heart')}</div>
      ${inner}
    </div>
    <p class="auth-foot">${icon('shield')} Acesso privado e protegido</p>
  </div>`);
  app.querySelectorAll('[data-pw]').forEach((b) => {
    b.onclick = () => {
      const input = b.parentElement.querySelector('input');
      input.type = input.type === 'password' ? 'text' : 'password';
      b.classList.toggle('on', input.type === 'text');
    };
  });
}
const pwField = (id, name, label, auto) => html`<div class="field"><label for="${id}">${label}</label><div class="pw"><input id="${id}" type="password" name="${name}" autocomplete="${auto}" required><button type="button" class="pw-toggle" data-pw aria-label="Mostrar senha">${icon('eye')}</button></div></div>`;

function renderLogin(msg = '') {
  authScreen(html`<h1>Bem-vindos de volta</h1>
    <p class="muted center">Entre para continuar o planejamento.</p>
    <form id="login" class="stack" autocomplete="on" novalidate>
      <div class="field"><label for="lu">Usuário</label><input id="lu" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
      ${pwField('lp', 'password', 'Senha', 'current-password')}
      <label class="check"><input type="checkbox" name="remember" checked><span>Manter conectado neste dispositivo</span></label>
      <p class="form-error" role="alert">${msg}</p>
      <button class="btn btn-primary btn-block" type="submit">Entrar</button>
    </form>`);
  const f = app.querySelector('#login');
  const err = f.querySelector('.form-error');
  if (matchMedia('(pointer: fine)').matches) f.username.focus();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('[type=submit]');
    if (!f.username.value.trim() || !f.password.value) { err.textContent = 'Informe usuário e senha.'; return; }
    btn.disabled = true; btn.classList.add('loading'); err.textContent = '';
    try {
      await api('POST', '/api/login', { username: f.username.value.trim(), password: f.password.value, remember: f.remember.checked }, { allow401: true });
      await startSession(await api('GET', '/api/me'));
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false; btn.classList.remove('loading');
      f.password.value = '';
      f.password.focus();
    }
  };
}

function renderSetup() {
  authScreen(html`<h1>Vamos começar</h1>
    <p class="muted center">Crie o acesso de vocês. Depois você poderá adicionar seu par como outro usuário.</p>
    <form id="setup" class="stack" novalidate>
      <div class="two">
        <div class="field"><label for="sp1">Nome de um(a) noivo(a)</label><input id="sp1" name="partner1" autocomplete="off"></div>
        <div class="field"><label for="sp2">Nome do(a) outro(a)</label><input id="sp2" name="partner2" autocomplete="off"></div>
      </div>
      <div class="field"><label for="sd">Data do casamento <small>(se já souberem)</small></label><input id="sd" type="date" name="date"></div>
      <hr>
      <div class="field"><label for="sn">Seu nome</label><input id="sn" name="name" autocomplete="name" required></div>
      <div class="field"><label for="su">Usuário para entrar</label><input id="su" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="ex.: ana"></div>
      ${pwField('spw', 'password', 'Senha (mín. 8 caracteres, com letras e números)', 'new-password')}
      ${pwField('spw2', 'password2', 'Confirme a senha', 'new-password')}
      <div class="field"><label for="sc">Código de configuração</label><input id="sc" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" required placeholder="Exibido na janela do servidor"><small>Por segurança, só quem tem acesso ao computador onde o site está rodando consegue criar a primeira conta.</small></div>
      <p class="form-error" role="alert"></p>
      <button class="btn btn-primary btn-block" type="submit">Criar acesso</button>
    </form>`);
  const f = app.querySelector('#setup');
  const err = f.querySelector('.form-error');
  f.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (f.password.value !== f.password2.value) { err.textContent = 'As senhas não conferem.'; return; }
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true; btn.classList.add('loading');
    try {
      await api('POST', '/api/setup', {
        partner1: f.partner1.value, partner2: f.partner2.value, date: f.date.value,
        name: f.name.value, username: f.username.value, password: f.password.value, code: f.code.value,
      });
      await startSession(await api('GET', '/api/me'));
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false; btn.classList.remove('loading');
    }
  };
}

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
      <nav class="nav" aria-label="Seções">
        ${ROUTES.map((r) => html`<a href="#/${r.id}" data-route="${r.id}" title="${r.label}">${icon(r.icon)}<span>${r.label}</span></a>`)}
      </nav>
      <div class="side-foot">
        <span class="me">${icon('user')}<span>${state.user.name}</span></span>
        <button type="button" class="btn-icon" data-logout title="Sair" aria-label="Sair">${icon('logout')}</button>
      </div>
    </aside>
    <main class="main" id="main"><div id="view" class="view"></div></main>
    <nav class="tabbar" aria-label="Navegação rápida">
      ${TABS.map((id) => { const r = ROUTES.find((x) => x.id === id); return html`<a href="#/${r.id}" data-route="${r.id}">${icon(r.icon)}<span>${r.short || r.label}</span></a>`; })}
      <button type="button" data-more>${icon('more')}<span>Mais</span></button>
    </nav>
  </div>`);
  app.querySelector('[data-logout]').onclick = logout;
  app.querySelector('[data-more]').onclick = openMore;
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
  const m = openModal({
    title: 'Menu',
    size: 'sheet',
    body: html`<nav class="more-grid">
      ${ROUTES.map((r) => html`<a href="#/${r.id}" class="${r.id === current ? 'active' : ''}">${icon(r.icon)}<span>${r.short || r.label}</span></a>`)}
    </nav>
    <div class="more-foot"><span class="me">${icon('user')} ${state.user.name}</span><button type="button" class="btn btn-ghost btn-sm" data-out>${icon('logout')}<span>Sair</span></button></div>`,
    onMount(mm) {
      mm.body.querySelectorAll('a').forEach((a) => { a.onclick = () => mm.close(); });
      mm.body.querySelector('[data-out]').onclick = logout;
    },
  });
  return m;
}

function routeFromHash() {
  const id = location.hash.replace(/^#\/?/, '').split(/[?/]/)[0] || 'inicio';
  return ROUTES.find((r) => r.id === id) || ROUTES[0];
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
