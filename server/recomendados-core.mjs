// Regras puras dos recomendados (links de afiliado do Mercado Livre): links aceitos, id do anúncio,
// leitura dos dados do anúncio (API ou página) e origem dos cliques.

/** Domínios do Mercado Livre aceitos no link de afiliado e no anúncio (evita redirecionar o cliente para fora). */
export const DOMINIOS_ML = ['mercadolivre.com.br', 'mercadolivre.com', 'mercadolibre.com', 'meli.la'];

const hostDe = (dominio, host) => host === dominio || host.endsWith(`.${dominio}`);

/** URL https de um domínio do Mercado Livre, ou null. */
export function urlMercadoLivre(valor) {
  try {
    const url = new URL(String(valor || '').trim());
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    return DOMINIOS_ML.some((d) => hostDe(d, host)) ? url : null;
  } catch {
    return null;
  }
}

/** Fotos dos anúncios só são baixadas do CDN do Mercado Livre. */
export function imagemMercadoLivre(valor) {
  try {
    const url = new URL(String(valor || '').trim().replace(/^http:/, 'https:'));
    return url.protocol === 'https:' && hostDe('mlstatic.com', url.hostname.toLowerCase()) ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Id do anúncio a partir do link: anúncio comum (MLB-123… → item) ou página de catálogo (/p/MLB123 → produto).
 * Um item escolhido dentro do catálogo (item_id / wid) tem preferência, porque é o anúncio que o cliente vai ver.
 */
export function idAnuncio(valor) {
  const url = urlMercadoLivre(valor);
  if (!url) return null;
  const doFiltro = `${url.searchParams.get('pdp_filters') || ''} ${url.searchParams.get('item_id') || ''} ${url.searchParams.get('wid') || ''}`
    .match(/MLB-?(\d{6,})/i);
  if (doFiltro) return { tipo: 'item', id: `MLB${doFiltro[1]}` };
  const catalogo = url.pathname.match(/\/p\/MLB-?(\d{6,})/i);
  if (catalogo) return { tipo: 'produto', id: `MLB${catalogo[1]}` };
  const item = url.pathname.match(/MLB-?(\d{6,})/i);
  return item ? { tipo: 'item', id: `MLB${item[1]}` } : null;
}

const preco = (v) => (Number(v) > 0 ? Math.round(Number(v) * 100) / 100 : null);

/** Resposta de GET /items/{id}. */
export function dadosDoItem(item) {
  if (!item || typeof item !== 'object' || !item.id) return null;
  return {
    titulo: String(item.title || '').slice(0, 200) || null,
    preco: preco(item.price),
    preco_de: preco(item.original_price) && preco(item.original_price) > preco(item.price) ? preco(item.original_price) : null,
    imagem_url: imagemMercadoLivre(item.pictures?.[0]?.secure_url || item.pictures?.[0]?.url || item.thumbnail),
    disponivel: item.status ? item.status === 'active' : null,
  };
}

/** Resposta de GET /products/{id} (página de catálogo). Sem vendedor ganhador, o produto está sem oferta. */
export function dadosDoProduto(produto) {
  if (!produto || typeof produto !== 'object' || !produto.id) return null;
  const ganhador = produto.buy_box_winner;
  return {
    titulo: String(produto.name || '').slice(0, 200) || null,
    preco: preco(ganhador?.price),
    preco_de: preco(ganhador?.original_price) && preco(ganhador?.original_price) > preco(ganhador?.price) ? preco(ganhador.original_price) : null,
    imagem_url: imagemMercadoLivre(produto.pictures?.[0]?.url),
    disponivel: produto.status === 'inactive' ? false : ganhador ? true : null,
  };
}

const entidades = (texto) => texto
  .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function meta(html, nome) {
  const tag = html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${nome}["'][^>]*>`, 'i'))?.[0];
  const valor = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return valor ? entidades(valor).trim() : null;
}

/** Plano B quando a API não responde: título, foto e preço das metatags da página do anúncio. */
export function dadosDaPagina(html) {
  const texto = String(html || '');
  if (!texto) return null;
  const titulo = meta(texto, 'og:title')?.replace(/\s*[|-]\s*Mercado Livre.*$/i, '');
  const valor = meta(texto, 'price') || meta(texto, 'product:price:amount') || texto.match(/"price"\s*:\s*"?(\d+(?:\.\d+)?)/)?.[1];
  const dados = {
    titulo: titulo ? titulo.slice(0, 200) : null,
    preco: preco(valor),
    preco_de: null,
    imagem_url: imagemMercadoLivre(meta(texto, 'og:image')),
    disponivel: null,
  };
  return dados.titulo || dados.imagem_url ? dados : null;
}

/** Origem do clique (vitrine, os, whatsapp…): curta e sem caracteres estranhos, para os relatórios. */
export function origemClique(valor) {
  const origem = String(valor || '').toLowerCase().trim();
  return /^[a-z0-9-]{1,30}$/.test(origem) ? origem : 'site';
}
