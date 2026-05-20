import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  MessageSquare, 
  Settings,
  ArrowLeft,
  Phone
} from 'lucide-react';
import { TemplatesModal } from '../components/TemplatesModal';

export function ConfiguracoesCompletas() {
  const navigate = useNavigate();
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/')}
                className="flex items-center px-3 py-2 text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  ⚙️ Configurações
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  Gerencie templates e configurações do WhatsApp
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Configurações Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Templates de Mensagens */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center space-x-3 mb-4">
              <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-lg">
                <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Templates de Mensagens
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Configure modelos de mensagens para WhatsApp
                </p>
              </div>
            </div>
            
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300">
                Personalize as mensagens automáticas enviadas via WhatsApp para diferentes situações:
              </p>
              
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                  Confirmação de recebimento
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Notificação de conclusão
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></span>
                  Lembrete de retirada
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                  Avaliação de serviço
                </li>
              </ul>
              
              <button
                onClick={() => setShowTemplatesModal(true)}
                className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Gerenciar Templates
              </button>
            </div>
          </motion.div>

          {/* Configurações WhatsApp */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center space-x-3 mb-4">
              <div className="bg-green-100 dark:bg-green-900 p-2 rounded-lg">
                <Phone className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Configurações WhatsApp
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Configure a integração com WhatsApp
                </p>
              </div>
            </div>
            
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300">
                Configure as credenciais e parâmetros para integração com WhatsApp Business API:
              </p>
              
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Token de acesso da API
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Número do WhatsApp Business
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Configurações de webhook
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Logs de envio
                </li>
              </ul>
              
              <button
                onClick={() => navigate('/configuracoes-whatsapp')}
                className="w-full flex items-center justify-center px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
              >
                <Settings className="w-4 h-4 mr-2" />
                Configurar WhatsApp
              </button>
            </div>
          </motion.div>
        </div>

        {/* Informações Adicionais */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800"
        >
          <div className="flex items-start space-x-3">
            <div className="bg-blue-100 dark:bg-blue-900 p-1 rounded">
              <Settings className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                Configurações Simplificadas
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Esta página foi simplificada para focar apenas nas configurações essenciais: 
                templates de mensagens e integração com WhatsApp. Outras configurações foram removidas.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Modal de Templates */}
      <TemplatesModal 
        isOpen={showTemplatesModal}
        onClose={() => setShowTemplatesModal(false)}
      />
    </div>
  );
}
