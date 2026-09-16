import { createHash } from 'crypto';
export async function lockPeriodReview(tx: any) {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(45104781)');
}
/** Conservative policy: any approved correction reopens this employee's reviewed periods at this property. */
export async function invalidatePeriodReviews(tx: any, userId: string, locationId: string, actorId: string) {
    const affected = await tx.timesheet.findMany({ where: { userId, locationId, status: { in: ['SUBMITTED', 'IN_REVIEW', 'APPROVED'] } }, select: { timesheetPeriodId: true } });
    const rows = await tx.timesheet.findMany({ where: { timesheetPeriodId: { in: affected.map((s: any) => s.timesheetPeriodId) }, status: { in: ['SUBMITTED', 'IN_REVIEW', 'APPROVED'] } } });
    for (const row of rows) {
        await tx.timesheet.update({ where: { id: row.id }, data: { status: 'CORRECTION_REQUIRED', currentStepOrder: 1, version: { increment: 1 } } });
        await tx.timesheetApprovalHistory.create({ data: { timesheetId: row.id, actorId, previousStatus: row.status, newStatus: 'CORRECTION_REQUIRED', stepOrder: row.currentStepOrder, notes: 'Approved time correction: review invalidated; refresh and resubmit required.' } });
        await tx.timesheetPeriod.update({ where: { id: row.timesheetPeriodId }, data: { status: 'OPEN' } });
    }
}
export function reviewDigest(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function calendarDate(at: Date, zone: string) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
    return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k)!.value).join('-');
}
/** First instant of a local calendar date, including DST midnight changes. */
export function calendarBoundary(date: string, zone: string) {
    const nominal = +new Date(date + 'T00:00:00Z');
    let lo = nominal - 2 * 86400000, hi = nominal + 2 * 86400000;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (calendarDate(new Date(mid), zone) < date)
            lo = mid + 1;
        else
            hi = mid;
    }
    return new Date(lo);
}
