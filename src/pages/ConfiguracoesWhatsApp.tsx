import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Webhook, Settings, Save, TestTube, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';

interface WhatsAppConfig {
  method: 'direct' | 'webhook'; // 'webhook' = Evolution API
  webhook_url: string;
  api_key?: string;
  instance_name?: string;
}

export function ConfiguracoesWhatsApp() {
  const [config, setConfig] = useState<WhatsAppConfig>({
    method: 'direct',
    webhook_url: '',
    api_key: '',
    instance_name: ''
  });
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('configuracoes_whatsapp')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Erro ao carregar configurações:', error);
        return;
      }

      if (data) {
        setConfig(data);
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
    }
  }

  async function saveConfig() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Validações básicas
      if (config.method === 'webhook' && !config.webhook_url) {
        throw new Error('URL da Evolution API é obrigatória quando usar este método');
      }
      if (config.method === 'webhook' && !config.instance_name) {
        throw new Error('Nome da instância é obrigatório para Evolution API');
      }
      if (config.method === 'webhook' && !config.api_key) {
        throw new Error('API Key é obrigatória para Evolution API');
      }

      const configData = {
        user_id: user.id,
        method: config.method,
        webhook_url: config.webhook_url || null,
        api_key: config.api_key || null,
        instance_name: config.instance_name || null,
        updated_at: new Date().toISOString()
      };

      console.log('Salvando configuração:', configData);

      const { data, error } = await supabase
        .from('configuracoes_whatsapp')
        .upsert(configData, {
          onConflict: 'user_id'
        })
        .select();

      if (error) {
        console.error('Erro detalhado do Supabase:', error);
        throw new Error(`Erro do banco: ${error.message} (${error.code})`);
      }

      console.log('Configuração salva com sucesso:', data);
      toast.success('Configurações salvas com sucesso!');
    } catch (error: any) {
      console.error('Erro ao salvar configurações:', error);
      
      let errorMessage = 'Erro desconhecido ao salvar configurações';
      
      if (error.message.includes('JWT')) {
        errorMessage = 'Sessão expirada. Faça login novamente.';
      } else if (error.message.includes('not found')) {
        errorMessage = 'Tabela de configurações não encontrada. Verifique as migrações.';
      } else if (error.message.includes('violates')) {
        errorMessage = 'Dados inválidos. Verifique os campos obrigatórios.';
      } else {
        errorMessage = error.message;
      }
      
      toast.error('Erro ao salvar: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function testEvolutionAPI() {
    if (!config.webhook_url) {
      toast.error('URL da Evolution API é obrigatória para teste');
      return;
    }
    if (!config.instance_name) {
      toast.error('Nome da instância é obrigatório para teste');
      return;
    }
    if (!config.api_key) {
      toast.error('API Key é obrigatória para teste');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      // Primeiro, verificar o status da instância
      const baseUrl = config.webhook_url.replace(/\/$/, '');
      const statusUrl = `${baseUrl}/instance/connectionState/${config.instance_name}`;

      console.log('🔍 Verificando status da instância:', statusUrl);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'apikey': config.api_key
      };

      console.log('📋 Headers:', { ...headers, apikey: '***' });

      const response = await fetch(statusUrl, {
        method: 'GET',
        headers
      });

      console.log('📡 Response Status:', response.status);

      const responseText = await response.text();
      console.log('📄 Response Body:', responseText);

      if (response.ok) {
        const data = JSON.parse(responseText);
        if (data.instance?.state === 'open' || data.state === 'open') {
          setTestResult('success');
          toast.success('Conexão com Evolution API verificada! Instância conectada.');
        } else {
          setTestResult('error');
          toast.error(`Instância não está conectada. Estado: ${data.instance?.state || data.state || 'desconhecido'}`);
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }
    } catch (error: any) {
      console.error('❌ Erro no teste da Evolution API:', error);
      setTestResult('error');
      toast.error('Erro ao conectar com Evolution API: ' + error.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6 flex items-center space-x-3">
          <div className="w-12 h-12 bg-gradient-to-br from-green-600 to-blue-600 rounded-xl flex items-center justify-center">
            <Webhook className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
            Configurações WhatsApp
          </h1>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl p-6"
        >
          {/* Explicação do Sistema */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-400">
            <h3 className="font-medium text-blue-900 mb-2">Como funciona o sistema de envio?</h3>
            <div className="text-sm text-blue-800 space-y-2">
              <p><strong>Método Direto:</strong> Abre WhatsApp Web no navegador (requer interação manual)</p>
              <p><strong>Evolution API:</strong> Envio automático direto via Evolution API (recomendado)</p>
              <p className="text-xs text-blue-600">
                💡 A Evolution API permite envios automáticos sem interação manual
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Método de Envio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Método de Envio
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    config.method === 'direct'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setConfig({ ...config, method: 'direct' })}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Settings className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">Método Direto</h3>
                      <p className="text-sm text-gray-500">WhatsApp Web (atual)</p>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    config.method === 'webhook'
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setConfig({ ...config, method: 'webhook' })}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <Webhook className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">Evolution API</h3>
                      <p className="text-sm text-gray-500">Envio automático (recomendado)</p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Configurações da Evolution API */}
            {config.method === 'webhook' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-4 border-t pt-6"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    URL da Evolution API *
                  </label>
                  <input
                    type="url"
                    value={config.webhook_url}
                    onChange={(e) => setConfig({ ...config, webhook_url: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="https://sua-evolution-api.com"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    URL base da sua Evolution API (sem barra no final)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    API Key *
                  </label>
                  <input
                    type="password"
                    value={config.api_key || ''}
                    onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Sua chave de API da Evolution"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Chave de autenticação da Evolution API (obrigatória)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nome da Instância *
                  </label>
                  <input
                    type="text"
                    value={config.instance_name || ''}
                    onChange={(e) => setConfig({ ...config, instance_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="ex: empresa01, whatsapp-main, default"
                  />
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-gray-500">
                      Nome da instância conectada na Evolution API (obrigatório)
                    </p>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-700 font-medium mb-2">
                        🔍 Por que preciso do nome da instância?
                      </p>
                      <ul className="text-xs text-blue-600 space-y-1">
                        <li>• A Evolution API pode gerenciar múltiplas contas WhatsApp simultaneamente</li>
                        <li>• Cada instância = uma conexão WhatsApp diferente (número diferente)</li>
                        <li>• O sistema precisa saber qual instância usar para enviar a mensagem</li>
                        <li>• Permite organizar: "vendas" (11999999999), "suporte" (11888888888)</li>
                      </ul>
                      <p className="text-xs text-blue-600 mt-2">
                        <strong>Exemplos:</strong> empresa01, loja-matriz, atendimento-suporte, principal
                      </p>
                    </div>
                  </div>
                </div>

                {/* Teste da Evolution API */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">Teste de Conexão</h4>
                    {testResult && (
                      <div className={`flex items-center space-x-1 ${
                        testResult === 'success' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {testResult === 'success' ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <AlertCircle className="w-4 h-4" />
                        )}
                        <span className="text-sm font-medium">
                          {testResult === 'success' ? 'Conectado' : 'Erro'}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={testEvolutionAPI}
                    disabled={testing || !config.webhook_url || !config.instance_name || !config.api_key}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <TestTube className="w-4 h-4" />
                    <span>{testing ? 'Testando...' : 'Testar Conexão'}</span>
                  </button>
                  <p className="text-xs text-gray-500 mt-2">
                    Verifica se a instância está conectada ao WhatsApp
                  </p>
                </div>
              </motion.div>
            )}

            {/* Informações do Método Direto */}
            {config.method === 'direct' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-blue-50 rounded-lg p-4 border-t pt-6"
              >
                <h4 className="font-medium text-gray-900 mb-2">Método Direto (Atual)</h4>
                <p className="text-sm text-gray-600">
                  As mensagens são enviadas através do WhatsApp Web, abrindo uma nova aba do navegador.
                  Este é o método atual e não requer configurações adicionais.
                </p>
              </motion.div>
            )}

            {/* Botões de Ação */}
            <div className="flex justify-end space-x-4 pt-4 border-t">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={saveConfig}
                disabled={loading}
                className="flex items-center space-x-2 px-6 py-2 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{loading ? 'Salvando...' : 'Salvar Configurações'}</span>
              </motion.button>
            </div>

            {/* Seção de Ajuda */}
            <div className="mt-8 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">🔧 Como configurar a Evolution API</h4>
              <div className="text-sm text-gray-700 space-y-2">
                <p><strong>1.</strong> Acesse o painel da sua Evolution API</p>
                <p><strong>2.</strong> Crie uma instância e conecte ao WhatsApp via QR Code</p>
                <p><strong>3.</strong> Copie a URL base, API Key e o nome da instância</p>
                <div className="bg-white p-3 rounded border text-xs font-mono">
                  <div><strong>URL:</strong> https://sua-evolution-api.com</div>
                  <div><strong>API Key:</strong> Sua chave de autenticação</div>
                  <div><strong>Instância:</strong> Nome da instância conectada</div>
                </div>
                <p><strong>4.</strong> Preencha os campos acima e teste a conexão</p>
                <p className="text-xs text-gray-500">
                  💡 Certifique-se de que a instância está conectada (QR Code escaneado)
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
