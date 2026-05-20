# Auditoria tecnica - Sistema OS SaaS

Data: 2026-05-20

## Resumo executivo

O sistema era uma SPA React conectada diretamente ao Supabase pelo browser. Esse modelo funciona para um produto interno, mas nao e adequado para SaaS com MySQL porque exporia credenciais e regras de negocio no frontend. Foi criada uma API Node/Express com JWT, pool MySQL e uma camada de compatibilidade para o subconjunto de chamadas Supabase usado pelo app.

O banco MySQL `sistemas_os` ja tinha estrutura SaaS parcial: usuarios com plano/status, historico de pagamento, Mercado Pago, instancias WhatsApp e NFS-e. A migracao preservou essa base e adicionou as tabelas operacionais/financeiras que faltavam para este frontend.

## Alteracoes aplicadas

- Backend seguro em `server/index.mjs`.
- Cliente compatível em `src/lib/supabase.ts`, mantendo a maioria das telas sem reescrita massiva.
- Scripts:
  - `npm run migrate:mysql`: cria/ajusta tabelas MySQL necessárias.
  - `npm run import:supabase`: exporta/importa dados legados do Supabase.
- `vite.config.ts` agora faz proxy `/api` e `/uploads` para a API local em desenvolvimento.
- `.env.example` atualizado para MySQL/API.
- `package.json` atualizado com scripts de API, migração e importação.
- Corrigido bug funcional em `src/pages/Financeiro.tsx`: calculo de despesas referenciava `contasPendentes` inexistente.

## Banco de dados

### Situação encontrada

O MySQL remoto ja continha:

- `usuarios`, `sessoes`, `historico_pagamentos`, `configuracoes_mercado_pago`.
- `clientes`, `marcas`, `equipamentos`, `ordens_servico`, `servicos`, `problemas`.
- `empresa_fiscal`, `notas_fiscais`, `nfse_logs`, `webservices_nfse`.
- WhatsApp/Evolution: `whatsapp_instances`, `whatsapp_messages_log`, `configuracoes_evolution`.

Faltavam tabelas usadas pelo frontend:

- `categorias_financeiras`
- `contas_pagar`
- `transacoes_financeiras`
- `configuracoes_whatsapp`
- `system_settings`

### Ajustes aplicados

Foram criadas as tabelas ausentes e adicionadas colunas de compatibilidade em `ordens_servico`, sem remover campos SaaS existentes.

### Risco atual

O banco mistura datas como `varchar(50)` e `timestamp/datetime`. Isso reduz confiabilidade de filtros, ordenacao e relatorios financeiros. A recomendacao e normalizar datas em uma migracao planejada, com testes e backup.

## Importacao Supabase

A primeira tentativa com anon key retornou 0 registros por RLS/acesso anonimo. Com a service role, a importacao foi concluida em 2026-05-20.

Totais importados/reportados pelo script:

- `clientes`: 511 registros
- `marcas`: 95 registros
- `instrumentos`: 11 registros
- `servicos`: 60 registros
- `problemas`: 52 registros
- `ordens_servico`: 597 registros
- `categorias_financeiras`: 28 registros
- `contas_pagar`: 135 registros
- `transacoes_financeiras`: 692 registros
- `configuracoes_empresa`: 1 registro
- `configuracoes_whatsapp`: 1 registro
- `system_settings`: 1 registro
- `message_templates`: 7 registros
- `empresa_fiscal`: 1 registro
- `notas_fiscais`: 0 registros importados nessa tabela pelo Supabase; o MySQL ja tinha registros locais
- `nfse_logs`: 0 registros importados nessa tabela pelo Supabase; o MySQL ja tinha registros locais

Observacao: `avaliacoes_lembretes` nao existe no Supabase informado. O script registra esse aviso e segue.

Supabase Auth retornou 1 usuario (`c19d0c18-9694-4cf6-b78d-0006c430af34`). O mesmo `id` ja existia em `usuarios` no MySQL com senha local. Nao foi feita sobrescrita de senha, porque hashes/senhas do Supabase Auth nao sao exportaveis.

## Segurança

Prioridades:

1. Nao publicar `DATABASE_URL` nem `JWT_SECRET`; manter apenas em variaveis do servidor.
2. Trocar `JWT_SECRET` em producao por segredo longo e estavel.
3. Aplicar rate limit no login.
4. Adicionar politica de permissao por plano em rotas sensiveis.
5. Criptografar senha de certificado A1 no backend; hoje a tela ainda usa base64, que nao e criptografia real.
6. Remover qualquer dependencia de credenciais Supabase no frontend.

## SaaS e multi-tenant

O backend agora força isolamento por `user_id` em tabelas que possuem essa coluna. Ainda recomendo evoluir para:

- tabela `organizacoes` ou `tenants`;
- usuarios pertencendo a tenants;
- permissoes por papel: dono, admin, operador, financeiro;
- limites por plano: usuarios, ordens, NFS-e, WhatsApp, armazenamento;
- auditoria de eventos: login, exclusoes, alteracoes financeiras, emissao fiscal.

## Financeiro

Problemas encontrados:

- calculo de despesas quebrava em runtime por variavel inexistente;
- contas a pagar e transacoes estao separadas sem conciliacao forte;
- relatorios dependem de filtros no frontend;
- nao ha centro de custo, competencia, metodo de pagamento consolidado, conciliacao bancaria nem fluxo previsto x realizado.

Reformulacao recomendada:

- separar `lancamentos_financeiros` de `contas_pagar/receber`;
- criar status contábil: previsto, confirmado, conciliado, cancelado;
- vincular OS concluida a receita automaticamente, com reversao se status voltar;
- criar dashboards:
  - caixa realizado;
  - previsao 30/60/90 dias;
  - inadimplencia;
  - despesas por categoria;
  - margem por tipo de servico;
  - ticket medio por cliente/instrumento.

Mudanca ja aplicada: o financeiro agora consulta contas vinculadas antes de calcular despesas do mes, evitando contabilizar conta ainda nao paga como realizada.

## Layout e UX

Problemas observados:

- visual com excesso de gradientes, blur e cartoes grandes; isso passa menos confianca para uso operacional diario;
- uso de textos corrompidos por encoding em varios arquivos;
- header faz polling a cada 3 segundos, gerando carga desnecessaria;
- algumas telas duplicam comportamento de calendario e tabelas;
- financeiro usa graficos mas falta hierarquia operacional clara.

Direcao recomendada:

- tema mais sobrio: fundo neutro, cards simples, menor raio, menos gradiente;
- tabelas densas com filtros persistentes e acoes inline;
- sidebar/menus mais previsiveis para SaaS;
- componentes unificados de pagina, filtros, tabela e empty state;
- corrigir encoding para UTF-8 em todo o projeto antes de novas telas.

## Qualidade de codigo

O build de producao passa, mas lint/typecheck revelam problemas preexistentes:

- 171 erros de lint;
- `ReminderDashboard.tsx` aparece como arquivo binario;
- muitos `any`, imports nao usados, hooks com dependencias faltantes;
- `tsc -b` falha por erros estruturais preexistentes;
- `npm audit` reporta 21 vulnerabilidades, incluindo 2 criticas.

Recomendacao: antes de grandes features, fazer uma sprint tecnica de estabilizacao:

1. corrigir encoding;
2. limpar imports/variaveis mortas;
3. tornar `tsc -b` obrigatorio no CI;
4. reduzir `any` nas entidades centrais;
5. atualizar dependencias com teste visual e funcional.

## Proximos passos tecnicos

1. Rodar importacao Supabase com service role, se houver dados reais.
2. Criar seed/admin inicial para o SaaS.
3. Implementar rate limit e logs de auditoria na API.
4. Extrair relatorios financeiros para endpoints dedicados, em vez de calcular tudo no browser.
5. Normalizar datas no MySQL.
6. Refatorar NFS-e/certificados para nunca guardar senha de certificado em texto reversivel simples.
7. Criar CI com `npm run build`, `npm run lint` e `npx tsc -b` apos estabilizacao.
