-- ===========================================
-- Estrutura do Banco de Dados para MySQL
-- Sistema OS - Migração do Supabase
-- Gerado em: 2025-12-08
-- ===========================================

-- Configurações iniciais
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ===========================================
-- TABELA: usuarios (auth.users do Supabase)
-- ===========================================
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `senha_hash` VARCHAR(255) NOT NULL,
  `nome` VARCHAR(255) NULL,
  `avatar_url` VARCHAR(500) NULL,
  `conta_id` VARCHAR(36) NULL,
  `nivel` VARCHAR(50) DEFAULT 'admin',
  `plano_atual` VARCHAR(50) DEFAULT 'trial',
  `dias_restantes` INT DEFAULT 14,
  `status_assinatura` VARCHAR(50) DEFAULT 'ativo',
  `ativo` BOOLEAN DEFAULT TRUE,
  `email_verificado` BOOLEAN DEFAULT FALSE,
  `senha_alterada_em` VARCHAR(50) NULL,
  `ultimo_login` VARCHAR(50) NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_usuarios_email` (`email`),
  INDEX `idx_usuarios_conta` (`conta_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auditoria` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `actor_user_id` VARCHAR(36) NOT NULL,
  `actor_email` VARCHAR(255) NULL,
  `actor_role` VARCHAR(50) NOT NULL,
  `acao` VARCHAR(80) NOT NULL,
  `recurso` VARCHAR(80) NOT NULL,
  `recurso_id` VARCHAR(36) NULL,
  `detalhes` JSON NULL,
  `ip_address` VARCHAR(45) NULL,
  `created_at` VARCHAR(50) NOT NULL,
  INDEX `idx_auditoria_conta` (`user_id`),
  INDEX `idx_auditoria_actor` (`actor_user_id`),
  INDEX `idx_auditoria_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `recuperacoes_senha` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `expires_at` VARCHAR(50) NOT NULL,
  `used_at` VARCHAR(50) DEFAULT NULL,
  `requested_ip` VARCHAR(45) DEFAULT NULL,
  `created_at` VARCHAR(50) NOT NULL,
  UNIQUE KEY `unique_recuperacoes_senha_token` (`token_hash`),
  INDEX `idx_recuperacoes_senha_user` (`user_id`),
  INDEX `idx_recuperacoes_senha_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: clientes
-- ===========================================
CREATE TABLE IF NOT EXISTS `clientes` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `nome` VARCHAR(255) NOT NULL,
  `cpf_cnpj` VARCHAR(20) NULL,
  `telefone` VARCHAR(20) NULL,
  `email` VARCHAR(255) NULL,
  `endereco` TEXT NULL,
  `avaliou` BOOLEAN DEFAULT FALSE,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_clientes_user` (`user_id`),
  INDEX `idx_clientes_nome` (`nome`),
  INDEX `idx_clientes_cpf_cnpj` (`cpf_cnpj`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: marcas
-- ===========================================
CREATE TABLE IF NOT EXISTS `marcas` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `nome` VARCHAR(255) NOT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_marcas_user` (`user_id`),
  INDEX `idx_marcas_nome` (`nome`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: instrumentos
-- ===========================================
CREATE TABLE IF NOT EXISTS `instrumentos` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `nome` VARCHAR(255) NOT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_instrumentos_user` (`user_id`),
  INDEX `idx_instrumentos_nome` (`nome`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: equipamentos
-- ===========================================
CREATE TABLE IF NOT EXISTS `equipamentos` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `nome` VARCHAR(255) NOT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_equipamentos_user` (`user_id`),
  INDEX `idx_equipamentos_nome` (`nome`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: servicos
-- ===========================================
CREATE TABLE IF NOT EXISTS `servicos` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `nome` VARCHAR(255) NOT NULL,
  `descricao` TEXT NULL,
  `valor` DECIMAL(10,2) DEFAULT 0.00,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_servicos_user` (`user_id`),
  INDEX `idx_servicos_nome` (`nome`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: problemas
-- ===========================================
CREATE TABLE IF NOT EXISTS `problemas` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `nome` VARCHAR(255) NOT NULL,
  `descricao` TEXT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_problemas_user` (`user_id`),
  INDEX `idx_problemas_nome` (`nome`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: categorias_financeiras
-- ===========================================
CREATE TABLE IF NOT EXISTS `categorias_financeiras` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `nome` VARCHAR(255) NOT NULL,
  `tipo` VARCHAR(20) NOT NULL,
  `cor` VARCHAR(20) DEFAULT '#3B82F6',
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_categorias_user` (`user_id`),
  INDEX `idx_categorias_tipo` (`tipo`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: ordens_servico
-- ===========================================
CREATE TABLE IF NOT EXISTS `ordens_servico` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `numero` INT NOT NULL,
  `cliente_id` VARCHAR(36) NOT NULL,
  `instrumento_id` VARCHAR(36) NULL,
  `equipamento_id` VARCHAR(36) NULL,
  `marca_id` VARCHAR(36) NULL,
  `modelo` VARCHAR(255) NULL,
  `acessorios` TEXT NULL,
  `problemas_ids` JSON NULL,
  `problemas_descricoes` JSON NULL,
  `problema_descricao` TEXT NULL,
  `servicos_ids` JSON NULL,
  `servicos_descricoes` JSON NULL,
  `servico_descricao` TEXT NULL,
  `valor_servicos` DECIMAL(10,2) DEFAULT 0.00,
  `desconto` DECIMAL(10,2) DEFAULT 0.00,
  `valor_total` DECIMAL(10,2) DEFAULT 0.00,
  `valor_pago` DECIMAL(10,2) DEFAULT 0.00,
  `status_financeiro` VARCHAR(50) DEFAULT 'pendente',
  `data_ultimo_pagamento` VARCHAR(50) NULL,
  `observacoes_financeiras` TEXT NULL,
  `forma_pagamento` VARCHAR(50) DEFAULT 'pix',
  `parcelas` INT DEFAULT 1,
  `observacoes` TEXT NULL,
  `data_entrada` VARCHAR(50) NULL,
  `data_previsao` VARCHAR(50) NULL,
  `data_entrega` VARCHAR(50) NULL,
  `status` VARCHAR(50) DEFAULT 'pendente',
  `solicita_avaliacao` BOOLEAN DEFAULT FALSE,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_ordens_user` (`user_id`),
  INDEX `idx_ordens_numero` (`numero`),
  INDEX `idx_ordens_cliente` (`cliente_id`),
  INDEX `idx_ordens_status` (`status`),
  INDEX `idx_ordens_data_entrada` (`data_entrada`),
  UNIQUE KEY `unique_ordem_numero_user` (`user_id`, `numero`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`instrumento_id`) REFERENCES `instrumentos`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`marca_id`) REFERENCES `marcas`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Histórico técnico e comercial da OS. Registros aprovados não devem ser sobrescritos.
CREATE TABLE IF NOT EXISTS `os_ocorrencias` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `ordem_servico_id` VARCHAR(36) NOT NULL,
  `actor_user_id` VARCHAR(36) NULL,
  `tipo` VARCHAR(50) DEFAULT 'novo_problema',
  `titulo` VARCHAR(255) NOT NULL,
  `descricao` TEXT NOT NULL,
  `evidencias_json` JSON NULL,
  `status` VARCHAR(30) DEFAULT 'aberta',
  `created_at` VARCHAR(50) NOT NULL,
  `updated_at` VARCHAR(50) NOT NULL,
  INDEX `idx_os_ocorrencias_user` (`user_id`),
  INDEX `idx_os_ocorrencias_ordem` (`ordem_servico_id`),
  INDEX `idx_os_ocorrencias_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `os_aditivos` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `ordem_servico_id` VARCHAR(36) NOT NULL,
  `ocorrencia_id` VARCHAR(36) NULL,
  `numero` INT NOT NULL,
  `versao` INT DEFAULT 1,
  `titulo` VARCHAR(255) NOT NULL,
  `justificativa` TEXT NOT NULL,
  `valor_adicional` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `valor_total_anterior` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `valor_total_novo` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `prazo_anterior` VARCHAR(50) NULL,
  `prazo_novo` VARCHAR(50) NULL,
  `status` VARCHAR(30) DEFAULT 'rascunho',
  `mensagem_aprovacao` TEXT NULL,
  `provider_message_id` VARCHAR(255) NULL,
  `metodo_aprovacao` VARCHAR(50) NULL,
  `aprovado_por_nome` VARCHAR(255) NULL,
  `aprovado_por_telefone` VARCHAR(30) NULL,
  `enviado_em` VARCHAR(50) NULL,
  `aprovado_em` VARCHAR(50) NULL,
  `recusado_em` VARCHAR(50) NULL,
  `created_by` VARCHAR(36) NULL,
  `created_at` VARCHAR(50) NOT NULL,
  `updated_at` VARCHAR(50) NOT NULL,
  UNIQUE KEY `unique_os_aditivo_numero` (`user_id`, `ordem_servico_id`, `numero`),
  INDEX `idx_os_aditivos_user` (`user_id`),
  INDEX `idx_os_aditivos_ordem` (`ordem_servico_id`),
  INDEX `idx_os_aditivos_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `os_aditivo_itens` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `aditivo_id` VARCHAR(36) NOT NULL,
  `tipo` VARCHAR(30) DEFAULT 'servico',
  `descricao` VARCHAR(500) NOT NULL,
  `quantidade` DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  `valor_unitario` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `valor_total` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `created_at` VARCHAR(50) NOT NULL,
  INDEX `idx_os_aditivo_itens_user` (`user_id`),
  INDEX `idx_os_aditivo_itens_aditivo` (`aditivo_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `os_historico` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `ordem_servico_id` VARCHAR(36) NOT NULL,
  `actor_user_id` VARCHAR(36) NULL,
  `evento` VARCHAR(80) NOT NULL,
  `entidade` VARCHAR(50) NULL,
  `entidade_id` VARCHAR(36) NULL,
  `descricao` TEXT NOT NULL,
  `dados_json` JSON NULL,
  `created_at` VARCHAR(50) NOT NULL,
  INDEX `idx_os_historico_user` (`user_id`),
  INDEX `idx_os_historico_ordem` (`ordem_servico_id`),
  INDEX `idx_os_historico_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: contas_pagar
-- ===========================================
CREATE TABLE IF NOT EXISTS `contas_pagar` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `descricao` VARCHAR(255) NOT NULL,
  `valor` DECIMAL(10,2) NOT NULL,
  `data_vencimento` VARCHAR(50) NOT NULL,
  `data_pagamento` VARCHAR(50) NULL,
  `forma_pagamento` VARCHAR(50) NULL,
  `parcelas` INT DEFAULT 1,
  `status` VARCHAR(50) DEFAULT 'pendente',
  `categoria_id` VARCHAR(36) NULL,
  `recorrente` BOOLEAN DEFAULT FALSE,
  `periodicidade` VARCHAR(50) DEFAULT 'unica',
  `observacoes` TEXT NULL,
  `comprovante_url` VARCHAR(500) NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_contas_user` (`user_id`),
  INDEX `idx_contas_status` (`status`),
  INDEX `idx_contas_vencimento` (`data_vencimento`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`categoria_id`) REFERENCES `categorias_financeiras`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: transacoes_financeiras
-- ===========================================
CREATE TABLE IF NOT EXISTS `transacoes_financeiras` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `descricao` VARCHAR(255) NOT NULL,
  `valor` DECIMAL(10,2) NOT NULL,
  `tipo` VARCHAR(20) NOT NULL,
  `data` VARCHAR(50) NOT NULL,
  `categoria_id` VARCHAR(36) NULL,
  `conta_pagar_id` VARCHAR(36) NULL,
  `ordem_servico_id` VARCHAR(36) NULL,
  `forma_pagamento` VARCHAR(50) NULL,
  `comprovante_url` VARCHAR(500) NULL,
  `origem` VARCHAR(50) DEFAULT 'manual',
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_transacoes_user` (`user_id`),
  INDEX `idx_transacoes_tipo` (`tipo`),
  INDEX `idx_transacoes_data` (`data`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`categoria_id`) REFERENCES `categorias_financeiras`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`conta_pagar_id`) REFERENCES `contas_pagar`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`ordem_servico_id`) REFERENCES `ordens_servico`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: contas_receber
-- ===========================================
CREATE TABLE IF NOT EXISTS `contas_receber` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `ordem_servico_id` VARCHAR(36) NULL,
  `cliente_id` VARCHAR(36) NULL,
  `descricao` VARCHAR(255) NOT NULL,
  `valor` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `valor_recebido` DECIMAL(10,2) DEFAULT 0.00,
  `data_vencimento` VARCHAR(50) NULL,
  `data_recebimento` VARCHAR(50) NULL,
  `status` VARCHAR(50) DEFAULT 'pendente',
  `categoria_id` VARCHAR(36) NULL,
  `forma_pagamento` VARCHAR(50) NULL,
  `parcelas` INT DEFAULT 1,
  `parcela_atual` INT DEFAULT 1,
  `observacoes` TEXT NULL,
  `comprovante_url` VARCHAR(500) NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  UNIQUE KEY `unique_conta_receber_ordem_user` (`user_id`, `ordem_servico_id`),
  INDEX `idx_contas_receber_user` (`user_id`),
  INDEX `idx_contas_receber_status` (`status`),
  INDEX `idx_contas_receber_vencimento` (`data_vencimento`),
  INDEX `idx_contas_receber_cliente` (`cliente_id`),
  INDEX `idx_contas_receber_ordem` (`ordem_servico_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: os_pagamentos
-- ===========================================
CREATE TABLE IF NOT EXISTS `os_pagamentos` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `ordem_servico_id` VARCHAR(36) NOT NULL,
  `cliente_id` VARCHAR(36) NULL,
  `transacao_financeira_id` VARCHAR(36) NULL,
  `valor` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `forma_pagamento` VARCHAR(50) NULL,
  `data_pagamento` VARCHAR(50) NOT NULL,
  `observacoes` TEXT NULL,
  `origem` VARCHAR(50) DEFAULT 'manual',
  `status` VARCHAR(50) DEFAULT 'confirmado',
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_os_pagamentos_user` (`user_id`),
  INDEX `idx_os_pagamentos_ordem` (`ordem_servico_id`),
  INDEX `idx_os_pagamentos_cliente` (`cliente_id`),
  INDEX `idx_os_pagamentos_data` (`data_pagamento`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: anexos_financeiros
-- ===========================================
CREATE TABLE IF NOT EXISTS `anexos_financeiros` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `transacao_financeira_id` VARCHAR(36) NULL,
  `conta_pagar_id` VARCHAR(36) NULL,
  `conta_receber_id` VARCHAR(36) NULL,
  `ordem_servico_id` VARCHAR(36) NULL,
  `nome_arquivo` VARCHAR(255) NOT NULL,
  `caminho` VARCHAR(500) NOT NULL,
  `tipo_mime` VARCHAR(100) NULL,
  `tamanho_bytes` INT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_anexos_financeiros_user` (`user_id`),
  INDEX `idx_anexos_financeiros_transacao` (`transacao_financeira_id`),
  INDEX `idx_anexos_financeiros_conta_pagar` (`conta_pagar_id`),
  INDEX `idx_anexos_financeiros_conta_receber` (`conta_receber_id`),
  INDEX `idx_anexos_financeiros_ordem` (`ordem_servico_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELAS: financeiro IA WhatsApp
-- ===========================================
CREATE TABLE IF NOT EXISTS `financeiro_ia_autorizados` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `nome` VARCHAR(255) NOT NULL,
  `telefone` VARCHAR(30) NOT NULL,
  `permissao` VARCHAR(50) DEFAULT 'consulta',
  `nivel_acesso` VARCHAR(50) DEFAULT 'operador',
  `ativo` BOOLEAN DEFAULT TRUE,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  UNIQUE KEY `unique_financeiro_ia_phone_user` (`user_id`, `telefone`),
  INDEX `idx_financeiro_ia_aut_user` (`user_id`),
  INDEX `idx_financeiro_ia_aut_telefone` (`telefone`),
  INDEX `idx_financeiro_ia_aut_ativo` (`ativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `financeiro_ia_logs` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `autorizado_id` VARCHAR(36) NULL,
  `telefone` VARCHAR(30) NOT NULL,
  `mensagem` TEXT NULL,
  `tipo_mensagem` VARCHAR(50) DEFAULT 'texto',
  `intencao` VARCHAR(100) NULL,
  `entidades` JSON NULL,
  `status` VARCHAR(50) DEFAULT 'recebido',
  `resposta` TEXT NULL,
  `confirmacao_token` VARCHAR(100) NULL,
  `confirmado_em` VARCHAR(50) NULL,
  `erro` TEXT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_financeiro_ia_logs_user` (`user_id`),
  INDEX `idx_financeiro_ia_logs_telefone` (`telefone`),
  INDEX `idx_financeiro_ia_logs_status` (`status`),
  INDEX `idx_financeiro_ia_logs_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: configuracoes_empresa
-- ===========================================
CREATE TABLE IF NOT EXISTS `configuracoes_empresa` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL UNIQUE,
  `nome_empresa` VARCHAR(255) NULL,
  `cnpj` VARCHAR(30) NULL,
  `telefone` VARCHAR(30) NULL,
  `telefone_empresa` VARCHAR(20) NULL,
  `email` VARCHAR(255) NULL,
  `horario_funcionamento` VARCHAR(100) NULL,
  `dias_funcionamento` VARCHAR(100) NULL,
  `logo_url` VARCHAR(500) NULL,
  `endereco` TEXT NULL,
  `termos_de_uso` TEXT NULL,
  `google_review_link` VARCHAR(500) NULL,
  `instagram_handle` VARCHAR(100) NULL,
  `avaliacoes_enabled` BOOLEAN DEFAULT TRUE,
  `avaliacoes_days_after_completion` INT DEFAULT 7,
  `avaliacoes_trigger_hour` INT DEFAULT 11,
  `avaliacoes_daily_limit` INT DEFAULT 20,
  `avaliacoes_min_interval_seconds` INT DEFAULT 20,
  `avaliacoes_last_processed_date` VARCHAR(10) NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: configuracoes_whatsapp
-- ===========================================
CREATE TABLE IF NOT EXISTS `configuracoes_whatsapp` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL UNIQUE,
  `method` VARCHAR(30) DEFAULT 'direct',
  `webhook_url` VARCHAR(500) NULL,
  `api_key` VARCHAR(255) NULL,
  `instance_name` VARCHAR(100) NULL,
  `provider` VARCHAR(30) DEFAULT 'evolution',
  `status` VARCHAR(30) DEFAULT 'nao_configurado',
  `phone_number` VARCHAR(30) NULL,
  `profile_name` VARCHAR(255) NULL,
  `profile_picture_url` VARCHAR(500) NULL,
  `connected_at` VARCHAR(50) NULL,
  `disconnected_at` VARCHAR(50) NULL,
  `last_event_at` VARCHAR(50) NULL,
  `last_checked_at` VARCHAR(50) NULL,
  `disconnect_reason` VARCHAR(100) NULL,
  `connection_status_code` INT NULL,
  `last_error` TEXT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: system_settings
-- ===========================================
CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL UNIQUE,
  `logo_url` VARCHAR(500) NULL,
  `site_title` VARCHAR(255) DEFAULT 'Sistema OS',
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- ATIVOS E MODELOS DE DOCUMENTOS POR EMPRESA
-- ===========================================
CREATE TABLE IF NOT EXISTS `tenant_assets` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `asset_key` VARCHAR(100) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `content` LONGBLOB NOT NULL,
  `file_size` INT NOT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  UNIQUE KEY `unique_tenant_asset` (`user_id`, `asset_key`),
  INDEX `idx_tenant_assets_user` (`user_id`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `document_templates` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `document_type` VARCHAR(50) NOT NULL DEFAULT 'service_order',
  `config_json` JSON NOT NULL,
  `is_default` BOOLEAN NOT NULL DEFAULT FALSE,
  `version` INT NOT NULL DEFAULT 1,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_document_templates_user_type` (`user_id`, `document_type`),
  INDEX `idx_document_templates_default` (`user_id`, `document_type`, `is_default`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: templates_mensagem
-- ===========================================
CREATE TABLE IF NOT EXISTS `templates_mensagem` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `tipo` VARCHAR(50) NOT NULL,
  `template_name` VARCHAR(255) NULL,
  `conteudo` TEXT NOT NULL,
  `variables` JSON NULL,
  `ativo` BOOLEAN DEFAULT TRUE,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  UNIQUE KEY `unique_template_tipo_user` (`user_id`, `tipo`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: whatsapp_mensagens_log
-- Texto final e versão do template efetivamente enviados.
-- ===========================================
CREATE TABLE IF NOT EXISTS `whatsapp_mensagens_log` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `actor_user_id` VARCHAR(36) NULL,
  `ordem_servico_id` VARCHAR(36) NULL,
  `template_id` VARCHAR(36) NULL,
  `template_type` VARCHAR(50) NULL,
  `template_updated_at` VARCHAR(50) NULL,
  `telefone` VARCHAR(30) NOT NULL,
  `mensagem` TEXT NOT NULL,
  `status` VARCHAR(30) NOT NULL,
  `provider` VARCHAR(30) DEFAULT 'evolution',
  `provider_message_id` VARCHAR(255) NULL,
  `erro` TEXT NULL,
  `created_at` VARCHAR(50) NOT NULL,
  `updated_at` VARCHAR(50) NOT NULL,
  INDEX `idx_whatsapp_log_user` (`user_id`),
  INDEX `idx_whatsapp_log_order` (`ordem_servico_id`),
  INDEX `idx_whatsapp_log_template` (`template_type`),
  INDEX `idx_whatsapp_log_created` (`created_at`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Caixa de entrada bidirecional do WhatsApp.
CREATE TABLE IF NOT EXISTS `whatsapp_conversas` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `cliente_id` VARCHAR(36) NULL,
  `ordem_servico_id` VARCHAR(36) NULL,
  `telefone` VARCHAR(30) NOT NULL,
  `remote_jid` VARCHAR(255) NULL,
  `nome_contato` VARCHAR(255) NULL,
  `status` VARCHAR(30) DEFAULT 'aberta',
  `responsavel_user_id` VARCHAR(36) NULL,
  `ultima_mensagem` TEXT NULL,
  `ultima_mensagem_em` VARCHAR(50) NULL,
  `nao_lidas` INT DEFAULT 0,
  `created_at` VARCHAR(50) NOT NULL,
  `updated_at` VARCHAR(50) NOT NULL,
  UNIQUE KEY `unique_whatsapp_conversa_phone` (`user_id`, `telefone`),
  INDEX `idx_whatsapp_conversas_user` (`user_id`),
  INDEX `idx_whatsapp_conversas_cliente` (`cliente_id`),
  INDEX `idx_whatsapp_conversas_ordem` (`ordem_servico_id`),
  INDEX `idx_whatsapp_conversas_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `whatsapp_mensagens` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `conversa_id` VARCHAR(36) NOT NULL,
  `cliente_id` VARCHAR(36) NULL,
  `ordem_servico_id` VARCHAR(36) NULL,
  `actor_user_id` VARCHAR(36) NULL,
  `provider_message_id` VARCHAR(255) NULL,
  `direcao` VARCHAR(20) NOT NULL,
  `tipo` VARCHAR(30) DEFAULT 'texto',
  `conteudo` TEXT NULL,
  `status` VARCHAR(30) DEFAULT 'recebida',
  `from_me` BOOLEAN DEFAULT FALSE,
  `enviada_pelo_sistema` BOOLEAN DEFAULT FALSE,
  `mensagem_referencia_id` VARCHAR(255) NULL,
  `enviada_em` VARCHAR(50) NOT NULL,
  `entregue_em` VARCHAR(50) NULL,
  `lida_em` VARCHAR(50) NULL,
  `apagada_em` VARCHAR(50) NULL,
  `raw_payload` JSON NULL,
  `created_at` VARCHAR(50) NOT NULL,
  `updated_at` VARCHAR(50) NOT NULL,
  UNIQUE KEY `unique_whatsapp_provider_message` (`user_id`, `provider_message_id`),
  INDEX `idx_whatsapp_mensagens_user` (`user_id`),
  INDEX `idx_whatsapp_mensagens_conversa` (`conversa_id`, `enviada_em`),
  INDEX `idx_whatsapp_mensagens_ordem` (`ordem_servico_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `whatsapp_mensagem_eventos` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `mensagem_id` VARCHAR(36) NULL,
  `provider_message_id` VARCHAR(255) NULL,
  `evento` VARCHAR(50) NOT NULL,
  `dados_json` JSON NULL,
  `created_at` VARCHAR(50) NOT NULL,
  INDEX `idx_whatsapp_eventos_user` (`user_id`),
  INDEX `idx_whatsapp_eventos_mensagem` (`mensagem_id`),
  INDEX `idx_whatsapp_eventos_provider` (`provider_message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `whatsapp_anexos` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `mensagem_id` VARCHAR(36) NOT NULL,
  `tipo_mime` VARCHAR(120) NULL,
  `nome_arquivo` VARCHAR(255) NULL,
  `tamanho_bytes` INT NULL,
  `caminho` VARCHAR(500) NULL,
  `conteudo` LONGBLOB NULL,
  `sha256` VARCHAR(64) NULL,
  `created_at` VARCHAR(50) NOT NULL,
  INDEX `idx_whatsapp_anexos_user` (`user_id`),
  INDEX `idx_whatsapp_anexos_mensagem` (`mensagem_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: empresa_fiscal (configurações NFS-e)
-- ===========================================
CREATE TABLE IF NOT EXISTS `empresa_fiscal` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL UNIQUE,
  `razao_social` VARCHAR(255) NOT NULL,
  `nome_fantasia` VARCHAR(255) NULL,
  `cnpj` VARCHAR(20) NOT NULL,
  `inscricao_municipal` VARCHAR(50) NOT NULL,
  `inscricao_estadual` VARCHAR(50) NULL,
  `endereco` VARCHAR(255) NOT NULL,
  `numero` VARCHAR(20) NOT NULL,
  `complemento` VARCHAR(100) NULL,
  `bairro` VARCHAR(100) NOT NULL,
  `codigo_municipio` VARCHAR(10) NOT NULL,
  `uf` CHAR(2) NOT NULL,
  `cep` VARCHAR(10) NOT NULL,
  `telefone` VARCHAR(20) NULL,
  `email` VARCHAR(255) NULL,
  `regime_tributacao` INT NOT NULL,
  `optante_simples_nacional` BOOLEAN DEFAULT FALSE,
  `incentivo_fiscal` BOOLEAN DEFAULT FALSE,
  `aliquota_iss` DECIMAL(5,2) DEFAULT 0.00,
  `item_lista_servico` VARCHAR(10) NOT NULL,
  `codigo_cnae` VARCHAR(20) NULL,
  `codigo_tributacao_municipio` VARCHAR(20) NULL,
  `serie_rps` VARCHAR(10) DEFAULT '1',
  `ultimo_numero_rps` INT DEFAULT 0,
  `certificado_path` VARCHAR(500) NULL,
  `certificado_senha_encrypted` VARCHAR(500) NULL,
  `ambiente` VARCHAR(30) DEFAULT 'homologacao',
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: notas_fiscais
-- ===========================================
CREATE TABLE IF NOT EXISTS `notas_fiscais` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `ordem_servico_id` VARCHAR(36) NOT NULL,
  `aditivo_id` VARCHAR(36) NULL,
  `tipo_origem` VARCHAR(30) DEFAULT 'os_consolidada',
  `nota_substituida_id` VARCHAR(36) NULL,
  `tipo_evento_fiscal` VARCHAR(30) DEFAULT 'emissao',
  `motivo_substituicao` TEXT NULL,
  `numero_nfse` VARCHAR(50) NULL,
  `codigo_verificacao` VARCHAR(50) NULL,
  `numero_rps` VARCHAR(20) NOT NULL,
  `serie_rps` VARCHAR(10) NOT NULL,
  `data_emissao` VARCHAR(50) NOT NULL,
  `competencia` VARCHAR(7) NOT NULL,
  `discriminacao` TEXT NOT NULL,
  `valor_servicos` DECIMAL(10,2) NOT NULL,
  `valor_deducoes` DECIMAL(10,2) DEFAULT 0.00,
  `valor_pis` DECIMAL(10,2) DEFAULT 0.00,
  `valor_cofins` DECIMAL(10,2) DEFAULT 0.00,
  `valor_inss` DECIMAL(10,2) DEFAULT 0.00,
  `valor_ir` DECIMAL(10,2) DEFAULT 0.00,
  `valor_csll` DECIMAL(10,2) DEFAULT 0.00,
  `outras_retencoes` DECIMAL(10,2) DEFAULT 0.00,
  `valor_tributos` DECIMAL(10,2) DEFAULT 0.00,
  `valor_iss` DECIMAL(10,2) DEFAULT 0.00,
  `aliquota` DECIMAL(5,2) DEFAULT 0.00,
  `desconto_incondicionado` DECIMAL(10,2) DEFAULT 0.00,
  `desconto_condicionado` DECIMAL(10,2) DEFAULT 0.00,
  `iss_retido` BOOLEAN DEFAULT FALSE,
  `item_lista_servico` VARCHAR(10) NOT NULL,
  `codigo_cnae` VARCHAR(20) NULL,
  `codigo_tributacao_municipio` VARCHAR(20) NULL,
  `codigo_municipio_prestacao` VARCHAR(10) NOT NULL,
  `exigibilidade_iss` INT DEFAULT 1,
  `municipio_incidencia` VARCHAR(10) NOT NULL,
  `status` VARCHAR(50) DEFAULT 'rascunho',
  `protocolo` VARCHAR(100) NULL,
  `mensagem_retorno` TEXT NULL,
  `xml_envio` LONGTEXT NULL,
  `xml_retorno` LONGTEXT NULL,
  `url_nota` VARCHAR(500) NULL,
  `data_cancelamento` VARCHAR(50) NULL,
  `motivo_cancelamento` TEXT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_nf_user` (`user_id`),
  INDEX `idx_nf_ordem` (`ordem_servico_id`),
  INDEX `idx_nf_aditivo` (`aditivo_id`),
  INDEX `idx_nf_substituida` (`nota_substituida_id`),
  INDEX `idx_nf_status` (`status`),
  INDEX `idx_nf_numero` (`numero_nfse`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`ordem_servico_id`) REFERENCES `ordens_servico`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: nfse_logs
-- ===========================================
CREATE TABLE IF NOT EXISTS `nfse_logs` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `nota_fiscal_id` VARCHAR(36) NOT NULL,
  `tipo_operacao` VARCHAR(50) NOT NULL,
  `status` VARCHAR(50) NOT NULL,
  `mensagem` TEXT NULL,
  `xml_enviado` LONGTEXT NULL,
  `xml_recebido` LONGTEXT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_nfse_logs_nf` (`nota_fiscal_id`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`nota_fiscal_id`) REFERENCES `notas_fiscais`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: agenda_logs
-- ===========================================
CREATE TABLE IF NOT EXISTS `agenda_logs` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `ordem_servico_id` VARCHAR(36) NOT NULL,
  `data_anterior` VARCHAR(50) NOT NULL,
  `data_nova` VARCHAR(50) NOT NULL,
  `profissional_anterior` VARCHAR(100) NULL,
  `profissional_novo` VARCHAR(100) NULL,
  `acao` VARCHAR(50) DEFAULT 'reagendamento',
  `created_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_agenda_logs_user` (`user_id`),
  INDEX `idx_agenda_logs_ordem` (`ordem_servico_id`),
  INDEX `idx_agenda_logs_created_at` (`created_at`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`ordem_servico_id`) REFERENCES `ordens_servico`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: avaliacoes_lembretes
-- ===========================================
CREATE TABLE IF NOT EXISTS `avaliacoes_lembretes` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `ordem_servico_id` VARCHAR(36) NOT NULL,
  `cliente_id` VARCHAR(36) NOT NULL,
  `telefone` VARCHAR(30) NULL,
  `mensagem` TEXT NULL,
  `data_envio` VARCHAR(50) NULL,
  `status` VARCHAR(50) DEFAULT 'pendente',
  `avaliacao` INT NULL,
  `comentario` TEXT NULL,
  `mensagem_erro` TEXT NULL,
  `tentativas` INT DEFAULT 0,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  UNIQUE KEY `unique_avaliacao_ordem_user` (`user_id`, `ordem_servico_id`),
  INDEX `idx_avaliacoes_user` (`user_id`),
  INDEX `idx_avaliacoes_ordem` (`ordem_servico_id`),
  INDEX `idx_avaliacoes_status` (`status`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`ordem_servico_id`) REFERENCES `ordens_servico`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: sessoes (para controle de autenticação JWT)
-- ===========================================
-- Relacionamento e manutenção preventiva
CREATE TABLE IF NOT EXISTS `remarketing_campanhas` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `nome` VARCHAR(255) NOT NULL DEFAULT 'Manutencao preventiva',
  `ativo` BOOLEAN NOT NULL DEFAULT TRUE,
  `automatico` BOOLEAN NOT NULL DEFAULT FALSE,
  `dias_sem_manutencao` INT NOT NULL DEFAULT 180,
  `horario_envio` INT NOT NULL DEFAULT 10,
  `limite_diario` INT NOT NULL DEFAULT 10,
  `intervalo_minimo_segundos` INT NOT NULL DEFAULT 60,
  `intervalo_cliente_dias` INT NOT NULL DEFAULT 90,
  `max_tentativas` INT NOT NULL DEFAULT 2,
  `mensagem` TEXT NOT NULL,
  `ultima_execucao_em` VARCHAR(50) NULL,
  `created_at` VARCHAR(50) NOT NULL,
  `updated_at` VARCHAR(50) NOT NULL,
  UNIQUE KEY `unique_remarketing_campanha_user` (`user_id`),
  INDEX `idx_remarketing_campanhas_ativo` (`user_id`, `ativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `comunicacao_preferencias` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `cliente_id` VARCHAR(36) NOT NULL,
  `lembretes_manutencao_autorizado` BOOLEAN NOT NULL DEFAULT FALSE,
  `origem_consentimento` VARCHAR(100) NULL,
  `consentido_em` VARCHAR(50) NULL,
  `descadastrado_em` VARCHAR(50) NULL,
  `motivo_descadastro` VARCHAR(255) NULL,
  `created_at` VARCHAR(50) NOT NULL,
  `updated_at` VARCHAR(50) NOT NULL,
  UNIQUE KEY `unique_comunicacao_preferencia_cliente` (`user_id`, `cliente_id`),
  INDEX `idx_comunicacao_preferencias_optin` (`user_id`, `lembretes_manutencao_autorizado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `remarketing_lembretes` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `campanha_id` VARCHAR(36) NOT NULL,
  `cliente_id` VARCHAR(36) NOT NULL,
  `ordem_servico_id` VARCHAR(36) NOT NULL,
  `instrumento_id` VARCHAR(36) NULL,
  `equipamento_id` VARCHAR(36) NULL,
  `conversa_id` VARCHAR(36) NULL,
  `whatsapp_mensagem_id` VARCHAR(36) NULL,
  `telefone` VARCHAR(30) NULL,
  `mensagem` TEXT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'pendente',
  `tentativas` INT NOT NULL DEFAULT 0,
  `data_envio` VARCHAR(50) NULL,
  `respondido_em` VARCHAR(50) NULL,
  `convertido_em` VARCHAR(50) NULL,
  `ordem_conversao_id` VARCHAR(36) NULL,
  `mensagem_erro` TEXT NULL,
  `created_at` VARCHAR(50) NOT NULL,
  `updated_at` VARCHAR(50) NOT NULL,
  UNIQUE KEY `unique_remarketing_ciclo` (`user_id`, `campanha_id`, `ordem_servico_id`),
  INDEX `idx_remarketing_lembretes_status` (`user_id`, `status`),
  INDEX `idx_remarketing_lembretes_cliente` (`user_id`, `cliente_id`, `data_envio`),
  INDEX `idx_remarketing_lembretes_instrumento` (`instrumento_id`, `equipamento_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sessoes` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `token_hash` VARCHAR(255) NOT NULL,
  `refresh_token_hash` VARCHAR(255) NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` TEXT NULL,
  `expires_at` VARCHAR(50) NOT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  INDEX `idx_sessoes_user` (`user_id`),
  INDEX `idx_sessoes_expires` (`expires_at`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ===========================================
-- FIM DA ESTRUTURA
-- ===========================================
