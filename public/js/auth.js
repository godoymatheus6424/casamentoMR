// Telas de acesso: entrar, criar conta, primeiro acesso (instalação própria),
// esqueci minha senha e redefinir senha.
import { api } from './api.js';
import { state } from './store.js';
import { html, icon } from './ui.js';
import { renderLanding, BRAND } from './landing.js';

const app = document.getElementById('app');
let onLoggedIn = async () => {};
export function setLoggedInHandler(fn) { onLoggedIn = fn; }

function authScreen(inner, { wide = false } = {}) {
  window.scrollTo(0, 0);
  app.innerHTML = String(html`<div class="auth">
    <a href="#/" class="auth-back">${icon('chevron', 'flip')}<span>${BRAND}</span></a>
    <div class="auth-card ${wide ? 'wide' : ''}">
      <div class="auth-mark">${icon('heart')}</div>
      ${inner}
    </div>
    <p class="auth-foot">${icon('shield')} Acesso privado e protegido${state.status.signupOpen ? html` · <a href="/termos.html" target="_blank" rel="noopener">Termos</a> · <a href="/privacidade.html" target="_blank" rel="noopener">Privacidade</a>` : ''}</p>
  </div>`);
  app.querySelectorAll('[data-pw]').forEach((b) => {
    b.onclick = () => {
      const input = b.parentElement.querySelector('input');
      input.type = input.type === 'password' ? 'text' : 'password';
      b.classList.toggle('on', input.type === 'text');
    };
  });
  const first = app.querySelector('form input:not([type=checkbox])');
  if (first && matchMedia('(pointer: fine)').matches) first.focus();
}
const pwField = (id, name, label, auto) => html`<div class="field"><label for="${id}">${label}</label><div class="pw"><input id="${id}" type="password" name="${name}" autocomplete="${auto}" required><button type="button" class="pw-toggle" data-pw aria-label="Mostrar senha">${icon('eye')}</button></div></div>`;

// Envia um formulário com tratamento de erro e botão "carregando".
function bindForm(form, handler) {
  const err = form.querySelector('.form-error');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    err.textContent = '';
    btn.disabled = true; btn.classList.add('loading');
    try { await handler(); }
    catch (ex) { err.textContent = ex.message; }
    finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove('loading'); } }
  };
}

export function renderAuth(msg = '') {
  const hash = location.hash.replace(/^#\/?/, '');
  const route = hash.split('?')[0];
  if (state.status.needsSetup) return renderSetup();
  if (route === 'cadastro' && state.status.signupOpen) return renderSignup();
  if (route === 'esqueci') return renderForgot();
  if (route === 'redefinir') return renderReset(new URLSearchParams(hash.split('?')[1] || '').get('token') || '');
  // Endereço principal sem sessão: página de apresentação. Qualquer outro (#/entrar, páginas do app): login.
  if (!route && !msg) return renderLanding();
  return renderLogin(msg);
}

function renderLogin(msg = '') {
  const open = state.status.signupOpen;
  authScreen(html`<h1>Bem-vindos de volta</h1>
    <p class="muted center">Entre para continuar o planejamento.</p>
    <form id="login" class="stack" autocomplete="on" novalidate>
      <div class="field"><label for="lu">E-mail</label><input id="lu" name="username" type="text" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="voce@email.com"></div>
      ${pwField('lp', 'password', 'Senha', 'current-password')}
      <div class="auth-row"><label class="check"><input type="checkbox" name="remember" checked><span>Manter conectado</span></label><a href="#/esqueci" class="link small">Esqueci minha senha</a></div>
      <p class="form-error" role="alert">${msg}</p>
      <button class="btn btn-primary btn-block" type="submit">Entrar</button>
    </form>
    ${open ? html`<p class="auth-switch">Ainda não tem conta? <a href="#/cadastro" class="link">Criar conta grátis</a></p>` : ''}`);
  const f = app.querySelector('#login');
  bindForm(f, async () => {
    if (!f.username.value.trim() || !f.password.value) throw new Error('Informe e-mail e senha.');
    try {
      await api('POST', '/api/login', { username: f.username.value.trim(), password: f.password.value, remember: f.remember.checked }, { allow401: true });
    } catch (e) {
      f.password.value = '';
      f.password.focus();
      throw e;
    }
    await onLoggedIn();
  });
}

function renderSignup() {
  const days = state.status.trialDays || 14;
  authScreen(html`<h1>Criar conta</h1>
    <p class="muted center">${days} dias grátis com tudo liberado. Não pedimos cartão.</p>
    <form id="signup" class="stack" novalidate>
      <div class="two">
        <div class="field"><label for="sp1">Nome de um(a) noivo(a)</label><input id="sp1" name="partner1" autocomplete="off"></div>
        <div class="field"><label for="sp2">Nome do(a) outro(a)</label><input id="sp2" name="partner2" autocomplete="off"></div>
      </div>
      <div class="field"><label for="sd">Data do casamento <small>(se já souberem)</small></label><input id="sd" type="date" name="date"></div>
      <hr>
      <div class="field"><label for="sn">Seu nome</label><input id="sn" name="name" autocomplete="name" required></div>
      <div class="field"><label for="se">E-mail</label><input id="se" name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" required></div>
      ${pwField('spw', 'password', 'Senha (mín. 8 caracteres, com letras e números)', 'new-password')}
      ${pwField('spw2', 'password2', 'Confirme a senha', 'new-password')}
      <label class="check terms"><input type="checkbox" name="terms"><span>Li e aceito os <a href="/termos.html" target="_blank" rel="noopener" class="link">Termos de Uso</a> e a <a href="/privacidade.html" target="_blank" rel="noopener" class="link">Política de Privacidade</a></span></label>
      <p class="form-error" role="alert"></p>
      <button class="btn btn-primary btn-block" type="submit">Começar meu teste grátis</button>
    </form>
    <p class="auth-switch">Já tem conta? <a href="#/entrar" class="link">Entrar</a></p>`, { wide: true });
  const f = app.querySelector('#signup');
  bindForm(f, async () => {
    if (f.password.value !== f.password2.value) throw new Error('As senhas não conferem.');
    if (!f.terms.checked) throw new Error('Para continuar, aceite os Termos de Uso e a Política de Privacidade.');
    await api('POST', '/api/signup', {
      partner1: f.partner1.value, partner2: f.partner2.value, date: f.date.value,
      name: f.name.value, email: f.email.value, password: f.password.value, acceptTerms: true,
    });
    history.replaceState(null, '', '#/inicio');
    await onLoggedIn();
  });
}

function renderSetup() {
  authScreen(html`<h1>Vamos começar</h1>
    <p class="muted center">Crie o acesso de vocês. Depois você poderá adicionar seu par em Configurações.</p>
    <form id="setup" class="stack" novalidate>
      <div class="two">
        <div class="field"><label for="sp1">Nome de um(a) noivo(a)</label><input id="sp1" name="partner1" autocomplete="off"></div>
        <div class="field"><label for="sp2">Nome do(a) outro(a)</label><input id="sp2" name="partner2" autocomplete="off"></div>
      </div>
      <div class="field"><label for="sd">Data do casamento <small>(se já souberem)</small></label><input id="sd" type="date" name="date"></div>
      <hr>
      <div class="field"><label for="sn">Seu nome</label><input id="sn" name="name" autocomplete="name" required></div>
      <div class="field"><label for="se">E-mail (para entrar)</label><input id="se" name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" required></div>
      ${pwField('spw', 'password', 'Senha (mín. 8 caracteres, com letras e números)', 'new-password')}
      ${pwField('spw2', 'password2', 'Confirme a senha', 'new-password')}
      <div class="field"><label for="sc">Código de configuração</label><input id="sc" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" required placeholder="Exibido na janela do servidor"><small>Por segurança, só quem tem acesso ao servidor consegue criar a primeira conta.</small></div>
      <p class="form-error" role="alert"></p>
      <button class="btn btn-primary btn-block" type="submit">Criar acesso</button>
    </form>`, { wide: true });
  const f = app.querySelector('#setup');
  bindForm(f, async () => {
    if (f.password.value !== f.password2.value) throw new Error('As senhas não conferem.');
    await api('POST', '/api/setup', {
      partner1: f.partner1.value, partner2: f.partner2.value, date: f.date.value,
      name: f.name.value, email: f.email.value, password: f.password.value, code: f.code.value,
    });
    state.status.needsSetup = false;
    await onLoggedIn();
  });
}

function renderForgot() {
  authScreen(html`<h1>Esqueci minha senha</h1>
    <p class="muted center">Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.</p>
    <form id="forgot" class="stack" novalidate>
      <div class="field"><label for="fe">E-mail</label><input id="fe" name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" required></div>
      <p class="form-error" role="alert"></p>
      <button class="btn btn-primary btn-block" type="submit">Enviar link</button>
    </form>
    <p class="auth-switch"><a href="#/entrar" class="link">Voltar para o login</a></p>`);
  const f = app.querySelector('#forgot');
  bindForm(f, async () => {
    const email = f.email.value.trim();
    if (!email.includes('@')) throw new Error('Informe um e-mail válido.');
    await api('POST', '/api/password/forgot', { email });
    authScreen(html`<h1>Confira seu e-mail</h1>
      <p class="muted center">Se existir uma conta com <strong>${email}</strong>, enviamos um link para criar uma nova senha. Ele vale por 1 hora.</p>
      <p class="muted center small">Não chegou? Veja a caixa de spam ou tente de novo em alguns minutos.</p>
      <a href="#/entrar" class="btn btn-ghost btn-block">Voltar para o login</a>`);
  });
}

function renderReset(token) {
  if (!token) return renderLogin('Link de redefinição inválido.');
  authScreen(html`<h1>Nova senha</h1>
    <p class="muted center">Escolha uma nova senha para sua conta.</p>
    <form id="reset" class="stack" novalidate>
      ${pwField('rp', 'password', 'Nova senha (mín. 8 caracteres, com letras e números)', 'new-password')}
      ${pwField('rp2', 'password2', 'Confirme a nova senha', 'new-password')}
      <p class="form-error" role="alert"></p>
      <button class="btn btn-primary btn-block" type="submit">Salvar nova senha</button>
    </form>`);
  const f = app.querySelector('#reset');
  bindForm(f, async () => {
    if (f.password.value !== f.password2.value) throw new Error('As senhas não conferem.');
    await api('POST', '/api/password/reset', { token, password: f.password.value });
    history.replaceState(null, '', '#/entrar');
    renderLogin();
    const ok = app.querySelector('.form-error');
    ok.textContent = 'Senha alterada! Entre com a nova senha.';
    ok.classList.add('form-ok');
  });
}
