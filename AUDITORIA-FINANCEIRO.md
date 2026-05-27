# Auditoria e Evolucao do Modulo Financeiro

Data: 2026-05-25

## 1. Auditoria do Financeiro Atual

O sistema ja possuia:

- `transacoes_financeiras` para receitas/despesas.
- `contas_pagar` para despesas venciveis.
- `categorias_financeiras` por tipo.
- `ordens_servico` com `valor_total`, `valor_pago`, `forma_pagamento` e vinculo opcional em `transacoes_financeiras.ordem_servico_id`.
- Dashboard financeiro com receitas, despesas, saldo, graficos e proximos vencimentos.

Dados reais observados antes das alteracoes:

- 603 ordens de servico.
- 584 OS concluidas.
- 692 transacoes financeiras.
- 597 receitas, totalizando R$ 211.319,83.
- 576 receitas ja vinculadas a OS.
- 95 despesas, totalizando R$ 8.856,50.
- 135 contas a pagar.
- Apenas 2 OS tinham `valor_pago > 0`, embora 576 receitas estivessem vinculadas a OS.

## 2. Problemas Encontrados

- OS tinha valor total, mas nao tinha fluxo financeiro consistente para status `pendente`, `parcial`, `pago` e `cancelado`.
- `valor_pago` da OS estava desatualizado em relacao as receitas vinculadas.
- Nao existia tabela formal de pagamentos parciais por OS.
- Nao existia contas a receber formal, apesar de OS serem recebiveis naturais.
- O Dashboard somava faturamento diretamente de OS concluidas, confundindo faturamento previsto com dinheiro recebido.
- `contas_pagar` ao marcar como pago nao gerava necessariamente uma transacao financeira vinculada.
- Havia risco de contagem dupla entre OS concluidas e receitas lancadas.
- IA/WhatsApp nao possuia autorizacao por numero, permissao, confirmacao nem logs financeiros.
- Nao havia estrutura para anexos/comprovantes financeiros.
- Datas financeiras usam `varchar`, exigindo cuidado em comparacoes e filtros.

## 3. Melhorias Implementadas

### Banco de Dados

Adicionadas tabelas:

- `contas_receber`
- `os_pagamentos`
- `anexos_financeiros`
- `financeiro_ia_autorizados`
- `financeiro_ia_logs`

Adicionadas colunas:

- `ordens_servico.status_financeiro`
- `ordens_servico.data_ultimo_pagamento`
- `ordens_servico.observacoes_financeiras`
- `ordens_servico.parcelas`
- `contas_pagar.forma_pagamento`
- `contas_pagar.parcelas`
- `contas_pagar.comprovante_url`
- `transacoes_financeiras.forma_pagamento`
- `transacoes_financeiras.comprovante_url`
- `transacoes_financeiras.origem`

Backfills executados:

- 589 registros em `contas_receber` criados a partir das OS.
- 576 registros em `os_pagamentos` criados a partir das receitas vinculadas a OS.
- Status financeiro das OS sincronizado com os pagamentos confirmados.

Backup antes das alteracoes:

- `.codex-logs/db-backups/backup-2026-05-25T15-55-58-234Z.json`

### Backend

Novo endpoint autenticado:

- `POST /api/financeiro/os/:id/pagamentos`

Esse endpoint:

- Registra pagamento de OS.
- Cria transacao financeira de receita.
- Cria registro em `os_pagamentos`.
- Atualiza `valor_pago`, `status_financeiro` e `data_ultimo_pagamento`.
- Atualiza a conta a receber vinculada.

Novo endpoint de WhatsApp/IA:

- `POST /api/financeiro/ia/webhook`

Esse endpoint:

- Aceita texto e audio via `audio_url`.
- Transcreve audio se `OPENAI_API_KEY` estiver configurada.
- Autoriza apenas numeros cadastrados e ativos.
- Respeita permissao `consulta`, `escrita` e `admin`.
- Identifica intencoes basicas:
  - registrar despesa
  - registrar pagamento de OS
  - consultar contas que vencem hoje
  - consultar a receber do mes
  - consultar faturamento recebido do mes
  - listar OS pendentes de pagamento
  - consultar debito por cliente
- Exige confirmacao por token antes de qualquer escrita.
- Registra logs em `financeiro_ia_logs`.

### Frontend

Nova area administrativa:

- Rota: `/financeiro/ia`
- Cadastro de ate 5 numeros autorizados.
- Campos: nome, telefone, permissao, nivel de acesso e ativo/inativo.
- Historico de acoes da IA financeira.

Tela de OS:

- Exibe status financeiro da OS.
- Exibe valor restante quando houver saldo pendente.
- Inclui acao para registrar pagamento restante.
- Ao marcar uma OS como `concluido`, o sistema baixa automaticamente o saldo pendente como receita, cria `transacoes_financeiras`, cria `os_pagamentos`, atualiza `contas_receber` e evita duplicidade quando a OS ja esta quitada.

Dashboard:

- Faturamento passa a usar receitas registradas em `transacoes_financeiras`, nao apenas OS concluidas.

Financeiro:

- Passa a carregar `contas_receber`.
- Mostra valor a receber pendente.
- Renomeia saldo para lucro liquido operacional, baseado em receitas recebidas menos despesas.
- Unifica `Contas a receber` e `Contas a pagar` dentro da tela `/financeiro`.
- Permite receber uma conta vinculada a OS diretamente no financeiro.
- Permite pagar uma conta a pagar diretamente no financeiro.
- Ao pagar uma conta a pagar, o sistema cria automaticamente uma transacao financeira de despesa vinculada.

## 4. Regras Financeiras Definidas

- OS cancelada fica com status financeiro `cancelado`.
- OS sem pagamento fica `pendente`.
- OS com pagamento menor que o total fica `parcial`.
- OS com pagamento maior ou igual ao total fica `pago`.
- Toda baixa de pagamento de OS deve gerar:
  - transacao financeira de receita
  - registro em `os_pagamentos`
  - atualizacao da OS
  - atualizacao de `contas_receber`
- A IA financeira nunca grava dados sem confirmacao explicita.
- Numeros com permissao `consulta` nao podem registrar despesas ou pagamentos.
- Toda conta a pagar marcada como paga deve gerar uma transacao financeira de despesa vinculada.

## 5. Pontos Criticos Restantes

- Parcelamento foi modelado, mas ainda precisa de tela completa para gerar parcelas.
- Anexos/comprovantes foram modelados, mas a UI de upload ainda precisa ser conectada aos novos relacionamentos.
- Datas financeiras ainda estao em `varchar`; uma migracao futura para `DATE/DATETIME` traria maior rigor.
- O parser da IA esta funcional para comandos comuns, mas deve evoluir para NLU com modelo estruturado quando a chave de IA estiver configurada.
- Relatorios anual/dia podem ser aprofundados em telas especificas.

## 6. Testes Realizados

- Backup do banco antes das migrations.
- `npm run migrate:mysql`
- `node --check server/index.mjs`
- `npx tsc --noEmit`

## 7. Auditoria de Compatibilidade Mensal - 2026-05-27

### Problemas encontrados

- O dashboard `/financeiro` exibia contas a pagar pendentes/atrasadas sem filtro de mes, enquanto a tela `/contas` filtrava por vencimento do mes selecionado. Isso fazia o total e a quantidade de contas a pagar ficarem incompatíveis entre os módulos.
- A tela `/contas` aplicava paginação no Supabase com `.range(...)` e depois paginava novamente no cliente com `slice(...)`. Em páginas posteriores, isso podia gerar lista vazia e contagem visual incorreta.
- Os filtros mensais usavam `toISOString()`, que converte a data local para UTC. Em fuso como America/Sao_Paulo, o primeiro dia do mes pode virar o dia anterior, afetando consultas por `data_vencimento`.
- O card de `Total a Pagar` mostrava valor, mas não mostrava explicitamente a quantidade de contas pendentes/atrasadas do mes.
- Após pagar, excluir ou salvar conta a pagar, a lista e o calendário podiam ficar fora de sincronia porque nem todas as rotinas atualizavam os dois conjuntos de dados.

### Correções aplicadas

- `/financeiro` agora calcula contas a pagar usando `data_vencimento >= inicio_do_mes` e `< inicio_do_proximo_mes`.
- `/financeiro` passou a mostrar um card próprio de `Contas a pagar` com valor e quantidade do mes.
- `/financeiro` separa `contas atrasadas` em uma consulta própria, para não esconder vencimentos de meses anteriores.
- `/financeiro` também limita recebíveis pendentes ao mes selecionado, mantendo o painel mensal coerente.
- `/contas` agora carrega todas as contas do mes selecionado uma vez e aplica filtros/paginação apenas no cliente.
- `/contas` passou a exibir a quantidade de contas pendentes/atrasadas do mes no card `Total a Pagar`.
- Datas financeiras passaram a ser formatadas e filtradas com `YYYY-MM-DD` local, evitando deslocamento por UTC.
- Ações de pagar, excluir e salvar conta a pagar agora atualizam lista e calendário.

### Arquivos alterados nesta auditoria

- `src/pages/Financeiro.tsx`
- `src/pages/ContasPagar.tsx`
- `AUDITORIA-FINANCEIRO.md`

### Validação

- `npm run build`: aprovado.
- `npm run lint`: aprovado sem erros; o projeto permanece com warnings preexistentes de tipagem, hooks e variáveis não usadas.
- Consulta direta ao banco para contar o mes atual: não executada porque `DATABASE_URL`/`MYSQL_URL` não está configurado no ambiente local desta sessão.

### Pontos restantes

- Validar com uma sessão real e dados de produção/homologação se os totais mensais esperados batem com o banco.
- Criar uma consulta agregada no backend para retornar valor e quantidade por mes, reduzindo processamento no frontend quando houver alto volume de contas.
- Avaliar migração definitiva de campos financeiros de data para `DATE`/`DATETIME`, pois ainda há histórico de uso como texto em partes do projeto.
