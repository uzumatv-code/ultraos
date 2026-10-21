// Regras puras da loja (sem banco): slugs, totais, frete do Melhor Envio, preferência do Mercado Pago
// e validação da assinatura dos avisos (webhooks) do Mercado Pago.
import crypto from 'node:crypto';

export const TIPOS = ['fisico', 'curso', 'ebook'];
export const STATUS_PRODUTO = ['rascunho', 'publicado', 'esgotado', 'arquivado'];
export const STATUS_PEDIDO = ['aguardando_pagamento', 'pago', 'em_separacao', 'enviado', 'entregue', 'cancelado', 'reembolsado', 'expirado'];

export function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

export const money = (value) => Math.round(Number(value || 0) * 100) / 100;

export function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function normalizeCep(value) {
  const cep = onlyDigits(value);
  return cep.length === 8 ? cep : null;
}

/** Preço efetivo: o promocional não existe mais; "preco" é o que vale e "preco_de" é o riscado. */
export function itemTotals(items) {
  const subtotal = money(items.reduce((s, i) => s + money(i.preco_unit) * Number(i.quantidade), 0));
  return { subtotal };
}

/**
 * Valida os itens pedidos contra o catálogo.
 * @param {{produto_id:string, quantidade:number}[]} pedidos
 * @param {Map<string, object>} catalogo produtos por id
 * @param {Record<string, number>} reservados unidades em pedidos aguardando pagamento
 */
export function validateCart(pedidos, catalogo, reservados = {}) {
  if (!Array.isArray(pedidos) || pedidos.length === 0) return { erro: 'Carrinho vazio.' };
  if (pedidos.length > 30) return { erro: 'Carrinho com itens demais.' };
  const itens = [];
  for (const p of pedidos) {
    const produto = catalogo.get(String(p.produto_id));
    if (!produto || produto.status !== 'publicado') return { erro: 'Um dos produtos não está mais disponível.' };
    const digital = produto.tipo !== 'fisico';
    const quantidade = digital ? 1 : Math.floor(Number(p.quantidade));
    if (!Number.isFinite(quantidade) || quantidade < 1 || quantidade > 20) return { erro: 'Quantidade inválida.' };
    if (!digital) {
      const disponivel = Number(produto.estoque || 0) - Number(reservados[produto.id] || 0);
      if (quantidade > disponivel) {
        return { erro: disponivel > 0 ? `Só temos ${disponivel} unidade(s) de ${produto.titulo}.` : `${produto.titulo} acabou de esgotar.` };
      }
    }
    if (itens.some((i) => i.produto_id === produto.id)) return { erro: 'Produto repetido no carrinho.' };
    itens.push({ produto_id: produto.id, tipo: produto.tipo, titulo: produto.titulo, preco_unit: money(produto.preco), quantidade, produto });
  }
  return { itens, temFisico: itens.some((i) => i.tipo === 'fisico'), ...itemTotals(itens) };
}

// ---------- Melhor Envio ----------

/** Corpo do cálculo de frete: um volume por produto físico (instrumentos vão em caixa própria). */
export function melhorEnvioPayload({ cepOrigem, cepDestino, itens }) {
  return {
    from: { postal_code: cepOrigem },
    to: { postal_code: cepDestino },
    products: itens
      .filter((i) => i.tipo === 'fisico')
      .map((i) => ({
        id: i.produto_id,
        width: Math.max(11, Number(i.produto.largura_cm) || 11),
        height: Math.max(2, Number(i.produto.altura_cm) || 2),
        length: Math.max(16, Number(i.produto.comprimento_cm) || 16),
        weight: Math.max(0.1, (Number(i.produto.peso_g) || 300) / 1000),
        insurance_value: money(i.preco_unit),
        quantity: i.quantidade,
      })),
    options: { receipt: false, own_hand: false },
  };
}

/** Converte a resposta do Melhor Envio em opções de frete válidas, da mais barata para a mais cara. */
export function parseMelhorEnvio(resposta, prazoPostagemDias = 1) {
  if (!Array.isArray(resposta)) return [];
  return resposta
    .filter((s) => !s.error && s.price && s.id)
    .map((s) => ({
      id: `me:${s.id}`,
      nome: `${s.company?.name ? `${s.company.name} ` : ''}${s.name}`.trim(),
      preco: money(s.custom_price ?? s.price),
      prazo_dias: Number(s.custom_delivery_time ?? s.delivery_time ?? 0) + Number(prazoPostagemDias || 0),
    }))
    .sort((a, b) => a.preco - b.preco);
}

// ---------- Mercado Pago ----------

export function mercadoPagoPreference({ pedido, itens, frete, comprador, siteUrl, notificationUrl, expiraEm }) {
  return {
    items: itens.map((i) => ({
      id: i.produto_id,
      title: i.titulo.slice(0, 250),
      quantity: i.quantidade,
      unit_price: money(i.preco_unit),
      currency_id: 'BRL',
      category_id: i.tipo === 'fisico' ? 'others' : 'learnings',
    })),
    ...(frete > 0 ? { shipments: { cost: money(frete), mode: 'not_specified' } } : {}),
    payer: { email: comprador.email || undefined, name: comprador.nome || undefined },
    external_reference: pedido.id,
    notification_url: notificationUrl,
    back_urls: {
      success: `${siteUrl}/minha-conta?aba=pedidos&pedido=${pedido.numero}`,
      pending: `${siteUrl}/minha-conta?aba=pedidos&pedido=${pedido.numero}`,
      failure: `${siteUrl}/carrinho?pagamento=falhou`,
    },
    auto_return: 'approved',
    statement_descriptor: 'SERVICOSPRIME',
    expires: true,
    expiration_date_to: expiraEm,
    payment_methods: { installments: 12 },
  };
}

/**
 * Valida o cabeçalho x-signature dos avisos do Mercado Pago.
 * Manifesto: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" assinado com a chave secreta do webhook.
 */
export function mercadoPagoSignatureValid({ secret, signatureHeader, requestId, dataId }) {
  if (!secret || !signatureHeader) return false;
  const parts = Object.fromEntries(String(signatureHeader).split(',').map((p) => p.trim().split('=')));
  if (!parts.ts || !parts.v1) return false;
  const id = /^[a-z0-9]+$/i.test(String(dataId || '')) ? String(dataId).toLowerCase() : String(dataId || '');
  let manifest = '';
  if (id) manifest += `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${parts.ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(parts.v1));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Estado do pedido a partir do status do pagamento no Mercado Pago. */
export function orderStatusFromPayment(status) {
  if (status === 'approved') return 'pago';
  if (status === 'refunded' || status === 'charged_back') return 'reembolsado';
  if (status === 'cancelled' || status === 'rejected') return 'cancelado';
  return 'aguardando_pagamento';
}

/** Transições permitidas manualmente no painel. */
export const TRANSICOES_PAINEL = {
  pago: ['em_separacao', 'enviado', 'entregue', 'cancelado'],
  em_separacao: ['enviado', 'entregue', 'cancelado'],
  enviado: ['entregue'],
  aguardando_pagamento: ['cancelado'],
};

// ---------- Textos com IA ----------

/** Campos que a IA pode escrever, com o limite de cada um (o mesmo das colunas). */
export const CAMPOS_IA = {
  subtitulo: { max: 300, regra: 'Resumo de uma frase (até 140 caracteres) que aparece abaixo do nome. Destaque o principal motivo para comprar.' },
  descricao: { max: 4000, regra: 'Descrição da página do produto, 2 a 4 parágrafos curtos separados por linha em branco, sem markdown, sem emojis, sem listas com símbolos. Explique para quem é, o que tem de bom e o que vem junto, só com o que foi informado.' },
  seo_titulo: { max: 60, regra: 'Título para o Google com no máximo 60 caracteres, com o termo que as pessoas buscam (tipo do instrumento, marca, modelo) e, se couber, "Brasília".' },
  seo_descricao: { max: 155, regra: 'Descrição para o Google com 120 a 155 caracteres, convidativa, com o principal benefício e uma chamada (ex.: retire em Águas Claras ou receba em casa; acesso imediato para cursos e ebooks).' },
  laudo: { max: 2000, regra: 'Reescreva as anotações da oficina sobre o estado do seminovo em texto claro e honesto para o comprador, em parágrafos curtos. Use somente o que está nas anotações: não acrescente reparos, medidas, estado ou garantias que não estejam escritos.' },
};

const TIPO_TEXTO = { fisico: 'produto físico (instrumento musical ou acessório)', curso: 'curso em vídeo online', ebook: 'ebook em PDF' };

/** Monta as instruções e os dados enviados à IA para gerar os textos de um produto. */
export function promptTextosProduto(produto, campos, { instrucoes = '', aulas = [] } = {}) {
  const pedidos = campos.filter((c) => CAMPOS_IA[c]);
  if (!pedidos.length) return null;
  if (pedidos.includes('laudo') && !String(produto.laudo || '').trim()) return { erro: 'Escreva antes as anotações da oficina no laudo; a IA só melhora o texto, sem inventar o estado da peça.' };
  const dados = {
    tipo: TIPO_TEXTO[produto.tipo] || produto.tipo,
    nome: produto.titulo,
    condicao: produto.condicao || undefined,
    marca: produto.marca || undefined,
    categoria: produto.categoria || undefined,
    preco: produto.preco ? `R$ ${Number(produto.preco).toFixed(2)}` : undefined,
    garantia: produto.garantia || undefined,
    resumo_atual: produto.subtitulo || undefined,
    descricao_atual: produto.descricao || undefined,
    anotacoes_laudo: produto.laudo || undefined,
    carga_horaria: produto.carga_horaria || undefined,
    paginas: produto.ebook_paginas || undefined,
    aulas: aulas.length ? aulas.map((a) => `${a.modulo ? `${a.modulo}: ` : ''}${a.titulo}`).slice(0, 60) : undefined,
  };
  const sistema = [
    'Você escreve textos de venda para a loja online da Serviços Prime Luthieria, oficina de luthieria em Águas Claras, Brasília (DF).',
    'Escreva em português do Brasil, tom profissional, direto e confiável, como um luthier experiente falando com um músico.',
    'Regra principal: use apenas os fatos informados nos dados e o que for claramente visível na foto. Nunca invente especificações técnicas, ano, origem, madeiras, captadores, medidas, estado de conservação, garantia, brindes ou prazos.',
    'Se faltar informação, escreva de forma geral em vez de supor. Não use exageros ("o melhor do mercado"), nem preço no texto.',
    'Campos pedidos:',
    ...pedidos.map((c) => `- ${c}: ${CAMPOS_IA[c].regra}`),
    instrucoes ? `Pedido extra de quem cadastra: ${String(instrucoes).slice(0, 500)}` : '',
  ].filter(Boolean).join('\n');
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: pedidos,
    properties: Object.fromEntries(pedidos.map((c) => [c, { type: 'string' }])),
  };
  return { sistema, entrada: JSON.stringify(dados, null, 2), schema, campos: pedidos };
}

/** Limpa a resposta da IA: só os campos pedidos, sem markdown e dentro do limite de cada coluna. */
export function limparTextosIA(resposta, campos) {
  const out = {};
  for (const c of campos) {
    let texto = String(resposta?.[c] ?? '').replace(/\*\*|__|^#+\s*/gm, '').replace(/\r/g, '').trim();
    if (c === 'seo_titulo' || c === 'subtitulo' || c === 'seo_descricao') texto = texto.replace(/\s+/g, ' ').replace(/^["']|["']$/g, '');
    const max = CAMPOS_IA[c].max;
    if (texto.length > max) texto = `${texto.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
    if (texto) out[c] = texto;
  }
  return out;
}
