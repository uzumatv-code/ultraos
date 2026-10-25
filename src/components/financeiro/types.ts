export type Resumo = {
  periodo: { mes: string; inicio: string; fim: string; fim_exclusivo: string; dias: number; hoje: string };
  caixa: { entradas: number; saidas: number; resultado: number; lancamentos: number; entradas_mes_anterior: number; saidas_mes_anterior: number };
  diario: Array<{ dia: string; entradas: number; saidas: number }>;
  competencia: {
    receita: number;
    custo_direto: number;
    despesa: number;
    investimento: number;
    resultado: number;
    margem: number;
    grupos: Array<{ chave: string; label: string; sinal: number; valor: number; quantidade: number }>;
  };
  recebiveis: {
    aberto: number;
    vencido: number;
    a_vencer: number;
    quantidade: number;
    quantidade_vencida: number;
    inadimplencia: number;
    aging: Array<{ chave: string; label: string; valor: number; quantidade: number }>;
  };
  pagaveis: { aberto: number; vencido: number; a_vencer: number; pago_mes: number; quantidade_vencida: number };
  projecao: Array<{ chave: string; label: string; entradas: number; saidas: number; saldo: number }>;
  serie: Array<{ mes: string; entradas: number; saidas: number; resultado: number }>;
  categorias: { receitas: Array<{ nome: string; cor: string; valor: number }>; despesas: Array<{ nome: string; cor: string; valor: number }> };
  indicadores: { os_concluidas: number; ticket_medio: number; valor_produzido: number; prazo_medio_recebimento: number };
};

export type Receivable = {
  id: string;
  descricao: string;
  valor: number;
  valor_recebido: number;
  saldo: number;
  data_vencimento: string;
  status: string;
  ordem_servico_id?: string;
  forma_pagamento?: string;
  dias_atraso: number;
  cliente_nome?: string;
  cliente_telefone?: string;
  ordem_numero?: number;
};

export type Payable = {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  status: string;
  forma_pagamento?: string;
  recorrente?: number;
  dias_atraso: number;
  categoria_nome?: string;
  categoria_cor?: string;
};
