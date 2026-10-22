// Garantias dos serviços da oficina.
//
// Cada serviço do catálogo tem prazo, cobertura, exclusões, cuidados e (opcional) o ebook de cuidados.
// Quando uma OS é concluída, grava-se uma "foto" da garantia de cada serviço em os_garantias:
// mudar o prazo do serviço depois não altera garantias já emitidas.
// Mínimo de 90 dias: garantia legal para serviços em bens duráveis (CDC, art. 26, II).

export const GARANTIA_LEGAL_DIAS = 90;

const CUIDADOS_GERAIS =
  'Guarde o instrumento no case ou bag, longe de sol direto, carro fechado, ar-condicionado soprando direto e lugares úmidos. ' +
  'Evite variações bruscas de temperatura. Troque as cordas com regularidade e limpe-as depois de tocar.';

/** Padrões por tipo de serviço, reconhecido pelo nome cadastrado. A ordem importa: o primeiro que casar vale. */
export const PADROES = [
  {
    termos: ['encordoamento', 'corda'],
    dias: GARANTIA_LEGAL_DIAS,
    ebook: 'guia-das-cordas',
    cobertura: 'Mão de obra da instalação das cordas (encaixe no rastilho e no cavalete, enrolamento nas tarraxas e afinação inicial).',
    exclusoes:
      'As cordas em si não têm garantia de durabilidade: desgaste, oxidação, perda de brilho e de afinação com o uso são naturais e variam com o suor, a umidade e a frequência de uso. ' +
      'Defeito de fabricação de corda (rompimento na primeira afinação, falha no enrolamento) não é desgaste: nesse caso a oficina ajuda a acionar a marca fabricante.',
    cuidados: 'Limpe as cordas com pano seco depois de tocar, lave as mãos antes e troque o jogo a cada 2 a 4 meses de uso frequente. ' + CUIDADOS_GERAIS,
  },
  {
    termos: ['colagem', 'restauracao', 'restaura'],
    dias: 180,
    ebook: 'cuidados-colagens-restauracoes',
    cobertura: 'Descolamento ou falha da colagem/restauração executada, em uso normal do instrumento.',
    exclusoes: 'Quedas, impactos, pancadas, exposição a calor ou umidade extremos (carro fechado, praia, chuva), tensão de cordas acima da indicada e intervenção de terceiros.',
    cuidados: 'Nas primeiras 48 horas após a retirada evite calor e umidade. Não aumente o calibre das cordas sem orientação. ' + CUIDADOS_GERAIS,
  },
  {
    termos: ['fabricacao'],
    dias: 365,
    ebook: 'cuidados-depois-da-regulagem',
    cobertura: 'Estrutura, colagens e acabamento do instrumento fabricado, em uso normal.',
    exclusoes: 'Quedas, impactos, exposição a calor ou umidade extremos, desgaste natural de trastes, cordas e acabamento por uso, e intervenção de terceiros.',
    cuidados: CUIDADOS_GERAIS,
  },
  {
    termos: ['eletric', 'blindagem', 'componente', 'captador', 'jack', 'potenciometro'],
    dias: GARANTIA_LEGAL_DIAS,
    ebook: 'cuidados-depois-da-regulagem',
    cobertura: 'Mão de obra do serviço elétrico (soldas, ligações, blindagem). Peças novas instaladas seguem também a garantia do fabricante.',
    exclusoes: 'Mau contato causado por cabos defeituosos, umidade, quedas, peças trazidas pelo cliente e intervenção de terceiros.',
    cuidados: 'Use cabos em bom estado e desconecte puxando pelo plugue, nunca pelo fio. ' + CUIDADOS_GERAIS,
  },
  {
    termos: ['regulagem', 'trastes', 'traste', 'pestana', 'rastilho', 'arco', 'tensor'],
    dias: GARANTIA_LEGAL_DIAS,
    ebook: 'cuidados-depois-da-regulagem',
    cobertura: 'Reajuste do serviço (altura das cordas, tensor, oitavas, pestana e rastilho) se o instrumento sair do ponto sem causa externa.',
    exclusoes:
      'Troca de calibre ou de afinação (ex.: afinar mais grave), mudanças fortes de clima e umidade, quedas, impactos, transporte inadequado e intervenção de terceiros. ' +
      'Madeira é material vivo: pequenos ajustes sazonais são normais e podem ser feitos como manutenção.',
    cuidados: 'Mantenha o mesmo calibre e a mesma afinação usados na regulagem. ' + CUIDADOS_GERAIS,
  },
];

export const PADRAO_GERAL = {
  dias: GARANTIA_LEGAL_DIAS,
  ebook: 'cuidados-depois-da-regulagem',
  cobertura: 'O serviço executado, em uso normal do instrumento.',
  exclusoes: 'Quedas, impactos, exposição a calor ou umidade extremos, desgaste natural e intervenção de terceiros.',
  cuidados: CUIDADOS_GERAIS,
};

export function normalizar(texto) {
  return String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Garantia sugerida para um serviço pelo nome. */
export function garantiaPadrao(nomeServico) {
  const nome = normalizar(nomeServico);
  const achado = PADROES.find((p) => p.termos.some((termo) => nome.includes(termo)));
  const base = achado || PADRAO_GERAL;
  return { dias: base.dias, cobertura: base.cobertura, exclusoes: base.exclusoes, cuidados: base.cuidados, ebook: base.ebook };
}

/** Dias a partir de uma data YYYY-MM-DD (sem fuso: a data da entrega é o primeiro dia de garantia). */
export function somarDias(dataIso, dias) {
  const [y, m, d] = String(dataIso).slice(0, 10).split('-').map(Number);
  const data = new Date(Date.UTC(y, m - 1, d + Number(dias)));
  return data.toISOString().slice(0, 10);
}

/** Situação de uma garantia num dia (YYYY-MM-DD). */
export function situacaoGarantia(fimIso, hojeIso) {
  const fim = Date.parse(`${String(fimIso).slice(0, 10)}T00:00:00Z`);
  const hoje = Date.parse(`${String(hojeIso).slice(0, 10)}T00:00:00Z`);
  const restantes = Math.round((fim - hoje) / 86400000);
  return { ativa: restantes >= 0, dias_restantes: Math.max(0, restantes), vence_em_breve: restantes >= 0 && restantes <= 7 };
}

export const OS_GARANTIAS_TABLE = `CREATE TABLE IF NOT EXISTS os_garantias (
  id varchar(36) NOT NULL PRIMARY KEY,
  user_id varchar(36) NOT NULL,
  ordem_servico_id varchar(36) NOT NULL,
  cliente_id varchar(36) DEFAULT NULL,
  servico_id varchar(36) NOT NULL,
  servico_nome varchar(255) NOT NULL,
  inicio varchar(10) NOT NULL,
  fim varchar(10) NOT NULL,
  dias int NOT NULL,
  cobertura text DEFAULT NULL,
  exclusoes text DEFAULT NULL,
  cuidados text DEFAULT NULL,
  ebook_slug varchar(120) DEFAULT NULL,
  aviso_entrega_em varchar(50) DEFAULT NULL,
  aviso_vencimento_em varchar(50) DEFAULT NULL,
  created_at varchar(50) DEFAULT NULL,
  UNIQUE KEY uk_os_garantias (ordem_servico_id, servico_id),
  INDEX idx_os_garantias_cliente (user_id, cliente_id, fim),
  INDEX idx_os_garantias_fim (user_id, fim)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

export const SERVICO_GARANTIA_COLUNAS = {
  garantia_dias: 'int DEFAULT NULL',
  garantia_cobertura: 'text DEFAULT NULL',
  garantia_exclusoes: 'text DEFAULT NULL',
  garantia_cuidados: 'text DEFAULT NULL',
  garantia_ebook_slug: 'varchar(120) DEFAULT NULL',
};

/** Preenche a garantia dos serviços que ainda não têm (não mexe no que já foi definido). */
export async function preencherGarantiasDosServicos(db) {
  const [servicos] = await db.query('SELECT id, nome FROM servicos WHERE garantia_dias IS NULL');
  for (const s of servicos) {
    const g = garantiaPadrao(s.nome);
    await db.query(
      `UPDATE servicos SET garantia_dias = ?, garantia_cobertura = ?, garantia_exclusoes = ?, garantia_cuidados = ?, garantia_ebook_slug = ?
        WHERE id = ? AND garantia_dias IS NULL`,
      [g.dias, g.cobertura, g.exclusoes, g.cuidados, g.ebook, s.id],
    );
  }
  return servicos.length;
}

/**
 * Emite as garantias que faltam para OS concluídas com data de entrega: uma por serviço da OS.
 * Idempotente (chave única por OS + serviço). Retorna quantas foram criadas.
 */
export async function emitirGarantiasPendentes(db, { uuid, now, userId = null, ordemId = null }) {
  const filtros = ["o.status = 'concluido'", "COALESCE(o.data_entrega, '') <> ''", 'o.servicos_ids IS NOT NULL'];
  const params = [];
  if (userId) { filtros.push('o.user_id = ?'); params.push(userId); }
  if (ordemId) { filtros.push('o.id = ?'); params.push(ordemId); }
  const [ordens] = await db.query(
    `SELECT o.id, o.user_id, o.cliente_id, o.servicos_ids, LEFT(o.data_entrega, 10) AS entrega
       FROM ordens_servico o
      WHERE ${filtros.join(' AND ')}
        AND NOT EXISTS (SELECT 1 FROM os_garantias g WHERE g.ordem_servico_id = o.id)
      LIMIT 2000`,
    params,
  );
  let criadas = 0;
  for (const o of ordens) {
    let ids = o.servicos_ids;
    if (typeof ids === 'string') { try { ids = JSON.parse(ids); } catch { ids = []; } }
    if (!Array.isArray(ids) || !ids.length || !/^\d{4}-\d{2}-\d{2}$/.test(o.entrega)) continue;
    const [servicos] = await db.query('SELECT * FROM servicos WHERE user_id = ? AND id IN (?)', [o.user_id, [...new Set(ids.map(String))]]);
    for (const s of servicos) {
      const padrao = garantiaPadrao(s.nome);
      const dias = Math.max(GARANTIA_LEGAL_DIAS, Number(s.garantia_dias ?? padrao.dias) || GARANTIA_LEGAL_DIAS);
      const [r] = await db.query(
        `INSERT IGNORE INTO os_garantias
          (id, user_id, ordem_servico_id, cliente_id, servico_id, servico_nome, inicio, fim, dias, cobertura, exclusoes, cuidados, ebook_slug, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid(), o.user_id, o.id, o.cliente_id, s.id, s.nome, o.entrega, somarDias(o.entrega, dias), dias,
          s.garantia_cobertura ?? padrao.cobertura, s.garantia_exclusoes ?? padrao.exclusoes, s.garantia_cuidados ?? padrao.cuidados,
          s.garantia_ebook_slug ?? padrao.ebook, now()],
      );
      criadas += Number(r.affectedRows || 0);
    }
  }
  return criadas;
}

// ---------- Avisos pelo WhatsApp ----------

const dataBr = (iso) => String(iso).slice(0, 10).split('-').reverse().join('/');

/** Texto do aviso de garantia: "entrega" (OS entregue) ou "vencimento" (faltam poucos dias). */
export function mensagemGarantia(tipo, { nome, instrumento, numero, garantias, portalUrl }) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || '';
  const ola = primeiro ? `Olá, ${primeiro}!` : 'Olá!';
  const equipamento = instrumento ? `seu ${instrumento}` : 'seu instrumento';
  if (tipo === 'entrega') {
    const linhas = garantias.map((g) => `• ${g.servico_nome}: até ${dataBr(g.fim)}`).join('\n');
    return `${ola} A garantia dos serviços no ${equipamento} (OS #${numero}) já está valendo:\n${linhas}\n\n` +
      `No portal você vê o que cada garantia cobre e baixa o guia de cuidados, cortesia enquanto durar a garantia: ${portalUrl}`;
  }
  const servicos = garantias.map((g) => g.servico_nome).join(', ');
  const fim = garantias.reduce((max, g) => (g.fim > max ? g.fim : max), garantias[0].fim);
  return `${ola} A garantia de ${servicos} no ${equipamento} (OS #${numero}) vai até ${dataBr(fim)}. ` +
    'Se notou algo diferente (trastejamento, cordas mais altas, algo descolando), fale com a gente antes dessa data: avaliamos sem custo. ' +
    `Detalhes no portal: ${portalUrl}`;
}

/**
 * Envia os avisos pendentes: entrega (OS entregue ontem ou hoje) e vencimento (garantias de 30+ dias que vencem
 * nos próximos 7 dias). Uma mensagem por OS. Marca como enviado mesmo sem telefone, para não tentar de novo.
 */
export async function enviarAvisosDeGarantia(db, { hoje, now, send, portalUrl, log = console }) {
  const ontem = somarDias(hoje, -1);
  const limite = somarDias(hoje, 7);
  const [rows] = await db.query(
    `SELECT g.id, g.user_id, g.ordem_servico_id, g.servico_nome, g.inicio, g.fim, g.dias,
            CASE WHEN g.aviso_entrega_em IS NULL AND g.inicio >= ? THEN 'entrega' ELSE 'vencimento' END AS tipo,
            o.numero, o.modelo, c.nome, c.telefone, COALESCE(i.nome, '') AS instrumento, COALESCE(m.nome, '') AS marca
       FROM os_garantias g
       JOIN ordens_servico o ON o.id = g.ordem_servico_id
       LEFT JOIN clientes c ON c.id = g.cliente_id
       LEFT JOIN instrumentos i ON i.id = o.instrumento_id
       LEFT JOIN marcas m ON m.id = o.marca_id
      WHERE (g.aviso_entrega_em IS NULL AND g.inicio >= ?)
         OR (g.aviso_vencimento_em IS NULL AND g.dias >= 30 AND g.fim >= ? AND g.fim <= ? AND g.inicio < ?)
      ORDER BY g.ordem_servico_id
      LIMIT 200`,
    [ontem, ontem, hoje, limite, ontem],
  );
  const grupos = new Map();
  for (const r of rows) {
    const chave = `${r.tipo}:${r.ordem_servico_id}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(r);
  }
  let enviados = 0;
  for (const [chave, garantias] of grupos) {
    const tipo = chave.split(':')[0];
    const g = garantias[0];
    const coluna = tipo === 'entrega' ? 'aviso_entrega_em' : 'aviso_vencimento_em';
    const texto = mensagemGarantia(tipo, {
      nome: g.nome, numero: g.numero, garantias, portalUrl,
      instrumento: [g.instrumento, g.marca, g.modelo].filter(Boolean).join(' '),
    });
    try {
      if (g.telefone) {
        await send(g.user_id, g.telefone, texto, { orderId: g.ordem_servico_id, templateType: `garantia_${tipo}` });
        enviados += 1;
      }
      await db.query(`UPDATE os_garantias SET ${coluna} = ? WHERE id IN (?)`, [now(), garantias.map((x) => x.id)]);
    } catch (error) {
      log.warn?.(`[garantias] aviso de ${tipo} da OS #${g.numero} falhou:`, error.message);
    }
  }
  return enviados;
}
