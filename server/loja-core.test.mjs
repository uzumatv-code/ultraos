import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  mercadoPagoPreference, mercadoPagoSignatureValid, melhorEnvioPayload, normalizeCep, orderStatusFromPayment,
  parseMelhorEnvio, slugify, validateCart,
} from './loja-core.mjs';

const catalogo = new Map([
  ['g1', { id: 'g1', tipo: 'fisico', titulo: 'Guitarra Tagima', preco: 1500, estoque: 1, status: 'publicado', peso_g: 4500, altura_cm: 15, largura_cm: 40, comprimento_cm: 110 }],
  ['c1', { id: 'c1', tipo: 'curso', titulo: 'Regulagem em casa', preco: 97.9, estoque: 0, status: 'publicado' }],
  ['e1', { id: 'e1', tipo: 'ebook', titulo: 'Guia de cordas', preco: 29.9, estoque: 0, status: 'rascunho' }],
]);

test('slug sem acentos e espaços', () => {
  assert.equal(slugify('Guitarra Tagima TG-530 — Seminovo!'), 'guitarra-tagima-tg-530-seminovo');
  assert.equal(normalizeCep('71909-720'), '71909720');
  assert.equal(normalizeCep('123'), null);
});

test('carrinho: preço do banco, estoque, reservas e digitais', () => {
  const ok = validateCart([{ produto_id: 'g1', quantidade: 1 }, { produto_id: 'c1', quantidade: 5 }], catalogo);
  assert.equal(ok.subtotal, 1597.9);
  assert.equal(ok.temFisico, true);
  assert.equal(ok.itens[1].quantidade, 1, 'digital sempre 1');
  assert.match(validateCart([{ produto_id: 'g1', quantidade: 2 }], catalogo).erro, /Só temos 1/);
  assert.match(validateCart([{ produto_id: 'g1', quantidade: 1 }], catalogo, { g1: 1 }).erro, /esgotar/);
  assert.match(validateCart([{ produto_id: 'e1', quantidade: 1 }], catalogo).erro, /não está mais disponível/);
  assert.match(validateCart([], catalogo).erro, /vazio/);
  assert.equal(validateCart([{ produto_id: 'c1', quantidade: 1 }], catalogo).temFisico, false);
});

test('Melhor Envio: só físicos, medidas mínimas e opções ordenadas', () => {
  const { itens } = validateCart([{ produto_id: 'g1', quantidade: 1 }, { produto_id: 'c1', quantidade: 1 }], catalogo);
  const body = melhorEnvioPayload({ cepOrigem: '71909720', cepDestino: '01001000', itens });
  assert.equal(body.products.length, 1);
  assert.equal(body.products[0].weight, 4.5);
  const opcoes = parseMelhorEnvio([
    { id: 1, name: 'PAC', price: '80.50', delivery_time: 8, company: { name: 'Correios' } },
    { id: 2, name: 'SEDEX', price: '150.00', delivery_time: 3, company: { name: 'Correios' } },
    { id: 3, name: 'X', error: 'Indisponível' },
    { id: 4, name: '.Package', price: '70.00', delivery_time: 6, company: { name: 'Jadlog' } },
  ], 1);
  assert.deepEqual(opcoes.map((o) => o.id), ['me:4', 'me:1', 'me:2']);
  assert.equal(opcoes[1].prazo_dias, 9);
});

test('preferência do Mercado Pago com frete e retorno ao site', () => {
  const { itens } = validateCart([{ produto_id: 'g1', quantidade: 1 }], catalogo);
  const pref = mercadoPagoPreference({
    pedido: { id: 'p1', numero: 12 }, itens, frete: 80.5, comprador: { email: 'a@b.com', nome: 'Ana' },
    siteUrl: 'https://luthieriabrasilia.com.br', notificationUrl: 'https://os/x', expiraEm: '2026-10-21T20:00:00.000-03:00',
  });
  assert.equal(pref.external_reference, 'p1');
  assert.equal(pref.shipments.cost, 80.5);
  assert.equal(pref.items[0].unit_price, 1500);
  assert.match(pref.back_urls.success, /pedido=12/);
  const semFrete = mercadoPagoPreference({ pedido: { id: 'p2', numero: 13 }, itens, frete: 0, comprador: {}, siteUrl: 's', notificationUrl: 'n', expiraEm: 'e' });
  assert.equal(semFrete.shipments, undefined);
});

test('assinatura do webhook do Mercado Pago', () => {
  const secret = 'chave';
  const ts = '1700000000';
  const manifest = 'id:123456;request-id:req-1;ts:1700000000;';
  const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const header = `ts=${ts},v1=${v1}`;
  assert.equal(mercadoPagoSignatureValid({ secret, signatureHeader: header, requestId: 'req-1', dataId: '123456' }), true);
  assert.equal(mercadoPagoSignatureValid({ secret, signatureHeader: header, requestId: 'req-2', dataId: '123456' }), false);
  assert.equal(mercadoPagoSignatureValid({ secret: '', signatureHeader: header, requestId: 'req-1', dataId: '123456' }), false);
});

test('status do pedido a partir do pagamento', () => {
  assert.equal(orderStatusFromPayment('approved'), 'pago');
  assert.equal(orderStatusFromPayment('refunded'), 'reembolsado');
  assert.equal(orderStatusFromPayment('rejected'), 'cancelado');
  assert.equal(orderStatusFromPayment('in_process'), 'aguardando_pagamento');
});
