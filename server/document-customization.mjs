import crypto from 'node:crypto';

const DOCUMENT_BLOCK_TYPES = new Set([
  'header', 'customer', 'equipment', 'diagnostic', 'pricing', 'dates',
  'notes', 'custom_text', 'signature', 'footer',
]);
const DOCUMENT_FONTS = new Set(['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana']);

function documentColor(value, fallback) {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

export function normalizeDocumentConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Configuracao do documento invalida');
  }
  const rawBlocks = Array.isArray(value.blocks) ? value.blocks.slice(0, 30) : [];
  const seen = new Set();
  const blocks = rawBlocks.map((block) => {
    const type = String(block?.type || '');
    if (!DOCUMENT_BLOCK_TYPES.has(type)) throw new Error(`Bloco de documento invalido: ${type || 'sem tipo'}`);
    let id = String(block?.id || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || crypto.randomUUID();
    while (seen.has(id)) id = crypto.randomUUID();
    seen.add(id);
    return {
      id,
      type,
      title: String(block?.title || '').trim().slice(0, 100),
      content: type === 'custom_text' ? String(block?.content || '').slice(0, 3000) : '',
      visible: block?.visible !== false,
    };
  });
  if (!blocks.length) throw new Error('O documento precisa ter pelo menos um bloco');
  return {
    schemaVersion: 1,
    pageOrientation: value.pageOrientation === 'landscape' ? 'landscape' : 'portrait',
    primaryColor: documentColor(value.primaryColor, '#4f46e5'),
    accentColor: documentColor(value.accentColor, '#eef2ff'),
    textColor: documentColor(value.textColor, '#111827'),
    mutedColor: documentColor(value.mutedColor, '#6b7280'),
    fontFamily: DOCUMENT_FONTS.has(value.fontFamily) ? value.fontFamily : 'Arial',
    logoPosition: ['left', 'center', 'right'].includes(value.logoPosition) ? value.logoPosition : 'left',
    borderRadius: Math.min(16, Math.max(0, Number(value.borderRadius) || 0)),
    showBorders: value.showBorders !== false,
    footerText: String(value.footerText || '').slice(0, 500),
    blocks,
  };
}

export function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
