import { state, update } from '../store.js';
import { html, icon, money, moneyShort, fmtDate, fmtDateLong, fmtDateShort, todayISO, daysBetween, progress, badge, plural, sum, run } from '../ui.js';
import { coupleTitle, taskDue, guestPeople, budgetCats, contractedVendors, mapsLink } from '../domain.js';
import { weddingForm, togglePaid } from '../forms.js';

function countdown(days) {
  if (days == null) {
    return html`<div class="countdown"><div class="cd-label">Ainda sem data</div><button type="button" class="btn btn-primary btn-sm" data-act="edit-wedding">Definir a data</button></div>`;
  }
  if (days === 0) return html`<div class="countdown"><div class="cd-num">Hoje</div><div class="cd-label">é o grande dia!</div></div>`;
  if (days < 0) return html`<div class="countdown"><div class="cd-num">${-days}</div><div class="cd-label">${-days === 1 ? 'dia' : 'dias'} de casados</div></div>`;
  const months = Math.floor(days / 30.44);
  const weeks = Math.floor(days / 7);
  const approx = months >= 2 ? `cerca de ${months} meses` : weeks >= 2 ? `cerca de ${weeks} semanas` : 'é logo ali!';
  return html`<div class="countdown"><div class="cd-num">${days}</div><div class="cd-label">${days === 1 ? 'dia' : 'dias'} para o grande dia</div><div class="cd-sub">${approx}</div></div>`;
}

function paletteChips(text) {
  const parts = String(text || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return '';
  return html`<div class="palette">${parts.map((p) => {
    const ok = typeof CSS !== 'undefined' && CSS.supports('color', p);
    return html`<span class="swatch">${ok ? html`<i style="background:${p}"></i>` : ''}${p}</span>`;
  })}</div>`;
}

function infoItem(ic, label, value, link) {
  if (!value) return '';
  return html`<div class="info-item">${icon(ic)}<div><small>${label}</small>${link ? html`<a href="${link}" target="_blank" rel="noopener noreferrer" class="link">${value}</a>` : html`<span>${value}</span>`}</div></div>`;
}

export default {
  render() {
    const s = state.settings;
    const I = state.items;
    const today = todayISO();
    const days = s.date ? daysBetween(today, s.date) : null;

    // Tarefas
    const tTotal = I.tasks.length;
    const tDone = I.tasks.filter((t) => t.done).length;
    const pending = I.tasks.filter((t) => !t.done).map((t) => ({ t, due: taskDue(t) }));
    const overdue = pending.filter((x) => x.due && x.due < today).length;
    const nextTasks = pending.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.t.order ?? 0) - (b.t.order ?? 0)).slice(0, 6);

    // Orçamento
    const total = Number(s.budgetTotal) || 0;
    const contracted = sum(contractedVendors(), (v) => v.price);
    const paid = sum(I.payments.filter((p) => p.paid), (p) => p.amount);
    const nextPays = I.payments.filter((p) => !p.paid).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 5);

    // Convidados
    const people = sum(I.guests, guestPeople);
    const conf = sum(I.guests.filter((g) => g.rsvp === 'confirmado'), guestPeople);
    const dec = sum(I.guests.filter((g) => g.rsvp === 'recusado'), guestPeople);
    const pend = people - conf - dec;

    // Fornecedores
    const vContr = contractedVendors();
    const vOpen = I.vendors.filter((v) => ['pesquisando', 'orcamento', 'negociando'].includes(v.status || 'pesquisando')).length;
    const contractedCats = new Set(vContr.map((v) => v.category));
    const missing = budgetCats().filter((c) => !contractedCats.has(c.name) && c.name !== 'Outros / Imprevistos');

    const pinned = I.notes.filter((n) => n.pinned).slice(0, 3);
    const onboarding = !s.partner1 && !s.partner2 && !s.date;

    return html`
      ${onboarding ? html`<div class="callout">${icon('sparkle')}<div><strong>Comece pelos detalhes do casamento</strong><p>Nomes, data, locais e orçamento — tudo o resto se organiza a partir daí.</p></div><button type="button" class="btn btn-primary btn-sm" data-act="edit-wedding">Preencher</button></div>` : ''}

      <section class="hero">
        <div class="hero-text">
          <p class="eyebrow">${s.date ? fmtDateLong(s.date) : 'Data a definir'}${s.time ? ` · ${s.time}` : ''}</p>
          <h1 class="hero-title">${coupleTitle()}</h1>
          ${s.receptionPlace || s.ceremonyPlace ? html`<p class="hero-place">${icon('pin')} ${s.ceremonyPlace || s.receptionPlace}${s.ceremonyPlace && s.receptionPlace && s.ceremonyPlace !== s.receptionPlace ? ` · ${s.receptionPlace}` : ''}</p>` : ''}
          <button type="button" class="btn btn-ghost btn-sm" data-act="edit-wedding">${icon('edit')}<span>Editar detalhes</span></button>
        </div>
        ${countdown(days)}
      </section>

      <div class="stats">
        <a class="stat" href="#/tarefas">
          <span class="stat-label">${icon('check')} Tarefas</span>
          <strong>${tDone}<small> / ${tTotal}</small></strong>
          ${progress(tTotal ? tDone / tTotal : 0)}
          <span class="stat-foot ${overdue ? 'text-danger' : ''}">${overdue ? `${plural(overdue, 'atrasada', 'atrasadas')}` : tTotal ? `${Math.round((tDone / tTotal) * 100)}% concluído` : 'nenhuma tarefa'}</span>
        </a>
        <a class="stat" href="#/orcamento">
          <span class="stat-label">${icon('wallet')} Contratado</span>
          <strong>${moneyShort(contracted)}</strong>
          ${progress(total ? contracted / total : 0, total && contracted > total ? 'danger' : '')}
          <span class="stat-foot ${total && contracted > total ? 'text-danger' : ''}">${total ? `${Math.round((contracted / total) * 100)}% de ${moneyShort(total)}` : 'defina o orçamento total'}</span>
        </a>
        <a class="stat" href="#/convidados">
          <span class="stat-label">${icon('users')} Confirmados</span>
          <strong>${conf}<small> / ${people}</small></strong>
          ${progress(people ? conf / people : 0, 'ok')}
          <span class="stat-foot">${pend ? `${pend} aguardando resposta` : people ? 'todos responderam' : 'nenhum convidado ainda'}</span>
        </a>
        <a class="stat" href="#/fornecedores">
          <span class="stat-label">${icon('briefcase')} Fornecedores</span>
          <strong>${vContr.length}<small> contratados</small></strong>
          ${progress(I.vendors.length ? vContr.length / Math.max(1, vContr.length + vOpen) : 0)}
          <span class="stat-foot">${vOpen ? `${vOpen} em negociação` : 'nenhum em aberto'}</span>
        </a>
      </div>

      <div class="dash-grid">
        <div class="dash-col">
          <section class="card">
            <header class="card-head"><h2>Próximas tarefas</h2><a href="#/tarefas" class="link-more">Ver todas ${icon('chevron')}</a></header>
            ${nextTasks.length ? html`<div class="list">${nextTasks.map(({ t, due }) => html`
              <div class="row">
                <input type="checkbox" class="tick" data-act="task-done" data-id="${t.id}" aria-label="Concluir ${t.title}">
                <div class="row-main"><div class="row-title">${t.title}</div>
                  <div class="row-meta">${due ? html`<span class="${due < today ? 'text-danger' : ''}">${icon('calendar')} ${fmtDate(due)}</span>` : ''}${t.assignee ? html`<span>${icon('user')} ${t.assignee}</span>` : ''}</div>
                </div>
                ${due && due < today ? badge('Atrasada', 'danger') : ''}
              </div>`)}</div>` : html`<p class="muted pad">Nenhuma tarefa pendente. 🎉</p>`}
          </section>

          <section class="card">
            <header class="card-head"><h2>Próximos pagamentos</h2><a href="#/orcamento?pagamentos" class="link-more">Ver todos ${icon('chevron')}</a></header>
            ${nextPays.length ? html`<div class="list">${nextPays.map((p) => {
              const v = I.vendors.find((x) => x.id === p.vendorId);
              const late = p.dueDate && p.dueDate < today;
              return html`<div class="row">
                <div class="date-chip ${late ? 'late' : ''}">${p.dueDate ? fmtDateShort(p.dueDate) : '—'}</div>
                <div class="row-main"><div class="row-title">${p.description}</div><div class="row-meta">${v ? html`<span>${v.name}</span>` : ''}${late ? html`<span class="text-danger">vencido</span>` : ''}</div></div>
                <strong class="amount">${money(p.amount)}</strong>
                <button type="button" class="btn btn-sm btn-ghost" data-act="pay" data-id="${p.id}" title="Marcar como pago">${icon('tick')}<span class="hide-sm">Pago</span></button>
              </div>`;
            })}</div>` : html`<p class="muted pad">Nenhum pagamento pendente.</p>`}
            <footer class="card-foot"><span>Pago até agora</span><strong>${money(paid)}</strong></footer>
          </section>
        </div>

        <div class="dash-col">
          <section class="card">
            <header class="card-head"><h2>O casamento</h2><button type="button" class="btn-icon" data-act="edit-wedding" aria-label="Editar">${icon('edit')}</button></header>
            <div class="info-list">
              ${infoItem('heart', 'Cerimônia', [s.ceremonyPlace, s.ceremonyAddress].filter(Boolean).join(' — '), mapsLink(s.ceremonyAddress || s.ceremonyPlace))}
              ${infoItem('pin', 'Recepção', [s.receptionPlace, s.receptionAddress].filter(Boolean).join(' — '), mapsLink(s.receptionAddress || s.receptionPlace))}
              ${infoItem('users', 'Convidados estimados', s.guestEstimate ? `${s.guestEstimate} pessoas` : '')}
              ${infoItem('wallet', 'Orçamento total', total ? money(total) : '')}
              ${infoItem('sparkle', 'Estilo', s.style)}
              ${infoItem('user', 'Traje', s.dressCode)}
              ${infoItem('link', 'Hashtag / site', s.hashtag)}
            </div>
            ${paletteChips(s.palette)}
            ${s.overview ? html`<blockquote class="vision">${s.overview}</blockquote>` : ''}
            ${!s.ceremonyPlace && !s.receptionPlace && !s.style && !s.overview ? html`<p class="muted pad">Adicione locais, estilo, paleta de cores e a visão de vocês para o grande dia.</p>` : ''}
          </section>

          ${missing.length ? html`<section class="card">
            <header class="card-head"><h2>Ainda falta contratar</h2><a href="#/fornecedores" class="link-more">Fornecedores ${icon('chevron')}</a></header>
            <div class="tag-cloud">${missing.map((c) => html`<span class="tag">${c.name}</span>`)}</div>
          </section>` : ''}

          ${pinned.length ? html`<section class="card">
            <header class="card-head"><h2>Notas fixadas</h2><a href="#/anotacoes" class="link-more">Anotações ${icon('chevron')}</a></header>
            <div class="mini-notes">${pinned.map((n) => html`<a href="#/anotacoes" class="mini-note note-${n.color || 'creme'}"><strong>${n.title || 'Sem título'}</strong><p>${String(n.body || '').slice(0, 160)}</p></a>`)}</div>
          </section>` : ''}
        </div>
      </div>`;
  },

  mount(el) {
    el.onclick = (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const id = a.dataset.id;
      switch (a.dataset.act) {
        case 'edit-wedding': weddingForm(); break;
        case 'task-done': run(() => update('tasks', id, { done: true })); break;
        case 'pay': {
          const p = state.items.payments.find((x) => x.id === id);
          if (p) run(() => togglePaid(p, true));
          break;
        }
      }
    };
  },
};
