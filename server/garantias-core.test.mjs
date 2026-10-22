import test from 'node:test';
import assert from 'node:assert/strict';
import { GARANTIA_LEGAL_DIAS, emitirGarantiasPendentes, garantiaPadrao, situacaoGarantia, somarDias } from './garantias-core.mjs';

test('garantia padrão pelo nome do serviço', () => {
  assert.equal(garantiaPadrao('Regulagem Geral').dias, 90);
  assert.equal(garantiaPadrao('Nivelamento De Trastes').ebook, 'cuidados-depois-da-regulagem');
  assert.equal(garantiaPadrao('Colagem').dias, 180);
  assert.equal(garantiaPadrao('Restauração').ebook, 'cuidados-colagens-restauracoes');
  assert.equal(garantiaPadrao('Fabricação').dias, 365);
  assert.equal(garantiaPadrao('Revisão Eletrica').dias, 90);
  const cordas = garantiaPadrao('Instalar Encordoamento');
  assert.equal(cordas.ebook, 'guia-das-cordas');
  assert.match(cordas.exclusoes, /não têm garantia de durabilidade/);
  assert.match(cordas.exclusoes, /defeito de fabricação/i);
  assert.equal(garantiaPadrao('Reparo').dias, GARANTIA_LEGAL_DIAS);
});

test('datas e situação da garantia', () => {
  assert.equal(somarDias('2026-08-01', 90), '2026-10-30');
  assert.deepEqual(situacaoGarantia('2026-10-30', '2026-10-22'), { ativa: true, dias_restantes: 8, vence_em_breve: false });
  assert.equal(situacaoGarantia('2026-10-30', '2026-10-25').vence_em_breve, true);
  assert.equal(situacaoGarantia('2026-10-30', '2026-10-30').ativa, true, 'o último dia ainda vale');
  assert.equal(situacaoGarantia('2026-10-30', '2026-10-31').ativa, false);
});

test('emite uma garantia por serviço da OS concluída, com mínimo legal', async () => {
  const inserts = [];
  const db = {
    query: async (sql, params) => {
      if (sql.includes('FROM ordens_servico o')) {
        return [[{ id: 'os1', user_id: 'u', cliente_id: 'c1', servicos_ids: JSON.stringify(['s1', 's2']), entrega: '2026-08-01' }]];
      }
      if (sql.startsWith('SELECT * FROM servicos')) {
        return [[
          { id: 's1', nome: 'Regulagem', garantia_dias: 45, garantia_cobertura: null, garantia_exclusoes: null, garantia_cuidados: null, garantia_ebook_slug: null },
          { id: 's2', nome: 'Colagem', garantia_dias: null },
        ]];
      }
      if (sql.includes('INSERT IGNORE INTO os_garantias')) { inserts.push(params); return [{ affectedRows: 1 }]; }
      throw new Error(`SQL inesperado: ${sql.slice(0, 60)}`);
    },
  };
  let n = 0;
  const criadas = await emitirGarantiasPendentes(db, { uuid: () => `g${(n += 1)}`, now: () => 'agora' });
  assert.equal(criadas, 2);
  const [regulagem, colagem] = inserts;
  assert.equal(regulagem[8], 90, 'prazo abaixo do legal sobe para 90 dias');
  assert.equal(regulagem[7], '2026-10-30');
  assert.equal(regulagem[12], 'cuidados-depois-da-regulagem');
  assert.equal(colagem[8], 180);
  assert.equal(colagem[12], 'cuidados-colagens-restauracoes');
});
