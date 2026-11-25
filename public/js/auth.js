// Telas de acesso: entrar, criar conta, primeiro acesso (instalação própria),
// esqueci minha senha e redefinir senha.
import { api } from './api.js';
import { state } from './store.js';
import { html, icon, raw } from './ui.js';
import { renderLanding, BRAND } from './landing.js';

const app = document.getElementById('app');
let onLoggedIn = async () => {};
export function setLoggedInHandler(fn) { onLoggedIn = fn; }

export function authScreen(inner, { wide = false, back = true } = {}) {
  window.scrollTo(0, 0);
  app.innerHTML = String(html`<div class="auth">
    ${back ? html`<a href="#/" class="auth-back">${icon('chevron', 'flip')}<span>${BRAND}</span></a>` : html`<span class="auth-back">${BRAND}</span>`}
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
// Login com o Google (aparece só quando o servidor tem GOOGLE_CLIENT_ID/SECRET).
const GOOGLE_G = '<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const GOOGLE_ERRORS = {
  google_cancelado: 'Login com o Google cancelado.',
  google_falhou: 'Não foi possível entrar com o Google. Tente de novo.',
  google_email: 'Sua conta Google não tem e-mail confirmado.',
  google_e_assessoria: 'Este Google está ligado a um perfil de assessoria. Use a aba "Assessoria".',
  google_e_noivos: 'Este Google está ligado a uma conta de noivos. Use a aba "Noivos e família".',
  google_ja_ligado: 'Este Google já está ligado a outra conta. Para este convite, crie a conta com e-mail e senha.',
  sem_casamento: 'Sua conta não está ligada a nenhum casamento. Peça um link de convite aos noivos.',
  cadastro_fechado: 'Não encontramos uma conta com este Google, e o cadastro não está aberto.',
  muitas_tentativas: 'Muitas contas criadas daqui agora há pouco. Tente de novo em alguns minutos.',
  convite_invalido: 'Este convite é inválido, já foi usado ou expirou. Peça um novo link aos noivos.',
  convite_limite: 'Este casamento já atingiu o limite de pessoas. Fale com os noivos.',
};
// Lê o erro devolvido pelo login do Google (?erro=...) e tira do endereço, para não repetir ao recarregar.
function takeError(params) {
  const code = params.get('erro');
  if (!code) return '';
  params.delete('erro');
  const [route] = location.hash.replace(/^#\/?/, '').split('?');
  const rest = params.toString();
  history.replaceState(null, '', `#/${route}${rest ? `?${rest}` : ''}`);
  return GOOGLE_ERRORS[code] || 'Não foi possível entrar com o Google.';
}
function googleButton(kind, { invite = '', label = 'Continuar com o Google' } = {}) {
  if (!state.status.google) return '';
  const q = new URLSearchParams({ kind });
  if (invite) q.set('invite', invite);
  return html`<a class="btn btn-google btn-block" href="/api/auth/google/start?${q}">${raw(GOOGLE_G)}<span>${label}</span></a>
    ${state.status.signupOpen || invite ? html`<p class="g-terms">Ao continuar com o Google, você aceita os <a href="/termos.html" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="/privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>.</p>` : ''}
    <div class="auth-or"><span>ou com e-mail</span></div>`;
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
  const params = new URLSearchParams(hash.split('?')[1] || '');
  if (route === 'cadastro' && state.status.signupOpen) return renderSignup(params.get('perfil') === 'assessoria' ? 'planner' : 'couple');
  if (route === 'esqueci') return renderForgot();
  if (route === 'redefinir') return renderReset(params.get('token') || '');
  if (route === 'convite') { const err = takeError(params); return renderInvite(params.get('token') || '', 'signup', err); }
  // Endereço principal sem sessão: página de apresentação (só com cadastro aberto). Qualquer outro: login.
  if (!route && !msg && state.status.signupOpen) return renderLanding();
  return renderLogin(msg || takeError(params), params.get('perfil') === 'assessoria' ? 'planner' : 'couple');
}

// Login separado por tipo de conta: noivos (e família) e assessoria são perfis independentes.
function renderLogin(msg = '', kind = 'couple') {
  const open = state.status.signupOpen;
  const planner = kind === 'planner';
  authScreen(html`<h1>${planner ? 'Perfil de assessoria' : 'Bem-vindos de volta'}</h1>
    <div class="seg-kind" role="tablist" aria-label="Tipo de conta">
      <a href="#/entrar" role="tab" aria-selected="${!planner}" class="${planner ? '' : 'on'}">Noivos e família</a>
      <a href="#/entrar?perfil=assessoria" role="tab" aria-selected="${planner}" class="${planner ? 'on' : ''}">Assessoria</a>
    </div>
    <p class="muted center">${planner ? 'Entre para ver os casamentos que você acompanha.' : 'Entre para continuar o planejamento.'}</p>
    ${googleButton(kind)}
    <form id="login" class="stack" autocomplete="on" novalidate>
      <div class="field"><label for="lu">E-mail</label><input id="lu" name="username" type="text" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="voce@email.com"></div>
      ${pwField('lp', 'password', 'Senha', 'current-password')}
      <div class="auth-row"><label class="check"><input type="checkbox" name="remember" checked><span>Manter conectado</span></label><a href="#/esqueci" class="link small">Esqueci minha senha</a></div>
      <p class="form-error" role="alert">${msg}</p>
      <button class="btn btn-primary btn-block" type="submit">Entrar</button>
    </form>
    ${open ? html`<p class="auth-switch">${planner ? html`Ainda não tem perfil? <a href="#/cadastro?perfil=assessoria" class="link">Criar perfil de assessoria</a>` : html`Ainda não tem conta? <a href="#/cadastro" class="link">Criar conta grátis</a>`}</p>` : ''}`);
  const f = app.querySelector('#login');
  bindForm(f, async () => {
    if (!f.username.value.trim() || !f.password.value) throw new Error('Informe e-mail e senha.');
    try {
      await api('POST', '/api/login', { kind, username: f.username.value.trim(), password: f.password.value, remember: f.remember.checked }, { allow401: true });
    } catch (e) {
      f.password.value = '';
      f.password.focus();
      throw e;
    }
    await onLoggedIn();
  });
}

// Cadastro: noivos (cria o casamento, com teste grátis) ou assessoria (só o perfil; os casamentos
// entram quando ela digita o código de acesso que cada casal passa).
function renderSignup(kind = 'couple') {
  const days = state.status.trialDays || 14;
  const planner = kind === 'planner';
  authScreen(html`<h1>${planner ? 'Perfil de assessoria' : 'Criar conta'}</h1>
    <div class="seg-kind" role="tablist" aria-label="Tipo de conta">
      <a href="#/cadastro" role="tab" aria-selected="${!planner}" class="${planner ? '' : 'on'}">Somos os noivos</a>
      <a href="#/cadastro?perfil=assessoria" role="tab" aria-selected="${planner}" class="${planner ? 'on' : ''}">Sou assessora</a>
    </div>
    <p class="muted center">${planner
      ? 'Um único perfil, separado das contas de noivos, para todos os casamentos que você atende. Cada casal passa o código de acesso dele e você adiciona o casamento no seu perfil.'
      : `${days} dias grátis com tudo liberado. Não pedimos cartão.`}</p>
    ${googleButton(kind, { label: planner ? 'Criar perfil com o Google' : 'Criar conta com o Google' })}
    <form id="signup" class="stack" novalidate>
      ${planner ? '' : html`<div class="two">
        <div class="field"><label for="sp1">Nome de um(a) noivo(a)</label><input id="sp1" name="partner1" autocomplete="off"></div>
        <div class="field"><label for="sp2">Nome do(a) outro(a)</label><input id="sp2" name="partner2" autocomplete="off"></div>
      </div>
      <div class="field"><label for="sd">Data do casamento <small>(se já souberem)</small></label><input id="sd" type="date" name="date"></div>
      <hr>`}
      <div class="field"><label for="sn">${planner ? 'Seu nome ou da assessoria' : 'Seu nome'}</label><input id="sn" name="name" autocomplete="${planner ? 'organization' : 'name'}" required></div>
      <div class="field"><label for="se">E-mail</label><input id="se" name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" required></div>
      ${pwField('spw', 'password', 'Senha (mín. 8 caracteres, com letras e números)', 'new-password')}
      ${pwField('spw2', 'password2', 'Confirme a senha', 'new-password')}
      <label class="check terms"><input type="checkbox" name="terms"><span>Li e aceito os <a href="/termos.html" target="_blank" rel="noopener" class="link">Termos de Uso</a> e a <a href="/privacidade.html" target="_blank" rel="noopener" class="link">Política de Privacidade</a></span></label>
      <p class="form-error" role="alert"></p>
      <button class="btn btn-primary btn-block" type="submit">${planner ? 'Criar meu perfil' : 'Começar meu teste grátis'}</button>
    </form>
    <p class="auth-switch">Já tem conta? <a href="#/entrar" class="link">Entrar</a></p>`, { wide: true });
  const f = app.querySelector('#signup');
  bindForm(f, async () => {
    if (f.password.value !== f.password2.value) throw new Error('As senhas não conferem.');
    if (!f.terms.checked) throw new Error('Para continuar, aceite os Termos de Uso e a Política de Privacidade.');
    await api('POST', '/api/signup', planner
      ? { kind: 'planner', name: f.name.value, email: f.email.value, password: f.password.value, acceptTerms: true }
      : {
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

// Convite por link (enviado pelos noivos por WhatsApp, por exemplo): cria a conta ou entra numa existente.
export const INVITE_ROLE = { couple: 'noivo(a)', planner: 'assessoria', member: 'família / amigo(a)' };
async function renderInvite(token, mode = 'signup', err = '') {
  // Convite de noivos/família sempre cria uma conta nova (conta de noivos tem um casamento só).
  // Convite de assessoria cria o perfil de assessoria ou entra no que ela já tem.
  let info;
  try { info = await api('GET', `/api/invites/info?token=${encodeURIComponent(token)}`); }
  catch (e) {
    authScreen(html`<h1>Convite</h1>
      <p class="muted center">${e.message}</p>
      <a href="#/entrar" class="btn btn-ghost btn-block">Ir para o login</a>`);
    return;
  }
  const planner = info.role === 'planner';
  const signup = !planner || mode === 'signup';
  authScreen(html`<h1>Você foi convidado(a)</h1>
    <p class="muted center">Acesso ao planejamento do casamento <strong>${info.wedding}</strong>, como <strong>${INVITE_ROLE[info.role] || 'convidado(a)'}</strong>.</p>
    ${planner ? html`<div class="seg-kind" role="tablist" aria-label="Como entrar">
      <a href="#" role="tab" data-mode="signup" aria-selected="${signup}" class="${signup ? 'on' : ''}">Criar perfil</a>
      <a href="#" role="tab" data-mode="login" aria-selected="${!signup}" class="${signup ? '' : 'on'}">Já tenho perfil</a>
    </div>
    <p class="muted center small">${signup ? 'O perfil de assessoria é separado das contas de noivos. Os próximos casais que convidarem você aparecem nele, para consulta.' : 'Entre com o seu perfil de assessoria e este casamento entra em "Meus casamentos".'}</p>`
      : html`<p class="muted center small">Crie a sua conta para este casamento.</p>`}
    ${googleButton(planner ? 'planner' : 'couple', { invite: token, label: signup ? 'Criar conta com o Google' : 'Entrar com o Google' })}
    <form id="invite" class="stack" novalidate>
      ${signup ? html`<div class="field"><label for="in">${planner ? 'Seu nome ou da assessoria' : 'Seu nome'}</label><input id="in" name="name" autocomplete="name" required value="${info.name || ''}"></div>` : ''}
      <div class="field"><label for="ie">E-mail</label><input id="ie" name="email" type="email" autocomplete="${signup ? 'email' : 'username'}" autocapitalize="none" spellcheck="false" required><small>${signup ? 'É o seu login. Não enviamos nada para confirmar.' : ''}</small></div>
      ${pwField('ipw', 'password', signup ? 'Crie uma senha (mín. 8 caracteres, com letras e números)' : 'Senha', signup ? 'new-password' : 'current-password')}
      ${signup ? pwField('ipw2', 'password2', 'Confirme a senha', 'new-password') : ''}
      ${signup ? html`<label class="check terms"><input type="checkbox" name="terms"><span>Li e aceito os <a href="/termos.html" target="_blank" rel="noopener" class="link">Termos de Uso</a> e a <a href="/privacidade.html" target="_blank" rel="noopener" class="link">Política de Privacidade</a></span></label>` : ''}
      <p class="form-error" role="alert">${err}</p>
      <button class="btn btn-primary btn-block" type="submit">${signup ? (planner ? 'Criar perfil e entrar' : 'Criar conta e entrar') : 'Entrar e aceitar'}</button>
    </form>
    ${signup ? '' : html`<p class="auth-switch"><a href="#/esqueci" class="link small">Esqueci minha senha</a></p>`}`, { wide: signup });
  app.querySelectorAll('[data-mode]').forEach((a) => {
    a.onclick = (e) => { e.preventDefault(); if (a.dataset.mode !== mode) renderInvite(token, a.dataset.mode); };
  });
  const f = app.querySelector('#invite');
  bindForm(f, async () => {
    if (signup) {
      if (f.password.value !== f.password2.value) throw new Error('As senhas não conferem.');
      if (!f.terms.checked) throw new Error('Para continuar, aceite os Termos de Uso e a Política de Privacidade.');
    }
    await api('POST', '/api/invites/accept', signup
      ? { token, mode: 'signup', name: f.name.value, email: f.email.value, password: f.password.value, acceptTerms: true }
      : { token, mode: 'login', email: f.email.value, password: f.password.value }, { allow401: true });
    history.replaceState(null, '', '#/inicio');
    await onLoggedIn();
  });
}
