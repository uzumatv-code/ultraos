export function capitalize(text: string) {
  if (!text) return '';
  return text.toLowerCase().replace(/(^|\s)\w/g, letter => letter.toUpperCase());
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
}

export function formatDateOnly(date: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(date));
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}

export function formatCPFCNPJ(value: string): string {
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export function generateWhatsAppMessage(ordem: any): string {
  const message = `Olá ${ordem.cliente?.nome}, aqui é o Samuel Luthier responsável por seu serviço.

CNPJ: 30.057.854/0001-75

O.S Nº: ${ordem.numero}
Data da entrada: ${formatDate(ordem.data_entrada || new Date())}

Instrumento: ${ordem.marca?.nome || ''} ${ordem.modelo || ''}
Acessórios: ${ordem.acessorios || 'Nenhum'}

Valor: ${formatCurrency(ordem.valor_servicos)}
Desconto: ${formatCurrency(ordem.desconto)}
Valor total: ${formatCurrency(ordem.valor_servicos - ordem.desconto)}

Forma de pagamento: ${ordem.forma_pagamento.toUpperCase()}
${ordem.forma_pagamento === 'pix' ? '\nPAGAMENTO ANTECIPADO!\nCHAVE CNPJ: 30.057.854/0001-75' : ''}

PREVISÃO DE ENTREGA: ${formatDateOnly(ordem.data_previsao)}
HORÁRIO DE ENTREGA À COMBINAR

${ordem.observacoes}`;

  return encodeURIComponent(message);
}

export function openWhatsApp(phoneNumber: string, message: string) {
  const cleanedPhone = phoneNumber.replace(/\D/g, '');
  window.open(`https://wa.me/55${cleanedPhone}?text=${message}`, '_blank');
}