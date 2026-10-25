import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStatement, describeLine, parseAmount, parseCsv, parseDate, parseOfx, parseStatement } from './extrato-core.mjs';

const inferExpense = (text) => (/posto/i.test(text) ? { nome: 'Transporte' } : { nome: 'Operacional' });

const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20261001000000[-3:BRT]</DTPOSTED>
<TRNAMT>150.00</TRNAMT>
<FITID>id-1</FITID>
<MEMO>Transferência recebida pelo Pix - Ana Souza - •••.111.222-•• - BANCO X</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20261002</DTPOSTED>
<TRNAMT>-45.90</TRNAMT>
<FITID>id-2</FITID>
<MEMO>Compra no débito - POSTO CENTRAL</MEMO>
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test('valores e datas no formato brasileiro e no formato dos bancos', () => {
  assert.equal(parseAmount('1.234,56'), 1234.56);
  assert.equal(parseAmount('-1234.56'), -1234.56);
  assert.equal(parseAmount('R$ 12,00'), 12);
  assert.equal(parseAmount('(30,00)'), -30);
  assert.equal(parseAmount('2.500'), 2500);
  assert.equal(parseAmount('273.21'), 273.21);
  assert.equal(parseDate('27/07/2026'), '2026-07-27');
  assert.equal(parseDate('27/07/26'), '2026-07-27');
  assert.equal(parseDate('20260727000000[-3:BRT]'), '2026-07-27');
  assert.equal(parseDate('31/02/2026'), null);
});

test('OFX: lê data, valor, identificador e descrição de cada movimento', () => {
  const result = parseOfx(OFX);
  assert.equal(result.linhas.length, 2);
  assert.deepEqual(result.linhas[1], { idExterno: 'id-2', data: '2026-10-02', valor: -45.9, descricaoOriginal: 'Compra no débito - POSTO CENTRAL' });
  assert.equal(parseStatement('extrato.ofx', OFX).formato, 'OFX');
});

test('CSV com ponto e vírgula, aspas e colunas separadas de crédito e débito', () => {
  const csv = 'Data;Histórico;Crédito;Débito\n01/10/2026;"Pix recebido; cliente";1.200,00;\n02/10/2026;Tarifa;;12,50\n';
  const result = parseCsv(csv);
  assert.equal(result.linhas.length, 2);
  assert.equal(result.linhas[0].valor, 1200);
  assert.equal(result.linhas[0].descricaoOriginal, 'Pix recebido; cliente');
  assert.equal(result.linhas[1].valor, -12.5);
  // Sem identificador do banco, a chave vem do conteúdo e é estável entre leituras.
  assert.match(result.linhas[0].idExterno, /^h:/);
  assert.equal(parseCsv(csv).linhas[0].idExterno, result.linhas[0].idExterno);
});

test('CSV do Nubank (vírgula, valor com ponto decimal, identificador)', () => {
  const csv = 'Data,Valor,Identificador,Descrição\n27/07/2026,273.21,abc-1,Transferência recebida pelo Pix - Cliente Um - •••.123.456-•• - BANCO\n';
  const [line] = parseCsv(csv).linhas;
  assert.deepEqual(line, { idExterno: 'abc-1', data: '2026-07-27', valor: 273.21, descricaoOriginal: 'Transferência recebida pelo Pix - Cliente Um - •••.123.456-•• - BANCO' });
});

test('descrição curta e estável a partir do texto do banco', () => {
  assert.equal(describeLine('Transferência recebida pelo Pix - Ana Souza - •••.111.222-•• - BANCO X').descricao, 'Pix recebido · Ana Souza');
  assert.equal(describeLine('Compra no débito - POSTO CENTRAL').descricao, 'Débito · POSTO CENTRAL');
  assert.equal(describeLine('Pagamento de fatura').op, 'fatura');
  assert.equal(describeLine('Aplicação RDB').op, 'aplicacao');
});

test('o que já está no caixa não entra de novo: reimportação e pagamento já lançado pela OS', () => {
  const linhas = parseOfx(OFX).linhas;
  const existentes = [
    { id: 't-os', descricao: 'Pagamento OS #10 - Ana', valor: '150.00', tipo: 'receita', dia: '2026-10-03', id_externo: null },
    { id: 't-imp', descricao: 'Débito · POSTO CENTRAL', valor: '45.90', tipo: 'despesa', dia: '2026-10-02', id_externo: 'id-2' },
  ];
  const [pix, posto] = analyzeStatement({ linhas, existentes, inferExpense });
  assert.equal(pix.situacao, 'ja_lancado');
  assert.deepEqual(pix.correspondencia, { id: 't-os', descricao: 'Pagamento OS #10 - Ana', data: '2026-10-03' });
  assert.equal(pix.importar, false);
  assert.equal(posto.situacao, 'ja_importado');
});

test('um lançamento existente casa com uma linha só, e fora da janela de 3 dias não casa', () => {
  const linhas = [
    { idExterno: 'a', data: '2026-10-01', valor: 100, descricaoOriginal: 'Transferência recebida pelo Pix - Um' },
    { idExterno: 'b', data: '2026-10-01', valor: 100, descricaoOriginal: 'Transferência recebida pelo Pix - Dois' },
    { idExterno: 'c', data: '2026-10-20', valor: 50, descricaoOriginal: 'Transferência recebida pelo Pix - Três' },
  ];
  const existentes = [
    { id: 'x', descricao: 'OS', valor: 100, tipo: 'receita', dia: '2026-10-02', id_externo: null },
    { id: 'y', descricao: 'OS', valor: 50, tipo: 'receita', dia: '2026-10-10', id_externo: null },
  ];
  const result = analyzeStatement({ linhas, existentes, inferExpense });
  assert.deepEqual(result.map((row) => row.situacao), ['ja_lancado', 'novo', 'novo']);
});

test('transferência entre contas do dono e caixinha ficam de fora; categorias sugeridas e aprendidas', () => {
  const own = (valor, n) => ({ idExterno: `o${n}`, data: '2026-10-05', valor, descricaoOriginal: 'Transferência enviada pelo Pix - Fulano de Tal Silva - •••.999.888-•• - NU' });
  const linhas = [
    own(-500, 1),
    { idExterno: 'r1', data: '2026-10-05', valor: -200, descricaoOriginal: 'Aplicação RDB' },
    { idExterno: 'p1', data: '2026-10-06', valor: -80, descricaoOriginal: 'Compra no débito - POSTO CENTRAL' },
    { idExterno: 'c1', data: '2026-10-06', valor: 300, descricaoOriginal: 'Transferência recebida pelo Pix - Cliente Novo - •••.555.444-•• - BANCO' },
    { idExterno: 'c2', data: '2026-10-07', valor: 90, descricaoOriginal: 'Transferência recebida pelo Pix - Cliente Antigo - •••.777.666-•• - BANCO' },
  ];
  const categorias = [
    { id: 'cat-serv', nome: 'Serviços', tipo: 'receita' },
    { id: 'cat-loja', nome: 'Loja do site', tipo: 'receita' },
  ];
  const historico = new Map([['Pix recebido · Cliente Antigo', 'cat-loja']]);
  const result = analyzeStatement({ linhas, categorias, historico, donos: ['Fulano Silva'], inferExpense });
  assert.deepEqual(result.map((row) => row.situacao), ['conta_propria', 'aplicacao', 'novo', 'novo', 'novo']);
  assert.equal(result[0].categoria_nome, 'Retiradas do sócio');
  assert.equal(result[2].categoria_nome, 'Transporte');
  assert.equal(result[3].categoria_id, 'cat-serv');
  assert.equal(result[4].categoria_id, 'cat-loja');
});

test('quem recebe e manda dinheiro várias vezes nos dois sentidos é tratado como conta própria', () => {
  const line = (n, valor) => ({ idExterno: `t${n}`, data: '2026-10-01', valor, descricaoOriginal: 'Transferência Recebida - Outra Conta Minha - •••.111.000-•• - NU' });
  const linhas = [1, 2, 3].map((n) => line(n, 100)).concat([4, 5, 6].map((n) => line(n, -100)));
  const result = analyzeStatement({ linhas, inferExpense });
  assert.ok(result.every((row) => row.situacao === 'conta_propria'));
});
