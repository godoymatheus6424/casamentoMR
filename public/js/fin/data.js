// Finanças: dados (as minhas, as do par e os pagamentos do casamento) e gravação no servidor.
import { api } from '../api.js';
import { emit as emitAll } from '../store.js';

// Toda mudança nos dados invalida os cálculos guardados (ver model.js).
function emit() { fin.version = (fin.version || 0) + 1; emitAll(); }

export const FCOLLS = ['accounts', 'cards', 'categories', 'transactions', 'recurring', 'goals'];
const emptyItems = () => Object.fromEntries(FCOLLS.map((c) => [c, []]));

export const fin = {
  loaded: false,
  loadedAt: 0,
  settings: {},
  items: emptyItems(),
  partner: null,   // { id, name, shared, items?, settings? }
  wedding: { payments: [], vendors: [] },
  scope: 'me',     // 'me' (minhas) ou 'couple' (visão do casal)
  version: 0,
};
try { if (sessionStorage.getItem('fin-scope') === 'couple') fin.scope = 'couple'; } catch { /* ignora */ }

export function setScope(scope) {
  fin.scope = scope === 'couple' && fin.partner ? 'couple' : 'me';
  try { sessionStorage.setItem('fin-scope', fin.scope); } catch { /* ignora */ }
  emit();
}

export async function loadFin() {
  const d = await api('GET', '/api/fin');
  fin.settings = d.settings || {};
  fin.items = { ...emptyItems(), ...d.items };
  fin.partner = d.partner || null;
  if (fin.partner?.items) fin.partner.items = { ...emptyItems(), ...fin.partner.items };
  fin.wedding = d.wedding || { payments: [], vendors: [] };
  if (!fin.partner) fin.scope = 'me';
  fin.loaded = true;
  fin.loadedAt = Date.now();
  emit();
}

export const fById = (coll, id) => fin.items[coll].find((x) => x.id === id);

export async function fcreate(coll, data) {
  const it = await api('POST', `/api/fin/${coll}`, data);
  fin.items[coll].push(it);
  emit();
  return it;
}
export async function fbulk(coll, list) {
  if (!list.length) return [];
  const out = [];
  for (let i = 0; i < list.length; i += 500) out.push(...(await api('POST', `/api/fin/${coll}/bulk`, { items: list.slice(i, i + 500) })));
  fin.items[coll].push(...out);
  emit();
  return out;
}
export async function fupdate(coll, id, patch) {
  const it = await api('PUT', `/api/fin/${coll}/${id}`, patch);
  const arr = fin.items[coll];
  const i = arr.findIndex((x) => x.id === id);
  if (i >= 0) arr[i] = it; else arr.push(it);
  emit();
  return it;
}
export async function fremove(coll, ids) {
  ids = [].concat(ids);
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += 500) await api('POST', `/api/fin/${coll}/delete`, { ids: ids.slice(i, i + 500) });
  const gone = new Set(ids);
  fin.items[coll] = fin.items[coll].filter((x) => !gone.has(x.id));
  emit();
}
export async function saveFinSettings(patch) {
  fin.settings = await api('PUT', '/api/fin/settings', patch);
  emit();
}

// Valores escondidos (olhinho): preferência deste aparelho.
export function valuesHidden() {
  try { return localStorage.getItem('fin-hide') === '1'; } catch { return false; }
}
export function toggleHidden() {
  try { localStorage.setItem('fin-hide', valuesHidden() ? '0' : '1'); } catch { /* ignora */ }
  emit();
}
