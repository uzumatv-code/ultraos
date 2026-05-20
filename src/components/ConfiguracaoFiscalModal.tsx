import { useState, useEffect } from 'react';
import { X, Save, Building2, Upload, FileKey, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { EmpresaFiscal } from '../types/database';
import { alerts } from '../utils/alerts';
import { toast } from './ToastCustom';

interface ConfiguracaoFiscalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function ConfiguracaoFiscalModal({
  isOpen,
  onClose,
  onSave,
}: ConfiguracaoFiscalModalProps) {
  const [loading, setLoading] = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [certificadoFile, setCertificadoFile] = useState<File | null>(null);
  const [certificadoSenha, setCertificadoSenha] = useState('');
  const [formData, setFormData] = useState<Partial<EmpresaFiscal>>({
    razao_social: '',
    nome_fantasia: '',
    cnpj: '',
    inscricao_municipal: '',
    inscricao_estadual: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    codigo_municipio: '5300108', // Brasília
    uf: 'DF',
    cep: '',
    telefone: '',
    email: '',
    regime_tributacao: 6, // ME/EPP
    optante_simples_nacional: false,
    incentivo_fiscal: false,
    aliquota_iss: 5.0,
    item_lista_servico: '14.05', // Reparação de instrumentos musicais
    codigo_cnae: '9529102',
    codigo_tributacao_municipio: '',
    serie_rps: 'A',
    ambiente: 'homologacao',
  });

  useEffect(() => {
    if (isOpen) {
      loadEmpresaFiscal();
    }
  }, [isOpen]);

  const loadEmpresaFiscal = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('empresa_fiscal')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        setFormData(data);
      }
    } catch (error) {
      console.error('Erro ao carregar dados fiscais:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      let certificadoPath = formData.certificado_path;
      let certificadoSenhaEncrypted = formData.certificado_senha_encrypted;

      // Upload do certificado se houver um novo arquivo
      if (certificadoFile) {
        setUploadingCert(true);
        
        // Deletar certificado antigo se existir
        if (formData.certificado_path) {
          await supabase.storage
            .from('certificados')
            .remove([formData.certificado_path]);
        }

        // Upload do novo certificado
        const fileExt = certificadoFile.name.split('.').pop();
        const fileName = `${user.id}/certificado.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('certificados')
          .upload(fileName, certificadoFile, {
            upsert: true,
            contentType: certificadoFile.type
          });

        if (uploadError) throw uploadError;

        certificadoPath = fileName;
        
        // Criptografar senha do certificado (básico - em produção usar algo mais seguro)
        if (certificadoSenha) {
          certificadoSenhaEncrypted = btoa(certificadoSenha); // Base64 encoding simples
        }

        toast.success('Certificado enviado com sucesso!');
        setUploadingCert(false);
      }

      const dataToSave = {
        ...formData,
        user_id: user.id,
        certificado_path: certificadoPath,
        certificado_senha_encrypted: certificadoSenhaEncrypted,
      };

      // Verificar se já existe
      const { data: existing } = await supabase
        .from('empresa_fiscal')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (existing) {
        // Update
        const { error } = await supabase
          .from('empresa_fiscal')
          .update(dataToSave)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from('empresa_fiscal')
          .insert(dataToSave);

        if (error) throw error;
      }

      alerts.success('Configurações fiscais salvas com sucesso!');
      onSave();
      onClose();
    } catch (error: any) {
      console.error('Erro ao salvar configurações:', error);
      alerts.error(error.message || 'Erro ao salvar configurações fiscais');
    } finally {
      setLoading(false);
      setUploadingCert(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else if (type === 'number') {
      setFormData((prev) => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
          />
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white/95 backdrop-blur-lg dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Configuração Fiscal
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                <div className="p-6 space-y-6">
                  {/* Dados da Empresa */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
                      Dados da Empresa
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Razão Social *
                        </label>
                        <input
                          type="text"
                        name="razao_social"
                        value={formData.razao_social}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Nome Fantasia
                      </label>
                      <input
                        type="text"
                        name="nome_fantasia"
                        value={formData.nome_fantasia}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        CNPJ * (apenas números)
                      </label>
                      <input
                        type="text"
                        name="cnpj"
                        value={formData.cnpj}
                        onChange={handleChange}
                        required
                        maxLength={14}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Inscrição Municipal *
                      </label>
                      <input
                        type="text"
                        name="inscricao_municipal"
                        value={formData.inscricao_municipal}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Inscrição Estadual
                      </label>
                      <input
                        type="text"
                        name="inscricao_estadual"
                        value={formData.inscricao_estadual}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Endereço */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Endereço</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Logradouro *
                      </label>
                      <input
                        type="text"
                        name="endereco"
                        value={formData.endereco}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Número *
                      </label>
                      <input
                        type="text"
                        name="numero"
                        value={formData.numero}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Complemento
                      </label>
                      <input
                        type="text"
                        name="complemento"
                        value={formData.complemento}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Bairro *
                      </label>
                      <input
                        type="text"
                        name="bairro"
                        value={formData.bairro}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        CEP *
                      </label>
                      <input
                        type="text"
                        name="cep"
                        value={formData.cep}
                        onChange={handleChange}
                        required
                        maxLength={8}
                        placeholder="00000000"
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Contato */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Contato</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Telefone
                      </label>
                      <input
                        type="text"
                        name="telefone"
                        value={formData.telefone}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        E-mail
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Configurações Fiscais */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
                    Configurações Fiscais
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Regime *
                      </label>
                      <select
                        name="regime_tributacao"
                        value={formData.regime_tributacao}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      >
                        <option value={1}>Micro Municipal</option>
                        <option value={2}>Estimativa</option>
                        <option value={3}>Soc. Profissionais</option>
                        <option value={4}>Cooperativa</option>
                        <option value={5}>MEI</option>
                        <option value={6}>ME/EPP</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Alíquota ISS (%) *
                      </label>
                      <input
                        type="number"
                        name="aliquota_iss"
                        value={formData.aliquota_iss}
                        onChange={handleChange}
                        required
                        step="0.01"
                        min="0"
                        max="100"
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Item Serviço * (LC 116)
                      </label>
                      <input
                        type="text"
                        name="item_lista_servico"
                        value={formData.item_lista_servico}
                        onChange={handleChange}
                        required
                        placeholder="14.05"
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        CNAE
                      </label>
                      <input
                        type="text"
                        name="codigo_cnae"
                        value={formData.codigo_cnae}
                        onChange={handleChange}
                        placeholder="9529102"
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Série RPS *
                      </label>
                      <input
                        type="text"
                        name="serie_rps"
                        value={formData.serie_rps}
                        onChange={handleChange}
                        required
                        maxLength={5}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Ambiente *
                      </label>
                      <select
                        name="ambiente"
                        value={formData.ambiente}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      >
                        <option value="homologacao">Homologação</option>
                        <option value="producao">Produção</option>
                      </select>
                    </div>

                    <div className="md:col-span-2 flex flex-col sm:flex-row sm:items-center gap-3">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          name="optante_simples_nacional"
                          checked={formData.optante_simples_nacional}
                          onChange={handleChange}
                          className="w-4 h-4 text-purple-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-purple-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Simples Nacional
                        </span>
                      </label>

                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          name="incentivo_fiscal"
                          checked={formData.incentivo_fiscal}
                          onChange={handleChange}
                          className="w-4 h-4 text-purple-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-purple-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Incentivo Fiscal
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Certificado Digital */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <FileKey className="w-5 h-5 text-blue-600" />
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                      Certificado Digital (A1)
                    </h3>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-800 dark:text-blue-200">
                        <p className="font-medium mb-1">Certificado obrigatório para Produção</p>
                        <p className="text-xs">
                          O certificado digital A1 (arquivo .pfx ou .p12) é necessário para emitir NFS-e em ambiente de produção. 
                          Para homologação, não é obrigatório.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Arquivo do Certificado (.pfx ou .p12)
                      </label>
                      
                      {formData.certificado_path ? (
                        <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <FileKey className="w-5 h-5 text-green-600 dark:text-green-400" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-green-800 dark:text-green-200">
                              Certificado configurado
                            </p>
                            <p className="text-xs text-green-600 dark:text-green-300">
                              {formData.certificado_path.split('/').pop()}
                            </p>
                          </div>
                          <label className="cursor-pointer px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors">
                            Alterar
                            <input
                              type="file"
                              accept=".pfx,.p12"
                              onChange={(e) => {
                                if (e.target.files?.[0]) {
                                  setCertificadoFile(e.target.files[0]);
                                  toast.info('Certificado selecionado. Clique em Salvar para enviar.');
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center w-full">
                          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                              <Upload className="w-8 h-8 mb-2 text-gray-400" />
                              <p className="mb-1 text-sm text-gray-600 dark:text-gray-300">
                                <span className="font-semibold">Clique para enviar</span> ou arraste o arquivo
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Formatos: .pfx ou .p12 (máx. 5MB)
                              </p>
                            </div>
                            <input
                              type="file"
                              accept=".pfx,.p12"
                              onChange={(e) => {
                                if (e.target.files?.[0]) {
                                  setCertificadoFile(e.target.files[0]);
                                  toast.info('Certificado selecionado. Clique em Salvar para enviar.');
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>
                      )}

                      {certificadoFile && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                          <FileKey className="w-4 h-4" />
                          <span>Novo certificado selecionado: {certificadoFile.name}</span>
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Senha do Certificado
                      </label>
                      <input
                        type="password"
                        value={certificadoSenha}
                        onChange={(e) => setCertificadoSenha(e.target.value)}
                        placeholder="Digite a senha do certificado"
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        A senha será armazenada de forma criptografada
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer fixo com botões */}
              <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl flex-shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || uploadingCert}
                  className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {uploadingCert 
                      ? 'Enviando certificado...' 
                      : loading 
                      ? 'Salvando...' 
                      : 'Salvar Configurações'}
                  </span>
                </button>
              </div>
            </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
