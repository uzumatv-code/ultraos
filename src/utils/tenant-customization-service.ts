const API_BASE = import.meta.env.VITE_API_URL || '';
const SESSION_KEY = 'mysql-auth-session';

export interface DocumentTemplateRecord<TConfig = unknown> {
  id: string;
  name: string;
  document_type: 'service_order';
  config_json: TConfig;
  is_default: boolean;
  version: number;
  created_at?: string;
  updated_at?: string;
}

function authToken() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')?.access_token || '';
  } catch {
    return '';
  }
}

async function authorizedFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  const token = authToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'same-origin' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message || 'Erro de comunicação com a API');
  }
  return response;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Não foi possível ler a imagem'));
    reader.readAsDataURL(blob);
  });
}

export async function loadBrandLogoDataUrl(): Promise<string> {
  try {
    const response = await authorizedFetch('/api/branding/logo', { cache: 'no-store' });
    return await blobToDataUrl(await response.blob());
  } catch (error) {
    if (error instanceof Error && error.message === 'Logo nao cadastrada') return '';
    throw error;
  }
}

export async function uploadBrandLogo(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Use uma imagem PNG, JPEG ou WebP');
  }
  if (file.size > 2 * 1024 * 1024) throw new Error('A logo deve ter no máximo 2 MB');
  await authorizedFetch('/api/branding/logo', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  return blobToDataUrl(file);
}

export async function deleteBrandLogo() {
  await authorizedFetch('/api/branding/logo', { method: 'DELETE' });
}

export async function listDocumentTemplates<TConfig>(): Promise<DocumentTemplateRecord<TConfig>[]> {
  const response = await authorizedFetch('/api/document-templates?type=service_order');
  const payload = await response.json();
  return payload.data || [];
}

export async function saveDocumentTemplate<TConfig>(template: {
  id?: string;
  name: string;
  config_json: TConfig;
  is_default?: boolean;
}): Promise<DocumentTemplateRecord<TConfig>> {
  const response = await authorizedFetch('/api/document-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...template, document_type: 'service_order' }),
  });
  const payload = await response.json();
  return payload.data;
}

export async function deleteDocumentTemplate(id: string) {
  await authorizedFetch(`/api/document-templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
