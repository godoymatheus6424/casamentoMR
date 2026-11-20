import { api } from '../api.js';
import { state, emit, loadAll } from '../store.js';
import { html, icon, pageHead, formModal, openModal, toast, run, fmtDateTime, confirmDialog, selectOptions, applyTheme } from '../ui.js';
import { weddingForm } from '../forms.js';

const ui = { users: null, loading: false };

async function loadUsers() {
  if (ui.loading) return;
  ui.loading = true;
  try { ui.users = await api('GET', '/api/users'); } catch { ui.users = []; }
  ui.loading = false;
  emit();
}

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

function nameForm() {
  formModal({
    title: 'Seu nome',
    values: { name: state.user.name },
    fields: [{ name: 'name', label: 'Nome', required: true, full: true }],
    onSubmit: async (d) => {
      const r = await api('PUT', '/api/me', d);
      state.user.name = r.name;
      ui.users = null;
      await loadAll();
      toast('Nome atualizado');
    },
  });
}

function userForm() {
  formModal({
    title: 'Adicionar pessoa',
    intro: 'Crie um acesso para seu par, assessoria ou alguém da família. Todos os usuários veem e editam o mesmo planejamento.',
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true },
      { name: 'username', label: 'Usuário', required: true, noCaps: true, autocomplete: 'off' },
      { name: 'password', label: 'Senha inicial', type: 'password', required: true, autocomplete: 'new-password', hint: 'Mín. 8 caracteres, com letras e números. A pessoa pode trocar depois.' },
    ],
    submitLabel: 'Criar acesso',
    onSubmit: async (d) => {
      await api('POST', '/api/users', d);
      ui.users = null;
      await loadAll();
      toast('Acesso criado');
    },
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

export default {
  render() {
    let theme = 'auto';
    try { theme = localStorage.getItem('theme') || 'auto'; } catch { /* ignora */ }
    const users = ui.users;
    return html`
      ${pageHead('Configurações')}
      <div class="settings-grid">
        <section class="card">
          <header class="card-head"><h2>${icon('heart')} Casamento</h2></header>
          <p class="pad muted">Nomes, data, locais, orçamento total, estilo e paleta de cores.</p>
          <div class="pad"><button type="button" class="btn btn-primary" data-act="wedding">${icon('edit')}<span>Editar detalhes do casamento</span></button></div>
        </section>

        <section class="card">
          <header class="card-head"><h2>${icon('user')} Minha conta</h2></header>
          <div class="list">
            <div class="row clickable" data-act="name"><div class="row-main"><div class="row-title">${state.user.name}</div><div class="row-meta"><span>usuário: ${state.user.username}</span></div></div>${icon('edit')}</div>
            <div class="row clickable" data-act="password"><div class="row-main"><div class="row-title">Alterar senha</div></div>${icon('chevron')}</div>
            <div class="row clickable" data-act="devices"><div class="row-main"><div class="row-title">Dispositivos conectados</div><div class="row-meta"><span>Veja onde sua conta está aberta</span></div></div>${icon('chevron')}</div>
          </div>
        </section>

        <section class="card">
          <header class="card-head"><h2>${icon('users')} Quem tem acesso</h2><button type="button" class="btn btn-ghost btn-sm" data-act="adduser">${icon('plus')}<span>Pessoa</span></button></header>
          ${users == null ? html`<p class="pad muted">Carregando…</p>` : html`<div class="list">${users.map((u) => html`<div class="row">
            <span class="avatar">${u.name.slice(0, 1).toUpperCase()}</span>
            <div class="row-main"><div class="row-title">${u.name} ${u.isMe ? html`<span class="badge b-ok">você</span>` : ''}</div><div class="row-meta"><span>${u.username}</span><span>desde ${new Date(u.createdAt).toLocaleDateString('pt-BR')}</span></div></div>
            ${!u.isMe ? html`<button type="button" class="btn-icon" data-act="deluser" data-id="${u.id}" data-name="${u.name}" aria-label="Remover acesso">${icon('trash')}</button>` : ''}
          </div>`)}</div>`}
        </section>

        <section class="card">
          <header class="card-head"><h2>${icon('sparkle')} Aparência</h2></header>
          <div class="pad field"><label for="theme-sel">Tema</label><select id="theme-sel">${selectOptions([{ value: 'auto', label: 'Automático (segue o aparelho)' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' }], theme)}</select></div>
        </section>

        <section class="card">
          <header class="card-head"><h2>${icon('download')} Backup</h2></header>
          <p class="pad muted">Baixe uma cópia de todos os dados (sem os arquivos). Os arquivos enviados ficam na pasta <code>data/uploads</code> do servidor — faça backup da pasta <code>data</code> inteira de vez em quando.</p>
          <div class="pad"><a class="btn btn-ghost" href="/api/export" download>${icon('download')}<span>Baixar backup (JSON)</span></a></div>
        </section>

        <section class="card">
          <header class="card-head"><h2>${icon('shield')} Segurança</h2></header>
          <ul class="pad sec-list">
            <li>Senhas guardadas com criptografia forte (scrypt) — nem quem acessa o banco consegue lê-las.</li>
            <li>Bloqueio automático após várias tentativas de senha erradas.</li>
            <li>Sessão protegida contra roubo por scripts (cookie HttpOnly) e contra ataques de outros sites (CSRF).</li>
            <li>Arquivos só podem ser abertos por quem está logado.</li>
          </ul>
        </section>
      </div>`;
  },
  mount(el) {
    if (ui.users == null) loadUsers();
    el.onclick = async (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      switch (a.dataset.act) {
        case 'wedding': weddingForm(); break;
        case 'name': nameForm(); break;
        case 'password': passwordForm(); break;
        case 'devices': devicesDialog(); break;
        case 'adduser': userForm(); break;
        case 'deluser':
          if (await confirmDialog(`Remover o acesso de ${a.dataset.name}? Os dados do planejamento não serão apagados.`, { ok: 'Remover' })) {
            run(async () => { await api('DELETE', `/api/users/${a.dataset.id}`); ui.users = null; emit(); toast('Acesso removido'); });
          }
          break;
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
