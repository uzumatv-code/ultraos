# Loja do site (produtos, cursos e ebooks)

A loja de luthieriabrasilia.com.br usa este sistema como retaguarda: cadastro em **Loja do site → Produtos, cursos e ebooks**,
pedidos em **Loja do site → Pedidos da loja**. O site conversa com o sistema pelas rotas assinadas `/api/loja/v1`
(mesmo `PORTAL_SHARED_SECRET` e mesma conta do portal do cliente).

## Variáveis de ambiente

| Variável | Obrigatória | Para quê |
| --- | --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN` | sim, para vender | Access token de produção da conta Mercado Pago que recebe o dinheiro. Sem ele o site mostra os produtos mas não finaliza compras. |
| `MERCADOPAGO_WEBHOOK_SECRET` | recomendada | Assinatura secreta do webhook (Mercado Pago → Suas integrações → Webhooks, evento **Pagamentos**, URL `https://os.luthieriabrasilia.com.br/api/loja/v1/webhooks/mercadopago`). Sem ela os avisos não são conferidos, mas o pagamento sempre é confirmado consultando a API do Mercado Pago. |
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
