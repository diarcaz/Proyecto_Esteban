import { Injectable, BadRequestException, ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { AuthorizationService } from '@domain/security/authorization.service';
import { Permission } from '@domain/permissions/permission.enum';
import { exportPeriod } from './period-export.service';
import { calendarBoundary, calendarDate, lockPeriodReview, reviewDigest } from './period-review-state';
const ADMIN_ROLES = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'LOCATION_ADMIN', 'SUPERVISOR'];
@Injectable()
export class PeriodApprovalService {
    constructor(private readonly prisma: PrismaService, private readonly authz: AuthorizationService) { }
    private async property(db: any, id: string, actor: any, permission: Permission) {
        if (!actor || !ADMIN_ROLES.includes(actor.role))
            throw new ForbiddenException('Administrator access required.');
        const property = await db.location.findUnique({ where: { id }, select: { id: true, companyId: true, name: true, timezone: true } });
        if (!property)
            throw new NotFoundException('Property not found.');
        this.authz.assertPropertyAccess(actor, property.id, property.companyId);
        this.authz.assertPermission(actor, permission, property.id, property.companyId);
        return property;
    }
    private async period(db: any, id: string, actor: any, permission: Permission) {
        const period = await db.timesheetPeriod.findUnique({ where: { id } });
        if (!period)
            throw new NotFoundException('Period not found.');
        const property = await this.property(db, period.locationId, actor, permission);
        return { period, property };
    }
    private async workflow(db: any, locationId: string) {
        const rows = await db.approvalWorkflow.findMany({ where: { locationId, active: true }, include: { steps: { orderBy: { stepOrder: 'asc' } } } });
        if (rows.length !== 1 || !rows[0].steps.length)
            throw new ConflictException('Exactly one configured active approval workflow is required.');
        const steps = rows[0].steps.map((s: any) => ({ id: s.id, stepOrder: s.stepOrder, stepName: s.stepName, approverRole: s.approverRole, approverUserId: s.approverUserId }));
        if (steps.some((s: any, i: number) => s.stepOrder !== i + 1 || (!s.approverRole && !s.approverUserId)))
            throw new ConflictException('Workflow steps must be consecutive and name an approver role or user.');
        return { id: rows[0].id, steps };
    }
    private async source(db: any, period: any) {
        const shifts = await db.workShift.findMany({ where: { locationId: period.locationId, OR: [{ effectiveClockIn: { gte: period.startDate, lte: period.endDate } }, { effectiveClockIn: null, clockInTimestamp: { gte: period.startDate, lte: period.endDate } }] }, orderBy: { id: 'asc' }, select: { id: true, userId: true, status: true, clockInTimestamp: true, clockOutTimestamp: true, effectiveClockIn: true, effectiveClockOut: true, regularMinutes: true, overtimeMinutes: true, user: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } }, timeCorrections: { orderBy: { id: 'asc' }, select: { id: true, status: true, requestedTimestamp: true } }, logs: { orderBy: { id: 'asc' }, select: { id: true, punchType: true, timestamp: true, effectiveTimestamp: true, corrections: { orderBy: { id: 'asc' }, select: { id: true, status: true, requestedTimestamp: true } } } } } });
        const orphan = await db.attendanceLog.count({ where: { locationId: period.locationId, workShiftId: null, timestamp: { gte: period.startDate, lte: period.endDate } } });
        const groups = new Map<string, any>();
        for (const shift of shifts) {
            let row = groups.get(shift.userId);
            if (!row) {
                row = { user: shift.user, regularMinutes: 0, overtimeMinutes: 0, incompleteShifts: 0, corrections: new Map(), shifts: [] };
                groups.set(shift.userId, row);
            }
            if (shift.status !== 'COMPLETED' || !(shift.effectiveClockOut || shift.clockOutTimestamp) || shift.regularMinutes == null || shift.overtimeMinutes == null)
                row.incompleteShifts++;
            else {
                row.regularMinutes += shift.regularMinutes;
                row.overtimeMinutes += shift.overtimeMinutes;
            }
            [...shift.timeCorrections, ...shift.logs.flatMap(l => l.corrections)].forEach(c => row.corrections.set(c.id, c));
            row.shifts.push(shift);
        }
        return { orphan, groups: [...groups.values()].map(g => ({ ...g, workedMinutes: g.regularMinutes + g.overtimeMinutes, pendingCorrections: [...g.corrections.values()].filter((c: any) => c.status === 'PENDING').length, correctionCount: g.corrections.size, digest: reviewDigest(g.shifts) })) };
    }
    async configure(locationId: string, steps: any[], actor: any) {
        return this.prisma.$transaction(async (tx) => {
            await lockPeriodReview(tx);
            await this.property(tx, locationId, actor, Permission.PROPERTY_MANAGE);
            if (!['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(actor.role))
                throw new ForbiddenException('Company administrator required.');
            if (!Array.isArray(steps) || !steps.length || steps.length > 10)
                throw new BadRequestException('Provide one to ten ordered steps.');
            const data = [];
            for (let i = 0; i < steps.length; i++) {
                const s = steps[i];
                if (!s || typeof s.stepName !== 'string' || !s.stepName.trim() || s.stepName.length > 100 || (!s.approverRole && !s.approverUserId) || (s.approverRole && !ADMIN_ROLES.includes(s.approverRole)))
                    throw new BadRequestException('Invalid approval step.');
                if (s.approverUserId) {
                    const u = await tx.user.findUnique({ where: { id: s.approverUserId }, select: { companyId: true, role: true, status: true } });
                    if (!u || u.status !== 'ACTIVE' || !ADMIN_ROLES.includes(u.role) || (u.role !== 'SUPER_ADMIN' && u.companyId !== (await tx.location.findUnique({ where: { id: locationId } }))!.companyId))
                        throw new BadRequestException('Invalid step approver.');
                }
                data.push({ stepOrder: i + 1, stepName: s.stepName.trim(), approverRole: s.approverRole || null, approverUserId: s.approverUserId || null });
            }
            await tx.approvalWorkflow.updateMany({ where: { locationId, active: true }, data: { active: false } });
            const workflow = await tx.approvalWorkflow.create({ data: { locationId, name: 'Period review', steps: { create: data } }, include: { steps: true } });
            await tx.auditLog.create({ data: { actorId: actor.id, action: 'PERIOD_WORKFLOW_CONFIGURED', targetEntity: 'ApprovalWorkflow:' + workflow.id, details: { locationId, steps: data.length } } });
            return workflow;
        });
    }
    async resolve(locationId: string, start: string, type: 'weekly' | 'biweekly', actor: any) {
        if (!['weekly', 'biweekly'].includes(type))
            throw new BadRequestException('Select weekly or biweekly.');
        const dates = exportPeriod({ period: type, start_date: start });
        return this.prisma.$transaction(async (tx) => {
            await lockPeriodReview(tx);
            const property = await this.property(tx, locationId, actor, Permission.TIME_VIEW);
            const startDate = calendarBoundary(dates.start, property.timezone);
            const next = new Date(new Date(dates.end + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
            const endDate = new Date(+calendarBoundary(next, property.timezone) - 1);
            const overlapping = await tx.timesheetPeriod.findMany({ where: { locationId, startDate: { lte: endDate }, endDate: { gte: startDate } } });
            if (overlapping.length === 1 && +overlapping[0].startDate === +startDate && +overlapping[0].endDate === +endDate && overlapping[0].periodType === type.toUpperCase())
                return overlapping[0];
            if (overlapping.length)
                throw new ConflictException('An overlapping period already exists. Review that period instead.');
            return tx.timesheetPeriod.create({ data: { locationId, startDate, endDate, periodType: type.toUpperCase() } });
        });
    }
    async list(locationId: string, actor: any) { const property = await this.property(this.prisma, locationId, actor, Permission.TIME_VIEW); const rows = await this.prisma.timesheetPeriod.findMany({ where: { locationId }, orderBy: { startDate: 'desc' }, take: 100 }); return rows.map(p => ({ ...p, startDateLabel: calendarDate(p.startDate, property.timezone), endDateLabel: calendarDate(p.endDate, property.timezone) })); }
    async review(id: string, actor: any) {
        return this.prisma.$transaction(async (tx) => {
            const { period, property } = await this.period(tx, id, actor, Permission.TIME_VIEW), source = await this.source(tx, period);
            const sheets = await tx.timesheet.findMany({ where: { timesheetPeriodId: id }, include: { approvalHistory: { orderBy: { createdAt: 'desc' }, include: { actor: { select: { firstName: true, lastName: true } } } } } });
            const groups = new Map(source.groups.map(g => [g.user.id, g]));
            for (const sheet of sheets)
                if (!groups.has(sheet.userId)) {
                    const user = await tx.user.findUnique({ where: { id: sheet.userId }, select: { id: true, firstName: true, lastName: true, employeeNumber: true } });
                    groups.set(sheet.userId, { user, workedMinutes: 0, incompleteShifts: 0, pendingCorrections: 0, correctionCount: 0, digest: reviewDigest([]) });
                }
            return { period, property, orphanAttendance: source.orphan, canSubmit: this.authz.hasPermission(actor, Permission.TIME_APPROVE, property.id, property.companyId), rows: [...groups.values()].map(g => {
                    const s = sheets.find(s => s.userId === g.user.id), snapshot: any = s?.reviewSnapshot;
                    return { staff: g.user, workedMinutes: g.workedMinutes, workedHours: g.workedMinutes / 60, incompleteShifts: g.incompleteShifts, correctionCount: g.correctionCount, pendingCorrections: g.pendingCorrections, timesheetId: s?.id || null, status: s?.status || 'DRAFT', version: s?.version || 0, currentStepOrder: s?.currentStepOrder || 1, steps: snapshot?.workflow?.steps || [], stale: !!snapshot && snapshot.digest !== g.digest, history: s?.approvalHistory || [] };
                }), reviewToken: reviewDigest({ source: source.groups.map(g => [g.user.id, g.digest]), sheets: sheets.map(s => [s.id, s.version]).sort(), orphan: source.orphan }) };
        }, { isolationLevel: 'RepeatableRead', timeout: 60000 });
    }
    async submit(id: string, token: string, actor: any) {
        return this.prisma.$transaction(async (tx) => {
            await lockPeriodReview(tx);
            const { period } = await this.period(tx, id, actor, Permission.TIME_APPROVE);
            if (period.endDate >= new Date())
                throw new ConflictException('Only completed calendar periods may be submitted.');
            const source = await this.source(tx, period), sheets = await tx.timesheet.findMany({ where: { timesheetPeriodId: id } });
            const expected = reviewDigest({ source: source.groups.map(g => [g.user.id, g.digest]), sheets: sheets.map(s => [s.id, s.version]).sort(), orphan: source.orphan });
            if (token !== expected)
                throw new ConflictException('Review changed. Refresh before submitting.');
            if (source.orphan || !source.groups.length || source.groups.some(g => g.incompleteShifts || g.pendingCorrections))
                throw new ConflictException('Resolve missing shifts and pending corrections before submitting.');
            if (sheets.some(s => ['SUBMITTED', 'IN_REVIEW', 'APPROVED'].includes(s.status)))
                throw new ConflictException('Period already contains submitted or approved timesheets.');
            const workflow = await this.workflow(tx, period.locationId);
            // Preserve historical empty membership after a clock-in correction moved all shifts to another period.
            for (const s of sheets)
                if (!source.groups.some(g => g.user.id === s.userId))
                    source.groups.push({ user: { id: s.userId }, regularMinutes: 0, overtimeMinutes: 0, workedMinutes: 0, digest: reviewDigest([]) });
            for (const group of source.groups) {
                const previous = sheets.find(s => s.userId === group.user.id);
                const data = { regularHours: group.regularMinutes / 60, overtimeHours: group.overtimeMinutes / 60, totalHours: group.workedMinutes / 60, status: 'SUBMITTED' as const, currentStepOrder: 1, reviewSnapshot: { digest: group.digest, workflow, workedMinutes: group.workedMinutes, regularMinutes: group.regularMinutes, overtimeMinutes: group.overtimeMinutes, shiftIds: (group.shifts || []).map((s: any) => s.id) }, version: { increment: 1 } };
                const sheet = previous ? await tx.timesheet.update({ where: { id: previous.id }, data }) : await tx.timesheet.create({ data: { ...data, version: 1, userId: group.user.id, locationId: period.locationId, timesheetPeriodId: id } });
                await tx.timesheetApprovalHistory.create({ data: { timesheetId: sheet.id, actorId: actor.id, previousStatus: previous?.status || 'DRAFT', newStatus: 'SUBMITTED', stepOrder: 1, notes: 'Period submitted for configured review.' } });
            }
            await tx.timesheetPeriod.update({ where: { id }, data: { status: 'PROCESSING' } });
            return { success: true };
        }, { timeout: 60000 });
    }
    async transition(id: string, version: number, action: string, notes: string, actor: any) {
        return this.prisma.$transaction(async (tx) => {
            await lockPeriodReview(tx);
            const sheet = await tx.timesheet.findUnique({ where: { id } });
            if (!sheet)
                throw new NotFoundException('Timesheet not found.');
            const { period } = await this.period(tx, sheet.timesheetPeriodId, actor, Permission.TIME_APPROVE);
            if (sheet.locationId !== period.locationId)
                throw new ForbiddenException('Timesheet property mismatch.');
            if (sheet.version !== version || !['SUBMITTED', 'IN_REVIEW'].includes(sheet.status))
                throw new ConflictException('Stale or already reviewed timesheet. Refresh review.');
            if (!['APPROVE', 'REJECT', 'CORRECTION_REQUIRED'].includes(action) || typeof notes !== 'string' || notes.length > 2000 || (action !== 'APPROVE' && !notes.trim()))
                throw new BadRequestException('Valid action and review notes are required.');
            const snapshot: any = sheet.reviewSnapshot, step = snapshot?.workflow?.steps?.find((s: any) => s.stepOrder === sheet.currentStepOrder);
            if (!step)
                throw new ConflictException('Review configuration unavailable; resubmission required.');
            if ((step.approverUserId && actor.id !== step.approverUserId) || (step.approverRole && actor.role !== step.approverRole))
                throw new ForbiddenException('Only the configured approver may act at this step.');
            const source = await this.source(tx, period), group = source.groups.find(g => g.user.id === sheet.userId);
            if (action === 'APPROVE' && (source.orphan || group?.incompleteShifts || group?.pendingCorrections || (group?.digest || reviewDigest([])) !== snapshot.digest))
                throw new ConflictException('Source attendance changed; correction and resubmission required.');
            const next = snapshot.workflow.steps.find((s: any) => s.stepOrder === sheet.currentStepOrder + 1);
            const status = action === 'APPROVE' ? (next ? 'IN_REVIEW' : 'APPROVED') : action === 'REJECT' ? 'REJECTED' : 'CORRECTION_REQUIRED';
            const changed = await tx.timesheet.updateMany({ where: { id, version }, data: { status, currentStepOrder: next && action === 'APPROVE' ? next.stepOrder : sheet.currentStepOrder, version: { increment: 1 } } });
            if (changed.count !== 1)
                throw new ConflictException('Concurrent review changed.');
            await tx.timesheetApprovalHistory.create({ data: { timesheetId: id, actorId: actor.id, previousStatus: sheet.status, newStatus: status, stepOrder: sheet.currentStepOrder, notes: notes.trim() || null } });
            if (['REJECTED', 'CORRECTION_REQUIRED'].includes(status)) {
                // Resubmission is whole-period: reopen peers, retaining history, so no approval survives a rejected period.
                const peers = await tx.timesheet.findMany({ where: { timesheetPeriodId: period.id, id: { not: id }, status: { in: ['SUBMITTED', 'IN_REVIEW', 'APPROVED'] } } });
                for (const peer of peers) {
                    await tx.timesheet.update({ where: { id: peer.id }, data: { status: 'CORRECTION_REQUIRED', version: { increment: 1 }, currentStepOrder: 1 } });
                    await tx.timesheetApprovalHistory.create({ data: { timesheetId: peer.id, actorId: actor.id, previousStatus: peer.status, newStatus: 'CORRECTION_REQUIRED', stepOrder: peer.currentStepOrder, notes: 'Period returned for revision.' } });
                }
            }
            const remaining = await tx.timesheet.count({ where: { timesheetPeriodId: period.id, status: { not: 'APPROVED' } } });
            await tx.timesheetPeriod.update({ where: { id: period.id }, data: { status: remaining ? (['REJECTED', 'CORRECTION_REQUIRED'].includes(status) ? 'OPEN' : 'PROCESSING') : 'CLOSED' } });
            return { success: true, status };
        }, { timeout: 60000 });
    }
}
