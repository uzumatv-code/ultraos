import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from './ToastCustom';
import type { CategoriaFinanceira } from '../types/database';

interface ImportarCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  categorias: CategoriaFinanceira[];
  onSuccess: () => void;
}

interface TransacaoCSV {
  data: string;
  descricao: string;
  valor: string;
  tipo: 'receita' | 'despesa';
  categoria?: string;
}

export function ImportarCSVModal({
  isOpen,
  onClose,
  categorias,
  onSuccess
}: ImportarCSVModalProps) {
  const [loading, setLoading] = useState(false);
  const [transacoes, setTransacoes] = useState<TransacaoCSV[]>([]);
  const [categoriasMap, setCategoriasMap] = useState<Record<string, string>>({});
  const [tiposMap, setTiposMap] = useState<Record<number, 'receita' | 'despesa'>>({});
  const [processando, setProcessando] = useState(false);

  // Função para detectar tipo de transação baseado em palavras-chave
  function detectarTipoTransacao(descricao: string, valor: number): 'receita' | 'despesa' {
    const descricaoLower = descricao.toLowerCase();
    
    // Palavras-chave que indicam receita
    const palavrasChaveReceita = [
      'recebido',
      'recebimento',
      'pagamento recebido',
      'transferência recebida',
      'pix recebido',
      'ted recebida',
      'doc recebido',
      'depósito',
      'venda',
      'serviço',
      'ordem de serviço'
    ];

    // Palavras-chave que indicam despesa
    const palavrasChaveDespesa = [
      'pagamento',
      'compra',
      'fatura',
      'boleto',
      'conta',
      'transferência enviada',
      'pix enviado',
      'ted enviada',
      'doc enviado',
      'débito',
      'despesa'
    ];

    // Primeiro verifica por palavras-chave
    if (palavrasChaveReceita.some(palavra => descricaoLower.includes(palavra))) {
      return 'receita';
    }
    if (palavrasChaveDespesa.some(palavra => descricaoLower.includes(palavra))) {
      return 'despesa';
    }

    // Se não encontrar palavras-chave, usa o valor como indicador
    return valor >= 0 ? 'receita' : 'despesa';
  }

  // Função para categorizar automaticamente baseado em palavras-chave
  function categorizarAutomaticamente(descricao: string, valor: number, tipo: 'receita' | 'despesa'): string | null {
    const descricaoLower = descricao.toLowerCase();
    const valorStr = valor.toString();
    
    // Mapeamento de palavras-chave para categorias
    const regrasCategorizacao = {
      receita: [
        {
          keywords: [
            'pix recebido',
            'transferência recebida',
            'recebida pelo pix',
            'transferência pix',
            'pagamento recebido',
            'ted recebida',
            'doc recebido'
          ],
          categoria: 'Serviços Luthieria',
          // Exceções que não devem ser categorizadas como serviços
          excecoes: ['mercado', 'supermercado', 'alimentos', 'combustível']
        },
        {
          keywords: ['venda', 'pagamento', 'compra', 'produto'],
          categoria: 'Vendas',
          excecoes: ['compra no débito', 'compra no crédito']
        }
      ],
      despesa: [
        {
          keywords: [
            'combustivel',
            'posto',
            'cascol',
            'auto posto',
            'gasolina',
            'etanol',
            'diesel'
          ],
          categoria: 'Combustível'
        },
        {
          keywords: [
            'mercado',
            'supermercado',
            'alimentos',
            'panificadora',
            'acai',
            'comercial de alimentos',
            'verduras',
            'sorveteria',
            'padaria',
            'restaurante',
            'lanchonete',
            'cafeteria',
            'açougue',
            'hortifruti'
          ],
          categoria: 'Alimentação'
        },
        {
          keywords: [
            'netflix',
            'streaming',
            'spotify',
            'youtube',
            'prime',
            'disney',
            'hbo',
            'cinema',
            'ingresso'
          ],
          categoria: 'Entretenimento'
        },
        {
          keywords: [
            'internet',
            'telefone',
            'celular',
            'recarga',
            'tim',
            'vivo',
            'claro',
            'oi',
            'net',
            'móvel'
          ],
          categoria: 'Telecomunicações'
        },
        {
          keywords: [
            'vibratho',
            'instrumentos',
            'cordas',
            'captador',
            'tarraxa',
            'ponte',
            'pestana',
            'traste',
            'madeira',
            'ferramenta',
            'equipamento',
            'peça',
            'componente'
          ],
          categoria: 'Materiais'
        },
        {
          keywords: [
            'agua',
            'luz',
            'energia',
            'saneamento',
            'caesb',
            'ceb',
            'neoenergia',
            'conta',
            'fatura'
          ],
          categoria: 'Utilidades'
        },
        {
          keywords: [
            'drogaria',
            'farmacia',
            'remedio',
            'medicamento',
            'consulta',
            'exame',
            'médico',
            'dentista',
            'hospital',
            'clínica'
          ],
          categoria: 'Saúde'
        },
        {
          keywords: [
            'pix enviado',
            'transferência enviada',
            'enviada pelo pix',
            'ted enviada',
            'doc enviado',
            'pagamento efetuado'
          ],
          categoria: 'Outros'
        }
      ]
    };

    const regras = regrasCategorizacao[tipo];
    for (const regra of regras) {
      // Verifica se alguma palavra-chave está presente na descrição
      const temKeyword = regra.keywords.some(keyword => descricaoLower.includes(keyword));
      
      // Verifica se não há exceções (se existirem)
      const temExcecao = regra.excecoes?.some(excecao => descricaoLower.includes(excecao)) || false;
      
      if (temKeyword && !temExcecao) {
        const categoria = categorias.find(c => 
          c.nome.toLowerCase() === regra.categoria.toLowerCase() && c.tipo === tipo
        );
        if (categoria) return categoria.id;
      }
    }

    // Se nenhuma regra específica foi encontrada, tenta inferir baseado em padrões comuns
    if (tipo === 'despesa') {
      // Compras em estabelecimentos comerciais geralmente são alimentação
      if (descricaoLower.includes('compra') || descricaoLower.includes('débito')) {
        const alimentacao = categorias.find(c => 
          c.nome.toLowerCase() === 'alimentação' && c.tipo === 'despesa'
        );
        if (alimentacao) return alimentacao.id;
      }
    }

    return null;
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessando(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const csv = event.target?.result as string;
      const lines = csv.split('\n');
      const header = lines[0].toLowerCase().split(',');
      
      // Identify column indices
      const dataIndex = header.findIndex(h => h.includes('data'));
      const valorIndex = header.findIndex(h => h.includes('valor'));
      const descricaoIndex = header.findIndex(h => h.includes('descricao') || h.includes('descrição'));

      const transacoesImportadas: TransacaoCSV[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
        
        // Parse and validate date
        let dataValida: string;
        try {
          // Try different date formats
          let data: Date | null = null;
          const dataStr = values[dataIndex];
          
          // Try DD/MM/YYYY format
          if (dataStr.includes('/')) {
            const [dia, mes, ano] = dataStr.split('/').map(Number);
            data = new Date(ano, mes - 1, dia);
          } 
          // Try YYYY-MM-DD format
          else if (dataStr.includes('-')) {
            data = new Date(dataStr);
          }
          
          if (!data || isNaN(data.getTime())) {
            throw new Error('Data inválida');
          }
          
          dataValida = data.toISOString().split('T')[0];
        } catch (error) {
          console.warn(`Linha ${i + 1}: Data inválida "${values[dataIndex]}", pulando...`);
          continue;
        }
        
        // Process value
        let valorStr = values[valorIndex];
        valorStr = valorStr.replace(/[^\d,.-]/g, '');
        const valor = parseFloat(valorStr.replace(',', '.'));
        if (isNaN(valor)) {
          console.warn(`Linha ${i + 1}: Valor inválido "${values[valorIndex]}", pulando...`);
          continue;
        }
        
        // Detect transaction type
        const tipo = detectarTipoTransacao(values[descricaoIndex], valor);
        
        // Update types map
        setTiposMap(prev => ({
          ...prev,
          [i]: tipo
        }));

        const transacao: TransacaoCSV = {
          data: dataValida,
          descricao: values[descricaoIndex],
          valor: Math.abs(valor).toString(),
          tipo
        };

        // Try to identify category automatically
        if (transacao.categoria) {
          const categoriaId = categorizarAutomaticamente(
            transacao.descricao,
            valor,
            tipo
          );

          if (categoriaId) {
            setCategoriasMap(prev => ({
              ...prev,
              [i.toString()]: categoriaId
            }));
          }
        }

        transacoesImportadas.push(transacao);
      }

      setTransacoes(transacoesImportadas);
      setProcessando(false);
    };

    reader.readAsText(file);
  }

  async function handleImportar() {
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const transacoesParaImportar = transacoes.map((transacao, index) => ({
        descricao: transacao.descricao,
        valor: parseFloat(transacao.valor),
        tipo: tiposMap[index] || transacao.tipo,
        data: new Date(transacao.data).toISOString(),
        categoria_id: categoriasMap[index.toString()],
        user_id: user.id
      }));

      const { error } = await supabase
        .from('transacoes_financeiras')
        .insert(transacoesParaImportar);

      if (error) throw error;

      toast.success('Transações importadas com sucesso!');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Erro ao importar transações:', error);
      toast.error('Erro ao importar transações');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-6xl relative overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">
                  Importar Transações
                </h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Área de Upload */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                  <div className="flex flex-col items-center">
                    <Upload className="w-12 h-12 text-gray-400 mb-4" />
                    {processando ? (
                      <p className="text-sm text-gray-600 text-center mb-4">
                        Processando arquivo...
                      </p>
                    ) : (
                      <p className="text-sm text-gray-600 text-center mb-4">
                        Arraste e solte seu arquivo CSV aqui ou clique para selecionar
                      </p>
                    )}
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="csv-upload"
                    />
                    <label
                      htmlFor="csv-upload"
                      className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors cursor-pointer"
                    >
                      Selecionar Arquivo
                    </label>
                  </div>
                </div>

                {/* Formato Esperado */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-medium text-blue-800 mb-1">
                        Formato do Arquivo
                      </h3>
                      <p className="text-sm text-blue-600">
                        O arquivo deve conter as colunas: Data, Valor, Descrição
                      </p>
                      <p className="text-sm text-blue-600">
                        O tipo (receita/despesa) será determinado pelo valor (positivo/negativo)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Transações Importadas */}
                <div className={`${transacoes.length > 0 ? 'block' : 'hidden'} mt-6 w-full`}>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    Transações Encontradas ({transacoes.length})
                  </h3>

                  <div className="max-h-[400px] overflow-y-auto rounded-lg border border-gray-200">
                    <table className="w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr className="border-b border-gray-200">
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                            Data
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                            Descrição
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                            Valor
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                            Tipo
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                            Categoria
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {transacoes.map((transacao, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">
                              {new Date(transacao.data).toLocaleDateString('pt-BR')}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600">
                              {transacao.descricao}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">
                              {new Intl.NumberFormat('pt-BR', {
                                style: 'currency',
                                currency: 'BRL'
                              }).format(parseFloat(transacao.valor))}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <div className="flex items-center space-x-2">
                                <select
                                  value={tiposMap[index] || transacao.tipo}
                                  onChange={(e) => {
                                    const novoTipo = e.target.value as 'receita' | 'despesa';
                                    setTiposMap(prev => ({
                                      ...prev,
                                      [index]: novoTipo
                                    }));

                                    // Limpar categoria ao mudar o tipo
                                    setCategoriasMap(prev => {
                                      const newMap = { ...prev };
                                      delete newMap[index.toString()];
                                      return newMap;
                                    });
                                  }}
                                  className="text-xs px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                >
                                  <option value="receita">Receita</option>
                                  <option value="despesa">Saída</option>
                                </select>
                                <span
                                  className={`text-xs px-2 py-1 rounded-full ${
                                    (tiposMap[index] || transacao.tipo) === 'receita'
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {(tiposMap[index] || transacao.tipo) === 'receita' ? 'Receita' : 'Saída'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <select
                                value={categoriasMap[index] || ''}
                                onChange={(e) => {
                                  setCategoriasMap(prev => ({
                                    ...prev,
                                    [index.toString()]: e.target.value
                                  }));
                                }}
                                className="w-48 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                required
                              >
                                <option value="">Selecione...</option>
                                {categorias
                                  .filter(c => c.tipo === (tiposMap[index] || transacao.tipo))
                                  .map((categoria) => (
                                    <option key={categoria.id} value={categoria.id}>
                                      {categoria.nome}
                                    </option>
                                  ))
                                }
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end space-x-3 mt-6">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleImportar}
                      disabled={loading || Object.keys(categoriasMap).length !== transacoes.length}
                      className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                    >
                      {loading ? (
                        'Importando...'
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          <span>Importar Transações</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}