# IA do Sistema via WhatsApp

Data: 2026-05-30

## Objetivo

A IA que antes atendia apenas financeiro foi ampliada para atuar no sistema operacional inteiro, mantendo o endpoint e as tabelas existentes por compatibilidade:

- Endpoint: `POST /api/financeiro/ia/webhook`
- Autorizacoes: `financeiro_ia_autorizados`
- Logs e confirmacoes: `financeiro_ia_logs`

## Capacidades

Consultas:

- Contas a pagar que vencem hoje.
- A receber do mes.
- Faturamento recebido do mes.
- OS pendentes de pagamento.
- Debito de cliente.
- OS do dia, considerando entrada ou previsao.
- Busca de cliente por nome, telefone ou CPF/CNPJ.
- Busca de OS por numero ou cliente.
- Clientes recentes.

Escrita com confirmacao:

- Registrar despesa.
- Registrar pagamento de OS.
- Cadastrar conta a pagar.
- Cadastrar cliente.
- Editar cliente.
- Excluir cliente sem OS vinculada.
- Abrir OS basica para cliente existente.
- Editar OS, incluindo status, previsao, valor, forma de pagamento, modelo e observacoes.
- Cancelar OS.

## Seguranca

Toda escrita exige:

- Numero cadastrado e ativo.
- Permissao `escrita` ou `admin`.
- Token de confirmacao enviado pelo WhatsApp.

Exclusao de cliente exige `admin` e e bloqueada quando o cliente possui OS vinculada.

## OpenAI

Quando `OPENAI_API_KEY` esta configurada, o backend usa a Responses API para interpretar a mensagem como JSON estruturado. Se a OpenAI falhar ou nao estiver configurada, o parser local continua atendendo os comandos principais.

Variaveis:

- `OPENAI_API_KEY`
- `OPENAI_INTENT_MODEL` ou `OPENAI_MODEL`
- Padrao atual: `gpt-5.5`

Referencias usadas:

- https://platform.openai.com/docs/api-reference/responses
- https://platform.openai.com/docs/guides/structured-outputs
- https://platform.openai.com/docs/models

## Exemplos

- `quais OS tenho hoje?`
- `cadastre cliente Maria Silva telefone 61999999999`
- `altere cliente Maria Silva telefone 61988887777`
- `abra OS para Maria Silva previsao 05/06/2026 valor 350 pix`
- `mude status da OS 125 para concluido`
- `altere previsao da OS 125 para 30/05/2026`
- `cancele a OS 125`
- `registre pagamento da OS 125 em pix`

## Observacoes

Criacao de OS pela IA e propositalmente basica: ela vincula cliente, datas, valor, forma de pagamento, modelo e observacoes. Campos tecnicos mais detalhados, como instrumento, marca, problemas e servicos padronizados, continuam podendo ser refinados pela tela de OS.
