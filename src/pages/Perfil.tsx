import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, Mail, Key, UserPlus, ArrowLeft, Edit, User, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { AlterarSenhaModal } from '../components/AlterarSenhaModal';
import { NovoUsuarioModal } from '../components/NovoUsuarioModal';
import { EditarPerfilModal } from '../components/EditarPerfilModal';
import ConfiguracaoFiscalModal from '../components/ConfiguracaoFiscalModal';
import { useAuth } from '../contexts/AuthContext';

export function Perfil() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showAlterarSenhaModal, setShowAlterarSenhaModal] = useState(false);
  const [showNovoUsuarioModal, setShowNovoUsuarioModal] = useState(false);
  const [showEditarPerfilModal, setShowEditarPerfilModal] = useState(false);
  const [showConfigFiscalModal, setShowConfigFiscalModal] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [notificacoesEmail, setNotificacoesEmail] = useState(true);
  const [notificacoesWhatsApp, setNotificacoesWhatsApp] = useState(true);

  useEffect(() => {
    loadUserData();
  }, []);

  async function loadUserData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setNome(user.user_metadata?.nome || '');
        setEmail(user.email || '');
      }
    } catch (error) {
      console.error('Erro ao carregar dados do usuário:', error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // Aqui você implementará a lógica para salvar as configurações
      toast.success('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-4xl px-3 py-6 sm:px-6 lg:px-8 sm:py-8">
        <div className="mb-8 flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            Perfil e Configurações
          </h1>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Informações do Perfil */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6"
          >
            <div className="flex items-center space-x-2 mb-6">
              <User className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                Informações do Perfil
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nome
                </label>
                <div className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-200 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{nome || 'Nome não informado'}</span>
                  <button
                    type="button"
                    onClick={() => setShowEditarPerfilModal(true)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="Editar perfil"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <div className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-200">
                  <span className="block min-w-0 truncate">{email}</span>
                </div>
              </div>

              <div className="pt-4 space-y-3">
                <button
                  onClick={() => setShowAlterarSenhaModal(true)}
                  className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center justify-center space-x-2"
                >
                  <Key className="w-4 h-4" />
                  <span>Alterar Senha</span>
                </button>

                {can('users.manage') && <button
                  onClick={() => setShowNovoUsuarioModal(true)}
                  className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center justify-center space-x-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Gerenciar Equipe</span>
                </button>}

                {can('nfse.manage') && <button
                  onClick={() => setShowConfigFiscalModal(true)}
                  className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <Building2 className="w-4 h-4" />
                  <span>Dados Fiscais (NFS-e)</span>
                </button>}
              </div>
            </div>
          </motion.div>

          {/* Configurações */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6"
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <Bell className="w-5 h-5 text-purple-600" />
                    <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                      Notificações
                    </h2>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={notificacoesEmail}
                      onChange={(e) => setNotificacoesEmail(e.target.checked)}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 flex items-center">
                      <Mail className="w-4 h-4 mr-1" />
                      Receber notificações por email
                    </span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={notificacoesWhatsApp}
                      onChange={(e) => setNotificacoesWhatsApp(e.target.checked)}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      Receber notificações por WhatsApp
                    </span>
                  </label>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : 'Salvar Configurações'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      </div>

      <AlterarSenhaModal
        isOpen={showAlterarSenhaModal}
        onClose={() => setShowAlterarSenhaModal(false)}
      />

      <NovoUsuarioModal
        isOpen={showNovoUsuarioModal}
        onClose={() => setShowNovoUsuarioModal(false)}
      />

      <EditarPerfilModal
        isOpen={showEditarPerfilModal}
        onClose={() => setShowEditarPerfilModal(false)}
        onSuccess={loadUserData}
      />

      <ConfiguracaoFiscalModal
        isOpen={showConfigFiscalModal}
        onClose={() => setShowConfigFiscalModal(false)}
        onSave={() => {
          setShowConfigFiscalModal(false);
          toast.success('Dados fiscais configurados com sucesso!');
        }}
      />
    </div>
  );
}
