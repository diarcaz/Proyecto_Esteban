// Explicit operator command or opt-in startup only. Never resets an account.
const bcrypt = require('bcrypt');
class BootstrapInputError extends Error {}
const required = ['BOOTSTRAP_EMAIL', 'BOOTSTRAP_PASSWORD', 'BOOTSTRAP_FIRST_NAME', 'BOOTSTRAP_LAST_NAME', 'BOOTSTRAP_EMPLOYEE_NUMBER', 'BOOTSTRAP_COMPANY_NAME', 'BOOTSTRAP_COMPANY_TAX_ID'];
function input(env) {
  for (const key of required) if (typeof env[key] !== 'string' || !env[key].trim()) throw new BootstrapInputError(`Missing required variable: ${key}`);
  const password = env.BOOTSTRAP_PASSWORD;
  if (password.length < 16 || Buffer.byteLength(password) > 72 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password) || /password|changeme|qwerty|123456|nexustaff/i.test(password)) throw new Error('Weak bootstrap password');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.BOOTSTRAP_EMAIL.trim())) throw new Error('Invalid bootstrap email');
  return { email: env.BOOTSTRAP_EMAIL.trim().toLowerCase(), password, firstName: env.BOOTSTRAP_FIRST_NAME.trim(), lastName: env.BOOTSTRAP_LAST_NAME.trim(), employeeNumber: env.BOOTSTRAP_EMPLOYEE_NUMBER.trim(), companyName: env.BOOTSTRAP_COMPANY_NAME.trim(), taxId: env.BOOTSTRAP_COMPANY_TAX_ID.trim() };
}
async function bootstrap(prisma, env, { onStart = false } = {}) {
  const data = input(env);
  const passwordHash = await bcrypt.hash(data.password, 12);
  return prisma.$transaction(async tx => {
    // Serialize explicit bootstrap attempts without changing schema.
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(45104510)');
    if (onStart && await tx.user.count() === 1 && await tx.company.count() === 1) {
      const user = await tx.user.findFirst({ include: { company: true } });
      const marker = user && await tx.auditLog.findFirst({ where: { actorId: user.id, action: 'INITIAL_ADMIN_BOOTSTRAPPED', targetEntity: `User:${user.id}` }, select: { details: true } });
      if (marker?.details?.version === 1 && marker.details.companyId === user.companyId &&
          user.role === 'SUPER_ADMIN' && user.status === 'ACTIVE' && user.jobPositionCode === 'SUPER_ADMIN' &&
          user.email === data.email && user.employeeNumber === data.employeeNumber &&
          user.firstName === data.firstName && user.lastName === data.lastName &&
          user.company?.name === data.companyName && user.company?.taxId === data.taxId &&
          await bcrypt.compare(data.password, user.passwordHash)) return 'skipped';
      throw new Error('Bootstrap state mismatch');
    }
    if (await tx.user.findFirst({ where: { OR: [{ role: 'SUPER_ADMIN' }, { email: data.email }, { employeeNumber: data.employeeNumber }] }, select: { id: true } })) throw new Error('Bootstrap account/admin already exists');
    if (await tx.company.count() || await tx.user.count()) throw new Error('Bootstrap requires a fresh dedicated beta database');
    const company = await tx.company.create({ data: { name: data.companyName, taxId: data.taxId } });
    const user = await tx.user.create({ data: { email: data.email, passwordHash, firstName: data.firstName, lastName: data.lastName, employeeNumber: data.employeeNumber, companyId: company.id, role: 'SUPER_ADMIN', jobPositionCode: 'SUPER_ADMIN', status: 'ACTIVE' } });
    if (onStart) await tx.auditLog.create({ data: { actorId: user.id, action: 'INITIAL_ADMIN_BOOTSTRAPPED', targetEntity: `User:${user.id}`, details: { version: 1, companyId: company.id } } });
    return 'created';
  });
}
function safeFailure(error) { return error instanceof BootstrapInputError ? error.message : 'Bootstrap failed. Check required inputs and confirm the dedicated beta database is fresh or matches its recorded initialization. No credentials are printed.'; }
module.exports = { input, bootstrap, safeFailure };
if (require.main === module) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  bootstrap(prisma, process.env).then(() => console.log('Bootstrap completed. Remove BOOTSTRAP_* variables now.')).catch(error => { console.error(safeFailure(error)); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
