/**
 * Emissão de NFS-e pelo Padrão Nacional (Sefin Nacional / ADN, gov.br/nfse).
 *
 *  1. Monta a DPS (Declaração de Prestação de Serviços) no leiaute 1.01.
 *  2. Assina com o certificado A1 da empresa (XMLDSig enveloped).
 *  3. Envia por mTLS: POST /SefinNacional/nfse { dpsXmlGZipB64 }.
 *  4. Lê a NFS-e autorizada devolvida na resposta (chave de acesso e XML).
 *
 * Tudo aqui é função pura ou recebe o certificado por parâmetro, para poder
 * ser testado sem banco. O perfil de assinatura exato não é fixado em fonte
 * pública oficial, então há uma lista de perfis tentados em ordem.
 */

import https from 'node:https';
import zlib from 'node:zlib';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';

export const NFSE_VERSAO_LEIAUTE = '1.01';
export const NFSE_VERSAO_APLICATIVO = 'UltraOS-1.0';
const NS = 'http://www.sped.fazenda.gov.br/nfse';

export const NFSE_AMBIENTES = {
  producao: { tpAmb: 1, url: 'https://sefin.nfse.gov.br/SefinNacional' },
  homologacao: { tpAmb: 2, url: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional' },
};

/** Perfis de assinatura, do mais provável para o legado. */
export const SIGNATURE_PROFILES = [
  {
    name: 'rsa-sha256',
    signature: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    digest: 'http://www.w3.org/2001/04/xmlenc#sha256',
    c14n: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  },
  {
    name: 'rsa-sha1',
    signature: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    digest: 'http://www.w3.org/2000/09/xmldsig#sha1',
    c14n: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  },
];

/* ------------------------------------------------------------------ utilitários */

const onlyDigits = (value) => String(value ?? '').replace(/\D/g, '');

export function xmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

const money = (value) => Number(value || 0).toFixed(2);

function tag(name, value) {
  return value === null || value === undefined || value === '' ? '' : `<${name}>${xmlEscape(value)}</${name}>`;
}

/** Data/hora no fuso de Brasília (UTC-3, sem horário de verão desde 2019). */
export function brasiliaDateTime(date = new Date()) {
  const shifted = new Date(date.getTime() - 3 * 3600 * 1000);
  return { iso: `${shifted.toISOString().slice(0, 19)}-03:00`, date: shifted.toISOString().slice(0, 10) };
}

/* ------------------------------------------------------------------ enquadramento */

/**
 * Enquadramento do prestador → campos regTrib da DPS.
 *  'mei'      Microempreendedor Individual
 *  'simples'  Simples Nacional (ME/EPP)
 *  'normal'   Fora do Simples (Lucro Presumido/Real)
 */
export function regimeFor(enquadramento, regApTribSN = 1) {
  if (enquadramento === 'mei') return { opSimpNac: 2, regApTribSN: null, regEspTrib: 0, informaAliquota: false };
  if (enquadramento === 'simples') return { opSimpNac: 3, regApTribSN: Number(regApTribSN) || 1, regEspTrib: 0, informaAliquota: Number(regApTribSN) > 1 };
  return { opSimpNac: 1, regApTribSN: null, regEspTrib: 0, informaAliquota: true };
}

/* ------------------------------------------------------------------ DPS */

/**
 * @param {object} p
 * @param {object} p.empresa   linha de empresa_fiscal
 * @param {object} p.tomador   { cpf_cnpj, nome, email, telefone } (cpf_cnpj opcional)
 * @param {object} p.nota      { numero_rps, discriminacao, valor_servicos, desconto_incondicionado }
 * @param {string} p.ambiente  'homologacao' | 'producao'
 */
export function buildDps({ empresa, tomador, nota, ambiente = 'homologacao', now = new Date() }) {
  const cnpj = onlyDigits(empresa.cnpj);
  if (cnpj.length !== 14) throw new Error('CNPJ da empresa inválido nos dados fiscais');
  const cMun = onlyDigits(empresa.codigo_municipio);
  if (cMun.length !== 7) throw new Error('Município da empresa sem código IBGE de 7 dígitos');
  const nDps = Number(onlyDigits(nota.numero_rps));
  if (!(nDps >= 1)) throw new Error('Número da DPS inválido');
  const serie = onlyDigits(empresa.serie_rps) || '1';
  if (serie.length > 5) throw new Error('A série da DPS deve ter até 5 dígitos');
  const cTribNac = onlyDigits(empresa.codigo_tributacao_nacional || '');
  if (cTribNac.length !== 6) throw new Error('Informe o código de tributação nacional do serviço (6 dígitos) nos dados fiscais');
  const valorServicos = Number(nota.valor_servicos);
  if (!(valorServicos > 0)) throw new Error('Valor do serviço deve ser maior que zero');
  const descricao = String(nota.discriminacao || '').trim();
  if (!descricao) throw new Error('A descrição do serviço está vazia');

  const regime = regimeFor(empresa.enquadramento, empresa.reg_ap_trib_sn);
  const { iso, date } = brasiliaDateTime(new Date(now.getTime() - 60_000));
  const id = `DPS${cMun}2${cnpj}${serie.padStart(5, '0')}${String(nDps).padStart(15, '0')}`;
  const tpAmb = NFSE_AMBIENTES[ambiente]?.tpAmb ?? 2;

  const tomadorDoc = onlyDigits(tomador?.cpf_cnpj);
  const tomaXml = tomadorDoc.length === 11 || tomadorDoc.length === 14
    ? `<toma>${tag(tomadorDoc.length === 14 ? 'CNPJ' : 'CPF', tomadorDoc)}${tag('xNome', String(tomador.nome || '').slice(0, 150))}${tag('fone', onlyDigits(tomador.telefone).slice(0, 20))}${tag('email', String(tomador.email || '').slice(0, 80))}</toma>`
    : '';

  const desconto = Number(nota.desconto_incondicionado || 0);
  const aliquota = Number(empresa.aliquota_iss || 0);

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<DPS xmlns="${NS}" versao="${NFSE_VERSAO_LEIAUTE}">` +
    `<infDPS Id="${id}">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<dhEmi>${iso}</dhEmi>` +
    `<verAplic>${NFSE_VERSAO_APLICATIVO}</verAplic>` +
    `<serie>${Number(serie)}</serie>` +
    `<nDPS>${nDps}</nDPS>` +
    `<dCompet>${date}</dCompet>` +
    `<tpEmit>1</tpEmit>` +
    `<cLocEmi>${cMun}</cLocEmi>` +
    `<prest>` +
    `<CNPJ>${cnpj}</CNPJ>` +
    tag('IM', onlyDigits(empresa.inscricao_municipal) ? empresa.inscricao_municipal.trim() : '') +
    tag('fone', onlyDigits(empresa.telefone).slice(0, 20)) +
    tag('email', String(empresa.email || '').slice(0, 80)) +
    `<regTrib><opSimpNac>${regime.opSimpNac}</opSimpNac>${regime.regApTribSN ? `<regApTribSN>${regime.regApTribSN}</regApTribSN>` : ''}<regEspTrib>${regime.regEspTrib}</regEspTrib></regTrib>` +
    `</prest>` +
    tomaXml +
    `<serv>` +
    `<locPrest><cLocPrestacao>${cMun}</cLocPrestacao></locPrest>` +
    `<cServ><cTribNac>${cTribNac}</cTribNac>${tag('cTribMun', onlyDigits(empresa.codigo_tributacao_municipio))}<xDescServ>${xmlEscape(descricao.slice(0, 2000))}</xDescServ></cServ>` +
    `</serv>` +
    `<valores>` +
    `<vServPrest><vServ>${money(valorServicos)}</vServ></vServPrest>` +
    (desconto > 0 ? `<vDescCondIncond><vDescIncond>${money(desconto)}</vDescIncond></vDescCondIncond>` : '') +
    `<trib>` +
    `<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN>${regime.informaAliquota && aliquota > 0 ? `<pAliq>${money(aliquota)}</pAliq>` : ''}</tribMun>` +
    `<totTrib><indTotTrib>0</indTotTrib></totTrib>` +
    `</trib>` +
    `</valores>` +
    `</infDPS>` +
    `</DPS>`;

  return { xml, id, nDps, serie: Number(serie) };
}

/** Pedido de cancelamento (evento 101101). */
export function buildCancelEvent({ chaveAcesso, cnpj, motivoCodigo = 1, motivo, ambiente = 'homologacao', now = new Date() }) {
  const chave = onlyDigits(chaveAcesso);
  if (chave.length !== 50) throw new Error('Chave de acesso da NFS-e inválida (esperado 50 dígitos)');
  const text = String(motivo || '').trim();
  if (text.length < 15) throw new Error('Informe o motivo do cancelamento com pelo menos 15 caracteres');
  const { iso } = brasiliaDateTime(new Date(now.getTime() - 60_000));
  const id = `PRE${chave}101101`;
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<pedRegEvento xmlns="${NS}" versao="${NFSE_VERSAO_LEIAUTE}">` +
    `<infPedReg Id="${id}">` +
    `<tpAmb>${NFSE_AMBIENTES[ambiente]?.tpAmb ?? 2}</tpAmb>` +
    `<verAplic>${NFSE_VERSAO_APLICATIVO}</verAplic>` +
    `<dhEvento>${iso}</dhEvento>` +
    `<CNPJAutor>${onlyDigits(cnpj)}</CNPJAutor>` +
    `<chNFSe>${chave}</chNFSe>` +
    `<nPedRegEvento>001</nPedRegEvento>` +
    `<e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>${motivoCodigo}</cMotivo><xMotivo>${xmlEscape(text.slice(0, 255))}</xMotivo></e101101>` +
    `</infPedReg>` +
    `</pedRegEvento>`;
  return { xml, id };
}

/* ------------------------------------------------------------------ certificado */

/** Lê um .pfx/.p12 e devolve chave/certificados em PEM e metadados para validação. */
export function parsePfx(buffer, password) {
  let p12;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(Buffer.from(buffer).toString('binary')));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, String(password ?? ''));
  } catch (error) {
    if (/Invalid password|PKCS#12 MAC could not be verified/i.test(error.message)) throw new Error('Senha do certificado incorreta');
    throw new Error('Arquivo de certificado inválido. Envie o .pfx ou .p12 (certificado A1).');
  }

  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ];
  const key = keyBags[0]?.key;
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map((bag) => bag.cert).filter(Boolean);
  if (!key || !certs.length) throw new Error('O arquivo não contém chave privada e certificado (use um certificado A1).');

  const leaf = certs.find((cert) => cert.publicKey?.n && key.n && cert.publicKey.n.compareTo(key.n) === 0) || certs[0];
  const chain = [leaf, ...certs.filter((cert) => cert !== leaf)];

  const subject = leaf.subject.getField('CN')?.value || '';
  const cnpjFromCn = subject.match(/(\d{14})/)?.[1];
  let cnpj = cnpjFromCn || null;
  if (!cnpj) {
    const san = leaf.getExtension('subjectAltName');
    cnpj = san?.value ? String(san.value).match(/\d{14}/)?.[0] || null : null;
  }

  const pemChain = chain.map((cert) => forge.pki.certificateToPem(cert));
  return {
    privateKeyPem: forge.pki.privateKeyToPem(key),
    certPem: pemChain[0],
    chainPem: pemChain.join(''),
    certBase64: forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(leaf)).getBytes()),
    titular: subject.replace(/:\d{14}$/, ''),
    cnpj,
    validoDe: leaf.validity.notBefore.toISOString(),
    validoAte: leaf.validity.notAfter.toISOString(),
    expirado: leaf.validity.notAfter.getTime() < Date.now(),
  };
}

/* ------------------------------------------------------------------ assinatura */

/** Assina `xml` com `elementName` como alvo (Reference "#Id"); a Signature entra logo após o alvo. */
export function signXml(xml, { privateKeyPem, certPem, elementName, profile = SIGNATURE_PROFILES[0] }) {
  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: profile.signature,
    canonicalizationAlgorithm: profile.c14n,
  });
  const selector = `//*[local-name(.)='${elementName}']`;
  sig.addReference({
    xpath: selector,
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', profile.c14n],
    digestAlgorithm: profile.digest,
  });
  sig.computeSignature(xml, { location: { reference: selector, action: 'after' } });
  return sig.getSignedXml();
}

export function verifySignedXml(signedXml, certPem) {
  const sig = new SignedXml({ publicCert: certPem });
  const match = signedXml.match(/<Signature[\s\S]*<\/Signature>/);
  if (!match) return false;
  sig.loadSignature(match[0]);
  return sig.checkSignature(signedXml);
}

/* ------------------------------------------------------------------ transporte */

export const gzipBase64 = (text) => zlib.gzipSync(Buffer.from(text.replace(/>\s+</g, '><').trim(), 'utf8')).toString('base64');
export const gunzipBase64 = (value) => zlib.gunzipSync(Buffer.from(value, 'base64')).toString('utf8');

export function postJson({ baseUrl, path, body, key, cert, timeoutMs = 45_000 }) {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}${path}`);
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = https.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        key,
        cert,
        minVersion: 'TLSv1.2',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: timeoutMs,
        rejectUnauthorized: process.env.NFSE_TLS_INSECURE !== '1',
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { /* resposta não-JSON: mantém o texto */ }
          resolve({ status: response.statusCode, json, text });
        });
      },
    );
    request.on('timeout', () => request.destroy(new Error('Tempo esgotado ao falar com a Sefin Nacional')));
    request.on('error', reject);
    request.end(payload);
  });
}

/** Junta as mensagens de erro de qualquer formato que a API devolva. */
export function extractApiErrors(result) {
  const json = result?.json;
  const messages = [];
  const visit = (list) => {
    for (const item of [].concat(list || [])) {
      if (typeof item === 'string') messages.push(item);
      else if (item && typeof item === 'object') {
        const code = item.codigo ?? item.Codigo ?? item.code;
        const text = item.descricao ?? item.Descricao ?? item.mensagem ?? item.message;
        const extra = item.complemento ?? item.Complemento;
        if (text) messages.push([code && `[${code}]`, text, extra && `— ${extra}`].filter(Boolean).join(' '));
      }
    }
  };
  if (json) {
    for (const key of ['erros', 'erro', 'Erros', 'Erro', 'errors', 'mensagens', 'alertas']) visit(json[key]);
    if (!messages.length && (json.message || json.mensagem)) messages.push(json.message || json.mensagem);
  }
  if (!messages.length && result?.text) messages.push(String(result.text).slice(0, 400));
  if (!messages.length) messages.push(`HTTP ${result?.status ?? '?'} sem detalhes da Sefin Nacional`);
  return messages;
}

const isSignatureProblem = (messages) => messages.some((message) => /assinatura|signature|digest|certificad/i.test(message));

/** Lê a NFS-e autorizada devolvida pela API. */
export function parseAuthorized(json) {
  const xml = json?.nfseXmlGZipB64 ? gunzipBase64(json.nfseXmlGZipB64) : null;
  const pick = (name) => xml?.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1] ?? null;
  const chave = json?.chaveAcesso || xml?.match(/Id="NFS(\d{50})"/)?.[1] || null;
  return {
    chaveAcesso: chave,
    numeroNfse: pick('nNFSe'),
    dataProcessamento: json?.dataHoraProcessamento || pick('dhProc'),
    idDps: json?.idDps || json?.idDPS || null,
    xmlNfse: xml,
    alertas: extractApiErrors({ json: { alertas: json?.alertas } }).filter((message) => !/^HTTP /.test(message)),
  };
}

/**
 * Emite a NFS-e: assina e transmite. Se a Sefin reclamar da assinatura, tenta o próximo perfil.
 * @returns {{ok:boolean, ...}} sempre devolve também o XML enviado, para auditoria.
 */
export async function emitDps({ dpsXml, ambiente, certificate, post = postJson }) {
  const baseUrl = process.env[`NFSE_URL_${ambiente.toUpperCase()}`] || NFSE_AMBIENTES[ambiente].url;
  let lastErrors = [];
  let lastXml = dpsXml;
  for (const profile of SIGNATURE_PROFILES) {
    const signed = signXml(dpsXml, { privateKeyPem: certificate.privateKeyPem, certPem: certificate.certPem, elementName: 'infDPS', profile });
    lastXml = signed;
    const result = await post({ baseUrl, path: '/nfse', body: { dpsXmlGZipB64: gzipBase64(signed) }, key: certificate.privateKeyPem, cert: certificate.chainPem });
    if (result.status >= 200 && result.status < 300 && result.json?.nfseXmlGZipB64) {
      return { ok: true, xmlEnviado: signed, perfilAssinatura: profile.name, ...parseAuthorized(result.json) };
    }
    lastErrors = extractApiErrors(result);
    if (!isSignatureProblem(lastErrors)) break;
  }
  return { ok: false, xmlEnviado: lastXml, erros: lastErrors };
}

/** Registra o evento de cancelamento (101101). */
export async function cancelNfse({ chaveAcesso, cnpj, motivo, motivoCodigo, ambiente, certificate, post = postJson }) {
  const baseUrl = process.env[`NFSE_URL_${ambiente.toUpperCase()}`] || NFSE_AMBIENTES[ambiente].url;
  const event = buildCancelEvent({ chaveAcesso, cnpj, motivo, motivoCodigo, ambiente });
  const signed = signXml(event.xml, { privateKeyPem: certificate.privateKeyPem, certPem: certificate.certPem, elementName: 'infPedReg' });
  const result = await post({
    baseUrl,
    path: `/nfse/${onlyDigits(chaveAcesso)}/eventos`,
    body: { pedidoRegistroEventoXmlGZipB64: gzipBase64(signed) },
    key: certificate.privateKeyPem,
    cert: certificate.chainPem,
  });
  if (result.status >= 200 && result.status < 300) return { ok: true, xmlEnviado: signed, resposta: result.json };
  return { ok: false, xmlEnviado: signed, erros: extractApiErrors(result) };
}
