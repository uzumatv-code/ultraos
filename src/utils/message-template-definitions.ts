export interface MessageTemplateDefinition {
  type: string;
  name: string;
  description: string;
  variables: string[];
  defaultContent: string;
}

export const TERMOS_DE_USO_VARIABLE = '{termos_de_uso}';

const withTerms = (variables: string[]) => (
  variables.includes(TERMOS_DE_USO_VARIABLE) ? variables : [...variables, TERMOS_DE_USO_VARIABLE]
);

export const MESSAGE_TEMPLATE_DEFINITIONS: MessageTemplateDefinition[] = [
  {
    type: 'nova_ordem',
    name: 'Nova Ordem Criada',
    description: 'Mensagem enviada quando uma nova ordem é criada',
    variables: withTerms(['{cliente}', '{instrumento}', '{marca}', '{modelo}', '{numero}', '{acessorios}', '{servicos}', '{problemas}', '{valor}', '{forma_pagamento}', '{data_criacao}', '{previsao_entrega}', '{observacoes}', '{nome_empresa}', '{telefone_empresa}', '{endereco_empresa}', '{horario_funcionamento}', '{dias_funcionamento}']),
    defaultContent: `Olá {cliente}! 😊

Recebemos seu {instrumento} para reparo/manutenção.

📋 *ORDEM DE SERVIÇO #{numero}*
📅 Data de Entrada: {data_criacao}
🎸 Instrumento: {instrumento} {marca} {modelo}
📦 Acessórios: {acessorios}
⚙️ Serviços: {servicos}
🔧 Problemas Reportados: {problemas}
💰 Valor: {valor}
💳 Forma de Pagamento: {forma_pagamento}
📅 Previsão de Entrega: {previsao_entrega}

{observacoes}

Manteremos você informado sobre o andamento!

📍 {nome_empresa}
📞 {telefone_empresa}
⏰ {horario_funcionamento}
📅 {dias_funcionamento}`,
  },
  {
    type: 'servico_finalizado',
    name: 'Serviço Finalizado',
    description: 'Mensagem enviada quando um serviço é finalizado',
    variables: withTerms(['{cliente}', '{instrumento}', '{numero}', '{nome_empresa}', '{cnpj}', '{horario_funcionamento}', '{dias_funcionamento}']),
    defaultContent: `Olá {cliente}, seu {instrumento} ficou pronto! 🎸

Pode retirar entre:
⏰ {horario_funcionamento}
📅 {dias_funcionamento}

📍 {nome_empresa}
CNPJ: {cnpj}

Ordem de Serviço: #{numero}`,
  },
  {
    type: 'servico_andamento',
    name: 'Serviço em Andamento',
    description: 'Mensagem informando que o serviço está em andamento',
    variables: withTerms(['{cliente}', '{instrumento}', '{numero}', '{nome_empresa}', '{horario_funcionamento}', '{dias_funcionamento}']),
    defaultContent: `Olá {cliente}, informamos que seu {instrumento} está em andamento! 🔧

📋 Ordem de Serviço: #{numero}
⚙️ Nossos técnicos estão trabalhando no seu instrumento

📍 {nome_empresa}
📞 Entre em contato se tiver dúvidas

Horário de atendimento:
⏰ {horario_funcionamento}
📅 {dias_funcionamento}`,
  },
  {
    type: 'servico_atraso',
    name: 'Contratempo/Atraso',
    description: 'Mensagem informando sobre atrasos no serviço',
    variables: withTerms(['{cliente}', '{instrumento}', '{numero}', '{nome_empresa}', '{horario_funcionamento}', '{dias_funcionamento}']),
    defaultContent: `Olá {cliente}, informamos sobre um contratempo no seu {instrumento} ⏰

📋 Ordem de Serviço: #{numero}
⚠️ Houve um pequeno atraso no cronograma

Entraremos em contato em breve com nova previsão de entrega.

📍 {nome_empresa}
📞 Entre em contato se tiver dúvidas

Horário de atendimento:
⏰ {horario_funcionamento}
📅 {dias_funcionamento}

Pedimos desculpas pelo inconveniente.`,
  },
  {
    type: 'lembrete_retirada',
    name: 'Lembrete de Retirada',
    description: 'Lembrete para clientes retirarem instrumentos prontos',
    variables: withTerms(['{cliente}', '{instrumento}', '{numero}', '{nome_empresa}', '{horario_funcionamento}', '{dias_funcionamento}', '{dias_prontos}']),
    defaultContent: `Olá {cliente}! 👋

Lembramos que seu {instrumento} está pronto há {dias_prontos} dias para retirada.

📋 Ordem de Serviço: #{numero}
⏰ {horario_funcionamento}
📅 {dias_funcionamento}

📍 {nome_empresa}

Aguardamos você! 😊`,
  },
  {
    type: 'cobranca_pagamento',
    name: 'Cobrança/Pagamento',
    description: 'Mensagem para cobrança ou confirmação de pagamento',
    variables: withTerms(['{cliente}', '{instrumento}', '{numero}', '{valor}', '{valor_pendente}', '{forma_pagamento}', '{nome_empresa}']),
    defaultContent: `Olá {cliente}! 💳

Referente ao seu {instrumento}:

📋 Ordem de Serviço: #{numero}
💰 Valor total: {valor}
💵 Pendente: {valor_pendente}

Para finalizar, precisamos acertar o pagamento.

📍 {nome_empresa}
📞 Entre em contato para mais detalhes

Obrigado! 😊`,
  },
  {
    type: 'lembrete_manutencao',
    name: 'Lembrete Manutenção Preventiva',
    description: 'Lembrete automático para manutenção preventiva (enviado após 6 meses)',
    variables: withTerms(['{cliente}', '{instrumento}', '{ultimo_servico}', '{meses_sem_manutencao}', '{nome_empresa}', '{telefone_empresa}', '{horario_funcionamento}', '{dias_funcionamento}']),
    defaultContent: `Olá {cliente}! 👋

Esperamos que você e seu {instrumento} estejam bem! 🎸

Notamos que já faz {meses_sem_manutencao} meses desde sua última manutenção ({ultimo_servico}).

🔧 Que tal agendar uma revisão preventiva?
- Troca de cordas
- Regulagem
- Limpeza e hidratação
- Verificação geral

Uma manutenção regular mantém seu instrumento sempre em perfeito estado!

📍 {nome_empresa}
📞 {telefone_empresa}
⏰ {horario_funcionamento}
📅 {dias_funcionamento}

Entre em contato para agendar! 😊`,
  },
  {
    type: 'orcamento_aprovado',
    name: 'Orçamento Aprovado',
    description: 'Confirmação quando cliente aprova o orçamento',
    variables: withTerms(['{cliente}', '{instrumento}', '{numero}', '{servicos}', '{valor}', '{previsao_entrega}', '{nome_empresa}', '{telefone_empresa}']),
    defaultContent: `Olá {cliente}! ✅

Orçamento aprovado para seu {instrumento}!

📋 Ordem de Serviço: #{numero}
⚙️ Serviços autorizados: {servicos}
💰 Valor aprovado: {valor}
📅 Nova previsão: {previsao_entrega}

Iniciaremos os trabalhos imediatamente!

📍 {nome_empresa}
📞 {telefone_empresa}`,
  },
  {
    type: 'diagnostico_concluido',
    name: 'Diagnóstico Concluído',
    description: 'Mensagem com resultado do diagnóstico e orçamento',
    variables: withTerms(['{cliente}', '{instrumento}', '{numero}', '{problemas_encontrados}', '{servicos_necessarios}', '{valor_orcamento}', '{nome_empresa}', '{telefone_empresa}']),
    defaultContent: `Olá {cliente}! 🔍

Diagnóstico concluído para seu {instrumento}:

📋 Ordem de Serviço: #{numero}
🔧 Problemas encontrados: {problemas_encontrados}
⚙️ Serviços necessários: {servicos_necessarios}
💰 Orçamento: {valor_orcamento}

Aguardamos sua aprovação para prosseguir!

📍 {nome_empresa}
📞 {telefone_empresa}`,
  },
  {
    type: 'avaliacao_google_instagram',
    name: 'Solicitação de Avaliação e Instagram',
    description: 'Pedido de avaliação no Google e convite para seguir no Instagram (enviado 7 dias após conclusão)',
    variables: withTerms(['{cliente}', '{instrumento}', '{marca}', '{modelo}', '{numero}', '{nome_empresa}', '{telefone_empresa}', '{google_review_link}', '{instagram_handle}']),
    defaultContent: `Olá {cliente}! 😊

Esperamos que esteja satisfeito(a) com o reparo do seu {instrumento} {marca} {modelo}!

🌟 *SUA OPINIÃO É MUITO IMPORTANTE*

Poderia nos ajudar avaliando nosso trabalho no Google? Sua avaliação ajuda outros músicos a nos conhecerem!

👍 Link para avaliar: {google_review_link}

📱 *SIGA-NOS NO INSTAGRAM*
Acompanhe dicas de manutenção, novos projetos e promoções: {instagram_handle}

Muito obrigado pela confiança! 🎸

📍 {nome_empresa}
📞 {telefone_empresa}

#Luthieria #ReparoInstrumentos #MúsicaBrasília`,
  },
];

export const MESSAGE_TEMPLATE_BY_TYPE = Object.fromEntries(
  MESSAGE_TEMPLATE_DEFINITIONS.map((definition) => [definition.type, definition]),
) as Record<string, MessageTemplateDefinition>;
