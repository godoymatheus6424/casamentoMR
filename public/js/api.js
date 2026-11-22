let csrf = null;
let workspaceId = null;
export const setCsrf = (t) => { csrf = t; };
// Casamento mostrado nesta aba: o servidor recusa o pedido se a sessão estiver em outro (troca feita em outra aba).
export const setWorkspace = (id) => { workspaceId = id || null; };

export async function api(method, url, body, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  let payload;
  if (body instanceof Blob) {
    payload = body;
    headers['Content-Type'] = body.type || 'application/octet-stream';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
  if (workspaceId) headers['X-Workspace'] = workspaceId;

  let res;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw Object.assign(new Error('Sem conexão com o servidor. Verifique a internet / Wi-Fi.'), { status: 0 });
  }
  let data = null;
  if ((res.headers.get('content-type') || '').includes('json')) data = await res.json().catch(() => null);
  if (res.status === 401 && !opts.allow401) window.dispatchEvent(new Event('auth:expired'));
  if (res.status === 402) window.dispatchEvent(new Event('plan:blocked'));
  if (res.status === 409 && data?.code === 'workspace_changed') window.dispatchEvent(new Event('workspace:changed'));
  if (!res.ok) throw Object.assign(new Error(data?.error || `Erro ${res.status}`), { status: res.status });
  return data;
}
