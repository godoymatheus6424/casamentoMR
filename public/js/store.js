import { api } from './api.js';

export const COLLS = ['vendors', 'payments', 'budget', 'tasks', 'guests', 'tables', 'timeline', 'gifts', 'notes'];

export const state = {
  user: null,
  users: [],
  settings: {},
  items: Object.fromEntries(COLLS.map((c) => [c, []])),
  files: [],
  maxUploadMb: 25,
  loadedAt: 0,
};

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit() { for (const fn of [...listeners]) fn(); }

export async function loadAll() {
  const d = await api('GET', '/api/data');
  state.settings = d.settings || {};
  for (const c of COLLS) state.items[c] = d.items[c] || [];
  state.files = d.files || [];
  state.users = d.users || [];
  state.loadedAt = Date.now();
  emit();
}

export const byId = (coll, id) => state.items[coll].find((x) => x.id === id);

export async function create(coll, data) {
  const it = await api('POST', `/api/items/${coll}`, data);
  state.items[coll].push(it);
  emit();
  return it;
}
export async function bulkCreate(coll, list) {
  if (!list.length) return [];
  const created = await api('POST', `/api/items/${coll}/bulk`, { items: list });
  state.items[coll].push(...created);
  emit();
  return created;
}
export async function update(coll, id, patch, { silent = false } = {}) {
  const it = await api('PUT', `/api/items/${coll}/${id}`, patch);
  const arr = state.items[coll];
  const i = arr.findIndex((x) => x.id === id);
  if (i >= 0) arr[i] = it; else arr.push(it);
  if (!silent) emit();
  return it;
}
export async function updateMany(coll, ids, patchFn) {
  for (const id of ids) await update(coll, id, patchFn(id), { silent: true });
  emit();
}
export async function remove(coll, id) {
  const r = await api('DELETE', `/api/items/${coll}/${id}`);
  if (r?.cascaded) { await loadAll(); return; }
  state.items[coll] = state.items[coll].filter((x) => x.id !== id);
  emit();
}
export async function saveSettings(patch) {
  state.settings = await api('PUT', '/api/settings', patch);
  emit();
}

export async function uploadFile(file, { category = 'outros', vendorId = '', note = '' } = {}) {
  if (file.size > state.maxUploadMb * 1024 * 1024) throw new Error(`"${file.name}" é maior que ${state.maxUploadMb} MB.`);
  const meta = await api('POST', '/api/files', file, {
    headers: {
      'X-File-Name': encodeURIComponent(file.name),
      'X-Category': category,
      'X-Vendor-Id': vendorId || '',
      'X-Note': encodeURIComponent(note || ''),
    },
  });
  state.files.unshift(meta);
  emit();
  return meta;
}
export async function updateFile(id, patch) {
  const meta = await api('PUT', `/api/files/${id}`, patch);
  const i = state.files.findIndex((f) => f.id === id);
  if (i >= 0) state.files[i] = meta;
  emit();
  return meta;
}
export async function deleteFile(id) {
  await api('DELETE', `/api/files/${id}`);
  state.files = state.files.filter((f) => f.id !== id);
  emit();
}
