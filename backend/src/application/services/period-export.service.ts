import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { resolvePropertyReadScope } from '@domain/security/property-read-scope';
import { Permission } from '@domain/permissions/permission.enum';
import { PeriodExportDto } from '@adapters/dtos/period-export.dto';

const DAY = 86400000;
export function exportPeriod(query: PeriodExportDto) {
  const parse = (value?: string) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('A valid calendar date is required.');
    const date = new Date(value + 'T00:00:00.000Z');
    if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('Invalid calendar date.');
    return date;
  };
  const start = parse(query.start_date);
  if (!['custom','weekly','biweekly'].includes(query.period)) throw new BadRequestException('Select a supported period type.');
  const end = query.period === 'custom' ? parse(query.end_date) : new Date(+start + (query.period === 'weekly' ? 6 : 13) * DAY);
  if (end < start || +end - +start > 365 * DAY) throw new BadRequestException('Select an ordered period of at most 366 days.');
  if (query.period !== 'custom' && query.end_date && query.end_date !== end.toISOString().slice(0,10)) throw new BadRequestException('End date conflicts with selected period type.');
  return { start: query.start_date, end: end.toISOString().slice(0,10), lower: new Date(+start - 2 * DAY), upper: new Date(+end + 3 * DAY) };
}
export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n;]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
function localDate(date: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year','month','day'].map(key => parts.find(p=>p.type===key)!.value).join('-');
}
const identity = { id: true, firstName: true, lastName: true, employeeNumber: true };
const correctionSelect = { id: true, status: true };
const select = {
  id:true,userId:true,locationId:true,clockInTimestamp:true,clockOutTimestamp:true,effectiveClockIn:true,effectiveClockOut:true,
  regularMinutes:true,overtimeMinutes:true,status:true,
  user:{select:identity}, location:{select:{id:true,name:true,locationCode:true,timezone:true,company:{select:{id:true,name:true}}}},
  department:{select:{name:true}},position:{select:{title:true}},
  logs:{select:{id:true,punchType:true,timestamp:true,effectiveTimestamp:true,corrections:{select:correctionSelect}}},
  timeCorrections:{select:correctionSelect},
};
function correctionRows(shift: any): any[] {
  return [...new Map([...shift.timeCorrections,...shift.logs.flatMap((log:any)=>log.corrections)].map((c:any)=>[c.id,c])).values()];
}
function approval(shift: any, sheets: any[]) {
  const at = shift.effectiveClockIn || shift.clockInTimestamp;
  const matching = sheets.filter(s=>s.userId===shift.userId && s.locationId===shift.locationId && s.period.locationId===shift.locationId && s.period.startDate<=at && s.period.endDate>=at);
  if (matching.length !== 1) return { status: matching.length ? 'AMBIGUOUS' : 'NOT_AVAILABLE', approver: '' };
  const sheet = matching[0];
  const last = sheet.approvalHistory[0];
  return { status: sheet.status, approver: sheet.status==='APPROVED' && last?.newStatus==='APPROVED' ? [last.actor?.firstName,last.actor?.lastName].filter(Boolean).join(' ') : '' };
}
function minutes(shift: any): number | null {
  if (shift.status !== 'COMPLETED' || !(shift.effectiveClockOut || shift.clockOutTimestamp) || shift.regularMinutes == null || shift.overtimeMinutes == null) return null;
  return shift.regularMinutes + shift.overtimeMinutes;
}
@Injectable()
export class PeriodExportService {
  constructor(private readonly prisma: PrismaService) {}
  async csv(kind: 'detail' | 'summary', query: PeriodExportDto, actor: any, headers: Record<string,any> = {}): Promise<Buffer> {
    const period = exportPeriod(query);
    return this.prisma.$transaction(async db => {
      const properties = await resolvePropertyReadScope(db, actor, query, headers, Permission.TIME_VIEW);
      const locationId = { in: properties.map(p=>p.id) };
      const scope = { locationId, ...(actor.role==='SUPER_ADMIN' ? {} : { location:{companyId:actor.companyId} }) };
      // Verify orphan punches rather than silently omitting recorded evidence without a WorkShift.
      let orphanCursor: string | undefined;
      for (;;) {
        const rows = await db.attendanceLog.findMany({ where:{...scope,workShiftId:null,timestamp:{gte:period.lower,lt:period.upper}}, select:{id:true,timestamp:true,location:{select:{timezone:true}}}, orderBy:{id:'asc'}, take:500, ...(orphanCursor?{cursor:{id:orphanCursor},skip:1}:{}) });
        if(!rows.length) break;
        for(const row of rows){const date=localDate(row.timestamp,row.location.timezone);if(date>=period.start&&date<=period.end)throw new ConflictException('Selected period contains attendance without a canonical WorkShift. Reconcile these records before exporting.');}
        orphanCursor=rows[rows.length-1].id;
      }
      const sheets = await db.timesheet.findMany({where:{...scope,period:{startDate:{lt:period.upper},endDate:{gte:period.lower}}},select:{userId:true,locationId:true,status:true,period:{select:{locationId:true,startDate:true,endDate:true}},approvalHistory:{orderBy:{createdAt:'desc'},take:1,select:{newStatus:true,actor:{select:{firstName:true,lastName:true}}}}}});
      const detail: unknown[][] = [['Company','Property','Property Code','Department','Position','Staff Name','Staff Number','Work Date','Clock In (UTC)','Lunch 1 Start (UTC)','Lunch 1 End (UTC)','Lunch 2 Start (UTC)','Lunch 2 End (UTC)','Clock Out (UTC)','Worked Minutes','Worked Hours','Shift Status','Correction Status','Approval Status','Approver','Timezone','Raw Clock In (UTC)','Raw Clock Out (UTC)']];
      const groups = new Map<string,any>();
      let cursor: string | undefined;
      for (;;) {
        const shifts = await db.workShift.findMany({where:{...scope,OR:[{effectiveClockIn:{gte:period.lower,lt:period.upper}},{effectiveClockIn:null,clockInTimestamp:{gte:period.lower,lt:period.upper}}]},select,orderBy:{id:'asc'},take:500,...(cursor?{cursor:{id:cursor},skip:1}:{})});
        if (!shifts.length) break;
        for (const shift of shifts) {
          const day = localDate(shift.effectiveClockIn || shift.clockInTimestamp,shift.location.timezone);
          if (day < period.start || day > period.end) continue;
          const worked = minutes(shift), corrections=correctionRows(shift), approved=approval(shift,sheets);
          const stamp=(date:Date|null)=>date?.toISOString() || '';
          const punch=(type:string)=>{const logs=shift.logs.filter(l=>l.punchType===type);return logs.length===1?stamp(logs[0].effectiveTimestamp||logs[0].timestamp):logs.length?'AMBIGUOUS':'';};
          if(kind==='detail') detail.push([shift.location.company.name,shift.location.name,shift.location.locationCode,shift.department?.name,shift.position?.title,shift.user.firstName+' '+shift.user.lastName,shift.user.employeeNumber,day,stamp(shift.effectiveClockIn||shift.clockInTimestamp),punch('LUNCH_START'),punch('LUNCH_END'),punch('LUNCH2_START'),punch('LUNCH2_END'),stamp(shift.effectiveClockOut||shift.clockOutTimestamp),worked,worked===null?'':(worked/60).toFixed(4),shift.status,[...new Set(corrections.map(c=>c.status))].sort().join('; ')||'NONE',approved.status,approved.approver,shift.location.timezone,stamp(shift.clockInTimestamp),stamp(shift.clockOutTimestamp)]);
          let group=groups.get(shift.userId);
          if(!group){group={company:shift.location.company.name,properties:new Set<string>(),name:shift.user.firstName+' '+shift.user.lastName,number:shift.user.employeeNumber,minutes:0,complete:0,incomplete:0,corrections:new Set<string>(),approvals:new Set<string>()};groups.set(shift.userId,group);}
          group.properties.add(shift.location.name+' ['+shift.location.locationCode+']');
          if(worked===null) group.incomplete++; else {group.minutes+=worked;group.complete++;}
          corrections.forEach(c=>group.corrections.add(c.id));group.approvals.add(approved.status);
        }
        cursor=shifts[shifts.length-1].id;
      }
      const summary: unknown[][] = [['Company','Property','Staff Name','Staff Number','Period Start','Period End','Worked Minutes','Worked Hours','Incomplete Shift Count','Correction Count','Approval Status','Totals Basis']];
      for(const group of groups.values()) summary.push([group.company,[...group.properties].sort().join('; '),group.name,group.number,period.start,period.end,group.complete?group.minutes:'',group.complete?(group.minutes/60).toFixed(4):'',group.incomplete,group.corrections.size,[...group.approvals].sort().join('; '),group.incomplete?'PARTIAL_COMPLETED_SHIFTS_ONLY':'COMPLETED_SHIFTS']);
      return Buffer.from((kind==='detail'?detail:summary).map(row=>row.map(csvCell).join(',')).join('\r\n'),'utf8');
    }, { isolationLevel: 'RepeatableRead', timeout: 60000 });
  }
}
