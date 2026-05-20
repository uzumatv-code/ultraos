/**
 * Cliente SOAP para integração com WebService NFS-e Brasília
 * Padrão ABRASF 2.04
 */

import { EmpresaFiscal } from '../types/database';

export interface SOAPResponse {
  success: boolean;
  data?: any;
  error?: string;
  protocolo?: string;
  numeroNfse?: string;
  codigoVerificacao?: string;
  urlNota?: string;
  mensagem?: string;
}

export class NFSeSOAPClient {
  private static readonly WSDL_HOMOLOGACAO = 'https://hom.nfse.df.gov.br/ws/nfse.wsdl';
  private static readonly WSDL_PRODUCAO = 'https://nfse.df.gov.br/ws/nfse.wsdl';

  /**
   * Envia RPS para geração de NFS-e
   */
  static async gerarNFSe(
    xmlAssinado: string,
    empresaFiscal: EmpresaFiscal
  ): Promise<SOAPResponse> {
    try {
      const wsdl = empresaFiscal.ambiente === 'producao' 
        ? this.WSDL_PRODUCAO 
        : this.WSDL_HOMOLOGACAO;

      const soapEnvelope = this.createSOAPEnvelope('GerarNfse', xmlAssinado);
      
      const response = await fetch(wsdl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml;charset=UTF-8',
          'SOAPAction': 'GerarNfse',
        },
        body: soapEnvelope,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const xmlResponse = await response.text();
      return this.parseGerarNFSeResponse(xmlResponse);
    } catch (error: any) {
      console.error('Erro ao gerar NFS-e via SOAP:', error);
      return {
        success: false,
        error: error.message || 'Erro ao comunicar com o servidor',
      };
    }
  }

  /**
   * Consulta NFS-e por RPS
   */
  static async consultarNFSePorRPS(
    numeroRps: string,
    serieRps: string,
    empresaFiscal: EmpresaFiscal
  ): Promise<SOAPResponse> {
    try {
      const wsdl = empresaFiscal.ambiente === 'producao' 
        ? this.WSDL_PRODUCAO 
        : this.WSDL_HOMOLOGACAO;

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ConsultarNfseRpsEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  <IdentificacaoRps>
    <Numero>${numeroRps}</Numero>
    <Serie>${serieRps}</Serie>
    <Tipo>1</Tipo>
  </IdentificacaoRps>
  <Prestador>
    <CpfCnpj>
      <Cnpj>${empresaFiscal.cnpj}</Cnpj>
    </CpfCnpj>
    <InscricaoMunicipal>${empresaFiscal.inscricao_municipal}</InscricaoMunicipal>
  </Prestador>
</ConsultarNfseRpsEnvio>`;

      const soapEnvelope = this.createSOAPEnvelope('ConsultarNfsePorRps', xml);
      
      const response = await fetch(wsdl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml;charset=UTF-8',
          'SOAPAction': 'ConsultarNfsePorRps',
        },
        body: soapEnvelope,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const xmlResponse = await response.text();
      return this.parseConsultarNFSeResponse(xmlResponse);
    } catch (error: any) {
      console.error('Erro ao consultar NFS-e:', error);
      return {
        success: false,
        error: error.message || 'Erro ao comunicar com o servidor',
      };
    }
  }

  /**
   * Cancela NFS-e
   */
  static async cancelarNFSe(
    numeroNfse: string,
    motivo: string,
    empresaFiscal: EmpresaFiscal
  ): Promise<SOAPResponse> {
    try {
      const wsdl = empresaFiscal.ambiente === 'producao' 
        ? this.WSDL_PRODUCAO 
        : this.WSDL_HOMOLOGACAO;

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CancelarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  <Pedido>
    <InfPedidoCancelamento>
      <IdentificacaoNfse>
        <Numero>${numeroNfse}</Numero>
        <CpfCnpj>
          <Cnpj>${empresaFiscal.cnpj}</Cnpj>
        </CpfCnpj>
        <InscricaoMunicipal>${empresaFiscal.inscricao_municipal}</InscricaoMunicipal>
        <CodigoMunicipio>5300108</CodigoMunicipio>
      </IdentificacaoNfse>
      <CodigoCancelamento>1</CodigoCancelamento>
      <MotivoCancelamento>${this.escapeXML(motivo)}</MotivoCancelamento>
    </InfPedidoCancelamento>
  </Pedido>
</CancelarNfseEnvio>`;

      const soapEnvelope = this.createSOAPEnvelope('CancelarNfse', xml);
      
      const response = await fetch(wsdl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml;charset=UTF-8',
          'SOAPAction': 'CancelarNfse',
        },
        body: soapEnvelope,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const xmlResponse = await response.text();
      return this.parseCancelarNFSeResponse(xmlResponse);
    } catch (error: any) {
      console.error('Erro ao cancelar NFS-e:', error);
      return {
        success: false,
        error: error.message || 'Erro ao comunicar com o servidor',
      };
    }
  }

  /**
   * Consulta URL da NFS-e
   */
  static async consultarURLNFSe(
    numeroNfse: string,
    empresaFiscal: EmpresaFiscal
  ): Promise<SOAPResponse> {
    try {
      const wsdl = empresaFiscal.ambiente === 'producao' 
        ? this.WSDL_PRODUCAO 
        : this.WSDL_HOMOLOGACAO;

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ConsultarUrlNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  <Prestador>
    <CpfCnpj>
      <Cnpj>${empresaFiscal.cnpj}</Cnpj>
    </CpfCnpj>
    <InscricaoMunicipal>${empresaFiscal.inscricao_municipal}</InscricaoMunicipal>
  </Prestador>
  <NumeroNfse>${numeroNfse}</NumeroNfse>
</ConsultarUrlNfseEnvio>`;

      const soapEnvelope = this.createSOAPEnvelope('ConsultarUrlNfse', xml);
      
      const response = await fetch(wsdl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml;charset=UTF-8',
          'SOAPAction': 'ConsultarUrlNfse',
        },
        body: soapEnvelope,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const xmlResponse = await response.text();
      return this.parseConsultarURLResponse(xmlResponse);
    } catch (error: any) {
      console.error('Erro ao consultar URL:', error);
      return {
        success: false,
        error: error.message || 'Erro ao comunicar com o servidor',
      };
    }
  }

  /**
   * Cria envelope SOAP
   */
  private static createSOAPEnvelope(method: string, xmlContent: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
               xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <${method}Request>
      <nfseCabecMsg><![CDATA[<?xml version="1.0" encoding="UTF-8"?><cabecalho versao="2.04" xmlns="http://www.abrasf.org.br/nfse.xsd"><versaoDados>2.04</versaoDados></cabecalho>]]></nfseCabecMsg>
      <nfseDadosMsg><![CDATA[${xmlContent}]]></nfseDadosMsg>
    </${method}Request>
  </soap:Body>
</soap:Envelope>`;
  }

  /**
   * Parse resposta de GerarNFSe
   */
  private static parseGerarNFSeResponse(xml: string): SOAPResponse {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, 'text/xml');

      // Verificar erros
      const erros = xmlDoc.getElementsByTagName('MensagemRetorno');
      if (erros.length > 0) {
        const codigo = erros[0].getElementsByTagName('Codigo')[0]?.textContent;
        const mensagem = erros[0].getElementsByTagName('Mensagem')[0]?.textContent;
        return {
          success: false,
          error: `[${codigo}] ${mensagem}`,
        };
      }

      // Extrair dados da NFS-e gerada
      const nfse = xmlDoc.getElementsByTagName('Nfse')[0];
      if (!nfse) {
        return {
          success: false,
          error: 'NFS-e não encontrada na resposta',
        };
      }

      const numeroNfse = xmlDoc.getElementsByTagName('Numero')[0]?.textContent || '';
      const codigoVerificacao = xmlDoc.getElementsByTagName('CodigoVerificacao')[0]?.textContent || '';
      const protocolo = xmlDoc.getElementsByTagName('Protocolo')[0]?.textContent || '';

      return {
        success: true,
        numeroNfse,
        codigoVerificacao,
        protocolo,
        mensagem: 'NFS-e gerada com sucesso',
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'Erro ao processar resposta do servidor',
      };
    }
  }

  /**
   * Parse resposta de ConsultarNFSe
   */
  private static parseConsultarNFSeResponse(xml: string): SOAPResponse {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, 'text/xml');

      const nfse = xmlDoc.getElementsByTagName('Nfse')[0];
      if (!nfse) {
        return {
          success: false,
          error: 'NFS-e não encontrada',
        };
      }

      const numeroNfse = xmlDoc.getElementsByTagName('Numero')[0]?.textContent || '';
      const codigoVerificacao = xmlDoc.getElementsByTagName('CodigoVerificacao')[0]?.textContent || '';

      return {
        success: true,
        numeroNfse,
        codigoVerificacao,
        mensagem: 'NFS-e encontrada',
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'Erro ao processar resposta',
      };
    }
  }

  /**
   * Parse resposta de CancelarNFSe
   */
  private static parseCancelarNFSeResponse(xml: string): SOAPResponse {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, 'text/xml');

      const confirmacao = xmlDoc.getElementsByTagName('Confirmacao')[0];
      if (!confirmacao) {
        const erros = xmlDoc.getElementsByTagName('MensagemRetorno');
        if (erros.length > 0) {
          const mensagem = erros[0].getElementsByTagName('Mensagem')[0]?.textContent;
          return {
            success: false,
            error: mensagem || 'Erro ao cancelar NFS-e',
          };
        }
        return {
          success: false,
          error: 'Resposta inválida',
        };
      }

      return {
        success: true,
        mensagem: 'NFS-e cancelada com sucesso',
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'Erro ao processar resposta',
      };
    }
  }

  /**
   * Parse resposta de ConsultarURL
   */
  private static parseConsultarURLResponse(xml: string): SOAPResponse {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, 'text/xml');

      const url = xmlDoc.getElementsByTagName('Url')[0]?.textContent;
      if (!url) {
        return {
          success: false,
          error: 'URL não encontrada',
        };
      }

      return {
        success: true,
        urlNota: url,
        mensagem: 'URL obtida com sucesso',
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'Erro ao processar resposta',
      };
    }
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
}
