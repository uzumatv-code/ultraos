const API_BASE = import.meta.env.VITE_API_URL || '';

function authToken() {
  try {
    return JSON.parse(localStorage.getItem('mysql-auth-session') || 'null')?.access_token || '';
  } catch {
    return '';
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = authToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message || 'Não foi possível concluir a operação');
  return json.data as T;
}
