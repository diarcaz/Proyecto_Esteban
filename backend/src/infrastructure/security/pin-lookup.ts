import { createHmac } from 'crypto';
import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';

export function pinLookupKey(env = process.env): Buffer {
  const key = env.PIN_LOOKUP_KEY;
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key) || key === env.PIN_ENCRYPTION_KEY || key === env.JWT_SECRET) {
    throw new ServiceUnavailableException('PIN_LOOKUP_KEY must be an independent 32-byte hex secret.');
  }
  return Buffer.from(key, 'hex');
}
export function pinLookupDigest(pin: string): string {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) throw new BadRequestException('PIN must contain exactly 6 digits.');
  return createHmac('sha256', pinLookupKey()).update('nexustaff:kiosk:pin:v1:').update(pin).digest('hex');
}
export function kioskClientDigest(address: string): string {
  if (!address) throw new ServiceUnavailableException('Clock client context unavailable.');
  return createHmac('sha256', pinLookupKey()).update('nexustaff:kiosk:client:v1:').update(address).digest('hex');
}
/** Every PIN/status/assignment mutation that can introduce a collision takes this lock first. */
export async function lockPinIndex(tx: any) {
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(45104780)');
  await assertPinLookupKey(tx, true);
}
/** Same PIN is allowed across disjoint branches or non-overlapping assignment windows. */
export async function assertNoPinConflict(tx: any, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: {
    id: true, companyId: true, status: true, pinLookupDigest: true,
    employeeAssignments: { where: { active: true, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: new Date() } }] },
      select: { propertyId: true, effectiveFrom: true, effectiveUntil: true } },
  } });
  if (!user || user.status !== 'ACTIVE' || !user.pinLookupDigest) return;
  for (const assignment of user.employeeAssignments) {
    const collision = await tx.employeeAssignment.findFirst({ where: {
      userId: { not: userId }, propertyId: assignment.propertyId, active: true,
      user: { companyId: user.companyId, status: 'ACTIVE', pinLookupDigest: user.pinLookupDigest },
      ...(assignment.effectiveUntil ? { effectiveFrom: { lte: assignment.effectiveUntil } } : {}),
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: assignment.effectiveFrom } }],
    }, select: { id: true } });
    if (collision) throw new ConflictException('PIN is already assigned to eligible staff at an overlapping branch. Choose another PIN.');
  }
}

export function pinLookupKeyFingerprint(): string {
  return createHmac('sha256', pinLookupKey()).update('nexustaff:kiosk:key-id:v1').digest('hex');
}
export async function assertPinLookupKey(db: any, initialize = false) {
  const fingerprint = pinLookupKeyFingerprint();
  const configured = await db.pinLookupConfig.findUnique({ where: { id: 1 } });
  if (!configured && initialize) {
    if (await db.user.count({ where: { pinLookupDigest: { not: null } } })) throw new ServiceUnavailableException('PIN index requires operator reconciliation.');
    await db.pinLookupConfig.create({ data: { id: 1, keyFingerprint: fingerprint } });
    return;
  }
  if (configured?.keyFingerprint !== fingerprint) throw new ServiceUnavailableException('PIN lookup enrollment or key reconciliation is required.');
}
