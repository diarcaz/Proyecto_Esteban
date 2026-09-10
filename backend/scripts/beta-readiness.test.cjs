require('ts-node/register');
require('tsconfig-paths/register');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { allowedOrigins, validateProductionEnvironment } = require('../src/infrastructure/security/deployment-config');
const { HealthController } = require('../src/adapters/controllers/health.controller');
const { RedisService } = require('../src/infrastructure/cache/redis.service');
const { NotificationsGateway } = require('../src/infrastructure/notifications/notifications.gateway');
const { bootstrap, input } = require('./bootstrap-admin.cjs');
const { ConfigService } = require('@nestjs/config');
const bcrypt = require('bcrypt');
const Redis = require('ioredis');
const fixtureConfig = values => ({ get: (key, fallback) => values[key] === undefined ? fallback : values[key] });
const production = { NODE_ENV: 'production', CORS_ORIGIN: 'https://beta.example.test', JWT_SECRET: 'unit-test-only-value-32-characters-long', DATABASE_URL: 'fixture', REDIS_URL: 'redis://redis.example.test:6380' };
test('production requires all dependency configuration and an exact HTTPS origin', () => {
  validateProductionEnvironment(production);
  for (const key of ['CORS_ORIGIN', 'JWT_SECRET', 'DATABASE_URL', 'REDIS_URL']) assert.throws(() => validateProductionEnvironment({ ...production, [key]: '' }));
  for (const value of ['*', 'true', 'http://localhost:3000', 'https://localhost', 'https://127.0.0.1', 'https://beta.example.test/path']) assert.throws(() => allowedOrigins({ ...production, CORS_ORIGIN: value }));
  assert.deepEqual(allowedOrigins({ NODE_ENV: 'development' }), ['http://localhost:3000']);
});
test('readiness verifies both dependencies and masks every failure', async () => {
  let db = 0, redis = 0;
  const health = new HealthController({ $queryRaw: async () => { db++; } }, { ping: async () => { redis++; } });
  assert.deepEqual(await health.checkHealth(), { status: 'ok' }); assert.equal(db, 1); assert.equal(redis, 1);
  for (const fail of ['db', 'redis']) {
    const bad = async () => { throw new Error('internal credential /private/path SQL detail'); };
    const controller = new HealthController({ $queryRaw: fail === 'db' ? bad : async () => {} }, { ping: fail === 'redis' ? bad : async () => {} });
    await assert.rejects(controller.checkHealth(), e => e.getStatus() === 503 && !JSON.stringify(e.getResponse()).includes('private'));
  }
});
test('hung dependency produces bounded readiness failure', async () => {
  const health = new HealthController({ $queryRaw: () => new Promise(() => {}) }, { ping: async () => {} });
  await assert.rejects(health.checkHealth(), e => e.getStatus() === 503);
});
test('Redis URL preserves provider host, port, auth and TLS without field overrides', () => {
  const original = Redis.prototype.connect;
  Redis.prototype.connect = async function() {};
  try {
    const service = new RedisService(fixtureConfig({ NODE_ENV: 'production', REDIS_URL: 'rediss://fixture-user:fixture-password@redis.example.test:6380/2', REDIS_HOST: 'ignored.example.test', REDIS_PORT: 6379 }));
    service.onModuleInit();
    const options = service.client.options;
    assert.equal(options.host, 'redis.example.test'); assert.equal(options.port, 6380); assert.equal(options.db, 2);
    assert.equal(options.username, 'fixture-user'); assert.equal(options.password, 'fixture-password'); assert.ok(options.tls);
    assert.equal(options.enableOfflineQueue, false); service.client.disconnect();
    assert.throws(() => new RedisService(fixtureConfig({ NODE_ENV: 'production', REDIS_URL: '', REDIS_HOST: '' })).onModuleInit());
  } finally { Redis.prototype.connect = original; }
});
test('WebSocket rejects foreign origin before JWT authentication', async () => {
  const gateway = new NotificationsGateway(new ConfigService(), {}, {});
  let middleware;
  gateway.afterInit({ use(fn) { middleware = fn; } });
  let error;
  await middleware({ handshake: { headers: { origin: 'https://foreign.example.test' }, auth: {} } }, e => { error = e; });
  assert.match(error.message, /authentication required/);
});
const credentials = { BOOTSTRAP_EMAIL: 'operator@example.test', BOOTSTRAP_PASSWORD: 'Fixture!Admin-Strong987', BOOTSTRAP_FIRST_NAME: 'Test', BOOTSTRAP_LAST_NAME: 'Operator', BOOTSTRAP_EMPLOYEE_NUMBER: 'ADM-TEST', BOOTSTRAP_COMPANY_NAME: 'Explicit test company', BOOTSTRAP_COMPANY_TAX_ID: 'TEST-ID' };
test('bootstrap rejects missing/weak credentials and never accepts a bcrypt-truncated password', () => {
  assert.throws(() => input({}));
  for (const password of ['short', 'Password123456!!!', 'A!9' + 'x'.repeat(80)]) assert.throws(() => input({ ...credentials, BOOTSTRAP_PASSWORD: password }));
});
test('bootstrap hashes credentials, binds explicit company and refuses existing admin/data', async () => {
  let created, exists = false, populated = false;
  const tx = { $executeRawUnsafe: async () => {}, company: { count: async () => populated ? 1 : 0, create: async () => ({ id: 'company-test' }) }, user: { findFirst: async () => exists ? { id: 'existing' } : null, count: async () => 0, create: async args => { created = args.data; } } };
  const prisma = { $transaction: fn => fn(tx) };
  await bootstrap(prisma, credentials);
  assert.equal(created.role, 'SUPER_ADMIN'); assert.equal(created.companyId, 'company-test');
  assert.notEqual(created.passwordHash, credentials.BOOTSTRAP_PASSWORD); assert.equal(await bcrypt.compare(credentials.BOOTSTRAP_PASSWORD, created.passwordHash), true);
  exists = true; await assert.rejects(bootstrap(prisma, credentials));
  exists = false; populated = true; await assert.rejects(bootstrap(prisma, credentials));
});
test('common admin unexpected dependency errors do not reach response bodies', async () => {
  const { StaffController } = require('../src/adapters/controllers/staff.controller');
  const controller = new StaffController({ findAll: async () => { throw new Error('Prisma SQL /secret/path'); } });
  await assert.rejects(controller.findAll({ query: {}, user: {} }), e => !JSON.stringify(e.getResponse()).includes('Prisma'));
});
