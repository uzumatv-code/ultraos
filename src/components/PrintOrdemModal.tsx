import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Printer } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';
import type { OrdemServico } from '../types/database';

interface PrintOrdemModalProps {
  isOpen: boolean;
  onClose: () => void;
  ordem: OrdemServico;
}

export function PrintOrdemModal({ isOpen, onClose, ordem }: PrintOrdemModalProps) {
  function handlePrint() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Ordem de Serviço #${ordem.numero}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              margin: 0;
              padding: 20px;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
              border: 1px solid #ccc;
              padding: 20px;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 20px;
              margin-bottom: 20px;
            }
            .title {
              font-size: 24px;
              font-weight: bold;
              margin: 10px 0;
            }
            .subtitle {
              font-size: 16px;
              color: #666;
            }
            .section {
              margin-bottom: 20px;
              padding: 10px;
              border: 1px solid #eee;
            }
            .section-title {
              font-weight: bold;
              margin-bottom: 10px;
              background: #f5f5f5;
              padding: 5px;
            }
            .row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 5px;
            }
            .label {
              font-weight: bold;
              margin-right: 10px;
            }
            .value {
              flex: 1;
            }
            .footer {
              margin-top: 40px;
              text-align: center;
              font-size: 12px;
              color: #666;
            }
            .signature-line {
              margin-top: 60px;
              border-top: 1px solid #000;
              width: 200px;
              text-align: center;
              padding-top: 5px;
            }
            @media print {
              body { print-color-adjust: exact; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="title">ORDEM DE SERVIÇO Nº ${ordem.numero}</div>
              <div class="subtitle">CNPJ: 30.057.854/0001-75</div>
              <div class="subtitle">Samuel Silva - Luthier</div>
            </div>

            <div class="section">
              <div class="section-title">INFORMAÇÕES DO CLIENTE</div>
              <div class="row">
                <span class="label">Nome:</span>
                <span class="value">${ordem.cliente?.nome || ''}</span>
              </div>
              <div class="row">
                <span class="label">Telefone:</span>
                <span class="value">${ordem.cliente?.telefone || ''}</span>
              </div>
              <div class="row">
                <span class="label">CPF/CNPJ:</span>
                <span class="value">${ordem.cliente?.cpf_cnpj || ''}</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">INFORMAÇÕES DO INSTRUMENTO</div>
              <div class="row">
                <span class="label">Instrumento:</span>
                <span class="value">${ordem.instrumento?.nome || ''}</span>
              </div>
              <div class="row">
                <span class="label">Marca:</span>
                <span class="value">${ordem.marca?.nome || ''}</span>
              </div>
              <div class="row">
                <span class="label">Modelo:</span>
                <span class="value">${ordem.modelo || ''}</span>
              </div>
              <div class="row">
                <span class="label">Acessórios:</span>
                <span class="value">${ordem.acessorios || 'Nenhum'}</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">SERVIÇOS E VALORES</div>
              <div class="row">
                <span class="label">Valor dos Serviços:</span>
                <span class="value">${formatCurrency(ordem.valor_servicos)}</span>
              </div>
              <div class="row">
                <span class="label">Desconto:</span>
                <span class="value">${formatCurrency(ordem.desconto)}</span>
              </div>
              <div class="row">
                <span class="label">Valor Total:</span>
                <span class="value">${formatCurrency(ordem.valor_servicos - ordem.desconto)}</span>
              </div>
              <div class="row">
                <span class="label">Forma de Pagamento:</span>
                <span class="value">${ordem.forma_pagamento.toUpperCase()}</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">DATAS</div>
              <div class="row">
                <span class="label">Data de Entrada:</span>
                <span class="value">${formatDate(ordem.data_entrada)}</span>
              </div>
              <div class="row">
                <span class="label">Previsão de Entrega:</span>
                <span class="value">${formatDate(ordem.data_previsao)}</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">OBSERVAÇÕES</div>
              <div style="white-space: pre-wrap;">${ordem.observacoes}</div>
            </div>

            <div style="display: flex; justify-content: center;">
              <div class="signature-line">
                Assinatura do Cliente
              </div>
            </div>

            <div class="footer">
              <p>Este documento não tem valor fiscal - Apenas para controle interno</p>
            </div>
          </div>
          <script>
            window.onload = () => window.print();
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg relative overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">
                  Imprimir Ordem de Serviço
                </h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-gray-600">
                  Deseja imprimir a ordem de serviço #{ordem.numero}?
                </p>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handlePrint}
                    className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Imprimir</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}