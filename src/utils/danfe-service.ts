import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { formatCurrency, formatDate } from './formatters';
import type { NotaFiscal, EmpresaFiscal, Cliente } from '../types/database';

export type DANFEModelo = 'classico' | 'moderno' | 'minimalista';

export interface DANFEData {
  nota: NotaFiscal;
  empresa: EmpresaFiscal;
  cliente: Cliente;
  modelo?: DANFEModelo;
}

export class DANFEService {
  static async gerar(data: DANFEData): Promise<Blob> {
    const modelo = data.modelo || 'classico';
    
    switch (modelo) {
      case 'moderno':
        return await this.criarPDFModerno(data);
      case 'minimalista':
        return await this.criarPDFMinimalista(data);
      case 'classico':
      default:
        return await this.criarPDFClassico(data);
    }
  }

  static async gerarEBaixar(data: DANFEData): Promise<void> {
    const pdfBlob = await this.gerar(data);
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = url;
    const modeloSuffix = data.modelo ? `_${data.modelo}` : '';
    link.download = `DANFE${modeloSuffix}_${data.nota.numero_nfse || "RPS_" + data.nota.numero_rps}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  static async visualizarDANFE(data: DANFEData): Promise<void> {
    const pdfBlob = await this.gerar(data);
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // MODELO 1: CLÁSSICO (Oficial do Governo)
  private static async criarPDFClassico(data: DANFEData): Promise<Blob> {
    const { nota, empresa, cliente } = data;
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 5;
    let yPos = margin;
    const lightGray: [number, number, number] = [240, 240, 240];
    
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 18, "S");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Governo do Distrito Federal", margin + 15, yPos + 5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Secretaria de Estado de Fazenda do Distrito Federal", margin + 15, yPos + 9);
    doc.text("Fone: () - 156 - Opção 3 - www.sefaz.df.gov.br", margin + 15, yPos + 13);
    
    const rightX = pageWidth - margin - 45;
    doc.setLineWidth(0.3);
    doc.rect(rightX - 2, yPos + 1, 47, 16, "S");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("Distrito Federal", rightX, yPos + 4);
    doc.text("Nota Fiscal de Serviço", rightX, yPos + 7);
    doc.text("Eletrônica - NFS-e", rightX, yPos + 10);
    doc.text("Número da Nota Fiscal", rightX, yPos + 13);
    doc.setFontSize(9);
    doc.text(nota.numero_nfse || "AGUARDANDO", rightX, yPos + 17);
    yPos += 20;
    
    doc.setFillColor(...lightGray);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 6, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Dados do Prestador de Serviço", margin + 2, yPos + 4);
    yPos += 6;
    
    const prestadorBoxHeight = 28;
    doc.rect(margin, yPos, pageWidth - 2 * margin, prestadorBoxHeight, "S");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(empresa.razao_social.toUpperCase(), margin + 2, yPos + 4);
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.text(`${empresa.endereco}, ${empresa.numero} - ${empresa.bairro.toUpperCase()}`, margin + 2, yPos + 8);
    doc.text(`Brasília - DF - CEP: ${this.formatCEP(empresa.cep)}`, margin + 2, yPos + 11);
    if (empresa.email) doc.text(empresa.email, margin + 2, yPos + 14);
    doc.text(`Inscrição Municipal: ${empresa.inscricao_municipal} - CPF/CNPJ: ${this.formatCNPJ(empresa.cnpj)}`, margin + 2, yPos + 17);
    
    const infoBoxX = pageWidth - margin - 60;
    doc.rect(infoBoxX, yPos, 60, prestadorBoxHeight, "S");
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.text("Data de Geração da NFS-e", infoBoxX + 2, yPos + 3);
    doc.setFont("helvetica", "normal");
    doc.text(formatDate(nota.data_emissao), infoBoxX + 2, yPos + 7);
    doc.setFont("helvetica", "bold");
    doc.text("Data de Competência", infoBoxX + 2, yPos + 11);
    doc.setFont("helvetica", "normal");
    doc.text(formatDate(nota.competencia), infoBoxX + 2, yPos + 15);
    doc.setFont("helvetica", "bold");
    doc.text("Cód. de Autenticidade", infoBoxX + 2, yPos + 19);
    doc.setFont("helvetica", "normal");
    doc.text(nota.codigo_verificacao || "AGUARDANDO", infoBoxX + 2, yPos + 23);
    
    if (nota.url_nota && nota.codigo_verificacao) {
      try {
        const qrCodeDataUrl = await QRCode.toDataURL(nota.url_nota, { width: 80, margin: 0 });
        doc.addImage(qrCodeDataUrl, "PNG", infoBoxX + 32, yPos + 2, 25, 25);
      } catch (error) {
        console.error("Erro ao gerar QR Code:", error);
      }
    }
    
    doc.setFontSize(5);
    doc.text("Reservado ao Fisco", infoBoxX + 2, yPos + 27);
    yPos += prestadorBoxHeight + 2;
    
    const pdfBlob = doc.output("blob");
    return pdfBlob;
  }

  // MODELO 2: MODERNO (Com cores e design atualizado)
  private static async criarPDFModerno(data: DANFEData): Promise<Blob> {
    const { nota, empresa, cliente } = data;
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    let yPos = margin;

    // Cabeçalho com gradiente simulado (azul)
    doc.setFillColor(41, 128, 185); // Azul moderno
    doc.rect(0, 0, pageWidth, 35, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("NFS-e", margin, yPos + 10);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Nota Fiscal de Serviço Eletrônica", margin, yPos + 16);
    doc.text("Governo do Distrito Federal", margin, yPos + 21);

    // Número da nota em destaque
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    const numeroTexto = nota.numero_nfse || "AGUARDANDO";
    const numeroWidth = doc.getTextWidth(numeroTexto);
    doc.text(numeroTexto, pageWidth - margin - numeroWidth, yPos + 15);
    
    yPos = 40;
    doc.setTextColor(0, 0, 0);

    // Box Prestador com fundo colorido
    doc.setFillColor(236, 240, 241); // Cinza claro
    doc.setDrawColor(41, 128, 185);
    doc.setLineWidth(0.5);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 35, "FD");
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(41, 128, 185);
    doc.text("PRESTADOR DE SERVIÇOS", margin + 3, yPos + 6);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(empresa.razao_social.toUpperCase(), margin + 3, yPos + 12);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(`CNPJ: ${this.formatCNPJ(empresa.cnpj)} | IM: ${empresa.inscricao_municipal}`, margin + 3, yPos + 17);
    doc.text(`${empresa.endereco}, ${empresa.numero} - ${empresa.bairro}`, margin + 3, yPos + 21);
    doc.text(`Brasília - DF | CEP: ${this.formatCEP(empresa.cep)}`, margin + 3, yPos + 25);
    if (empresa.email) doc.text(`Email: ${empresa.email}`, margin + 3, yPos + 29);

    yPos += 40;

    // Box Tomador
    doc.setFillColor(236, 240, 241);
    doc.setDrawColor(52, 152, 219);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 30, "FD");
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(52, 152, 219);
    doc.text("TOMADOR DO SERVIÇO", margin + 3, yPos + 6);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(cliente.nome.toUpperCase(), margin + 3, yPos + 12);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    const cpfCnpj = cliente.cpf_cnpj ? `CPF/CNPJ: ${this.formatCPFCNPJ(cliente.cpf_cnpj)}` : '';
    doc.text(cpfCnpj, margin + 3, yPos + 17);
    if (cliente.telefone) doc.text(`Tel: ${cliente.telefone}`, margin + 3, yPos + 21);

    yPos += 35;

    // Valores em destaque com boxes coloridos
    const valorBoxWidth = (pageWidth - 2 * margin - 6) / 3;
    
    // Valor dos Serviços
    doc.setFillColor(46, 204, 113); // Verde
    doc.rect(margin, yPos, valorBoxWidth, 15, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("VALOR DOS SERVIÇOS", margin + 2, yPos + 5);
    doc.setFontSize(11);
    doc.text(formatCurrency(nota.valor_servicos), margin + 2, yPos + 11);

    // ISS
    doc.setFillColor(241, 196, 15); // Amarelo
    doc.rect(margin + valorBoxWidth + 3, yPos, valorBoxWidth, 15, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text("ISS", margin + valorBoxWidth + 5, yPos + 5);
    doc.setFontSize(11);
    doc.text(formatCurrency(nota.valor_iss), margin + valorBoxWidth + 5, yPos + 11);

    // Total
    doc.setFillColor(52, 73, 94); // Azul escuro
    doc.rect(margin + 2 * valorBoxWidth + 6, yPos, valorBoxWidth, 15, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text("VALOR TOTAL", margin + 2 * valorBoxWidth + 8, yPos + 5);
    doc.setFontSize(11);
    const valorTotal = nota.valor_servicos - (nota.desconto_incondicionado || 0);
    doc.text(formatCurrency(valorTotal), margin + 2 * valorBoxWidth + 8, yPos + 11);

    yPos += 20;
    doc.setTextColor(0, 0, 0);

    // Discriminação
    doc.setFillColor(236, 240, 241);
    doc.setDrawColor(127, 140, 141);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 40, "FD");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(52, 73, 94);
    doc.text("DISCRIMINAÇÃO DOS SERVIÇOS", margin + 3, yPos + 6);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    
    if (nota.discriminacao) {
      const linhas = doc.splitTextToSize(nota.discriminacao, pageWidth - 2 * margin - 6);
      doc.text(linhas, margin + 3, yPos + 12);
    }

    yPos += 45;

    // Rodapé com informações
    doc.setDrawColor(41, 128, 185);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(`Data de Emissão: ${formatDate(nota.data_emissao)}`, margin, yPos);
    doc.text(`Competência: ${formatDate(nota.competencia)}`, margin + 60, yPos);
    yPos += 5;
    doc.text(`Código de Verificação: ${nota.codigo_verificacao || "AGUARDANDO"}`, margin, yPos);

    // QR Code
    if (nota.url_nota && nota.codigo_verificacao) {
      try {
        const qrCodeDataUrl = await QRCode.toDataURL(nota.url_nota, { width: 100, margin: 1 });
        doc.addImage(qrCodeDataUrl, "PNG", pageWidth - margin - 30, yPos - 30, 30, 30);
      } catch (error) {
        console.error("Erro ao gerar QR Code:", error);
      }
    }

    const pdfBlob = doc.output("blob");
    return pdfBlob;
  }

  // MODELO 3: MINIMALISTA (Limpo e elegante)
  private static async criarPDFMinimalista(data: DANFEData): Promise<Blob> {
    const { nota, empresa, cliente } = data;
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let yPos = margin;

    // Logo/Título minimalista
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(44, 62, 80);
    doc.text("NFS-e", margin, yPos);
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(127, 140, 141);
    doc.text("Nota Fiscal de Serviço Eletrônica", margin, yPos + 6);

    // Número da nota alinhado à direita
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(44, 62, 80);
    const numeroTexto = `Nº ${nota.numero_nfse || "AGUARDANDO"}`;
    const numeroWidth = doc.getTextWidth(numeroTexto);
    doc.text(numeroTexto, pageWidth - margin - numeroWidth, yPos);
    
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(127, 140, 141);
    const dataTexto = formatDate(nota.data_emissao);
    const dataWidth = doc.getTextWidth(dataTexto);
    doc.text(dataTexto, pageWidth - margin - dataWidth, yPos + 6);

    yPos += 15;

    // Linha separadora sutil
    doc.setDrawColor(189, 195, 199);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    // Prestador - estilo limpo
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(127, 140, 141);
    doc.text("PRESTADOR", margin, yPos);
    yPos += 5;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(44, 62, 80);
    doc.text(empresa.razao_social, margin, yPos);
    yPos += 5;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(52, 73, 94);
    doc.text(`CNPJ ${this.formatCNPJ(empresa.cnpj)}`, margin, yPos);
    yPos += 4;
    doc.text(`IM ${empresa.inscricao_municipal}`, margin, yPos);
    yPos += 4;
    doc.text(`${empresa.endereco}, ${empresa.numero} - ${empresa.bairro}`, margin, yPos);
    yPos += 4;
    doc.text(`Brasília - DF - ${this.formatCEP(empresa.cep)}`, margin, yPos);
    if (empresa.email) {
      yPos += 4;
      doc.text(empresa.email, margin, yPos);
    }

    yPos += 10;
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    // Tomador
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(127, 140, 141);
    doc.text("TOMADOR", margin, yPos);
    yPos += 5;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(44, 62, 80);
    doc.text(cliente.nome, margin, yPos);
    yPos += 5;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(52, 73, 94);
    if (cliente.cpf_cnpj) {
      doc.text(this.formatCPFCNPJ(cliente.cpf_cnpj), margin, yPos);
      yPos += 4;
    }
    if (cliente.telefone) {
      doc.text(cliente.telefone, margin, yPos);
      yPos += 4;
    }

    yPos += 6;
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    // Discriminação
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(127, 140, 141);
    doc.text("DISCRIMINAÇÃO", margin, yPos);
    yPos += 5;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(52, 73, 94);
    if (nota.discriminacao) {
      const linhas = doc.splitTextToSize(nota.discriminacao, pageWidth - 2 * margin);
      doc.text(linhas, margin, yPos);
      yPos += linhas.length * 4 + 5;
    }

    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    // Valores - layout em grid
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(127, 140, 141);
    
    const col1 = margin;
    const col2 = margin + 60;
    const col3 = margin + 120;

    doc.text("VALOR DOS SERVIÇOS", col1, yPos);
    doc.text("ISS", col2, yPos);
    doc.text("TOTAL", col3, yPos);
    yPos += 5;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(44, 62, 80);
    doc.text(formatCurrency(nota.valor_servicos), col1, yPos);
    doc.text(formatCurrency(nota.valor_iss), col2, yPos);
    const valorTotal = nota.valor_servicos - (nota.desconto_incondicionado || 0);
    doc.text(formatCurrency(valorTotal), col3, yPos);

    yPos += 10;
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    // Rodapé minimalista
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(127, 140, 141);
    doc.text(`Código de Verificação: ${nota.codigo_verificacao || "AGUARDANDO"}`, margin, yPos);
    doc.text(`Competência: ${formatDate(nota.competencia)}`, margin, yPos + 4);

    // QR Code pequeno no canto
    if (nota.url_nota && nota.codigo_verificacao) {
      try {
        const qrCodeDataUrl = await QRCode.toDataURL(nota.url_nota, { width: 80, margin: 0 });
        doc.addImage(qrCodeDataUrl, "PNG", pageWidth - margin - 25, yPos - 10, 25, 25);
      } catch (error) {
        console.error("Erro ao gerar QR Code:", error);
      }
    }

    const pdfBlob = doc.output("blob");
    return pdfBlob;
  }

  private static formatCPFCNPJ(value: string): string {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length === 11) {
      return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    }
    return numbers.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }

  private static formatCNPJ(value: string): string {
    const numbers = value.replace(/\D/g, "");
    return numbers.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }

  private static formatCEP(value: string): string {
    const numbers = value.replace(/\D/g, "");
    return numbers.replace(/(\d{5})(\d{3})/, "$1-$2");
  }
}