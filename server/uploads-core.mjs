/**
 * Regras da pasta /uploads.
 *
 * Pastas privadas nunca saem pela rota pública, e o que sai vai com PUBLIC_UPLOAD_HEADERS. A rota
 * de storage aceita apenas os buckets listados aqui, sempre dentro da pasta da própria conta.
 */

import path from 'node:path';

const PRIVATE_UPLOAD_DIRS = new Set(['certificados', 'privado']);
const STORAGE_BUCKETS = { certificados: new Set(['.pfx', '.p12']) };

// Um HTML ou SVG enviado não pode rodar script no domínio do sistema, onde fica o token de sessão.
export const PUBLIC_UPLOAD_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'X-Content-Type-Options': 'nosniff',
};

/**
 * O express.static decodifica a URL depois do roteamento, então a comparação precisa ser feita
 * sobre o caminho já decodificado e normalizado: /uploads/%70rivado cairia em /uploads/privado.
 */
export function isPrivateUploadPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(urlPath || ''));
  } catch {
    return true;
  }
  if (decoded.includes('\0')) return true;
  const [first = ''] = path.posix.normalize(`/${decoded.replaceAll('\\', '/')}`).split('/').filter(Boolean);
  return PRIVATE_UPLOAD_DIRS.has(first.toLowerCase());
}

/**
 * Resolve o destino de um arquivo do storage, ou null se não for permitido. A primeira pasta do
 * caminho precisa ser a conta (ou o próprio usuário, formato legado de quem envia pela tela fiscal).
 */
export function resolveStoragePath({ uploadsDir, bucket, filePath, ownerIds }) {
  const extensions = Object.hasOwn(STORAGE_BUCKETS, bucket) ? STORAGE_BUCKETS[bucket] : null;
  const cleanPath = String(filePath || '').replaceAll('\\', '/').replace(/^\/+/, '');
  if (!extensions || !cleanPath || cleanPath.includes('\0')) return null;

  const bucketDir = path.resolve(uploadsDir, bucket);
  const target = path.resolve(bucketDir, cleanPath);
  if (!target.startsWith(`${bucketDir}${path.sep}`)) return null;

  const segments = path.relative(bucketDir, target).split(path.sep);
  if (segments.length < 2 || !ownerIds.includes(segments[0])) return null;
  if (!extensions.has(path.extname(target).toLowerCase())) return null;
  return { target, path: segments.join('/') };
}
