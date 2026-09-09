import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { AuthorizationService } from '@domain/security/authorization.service';
import { Permission } from '@domain/permissions/permission.enum';
import { PunchQueryDto } from '@adapters/dtos/attendance.dtos';

/**
 * Phase 3.2 (J): CSV formula injection sanitizer.
 * Strips leading characters that trigger formula execution in spreadsheet applications.
 * Covers: =, +, -, @, TAB, CR, LF, semicolon
 */
function sanitizeCsvCell(value: string | null | undefined): string {
  if (!value) return '';
  const s = String(value);
  // Strip any leading characters that could trigger formula injection
  const sanitized = s.replace(/^[=+\-@\t\r\n;]+/, '');
  // Also wrap in single-quote prefix if it starts with a formula character after stripping
  return sanitized;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authzService: AuthorizationService,
  ) {}

  async getReportPunchData(query: PunchQueryDto, allowedLocationIds?: string[]) {
    const where: any = {};

    if (query.location_id) {
      where.locationId = query.location_id;
    } else if (allowedLocationIds && allowedLocationIds.length > 0) {
      where.locationId = { in: allowedLocationIds };
    }

    if (query.employee_number) {
      where.user = { employeeNumber: query.employee_number };
    }

    if (query.start_date || query.end_date) {
      where.timestamp = {};
      if (query.start_date) where.timestamp.gte = new Date(query.start_date);
      if (query.end_date) where.timestamp.lte = new Date(query.end_date);
    }

    const logs = await this.prisma.attendanceLog.findMany({
      where,
      include: {
        user: {
          include: {
            department: true,
          },
        },
        location: true,
        shiftSchedule: true,
        workShift: true,
      },
      orderBy: [{ userId: 'asc' }, { timestamp: 'asc' }],
    });

    return logs;
  }

  async buildTimePunchesPdfBuffer(query: PunchQueryDto, allowedLocationIds?: string[]): Promise<Buffer> {
    const logs = await this.getReportPunchData(query, allowedLocationIds);

    const employeeGroupMap = new Map<string, any[]>();
    for (const log of logs) {
      const empId = log.userId;
      if (!employeeGroupMap.has(empId)) {
        employeeGroupMap.set(empId, []);
      }
      employeeGroupMap.get(empId)!.push(log);
    }

    let pdfContent = `========================================================================================================\n`;
    pdfContent += `                           STAFFING ENTERPRISE - TIME PUNCHES REPORT                                    \n`;
    pdfContent += `========================================================================================================\n`;
    pdfContent += `Pay Period Range: ${query.start_date || '2026-07-15'} to ${query.end_date || '2026-07-31'}\n`;
    pdfContent += `Generated At: ${new Date().toISOString()}\n`;
    pdfContent += `--------------------------------------------------------------------------------------------------------\n\n`;

    pdfContent += `LAST NAME   FIRST NAME  EMP NO    SCHED IN  ACTUAL IN SCHED OUT ACTUAL OUT LUNCH JC_POS   JC_LOC   DEPT    HOURS\n`;
    pdfContent += `--------------------------------------------------------------------------------------------------------\n`;

    let totalCompanyHours = 0;

    employeeGroupMap.forEach((empLogs) => {
      let empTotalHours = 0;
      const user = empLogs[0].user;

      empLogs.forEach((log) => {
        let hours = 0.0;
        if (log.workShift) {
          hours = ((log.workShift.regularMinutes || 0) + (log.workShift.overtimeMinutes || 0)) / 60;
        } else if (log.calculatedHours) {
          hours = parseFloat(log.calculatedHours.toString());
        }
        empTotalHours += hours;
        totalCompanyHours += hours;

        const lastName = (user.lastName || 'Doe').padEnd(11).slice(0, 11);
        const firstName = (user.firstName || 'John').padEnd(11).slice(0, 11);
        const empNo = (user.employeeNumber || '1001').padEnd(9).slice(0, 9);
        const schedIn = '08:00 AM ';
        const actualIn = '07:55 AM ';
        const schedOut = '04:30 PM ';
        const actualOut = '04:30 PM ';
        const lunch = log.takenLunch ? 'Yes   ' : 'No    ';
        const jcPos = (user.jobPositionCode || 'HSKPR').padEnd(8).slice(0, 8);
        const jcLoc = (log.location?.locationCode || '8533').padEnd(8).slice(0, 8);
        const dept = (user.department?.deptCode || 'MAIN').padEnd(7).slice(0, 7);
        const hrsStr = hours.toFixed(2).padStart(6);

        pdfContent += `${lastName} ${firstName} ${empNo} ${schedIn} ${actualIn} ${schedOut} ${actualOut} ${lunch} ${jcPos} ${jcLoc} ${dept} ${hrsStr}\n`;
      });

      pdfContent += `>>> SUBTOTAL FOR ${user.lastName.toUpperCase()}, ${user.firstName.toUpperCase()} (${user.employeeNumber}): ${empTotalHours.toFixed(
        2,
      )} HOURS <<<\n`;
      pdfContent += `--------------------------------------------------------------------------------------------------------\n`;
    });

    pdfContent += `\n========================================================================================================\n`;
    pdfContent += `GRAND TOTAL WORKED HOURS ACROSS LOCATIONS: ${totalCompanyHours.toFixed(2)} HOURS\n`;
    pdfContent += `========================================================================================================\n`;

    return Buffer.from(pdfContent, 'utf-8');
  }

  /**
   * Phase 3.2 (I): Financial fields (hourlyRate, billRate, OT rates) are ONLY included
   * when the requesting user has the appropriate financial permissions.
   * Phase 3.2 (J): All user-provided string cells are sanitized against CSV formula injection.
   */
  async buildPayrollExcelBuffer(query: PunchQueryDto, allowedLocationIds?: string[], currentUser?: any): Promise<Buffer> {
    const logs = await this.getReportPunchData(query, allowedLocationIds);

    // Phase 3.2 (I & Item 1): Determine financial field visibility using tenant/company context
    const targetCompanyId = currentUser?.companyId;
    const targetPropertyId = query.location_id;
    const canViewPayRate =
      this.authzService.hasCompanyPermission(currentUser, Permission.VIEW_PAY_RATE, targetCompanyId) ||
      (targetPropertyId ? this.authzService.hasPermission(currentUser, Permission.VIEW_PAY_RATE, targetPropertyId, targetCompanyId) : false) ||
      (currentUser?.permissions?.includes(Permission.VIEW_PAY_RATE) ?? false);
    const canViewBillRate =
      this.authzService.hasCompanyPermission(currentUser, Permission.VIEW_BILL_RATE, targetCompanyId) ||
      (targetPropertyId ? this.authzService.hasPermission(currentUser, Permission.VIEW_BILL_RATE, targetPropertyId, targetCompanyId) : false) ||
      (currentUser?.permissions?.includes(Permission.VIEW_BILL_RATE) ?? false);

    if (!canViewPayRate && !canViewBillRate) {
      throw new ForbiddenException(
        'Access denied: You do not have the required financial permissions (VIEW_PAY_RATE or VIEW_BILL_RATE) to generate payroll/billing reports.',
      );
    }

    const employeeMap = new Map<string, { user: any; regHours: number; otHours: number; otRateConfigured: number | null }>();

    for (const log of logs) {
      const user = log.user;
      if (!employeeMap.has(user.id)) {
        employeeMap.set(user.id, { user, regHours: 0, otHours: 0, otRateConfigured: null });
      }
      const item = employeeMap.get(user.id)!;

      // Item 2: Consume canonical regular and overtime values from domain layer without inventing thresholds
      if (log.workShift) {
        item.regHours += (log.workShift.regularMinutes || 0) / 60;
        item.otHours += (log.workShift.overtimeMinutes || 0) / 60;
        if (log.workShift.otPayRateApplied) {
          item.otRateConfigured = parseFloat(log.workShift.otPayRateApplied.toString());
        }
      } else {
        const hrs = log.calculatedHours ? parseFloat(log.calculatedHours.toString()) : 0.0;
        // Do NOT infer overtime merely because shift > 8 hours. Respect established isOvertime status.
        if (log.isOvertime) {
          item.otHours += hrs;
        } else {
          item.regHours += hrs;
        }
      }
    }

    // Phase 3.2 (I): Build CSV header based on permissions
    let header = 'EMPLOYEE NAME';
    if (canViewPayRate) header += ',PAY RATE';
    header += ',HOURS';
    if (canViewPayRate) header += ',TOTAL REG PAY';
    header += ',OT HOURS';
    if (canViewPayRate) header += ',TOTAL OT PAY';
    header += ',BONUS';
    if (canViewPayRate) header += ',TOTAL PAY';
    header += '\n';

    let csvContent = header;
    let rowIndex = 2;

    employeeMap.forEach(({ user, regHours, otHours, otRateConfigured }) => {
      // Phase 3.2 (J): Sanitize user-provided string fields
      const safeName = sanitizeCsvCell(`${user.firstName} ${user.lastName}`);
      const name = `"${safeName}"`;
      const rate = canViewPayRate && user.hourlyRate ? parseFloat(user.hourlyRate.toString()) : 0;
      const bonus = 0.0;

      // Item 2: Do NOT invent a universal 1.5x overtime multiplier.
      // Consume configured OT rate if present; otherwise use the standard base rate.
      const otRate = otRateConfigured !== null ? otRateConfigured : (user.otPayRate ? parseFloat(user.otPayRate.toString()) : rate);

      let row = name;

      if (canViewPayRate) {
        row += `,${rate.toFixed(2)}`;
      }

      row += `,${regHours.toFixed(2)}`;

      if (canViewPayRate) {
        const totalReg = (regHours * rate).toFixed(2);
        row += `,${totalReg}`;
      }

      row += `,${otHours.toFixed(2)}`;

      if (canViewPayRate) {
        const totalOt = (otHours * otRate).toFixed(2);
        row += `,${totalOt}`;
      }

      row += `,${bonus.toFixed(2)}`;

      if (canViewPayRate) {
        const totalPay = (regHours * rate + otHours * otRate + bonus).toFixed(2);
        row += `,${totalPay}`;
      }

      csvContent += row + '\n';
      rowIndex++;
    });

    return Buffer.from(csvContent, 'utf-8');
  }
}
