import assert from 'node:assert/strict';
import test from 'node:test';
import {
  connectMysqlWithRetry,
  isTransientConnectionError,
  orderDualStackAddresses,
} from './mysql-connection.mjs';

test('intercala IPv6 e IPv4 e alterna a familia prioritaria', () => {
  const addresses = [
    { address: '10.0.0.1', family: 4 },
    { address: 'fd00::1', family: 6 },
    { address: '10.0.0.2', family: 4 },
    { address: 'fd00::2', family: 6 },
  ];

  assert.deepEqual(orderDualStackAddresses(addresses, 1), [
    { address: 'fd00::1', family: 6 },
    { address: '10.0.0.1', family: 4 },
    { address: 'fd00::2', family: 6 },
    { address: '10.0.0.2', family: 4 },
  ]);
  assert.deepEqual(orderDualStackAddresses(addresses, 2), [
    { address: '10.0.0.1', family: 4 },
    { address: 'fd00::1', family: 6 },
    { address: '10.0.0.2', family: 4 },
    { address: 'fd00::2', family: 6 },
  ]);
});

test('repete erros transitorios e renova a resolucao DNS', async () => {
  const lookups = [];
  const connections = [];
  const delays = [];
  const silentLogger = { log() {}, warn() {} };

  const connection = await connectMysqlWithRetry('mysql://user:pass@mysql.railway.internal:3306/app', {
    maxAttempts: 3,
    retryDelayMs: 10,
    maxRetryDelayMs: 20,
    lookupFn: async (hostname, options) => {
      lookups.push({ hostname, options });
      return [
        { address: 'fd00::1', family: 6 },
        { address: '10.0.0.1', family: 4 },
      ];
    },
    connectFn: async (config) => {
      connections.push(config);
      if (connections.length < 3) throw Object.assign(new Error('not ready'), { code: 'ECONNREFUSED' });
      return { connected: true };
    },
    sleepFn: async (delay) => delays.push(delay),
    logger: silentLogger,
  });

  assert.deepEqual(connection, { connected: true });
  assert.equal(lookups.length, 2);
  assert.deepEqual(connections.map(({ host }) => host), ['fd00::1', '10.0.0.1', '10.0.0.1']);
  assert.deepEqual(delays, [10]);
  assert.equal(lookups[0].options.all, true);
  assert.equal(lookups[0].options.family, 0);
});

test('nao repete erros permanentes de autenticacao', async () => {
  let attempts = 0;

  await assert.rejects(
    connectMysqlWithRetry('mysql://user:wrong@127.0.0.1:3306/app', {
      maxAttempts: 3,
      connectFn: async () => {
        attempts += 1;
        throw Object.assign(new Error('access denied'), { code: 'ER_ACCESS_DENIED_ERROR' });
      },
      logger: { log() {}, warn() {} },
    }),
    { code: 'ER_ACCESS_DENIED_ERROR' },
  );

  assert.equal(attempts, 1);
  assert.equal(isTransientConnectionError({ code: 'ETIMEDOUT' }), true);
  assert.equal(isTransientConnectionError({ code: 'ER_ACCESS_DENIED_ERROR' }), false);
});
