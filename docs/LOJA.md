# Loja do site (produtos, cursos e ebooks)

A loja de luthieriabrasilia.com.br usa este sistema como retaguarda: cadastro em **Loja do site → Produtos, cursos e ebooks**,
pedidos em **Loja do site → Pedidos da loja**. O site conversa com o sistema pelas rotas assinadas `/api/loja/v1`
(mesmo `PORTAL_SHARED_SECRET` e mesma conta do portal do cliente).

## Variáveis de ambiente

| Variável | Obrigatória | Para quê |
| --- | --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN` | sim, para vender | Access token de produção da conta Mercado Pago que recebe o dinheiro. Sem ele o site mostra os produtos mas não finaliza compras. |
| `MERCADOPAGO_WEBHOOK_SECRET` | não | Deixe vazia. Não é preciso cadastrar webhook no painel do Mercado Pago (o webhook da aplicação pode continuar apontando para outro sistema): cada cobrança da loja já leva o próprio endereço de aviso (`notification_url` = `https://os.luthieriabrasilia.com.br/api/loja/v1/webhooks/mercadopago`). O aviso nunca é confiado: o sistema sempre consulta o pagamento na API do Mercado Pago, e a cada 15 minutos confere os pedidos pendentes. Só preencha se tiver certeza de que os avisos chegam assinados com essa chave; se ela não bater, os avisos são recusados e a confirmação fica só pela conferência de 15 minutos. |
| `MELHOR_ENVIO_TOKEN` | para envio | Token da API do Melhor Envio (permissão `shipping-calculate`). Sem ele, produtos físicos só podem ser retirados na loja. |
| `MELHOR_ENVIO_EMAIL` | não | E-mail técnico no `User-Agent` exigido pelo Melhor Envio. |
| `PUBLIC_APP_URL` | não | Endereço público deste sistema (padrão `https://os.luthieriabrasilia.com.br`), usado nas fotos e no webhook. |
| `PORTAL_SITE_URL` | não | Endereço do site (padrão `https://luthieriabrasilia.com.br`), usado na volta do pagamento. |

## Arquivos

Fotos ficam em `uploads/loja/` (públicas) e PDFs de ebooks em `uploads/privado/ebooks/` (bloqueados; só baixa quem comprou).
**Monte um volume persistente em `/app/uploads`**, senão os arquivos somem a cada deploy.

## Como funciona

- O preço e o estoque cobrados vêm sempre do banco; o carrinho do navegador é só exibição.
- Ao criar o pedido, as peças físicas ficam reservadas por 30 minutos.
- Pagamento aprovado: baixa o estoque, libera cursos e ebooks, lança a receita no financeiro (categoria "Loja do site") e avisa o cliente pelo WhatsApp.
- Reembolso ou estorno no Mercado Pago tira o acesso e devolve o estoque (se ainda não foi enviado).
- A cada 15 minutos o sistema confere no Mercado Pago os pedidos pendentes (caso algum aviso tenha se perdido).
- Nota fiscal não é emitida automaticamente para as vendas da loja.

## Recomendados (afiliados do Mercado Livre)

Cadastro em **Loja do site → Recomendados (afiliados)**. Aparecem em `luthieriabrasilia.com.br/recomendamos`
(o link "Recomendamos" do menu só aparece quando há pelo menos uma indicação publicada).

| Variável | Obrigatória | Para quê |
| --- | --- | --- |
| `MERCADOLIVRE_CLIENT_ID` | para buscar dados | "App ID" do aplicativo criado em developers.mercadolivre.com.br. |
| `MERCADOLIVRE_CLIENT_SECRET` | para buscar dados | "Secret Key" do mesmo aplicativo. |
| `MERCADOLIVRE_ACCESS_TOKEN` | não | Token fixo, só para testes: vence em ~6 horas. Use a conexão pelo painel. |

A API do Mercado Livre só devolve nome, foto e preço para contas conectadas (sem login ela responde 403 e a página
do anúncio pede verificação de conta). Para conectar:

1. Em developers.mercadolivre.com.br, crie um aplicativo com a conta do Mercado Livre (a mesma do programa de afiliados).
2. Em **Redirect URI**, cadastre exatamente `https://os.luthieriabrasilia.com.br/api/mercadolivre/callback`
   (o painel mostra o endereço certo, a partir de `PUBLIC_APP_URL`). Escopos: leitura basta; `offline_access`
   é necessário para o acesso ser renovado sozinho.
3. Copie App ID e Secret Key para as variáveis acima e reinicie o sistema.
4. No painel, em Recomendados, clique em **Conectar Mercado Livre** e autorize.

O acesso (~6 h) é renovado sozinho antes de vencer, com PKCE e `state` de uso único. Se a autorização for revogada
no Mercado Livre, o painel avisa e pede para conectar de novo.

- Não passam pelo carrinho nem pelo Mercado Pago: quem vende e entrega é o Mercado Livre; a comissão aparece no painel de afiliados de lá.
- Cadastro: cole o link de afiliado (e, se o link curto não for reconhecido, o endereço do anúncio). O sistema busca nome, foto e preço. Para publicar é preciso escrever **por que a oficina recomenda**.
- O botão do site aponta para `/r/<id>`: o site pede o link a este sistema (rota assinada), que conta o clique e devolve o link de afiliado. Robôs são redirecionados, mas não contam. O link só é aceito se for `https` de um domínio do Mercado Livre.
- A cada 6 horas o sistema confere os anúncios publicados (no máximo uma vez por dia cada): atualiza preço e disponibilidade. Anúncio pausado sai do site sozinho e o link antigo leva de volta à vitrine. Nome e foto que você editou nunca são trocados.
- Fotos ficam em `uploads/loja/recomendados/` (mesmo volume persistente da loja).
- Publique o sistema antes do site: o site novo pede `/api/loja/v1/recomendados` e, sem a rota, mostra a vitrine como "fora do ar".
