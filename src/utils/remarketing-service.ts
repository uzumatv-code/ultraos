import { apiRequest } from '../lib/api-client';

export type ConsentStatus = 'autorizado' | 'nao_autorizado' | 'descadastrado';

export interface RemarketingCampaign {
  id: string;
  nome: string;
  ativo: number | boolean;
  automatico: number | boolean;
  dias_sem_manutencao: number;
  horario_envio: number;
  limite_diario: number;
  intervalo_minimo_segundos: number;
  intervalo_cliente_dias: number;
  max_tentativas: number;
  mensagem: string;
  updated_at: string;
}

export interface RemarketingOpportunity {
  ordem_servico_id: string;
  ordem_numero: number;
  cliente_id: string;
  cliente_nome: string;
  cliente_telefone: string;
  instrumento_id?: string;
  equipamento_id?: string;
  instrumento_nome?: string;
  equipamento_nome?: string;
  marca_nome?: string;
  modelo?: string;
  data_ultima_manutencao: string;
  dias_sem_manutencao: number;
  consentimento: ConsentStatus;
  origem_consentimento?: string;
  mensagem_erro?: string;
}

export interface RemarketingHistoryItem {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  cliente_telefone: string;
  ordem_servico_id: string;
  ordem_numero: number;
  instrumento_nome?: string;
  equipamento_nome?: string;
  marca_nome?: string;
  modelo?: string;
  status: 'processando' | 'enviado' | 'respondido' | 'convertido' | 'descadastrado' | 'erro' | 'cancelado';
  tentativas: number;
  data_envio?: string;
  mensagem?: string;
  mensagem_erro?: string;
  created_at: string;
}

export interface RemarketingOverview {
  campaign: RemarketingCampaign;
  provider: {
    provider: string;
    connected: boolean;
    official: boolean;
    automaticAllowed: boolean;
    manualSingleAllowed: boolean;
  };
  opportunities: RemarketingOpportunity[];
  history: RemarketingHistoryItem[];
  stats: {
    elegiveis: number;
    autorizados: number;
    enviados: number;
    respondidos: number;
    convertidos: number;
    erros: number;
    descadastrados: number;
  };
}

export const RemarketingService = {
  getOverview() {
    return apiRequest<RemarketingOverview>('/api/remarketing/overview');
  },

  saveSettings(settings: Partial<RemarketingCampaign>) {
    return apiRequest<RemarketingCampaign>('/api/remarketing/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  setConsent(clientId: string, authorized: boolean, optedOut = false) {
    return apiRequest<{ cliente_id: string; autorizado: boolean; descadastrado: boolean }>(
      `/api/remarketing/clients/${clientId}/consent`,
      {
        method: 'PUT',
        body: JSON.stringify({
          autorizado: authorized,
          descadastrado: optedOut,
          origem: optedOut ? 'registrado_no_sistema' : 'autorizacao_registrada_atendimento',
          motivo: optedOut ? 'Solicitado pelo cliente' : undefined,
        }),
      },
    );
  },

  send(orderId: string) {
    return apiRequest<{ id: string; status: string; conversa_id: string; data_envio: string }>(
      `/api/remarketing/send/${orderId}`,
      { method: 'POST' },
    );
  },

  renderPreview(campaign: RemarketingCampaign, opportunity: RemarketingOpportunity) {
    const months = Math.max(1, Math.floor(opportunity.dias_sem_manutencao / 30));
    const instrument = [opportunity.instrumento_nome || opportunity.equipamento_nome, opportunity.marca_nome, opportunity.modelo]
      .filter(Boolean).join(' ') || 'instrumento';
    const replacements: Record<string, string> = {
      '{{nome}}': opportunity.cliente_nome.split(' ')[0] || 'cliente',
      '{{cliente}}': opportunity.cliente_nome,
      '{{instrumento}}': instrument,
      '{{meses}}': String(months),
      '{{dias}}': String(opportunity.dias_sem_manutencao),
    };
    return Object.entries(replacements).reduce(
      (message, [token, value]) => message.split(token).join(value),
      campaign.mensagem,
    );
  },
};
