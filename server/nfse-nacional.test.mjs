import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import forge from 'node-forge';
import {
  buildCancelEvent, buildDps, cancelNfse, emitDps, gunzipBase64, gzipBase64, parsePfx, regimeFor, signXml, verifySignedXml,
} from './nfse-nacional.mjs';

function makePfx(password = 'segredo', cn = 'OFICINA TESTE LTDA:12345678000199') {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  const attrs = [{ name: 'commonName', value: cn }, { name: 'countryName', value: 'BR' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

const empresa = {
  cnpj: '12.345.678/0001-99', inscricao_municipal: '1234567', codigo_municipio: '5300108', serie_rps: '1',
  codigo_tributacao_nacional: '14.01.01', aliquota_iss: 5, enquadramento: 'simples', reg_ap_trib_sn: 1,
  telefone: '(61) 99999-0000', email: 'contato@oficina.com',
};
const nota = { numero_rps: '42', discriminacao: 'Regulagem & troca de cordas <violão>', valor_servicos: 250, desconto_incondicionado: 0 };
const tomador = { cpf_cnpj: '123.456.789-09', nome: 'João Silva', email: 'joao@x.com', telefone: '61988887777' };

test('monta a DPS no leiaute nacional com Id de 45 posições', () => {
  const { xml, id } = buildDps({ empresa, tomador, nota, ambiente: 'homologacao', now: new Date('2026-10-01T15:00:00Z') });
  assert.equal(id, 'DPS5300108212345678000199' + '00001' + '000000000000042');
  assert.equal(id.length, 45);
  assert.match(xml, /<DPS xmlns="http:\/\/www\.sped\.fazenda\.gov\.br\/nfse" versao="1\.01">/);
  assert.match(xml, /<tpAmb>2<\/tpAmb><dhEmi>2026-10-01T11:59:00-03:00<\/dhEmi>/);
  assert.match(xml, /<cLocEmi>5300108<\/cLocEmi>/);
  assert.match(xml, /<cTribNac>140101<\/cTribNac>/);
  assert.match(xml, /<regTrib><opSimpNac>3<\/opSimpNac><regApTribSN>1<\/regApTribSN><regEspTrib>0<\/regEspTrib><\/regTrib>/);
  assert.match(xml, /<toma><CPF>12345678909<\/CPF><xNome>João Silva<\/xNome>/);
  assert.match(xml, /Regulagem &amp; troca de cordas &lt;violão&gt;/);
  assert.doesNotMatch(xml, /<pAliq>/, 'Simples com apuração pelo SN não informa alíquota');
  const order = ['tpAmb', 'dhEmi', 'verAplic', 'serie', 'nDPS', 'dCompet', 'tpEmit', 'cLocEmi', 'prest', 'toma', 'serv', 'valores'];
  const positions = order.map((name) => xml.indexOf(`<${name}>`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

test('enquadramentos e validações de entrada', () => {
  assert.equal(regimeFor('mei').opSimpNac, 2);
  assert.equal(regimeFor('normal').informaAliquota, true);
  const normal = buildDps({ empresa: { ...empresa, enquadramento: 'normal' }, tomador: {}, nota });
  assert.match(normal.xml, /<pAliq>5\.00<\/pAliq>/);
  assert.doesNotMatch(normal.xml, /<toma>/, 'sem documento do tomador não envia tomador');
  assert.throws(() => buildDps({ empresa: { ...empresa, cnpj: '123' }, tomador, nota }), /CNPJ/);
  assert.throws(() => buildDps({ empresa: { ...empresa, codigo_municipio: '53' }, tomador, nota }), /IBGE/);
  assert.throws(() => buildDps({ empresa: { ...empresa, codigo_tributacao_nacional: '' }, tomador, nota }), /tributação nacional/);
});

test('lê o certificado A1, extrai CNPJ e valida a senha', () => {
  const pfx = makePfx();
  const parsed = parsePfx(pfx, 'segredo');
  assert.equal(parsed.cnpj, '12345678000199');
  assert.equal(parsed.titular, 'OFICINA TESTE LTDA');
  assert.equal(parsed.expirado, false);
  assert.match(parsed.privateKeyPem, /BEGIN RSA PRIVATE KEY/);
  assert.throws(() => parsePfx(pfx, 'errada'), /Senha do certificado incorreta/);
  assert.throws(() => parsePfx(Buffer.from('lixo'), 'x'), /inválido/);
});

test('assina a DPS (SHA-256) e a assinatura confere', () => {
  const cert = parsePfx(makePfx(), 'segredo');
  const { xml } = buildDps({ empresa, tomador, nota });
  const signed = signXml(xml, { privateKeyPem: cert.privateKeyPem, certPem: cert.certPem, elementName: 'infDPS' });
  assert.match(signed, /<\/infDPS><Signature/);
  assert.match(signed, /rsa-sha256/);
  assert.match(signed, /<Reference URI="#DPS\d{42}"/);
  assert.match(signed, /<X509Certificate>/);
  assert.equal(verifySignedXml(signed, cert.certPem), true);
  assert.equal(verifySignedXml(signed.replace('250.00', '999.00'), cert.certPem), false, 'adulteração invalida a assinatura');
  assert.equal(gunzipBase64(gzipBase64(signed)).includes('<Signature'), true);
});

test('transmite por mTLS, recebe a NFS-e e troca de perfil se a assinatura for recusada', async () => {
  const cert = parsePfx(makePfx(), 'segredo');
  const serverKeys = forge.pki.rsa.generateKeyPair(2048);
  const serverCert = forge.pki.createCertificate();
  serverCert.publicKey = serverKeys.publicKey;
  serverCert.serialNumber = '02';
  serverCert.validity.notBefore = new Date(Date.now() - 1000);
  serverCert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const subj = [{ name: 'commonName', value: 'localhost' }];
  serverCert.setSubject(subj);
  serverCert.setIssuer(subj);
  serverCert.sign(serverKeys.privateKey, forge.md.sha256.create());

  const seen = [];
  const key50 = '5300108'.padEnd(50, '1');
  const server = https.createServer({
    key: forge.pki.privateKeyToPem(serverKeys.privateKey), cert: forge.pki.certificateToPem(serverCert),
    requestCert: true, rejectUnauthorized: false,
  }, (req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const peer = req.socket.getPeerCertificate();
      const xml = gunzipBase64(JSON.parse(raw).dpsXmlGZipB64);
      seen.push({ path: req.url, clientCn: peer?.subject?.CN });
      if (!xml.includes('rsa-sha1')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ erros: [{ codigo: 'E0714', descricao: 'Assinatura digital inválida' }] }));
      }
      const nfse = `<NFSe><infNFSe Id="NFS${key50}"><nNFSe>77</nNFSe><dhProc>2026-10-01T10:00:00-03:00</dhProc></infNFSe></NFSe>`;
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ chaveAcesso: key50, nfseXmlGZipB64: gzipBase64(nfse), idDps: 'x' }));
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  process.env.NFSE_URL_HOMOLOGACAO = `https://localhost:${server.address().port}/SefinNacional`;
  process.env.NFSE_TLS_INSECURE = '1';
  try {
    const { xml } = buildDps({ empresa, tomador, nota });
    const result = await emitDps({ dpsXml: xml, ambiente: 'homologacao', certificate: cert });
    assert.equal(result.ok, true);
    assert.equal(result.numeroNfse, '77');
    assert.equal(result.chaveAcesso.length, 50);
    assert.equal(result.perfilAssinatura, 'rsa-sha1');
    assert.equal(seen.length, 2, 'primeiro SHA-256, depois SHA-1');
    assert.equal(seen[0].clientCn, 'OFICINA TESTE LTDA:12345678000199', 'o certificado do cliente chegou no handshake');
    assert.equal(seen[0].path, '/SefinNacional/nfse');
  } finally {
    server.close();
    delete process.env.NFSE_URL_HOMOLOGACAO;
    delete process.env.NFSE_TLS_INSECURE;
  }
});

test('mensagens de erro da API viram texto legível e o cancelamento exige motivo', async () => {
  const cert = parsePfx(makePfx(), 'segredo');
  const post = async () => ({ status: 400, json: { erros: [{ codigo: 'E0123', descricao: 'Município não conveniado', complemento: '5300108' }] } });
  const { xml } = buildDps({ empresa, tomador, nota });
  const result = await emitDps({ dpsXml: xml, ambiente: 'homologacao', certificate: cert, post });
  assert.equal(result.ok, false);
  assert.match(result.erros[0], /\[E0123\] Município não conveniado — 5300108/);
  assert.throws(() => buildCancelEvent({ chaveAcesso: '1'.repeat(50), cnpj: '1', motivo: 'curto' }), /15 caracteres/);
  const cancel = await cancelNfse({
    chaveAcesso: '1'.repeat(50), cnpj: '12345678000199', motivo: 'Valor emitido incorretamente', ambiente: 'homologacao',
    certificate: cert, post: async () => ({ status: 200, json: { ok: 1 } }),
  });
  assert.equal(cancel.ok, true);
  assert.match(cancel.xmlEnviado, /<infPedReg Id="PRE1{50}101101">/);
});
