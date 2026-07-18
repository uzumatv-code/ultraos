import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import mysql from 'mysql2/promise';

const TRANSIENT_CONNECTION_ERRORS = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST',
]);

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeAddress({ address, family }) {
  return `IPv${family} ${address}`;
}

function errorCode(error) {
  return error?.code || error?.cause?.code || 'ERRO_DESCONHECIDO';
}

export function isTransientConnectionError(error) {
  if (TRANSIENT_CONNECTION_ERRORS.has(errorCode(error))) return true;
  return Array.isArray(error?.errors)
    && error.errors.length > 0
    && error.errors.every(isTransientConnectionError);
}

export function orderDualStackAddresses(addresses, attempt) {
  const unique = [...new Map(addresses.map((item) => [`${item.family}:${item.address}`, item])).values()];
  const ipv4 = unique.filter((item) => item.family === 4);
  const ipv6 = unique.filter((item) => item.family === 6);
  const queues = attempt % 2 === 0 ? [ipv4, ipv6] : [ipv6, ipv4];
  const ordered = [];

  while (queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      if (queue.length > 0) ordered.push(queue.shift());
    }
  }

  return ordered;
}

async function resolveDatabaseAddresses(hostname, attempt, lookupFn) {
  const literalFamily = isIP(hostname);
  if (literalFamily) return [{ address: hostname, family: literalFamily }];

  const addresses = await lookupFn(hostname, {
    all: true,
    family: 0,
    verbatim: true,
  });

  if (addresses.length === 0) {
    const error = new Error(`DNS nao retornou enderecos para ${hostname}.`);
    error.code = 'ENOTFOUND';
    throw error;
  }

  return orderDualStackAddresses(addresses, attempt);
}

export async function connectMysqlWithRetry(databaseUrl, options = {}) {
  const parsedUrl = new URL(databaseUrl);
  const maxAttempts = positiveInteger(options.maxAttempts ?? process.env.MYSQL_MIGRATION_MAX_ATTEMPTS, 12);
  const retryDelayMs = positiveInteger(options.retryDelayMs ?? process.env.MYSQL_MIGRATION_RETRY_DELAY_MS, 2_000);
  const maxRetryDelayMs = positiveInteger(options.maxRetryDelayMs ?? process.env.MYSQL_MIGRATION_MAX_RETRY_DELAY_MS, 10_000);
  const connectTimeout = positiveInteger(options.connectTimeout ?? process.env.MYSQL_MIGRATION_CONNECT_TIMEOUT_MS, 5_000);
  const lookupFn = options.lookupFn || lookup;
  const connectFn = options.connectFn || mysql.createConnection;
  const sleepFn = options.sleepFn || sleep;
  const logger = options.logger || console;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let addresses;

    try {
      addresses = await resolveDatabaseAddresses(parsedUrl.hostname, attempt, lookupFn);
      logger.log(
        `MySQL: tentativa ${attempt}/${maxAttempts}; DNS ${parsedUrl.hostname} -> ${addresses.map(describeAddress).join(', ')}`,
      );
    } catch (error) {
      lastError = error;
      if (!isTransientConnectionError(error)) throw error;
      logger.warn(`MySQL: tentativa ${attempt}/${maxAttempts}; falha de DNS (${errorCode(error)}).`);
      addresses = [];
    }

    for (const candidate of addresses) {
      try {
        const connection = await connectFn({
          uri: databaseUrl,
          host: candidate.address,
          connectTimeout,
        });
        logger.log(`MySQL: conexao estabelecida por ${describeAddress(candidate)}.`);
        return connection;
      } catch (error) {
        lastError = error;
        if (!isTransientConnectionError(error)) throw error;
        logger.warn(
          `MySQL: ${describeAddress(candidate)} indisponivel (${errorCode(error)}); tentando o proximo endereco.`,
        );
      }
    }

    if (attempt < maxAttempts) {
      const delayMs = Math.min(retryDelayMs * (2 ** (attempt - 1)), maxRetryDelayMs);
      logger.warn(`MySQL ainda indisponivel; nova tentativa em ${delayMs}ms.`);
      await sleepFn(delayMs);
    }
  }

  throw new Error(
    `Nao foi possivel conectar ao MySQL apos ${maxAttempts} tentativas. Ultimo erro: ${errorCode(lastError)}.`,
    { cause: lastError },
  );
}
