/**
 * Serviço de assinatura digital para NFS-e
 * Suporta certificados A1 (arquivo) e A3 (token/cartão)
 * 
 * IMPORTANTE: Para produção, requer certificado digital válido ICP-Brasil
 */

export interface CertificadoDigital {
  tipo: 'A1' | 'A3';
  arquivo?: File;
  senha?: string;
  serialNumber?: string;
}

export class AssinaturaDigitalService {
  /**
   * Assina XML com certificado digital
   * 
   * NOTA: Esta é uma implementação simplificada.
   * Para produção, você precisará de uma biblioteca de criptografia
   * que suporte certificados ICP-Brasil, como:
   * - forge (node-forge)
   * - xmldsigjs
   * - Web Crypto API
   * 
   * Ou um serviço backend que faça a assinatura com bibliotecas nativas
   */
  static async assinarXML(
    xml: string,
    certificado: CertificadoDigital
  ): Promise<string> {
    try {
      // IMPORTANTE: Esta é uma implementação de DEMONSTRAÇÃO
      // Para produção você deve implementar assinatura real com certificado digital

      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ MODO DESENVOLVIMENTO: XML não será assinado digitalmente');
        return xml; // Em desenvolvimento, retorna XML sem assinatura
      }

      // Para produção, você precisaria:
      // 1. Ler o certificado (.pfx/.p12 para A1)
      // 2. Extrair chave privada e certificado
      // 3. Calcular hash SHA-1 do XML
      // 4. Assinar com chave privada RSA
      // 5. Adicionar tag <Signature> ao XML

      // Exemplo de estrutura que deveria ser implementada:
      /*
      const certificadoData = await this.lerCertificado(certificado);
      const xmlHash = await this.calcularHashSHA1(xml);
      const assinatura = await this.assinarComChavePrivada(xmlHash, certificadoData.privateKey);
      const xmlAssinado = this.adicionarAssinaturaAoXML(xml, assinatura, certificadoData.certificate);
      return xmlAssinado;
      */

      throw new Error('Assinatura digital não implementada. Configure um serviço backend para assinar XMLs em produção.');
    } catch (error: any) {
      console.error('Erro ao assinar XML:', error);
      throw new Error(`Falha na assinatura digital: ${error.message}`);
    }
  }

  /**
   * Valida certificado digital
   */
  static async validarCertificado(certificado: CertificadoDigital): Promise<boolean> {
    try {
      if (!certificado.senha) {
        throw new Error('Senha do certificado é obrigatória');
      }

      if (certificado.tipo === 'A1' && !certificado.arquivo) {
        throw new Error('Arquivo do certificado é obrigatório para tipo A1');
      }

      // Aqui você implementaria a validação real do certificado
      // Verificando:
      // - Validade do certificado
      // - Cadeia de certificação ICP-Brasil
      // - Chave privada corresponde ao certificado
      
      return true;
    } catch (error: any) {
      console.error('Erro ao validar certificado:', error);
      return false;
    }
  }

  /**
   * Extrai informações do certificado
   */
  static async extrairInfoCertificado(
    arquivo: File,
    senha: string
  ): Promise<{
    titular: string;
    cnpj: string;
    validade: Date;
    emissor: string;
  }> {
    try {
      // Aqui você implementaria a leitura real do certificado .pfx/.p12
      // Usando bibliotecas como node-forge ou PKI.js
      
      // Esta é apenas uma estrutura de exemplo
      return {
        titular: 'Nome do Titular',
        cnpj: '00.000.000/0000-00',
        validade: new Date(),
        emissor: 'AC Certisign',
      };
    } catch (error: any) {
      throw new Error(`Erro ao ler certificado: ${error.message}`);
    }
  }

  /**
   * Gera assinatura SHA-1 (usado no XML)
   */
  private static async calcularHashSHA1(data: string): Promise<string> {
    // Implementação usando Web Crypto API
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-1', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  /**
   * Adiciona tag <Signature> ao XML conforme padrão XMLDSig
   */
  private static adicionarAssinaturaAoXML(
    xml: string,
    assinatura: string,
    certificado: string
  ): string {
    // Localizar onde inserir a assinatura (geralmente antes do </Rps> final)
    const signatureXML = `
    <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
      <SignedInfo>
        <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
        <SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
        <Reference URI="">
          <Transforms>
            <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
          </Transforms>
          <DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
          <DigestValue>${assinatura}</DigestValue>
        </Reference>
      </SignedInfo>
      <SignatureValue>${assinatura}</SignatureValue>
      <KeyInfo>
        <X509Data>
          <X509Certificate>${certificado}</X509Certificate>
        </X509Data>
      </KeyInfo>
    </Signature>`;

    // Inserir antes da tag de fechamento
    return xml.replace('</InfDeclaracaoPrestacaoServico>', `${signatureXML}\n  </InfDeclaracaoPrestacaoServico>`);
  }

  /**
   * Verifica se o ambiente tem suporte a Web Crypto API
   */
  static isWebCryptoSupported(): boolean {
    return typeof window !== 'undefined' && 
           typeof window.crypto !== 'undefined' && 
           typeof window.crypto.subtle !== 'undefined';
  }
}

/**
 * GUIA DE IMPLEMENTAÇÃO PARA PRODUÇÃO:
 * 
 * 1. BACKEND (Node.js/Python/Java):
 *    - Crie um endpoint REST para receber o XML
 *    - Use bibliotecas nativas para assinatura:
 *      * Node.js: node-forge, xmldsigjs
 *      * Python: cryptography, signxml
 *      * Java: java.security, Apache Santuário
 *    - Armazene certificados de forma segura (HSM ou Azure Key Vault)
 * 
 * 2. FRONTEND:
 *    - Envie XML para o backend via API
 *    - Receba XML assinado de volta
 *    - Envie XML assinado para a prefeitura
 * 
 * 3. CERTIFICADO A3 (Token/Cartão):
 *    - Requer componente ActiveX ou extensão de navegador
 *    - Ou implemente tudo no backend
 * 
 * 4. SEGURANÇA:
 *    - NUNCA exponha certificados no frontend
 *    - Use HTTPS always
 *    - Implemente rate limiting
 *    - Faça backup dos certificados
 * 
 * 5. ALTERNATIVAS:
 *    - Use serviços de assinatura em nuvem (DocuSign, Adobe Sign adaptados)
 *    - HSM (Hardware Security Module)
 *    - Certificados em Azure Key Vault ou AWS KMS
 */
