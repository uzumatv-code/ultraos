import Swal from 'sweetalert2';
import { WhatsAppService } from './whatsapp-service';
import { formatLocalDate } from './dates';
import { supabase } from '../lib/supabase';

// Detectar tema escuro
const isDarkMode = () => {
  return document.documentElement.classList.contains('dark') || 
         window.matchMedia('(prefers-color-scheme: dark)').matches;
};

// Configuração base para dark mode
const getBaseConfig = () => ({
  background: isDarkMode() ? '#1f2937' : '#ffffff',
  color: isDarkMode() ? '#f9fafb' : '#1f2937',
  customClass: {
    popup: 'rounded-2xl shadow-2xl border ' + (isDarkMode() ? 'border-gray-700' : 'border-gray-200'),
    title: 'font-bold ' + (isDarkMode() ? 'text-gray-100' : 'text-gray-900'),
    htmlContainer: (isDarkMode() ? 'text-gray-300' : 'text-gray-700'),
    confirmButton: 'rounded-xl px-6 py-3 font-semibold shadow-lg transition-all hover:scale-105',
    cancelButton: 'rounded-xl px-6 py-3 font-semibold shadow-lg transition-all hover:scale-105',
    actions: 'gap-3'
  }
});

export const alerts = {
  success: (message: string) => {
    return Swal.fire({
      ...getBaseConfig(),
      title: '✅ Sucesso!',
      text: message,
      icon: 'success',
      confirmButtonText: 'OK',
      confirmButtonColor: '#10b981',
      iconColor: '#10b981',
      showClass: {
        popup: 'animate__animated animate__fadeInDown'
      },
      hideClass: {
        popup: 'animate__animated animate__fadeOutUp'
      }
    });
  },

  error: (message: string) => {
    return Swal.fire({
      ...getBaseConfig(),
      title: '❌ Erro!',
      text: message,
      icon: 'error',
      confirmButtonText: 'OK',
      confirmButtonColor: '#ef4444',
      iconColor: '#ef4444',
      showClass: {
        popup: 'animate__animated animate__shakeX'
      }
    });
  },

  info: (message: string) => {
    return Swal.fire({
      ...getBaseConfig(),
      title: 'ℹ️ Informação',
      text: message,
      icon: 'info',
      confirmButtonText: 'OK',
      confirmButtonColor: '#3b82f6',
      iconColor: '#3b82f6',
      showClass: {
        popup: 'animate__animated animate__fadeIn'
      }
    });
  },

  confirm: (options: {
    title: string;
    text: string;
    icon?: 'warning' | 'error' | 'success' | 'info' | 'question';
    confirmButtonText?: string;
    cancelButtonText?: string;
  }) => {
    const iconColors: Record<string, string> = {
      warning: '#f59e0b',
      error: '#ef4444',
      success: '#10b981',
      info: '#3b82f6',
      question: '#8b5cf6'
    };
    
    return Swal.fire({
      ...getBaseConfig(),
      title: options.title,
      text: options.text,
      icon: options.icon || 'warning',
      showCancelButton: true,
      confirmButtonColor: '#8b5cf6',
      cancelButtonColor: '#6b7280',
      confirmButtonText: options.confirmButtonText || '✓ Sim',
      cancelButtonText: options.cancelButtonText || '✕ Cancelar',
      iconColor: iconColors[options.icon || 'warning'],
      showClass: {
        popup: 'animate__animated animate__zoomIn'
      },
      reverseButtons: true
    });
  },

  orderDetails: (ordem: any, onStatusUpdate?: () => void) => {
    const dark = isDarkMode();
    
    return Swal.fire({
      ...getBaseConfig(),
      title: `🛠️ Ordem #${ordem.numero}`,
      html: `<div class="text-left space-y-4">
        <div class="${dark ? 'bg-purple-900/20 border border-purple-700/30' : 'bg-purple-50'} p-4 rounded-xl backdrop-blur-sm">
          <p class="font-semibold ${dark ? 'text-purple-300' : 'text-purple-900'} mb-3 flex items-center gap-2">
            <span class="text-xl">👤</span> Cliente
          </p>
          <p class="${dark ? 'text-gray-300' : 'text-gray-700'} mb-2"><strong class="${dark ? 'text-gray-200' : 'text-gray-900'}">Nome:</strong> ${ordem.cliente?.nome || 'N/A'}</p>
          <p class="${dark ? 'text-gray-300' : 'text-gray-700'}"><strong class="${dark ? 'text-gray-200' : 'text-gray-900'}">Telefone:</strong> ${ordem.cliente?.telefone || 'N/A'}</p>
        </div>
        
        <div class="${dark ? 'bg-blue-900/20 border border-blue-700/30' : 'bg-blue-50'} p-4 rounded-xl backdrop-blur-sm">
          <p class="font-semibold ${dark ? 'text-blue-300' : 'text-blue-900'} mb-3 flex items-center gap-2">
            <span class="text-xl">🎸</span> Instrumento
          </p>
          <p class="${dark ? 'text-gray-300' : 'text-gray-700'} mb-2"><strong class="${dark ? 'text-gray-200' : 'text-gray-900'}">Instrumento:</strong> ${ordem.instrumento?.nome || 'N/A'}</p>
          <p class="${dark ? 'text-gray-300' : 'text-gray-700'} mb-2"><strong class="${dark ? 'text-gray-200' : 'text-gray-900'}">Marca:</strong> ${ordem.marca?.nome || 'N/A'}</p>
          <p class="${dark ? 'text-gray-300' : 'text-gray-700'} mb-2"><strong class="${dark ? 'text-gray-200' : 'text-gray-900'}">Modelo:</strong> ${ordem.modelo || 'N/A'}</p>
          <p class="${dark ? 'text-gray-300' : 'text-gray-700'}"><strong class="${dark ? 'text-gray-200' : 'text-gray-900'}">Acessórios:</strong> ${ordem.acessorios || 'N/A'}</p>
        </div>
        
        <div class="${dark ? 'bg-gray-800/50 border border-gray-700/30' : 'bg-gray-50'} p-4 rounded-xl backdrop-blur-sm">
          <div class="space-y-3">
            <div>
              <p class="${dark ? 'text-gray-300' : 'text-gray-700'} flex items-center gap-2">
                <strong class="${dark ? 'text-gray-200' : 'text-gray-900'}">Status:</strong> 
                <span class="px-3 py-1 rounded-full text-sm font-medium ${
                  ordem.status === 'pendente' ? (dark ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-700/50' : 'bg-yellow-100 text-yellow-800') :
                  ordem.status === 'em_andamento' ? (dark ? 'bg-blue-900/30 text-blue-300 border border-blue-700/50' : 'bg-blue-100 text-blue-800') :
                  ordem.status === 'atraso' ? (dark ? 'bg-red-900/30 text-red-300 border border-red-700/50' : 'bg-red-100 text-red-800') :
                  (dark ? 'bg-green-900/30 text-green-300 border border-green-700/50' : 'bg-green-100 text-green-800')
                }">
                  ${
                    ordem.status === 'pendente' ? '⏳ Pendente' :
                    ordem.status === 'em_andamento' ? '🔧 Em Andamento' :
                    ordem.status === 'atraso' ? '⚠️ Em Atraso' :
                    '✅ Concluído'
                  }
                </span>
              </p>
            </div>
            <div>
              <p class="${dark ? 'text-gray-300' : 'text-gray-700'}"><strong class="${dark ? 'text-gray-200' : 'text-gray-900'}">📅 Entrada:</strong> ${formatLocalDate(ordem.data_entrada)}</p>
            </div>
            <div>
              <p class="${dark ? 'text-gray-300' : 'text-gray-700'}"><strong class="${dark ? 'text-gray-200' : 'text-gray-900'}">📆 Previsão:</strong> ${formatLocalDate(ordem.data_previsao)}</p>
            </div>
            <div>
              <p class="${dark ? 'text-gray-300' : 'text-gray-700'}"><strong class="${dark ? 'text-gray-200' : 'text-gray-900'}">💰 Valor:</strong> ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ordem.valor_total)}</p>
            </div>
          </div>
        </div>

        ${ordem.defeito_relatado ? `
        <div class="${dark ? 'bg-red-900/20 border border-red-700/30' : 'bg-red-50'} p-4 rounded-xl backdrop-blur-sm">
          <p class="font-semibold ${dark ? 'text-red-300' : 'text-red-900'} mb-2 flex items-center gap-2">
            <span class="text-xl">⚠️</span> Defeito Relatado
          </p>
          <p class="${dark ? 'text-gray-300' : 'text-gray-700'}">${ordem.defeito_relatado}</p>
        </div>
        ` : ''}

        ${ordem.observacoes ? `
        <div class="${dark ? 'bg-gray-800/50 border border-gray-700/30' : 'bg-gray-50'} p-4 rounded-xl backdrop-blur-sm">
          <p class="font-semibold ${dark ? 'text-gray-200' : 'text-gray-900'} mb-2 flex items-center gap-2">
            <span class="text-xl">📝</span> Observações
          </p>
          <p class="${dark ? 'text-gray-300' : 'text-gray-700'}">${ordem.observacoes}</p>
        </div>
        ` : ''}

        <div class="${dark ? 'bg-green-900/20 border border-green-700/30' : 'bg-green-50/50 border border-green-200'} p-4 rounded-xl backdrop-blur-sm">
          <p class="font-semibold ${dark ? 'text-green-300' : 'text-green-800'} mb-3 flex items-center gap-2">
            <span class="text-xl">🚀</span> Ações Rápidas com WhatsApp
          </p>
          <div class="grid grid-cols-1 gap-2">
            <button type="button" id="btn-andamento" class="w-full px-4 py-2 ${dark ? 'bg-blue-700 hover:bg-blue-600' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded-lg transition-all duration-300 text-sm font-medium transform hover:scale-105">
              📧 Avisar: Serviço em Andamento
            </button>
            <button type="button" id="btn-atraso" class="w-full px-4 py-2 ${dark ? 'bg-orange-700 hover:bg-orange-600' : 'bg-orange-600 hover:bg-orange-700'} text-white rounded-lg transition-all duration-300 text-sm font-medium transform hover:scale-105">
              ⏰ Avisar: Tivemos um Contratempo
            </button>
            <button type="button" id="btn-finalizar" class="w-full px-4 py-2 ${dark ? 'bg-green-700 hover:bg-green-600' : 'bg-green-600 hover:bg-green-700'} text-white rounded-lg transition-all duration-300 text-sm font-medium transform hover:scale-105">
              ✅ Finalizar e Avisar Cliente
            </button>
          </div>
        </div>
      </div>`,
      showCloseButton: true,
      showConfirmButton: true,
      confirmButtonText: '✕ Fechar',
      confirmButtonColor: dark ? '#6b7280' : '#8B5CF6',
      width: '42rem',
      showClass: {
        popup: 'animate__animated animate__fadeInDown'
      },
      didOpen: () => {
        const btnAndamento = document.getElementById('btn-andamento');
        const btnAtraso = document.getElementById('btn-atraso');
        const btnFinalizar = document.getElementById('btn-finalizar');

        btnAndamento?.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Desabilitar o botão para evitar cliques duplos
          if (btnAndamento) {
            (btnAndamento as HTMLButtonElement).disabled = true;
            btnAndamento.textContent = 'Enviando...';
          }
          
          try {
            await WhatsAppService.sendProgressMessage(ordem);
            await alerts.updateOrderStatus(ordem.id, 'em_andamento');
            
            // Fechar o modal atual
            Swal.close();
            
            // Mostrar sucesso
            setTimeout(async () => {
              await alerts.success('Status atualizado para "Em Andamento" e mensagem WhatsApp enviada!');
              // Chamar callback para atualizar a interface
              if (onStatusUpdate) onStatusUpdate();
            }, 300);
            
          } catch (error: any) {
            console.error('❌ Erro ao enviar mensagem de andamento:', error);
            
            // Reabilitar o botão
            if (btnAndamento) {
              (btnAndamento as HTMLButtonElement).disabled = false;
              btnAndamento.textContent = '📧 Avisar: Serviço em Andamento';
            }
            
            await alerts.error('Erro ao enviar mensagem: ' + (error?.message || error));
          }
        });

        btnAtraso?.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Desabilitar o botão para evitar cliques duplos
          if (btnAtraso) {
            (btnAtraso as HTMLButtonElement).disabled = true;
            btnAtraso.textContent = 'Enviando...';
          }
          
          try {
            await WhatsAppService.sendDelayMessage(ordem);
            await alerts.updateOrderStatus(ordem.id, 'atraso');
            
            // Fechar o modal atual
            Swal.close();
            
            // Mostrar sucesso
            setTimeout(async () => {
              await alerts.success('Status atualizado para "Em Atraso" e mensagem WhatsApp enviada!');
              // Chamar callback para atualizar a interface
              if (onStatusUpdate) onStatusUpdate();
            }, 300);
            
          } catch (error: any) {
            console.error('❌ Erro ao enviar mensagem de atraso:', error);
            
            // Reabilitar o botão
            if (btnAtraso) {
              (btnAtraso as HTMLButtonElement).disabled = false;
              btnAtraso.textContent = '⏰ Avisar: Tivemos um Contratempo';
            }
            
            await alerts.error('Erro ao enviar mensagem: ' + (error?.message || error));
          }
        });

        btnFinalizar?.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Desabilitar o botão para evitar cliques duplos
          if (btnFinalizar) {
            (btnFinalizar as HTMLButtonElement).disabled = true;
            btnFinalizar.textContent = 'Finalizando...';
          }
          
          try {
            await WhatsAppService.sendCompletionMessage(ordem);
            await alerts.updateOrderStatus(ordem.id, 'concluido');
            
            // Fechar o modal atual
            Swal.close();
            
            // Mostrar sucesso
            setTimeout(async () => {
              await alerts.success('Ordem finalizada e cliente notificado via WhatsApp!');
              // Chamar callback para atualizar a interface
              if (onStatusUpdate) onStatusUpdate();
            }, 300);
            
          } catch (error: any) {
            console.error('❌ Erro ao finalizar ordem:', error);
            
            // Reabilitar o botão
            if (btnFinalizar) {
              (btnFinalizar as HTMLButtonElement).disabled = false;
              btnFinalizar.textContent = '✅ Finalizar e Avisar Cliente';
            }
            
            await alerts.error('Erro ao finalizar ordem: ' + (error?.message || error));
          }
        });
      }
    });
  },

  updateOrderStatus: async (ordemId: string, status: string) => {
    const { error } = await supabase
      .from('ordens_servico')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', ordemId);

    if (error) throw error;

    if (status === 'concluido') {
      const sessionRaw = localStorage.getItem('mysql-auth-session');
      const token = sessionRaw ? JSON.parse(sessionRaw)?.access_token : null;
      const response = await fetch(`/api/financeiro/os/${ordemId}/pagamentos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          observacoes: 'Receita lancada automaticamente ao concluir a OS'
        })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok && !String(json.error?.message || '').includes('ja esta quitada')) {
        throw new Error(json.error?.message || 'Erro ao lancar receita da OS');
      }
    }
  }
};
