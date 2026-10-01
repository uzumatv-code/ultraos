/**
 * Serviço para geração de NFS-e (Nota Fiscal de Serviço Eletrônica)
 * A emissão/cancelamento oficial é feita pelo servidor (Padrão Nacional, /api/nfse/*).
 * Aqui ficam o rascunho da nota e as consultas.
 */

import { supabase } from '../lib/supabase';
import { OrdemServico, Cliente, EmpresaFiscal, NotaFiscal } from '../types/database';
import { formatCurrency } from './formatters';
import { NFSeSOAPClient } from './nfse-soap-client';
import { apiRequest } from '../lib/api-client';
import type { OsAditivo } from '../types/database';

export interface NFSeData {
  ordemServico: OrdemServico;
  cliente: Cliente;
  empresaFiscal: EmpresaFiscal;
}

export class NFSeService {

  /**
   * Gera o XML da NFS-e baseado nos dados da ordem de serviço
   */
  static async gerarNFSe(ordemServicoId: string, options: { aditivoId?: string } = {}): Promise<NotaFiscal> {
    try {
      // 1. Buscar dados necessários (incluindo serviços executados)
      const { data: ordemServico, error: osError } = await supabase
        .from('ordens_servico')
        .select('*, cliente:clientes(*)')
        .eq('id', ordemServicoId)
        .single();

      if (osError) throw osError;
      if (!ordemServico) throw new Error('Ordem de serviço não encontrada');

      const historyData = await apiRequest<{ addenda: OsAditivo[] }>(`/api/ordens/${ordemServicoId}/historico`);
      const { data: existingNotes, error: existingError } = await supabase
        .from('notas_fiscais')
        .select('*')
        .eq('ordem_servico_id', ordemServicoId)
        .order('data_emissao', { ascending: false });
      if (existingError) throw existingError;

      const activeNotes = (existingNotes || []).filter((note: NotaFiscal) => note.status !== 'cancelado');
      let addendum: OsAditivo | undefined;
      if (options.aditivoId) {
        addendum = historyData.addenda.find((item) => item.id === options.aditivoId);
        if (!addendum || addendum.status !== 'aprovado') throw new Error('Somente um aditivo aprovado pode gerar NFS-e adicional');
        if (activeNotes.some((note: NotaFiscal) => note.aditivo_id === addendum!.id)) throw new Error('Este aditivo já possui uma NFS-e ativa');
      } else if (activeNotes.some((note: NotaFiscal) => !note.aditivo_id)) {
        throw new Error('Esta OS já possui NFS-e principal. Para novo serviço, emita pela opção do aditivo aprovado.');
      }

      // Buscar serviços relacionados se existirem IDs
      if (ordemServico.servicos_ids && ordemServico.servicos_ids.length > 0) {
        const { data: servicos } = await supabase
          .from('servicos')
          .select('*')
          .in('id', ordemServico.servicos_ids);
        
        if (servicos) {
          ordemServico.servicos = servicos;
        }
      }

      const { data: empresaFiscal, error: efError } = await supabase
        .from('empresa_fiscal')
        .select('*')
        .eq('user_id', ordemServico.user_id)
        .maybeSingle();

      if (efError && efError.code !== 'PGRST116') throw efError;
      if (!empresaFiscal) {
        throw new Error('Configure os dados fiscais da empresa primeiro. Acesse Perfil > Configurações para cadastrar os dados fiscais.');
      }

      // 2. Gerar próximo número RPS
      const { data: rpsData, error: rpsError } = await supabase
        .rpc('get_next_rps_number', { p_user_id: ordemServico.user_id });

      if (rpsError) throw rpsError;
      const numeroRps = rpsData.toString();

      // 3. Calcular valores
      const valorServicos = addendum ? Number(addendum.valor_adicional) : Number(ordemServico.valor_servicos);
      const descontoIncondicionado = addendum ? 0 : Number(ordemServico.desconto || 0);
      const baseCalculo = valorServicos - descontoIncondicionado;
      const valorIss = baseCalculo * (empresaFiscal.aliquota_iss / 100);
      const valorTotal = baseCalculo;

      // 4. Criar discriminação do serviço
      const discriminacao = addendum
        ? this.criarDiscriminacaoAditivo(ordemServico, addendum)
        : this.criarDiscriminacaoConsolidada(ordemServico, historyData.addenda.filter((item) => item.status === 'aprovado'));

      // 5. Criar registro da nota fiscal
      const dataEmissao = new Date().toISOString();
      const competencia = new Date().toISOString().slice(0, 7);

      const notaFiscal: Partial<NotaFiscal> = {
        user_id: ordemServico.user_id,
        ordem_servico_id: ordemServicoId,
        aditivo_id: addendum?.id,
        tipo_origem: addendum ? 'aditivo' : 'os_consolidada',
        tipo_evento_fiscal: 'emissao',
        numero_rps: numeroRps,
        serie_rps: empresaFiscal.serie_rps,
        data_emissao: dataEmissao,
        competencia,
        discriminacao,
        valor_servicos: valorServicos,
        valor_deducoes: 0,
        valor_pis: 0,
        valor_cofins: 0,
        valor_inss: 0,
        valor_ir: 0,
        valor_csll: 0,
        outras_retencoes: 0,
        valor_tributos: 0,
        valor_iss: valorIss,
        aliquota: empresaFiscal.aliquota_iss,
        desconto_incondicionado: descontoIncondicionado,
        desconto_condicionado: 0,
        iss_retido: false,
        item_lista_servico: empresaFiscal.item_lista_servico,
        codigo_cnae: empresaFiscal.codigo_cnae,
        codigo_tributacao_municipio: empresaFiscal.codigo_tributacao_municipio,
        codigo_municipio_prestacao: empresaFiscal.codigo_municipio,
        exigibilidade_iss: 1,
        municipio_incidencia: empresaFiscal.codigo_municipio,
        status: 'rascunho',
      };

      // 6. Gerar XML de envio
      const xmlEnvio = this.gerarXMLEnvio({
        ordemServico,
        cliente: ordemServico.cliente,
        empresaFiscal,
      }, notaFiscal as NotaFiscal);

      notaFiscal.xml_envio = xmlEnvio;

      // 7. Salvar no banco (status: rascunho)
      const { data: nfse, error: nfseError } = await supabase
        .from('notas_fiscais')
        .insert(notaFiscal)
        .select()
        .single();

      if (nfseError) throw nfseError;

      // 8. Registrar log inicial
      await this.registrarLog(nfse.id, ordemServico.user_id, 'gerar', 'sucesso', xmlEnvio, undefined, 'NFS-e criada como rascunho');

      return nfse;
    } catch (error) {
      console.error('Erro ao gerar NFS-e:', error);
      throw error;
    }
  }

  /**
   * Emite a NFS-e pelo Padrão Nacional: o servidor monta a DPS, assina com o certificado A1
   * da empresa e transmite à Sefin Nacional (mTLS). Retorna a nota já atualizada.
   */
  static async enviarNFSe(notaFiscalId: string): Promise<NotaFiscal> {
    await apiRequest(`/api/nfse/notas/${notaFiscalId}/enviar`, { method: 'POST' });
    const { data, error } = await supabase.from('notas_fiscais').select('*').eq('id', notaFiscalId).single();
    if (error) throw error;
    return data as NotaFiscal;
  }

  /**
   * Cria a discriminação dos serviços
   */
  private static criarDiscriminacao(ordemServico: OrdemServico): string {
    let discriminacao = `ORDEM DE SERVIÇO Nº ${ordemServico.numero}\n\n`;
    
    // Lista apenas os serviços executados
    discriminacao += `SERVIÇOS EXECUTADOS:\n`;
    
    if (ordemServico.servicos && ordemServico.servicos.length > 0) {
      // Se tem serviços relacionados, lista cada um
      ordemServico.servicos.forEach((servico, index) => {
        discriminacao += `${index + 1}. ${servico.nome}`;
        if (servico.descricao) {
          discriminacao += ` - ${servico.descricao}`;
        }
        discriminacao += `\n`;
      });
    } else if (ordemServico.servico_descricao) {
      // Fallback: usa descrição manual se não tiver serviços relacionados
      discriminacao += ordemServico.servico_descricao;
    } else {
      discriminacao += `Serviços de manutenção e reparos`;
    }

    discriminacao += `\n\nVALOR DOS SERVIÇOS: ${formatCurrency(ordemServico.valor_servicos)}\n`;
    
    if (ordemServico.desconto > 0) {
      discriminacao += `DESCONTO: ${formatCurrency(ordemServico.desconto)}\n`;
    }

    discriminacao += `VALOR TOTAL: ${formatCurrency(ordemServico.valor_total)}`;

    return discriminacao;
  }

  private static criarDiscriminacaoConsolidada(ordemServico: OrdemServico, addenda: OsAditivo[]): string {
    let text = this.criarDiscriminacao(ordemServico);
    if (!addenda.length) return text;
    text += '\n\nADITIVOS APROVADOS INCLUÍDOS NESTA EMISSÃO:';
    for (const addendum of addenda) {
      text += `\nAditivo #${addendum.numero}: ${addendum.titulo} — ${formatCurrency(addendum.valor_adicional)}`;
      for (const item of addendum.itens || []) text += `\n• ${item.descricao}`;
    }
    return text;
  }

  private static criarDiscriminacaoAditivo(ordemServico: OrdemServico, addendum: OsAditivo): string {
    let text = `SERVIÇO ADICIONAL DA ORDEM DE SERVIÇO Nº ${ordemServico.numero}\n`;
    text += `ADITIVO Nº ${addendum.numero} — ${addendum.titulo}\n\n${addendum.justificativa}\n\nSERVIÇOS ADICIONAIS EXECUTADOS:`;
    for (const item of addendum.itens || []) text += `\n• ${item.descricao} — ${formatCurrency(Number(item.valor_total ?? item.quantidade * item.valor_unitario))}`;
    text += `\n\nVALOR DESTA EMISSÃO: ${formatCurrency(addendum.valor_adicional)}`;
    return text;
  }

  /**
   * Gera o XML no formato ABRASF 2.04
   */
  private static gerarXMLEnvio(data: NFSeData, nfse: NotaFiscal): string {
    const { ordemServico, cliente, empresaFiscal } = data;
    
    // Formatar CPF/CNPJ do cliente
    const cpfCnpjCliente = cliente.cpf_cnpj.replace(/\D/g, '');
    const isCnpj = cpfCnpjCliente.length === 14;
    
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GerarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  <Rps>
    <InfDeclaracaoPrestacaoServico>
      <Rps>
        <IdentificacaoRps>
          <Numero>${nfse.numero_rps}</Numero>
          <Serie>${nfse.serie_rps}</Serie>
          <Tipo>1</Tipo>
        </IdentificacaoRps>
        <DataEmissao>${this.formatarDataHoraXML(nfse.data_emissao)}</DataEmissao>
        <Status>1</Status>
      </Rps>
      <Competencia>${nfse.competencia}</Competencia>
      <Servico>
        <Valores>
          <ValorServicos>${nfse.valor_servicos.toFixed(2)}</ValorServicos>
          <ValorDeducoes>${nfse.valor_deducoes.toFixed(2)}</ValorDeducoes>
          <ValorPis>${nfse.valor_pis.toFixed(2)}</ValorPis>
          <ValorCofins>${nfse.valor_cofins.toFixed(2)}</ValorCofins>
          <ValorInss>${nfse.valor_inss.toFixed(2)}</ValorInss>
          <ValorIr>${nfse.valor_ir.toFixed(2)}</ValorIr>
          <ValorCsll>${nfse.valor_csll.toFixed(2)}</ValorCsll>
          <OutrasRetencoes>${nfse.outras_retencoes.toFixed(2)}</OutrasRetencoes>
          <ValTotTributos>${nfse.valor_tributos.toFixed(2)}</ValTotTributos>
          <ValorIss>${nfse.valor_iss.toFixed(2)}</ValorIss>
          <Aliquota>${nfse.aliquota.toFixed(2)}</Aliquota>
          <DescontoIncondicionado>${nfse.desconto_incondicionado.toFixed(2)}</DescontoIncondicionado>
          <DescontoCondicionado>${nfse.desconto_condicionado.toFixed(2)}</DescontoCondicionado>
        </Valores>
        <IssRetido>${nfse.iss_retido ? '1' : '2'}</IssRetido>
        <ItemListaServico>${nfse.item_lista_servico}</ItemListaServico>
        ${nfse.codigo_cnae ? `<CodigoCnae>${nfse.codigo_cnae}</CodigoCnae>` : ''}
        ${nfse.codigo_tributacao_municipio ? `<CodigoTributacaoMunicipio>${nfse.codigo_tributacao_municipio}</CodigoTributacaoMunicipio>` : ''}
        <Discriminacao>${this.escapeXML(nfse.discriminacao)}</Discriminacao>
        <CodigoMunicipio>${nfse.codigo_municipio_prestacao}</CodigoMunicipio>
        <ExigibilidadeISS>${nfse.exigibilidade_iss}</ExigibilidadeISS>
        <MunicipioIncidencia>${nfse.municipio_incidencia}</MunicipioIncidencia>
      </Servico>
      <Prestador>
        <CpfCnpj>
          <Cnpj>${empresaFiscal.cnpj}</Cnpj>
        </CpfCnpj>
        <InscricaoMunicipal>${empresaFiscal.inscricao_municipal}</InscricaoMunicipal>
      </Prestador>
      <TomadorServico>
        <IdentificacaoTomador>
          <CpfCnpj>
            ${isCnpj ? `<Cnpj>${cpfCnpjCliente}</Cnpj>` : `<Cpf>${cpfCnpjCliente}</Cpf>`}
          </CpfCnpj>
        </IdentificacaoTomador>
        <RazaoSocial>${this.escapeXML(cliente.nome)}</RazaoSocial>
        ${cliente.telefone ? `<Contato><Telefone>${cliente.telefone}</Telefone></Contato>` : ''}
      </TomadorServico>
      <RegimeEspecialTributacao>${empresaFiscal.regime_tributacao}</RegimeEspecialTributacao>
      <OptanteSimplesNacional>${empresaFiscal.optante_simples_nacional ? '1' : '2'}</OptanteSimplesNacional>
      <IncentivoFiscal>${empresaFiscal.incentivo_fiscal ? '1' : '2'}</IncentivoFiscal>
    </InfDeclaracaoPrestacaoServico>
  </Rps>
</GerarNfseEnvio>`;

    return xml;
  }

  /**
   * Consulta NFS-e por RPS na prefeitura
   */
  static async consultarNFSePorRPS(notaFiscalId: string): Promise<NotaFiscal> {
    try {
      const { data: nfse, error } = await supabase
        .from('notas_fiscais')
        .select('*')
        .eq('id', notaFiscalId)
        .single();

      if (error) throw error;

      // Buscar dados fiscais
      const { data: empresaFiscal, error: efError } = await supabase
        .from('empresa_fiscal')
        .select('*')
        .eq('user_id', nfse.user_id)
        .single();

      if (efError) throw efError;

      // Consultar na prefeitura via SOAP
      const response = await NFSeSOAPClient.consultarNFSePorRPS(
        nfse.numero_rps,
        nfse.serie_rps,
        empresaFiscal
      );

      if (response.success && response.numeroNfse) {
        // Atualizar dados da nota
        const { data: updated } = await supabase
          .from('notas_fiscais')
          .update({
            status: 'autorizado',
            numero_nfse: response.numeroNfse,
            codigo_verificacao: response.codigoVerificacao,
            mensagem_retorno: response.mensagem,
          })
          .eq('id', notaFiscalId)
          .select()
          .single();

        return updated || nfse;
      }

      return nfse;
    } catch (error) {
      console.error('Erro ao consultar NFS-e:', error);
      throw error;
    }
  }

  /**
   * Cancela uma NFS-e autorizada (evento de cancelamento do Padrão Nacional).
   */
  static async cancelarNFSe(notaFiscalId: string, motivo: string): Promise<void> {
    await apiRequest(`/api/nfse/notas/${notaFiscalId}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo }) });
  }

  /**
   * Registra log de operação
   */
  private static async registrarLog(
    notaFiscalId: string,
    userId: string,
    tipoOperacao: 'gerar' | 'consultar' | 'cancelar',
    status: 'sucesso' | 'erro',
    xmlEnviado?: string,
    xmlRecebido?: string,
    mensagem?: string
  ): Promise<void> {
    await supabase.from('nfse_logs').insert({
      nota_fiscal_id: notaFiscalId,
      user_id: userId,
      tipo_operacao: tipoOperacao,
      status,
      mensagem,
      xml_enviado: xmlEnviado,
      xml_recebido: xmlRecebido,
    });
  }

  /**
   * Formata data/hora para XML
   */
  private static formatarDataHoraXML(data: string): string {
    return new Date(data).toISOString().replace(/\.\d{3}Z$/, '');
  }

  /**
   * Escapa caracteres especiais para XML
   */
  private static escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Lista todas as notas fiscais do usuário
   */
  static async listarNFSes(userId: string): Promise<NotaFiscal[]> {
    const { data, error } = await supabase
      .from('notas_fiscais')
      .select('*, ordem_servico:ordens_servico(*)')
      .eq('user_id', userId)
      .order('data_emissao', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Busca NFS-e por ordem de serviço
   */
  static async buscarPorOrdemServico(ordemServicoId: string): Promise<NotaFiscal | null> {
    const { data, error } = await supabase
      .from('notas_fiscais')
      .select('*')
      .eq('ordem_servico_id', ordemServicoId)
      .order('data_emissao', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async listarPorOrdemServico(ordemServicoId: string): Promise<NotaFiscal[]> {
    const { data, error } = await supabase
      .from('notas_fiscais')
      .select('*')
      .eq('ordem_servico_id', ordemServicoId)
      .order('data_emissao', { ascending: false });
    if (error) throw error;
    return data || [];
  }
}
