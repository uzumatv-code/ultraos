# Reforma Ultra OS — design system, painel, ordens e financeiro

Branch: `redesign/ultra-command`
Data: 2026-09-19

Este documento descreve o que foi diagnosticado, o que mudou, como aplicar em
produção e o que ficou intencionalmente para depois.

---

## 1. Diagnóstico

### 1.1 Interface

| Problema | Impacto |
| --- | --- |
| Três linguagens visuais convivendo (glass/gradiente, `command-*`, Tailwind cru) | Cada tela parecia de um produto diferente |
| ~200 linhas de CSS só para “consertar” o tema escuro de telas escritas em cores claras fixas | Qualquer cor nova exigia mais uma regra de remendo |
| Badges de status com `bg-yellow-100 text-yellow-800` | Ilegíveis no tema escuro; cor diferente da mesma informação em outra tela |
| Navegação em lista única, com financeiro e cadastros misturados | Difícil achar; sem hierarquia de domínio |
| Cabeçalho consultando duas tabelas a cada 15 segundos | Carga constante no banco sem benefício real |
| Números financeiros sem `tabular-nums` | Colunas de valores desalinhadas, difíceis de comparar |

### 1.2 Ordens de serviço

- A tela baixava **todas** as ordens do usuário (603 registros com cliente,
  instrumento e marca aninhados) a cada visita e filtrava no navegador.
- Filtros liam a URL apenas na montagem: recarregar ou voltar perdia o recorte.
- O status era um `<select>` estilizado como etiqueta — um clique errado
  cancelava uma OS sem confirmação.
- Seis ícones de ação competindo por atenção em cada linha.

### 1.3 Financeiro — o erro estrutural

A tela somava grandezas incompatíveis:

```
Receita do mês  = transações do tipo receita          (regime de CAIXA)
Despesa do mês  = contas a pagar com vencimento no mês (regime de COMPETÊNCIA)
Resultado       = receita − despesa                    ← não significa nada
```

Consequências concretas:

- Despesa lançada fora do Contas a Pagar **não aparecia** no resultado.
- Conta a pagar do mês ainda não paga **reduzia** o resultado como se tivesse
  saído do caixa.
- O número exibido não respondia nem “sobrou dinheiro?” nem “o mês foi
  lucrativo?”.
- Nove consultas paralelas do navegador, com todo o cálculo no cliente.
- Não havia DRE, plano de contas, aging de inadimplência, projeção de fluxo
  nem margem.

---

## 2. O que mudou

### 2.1 Design system (`src/index.css`, `tailwind.config.js`, `src/components/ui/`)

Camada de tokens única (`--ui-*`) com tema escuro como padrão e tema claro
calibrado para o mesmo contraste. As variáveis antigas (`--app-*`) viraram
apelidos dos novos tokens — por isso **todas as telas**, inclusive as ainda não
reescritas, herdaram a nova paleta sem precisar ser tocadas.

Primitivos em `src/components/ui/index.tsx`:
`UIButton`, `Panel`, `PageHeader`, `Badge`, `IconTile`, `Kpi`, `Meter`,
`EmptyState`, `Skeleton`, `Table`/`Td`, `Segmented`, `SearchField`, `Select`.

Vocabulário de status em `src/components/ui/status.tsx`: um único lugar decide
a cor e o rótulo de cada estado — operacional (`OrderStatusBadge`), financeiro
da OS (`FinancialStatusBadge`) e de contas a pagar (`PayableStatusBadge`).
A regra “pendente com previsão vencida é, na prática, atraso” também vive ali.

Tema dos gráficos em `src/lib/chart-theme.ts`: Chart.js passa a ler os tokens,
então os gráficos acompanham o tema em vez de usar cores cravadas.

> **Atenção ao Tailwind:** classes montadas em tempo de execução
> (`ui-btn-${variant}`) não aparecem inteiras no código-fonte e seriam
> removidas do CSS final. O `safelist` no `tailwind.config.js` protege essas
> variações — ao criar uma variante nova, acrescente-a lá.

### 2.2 Shell (`src/components/AppShell.tsx`)

Substitui `Header.tsx` + `BottomNavigation.tsx` (ambos removidos).

- Navegação agrupada: Operação · Financeiro · Cadastros · Relacionamento · Sistema.
- Sidebar recolhível (preferência guardada no navegador).
- Contadores de pendência ao lado de Ordens, Contas a pagar e Conversas.
- Paleta de comandos com **Ctrl/⌘ + K** para ir a qualquer tela sem mouse.
- Alertas vêm de um endpoint agregado, atualizados ao abrir, ao voltar o foco
  da janela e a cada 5 minutos — o polling de 15 s foi eliminado.

### 2.3 Painel (`src/pages/Dashboard.tsx`)

Reordenado pela sequência em que a oficina decide o dia: o que está fora do
prazo → o que sai hoje → como a bancada está distribuída → como o caixa reage.
Calendário e histórico ficam recolhidos, porque são consulta e não decisão.

### 2.4 Ordens (`src/pages/Ordens.tsx`)

- Listagem paginada no servidor (`GET /api/ordens/lista`) com filtro, busca,
  ordenação e contadores por situação calculados no banco.
- Estado da tela na URL (`useUrlState`): o recorte sobrevive ao recarregar e
  pode ser compartilhado por link.
- Mudança de status virou ação explícita, com confirmação para cancelamento.
- Ações de linha reunidas em um menu.
- Visão **Bancada** (kanban) com a carga por etapa.

### 2.5 Financeiro (`src/pages/Financeiro.tsx`)

Os dois regimes passam a aparecer separados e rotulados — ver seção 3.
Cinco abas: Visão geral · Resultado (DRE) · A receber · A pagar · Projeção.
Tudo vem agregado de `GET /api/financeiro/resumo`; o navegador não soma nada.

---

## 3. Regras financeiras adotadas

### 3.1 Os dois regimes

| | Fonte | Data considerada | Responde |
| --- | --- | --- | --- |
| **Caixa** | `transacoes_financeiras` | data do movimento | “sobrou dinheiro este mês?” |
| **Competência** | `contas_receber` e `contas_pagar` | data de vencimento | “o mês foi lucrativo?” |

**Nenhum indicador mistura as duas origens.** A dupla contagem é evitada por
construção: toda conta a pagar quitada gera uma transação de despesa vinculada
(`conta_pagar_id`), então o caixa lê somente transações e a competência lê
somente contas.

### 3.2 Plano de contas (DRE)

Cada categoria recebe um `grupo_dre`:

| Grupo | Sinal | Exemplos |
| --- | --- | --- |
| `receita_servico` | + | setup, conserto, manutenção |
| `receita_outras` | + | venda de acessório, reembolso |
| `custo_direto` | − | peças, cordas, insumos aplicados no serviço |
| `despesa_operacional` | − | aluguel, energia, ferramentas |
| `despesa_administrativa` | − | impostos, contabilidade, pró-labore |
| `despesa_financeira` | − | tarifas, juros, taxa de cartão |
| `investimento` | − | equipamento, obra, reforma (fora do resultado operacional) |

A DRE apresentada é:

```
  Receita de serviços
+ Outras receitas
= Receita bruta
− Custos diretos
= Margem bruta
− Despesas operacionais
− Despesas administrativas
− Despesas financeiras
= Resultado operacional
```

Investimentos aparecem destacados, fora do resultado operacional.

### 3.3 Indicadores novos

- **Aging da carteira**: a vencer · 1–15 · 16–30 · 31–60 · 60+ dias.
- **Índice de inadimplência**: vencido ÷ carteira em aberto.
- **Projeção 30/60/90 dias**: entradas e saídas já comprometidas, com saldo
  acumulado por janela.
- **Produção**: OS concluídas, valor produzido, ticket médio e prazo médio de
  recebimento (da entrada da OS ao último pagamento).

---

## 4. Endpoints novos

| Método | Rota | Para quê |
| --- | --- | --- |
| `GET` | `/api/notificacoes/resumo` | Alertas do topo em uma chamada |
| `GET` | `/api/ordens/lista` | Lista paginada e filtrada no banco |
| `GET` | `/api/financeiro/resumo?mes=YYYY-MM` | Consolidação financeira completa |
| `GET` | `/api/financeiro/carteira?tipo=receber\|pagar` | Títulos em aberto |

Os três primeiros exigem sessão; os dois financeiros exigem perfil administrador.

---

## 5. Migração de banco

### 5.1 O que é adicionado

Tudo é **aditivo e idempotente** — nenhuma coluna é removida ou alterada de
tipo, e rodar a migração duas vezes não causa efeito.

**Colunas**

- `categorias_financeiras`: `grupo_dre`, `centro_custo`, `ativa`
- `contas_pagar`: `centro_custo`
- `transacoes_financeiras`: `data_competencia`, `centro_custo`, `conta_receber_id`

**Índices** (só leitura mais rápida; nenhum deles é `UNIQUE`)

- `transacoes_financeiras`: `idx_transacoes_user_data`, `idx_transacoes_user_tipo_data`
- `contas_pagar`: `idx_contas_pagar_user_status_venc`
- `contas_receber`: `idx_contas_receber_user_status_venc`
- `ordens_servico`: `idx_ordens_user_status_previsao`
- `categorias_financeiras`: `idx_categorias_user_grupo`

**Backfill**

- `classifyFinancialCategories`: classifica no `grupo_dre` as categorias que
  estiverem **sem** classificação, por heurística sobre o nome. Uma
  classificação já ajustada à mão nunca é sobrescrita.
- Preenche `data_competencia` das transações: vencimento da conta a pagar
  vinculada quando existir, senão a própria data do movimento.

### 5.2 Como aplicar

```bash
# 1. Backup (obrigatório)
mysqldump --single-transaction --routines "$DATABASE_URL" > backup-pre-redesign.sql

# 2. Migração
npm run migrate:mysql
```

A migração registra cada passo com `OK` ou `AVISO`. Avisos não interrompem —
cada passo é isolado.

### 5.3 Correção no `.nixpacksignore` (importante)

O `railway.json` roda `npm run migrate:mysql` como `preDeployCommand`, mas o
`.nixpacksignore` excluía a pasta `scripts/` do build — ou seja, o script da
migração provavelmente **não existia** na imagem em que o comando rodava.
A linha `scripts/` foi removida do `.nixpacksignore` neste PR.

Vale conferir nos logs do último deploy se o `preDeployCommand` vinha falhando
silenciosamente; se vinha, é provável que colunas de migrações anteriores também
estejam faltando em produção. O backend agora tolera a ausência de `grupo_dre`,
mas outras funcionalidades podem não tolerar a ausência das colunas delas.

### 5.4 Ordem de deploy

O backend foi escrito para tolerar as duas ordens: se `grupo_dre` ainda não
existir, o relatório cai no agrupamento padrão por natureza e a tela continua
funcionando. Ainda assim, o caminho recomendado é:

1. rodar a migração;
2. fazer o merge do PR (o Railway faz o deploy automático da `main`).

### 5.5 Como reverter

Reverter a aplicação é só voltar o merge. Para desfazer o banco — o que
normalmente **não é necessário**, já que as mudanças são aditivas:

```sql
ALTER TABLE categorias_financeiras
  DROP COLUMN grupo_dre, DROP COLUMN centro_custo, DROP COLUMN ativa;
ALTER TABLE contas_pagar DROP COLUMN centro_custo;
ALTER TABLE transacoes_financeiras
  DROP COLUMN data_competencia, DROP COLUMN centro_custo, DROP COLUMN conta_receber_id;

DROP INDEX idx_transacoes_user_data ON transacoes_financeiras;
DROP INDEX idx_transacoes_user_tipo_data ON transacoes_financeiras;
DROP INDEX idx_contas_pagar_user_status_venc ON contas_pagar;
DROP INDEX idx_contas_receber_user_status_venc ON contas_receber;
DROP INDEX idx_ordens_user_status_previsao ON ordens_servico;
DROP INDEX idx_categorias_user_grupo ON categorias_financeiras;
```

---

## 6. Verificação executada

| Verificação | Resultado |
| --- | --- |
| `npx tsc --noEmit` | sem erros |
| `npm run build` | sucesso |
| `npx eslint .` | 0 erros (159 avisos pré-existentes, 11 a menos que antes) |
| `npm run test:documents` | 3 passaram |
| `npm run test:payables` | 5 passaram |
| `node --check server/index.mjs` | sintaxe válida |
| Inspeção visual | 10 capturas (desktop claro/escuro e mobile) contra dados de exemplo |

Não foi possível executar as consultas novas contra o banco de produção a
partir deste ambiente. **Antes de confiar nos números**, compare em
homologação o total de “Entrou no caixa” com a soma de
`transacoes_financeiras` do mês e o “A receber” com `contas_receber`.

---

## 7. O que ficou para depois

Em ordem de retorno:

1. **`/contas` (Contas a Pagar, 955 linhas) e `/transacoes`** — herdaram a nova
   paleta pela camada de compatibilidade, mas ainda não usam os primitivos nem
   paginação no servidor.
2. **`NovaOrdem` (995 linhas)** — formulário longo em tela única; ganharia muito
   com etapas (cliente → equipamento → diagnóstico → serviços → pagamento).
3. **Datas em `varchar`** — toda comparação usa `LEFT(campo,10)`, o que impede o
   banco de usar índice em faixa de datas. Migrar para `DATE`/`DATETIME` é a
   dívida técnica mais cara que resta.
4. **Centro de custo** — coluna criada, ainda sem interface.
5. **Remover a camada de compatibilidade do CSS** conforme cada tela migrar.
6. **CI** com `tsc`, `lint` e `build` obrigatórios antes do merge.
