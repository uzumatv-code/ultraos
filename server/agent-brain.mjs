/**
 * Cérebro conversacional do agente financeiro.
 *
 * Em vez de casar frases fixas, entrega à OpenAI um conjunto de ferramentas
 * (criar conta, listar, pagar, consultar gastos…) e o histórico recente da
 * conversa. O modelo decide quando perguntar ("é recorrente?", "quantas
 * parcelas?") e quando executar; cada ferramenta valida e grava no banco.
 */

const WRITE_TOOLS = new Set(['criar_conta_pagar', 'pagar_conta', 'cancelar_conta', 'registrar_despesa', 'registrar_receita', 'desfazer_ultimo_lancamento', 'anexar_comprovante', 'corrigir_categoria', 'lembrar_categoria']);

const PERIODS = ['mensal', 'semanal', 'quinzenal', 'bimestral', 'trimestral', 'semestral', 'anual', 'diaria'];
const PAYMENT_METHODS = ['pix', 'dinheiro', 'credito', 'debito', 'boleto'];

const TOOLS = [
  {
    type: 'function',
    name: 'criar_conta_pagar',
    description:
      'Cadastra uma CONTA A PAGAR (boleto, fatura, conta de consumo, mensalidade) com vencimento futuro. ' +
      'Use recorrente=true para contas que se repetem (ex.: água, luz, aluguel) e parcelas>1 para compra parcelada (cria uma conta por parcela).',
    parameters: {
      type: 'object',
      properties: {
        descricao: { type: 'string', description: 'Nome curto, ex.: "Conta de água"' },
        valor: { type: 'number', description: 'Valor em reais de CADA conta/parcela' },
        vencimento: { type: 'string', description: 'Data do (primeiro) vencimento, YYYY-MM-DD' },
        recorrente: { type: 'boolean', description: 'Repete automaticamente todo período' },
        periodicidade: { type: 'string', enum: PERIODS, description: 'Obrigatória se recorrente' },
        parcelas: { type: 'integer', description: 'Total de parcelas mensais; 1 se não for parcelada' },
        categoria: { type: 'string', description: 'Opcional: Moradia, Alimentação, Material e peças, Impostos e taxas, Transporte, Saúde, Marketing…' },
        forma_pagamento: { type: 'string', enum: PAYMENT_METHODS },
        observacoes: { type: 'string' },
      },
      required: ['descricao', 'valor', 'vencimento'],
    },
  },
  {
    type: 'function',
    name: 'listar_contas_pagar',
    description: 'Lista contas a pagar com id, descrição, valor, vencimento e status. Use antes de pagar ou cancelar para achar o id.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['abertas', 'atrasadas', 'pagas', 'todas'] },
        de: { type: 'string', description: 'Vencimento a partir de YYYY-MM-DD' },
        ate: { type: 'string', description: 'Vencimento até YYYY-MM-DD' },
        busca: { type: 'string', description: 'Trecho da descrição' },
        limite: { type: 'integer' },
      },
    },
  },
  {
    type: 'function',
    name: 'pagar_conta',
    description: 'Dá baixa numa conta a pagar (marca como paga e lança a despesa no caixa).',
    parameters: { type: 'object', properties: { conta_id: { type: 'string' }, forma_pagamento: { type: 'string', enum: PAYMENT_METHODS } }, required: ['conta_id'] },
  },
  {
    type: 'function',
    name: 'cancelar_conta',
    description: 'Cancela/exclui uma conta a pagar. Se for recorrente, escopo "serie" cancela também as próximas.',
    parameters: { type: 'object', properties: { conta_id: { type: 'string' }, escopo: { type: 'string', enum: ['ocorrencia', 'serie'] } }, required: ['conta_id'] },
  },
  {
    type: 'function',
    name: 'registrar_despesa',
    description: 'Lança UM gasto JÁ PAGO (ex.: "comprei um café 10"). Entra direto no caixa de hoje. Se a mensagem trouxer vários gastos, chame esta ferramenta uma vez para CADA item, nunca some valores.',
    parameters: {
      type: 'object',
      properties: {
        descricao: { type: 'string' },
        valor: { type: 'number' },
        categoria: { type: 'string' },
        forma_pagamento: { type: 'string', enum: PAYMENT_METHODS },
      },
      required: ['descricao', 'valor'],
    },
  },
  {
    type: 'function',
    name: 'registrar_receita',
    description: 'Lança uma entrada avulsa de dinheiro (venda de acessório, reembolso). Para pagamento de OS use o fluxo de ordens, não esta ferramenta.',
    parameters: {
      type: 'object',
      properties: { descricao: { type: 'string' }, valor: { type: 'number' }, forma_pagamento: { type: 'string', enum: PAYMENT_METHODS } },
      required: ['descricao', 'valor'],
    },
  },
  {
    type: 'function',
    name: 'consultar_gastos',
    description: 'Totaliza gastos (despesas pagas) num período, opcionalmente por categoria ou dia, e pode listar os maiores lançamentos.',
    parameters: {
      type: 'object',
      properties: {
        de: { type: 'string', description: 'YYYY-MM-DD' },
        ate: { type: 'string', description: 'YYYY-MM-DD (inclusive)' },
        categoria: { type: 'string', description: 'Filtra por nome de categoria (parcial)' },
        agrupar: { type: 'string', enum: ['categoria', 'dia', 'nenhum'] },
        listar: { type: 'boolean', description: 'Inclui os 10 maiores lançamentos' },
      },
      required: ['de', 'ate'],
    },
  },
  {
    type: 'function',
    name: 'resumo_financeiro',
    description: 'Panorama atual: gastos de hoje e do mês, entradas, saldo, contas atrasadas, vencendo hoje e na semana.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
    name: 'desfazer_ultimo_lancamento',
    description: 'Remove o último gasto lançado por WhatsApp (só vale para lançamentos recentes).',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
    name: 'corrigir_categoria',
    description: 'Muda a categoria de um gasto já lançado. Sem transacao_id usa o último gasto lançado por WhatsApp.',
    parameters: {
      type: 'object',
      properties: { categoria: { type: 'string' }, transacao_id: { type: 'string' } },
      required: ['categoria'],
    },
  },
  {
    type: 'function',
    name: 'lembrar_categoria',
    description: 'Memoriza que um estabelecimento/termo sempre pertence a uma categoria (ex.: "americanas" → Alimentação). Chame quando a pessoa confirmar ou corrigir a categoria de um lugar.',
    parameters: {
      type: 'object',
      properties: { termo: { type: 'string', description: 'Nome do estabelecimento ou palavra-chave' }, categoria: { type: 'string' } },
      required: ['termo', 'categoria'],
    },
  },
  {
    type: 'function',
    name: 'anexar_comprovante',
    description:
      'Vincula o comprovante enviado (foto/PDF) a uma conta a pagar e/ou a um gasto. Sem comprovante_id usa o comprovante recebido agora ou o último pendente. ' +
      'Use depois de pagar_conta ou registrar_despesa, passando o id retornado.',
    parameters: {
      type: 'object',
      properties: {
        comprovante_id: { type: 'string' },
        conta_id: { type: 'string', description: 'Id da conta a pagar' },
        transacao_id: { type: 'string', description: 'Id do lançamento (gasto) quando não houver conta' },
      },
    },
  },
  {
    type: 'function',
    name: 'listar_comprovantes',
    description: 'Consulta comprovantes guardados (inclui os pendentes, ainda sem vínculo). Filtre por trecho do nome da conta/gasto.',
    parameters: { type: 'object', properties: { busca: { type: 'string' }, conta_id: { type: 'string' }, limite: { type: 'integer' } } },
  },
  {
    type: 'function',
    name: 'enviar_comprovante',
    description: 'Envia o arquivo de um comprovante guardado para o WhatsApp de quem está conversando.',
    parameters: { type: 'object', properties: { comprovante_id: { type: 'string' } }, required: ['comprovante_id'] },
  },
  {
    type: 'function',
    name: 'consultar_sistema',
    description: 'Consultas de ordens de serviço e recebíveis: OS do dia, buscar uma OS, OS pendentes de pagamento, quanto receber no mês, faturamento do mês, dívida de um cliente.',
    parameters: {
      type: 'object',
      properties: {
        consulta: { type: 'string', enum: ['os_do_dia', 'buscar_os', 'os_pendentes_pagamento', 'a_receber_mes', 'faturamento_mes', 'divida_cliente'] },
        numero_os: { type: 'integer' },
        cliente: { type: 'string' },
        data: { type: 'string', description: 'YYYY-MM-DD para os_do_dia' },
      },
      required: ['consulta'],
    },
  },
];

/** Monta a mensagem do usuário; comprovantes vão como imagem/PDF para o modelo ler valor, data e favorecido. */
export function userContent(message, attachment) {
  if (!attachment) return String(message);
  const note = `[Comprovante recebido e salvo: id=${attachment.id}, arquivo ${attachment.name}. Ainda não está vinculado a nenhuma conta.]`;
  const parts = [{ type: 'input_text', text: `${String(message || '').trim()}

${note}`.trim() }];
  if (attachment.dataUrl) {
    if (/^data:application\/pdf/i.test(attachment.dataUrl)) parts.push({ type: 'input_file', filename: attachment.name, file_data: attachment.dataUrl });
    else parts.push({ type: 'input_image', image_url: attachment.dataUrl });
  }
  return parts;
}

export function buildSystemPrompt({ nome, hojeIso, diaSemana, timezone, canWrite, categorias = [], regras = [] }) {
  return [
    `Você é a assistente financeira da oficina (luthieria) do ${nome || 'proprietário'}, conversando pelo WhatsApp. Aja como uma funcionária de confiança do financeiro: proativa, objetiva e cordial, sem formalidade excessiva.`,
    `Hoje é ${diaSemana}, ${hojeIso} (${timezone}).`,
    '',
    'ESTILO: mensagens curtas de WhatsApp, português do Brasil, *negrito* só para valores/nomes importantes, no máximo 2 emojis. Trate por "você". Nada de listas enormes; resuma e ofereça detalhes.',
    '',
    'COMO DECIDIR:',
    '- "conta de água/luz", "boleto", "fatura", "vence dia…" = CONTA A PAGAR → criar_conta_pagar. "comprei", "gastei", "paguei" algo já feito = gasto pago → registrar_despesa.',
    '- Datas: "dia 10" = o próximo dia 10 (neste mês se ainda não passou; senão no mês seguinte). Entenda "amanhã", "sexta", "fim do mês". Sempre envie YYYY-MM-DD às ferramentas.',
    '- Para criar uma conta você precisa de descrição, valor e vencimento. Se faltar algo, pergunte só o que falta.',
    '- Pergunte "é recorrente?" quando a pessoa NÃO disse e a conta parece de uso contínuo (água, luz, internet, telefone, aluguel, condomínio, contador, mensalidade, assinatura). Pergunte "em quantas parcelas?" quando for compra/boleto que pode ser parcelado ou ela citar parcelar. Junte as perguntas numa única mensagem curta, com opções fáceis (ex.: "É recorrente (todo mês) ou só dessa vez?").',
    '- Se ela já informou tudo (ou disse "única vez"), cadastre sem perguntar de novo e confirme com um resumo curto: descrição, valor, vencimento e se é recorrente/parcelada.',
    '- Respostas curtas como "sim", "todo mês", "3x", "só essa" continuam o assunto anterior: use o histórico.',
    '- Para pagar/cancelar, use listar_contas_pagar para achar o id. Se houver mais de uma conta possível, pergunte qual. Se for uma só e inequívoca, execute.',
    categorias.length
      ? `- CATEGORIAS já existentes: ${categorias.join(', ')}. SEMPRE informe "categoria" ao criar conta ou gasto, pensando como um contador: empréstimo/financiamento → Empréstimos; cartão/fatura → Cartões; aluguel, luz, água, internet → Moradia; dízimo/doação → Dízimo e doações; peças, cordas, insumos → Material e peças; combustível/uber → Transporte; comida → Alimentação. Use EXATAMENTE o nome de uma categoria existente quando servir; se nenhuma servir, crie um nome novo, curto, no plural e com acento correto (ex.: "Seguros"), nunca variações do que já existe. Nunca coloque uma conta numa categoria que não faça sentido só porque ela já existe.`
      : '',
    '- Nunca invente valores, datas ou contas: consulte as ferramentas. Se uma ferramenta falhar, explique de forma simples o que faltou.',
    '- COMPROVANTES: quando chegar um comprovante (imagem/PDF) leia valor, data e favorecido. Se a pessoa disse que pagou algo ("paguei o empréstimo da Caixa, segue o comprovante"): ache a conta com listar_contas_pagar, dê baixa com pagar_conta e então use anexar_comprovante com o conta_id. Se for um gasto avulso, registre com registrar_despesa e anexe com transacao_id. Se chegar só o comprovante, sem texto, tente identificar a conta pelo valor/favorecido lido e pelas últimas mensagens; se houver dúvida, pergunte "esse comprovante é de qual conta?" (ele fica guardado como pendente e você anexa na resposta). Se o valor lido diferir do valor da conta, avise antes de dar baixa. Para consultar comprovantes use listar_comprovantes; para mandar o arquivo de volta use enviar_comprovante.',
    regras.length ? `- REGRAS APRENDIDAS (estabelecimento → categoria), aplique sempre: ${regras.map((r) => `${r.termo} → ${r.categoria_nome}`).join('; ')}.` : '',
    '- ESTABELECIMENTO AMBÍGUO (loja que vende de tudo, ex.: Americanas, Magalu, Mercado Livre, Shopee) sem pista do que foi comprado: lance o gasto na melhor categoria provisória (use "Outros" se existir) e na MESMA mensagem pergunte de uma vez: "Foi o quê? (alimentação, material, outros…)". Quando a pessoa responder, use corrigir_categoria e lembrar_categoria para nunca mais perguntar. Se ela corrigir uma categoria ("muda para material"), faça o mesmo. Estabelecimento claro (supermercado, posto, farmácia, restaurante) classifique direto, sem perguntar, e não precisa memorizar.',
    '- NÃO pergunte a forma de pagamento: ela é opcional. Preencha forma_pagamento SOMENTE se a pessoa disser ou o comprovante mostrar (ex.: Pix); nunca presuma nem invente. Evite perguntas desnecessárias; só pergunte o que realmente impede a ação.',
    '- Mensagem com vários itens (ex.: "paguei 37 de dízimo e comprei 95 de encordoamento") = um lançamento separado por item, cada um com seu valor e descrição. Nunca some. Confirme listando cada lançamento e o total só no final.',
    '- Depois de executar, diga o que foi feito; não peça confirmação extra para ações simples e reversíveis.',
    canWrite ? '' : '- ATENÇÃO: este número tem permissão só de CONSULTA. Não tente lançar, pagar ou cancelar; explique que precisa de permissão.',
    '- Assuntos fora de finanças/oficina: responda em uma frase gentil e volte ao trabalho.',
  ].filter(Boolean).join('\n');
}

export function createAgentBrain({ pool, now, todayDate, timezone, apiKey, model, actions, formatBRL, baseUrl = 'https://api.openai.com/v1', log = console }) {
  const reasoning = /^(gpt-5|o\d)/.test(String(model || '')) ? { effort: 'low' } : undefined;

  const dayName = () =>
    new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, weekday: 'long' }).format(new Date());

  async function loadHistory(userId, phone) {
    const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    const [rows] = await pool.query(
      `SELECT mensagem, resposta FROM financeiro_ia_logs
        WHERE user_id = ? AND telefone = ? AND created_at >= ?
          AND status IN ('respondido','executado','lancamento_rapido','desfeito','agente')
          AND mensagem IS NOT NULL AND resposta IS NOT NULL
        ORDER BY created_at DESC LIMIT 8`,
      [userId, phone, since],
    );
    return rows.reverse().flatMap((row) => [
      { role: 'user', content: String(row.mensagem).slice(0, 600) },
      { role: 'assistant', content: String(row.resposta).slice(0, 900) },
    ]);
  }

  /* ----------------------------------------------------------- ferramentas */

  async function runTool(name, args, ctx) {
    if (WRITE_TOOLS.has(name) && !ctx.canWrite) return { erro: 'Número sem permissão de escrita.' };
    switch (name) {
      case 'criar_conta_pagar': {
        const created = await actions.createPayable(ctx.userId, args);
        ctx.actions.push({ type: 'conta_pagar', ids: created.ids });
        return created;
      }
      case 'listar_contas_pagar': {
        const status = args.status || 'abertas';
        const today = todayDate();
        const where = ['user_id = ?'];
        const params = [ctx.userId];
        if (status === 'abertas') where.push("status IN ('pendente','atrasado')");
        else if (status === 'atrasadas') { where.push("status IN ('pendente','atrasado')", 'LEFT(data_vencimento,10) < ?'); params.push(today); }
        else if (status === 'pagas') where.push("status = 'pago'");
        else where.push("status <> 'cancelado'");
        if (args.de) { where.push('LEFT(data_vencimento,10) >= ?'); params.push(String(args.de).slice(0, 10)); }
        if (args.ate) { where.push('LEFT(data_vencimento,10) <= ?'); params.push(String(args.ate).slice(0, 10)); }
        if (args.busca) { where.push('LOWER(descricao) LIKE ?'); params.push(`%${String(args.busca).toLowerCase()}%`); }
        const [rows] = await pool.query(
          `SELECT id, descricao, valor, LEFT(data_vencimento,10) AS vencimento, status, recorrencia_id IS NOT NULL AS recorrente
             FROM contas_pagar WHERE ${where.join(' AND ')} ORDER BY data_vencimento ASC LIMIT ?`,
          [...params, Math.min(Number(args.limite) || 15, 30)],
        );
        const total = rows.reduce((acc, row) => acc + Number(row.valor || 0), 0);
        return { total_reais: Number(total.toFixed(2)), quantidade: rows.length, contas: rows.map((r) => ({ ...r, valor: Number(r.valor), recorrente: Boolean(r.recorrente) })) };
      }
      case 'pagar_conta': {
        const result = await actions.payPayable(ctx.userId, args.conta_id, args.forma_pagamento);
        return result;
      }
      case 'cancelar_conta':
        return actions.cancelPayable(ctx.userId, args.conta_id, args.escopo);
      case 'registrar_despesa': {
        const saved = await actions.registerExpense(ctx.userId, args);
        ctx.actions.push({ type: 'despesa', id: saved.id, description: saved.description, value: saved.value });
        return { ok: true, descricao: saved.description, valor: saved.value, categoria: saved.category };
      }
      case 'registrar_receita': {
        const saved = await actions.registerIncome(ctx.userId, args);
        return { ok: true, descricao: saved.description, valor: saved.value };
      }
      case 'consultar_gastos': {
        const de = String(args.de).slice(0, 10);
        const ate = String(args.ate).slice(0, 10);
        const params = [ctx.userId, de, ate];
        let filter = '';
        if (args.categoria) { filter = ' AND LOWER(cf.nome) LIKE ?'; params.push(`%${String(args.categoria).toLowerCase()}%`); }
        const base = `FROM transacoes_financeiras t LEFT JOIN categorias_financeiras cf ON cf.id = t.categoria_id
                       WHERE t.user_id = ? AND t.tipo = 'despesa' AND LEFT(t.data,10) >= ? AND LEFT(t.data,10) <= ?${filter}`;
        const [[totals]] = await pool.query(`SELECT COALESCE(SUM(t.valor),0) AS total, COUNT(*) AS qtd ${base}`, params);
        const out = { periodo: { de, ate }, total_reais: Number(Number(totals.total).toFixed(2)), lancamentos: Number(totals.qtd) };
        if (args.agrupar === 'categoria') {
          const [rows] = await pool.query(`SELECT COALESCE(cf.nome,'Sem categoria') AS categoria, SUM(t.valor) AS total ${base} GROUP BY 1 ORDER BY total DESC LIMIT 12`, params);
          out.por_categoria = rows.map((r) => ({ categoria: r.categoria, total_reais: Number(Number(r.total).toFixed(2)) }));
        } else if (args.agrupar === 'dia') {
          const [rows] = await pool.query(`SELECT LEFT(t.data,10) AS dia, SUM(t.valor) AS total ${base} GROUP BY 1 ORDER BY 1 DESC LIMIT 31`, params);
          out.por_dia = rows.map((r) => ({ dia: r.dia, total_reais: Number(Number(r.total).toFixed(2)) }));
        }
        if (args.listar) {
          const [rows] = await pool.query(`SELECT t.descricao, t.valor, LEFT(t.data,10) AS dia, cf.nome AS categoria ${base} ORDER BY t.valor DESC LIMIT 10`, params);
          out.maiores = rows.map((r) => ({ ...r, valor: Number(r.valor) }));
        }
        return out;
      }
      case 'resumo_financeiro':
        return { resumo: await actions.summary(ctx.userId) };
      case 'desfazer_ultimo_lancamento':
        return { resultado: await actions.undoLast(ctx.userId, ctx.phone) };
      case 'corrigir_categoria':
        return actions.recategorize(ctx.userId, { categoria: args.categoria, transacaoId: args.transacao_id || null });
      case 'lembrar_categoria':
        return { ok: true, ...(await actions.saveRule(ctx.userId, args.termo, args.categoria)) };
      case 'anexar_comprovante': {
        const linked = await actions.attachReceipt(ctx.userId, {
          comprovanteId: args.comprovante_id || ctx.attachment?.id || null,
          contaPagarId: args.conta_id || null,
          transacaoId: args.transacao_id || null,
        });
        return { ok: true, ...linked };
      }
      case 'listar_comprovantes':
        return { comprovantes: await actions.listReceipts(ctx.userId, { busca: args.busca, contaPagarId: args.conta_id, limite: args.limite }) };
      case 'enviar_comprovante':
        return actions.sendReceipt(ctx.userId, ctx.phone, args.comprovante_id);
      case 'consultar_sistema':
        return { resposta: await actions.answerSystem(ctx.userId, {
          intent: args.consulta,
          osNumero: args.numero_os || null,
          cliente: args.cliente || null,
          dataPrevisao: args.data || null,
        }) };
      default:
        return { erro: `Ferramenta desconhecida: ${name}` };
    }
  }

  async function callOpenAi(body) {
    const response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error?.message || `OpenAI HTTP ${response.status}`);
    return json;
  }

  function outputText(json) {
    if (typeof json?.output_text === 'string' && json.output_text) return json.output_text;
    const parts = [];
    for (const item of json?.output || []) {
      if (item.type !== 'message') continue;
      for (const content of item.content || []) {
        if (typeof content.text === 'string') parts.push(content.text);
      }
    }
    return parts.join('\n').trim();
  }

  /**
   * Conversa com o modelo e executa as ferramentas pedidas.
   * Retorna { reply, actions } ou lança erro (o chamador cai no fluxo antigo).
   */
  async function converse({ authorized, phone, message, canWrite, attachment = null }) {
    if (!apiKey) throw new Error('OPENAI_API_KEY ausente');
    const userId = authorized.user_id;
    const ctx = { userId, phone, canWrite, attachment, actions: [] };
    const history = await loadHistory(userId, phone);
    const firstName = String(authorized.nome || '').split(/\s+/)[0] || null;
    let categorias = [];
    try {
      const [categoryRows] = await pool.query(
        "SELECT nome FROM categorias_financeiras WHERE user_id = ? AND tipo = 'despesa' ORDER BY nome LIMIT 40",
        [userId],
      );
      categorias = (categoryRows || []).map((row) => row.nome);
    } catch {
      /* categorias são só uma dica para o modelo */
    }
    let regras = [];
    try {
      regras = await actions.listRules(userId);
    } catch {
      /* regras são só uma dica; a ferramenta continua funcionando */
    }
    const system = buildSystemPrompt({ nome: firstName, hojeIso: todayDate(), diaSemana: dayName(), timezone, canWrite, categorias, regras });

    let body = {
      model,
      input: [{ role: 'system', content: system }, ...history, { role: 'user', content: userContent(message, attachment) }],
      tools: TOOLS,
      max_output_tokens: 1800,
      ...(reasoning ? { reasoning } : {}),
    };

    for (let step = 0; step < 6; step += 1) {
      const json = await callOpenAi(body);
      const calls = (json.output || []).filter((item) => item.type === 'function_call');
      if (!calls.length) {
        const reply = outputText(json);
        if (!reply) throw new Error('Resposta vazia do modelo');
        return { reply, actions: ctx.actions };
      }
      const outputs = [];
      for (const call of calls) {
        let result;
        try {
          result = await runTool(call.name, JSON.parse(call.arguments || '{}'), ctx);
        } catch (error) {
          log.warn?.(`[agente-ia] ferramenta ${call.name} falhou:`, error.message);
          result = { erro: error.message };
        }
        outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) });
      }
      body = {
        model,
        previous_response_id: json.id,
        input: outputs,
        tools: TOOLS,
        max_output_tokens: 1800,
        ...(reasoning ? { reasoning } : {}),
      };
    }
    throw new Error('O agente excedeu o limite de passos');
  }

  return { converse, TOOLS, formatBRL };
}
