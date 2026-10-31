import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { isPrivateUploadPath, resolveStoragePath } from './uploads-core.mjs';

const uploadsDir = path.resolve('uploads-teste');
const resolve = (bucket, filePath, ownerIds = ['conta-a', 'usuario-a']) => resolveStoragePath({ uploadsDir, bucket, filePath, ownerIds });

test('bloqueia pastas privadas mesmo com a URL disfarçada', () => {
  for (const url of [
    '/privado/ebooks/a.pdf', '/certificados/x/certificado.pfx', '/%70rivado/ebooks/a.pdf', '/%63ertificados/x.pfx',
    '/PRIVADO/a.pdf', '//privado/a.pdf', '/%2fprivado/a.pdf', '/loja/../privado/a.pdf', '/loja/%2e%2e/privado/a.pdf',
    '/loja/..%2fprivado/a.pdf', '/loja\\..\\privado\\a.pdf', '/./privado/a.pdf', '/%ZZ/a.pdf', '/a%00.pdf',
  ]) {
    assert.equal(isPrivateUploadPath(url), true, url);
  }
});

test('mantém liberadas as imagens públicas da loja', () => {
  for (const url of ['/loja/produto/foto.webp', '/loja/recomendados/foto.jpg', '/privado-nao.png']) {
    assert.equal(isPrivateUploadPath(url), false, url);
  }
});

test('aceita certificado na pasta da conta ou do próprio usuário', () => {
  assert.equal(resolve('certificados', 'conta-a/certificado.pfx')?.path, 'conta-a/certificado.pfx');
  assert.equal(resolve('certificados', 'usuario-a/certificado.P12')?.path, 'usuario-a/certificado.P12');
});

test('recusa a pasta de outra conta, inclusive por travessia', () => {
  for (const filePath of ['conta-b/certificado.pfx', 'conta-a/../conta-b/certificado.pfx', '../loja/certificado.pfx', 'conta-a\\..\\conta-b\\certificado.pfx']) {
    assert.equal(resolve('certificados', filePath), null, filePath);
  }
});

test('recusa arquivo solto na raiz do bucket e extensão não permitida', () => {
  assert.equal(resolve('certificados', 'certificado.pfx'), null);
  assert.equal(resolve('certificados', 'conta-a/pagina.html'), null);
  assert.equal(resolve('certificados', 'conta-a/imagem.svg'), null);
});

test('recusa bucket desconhecido', () => {
  for (const bucket of ['loja', 'privado', 'constructor', '__proto__']) {
    assert.equal(resolve(bucket, 'conta-a/certificado.pfx'), null, bucket);
  }
});
