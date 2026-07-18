import 'dotenv/config';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL || process.env.MYSQL_URL;

if (!DATABASE_URL) {
  throw new Error('Configure DATABASE_URL ou MYSQL_URL antes de executar a migracao.');
}

const nowSql = () => new Date().toISOString();
const SERVICOS_PRIME_TERMS = 'A Vibratho instrumentos não fornece serviços de luthieria. Os serviços executados e valores recebidos são de total responsabilidade da Serviços Prime Luthieria, CNPJ: 30.057.854/0001-75. A empresa funciona nas dependências da Vibratho, porém não tem vínculo algum; apenas compartilhamos o mesmo interesse, que é atender as demandas de nossos clientes.';

const createTables = [
  `CREATE TABLE IF NOT EXISTS usuarios (
    id varchar(36) NOT NULL PRIMARY KEY,
    email varchar(255) NOT NULL,
    senha_hash varchar(255) NOT NULL,
    nome varchar(255) DEFAULT NULL,
    avatar_url varchar(500) DEFAULT NULL,
    conta_id varchar(36) DEFAULT NULL,
    nivel varchar(50) DEFAULT 'admin',
    plano_atual varchar(50) DEFAULT 'trial',
    dias_restantes int DEFAULT 14,
    status_assinatura varchar(50) DEFAULT 'ativo',
    ativo tinyint(1) DEFAULT 1,
    email_verificado tinyint(1) DEFAULT 1,
    senha_alterada_em varchar(50) DEFAULT NULL,
    ultimo_login varchar(50) DEFAULT NULL,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    UNIQUE KEY unique_usuarios_email (email),
    INDEX idx_usuarios_email (email),
    INDEX idx_usuarios_conta (conta_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS auditoria (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    actor_user_id varchar(36) NOT NULL,
    actor_email varchar(255) DEFAULT NULL,
    actor_role varchar(50) NOT NULL,
    acao varchar(80) NOT NULL,
    recurso varchar(80) NOT NULL,
    recurso_id varchar(36) DEFAULT NULL,
    detalhes json DEFAULT NULL,
    ip_address varchar(45) DEFAULT NULL,
    created_at varchar(50) NOT NULL,
    INDEX idx_auditoria_conta (user_id),
    INDEX idx_auditoria_actor (actor_user_id),
    INDEX idx_auditoria_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS recuperacoes_senha (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    token_hash char(64) NOT NULL,
    expires_at varchar(50) NOT NULL,
    used_at varchar(50) DEFAULT NULL,
    requested_ip varchar(45) DEFAULT NULL,
    created_at varchar(50) NOT NULL,
    UNIQUE KEY unique_recuperacoes_senha_token (token_hash),
    INDEX idx_recuperacoes_senha_user (user_id),
    INDEX idx_recuperacoes_senha_expires (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS clientes (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    nome varchar(255) NOT NULL,
    cpf_cnpj varchar(30) DEFAULT NULL,
    telefone varchar(30) DEFAULT NULL,
    email varchar(255) DEFAULT NULL,
    endereco text DEFAULT NULL,
    avaliou tinyint(1) DEFAULT 0,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_clientes_user (user_id),
    INDEX idx_clientes_nome (nome),
    INDEX idx_clientes_cpf_cnpj (cpf_cnpj)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS marcas (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    nome varchar(255) NOT NULL,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_marcas_user (user_id),
    INDEX idx_marcas_nome (nome)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS instrumentos (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    nome varchar(255) NOT NULL,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_instrumentos_user (user_id),
    INDEX idx_instrumentos_nome (nome)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS equipamentos (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    nome varchar(255) NOT NULL,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_equipamentos_user (user_id),
    INDEX idx_equipamentos_nome (nome)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS servicos (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    nome varchar(255) NOT NULL,
    descricao text DEFAULT NULL,
    valor decimal(10,2) DEFAULT 0.00,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_servicos_user (user_id),
    INDEX idx_servicos_nome (nome)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS problemas (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    nome varchar(255) NOT NULL,
    descricao text DEFAULT NULL,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_problemas_user (user_id),
    INDEX idx_problemas_nome (nome)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS categorias_financeiras (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    nome varchar(255) NOT NULL,
    tipo varchar(20) NOT NULL,
    cor varchar(20) DEFAULT '#3B82F6',
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_categorias_user (user_id),
    INDEX idx_categorias_tipo (tipo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ordens_servico (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    numero int NOT NULL,
    cliente_id varchar(36) NOT NULL,
    instrumento_id varchar(36) DEFAULT NULL,
    equipamento_id varchar(36) DEFAULT NULL,
    marca_id varchar(36) DEFAULT NULL,
    modelo varchar(255) DEFAULT NULL,
    acessorios text DEFAULT NULL,
    problemas_ids json DEFAULT NULL,
    problemas_descricoes json DEFAULT NULL,
    problema_descricao text DEFAULT NULL,
    servicos_ids json DEFAULT NULL,
    servicos_descricoes json DEFAULT NULL,
    servico_descricao text DEFAULT NULL,
    valor_servicos decimal(10,2) DEFAULT 0.00,
    desconto decimal(10,2) DEFAULT 0.00,
    valor_total decimal(10,2) DEFAULT 0.00,
    valor_pago decimal(10,2) DEFAULT 0.00,
    status_financeiro varchar(50) DEFAULT 'pendente',
    data_ultimo_pagamento varchar(50) DEFAULT NULL,
    observacoes_financeiras text DEFAULT NULL,
    forma_pagamento varchar(50) DEFAULT 'pix',
    parcelas int DEFAULT 1,
    observacoes text DEFAULT NULL,
    data_entrada varchar(50) DEFAULT NULL,
    data_previsao varchar(50) DEFAULT NULL,
    data_entrega varchar(50) DEFAULT NULL,
    status varchar(50) DEFAULT 'pendente',
    solicita_avaliacao tinyint(1) DEFAULT 0,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    UNIQUE KEY unique_ordem_numero_user (user_id, numero),
    INDEX idx_ordens_user (user_id),
    INDEX idx_ordens_numero (numero),
    INDEX idx_ordens_cliente (cliente_id),
    INDEX idx_ordens_status (status),
    INDEX idx_ordens_data_previsao (data_previsao),
    INDEX idx_ordens_data_entrada (data_entrada)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS contas_pagar (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    descricao varchar(255) NOT NULL,
    valor decimal(10,2) NOT NULL DEFAULT 0.00,
    data_vencimento varchar(50) NOT NULL,
    data_pagamento varchar(50) DEFAULT NULL,
    forma_pagamento varchar(50) DEFAULT NULL,
    parcelas int DEFAULT 1,
    status varchar(50) DEFAULT 'pendente',
    categoria_id varchar(36) DEFAULT NULL,
    recorrente tinyint(1) DEFAULT 0,
    periodicidade varchar(50) DEFAULT 'unica',
    observacoes text DEFAULT NULL,
    comprovante_url varchar(500) DEFAULT NULL,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_contas_user (user_id),
    INDEX idx_contas_status (status),
    INDEX idx_contas_vencimento (data_vencimento),
    INDEX idx_contas_categoria (categoria_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS transacoes_financeiras (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    descricao varchar(255) NOT NULL,
    valor decimal(10,2) NOT NULL DEFAULT 0.00,
    tipo varchar(20) NOT NULL,
    data varchar(50) NOT NULL,
    categoria_id varchar(36) DEFAULT NULL,
    conta_pagar_id varchar(36) DEFAULT NULL,
    ordem_servico_id varchar(36) DEFAULT NULL,
    forma_pagamento varchar(50) DEFAULT NULL,
    comprovante_url varchar(500) DEFAULT NULL,
    origem varchar(50) DEFAULT 'manual',
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_transacoes_user (user_id),
    INDEX idx_transacoes_tipo (tipo),
    INDEX idx_transacoes_data (data),
    INDEX idx_transacoes_categoria (categoria_id),
    INDEX idx_transacoes_ordem (ordem_servico_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS contas_receber (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    ordem_servico_id varchar(36) DEFAULT NULL,
    cliente_id varchar(36) DEFAULT NULL,
    descricao varchar(255) NOT NULL,
    valor decimal(10,2) NOT NULL DEFAULT 0.00,
    valor_recebido decimal(10,2) DEFAULT 0.00,
    data_vencimento varchar(50) DEFAULT NULL,
    data_recebimento varchar(50) DEFAULT NULL,
    status varchar(50) DEFAULT 'pendente',
    categoria_id varchar(36) DEFAULT NULL,
    forma_pagamento varchar(50) DEFAULT NULL,
    parcelas int DEFAULT 1,
    parcela_atual int DEFAULT 1,
    observacoes text DEFAULT NULL,
    comprovante_url varchar(500) DEFAULT NULL,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    UNIQUE KEY unique_conta_receber_ordem_user (user_id, ordem_servico_id),
    INDEX idx_contas_receber_user (user_id),
    INDEX idx_contas_receber_status (status),
    INDEX idx_contas_receber_vencimento (data_vencimento),
    INDEX idx_contas_receber_cliente (cliente_id),
    INDEX idx_contas_receber_ordem (ordem_servico_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS os_pagamentos (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    ordem_servico_id varchar(36) NOT NULL,
    cliente_id varchar(36) DEFAULT NULL,
    transacao_financeira_id varchar(36) DEFAULT NULL,
    valor decimal(10,2) NOT NULL DEFAULT 0.00,
    forma_pagamento varchar(50) DEFAULT NULL,
    data_pagamento varchar(50) NOT NULL,
    observacoes text DEFAULT NULL,
    origem varchar(50) DEFAULT 'manual',
    status varchar(50) DEFAULT 'confirmado',
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_os_pagamentos_user (user_id),
    INDEX idx_os_pagamentos_ordem (ordem_servico_id),
    INDEX idx_os_pagamentos_cliente (cliente_id),
    INDEX idx_os_pagamentos_data (data_pagamento),
    INDEX idx_os_pagamentos_transacao (transacao_financeira_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS anexos_financeiros (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    transacao_financeira_id varchar(36) DEFAULT NULL,
    conta_pagar_id varchar(36) DEFAULT NULL,
    conta_receber_id varchar(36) DEFAULT NULL,
    ordem_servico_id varchar(36) DEFAULT NULL,
    nome_arquivo varchar(255) NOT NULL,
    caminho varchar(500) NOT NULL,
    tipo_mime varchar(100) DEFAULT NULL,
    tamanho_bytes int DEFAULT NULL,
    created_at varchar(50) DEFAULT NULL,
    INDEX idx_anexos_financeiros_user (user_id),
    INDEX idx_anexos_financeiros_transacao (transacao_financeira_id),
    INDEX idx_anexos_financeiros_conta_pagar (conta_pagar_id),
    INDEX idx_anexos_financeiros_conta_receber (conta_receber_id),
    INDEX idx_anexos_financeiros_ordem (ordem_servico_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS financeiro_ia_autorizados (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    nome varchar(255) NOT NULL,
    telefone varchar(30) NOT NULL,
    permissao varchar(50) DEFAULT 'consulta',
    nivel_acesso varchar(50) DEFAULT 'operador',
    ativo tinyint(1) DEFAULT 1,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    UNIQUE KEY unique_financeiro_ia_phone_user (user_id, telefone),
    INDEX idx_financeiro_ia_aut_user (user_id),
    INDEX idx_financeiro_ia_aut_telefone (telefone),
    INDEX idx_financeiro_ia_aut_ativo (ativo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS financeiro_ia_logs (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    autorizado_id varchar(36) DEFAULT NULL,
    telefone varchar(30) NOT NULL,
    mensagem text DEFAULT NULL,
    tipo_mensagem varchar(50) DEFAULT 'texto',
    intencao varchar(100) DEFAULT NULL,
    entidades json DEFAULT NULL,
    status varchar(50) DEFAULT 'recebido',
    resposta text DEFAULT NULL,
    confirmacao_token varchar(100) DEFAULT NULL,
    confirmado_em varchar(50) DEFAULT NULL,
    erro text DEFAULT NULL,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_financeiro_ia_logs_user (user_id),
    INDEX idx_financeiro_ia_logs_telefone (telefone),
    INDEX idx_financeiro_ia_logs_status (status),
    INDEX idx_financeiro_ia_logs_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS configuracoes_empresa (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    nome_empresa varchar(255) DEFAULT NULL,
    cnpj varchar(30) DEFAULT NULL,
    telefone varchar(30) DEFAULT NULL,
    telefone_empresa varchar(30) DEFAULT NULL,
    email varchar(255) DEFAULT NULL,
    horario_funcionamento varchar(100) DEFAULT NULL,
    dias_funcionamento varchar(100) DEFAULT NULL,
    logo_url varchar(500) DEFAULT NULL,
    endereco text DEFAULT NULL,
    termos_de_uso text DEFAULT NULL,
    google_review_link varchar(500) DEFAULT NULL,
    instagram_handle varchar(100) DEFAULT NULL,
    avaliacoes_enabled tinyint(1) DEFAULT 1,
    avaliacoes_days_after_completion int DEFAULT 7,
    avaliacoes_trigger_hour int DEFAULT 11,
    avaliacoes_daily_limit int DEFAULT 20,
    avaliacoes_min_interval_seconds int DEFAULT 20,
    avaliacoes_last_processed_date varchar(10) DEFAULT NULL,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    UNIQUE KEY unique_config_empresa_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS configuracoes_whatsapp (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    method varchar(30) DEFAULT 'direct',
    webhook_url varchar(500) DEFAULT NULL,
    api_key varchar(255) DEFAULT NULL,
    instance_name varchar(100) DEFAULT NULL,
    provider varchar(30) DEFAULT 'evolution',
    status varchar(30) DEFAULT 'nao_configurado',
    phone_number varchar(30) DEFAULT NULL,
    profile_name varchar(255) DEFAULT NULL,
    profile_picture_url varchar(500) DEFAULT NULL,
    connected_at varchar(50) DEFAULT NULL,
    disconnected_at varchar(50) DEFAULT NULL,
    last_event_at varchar(50) DEFAULT NULL,
    last_checked_at varchar(50) DEFAULT NULL,
    disconnect_reason varchar(100) DEFAULT NULL,
    connection_status_code int DEFAULT NULL,
    last_error text DEFAULT NULL,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    UNIQUE KEY unique_config_whatsapp_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS system_settings (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    logo_url varchar(500) DEFAULT NULL,
    site_title varchar(255) DEFAULT 'Sistema OS',
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    UNIQUE KEY unique_system_settings_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS templates_mensagem (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    tipo varchar(50) NOT NULL,
    template_name varchar(255) DEFAULT NULL,
    conteudo text NOT NULL,
    variables json DEFAULT NULL,
    ativo tinyint(1) DEFAULT 1,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    UNIQUE KEY unique_template_tipo_user (user_id, tipo),
    INDEX idx_templates_user (user_id),
    INDEX idx_templates_tipo (tipo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS whatsapp_mensagens_log (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    actor_user_id varchar(36) DEFAULT NULL,
    ordem_servico_id varchar(36) DEFAULT NULL,
    template_id varchar(36) DEFAULT NULL,
    template_type varchar(50) DEFAULT NULL,
    template_updated_at varchar(50) DEFAULT NULL,
    telefone varchar(30) NOT NULL,
    mensagem text NOT NULL,
    status varchar(30) NOT NULL,
    provider varchar(30) DEFAULT 'evolution',
    provider_message_id varchar(255) DEFAULT NULL,
    erro text DEFAULT NULL,
    created_at varchar(50) NOT NULL,
    updated_at varchar(50) NOT NULL,
    INDEX idx_whatsapp_log_user (user_id),
    INDEX idx_whatsapp_log_order (ordem_servico_id),
    INDEX idx_whatsapp_log_template (template_type),
    INDEX idx_whatsapp_log_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS empresa_fiscal (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    razao_social varchar(255) NOT NULL,
    nome_fantasia varchar(255) DEFAULT NULL,
    cnpj varchar(20) NOT NULL,
    inscricao_municipal varchar(50) NOT NULL,
    inscricao_estadual varchar(50) DEFAULT NULL,
    endereco varchar(255) NOT NULL,
    numero varchar(20) NOT NULL,
    complemento varchar(100) DEFAULT NULL,
    bairro varchar(100) NOT NULL,
    codigo_municipio varchar(10) NOT NULL,
    uf char(2) NOT NULL,
    cep varchar(10) NOT NULL,
    telefone varchar(30) DEFAULT NULL,
    email varchar(255) DEFAULT NULL,
    regime_tributacao int NOT NULL,
    optante_simples_nacional tinyint(1) DEFAULT 0,
    incentivo_fiscal tinyint(1) DEFAULT 0,
    aliquota_iss decimal(5,2) DEFAULT 0.00,
    item_lista_servico varchar(10) NOT NULL,
    codigo_cnae varchar(20) DEFAULT NULL,
    codigo_tributacao_municipio varchar(20) DEFAULT NULL,
    serie_rps varchar(10) DEFAULT '1',
    ultimo_numero_rps int DEFAULT 0,
    certificado_path varchar(500) DEFAULT NULL,
    certificado_senha_encrypted varchar(800) DEFAULT NULL,
    ambiente varchar(30) DEFAULT 'homologacao',
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    UNIQUE KEY unique_empresa_fiscal_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS notas_fiscais (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    ordem_servico_id varchar(36) NOT NULL,
    numero_nfse varchar(50) DEFAULT NULL,
    codigo_verificacao varchar(50) DEFAULT NULL,
    numero_rps varchar(20) NOT NULL,
    serie_rps varchar(10) NOT NULL,
    data_emissao varchar(50) NOT NULL,
    competencia varchar(7) NOT NULL,
    discriminacao text NOT NULL,
    valor_servicos decimal(10,2) NOT NULL,
    valor_deducoes decimal(10,2) DEFAULT 0.00,
    valor_pis decimal(10,2) DEFAULT 0.00,
    valor_cofins decimal(10,2) DEFAULT 0.00,
    valor_inss decimal(10,2) DEFAULT 0.00,
    valor_ir decimal(10,2) DEFAULT 0.00,
    valor_csll decimal(10,2) DEFAULT 0.00,
    outras_retencoes decimal(10,2) DEFAULT 0.00,
    valor_tributos decimal(10,2) DEFAULT 0.00,
    valor_iss decimal(10,2) DEFAULT 0.00,
    aliquota decimal(5,2) DEFAULT 0.00,
    desconto_incondicionado decimal(10,2) DEFAULT 0.00,
    desconto_condicionado decimal(10,2) DEFAULT 0.00,
    iss_retido tinyint(1) DEFAULT 0,
    item_lista_servico varchar(10) NOT NULL,
    codigo_cnae varchar(20) DEFAULT NULL,
    codigo_tributacao_municipio varchar(20) DEFAULT NULL,
    codigo_municipio_prestacao varchar(10) NOT NULL,
    exigibilidade_iss int DEFAULT 1,
    municipio_incidencia varchar(10) NOT NULL,
    status varchar(50) DEFAULT 'rascunho',
    protocolo varchar(100) DEFAULT NULL,
    mensagem_retorno text DEFAULT NULL,
    xml_envio longtext DEFAULT NULL,
    xml_retorno longtext DEFAULT NULL,
    url_nota varchar(500) DEFAULT NULL,
    data_cancelamento varchar(50) DEFAULT NULL,
    motivo_cancelamento text DEFAULT NULL,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_nf_user (user_id),
    INDEX idx_nf_ordem (ordem_servico_id),
    INDEX idx_nf_status (status),
    INDEX idx_nf_numero (numero_nfse)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS nfse_logs (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    nota_fiscal_id varchar(36) NOT NULL,
    tipo_operacao varchar(50) NOT NULL,
    status varchar(50) NOT NULL,
    mensagem text DEFAULT NULL,
    xml_enviado longtext DEFAULT NULL,
    xml_recebido longtext DEFAULT NULL,
    created_at varchar(50) DEFAULT NULL,
    INDEX idx_nfse_logs_nf (nota_fiscal_id),
    INDEX idx_nfse_logs_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS agenda_logs (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    ordem_servico_id varchar(36) NOT NULL,
    data_anterior varchar(50) NOT NULL,
    data_nova varchar(50) NOT NULL,
    profissional_anterior varchar(100) DEFAULT NULL,
    profissional_novo varchar(100) DEFAULT NULL,
    acao varchar(50) DEFAULT 'reagendamento',
    created_at varchar(50) DEFAULT NULL,
    INDEX idx_agenda_logs_user (user_id),
    INDEX idx_agenda_logs_ordem (ordem_servico_id),
    INDEX idx_agenda_logs_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS avaliacoes_lembretes (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    ordem_servico_id varchar(36) NOT NULL,
    cliente_id varchar(36) NOT NULL,
    telefone varchar(30) DEFAULT NULL,
    mensagem text DEFAULT NULL,
    data_envio varchar(50) DEFAULT NULL,
    status varchar(50) DEFAULT 'pendente',
    avaliacao int DEFAULT NULL,
    comentario text DEFAULT NULL,
    mensagem_erro text DEFAULT NULL,
    tentativas int DEFAULT 0,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    UNIQUE KEY unique_avaliacao_ordem_user (user_id, ordem_servico_id),
    INDEX idx_avaliacoes_user (user_id),
    INDEX idx_avaliacoes_ordem (ordem_servico_id),
    INDEX idx_avaliacoes_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS sessoes (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    token_hash varchar(255) NOT NULL,
    refresh_token_hash varchar(255) DEFAULT NULL,
    ip_address varchar(45) DEFAULT NULL,
    user_agent text DEFAULT NULL,
    expires_at varchar(50) NOT NULL,
    created_at varchar(50) DEFAULT NULL,
    INDEX idx_sessoes_user (user_id),
    INDEX idx_sessoes_expires (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const requiredColumns = {
  usuarios: {
    nome: 'varchar(255) DEFAULT NULL',
    avatar_url: 'varchar(500) DEFAULT NULL',
    conta_id: 'varchar(36) DEFAULT NULL',
    nivel: "varchar(50) DEFAULT 'admin'",
    plano_atual: "varchar(50) DEFAULT 'trial'",
    dias_restantes: 'int DEFAULT 14',
    status_assinatura: "varchar(50) DEFAULT 'ativo'",
    ativo: 'tinyint(1) DEFAULT 1',
    email_verificado: 'tinyint(1) DEFAULT 1',
    senha_alterada_em: 'varchar(50) DEFAULT NULL',
    ultimo_login: 'varchar(50) DEFAULT NULL',
    updated_at: 'varchar(50) DEFAULT NULL',
  },
  clientes: {
    cpf_cnpj: 'varchar(30) DEFAULT NULL',
    telefone: 'varchar(30) DEFAULT NULL',
    email: 'varchar(255) DEFAULT NULL',
    endereco: 'text DEFAULT NULL',
    avaliou: 'tinyint(1) DEFAULT 0',
    updated_at: 'varchar(50) DEFAULT NULL',
  },
  marcas: { updated_at: 'varchar(50) DEFAULT NULL' },
  instrumentos: { updated_at: 'varchar(50) DEFAULT NULL' },
  servicos: { updated_at: 'varchar(50) DEFAULT NULL' },
  problemas: { updated_at: 'varchar(50) DEFAULT NULL' },
  categorias_financeiras: { updated_at: 'varchar(50) DEFAULT NULL' },
  ordens_servico: {
    instrumento_id: 'varchar(36) DEFAULT NULL',
    equipamento_id: 'varchar(36) DEFAULT NULL',
    marca_id: 'varchar(36) DEFAULT NULL',
    acessorios: 'text DEFAULT NULL',
    problemas_ids: 'json DEFAULT NULL',
    problemas_descricoes: 'json DEFAULT NULL',
    problema_descricao: 'text DEFAULT NULL',
    servicos_ids: 'json DEFAULT NULL',
    servicos_descricoes: 'json DEFAULT NULL',
    servico_descricao: 'text DEFAULT NULL',
    valor_servicos: 'decimal(10,2) DEFAULT 0.00',
    desconto: 'decimal(10,2) DEFAULT 0.00',
    valor_total: 'decimal(10,2) DEFAULT 0.00',
    valor_pago: 'decimal(10,2) DEFAULT 0.00',
    status_financeiro: "varchar(50) DEFAULT 'pendente'",
    data_ultimo_pagamento: 'varchar(50) DEFAULT NULL',
    observacoes_financeiras: 'text DEFAULT NULL',
    forma_pagamento: "varchar(50) DEFAULT 'pix'",
    parcelas: 'int DEFAULT 1',
    observacoes: 'text DEFAULT NULL',
    data_entrega: 'varchar(50) DEFAULT NULL',
    solicita_avaliacao: 'tinyint(1) DEFAULT 0',
    updated_at: 'varchar(50) DEFAULT NULL',
  },
  contas_pagar: {
    forma_pagamento: 'varchar(50) DEFAULT NULL',
    parcelas: 'int DEFAULT 1',
    comprovante_url: 'varchar(500) DEFAULT NULL',
    updated_at: 'varchar(50) DEFAULT NULL',
  },
  transacoes_financeiras: {
    conta_pagar_id: 'varchar(36) DEFAULT NULL',
    ordem_servico_id: 'varchar(36) DEFAULT NULL',
    forma_pagamento: 'varchar(50) DEFAULT NULL',
    comprovante_url: 'varchar(500) DEFAULT NULL',
    origem: "varchar(50) DEFAULT 'manual'",
    updated_at: 'varchar(50) DEFAULT NULL',
  },
  contas_receber: {
    categoria_id: 'varchar(36) DEFAULT NULL',
    forma_pagamento: 'varchar(50) DEFAULT NULL',
    parcelas: 'int DEFAULT 1',
    parcela_atual: 'int DEFAULT 1',
    observacoes: 'text DEFAULT NULL',
    comprovante_url: 'varchar(500) DEFAULT NULL',
    updated_at: 'varchar(50) DEFAULT NULL',
  },
  os_pagamentos: {
    cliente_id: 'varchar(36) DEFAULT NULL',
    transacao_financeira_id: 'varchar(36) DEFAULT NULL',
    forma_pagamento: 'varchar(50) DEFAULT NULL',
    observacoes: 'text DEFAULT NULL',
    origem: "varchar(50) DEFAULT 'manual'",
    status: "varchar(50) DEFAULT 'confirmado'",
    updated_at: 'varchar(50) DEFAULT NULL',
  },
  configuracoes_whatsapp: {
    provider: "varchar(30) DEFAULT 'evolution'",
    status: "varchar(30) DEFAULT 'nao_configurado'",
    phone_number: 'varchar(30) DEFAULT NULL',
    profile_name: 'varchar(255) DEFAULT NULL',
    profile_picture_url: 'varchar(500) DEFAULT NULL',
    connected_at: 'varchar(50) DEFAULT NULL',
    disconnected_at: 'varchar(50) DEFAULT NULL',
    last_event_at: 'varchar(50) DEFAULT NULL',
    last_checked_at: 'varchar(50) DEFAULT NULL',
    disconnect_reason: 'varchar(100) DEFAULT NULL',
    connection_status_code: 'int DEFAULT NULL',
    last_error: 'text DEFAULT NULL',
  },
  configuracoes_empresa: {
    cnpj: 'varchar(30) DEFAULT NULL',
    telefone: 'varchar(30) DEFAULT NULL',
    telefone_empresa: 'varchar(30) DEFAULT NULL',
    email: 'varchar(255) DEFAULT NULL',
    logo_url: 'varchar(500) DEFAULT NULL',
    endereco: 'text DEFAULT NULL',
    termos_de_uso: 'text DEFAULT NULL',
    google_review_link: 'varchar(500) DEFAULT NULL',
    instagram_handle: 'varchar(100) DEFAULT NULL',
    avaliacoes_enabled: 'tinyint(1) DEFAULT 1',
    avaliacoes_days_after_completion: 'int DEFAULT 7',
    avaliacoes_trigger_hour: 'int DEFAULT 11',
    avaliacoes_daily_limit: 'int DEFAULT 20',
    avaliacoes_min_interval_seconds: 'int DEFAULT 20',
    avaliacoes_last_processed_date: 'varchar(10) DEFAULT NULL',
    updated_at: 'varchar(50) DEFAULT NULL',
  },
  templates_mensagem: {
    template_name: 'varchar(255) DEFAULT NULL',
    variables: 'json DEFAULT NULL',
    updated_at: 'varchar(50) DEFAULT NULL',
  },
  avaliacoes_lembretes: {
    telefone: 'varchar(30) DEFAULT NULL',
    mensagem: 'text DEFAULT NULL',
    mensagem_erro: 'text DEFAULT NULL',
    tentativas: 'int DEFAULT 0',
    updated_at: 'varchar(50) DEFAULT NULL',
  },
};

const modifyColumns = [
  ['usuarios', 'ultimo_login', 'varchar(50) DEFAULT NULL'],
  ['usuarios', 'created_at', 'varchar(50) DEFAULT NULL'],
  ['usuarios', 'updated_at', 'varchar(50) DEFAULT NULL'],
  ['ordens_servico', 'data_entrada', 'varchar(50) DEFAULT NULL'],
  ['ordens_servico', 'data_previsao', 'varchar(50) DEFAULT NULL'],
  ['ordens_servico', 'data_entrega', 'varchar(50) DEFAULT NULL'],
  ['ordens_servico', 'status', "varchar(50) DEFAULT 'pendente'"],
  ['ordens_servico', 'forma_pagamento', "varchar(50) DEFAULT 'pix'"],
  ['contas_pagar', 'data_vencimento', 'varchar(50) NOT NULL'],
  ['contas_pagar', 'data_pagamento', 'varchar(50) DEFAULT NULL'],
  ['contas_pagar', 'status', "varchar(50) DEFAULT 'pendente'"],
  ['transacoes_financeiras', 'data', 'varchar(50) NOT NULL'],
  ['contas_receber', 'data_vencimento', 'varchar(50) DEFAULT NULL'],
  ['contas_receber', 'data_recebimento', 'varchar(50) DEFAULT NULL'],
  ['notas_fiscais', 'data_emissao', 'varchar(50) NOT NULL'],
  ['notas_fiscais', 'data_cancelamento', 'varchar(50) DEFAULT NULL'],
  ['avaliacoes_lembretes', 'data_envio', 'varchar(50) DEFAULT NULL'],
  ['avaliacoes_lembretes', 'status', "varchar(50) DEFAULT 'pendente'"],
];

const indexes = [
  ['usuarios', 'unique_usuarios_email', 'ALTER TABLE usuarios ADD UNIQUE KEY unique_usuarios_email (email)'],
  ['usuarios', 'idx_usuarios_conta', 'ALTER TABLE usuarios ADD INDEX idx_usuarios_conta (conta_id)'],
  ['ordens_servico', 'unique_ordem_numero_user', 'ALTER TABLE ordens_servico ADD UNIQUE KEY unique_ordem_numero_user (user_id, numero)'],
  ['contas_receber', 'unique_conta_receber_ordem_user', 'ALTER TABLE contas_receber ADD UNIQUE KEY unique_conta_receber_ordem_user (user_id, ordem_servico_id)'],
  ['avaliacoes_lembretes', 'unique_avaliacao_ordem_user', 'ALTER TABLE avaliacoes_lembretes ADD UNIQUE KEY unique_avaliacao_ordem_user (user_id, ordem_servico_id)'],
  ['financeiro_ia_autorizados', 'unique_financeiro_ia_phone_user', 'ALTER TABLE financeiro_ia_autorizados ADD UNIQUE KEY unique_financeiro_ia_phone_user (user_id, telefone)'],
  ['configuracoes_empresa', 'unique_config_empresa_user', 'ALTER TABLE configuracoes_empresa ADD UNIQUE KEY unique_config_empresa_user (user_id)'],
  ['configuracoes_whatsapp', 'unique_config_whatsapp_user', 'ALTER TABLE configuracoes_whatsapp ADD UNIQUE KEY unique_config_whatsapp_user (user_id)'],
  ['system_settings', 'unique_system_settings_user', 'ALTER TABLE system_settings ADD UNIQUE KEY unique_system_settings_user (user_id)'],
  ['templates_mensagem', 'unique_template_tipo_user', 'ALTER TABLE templates_mensagem ADD UNIQUE KEY unique_template_tipo_user (user_id, tipo)'],
];

async function safeStep(label, fn, { warnOnly = true } = {}) {
  try {
    await fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    const message = `Falha em ${label}: ${error.message}`;
    if (!warnOnly) throw new Error(message);
    console.warn(`AVISO  ${message}`);
  }
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS total
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return Number(rows[0]?.total || 0) > 0;
}

function expectedColumnDefinition(definition) {
  const type = definition.match(/^\s*([^\s]+)/)?.[1]?.toLowerCase() || '';
  const nullable = !/\bNOT\s+NULL\b/i.test(definition);
  const defaultMatch = definition.match(/\bDEFAULT\s+(NULL|'(?:''|[^'])*'|[^\s]+)/i);
  let defaultValue = null;
  if (defaultMatch && defaultMatch[1].toUpperCase() !== 'NULL') {
    defaultValue = defaultMatch[1].replace(/^'|'$/g, '').replace(/''/g, "'");
  }
  return { type, nullable, defaultValue };
}

async function columnDefinitionMatches(conn, table, column, definition) {
  const [rows] = await conn.query(
    `SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  const current = rows[0];
  if (!current) return false;
  const expected = expectedColumnDefinition(definition);
  return String(current.COLUMN_TYPE || '').toLowerCase() === expected.type
    && (current.IS_NULLABLE === 'YES') === expected.nullable
    && String(current.COLUMN_DEFAULT ?? '') === String(expected.defaultValue ?? '');
}

async function indexExists(conn, table, indexName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS total
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName],
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function addMissingColumns(conn) {
  for (const [table, columns] of Object.entries(requiredColumns)) {
    if (!(await tableExists(conn, table))) continue;
    for (const [column, definition] of Object.entries(columns)) {
      if (await columnExists(conn, table, column)) continue;
      await safeStep(`adicionar coluna ${table}.${column}`, () => conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`));
    }
  }
}

async function modifyExistingColumns(conn) {
  for (const [table, column, definition] of modifyColumns) {
    if (!(await tableExists(conn, table)) || !(await columnExists(conn, table, column))) continue;
    if (await columnDefinitionMatches(conn, table, column, definition)) continue;
    await safeStep(`normalizar tipo ${table}.${column}`, () => conn.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${definition}`));
  }
}

async function addMissingIndexes(conn) {
  for (const [table, indexName, sql] of indexes) {
    if (!(await tableExists(conn, table)) || (await indexExists(conn, table, indexName))) continue;
    await safeStep(`criar indice ${table}.${indexName}`, () => conn.query(sql));
  }
}

async function normalizeExistingRows(conn) {
  await safeStep('preencher datas/flags padrao', () => conn.query(`
    UPDATE usuarios
       SET ativo = COALESCE(ativo, 1),
           nivel = CASE WHEN conta_id IS NULL THEN 'admin' ELSE COALESCE(NULLIF(nivel, ''), 'operador') END,
           conta_id = COALESCE(conta_id, id),
           plano_atual = COALESCE(NULLIF(plano_atual, ''), 'trial'),
           dias_restantes = COALESCE(dias_restantes, 14),
           status_assinatura = COALESCE(NULLIF(status_assinatura, ''), 'ativo'),
           email_verificado = COALESCE(email_verificado, 1),
           updated_at = COALESCE(updated_at, created_at, ?)
  `, [nowSql()]));

  await safeStep('recalcular totais nulos de OS', () => conn.query(`
    UPDATE ordens_servico
       SET valor_servicos = COALESCE(valor_servicos, 0),
           desconto = COALESCE(desconto, 0),
           valor_total = CASE WHEN valor_total IS NULL THEN COALESCE(valor_servicos, 0) - COALESCE(desconto, 0) ELSE valor_total END,
           valor_pago = COALESCE(valor_pago, 0),
           status_financeiro = COALESCE(NULLIF(status_financeiro, ''), 'pendente'),
           parcelas = COALESCE(parcelas, 1),
           data_entrada = COALESCE(NULLIF(data_entrada, ''), DATE_FORMAT(CURDATE(), '%Y-%m-%d')),
           updated_at = COALESCE(updated_at, created_at, ?)
  `, [nowSql()]));
}

async function backfillCompanyTerms(conn) {
  await safeStep('preservar termos da conta Serviços Prime', () => conn.query(`
    UPDATE configuracoes_empresa ce
    JOIN usuarios u ON u.id = ce.user_id
       SET ce.termos_de_uso = ?,
           ce.updated_at = COALESCE(ce.updated_at, ?)
     WHERE u.email = 'servicosprime.work@gmail.com'
       AND COALESCE(NULLIF(ce.termos_de_uso, ''), '') = ''
  `, [SERVICOS_PRIME_TERMS, nowSql()]));
}

async function backfillEvaluationReminders(conn) {
  await safeStep('backfill avaliacoes_lembretes', async () => {
    const [result] = await conn.query(`
      INSERT INTO avaliacoes_lembretes
        (id, user_id, ordem_servico_id, cliente_id, telefone, data_envio, status, comentario, tentativas, created_at, updated_at)
      SELECT
        UUID(),
        o.user_id,
        o.id,
        o.cliente_id,
        c.telefone,
        COALESCE(NULLIF(o.data_entrega, ''), NULLIF(o.data_previsao, ''), o.updated_at, o.created_at),
        'enviado',
        'Historico migrado de solicita_avaliacao/clientes.avaliou',
        1,
        COALESCE(o.updated_at, o.created_at, ?),
        ?
      FROM ordens_servico o
      JOIN clientes c ON c.id = o.cliente_id
      LEFT JOIN avaliacoes_lembretes al
        ON al.user_id = o.user_id
       AND al.ordem_servico_id = o.id
      WHERE al.id IS NULL
        AND o.status = 'concluido'
        AND (COALESCE(o.solicita_avaliacao, 0) = 1 OR COALESCE(c.avaliou, 0) = 1)
        AND COALESCE(NULLIF(c.telefone, ''), '') <> ''
    `, [nowSql(), nowSql()]);
    if (Number(result.affectedRows || 0) > 0) console.log(`Backfill avaliacoes_lembretes: ${result.affectedRows}`);
  });
}

async function backfillReceivables(conn) {
  await safeStep('backfill contas_receber', async () => {
    const [result] = await conn.query(`
      INSERT INTO contas_receber
        (id, user_id, ordem_servico_id, cliente_id, descricao, valor, valor_recebido, data_vencimento,
         data_recebimento, status, forma_pagamento, parcelas, observacoes, created_at, updated_at)
      SELECT
        UUID(),
        o.user_id,
        o.id,
        o.cliente_id,
        CONCAT('OS #', o.numero, ' - ', COALESCE(c.nome, 'Cliente')),
        COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0),
        COALESCE(o.valor_pago, 0),
        COALESCE(NULLIF(o.data_previsao, ''), NULLIF(o.data_entrega, ''), o.created_at),
        CASE WHEN COALESCE(o.valor_pago, 0) >= COALESCE(o.valor_total, 0) AND COALESCE(o.valor_total, 0) > 0 THEN COALESCE(o.data_ultimo_pagamento, o.updated_at, o.data_entrega) ELSE NULL END,
        CASE
          WHEN o.status = 'cancelado' THEN 'cancelado'
          WHEN COALESCE(o.valor_pago, 0) >= COALESCE(o.valor_total, 0) AND COALESCE(o.valor_total, 0) > 0 THEN 'recebido'
          WHEN COALESCE(o.valor_pago, 0) > 0 THEN 'parcial'
          WHEN COALESCE(NULLIF(o.data_previsao, ''), NULLIF(o.data_entrega, '')) < DATE_FORMAT(CURDATE(), '%Y-%m-%d') THEN 'atrasado'
          ELSE 'pendente'
        END,
        o.forma_pagamento,
        COALESCE(o.parcelas, 1),
        'Recebivel migrado automaticamente a partir da ordem de servico',
        COALESCE(o.created_at, ?),
        ?
      FROM ordens_servico o
      JOIN clientes c ON c.id = o.cliente_id
      LEFT JOIN contas_receber cr
        ON cr.user_id = o.user_id
       AND cr.ordem_servico_id = o.id
      WHERE cr.id IS NULL
        AND o.status <> 'cancelado'
        AND COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0) > 0
    `, [nowSql(), nowSql()]);
    if (Number(result.affectedRows || 0) > 0) console.log(`Backfill contas_receber: ${result.affectedRows}`);
  });
}

async function backfillPayments(conn) {
  await safeStep('backfill os_pagamentos', async () => {
    const [result] = await conn.query(`
      INSERT INTO os_pagamentos
        (id, user_id, ordem_servico_id, cliente_id, transacao_financeira_id, valor, forma_pagamento, data_pagamento,
         observacoes, origem, status, created_at, updated_at)
      SELECT
        UUID(),
        t.user_id,
        t.ordem_servico_id,
        o.cliente_id,
        t.id,
        t.valor,
        COALESCE(t.forma_pagamento, o.forma_pagamento),
        t.data,
        'Pagamento migrado de transacoes_financeiras',
        COALESCE(t.origem, 'migracao'),
        'confirmado',
        COALESCE(t.created_at, ?),
        ?
      FROM transacoes_financeiras t
      JOIN ordens_servico o ON o.id = t.ordem_servico_id
      LEFT JOIN os_pagamentos p ON p.transacao_financeira_id = t.id
      WHERE p.id IS NULL
        AND t.tipo = 'receita'
        AND t.ordem_servico_id IS NOT NULL
    `, [nowSql(), nowSql()]);
    if (Number(result.affectedRows || 0) > 0) console.log(`Backfill os_pagamentos: ${result.affectedRows}`);
  });
}

async function syncFinancialStatus(conn) {
  await safeStep('sincronizar status financeiro das OS', () => conn.query(`
    UPDATE ordens_servico o
    LEFT JOIN (
      SELECT user_id, ordem_servico_id, COALESCE(SUM(valor), 0) AS total_pago, MAX(data_pagamento) AS ultima_data
        FROM os_pagamentos
       WHERE status = 'confirmado'
       GROUP BY user_id, ordem_servico_id
    ) p ON p.user_id = o.user_id AND p.ordem_servico_id = o.id
       SET o.valor_pago = COALESCE(p.total_pago, o.valor_pago, 0),
           o.data_ultimo_pagamento = COALESCE(p.ultima_data, o.data_ultimo_pagamento),
           o.status_financeiro = CASE
             WHEN o.status = 'cancelado' THEN 'cancelado'
             WHEN COALESCE(p.total_pago, o.valor_pago, 0) >= COALESCE(o.valor_total, 0) AND COALESCE(o.valor_total, 0) > 0 THEN 'pago'
             WHEN COALESCE(p.total_pago, o.valor_pago, 0) > 0 THEN 'parcial'
             ELSE 'pendente'
           END,
           o.updated_at = ?
  `, [nowSql()]));

  await safeStep('sincronizar contas_receber', () => conn.query(`
    UPDATE contas_receber cr
    JOIN ordens_servico o ON o.user_id = cr.user_id AND o.id = cr.ordem_servico_id
       SET cr.valor_recebido = COALESCE(o.valor_pago, 0),
           cr.data_recebimento = CASE WHEN COALESCE(o.status_financeiro, 'pendente') = 'pago' THEN COALESCE(o.data_ultimo_pagamento, o.updated_at, cr.data_recebimento) ELSE cr.data_recebimento END,
           cr.status = CASE
             WHEN o.status = 'cancelado' THEN 'cancelado'
             WHEN COALESCE(o.status_financeiro, 'pendente') = 'pago' THEN 'recebido'
             WHEN COALESCE(o.status_financeiro, 'pendente') = 'parcial' THEN 'parcial'
             WHEN COALESCE(cr.data_vencimento, '') < DATE_FORMAT(CURDATE(), '%Y-%m-%d') THEN 'atrasado'
             ELSE 'pendente'
           END,
           cr.updated_at = ?
  `, [nowSql()]));
}

const conn = await mysql.createConnection(DATABASE_URL);

try {
  await conn.query('SET NAMES utf8mb4');

  for (const sql of createTables) {
    await safeStep(`criar tabela ${sql.match(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/)?.[1] || ''}`, () => conn.query(sql), { warnOnly: false });
  }

  await addMissingColumns(conn);
  await modifyExistingColumns(conn);
  await addMissingIndexes(conn);
  await normalizeExistingRows(conn);
  await backfillCompanyTerms(conn);
  await backfillEvaluationReminders(conn);
  await backfillReceivables(conn);
  await backfillPayments(conn);
  await syncFinancialStatus(conn);

  console.log('Migracao MySQL concluida com sucesso.');
} finally {
  await conn.end();
}
