const path = require('node:path');
const { spawn } = require('node:child_process');
const { bootstrap, safeFailure } = require('./bootstrap-admin.cjs');

function runtimeEnv(env) { return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('BOOTSTRAP_'))); }

function runNode(script, args, env, quiet = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: path.resolve(__dirname, '..'), env: runtimeEnv(env), stdio: quiet ? 'ignore' : 'inherit', shell: false });
    const term = () => child.kill('SIGTERM'), interrupt = () => child.kill('SIGINT');
    process.on('SIGTERM', term); process.on('SIGINT', interrupt);
    function cleanup() { process.off('SIGTERM', term); process.off('SIGINT', interrupt); }
    child.once('error', () => { cleanup(); reject(new Error('Process failed')); });
    child.once('close', (code, signal) => { cleanup(); if (code === 0 && !signal) resolve(); else reject(new Error('Process failed')); });
  });
}

async function bootstrapOnStart(env) {
  const { input } = require('./bootstrap-admin.cjs');
  input(env); // Safe variable-name diagnostics before initializing Prisma.
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ log: [] });
  try { return await bootstrap(prisma, env, { onStart: true }); }
  finally { await prisma.$disconnect(); }
}

async function startup(env = process.env, dependencies = {}) {
  const log = dependencies.log || console.log;
  const error = dependencies.error || console.error;
  const migrate = dependencies.migrate || (() => runNode(require.resolve('prisma/build/index.js'), ['migrate', 'deploy'], env, true));
  const initialize = dependencies.initialize || (() => bootstrapOnStart(env));
  const start = dependencies.start || (() => runNode(path.resolve(__dirname, '../dist/main.js'), [], env));
  try { await migrate(); log('Database migrations completed.'); }
  catch { error('Database migrations failed; application not started.'); return 1; }
  if (env.BOOTSTRAP_ADMIN_ON_START === 'true') {
    try {
      const result = await initialize();
      log(result === 'skipped' ? 'Initial administrator already exists; bootstrap skipped.' : 'Initial administrator created. Disable startup bootstrap and remove BOOTSTRAP_* variables.');
    } catch (e) { error(safeFailure(e)); return 1; }
  }
  try { await start(); return 0; }
  catch { error('Application process stopped unsuccessfully.'); return 1; }
}

module.exports = { startup, runtimeEnv, runNode };
if (require.main === module) startup().then(code => { process.exitCode = code; }).catch(() => { console.error('Backend startup failed.'); process.exitCode = 1; });
