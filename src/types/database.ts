export interface Cliente {
  id: string;
  nome: string;
  cpf_cnpj: string;
  telefone: string;
  avaliou?: boolean;
  created_at: string;
  user_id: string;
}

export interface Marca {
  id: string;
  nome: string;
  created_at: string;
  user_id: string;
}

export interface Instrumento {
  id: string;
  nome: string;
  created_at: string;
  user_id: string;
}

export interface Servico {
  id: string;
  nome: string;
  descricao: string;
  valor: number;
  created_at: string;
  user_id: string;
}

export interface Problema {
  id: string;
  nome: string;
  descricao: string;
  created_at: string;
  user_id: string;
}

export interface OrdemServico {
  id: string;
  numero: number;
  cliente_id: string;
  instrumento_id: string;
  marca_id: string;
  modelo: string;
  acessorios: string;
  problemas_ids: string[];
  problemas_descricoes?: Record<string, string>;
  problema_descricao: string;
  servicos_ids: string[];
  servicos_descricoes?: Record<string, string>;
  servico_descricao: string;
  valor_servicos: number;
  desconto: number;
  valor_total: number;
  valor_pago?: number;
  status_financeiro?: 'pendente' | 'parcial' | 'pago' | 'cancelado';
  data_ultimo_pagamento?: string;
  observacoes_financeiras?: string;
  forma_pagamento: 'credito' | 'debito' | 'pix' | 'dinheiro' | 'boleto' | 'misto' | 'a_definir';
  parcelas?: number;
  observacoes: string;
  data_entrada: string;
  data_previsao: string;
  data_entrega?: string;
  status: 'pendente' | 'em_andamento' | 'concluido' | 'cancelado' | 'atraso';
  solicita_avaliacao?: boolean;
  created_at: string;
  user_id: string;
  
  // Relacionamentos
  cliente?: Cliente;
  instrumento?: Instrumento;
  marca?: Marca;
  problemas?: Problema[];
  servicos?: Servico[];
  condicoes_pagamento?: OSCondicaoPagamento[];
}

export interface CategoriaFinanceira {
  id: string;
  nome: string;
  tipo: 'receita' | 'despesa';
  cor: string;
  created_at: string;
  user_id: string;
}

export type ContaStatus = 'pendente' | 'pago' | 'atrasado' | 'cancelado';
export type Periodicidade = 'unica' | 'diaria' | 'semanal' | 'quinzenal' | 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';

export interface ContaPagar {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_pagamento?: string;
  forma_pagamento?: string;
  parcelas?: number;
  status: ContaStatus;
  categoria_id?: string;
  recorrente: boolean;
  periodicidade: Periodicidade;
  observacoes?: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  categoria?: CategoriaFinanceira;
}

export interface TransacaoFinanceira {
  id: string;
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa';
  data: string;
  categoria_id: string;
  conta_pagar_id?: string;
  ordem_servico_id?: string;
  forma_pagamento?: string;
  comprovante_url?: string;
  origem?: string;
  created_at: string;
  updated_at?: string;
  user_id: string;
  categoria?: CategoriaFinanceira;
  conta_pagar?: ContaPagar;
}

export interface OsOcorrencia {
  id: string;
  ordem_servico_id: string;
  tipo: string;
  titulo: string;
  descricao: string;
  status: 'aberta' | 'resolvida';
  created_at: string;
}

export interface OsAditivoItem {
  id?: string;
  descricao: string;
  tipo?: string;
  quantidade: number;
  valor_unitario: number;
  valor_total?: number;
}

export interface OsAditivo {
  id: string;
  ordem_servico_id: string;
  ocorrencia_id?: string;
  numero: number;
  titulo: string;
  justificativa: string;
  valor_adicional: number;
  valor_total_anterior: number;
  valor_total_novo: number;
  prazo_novo?: string;
  status: 'rascunho' | 'enviado' | 'aprovado' | 'recusado';
  enviado_em?: string;
  aprovado_em?: string;
  recusado_em?: string;
  itens: OsAditivoItem[];
  created_at: string;
}

export interface WhatsAppConversa {
  id: string;
  cliente_id?: string;
  ordem_servico_id?: string;
  telefone: string;
  nome_contato?: string;
  cliente_nome?: string;
  ordem_numero?: number;
  status: 'aberta' | 'fechada';
  ultima_mensagem?: string;
  ultima_mensagem_em?: string;
  nao_lidas: number;
}

export interface WhatsAppMensagem {
  id: string;
  conversa_id: string;
  ordem_servico_id?: string;
  direcao: 'entrada' | 'saida';
  tipo: string;
  conteudo?: string;
  status: string;
  enviada_em: string;
  enviada_pelo_sistema?: boolean;
  anexo_id?: string;
  anexo_nome?: string;
}

export interface ContaReceber {
  id: string;
  descricao: string;
  valor: number;
  valor_recebido: number;
  data_vencimento?: string;
  data_recebimento?: string;
  status: 'pendente' | 'parcial' | 'recebido' | 'atrasado' | 'cancelado';
  categoria_id?: string;
  cliente_id?: string;
  ordem_servico_id?: string;
  forma_pagamento?: string;
  parcelas: number;
  parcela_atual: number;
  observacoes?: string;
  comprovante_url?: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  categoria?: CategoriaFinanceira;
  cliente?: Cliente;
  ordem_servico?: OrdemServico;
}

export interface OSPagamento {
  id: string;
  ordem_servico_id: string;
  cliente_id?: string;
  transacao_financeira_id?: string;
  valor: number;
  forma_pagamento?: string;
  data_pagamento: string;
  observacoes?: string;
  origem: string;
  status: 'confirmado' | 'estornado' | 'cancelado';
  created_at: string;
  updated_at: string;
  user_id: string;
}

export interface OSCondicaoPagamento {
  id: string;
  ordem_servico_id: string;
  pagamento_id?: string;
  valor: number;
  forma_pagamento?: 'credito' | 'debito' | 'pix' | 'dinheiro' | 'boleto' | 'a_definir';
  momento: 'agora' | 'retirada' | 'data';
  data_vencimento?: string;
  status: 'pendente' | 'recebido' | 'cancelado';
  observacoes?: string;
  ordem: number;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export interface FinanceiroIAAutorizado {
  id: string;
  nome: string;
  telefone: string;
  permissao: 'consulta' | 'escrita' | 'admin';
  nivel_acesso: 'operador' | 'gerente' | 'admin';
  ativo: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export interface FinanceiroIALog {
  id: string;
  autorizado_id?: string;
  telefone: string;
  mensagem?: string;
  tipo_mensagem: 'texto' | 'audio';
  intencao?: string;
  entidades?: any;
  status: string;
  resposta?: string;
  confirmacao_token?: string;
  confirmado_em?: string;
  erro?: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  autorizado?: FinanceiroIAAutorizado;
}

// Tipos para NFS-e
export interface EmpresaFiscal {
  id: string;
  user_id: string;
  razao_social: string;
  nome_fantasia?: string;
  cnpj: string;
  inscricao_municipal: string;
  inscricao_estadual?: string;
  endereco: string;
  numero: string;
  complemento?: string;
  bairro: string;
  codigo_municipio: string;
  uf: string;
  cep: string;
  telefone?: string;
  email?: string;
  regime_tributacao: number;
  optante_simples_nacional: boolean;
  incentivo_fiscal: boolean;
  aliquota_iss: number;
  item_lista_servico: string;
  codigo_cnae?: string;
  codigo_tributacao_municipio?: string;
  serie_rps: string;
  ultimo_numero_rps: number;
  certificado_path?: string;
  certificado_senha_encrypted?: string;
  ambiente: 'homologacao' | 'producao';
  created_at: string;
  updated_at: string;
}

export type NFSeStatus = 'rascunho' | 'enviado' | 'processando' | 'autorizado' | 'rejeitado' | 'cancelado';

export interface NotaFiscal {
  id: string;
  user_id: string;
  ordem_servico_id: string;
  aditivo_id?: string;
  tipo_origem?: 'os_consolidada' | 'aditivo' | 'substituicao';
  nota_substituida_id?: string;
  tipo_evento_fiscal?: 'emissao' | 'substituicao';
  motivo_substituicao?: string;
  numero_nfse?: string;
  codigo_verificacao?: string;
  numero_rps: string;
  serie_rps: string;
  data_emissao: string;
  competencia: string;
  discriminacao: string;
  valor_servicos: number;
  valor_deducoes: number;
  valor_pis: number;
  valor_cofins: number;
  valor_inss: number;
  valor_ir: number;
  valor_csll: number;
  outras_retencoes: number;
  valor_tributos: number;
  valor_iss: number;
  aliquota: number;
  desconto_incondicionado: number;
  desconto_condicionado: number;
  iss_retido: boolean;
  item_lista_servico: string;
  codigo_cnae?: string;
  codigo_tributacao_municipio?: string;
  codigo_municipio_prestacao: string;
  exigibilidade_iss: number;
  municipio_incidencia: string;
  status: NFSeStatus;
  protocolo?: string;
  mensagem_retorno?: string;
  xml_envio?: string;
  xml_retorno?: string;
  url_nota?: string;
  data_cancelamento?: string;
  motivo_cancelamento?: string;
  created_at: string;
  updated_at: string;
  
  // Relacionamentos
  ordem_servico?: OrdemServico;
}

export interface NFSeLog {
  id: string;
  nota_fiscal_id: string;
  user_id: string;
  tipo_operacao: 'gerar' | 'consultar' | 'cancelar';
  status: 'sucesso' | 'erro';
  mensagem?: string;
  xml_enviado?: string;
  xml_recebido?: string;
  created_at: string;
}
