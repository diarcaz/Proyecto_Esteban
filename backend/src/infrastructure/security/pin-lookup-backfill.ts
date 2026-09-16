import * as bcrypt from 'bcrypt';
import { ConflictException } from '@nestjs/common';
import { decryptPin } from './pin-encryption.util';
import { pinLookupDigest, pinLookupKeyFingerprint } from './pin-lookup';
/** Maintenance-only enrollment. Reversible data is never used by the authentication lookup. */
export async function backfillPinLookup(prisma: any, apply = false) {
  const fingerprint = pinLookupKeyFingerprint();
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(45104780)');
    const users = await tx.user.findMany({ where: { pinCodeHash: { not: null } }, select: {
      id:true,companyId:true,status:true,pinCodeHash:true,pinCodeEncrypted:true,
      employeeAssignments:{where:{active:true,OR:[{effectiveUntil:null},{effectiveUntil:{gte:new Date()}}]},select:{propertyId:true,effectiveFrom:true,effectiveUntil:true}},
    } });
    const planned: Array<{id:string;digest:string|null}> = [];
    const reservations = new Map<string,Array<{id:string;start:number;end:number}>>();
    let needsReset=0,collisions=0,invalidEncryptedRecords=0;
    for (const user of users) {
      const pin=decryptPin(user.pinCodeEncrypted);
      const valid=!!pin && /^\d{6}$/.test(pin) && await bcrypt.compare(pin,user.pinCodeHash);
      const digest=valid?pinLookupDigest(pin!):null;
      if(user.pinCodeEncrypted && !valid) invalidEncryptedRecords++;
      if(!digest) needsReset++;
      planned.push({id:user.id,digest});
      if(digest && user.status==='ACTIVE') for(const assignment of user.employeeAssignments) {
        const key=user.companyId+':'+assignment.propertyId+':'+digest;
        const rows=reservations.get(key)||[];
        const start=+new Date(assignment.effectiveFrom),end=assignment.effectiveUntil?+new Date(assignment.effectiveUntil):Infinity;
        if(rows.some(row=>row.id!==user.id && row.start<=end && row.end>=start)) collisions++;
        rows.push({id:user.id,start,end});reservations.set(key,rows);
      }
    }
    if(apply && invalidEncryptedRecords) throw new ConflictException('Encrypted PIN records could not be verified. No changes applied; check the encryption key and record integrity.');
    if(apply && collisions) throw new ConflictException('PIN enrollment conflicts detected. No changes applied; resolve duplicates through authorized PIN reset.');
    if(apply) {
      for(const entry of planned) await tx.user.update({where:{id:entry.id},data:{pinLookupDigest:entry.digest}});
      await tx.pinLookupConfig.upsert({where:{id:1},create:{id:1,keyFingerprint:fingerprint},update:{keyFingerprint:fingerprint}});
    }
    return {mode:apply?'applied':'dry-run',users:users.length,indexable:users.length-needsReset,needsAuthorizedReset:needsReset-invalidEncryptedRecords,invalidEncryptedRecords,overlappingConflicts:collisions};
  },{timeout:600000});
}
