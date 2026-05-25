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
  `email_verificado` BOOLEAN DEFAULT FALSE,
  `ultimo_login` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_usuarios_email` (`email`)
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
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_instrumentos_user` (`user_id`),
  INDEX `idx_instrumentos_nome` (`nome`),
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
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
  `tipo` ENUM('receita', 'despesa') NOT NULL,
  `cor` VARCHAR(20) DEFAULT '#3B82F6',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
  `marca_id` VARCHAR(36) NULL,
  `modelo` VARCHAR(255) NULL,
  `acessorios` TEXT NULL,
  `problemas_ids` JSON NULL,
  `problema_descricao` TEXT NULL,
  `servicos_ids` JSON NULL,
  `servico_descricao` TEXT NULL,
  `valor_servicos` DECIMAL(10,2) DEFAULT 0.00,
  `desconto` DECIMAL(10,2) DEFAULT 0.00,
  `valor_total` DECIMAL(10,2) DEFAULT 0.00,
  `forma_pagamento` ENUM('credito', 'debito', 'pix', 'dinheiro', 'boleto') DEFAULT 'pix',
  `observacoes` TEXT NULL,
  `data_entrada` DATE NOT NULL,
  `data_previsao` DATE NULL,
  `data_entrega` DATE NULL,
  `status` ENUM('pendente', 'em_andamento', 'concluido', 'cancelado', 'atraso') DEFAULT 'pendente',
  `solicita_avaliacao` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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

-- ===========================================
-- TABELA: contas_pagar
-- ===========================================
CREATE TABLE IF NOT EXISTS `contas_pagar` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `descricao` VARCHAR(255) NOT NULL,
  `valor` DECIMAL(10,2) NOT NULL,
  `data_vencimento` DATE NOT NULL,
  `data_pagamento` DATE NULL,
  `status` ENUM('pendente', 'pago', 'atrasado', 'cancelado') DEFAULT 'pendente',
  `categoria_id` VARCHAR(36) NULL,
  `recorrente` BOOLEAN DEFAULT FALSE,
  `periodicidade` ENUM('unica', 'diaria', 'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual') DEFAULT 'unica',
  `observacoes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
  `tipo` ENUM('receita', 'despesa') NOT NULL,
  `data` DATE NOT NULL,
  `categoria_id` VARCHAR(36) NULL,
  `conta_pagar_id` VARCHAR(36) NULL,
  `ordem_servico_id` VARCHAR(36) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_transacoes_user` (`user_id`),
  INDEX `idx_transacoes_tipo` (`tipo`),
  INDEX `idx_transacoes_data` (`data`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`categoria_id`) REFERENCES `categorias_financeiras`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`conta_pagar_id`) REFERENCES `contas_pagar`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`ordem_servico_id`) REFERENCES `ordens_servico`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: configuracoes_empresa
-- ===========================================
CREATE TABLE IF NOT EXISTS `configuracoes_empresa` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL UNIQUE,
  `nome_empresa` VARCHAR(255) NULL,
  `telefone_empresa` VARCHAR(20) NULL,
  `horario_funcionamento` VARCHAR(100) NULL,
  `dias_funcionamento` VARCHAR(100) NULL,
  `logo_url` VARCHAR(500) NULL,
  `endereco` TEXT NULL,
  `google_review_link` VARCHAR(500) NULL,
  `instagram_handle` VARCHAR(100) NULL,
  `avaliacoes_enabled` BOOLEAN DEFAULT TRUE,
  `avaliacoes_days_after_completion` INT DEFAULT 7,
  `avaliacoes_trigger_hour` INT DEFAULT 11,
  `avaliacoes_daily_limit` INT DEFAULT 20,
  `avaliacoes_min_interval_seconds` INT DEFAULT 20,
  `avaliacoes_last_processed_date` VARCHAR(10) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: configuracoes_whatsapp
-- ===========================================
CREATE TABLE IF NOT EXISTS `configuracoes_whatsapp` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL UNIQUE,
  `method` ENUM('direct', 'webhook') DEFAULT 'direct',
  `webhook_url` VARCHAR(500) NULL,
  `api_key` VARCHAR(255) NULL,
  `instance_name` VARCHAR(100) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: templates_mensagem
-- ===========================================
CREATE TABLE IF NOT EXISTS `templates_mensagem` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `tipo` VARCHAR(50) NOT NULL,
  `conteudo` TEXT NOT NULL,
  `ativo` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_template_tipo_user` (`user_id`, `tipo`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
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
  `ambiente` ENUM('homologacao', 'producao') DEFAULT 'homologacao',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================
-- TABELA: notas_fiscais
-- ===========================================
CREATE TABLE IF NOT EXISTS `notas_fiscais` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `ordem_servico_id` VARCHAR(36) NOT NULL,
  `numero_nfse` VARCHAR(50) NULL,
  `codigo_verificacao` VARCHAR(50) NULL,
  `numero_rps` VARCHAR(20) NOT NULL,
  `serie_rps` VARCHAR(10) NOT NULL,
  `data_emissao` DATETIME NOT NULL,
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
  `status` ENUM('rascunho', 'enviado', 'processando', 'autorizado', 'rejeitado', 'cancelado') DEFAULT 'rascunho',
  `protocolo` VARCHAR(100) NULL,
  `mensagem_retorno` TEXT NULL,
  `xml_envio` LONGTEXT NULL,
  `xml_retorno` LONGTEXT NULL,
  `url_nota` VARCHAR(500) NULL,
  `data_cancelamento` DATETIME NULL,
  `motivo_cancelamento` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_nf_user` (`user_id`),
  INDEX `idx_nf_ordem` (`ordem_servico_id`),
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
  `tipo_operacao` ENUM('gerar', 'consultar', 'cancelar') NOT NULL,
  `status` ENUM('sucesso', 'erro') NOT NULL,
  `mensagem` TEXT NULL,
  `xml_enviado` LONGTEXT NULL,
  `xml_recebido` LONGTEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
CREATE TABLE IF NOT EXISTS `sessoes` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `token_hash` VARCHAR(255) NOT NULL,
  `refresh_token_hash` VARCHAR(255) NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` TEXT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_sessoes_user` (`user_id`),
  INDEX `idx_sessoes_expires` (`expires_at`),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ===========================================
-- FIM DA ESTRUTURA
-- ===========================================
