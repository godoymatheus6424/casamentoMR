import { api } from '../api.js';
import { state, emit, loadAll, refreshMe } from '../store.js';
import { html, icon, pageHead, formModal, openModal, toast, run, fmtDateTime, fmtSize, confirmDialog, selectOptions, applyTheme, progress } from '../ui.js';
import { weddingForm } from '../forms.js';
import { ROLE_LABELS, ROLE_OPTIONS, isManager } from '../domain.js';

const ui = { users: null, loading: false, refreshed: false };

async function loadUsers() {
  if (ui.loading) return;
  ui.loading = true;
  try { ui.users = await api('GET', '/api/users'); } catch { ui.users = []; }
  ui.loading = false;
  emit();
}
const fmtDay = (ms) => (ms ? new Date(ms).toLocaleDateString('pt-BR') : '');
const isOwner = () => state.workspace?.role === 'owner';

function passwordForm() {
  formModal({
    title: 'Alterar senha',
    fields: [
      { name: 'current', label: 'Senha atual', type: 'password', required: true, full: true, autocomplete: 'current-password' },
      { name: 'next', label: 'Nova senha', type: 'password', required: true, full: true, autocomplete: 'new-password', hint: 'Mínimo de 8 caracteres, com letras e números.' },
      { name: 'next2', label: 'Confirme a nova senha', type: 'password', required: true, full: true, autocomplete: 'new-password' },
    ],
    onSubmit: async (d) => {
      if (d.next !== d.next2) throw new Error('As senhas não conferem.');
      await api('POST', '/api/password', { current: d.current, next: d.next });
      toast('Senha alterada. Outros dispositivos foram desconectados.');
    },
  });
}

function accountForm() {
  formModal({
    title: 'Minha conta',
    values: { name: state.user.name, email: state.user.email || '' },
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true },
      { name: 'email', label: 'E-mail', type: 'email', required: true, full: true, autocomplete: 'email', hint: 'Usado para entrar e para recuperar a senha.' },
    ],
    onSubmit: async (d) => {
      const r = await api('PUT', '/api/me', d);
      state.user.name = r.name;
      state.user.email = r.email;
      ui.users = null;
      await loadAll();
      toast('Conta atualizada');
    },
  });
}

function userForm(role = 'couple') {
  formModal({
    title: 'Adicionar pessoa',
    intro: 'Todas as pessoas veem e editam o planejamento. Só os noivos podem adicionar ou remover acessos.',
    values: { role },
    fields: [
      { name: 'role', label: 'Quem é', type: 'select', full: true, options: ROLE_OPTIONS },
      { name: 'name', label: 'Nome', full: true },
      { name: 'email', label: 'E-mail', type: 'email', required: true, full: true, autocomplete: 'off' },
      { name: 'password', label: 'Senha inicial', type: 'password', full: true, autocomplete: 'new-password', hint: 'Se a pessoa já usa o planejador (ex.: uma assessora que atende outros casais), deixe em branco: ela entra com a senha dela. Senão, defina uma senha (mín. 8 caracteres, com letras e números) e combine com ela.' },
    ],
    submitLabel: 'Dar acesso',
    onSubmit: async (d) => {
      const r = await api('POST', '/api/users', d);
      ui.users = null;
      await loadAll();
      toast(r.linked ? `${r.name} já tinha conta e agora tem acesso a este casamento` : 'Acesso criado');
    },
  });
}

function roleForm(u) {
  formModal({
    title: `Acesso de ${u.name}`,
    values: { role: u.role },
    fields: [{ name: 'role', label: 'Quem é', type: 'select', full: true, options: ROLE_OPTIONS, hint: 'Noivos podem adicionar e remover pessoas. Assessoria e família editam o planejamento.' }],
    onSubmit: async (d) => {
      await api('PUT', `/api/users/${u.id}`, d);
      ui.users = null;
      emit();
      toast('Acesso atualizado');
    },
    onDelete: async () => {
      await api('DELETE', `/api/users/${u.id}`);
      ui.users = null;
      await loadAll();
      toast('Acesso removido');
    },
    deleteConfirm: `Remover o acesso de ${u.name} a este casamento? Os dados do planejamento não serão apagados.`,
  });
}

async function leaveWorkspace() {
  const many = (state.workspaceCount || 1) > 1;
  const ok = await confirmDialog(many
    ? 'Sair deste casamento? Você perde o acesso a ele, mas continua com os outros casamentos.'
    : 'Sair deste casamento? Como você não participa de nenhum outro, sua conta será excluída.', { ok: 'Sair do casamento' });
  if (!ok) return;
  await run(async () => {
    await api('POST', '/api/workspaces/leave');
    location.hash = '';
    location.reload();
  });
}

async function devicesDialog() {
  let list = [];
  try { list = await api('GET', '/api/sessions'); } catch (e) { toast(e.message, 'error'); return; }
  const device = (ua) => {
    ua = ua || '';
    const os = /iPhone|iPad/.test(ua) ? (/iPad/.test(ua) ? 'iPad' : 'iPhone') : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo';
    const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
    return `${br} · ${os}`;
  };
  openModal({
    title: 'Dispositivos conectados',
    body: html`<div class="list">${list.map((s) => html`<div class="row">
      ${icon('monitor')}
      <div class="row-main"><div class="row-title">${device(s.ua)} ${s.current ? html`<span class="badge b-ok">este</span>` : ''}</div>
      <div class="row-meta"><span>último acesso ${fmtDateTime(s.lastSeen)}</span><span>IP ${s.ip}</span></div></div>
    </div>`)}</div>`,
    footer: html`<span class="spacer"></span><button type="button" class="btn btn-ghost" data-close2>Fechar</button>${list.length > 1 ? html`<button type="button" class="btn btn-danger" data-revoke>Desconectar os outros</button>` : ''}`,
    onMount(m) {
      m.foot.querySelector('[data-close2]').onclick = () => m.close();
      const r = m.foot.querySelector('[data-revoke]');
      if (r) r.onclick = () => run(async () => {
        const res = await api('POST', '/api/sessions/revoke-others');
        toast(`${res.removed} sessão(ões) encerrada(s)`);
        m.close();
      });
    },
  });
}

function deleteAccountDialog() {
  formModal({
    title: 'Excluir conta e dados',
    intro: 'Isso apaga DEFINITIVAMENTE o planejamento inteiro: fornecedores, contratos e arquivos, convidados, orçamento, anotações e os acessos das pessoas convidadas. Não dá para desfazer. Se quiser guardar uma cópia, baixe o backup antes.',
    fields: [
      { name: 'confirm', label: 'Digite EXCLUIR para confirmar', required: true, full: true, autocomplete: 'off' },
      { name: 'password', label: 'Sua senha', type: 'password', required: true, full: true, autocomplete: 'current-password' },
    ],
    submitLabel: 'Excluir tudo',
    onSubmit: async (d) => {
      if (d.confirm.trim().toUpperCase() !== 'EXCLUIR') throw new Error('Digite EXCLUIR para confirmar.');
      await api('DELETE', '/api/workspace', { password: d.password });
      location.hash = '';
      location.reload();
    },
  });
}

function planCard() {
  const ws = state.workspace;
  if (!ws) return '';
  const pricing = state.status?.pricing || { monthly: '9,90', annual: '89' };
  const used = ws.usedBytes || 0, quota = ws.quotaBytes || 1;
  let statusLine;
  if (ws.plan === 'lifetime') statusLine = html`<span class="badge b-ok">Vitalício</span> Acesso completo, sem prazo.`;
  else if (ws.access === 'readonly') statusLine = html`<span class="badge b-danger">Só leitura</span> ${ws.plan === 'trial' ? `O teste terminou em ${fmtDay(ws.trialEndsAt)}.` : 'Assinatura inativa.'}`;
  else if (ws.plan === 'trial') statusLine = html`<span class="badge b-accent">Teste grátis</span> Tudo liberado até ${fmtDay(ws.trialEndsAt)}.`;
  else statusLine = html`<span class="badge b-ok">${ws.planLabel}</span> ${ws.paidUntil ? `Ativo até ${fmtDay(ws.paidUntil)}.` : 'Ativo.'}`;
  return html`<section class="card o-4">
    <header class="card-head"><h2>${icon('money')} Plano e armazenamento</h2></header>
    <div class="pad plan-status">${statusLine}</div>
    ${ws.plan !== 'lifetime' ? html`<div class="pad plans">
      <div class="plan-opt"><strong>Mensal</strong><span class="price">R$ ${pricing.monthly}<small>/mês</small></span></div>
      <div class="plan-opt best"><span class="badge b-accent">Mais econômico</span><strong>Anual</strong><span class="price">R$ ${pricing.annual}<small>/ano</small></span></div>
    </div>
    <p class="pad hint small">${icon('alert')} O pagamento online chega em breve. Por enquanto, para assinar, fale com a gente.</p>` : ''}
    <div class="pad storage">
      <div class="storage-line"><span>Arquivos enviados</span><span>${fmtSize(used)} de ${fmtSize(quota)}</span></div>
      ${progress(used / quota, used / quota > 0.9 ? 'danger' : '')}
    </div>
  </section>`;
}

export default {
  render() {
    let theme = 'auto';
    try { theme = localStorage.getItem('theme') || 'auto'; } catch { /* ignora */ }
    const users = ui.users;
    const owner = isOwner();
    const manager = isManager(state.workspace?.role);
    return html`
      ${pageHead('Configurações')}
      <div class="settings-grid">
       <div class="settings-col">
        <section class="card o-1">
          <header class="card-head"><h2>${icon('heart')} Casamento</h2></header>
          <p class="pad muted">Nomes, data, locais, orçamento total, estilo e paleta de cores.</p>
          <div class="pad"><button type="button" class="btn btn-primary" data-act="wedding">${icon('edit')}<span>Editar detalhes do casamento</span></button></div>
        </section>

        ${manager ? planCard() : ''}

        <section class="card o-5">
          <header class="card-head"><h2>${icon('sparkle')} Aparência</h2></header>
          <div class="pad field"><label for="theme-sel">Tema</label><select id="theme-sel">${selectOptions([{ value: 'auto', label: 'Automático (segue o aparelho)' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' }], theme)}</select></div>
        </section>

        <section class="card o-7">
          <header class="card-head"><h2>${icon('shield')} Segurança</h2></header>
          <ul class="pad sec-list">
            <li>Senhas guardadas com criptografia forte (scrypt).</li>
            <li>Cada casamento fica totalmente isolado dos outros.</li>
            <li>Bloqueio automático após várias tentativas de senha erradas.</li>
            <li>Arquivos só podem ser abertos por quem tem acesso a este casamento.</li>
          </ul>
        </section>
       </div>

       <div class="settings-col">
        <section class="card o-2">
          <header class="card-head"><h2>${icon('user')} Minha conta</h2></header>
          <div class="list">
            <div class="row clickable" data-act="account"><div class="row-main"><div class="row-title">${state.user.name}</div><div class="row-meta"><span>${state.user.email || html`<span class="text-warn">sem e-mail: adicione para poder recuperar a senha</span>`}</span></div></div>${icon('edit')}</div>
            <div class="row clickable" data-act="password"><div class="row-main"><div class="row-title">Alterar senha</div></div>${icon('chevron')}</div>
            <div class="row clickable" data-act="devices"><div class="row-main"><div class="row-title">Dispositivos conectados</div><div class="row-meta"><span>Veja onde sua conta está aberta</span></div></div>${icon('chevron')}</div>
          </div>
        </section>

        <section class="card o-3">
          <header class="card-head"><h2>${icon('users')} Quem tem acesso</h2>${manager ? html`<button type="button" class="btn btn-ghost btn-sm" data-act="adduser">${icon('plus')}<span>Pessoa</span></button>` : ''}</header>
          ${users == null ? html`<p class="pad muted">Carregando…</p>` : html`<div class="list">${users.map((u) => {
            const editable = manager && !u.isMe && u.role !== 'owner';
            return html`<div class="row ${editable ? 'clickable' : ''}" ${editable ? html`data-act="role" data-id="${u.id}"` : ''}>
              <span class="avatar role-${u.role}">${u.name.slice(0, 1).toUpperCase()}</span>
              <div class="row-main"><div class="row-title">${u.name} ${u.isMe ? html`<span class="badge b-ok">você</span>` : ''}</div><div class="row-meta"><span>${u.email || u.username}</span></div></div>
              <span class="badge ${u.role === 'planner' ? 'b-accent' : u.role === 'member' ? 'b-muted' : 'b-ok'}">${ROLE_LABELS[u.role] || u.role}</span>
              ${editable ? icon('chevron') : ''}
            </div>`;
          })}</div>`}
          ${manager && users && !users.some((u) => u.role === 'planner') ? html`<div class="pad invite-planner">
            <p class="small muted">Vocês têm assessoria ou cerimonial? Dê acesso para ela acompanhar e editar o planejamento junto com vocês.</p>
            <button type="button" class="btn btn-ghost btn-sm" data-act="addplanner">${icon('plus')}<span>Adicionar assessoria</span></button>
          </div>` : ''}
        </section>

        <section class="card o-6">
          <header class="card-head"><h2>${icon('download')} Seus dados</h2></header>
          <p class="pad muted">Baixe uma cópia de todo o planejamento (sem os arquivos, que você pode baixar um a um em Documentos).</p>
          <div class="pad"><a class="btn btn-ghost" href="/api/export" download>${icon('download')}<span>Baixar meus dados (JSON)</span></a></div>
        </section>

        ${owner ? html`<section class="card danger-zone o-8">
          <header class="card-head"><h2>${icon('trash')} Excluir conta</h2></header>
          <p class="pad muted">Apaga definitivamente este planejamento, os arquivos e os acessos das pessoas convidadas.</p>
          <div class="pad"><button type="button" class="btn btn-danger-ghost" data-act="delaccount">${icon('trash')}<span>Excluir conta e todos os dados</span></button></div>
        </section>` : html`<section class="card o-8">
          <header class="card-head"><h2>${icon('logout')} Sair deste casamento</h2></header>
          <p class="pad muted">Remove o seu acesso a "${state.workspace?.name || 'este casamento'}". O planejamento continua com os noivos.</p>
          <div class="pad"><button type="button" class="btn btn-danger-ghost" data-act="leave">${icon('logout')}<span>Sair deste casamento</span></button></div>
        </section>`}
       </div>
      </div>`;
  },
  mount(el) {
    if (ui.users == null) loadUsers();
    if (!ui.refreshed) { ui.refreshed = true; refreshMe().then(emit).catch(() => {}); }
    el.onclick = async (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      switch (a.dataset.act) {
        case 'wedding': weddingForm(); break;
        case 'account': accountForm(); break;
        case 'password': passwordForm(); break;
        case 'devices': devicesDialog(); break;
        case 'adduser': userForm(); break;
        case 'addplanner': userForm('planner'); break;
        case 'role': {
          const u = ui.users?.find((x) => String(x.id) === a.dataset.id);
          if (u) roleForm(u);
          break;
        }
        case 'delaccount': deleteAccountDialog(); break;
        case 'leave': leaveWorkspace(); break;
      }
    };
    el.onchange = (e) => {
      if (e.target.id === 'theme-sel') {
        try { localStorage.setItem('theme', e.target.value); } catch { /* ignora */ }
        applyTheme();
      }
    };
  },
};

// Ao sair da tela, força atualizar o plano da próxima vez que ela abrir.
window.addEventListener('hashchange', () => { ui.refreshed = false; });
