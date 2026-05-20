/**
 * Serviço para geração de NFS-e (Nota Fiscal de Serviço Eletrônica)
 * Padrão ABRASF 2.04 - Brasília/DF
 */

import { supabase } from '../lib/supabase';
import { OrdemServico, Cliente, EmpresaFiscal, NotaFiscal } from '../types/database';
import { formatCurrency } from './formatters';
import { NFSeSOAPClient } from './nfse-soap-client';
import { AssinaturaDigitalService } from './assinatura-digital';

export interface NFSeData {
  ordemServico: OrdemServico;
  cliente: Cliente;
  empresaFiscal: EmpresaFiscal;
}

export class NFSeService {
  private static readonly CODIGO_MUNICIPIO_BRASILIA = '5300108';
  private static readonly AMBIENTE_HOMOLOGACAO = 'https://hom.nfse.df.gov.br/ws/nfse.wsdl';
  private static readonly AMBIENTE_PRODUCAO = 'https://nfse.df.gov.br/ws/nfse.wsdl';

  /**
   * Gera o XML da NFS-e baseado nos dados da ordem de serviço
   */
  static async gerarNFSe(ordemServicoId: string): Promise<NotaFiscal> {
    try {
      // 1. Buscar dados necessários (incluindo serviços executados)
      const { data: ordemServico, error: osError } = await supabase
        .from('ordens_servico')
        .select('*, cliente:clientes(*)')
        .eq('id', ordemServicoId)
        .single();

      if (osError) throw osError;
      if (!ordemServico) throw new Error('Ordem de serviço não encontrada');

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
      const valorServicos = ordemServico.valor_servicos;
      const descontoIncondicionado = ordemServico.desconto || 0;
      const baseCalculo = valorServicos - descontoIncondicionado;
      const valorIss = baseCalculo * (empresaFiscal.aliquota_iss / 100);
      const valorTotal = baseCalculo;

      // 4. Criar discriminação do serviço
      const discriminacao = this.criarDiscriminacao(ordemServico);

      // 5. Criar registro da nota fiscal
      const dataEmissao = new Date().toISOString();
      const competencia = new Date().toISOString().split('T')[0];

      const notaFiscal: Partial<NotaFiscal> = {
        user_id: ordemServico.user_id,
        ordem_servico_id: ordemServicoId,
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
        codigo_municipio_prestacao: this.CODIGO_MUNICIPIO_BRASILIA,
        exigibilidade_iss: 1,
        municipio_incidencia: this.CODIGO_MUNICIPIO_BRASILIA,
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
   * Envia NFS-e para a prefeitura (assina e transmite via SOAP)
   */
  static async enviarNFSe(notaFiscalId: string): Promise<NotaFiscal> {
    try {
      // 1. Buscar nota fiscal
      const { data: nfse, error: nfseError } = await supabase
        .from('notas_fiscais')
        .select('*')
        .eq('id', notaFiscalId)
        .single();

      if (nfseError) throw nfseError;
      if (!nfse || !nfse.xml_envio) throw new Error('NFS-e não encontrada ou XML inválido');

      // 2. Buscar dados fiscais da empresa
      const { data: empresaFiscal, error: efError } = await supabase
        .from('empresa_fiscal')
        .select('*')
        .eq('user_id', nfse.user_id)
        .single();

      if (efError) throw efError;
      if (!empresaFiscal) throw new Error('Dados fiscais não configurados');

      // 3. Assinar XML digitalmente (em desenvolvimento, pula assinatura)
      let xmlAssinado = nfse.xml_envio;
      
      if (process.env.NODE_ENV !== 'development') {
        // Em produção, assinar com certificado digital
        xmlAssinado = await AssinaturaDigitalService.assinarXML(nfse.xml_envio, {
          tipo: 'A1',
          // certificado e senha viriam de configuração segura
        });
      }

      // 4. Atualizar status para "enviado"
      await supabase
        .from('notas_fiscais')
        .update({ status: 'enviado' })
        .eq('id', notaFiscalId);

      // 5. Enviar via SOAP para a prefeitura
      const response = await NFSeSOAPClient.gerarNFSe(xmlAssinado, empresaFiscal);

      if (!response.success) {
        // Erro no envio
        await supabase
          .from('notas_fiscais')
          .update({ 
            status: 'rejeitado',
            mensagem_retorno: response.error 
          })
          .eq('id', notaFiscalId);

        await this.registrarLog(
          notaFiscalId,
          nfse.user_id,
          'gerar',
          'erro',
          xmlAssinado,
          undefined,
          response.error
        );

        throw new Error(response.error || 'Erro ao enviar NFS-e');
      }

      // 6. Sucesso! Atualizar dados da nota
      const { data: nfseAtualizada, error: updateError } = await supabase
        .from('notas_fiscais')
        .update({
          status: 'autorizado',
          numero_nfse: response.numeroNfse,
          codigo_verificacao: response.codigoVerificacao,
          protocolo: response.protocolo,
          mensagem_retorno: response.mensagem,
        })
        .eq('id', notaFiscalId)
        .select()
        .single();

      if (updateError) throw updateError;

      // 7. Buscar URL da nota
      if (response.numeroNfse) {
        const urlResponse = await NFSeSOAPClient.consultarURLNFSe(
          response.numeroNfse,
          empresaFiscal
        );

        if (urlResponse.success && urlResponse.urlNota) {
          await supabase
            .from('notas_fiscais')
            .update({ url_nota: urlResponse.urlNota })
            .eq('id', notaFiscalId);
        }
      }

      // 8. Registrar log de sucesso
      await this.registrarLog(
        notaFiscalId,
        nfse.user_id,
        'gerar',
        'sucesso',
        xmlAssinado,
        undefined,
        `NFS-e autorizada: ${response.numeroNfse}`
      );

      return nfseAtualizada;
    } catch (error: any) {
      console.error('Erro ao enviar NFS-e:', error);
      throw error;
    }
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
   * Cancela uma NFS-e na prefeitura
   */
  static async cancelarNFSe(notaFiscalId: string, motivo: string): Promise<void> {
    try {
      const { data: nfse, error: fetchError } = await supabase
        .from('notas_fiscais')
        .select('*')
        .eq('id', notaFiscalId)
        .single();

      if (fetchError) throw fetchError;

      if (nfse.status !== 'autorizado') {
        throw new Error('Apenas notas autorizadas podem ser canceladas');
      }

      if (!nfse.numero_nfse) {
        throw new Error('Número da NFS-e não encontrado');
      }

      // Buscar dados fiscais
      const { data: empresaFiscal, error: efError } = await supabase
        .from('empresa_fiscal')
        .select('*')
        .eq('user_id', nfse.user_id)
        .single();

      if (efError) throw efError;

      // Gerar XML de cancelamento
      const xmlCancelamento = this.gerarXMLCancelamento(nfse, motivo);

      // Enviar cancelamento via SOAP
      const response = await NFSeSOAPClient.cancelarNFSe(
        nfse.numero_nfse,
        motivo,
        empresaFiscal
      );

      if (!response.success) {
        await this.registrarLog(
          notaFiscalId,
          nfse.user_id,
          'cancelar',
          'erro',
          xmlCancelamento,
          undefined,
          response.error
        );
        throw new Error(response.error || 'Erro ao cancelar NFS-e');
      }

      // Atualizar status no banco
      const { error: updateError } = await supabase
        .from('notas_fiscais')
        .update({
          status: 'cancelado',
          data_cancelamento: new Date().toISOString(),
          motivo_cancelamento: motivo,
        })
        .eq('id', notaFiscalId);

      if (updateError) throw updateError;

      // Registrar log de sucesso
      await this.registrarLog(
        notaFiscalId,
        nfse.user_id,
        'cancelar',
        'sucesso',
        xmlCancelamento,
        undefined,
        'NFS-e cancelada com sucesso'
      );
    } catch (error) {
      console.error('Erro ao cancelar NFS-e:', error);
      throw error;
    }
  }

  /**
   * Gera XML de cancelamento
   */
  private static gerarXMLCancelamento(nfse: NotaFiscal, motivo: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<CancelarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  <Pedido>
    <InfPedidoCancelamento>
      <IdentificacaoNfse>
        <Numero>${nfse.numero_nfse}</Numero>
        <CpfCnpj>
          <Cnpj><!-- CNPJ da empresa --></Cnpj>
        </CpfCnpj>
        <InscricaoMunicipal><!-- IM da empresa --></InscricaoMunicipal>
        <CodigoMunicipio>${this.CODIGO_MUNICIPIO_BRASILIA}</CodigoMunicipio>
      </IdentificacaoNfse>
      <CodigoCancelamento>1</CodigoCancelamento>
      <MotivoCancelamento>${this.escapeXML(motivo)}</MotivoCancelamento>
    </InfPedidoCancelamento>
  </Pedido>
</CancelarNfseEnvio>`;
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
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
}
