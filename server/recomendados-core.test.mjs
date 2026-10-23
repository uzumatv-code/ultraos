import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dadosDaPagina, dadosDaPaginaSocial, dadosDoItem, dadosDoProduto, idAnuncio, imagemMercadoLivre, limparTextosRecomendado, origemClique, paginaSocial,
  promptRecomendado, urlMercadoLivre,
} from './recomendados-core.mjs';

test('links: só https em domínios do Mercado Livre', () => {
  assert.ok(urlMercadoLivre('https://mercadolivre.com/sec/1AbCdEf'));
  assert.ok(urlMercadoLivre('https://meli.la/2xYz'));
  assert.ok(urlMercadoLivre('https://produto.mercadolivre.com.br/MLB-123456789-corda'));
  assert.equal(urlMercadoLivre('http://mercadolivre.com/sec/1AbCdEf'), null);
  assert.equal(urlMercadoLivre('https://mercadolivre.com.br.golpe.com/x'), null);
  assert.equal(urlMercadoLivre('https://falsomercadolivre.com.br/x'), null);
  assert.equal(urlMercadoLivre('javascript:alert(1)'), null);
  assert.equal(urlMercadoLivre(''), null);
});

test('id do anúncio: item, catálogo e item escolhido dentro do catálogo', () => {
  assert.deepEqual(idAnuncio('https://produto.mercadolivre.com.br/MLB-3456789012-encordoamento-daddario-_JM'), { tipo: 'item', id: 'MLB3456789012' });
  assert.deepEqual(idAnuncio('https://www.mercadolivre.com.br/encordoamento-daddario-exl110/p/MLB6085321'), { tipo: 'produto', id: 'MLB6085321' });
  assert.deepEqual(
    idAnuncio('https://www.mercadolivre.com.br/encordoamento/p/MLB6085321?pdp_filters=item_id:MLB4111222333'),
    { tipo: 'item', id: 'MLB4111222333' },
  );
  assert.deepEqual(idAnuncio('https://www.mercadolivre.com.br/x/p/MLB6085321?wid=MLB998877665'), { tipo: 'item', id: 'MLB998877665' });
  assert.deepEqual(
    idAnuncio(`https://www.mercadolivre.com.br/gz/account-verification?go=${encodeURIComponent('https://produto.mercadolivre.com.br/MLB-3456789012-x')}`),
    { tipo: 'item', id: 'MLB3456789012' },
  );
  assert.equal(idAnuncio('https://www.mercadolivre.com.br/gz/account-verification?go=https%3A%2F%2Fgolpe.com%2FMLB-3456789012'), null);
  assert.equal(idAnuncio('https://mercadolivre.com/sec/1AbCdEf'), null);
  assert.equal(idAnuncio('https://outro.com/MLB-3456789012'), null);
});

test('dados da API: item ativo, preço riscado só quando maior e foto do CDN', () => {
  const d = dadosDoItem({
    id: 'MLB1', title: 'Encordoamento D\'Addario EXL110', price: 49.9, original_price: 69.9, status: 'active',
    pictures: [{ secure_url: 'https://http2.mlstatic.com/D_123.jpg' }],
  });
  assert.deepEqual(d, { titulo: 'Encordoamento D\'Addario EXL110', preco: 49.9, preco_de: 69.9, imagem_url: 'https://http2.mlstatic.com/D_123.jpg', disponivel: true });
  assert.equal(dadosDoItem({ id: 'MLB1', price: 10, original_price: 5, status: 'paused' }).preco_de, null);
  assert.equal(dadosDoItem({ id: 'MLB1', price: 10, status: 'paused' }).disponivel, false);
  assert.equal(dadosDoItem({ id: 'MLB1', thumbnail: 'https://golpe.com/x.jpg' }).imagem_url, null);
  assert.equal(dadosDoItem({ error: 'not_found' }), null);
});

test('dados do catálogo: sem vendedor ganhador o preço fica em branco', () => {
  const com = dadosDoProduto({ id: 'MLB6', name: 'Afinador', pictures: [{ url: 'http://http2.mlstatic.com/a.jpg' }], buy_box_winner: { price: 89 } });
  assert.equal(com.preco, 89);
  assert.equal(com.disponivel, true);
  assert.equal(com.imagem_url, 'https://http2.mlstatic.com/a.jpg');
  const sem = dadosDoProduto({ id: 'MLB6', name: 'Afinador', status: 'active' });
  assert.equal(sem.preco, null);
  assert.equal(sem.disponivel, null);
  assert.equal(dadosDoProduto({ id: 'MLB6', status: 'inactive' }).disponivel, false);
});

test('página do anúncio: metatags como plano B', () => {
  const html = `<head><meta property="og:title" content="Capotraste Dunlop &amp; Cia | Mercado Livre">
    <meta property="og:image" content="https://http2.mlstatic.com/D_9.jpg"><meta itemprop="price" content="39.90"></head>`;
  assert.deepEqual(dadosDaPagina(html), { titulo: 'Capotraste Dunlop & Cia', preco: 39.9, preco_de: null, imagem_url: 'https://http2.mlstatic.com/D_9.jpg', disponivel: null });
  assert.equal(dadosDaPagina('<html>captcha</html>'), null);
  assert.equal(imagemMercadoLivre('https://mlstatic.com.golpe.com/x.jpg'), null);
});

test('página social: só /social/<apelido> do Mercado Livre', () => {
  assert.equal(paginaSocial('https://www.mercadolivre.com.br/social/samuel?ref=x'), true);
  assert.equal(paginaSocial('https://www.mercadolivre.com.br/social/samuel/outra'), false);
  assert.equal(paginaSocial('https://golpe.com/social/samuel'), false);
  // Sem o cartão em destaque, as metatags bastam para o nome e a foto (mas sem id do anúncio).
  const so = dadosDaPaginaSocial('<meta property="og:title" content="Capotraste"><meta property="og:image" content="https://http2.mlstatic.com/a.webp">');
  assert.equal(so.dados.titulo, 'Capotraste');
  assert.equal(so.ml, null);
  assert.equal(dadosDaPaginaSocial('<html></html>'), null);
});

test('IA: só campos conhecidos, exige saber o produto e não deixa inventar uso na oficina', () => {
  assert.equal(promptRecomendado({ titulo: 'X' }, ['nada']), null);
  assert.match(promptRecomendado({ titulo: '' }, ['motivo']).erro, /nome do produto/);
  const p = promptRecomendado(
    { titulo: 'Ferro de Solda Sugon A9 Pro 120W', preco: 578.3, link_afiliado: 'https://meli.la/x' },
    ['motivo', 'categoria', 'invalido'],
    { instrucoes: 'usamos na troca de trastes', categorias: ['Ferramentas', 'Cordas'] },
  );
  assert.deepEqual(p.campos, ['motivo', 'categoria']);
  assert.deepEqual(p.schema.required, ['motivo', 'categoria']);
  assert.match(p.sistema, /Só afirme que a oficina usa o produto/);
  assert.match(p.sistema, /Nunca invente/);
  const entrada = JSON.parse(p.entrada);
  assert.equal(entrada.anotacoes_de_quem_cadastra, 'usamos na troca de trastes');
  assert.deepEqual(entrada.categorias_ja_usadas, ['Ferramentas', 'Cordas']);
  assert.equal(entrada.preco, 'R$ 578.30');
  assert.equal(entrada.link_afiliado, undefined, 'o link não vai para a IA');

  const limpo = limparTextosRecomendado({ motivo: '"**Indicamos** para\n quem solda em casa."', categoria: 'Ferramentas', marca: '', extra: 'x' }, ['motivo', 'categoria', 'marca']);
  assert.deepEqual(limpo, { motivo: 'Indicamos para quem solda em casa.', categoria: 'Ferramentas' });
  assert.ok(limparTextosRecomendado({ motivo: 'palavra '.repeat(100) }, ['motivo']).motivo.length <= 400);
});

test('origem do clique', () => {
  assert.equal(origemClique('Vitrine'), 'vitrine');
  assert.equal(origemClique('os-whatsapp'), 'os-whatsapp');
  assert.equal(origemClique('<script>'), 'site');
  assert.equal(origemClique(undefined), 'site');
});
