require('ts-node/register');
require('tsconfig-paths/register');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ThrottlerStorageService } = require('@nestjs/throttler');
const { clientIpTracker, getClientIp } = require('../src/infrastructure/security/client-ip');
const { AuditService } = require('../src/application/services/audit.service');

const previousNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';

const request = (cfIp, xForwardedFor) => ({
  headers: {
    'cf-connecting-ip': cfIp,
    'x-forwarded-for': xForwardedFor,
  },
  socket: { remoteAddress: '10.0.0.8' },
});

test('production client IP uses validated CF-Connecting-IP and ignores forged X-Forwarded-For', () => {
  assert.equal(getClientIp(request('198.51.100.10', '203.0.113.99')), '198.51.100.10');
  assert.equal(getClientIp(request('198.51.100.10', '198.51.100.10, 203.0.113.99')), '198.51.100.10');
  assert.equal(getClientIp(request('not-an-ip', '203.0.113.99')), '10.0.0.8');
});

test('different clients have independent Nest throttler counters; spoofed XFF cannot evade a limit', async () => {
  const storage = new ThrottlerStorageService();
  const alice = request('198.51.100.10', '203.0.113.1');
  const aliceSpoof = request('198.51.100.10', '192.0.2.250');
  const bob = request('198.51.100.11', '203.0.113.1');

  const hit = async (req) => storage.increment(`test-login-${clientIpTracker(req)}`, 60_000, 2, 60_000, 'default');
  assert.equal((await hit(alice)).totalHits, 1);
  assert.equal((await hit(aliceSpoof)).totalHits, 2);
  assert.equal((await hit(alice)).isBlocked, true);
  assert.equal((await hit(bob)).totalHits, 1);

  storage.onApplicationShutdown();
});

test('audit persistence stores the same validated client address and ignores X-Forwarded-For', async () => {
  let saved;
  const service = new AuditService({
    auditLog: { create: async ({ data }) => { saved = data; return data; } },
  });
  const clientIp = getClientIp(request('198.51.100.42', '203.0.113.200'));

  await service.createAuditLog({ actorId: 'test-actor', action: 'TEST', ipAddress: clientIp });
  assert.equal(saved.ipAddress, '198.51.100.42');
});

test('development ignores caller-supplied Cloudflare and forwarded headers', () => {
  process.env.NODE_ENV = 'test';
  assert.equal(getClientIp(request('198.51.100.10', '203.0.113.99')), '10.0.0.8');
});

test.after(() => {
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
});
