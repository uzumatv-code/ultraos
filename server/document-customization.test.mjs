import assert from 'node:assert/strict';
import test from 'node:test';
import { detectImageMime, normalizeDocumentConfig } from './document-customization.mjs';

test('normaliza apenas propriedades e blocos permitidos', () => {
  const result = normalizeDocumentConfig({
    pageOrientation: 'landscape',
    primaryColor: 'javascript:alert(1)',
    fontFamily: 'Comic Sans',
    logoPosition: 'outside',
    borderRadius: 999,
    blocks: [
      { id: '../header', type: 'header', title: ' Cabeçalho ', visible: true, content: '<script>' },
      { id: '../header', type: 'custom_text', title: 'Texto', visible: false, content: 'x'.repeat(4000) },
    ],
  });

  assert.equal(result.pageOrientation, 'landscape');
  assert.equal(result.primaryColor, '#4f46e5');
  assert.equal(result.fontFamily, 'Arial');
  assert.equal(result.logoPosition, 'left');
  assert.equal(result.borderRadius, 16);
  assert.equal(result.blocks[0].id, 'header');
  assert.notEqual(result.blocks[0].id, result.blocks[1].id);
  assert.equal(result.blocks[0].content, '');
  assert.equal(result.blocks[1].content.length, 3000);
});

test('rejeita documento sem blocos e tipos arbitrarios', () => {
  assert.throws(() => normalizeDocumentConfig({ blocks: [] }), /pelo menos um bloco/);
  assert.throws(() => normalizeDocumentConfig({ blocks: [{ type: 'html', content: '<script>' }] }), /Bloco de documento invalido/);
});

test('identifica imagem pelo conteudo e nao pelo Content-Type informado', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const webp = Buffer.from('RIFF0000WEBP', 'ascii');
  assert.equal(detectImageMime(png), 'image/png');
  assert.equal(detectImageMime(jpeg), 'image/jpeg');
  assert.equal(detectImageMime(webp), 'image/webp');
  assert.equal(detectImageMime(Buffer.from('<svg><script/></svg>')), null);
});
