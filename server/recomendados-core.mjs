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
  // Tela de verificação do ML (…/account-verification?go=<anúncio>): o anúncio está no parâmetro "go".
  const destino = url.searchParams.get('go');
  if (destino && urlMercadoLivre(destino)) return idAnuncio(destino);
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

/** Página social de afiliado (/social/<apelido>?ref=…): é para onde os links meli.la levam. */
export function paginaSocial(valor) {
  const url = urlMercadoLivre(valor);
  return Boolean(url && /^\/social\/[^/]+\/?$/i.test(url.pathname));
}

const textoJson = (bruto) => {
  try { return JSON.parse(`"${bruto}"`); } catch { return bruto; }
};

/**
 * Produto compartilhado pelo link de afiliado. A página social abre sem login e traz o produto em destaque
 * no cartão "card-featured" (anúncio, catálogo, título, preço e foto); as metatags og:* servem de reserva.
 */
export function dadosDaPaginaSocial(html) {
  const texto = String(html || '');
  // Só o primeiro cartão do destaque: os seguintes são outras recomendações, com outros preços.
  const destaque = texto.indexOf('"id":"card-featured"');
  const inicio = destaque >= 0 ? texto.indexOf('"metadata":{"id"', destaque) : -1;
  const fim = inicio >= 0 ? texto.indexOf('"unique_id"', inicio) : -1;
  const bloco = inicio >= 0 ? texto.slice(inicio, fim > inicio ? fim : inicio + 8000) : '';
  const item = bloco.match(/"metadata":\{"id":"(MLB\d{6,})"/)?.[1];
  const produto = bloco.match(/"product_id":"(MLB\d{6,})"/)?.[1];
  const titulo = bloco.match(/"title":\{"text":"((?:[^"\\]|\\.)*)"/)?.[1];
  const foto = bloco.match(/"pictures":\[\{"id":"([\w-]+)"/)?.[1];
  const caminho = bloco.match(/"url":"((?:www\.)?mercadolivre\.com\.br(?:[^"\\]|\\.)*)"/)?.[1];
  const dados = {
    titulo: (titulo ? textoJson(titulo) : meta(texto, 'og:title'))?.slice(0, 200) || null,
    preco: preco(bloco.match(/"current_price":\{"value":([\d.]+)/)?.[1]),
    preco_de: null,
    imagem_url: imagemMercadoLivre(foto ? `https://http2.mlstatic.com/D_NQ_NP_${foto}-O.webp` : meta(texto, 'og:image')),
    disponivel: null,
  };
  const anterior = preco(bloco.match(/"previous_price":\{"value":([\d.]+)/)?.[1]);
  if (anterior && dados.preco && anterior > dados.preco) dados.preco_de = anterior;
  if (!item && !dados.titulo) return null;
  const urlAnuncio = caminho ? urlMercadoLivre(`https://${textoJson(caminho).split(/[?#]/)[0]}`)?.toString() || null : null;
  return {
    dados,
    ml: item ? { tipo: 'item', id: item } : produto ? { tipo: 'produto', id: produto } : null,
    url_anuncio: urlAnuncio,
  };
}

// ---------- Textos com IA ----------

/** Campos da indicação que a IA pode escrever, com o limite de cada um (o mesmo das colunas). */
export const CAMPOS_IA_RECOMENDADO = {
  titulo: { max: 200, regra: 'Nome curto e claro para o cartão da vitrine, com até 70 caracteres: tipo do produto, marca e modelo. Tire excesso de palavras-chave do anúncio; mantenha voltagem, medida ou cor só se mudarem a escolha.' },
  motivo: { max: 400, regra: 'Por que a oficina recomenda: 1 ou 2 frases, até 220 caracteres, na primeira pessoa do plural ("indicamos", "usamos"), como um luthier falando com um músico. Diga para que serve e para quem é indicado. Só afirme que a oficina usa o produto na bancada, ou qualquer experiência própria, se as anotações de quem cadastra disserem isso.' },
  categoria: { max: 100, regra: 'Uma categoria curta, no plural e com inicial maiúscula (ex.: Cordas, Afinadores, Ferramentas, Limpeza, Acessórios, Cabos). Se uma das categorias já usadas servir, use exatamente ela.' },
  marca: { max: 100, regra: 'Só o nome da marca do produto, se aparecer no nome do anúncio ou na foto. Se não der para saber, devolva texto vazio.' },
};

/** Monta as instruções e os dados enviados à IA para escrever os campos de uma indicação. */
export function promptRecomendado(item, campos, { instrucoes = '', categorias = [] } = {}) {
  const pedidos = campos.filter((c) => CAMPOS_IA_RECOMENDADO[c]);
  if (!pedidos.length) return null;
  if (!String(item.titulo || '').trim() && !item.imagem) return { erro: 'Busque os dados no Mercado Livre ou escreva o nome do produto antes: a IA precisa saber o que é.' };
  const dados = {
    nome_no_anuncio: item.titulo || undefined,
    marca: item.marca || undefined,
    categoria: item.categoria || undefined,
    preco: item.preco ? `R$ ${Number(item.preco).toFixed(2)}` : undefined,
    motivo_atual: item.motivo || undefined,
    anotacoes_de_quem_cadastra: String(instrucoes || '').trim().slice(0, 500) || undefined,
    categorias_ja_usadas: categorias.length ? categorias.slice(0, 30) : undefined,
  };
  const sistema = [
    'Você escreve as indicações da página "Recomendamos" da Serviços Prime Luthieria, oficina de luthieria em Águas Claras, Brasília (DF).',
    'São produtos vendidos no Mercado Livre que a oficina indica para músicos cuidarem do instrumento (cordas, ferramentas, limpeza, acessórios).',
    'Escreva em português do Brasil, tom direto e confiável. Sem emojis, sem markdown, sem exageros ("o melhor do mercado"), sem preço no texto.',
    'Regra principal: use apenas o que está nos dados e o que for claramente visível na foto. Nunca invente especificações, garantias ou que a oficina já usou o produto.',
    'Campos pedidos:',
    ...pedidos.map((c) => `- ${c}: ${CAMPOS_IA_RECOMENDADO[c].regra}`),
  ].join('\n');
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: pedidos,
    properties: Object.fromEntries(pedidos.map((c) => [c, { type: 'string' }])),
  };
  return { sistema, entrada: JSON.stringify(dados, null, 2), schema, campos: pedidos };
}

/** Limpa a resposta da IA: só os campos pedidos, em uma linha, sem markdown e dentro do limite de cada coluna. */
export function limparTextosRecomendado(resposta, campos) {
  const out = {};
  for (const c of campos) {
    if (!CAMPOS_IA_RECOMENDADO[c]) continue;
    let texto = String(resposta?.[c] ?? '').replace(/\*\*|__|^#+\s*/gm, '').replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '');
    const max = CAMPOS_IA_RECOMENDADO[c].max;
    if (texto.length > max) texto = `${texto.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
    if (texto) out[c] = texto;
  }
  return out;
}

/** Origem do clique (vitrine, os, whatsapp…): curta e sem caracteres estranhos, para os relatórios. */
export function origemClique(valor) {
  const origem = String(valor || '').toLowerCase().trim();
  return /^[a-z0-9-]{1,30}$/.test(origem) ? origem : 'site';
}
