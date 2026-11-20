import { state, create, update, remove, bulkCreate, emit } from '../store.js';
import { html, icon, pageHead, chips, searchBox, empty, formModal, toast, fmtDate, todayISO, progress, badge, run, norm, confirmDialog } from '../ui.js';
import { PERIODS, periodOf, taskDue, assigneeOptions } from '../domain.js';
import { TASK_TEMPLATE } from '../seed.js';

const ui = { filter: 'pendentes', q: '', who: '' };

function taskForm(t = {}) {
  formModal({
    title: t.id ? 'Editar tarefa' : 'Nova tarefa',
    values: { period: '', ...t },
    fields: [
      { name: 'title', label: 'Tarefa', required: true, full: true },
      { name: 'period', label: 'Quando fazer', type: 'select', options: PERIODS.map((p) => ({ value: p.key, label: p.label })) },
      { name: 'dueDate', label: 'Prazo específico', type: 'date', hint: 'Opcional. Sem prazo, usamos o período + data do casamento.' },
      { name: 'assignee', label: 'Responsável', type: 'select', options: assigneeOptions() },
      { name: 'done', label: 'Concluída', type: 'checkbox' },
      { name: 'notes', label: 'Anotações', type: 'textarea', full: true, rows: 3 },
    ],
    onSubmit: async (d) => {
      if (t.id) await update('tasks', t.id, d);
      else await create('tasks', { ...d, order: state.items.tasks.length });
      toast('Tarefa salva');
    },
    onDelete: t.id ? async () => { await remove('tasks', t.id); toast('Tarefa excluída'); } : null,
  });
}

export default {
  render() {
    const tasks = state.items.tasks;
    const today = todayISO();
    const isLate = (t) => { const d = taskDue(t); return !t.done && d && d < today; };
    const total = tasks.length;
    const done = tasks.filter((t) => t.done).length;
    const late = tasks.filter(isLate).length;
    const q = norm(ui.q.trim());

    const list = tasks.filter((t) => {
      if (ui.filter === 'pendentes' && t.done) return false;
      if (ui.filter === 'concluidas' && !t.done) return false;
      if (ui.filter === 'atrasadas' && !isLate(t)) return false;
      if (ui.who && t.assignee !== ui.who) return false;
      if (q && !norm(`${t.title} ${t.notes || ''} ${t.assignee || ''}`).includes(q)) return false;
      return true;
    });
    const groups = PERIODS.map((p) => ({
      p,
      items: list.filter((t) => periodOf(t.period).key === p.key)
        .sort((a, b) => (taskDue(a) || '9999').localeCompare(taskDue(b) || '9999') || (a.order ?? 0) - (b.order ?? 0)),
    })).filter((g) => g.items.length);
    const assignees = [...new Set(tasks.map((t) => t.assignee).filter(Boolean))];

    return html`
      ${pageHead('Tarefas', `${done} de ${total} concluídas${late ? ` · ${late} atrasadas` : ''}`,
        html`<button type="button" class="btn btn-primary" data-act="add">${icon('plus')}<span>Nova tarefa</span></button>`)}
      <div class="card progress-card">${progress(total ? done / total : 0, 'ok')}<span>${total ? Math.round((done / total) * 100) : 0}% do checklist concluído</span></div>
      <div class="toolbar">
        ${searchBox('q-tasks', ui.q, 'Buscar tarefa…')}
        ${assignees.length ? html`<select class="select-sm" id="who-tasks" aria-label="Responsável"><option value="">Todos os responsáveis</option>${assignees.map((a) => html`<option ${a === ui.who ? 'selected' : ''}>${a}</option>`)}</select>` : ''}
      </div>
      ${chips('filter', [
        { value: 'pendentes', label: 'Pendentes', count: total - done },
        { value: 'atrasadas', label: 'Atrasadas', count: late },
        { value: 'concluidas', label: 'Concluídas', count: done },
        { value: 'todas', label: 'Todas', count: total },
      ], ui.filter)}
      ${!state.settings.date && total ? html`<p class="hint">${icon('calendar')} Defina a data do casamento para calcularmos os prazos automaticamente.</p>` : ''}
      ${!total ? empty('check', 'Nenhuma tarefa ainda', 'Comece com o checklist sugerido (mais de 40 tarefas organizadas por período) ou crie as suas.',
        html`<div class="empty-actions"><button type="button" class="btn btn-primary" data-act="template">Usar checklist sugerido</button><button type="button" class="btn btn-ghost" data-act="add">Criar tarefa</button></div>`)
        : !groups.length ? empty('search', 'Nada por aqui', ui.filter === 'atrasadas' ? 'Nenhuma tarefa atrasada. Muito bem!' : 'Nenhuma tarefa corresponde ao filtro.')
        : groups.map((g) => html`
        <section class="group">
          <h2 class="group-title">${g.p.label}<span class="group-n">${g.items.length}</span></h2>
          <div class="card list">
            ${g.items.map((t) => {
              const due = taskDue(t);
              const lateT = isLate(t);
              return html`<div class="row clickable ${t.done ? 'is-done' : ''}" data-act="edit" data-id="${t.id}">
                <input type="checkbox" class="tick" data-act="toggle" data-id="${t.id}" ${t.done ? 'checked' : ''} aria-label="Concluir">
                <div class="row-main">
                  <div class="row-title">${t.title}</div>
                  <div class="row-meta">
                    ${due ? html`<span class="${lateT ? 'text-danger' : ''}">${icon('calendar')} ${fmtDate(due)}</span>` : ''}
                    ${t.assignee ? html`<span>${icon('user')} ${t.assignee}</span>` : ''}
                    ${t.notes ? html`<span title="Tem anotações">${icon('note')}</span>` : ''}
                  </div>
                </div>
                ${lateT ? badge('Atrasada', 'danger') : ''}
              </div>`;
            })}
          </div>
        </section>`)}
      ${total ? html`<p class="foot-actions"><button type="button" class="btn btn-ghost btn-sm" data-act="template">${icon('plus')}<span>Adicionar tarefas sugeridas que faltam</span></button></p>` : ''}`;
  },

  mount(el) {
    el.onclick = async (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const id = a.dataset.id;
      switch (a.dataset.act) {
        case 'add': taskForm(); break;
        case 'edit': taskForm(state.items.tasks.find((t) => t.id === id)); break;
        case 'toggle': run(() => update('tasks', id, { done: a.checked })); break;
        case 'chip': ui[a.dataset.group] = a.dataset.val; emit(); break;
        case 'template': {
          const have = new Set(state.items.tasks.map((t) => norm(t.title)));
          const missing = TASK_TEMPLATE.filter(([, title]) => !have.has(norm(title)));
          if (!missing.length) { toast('Todas as tarefas sugeridas já estão na lista.'); break; }
          if (state.items.tasks.length && !(await confirmDialog(`Adicionar ${missing.length} tarefas sugeridas à lista?`, { ok: 'Adicionar', danger: false, title: 'Checklist sugerido' }))) break;
          const base = state.items.tasks.length;
          await run(async () => {
            await bulkCreate('tasks', missing.map(([period, title], i) => ({ title, period, done: false, order: base + i })));
            toast(`${missing.length} tarefas adicionadas`);
          });
          break;
        }
      }
    };
    el.oninput = (e) => { if (e.target.id === 'q-tasks') { ui.q = e.target.value; emit(); } };
    el.onchange = (e) => { if (e.target.id === 'who-tasks') { ui.who = e.target.value; emit(); } };
  },
};
