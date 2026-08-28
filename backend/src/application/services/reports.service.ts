import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { PunchQueryDto } from '@adapters/dtos/attendance.dtos';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

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
        const hours = log.calculatedHours ? parseFloat(log.calculatedHours.toString()) : 8.0;
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

  async buildPayrollExcelBuffer(query: PunchQueryDto, allowedLocationIds?: string[]): Promise<Buffer> {
    const logs = await this.getReportPunchData(query, allowedLocationIds);

    const employeeMap = new Map<string, { user: any; regHours: number; otHours: number }>();

    for (const log of logs) {
      const user = log.user;
      if (!employeeMap.has(user.id)) {
        employeeMap.set(user.id, { user, regHours: 0, otHours: 0 });
      }
      const item = employeeMap.get(user.id)!;
      const hrs = log.calculatedHours ? parseFloat(log.calculatedHours.toString()) : 8.0;
      if (log.isOvertime || hrs > 8.0) {
        item.regHours += 8.0;
        item.otHours += Math.max(0, hrs - 8.0);
      } else {
        item.regHours += hrs;
      }
    }

    let csvContent = `EMPLOYEE NAME,RATE,HOURS,TOTAL REG,OT,TOTAL OT,BONUS,TOTAL $\n`;

    let rowIndex = 2;
    employeeMap.forEach(({ user, regHours, otHours }) => {
      const name = `"${user.firstName} ${user.lastName}"`;
      const rate = user.hourlyRate ? parseFloat(user.hourlyRate.toString()) : 20.0;
      const bonus = 0.0;

      const totalRegFormula = `=C${rowIndex}*B${rowIndex}`;
      const totalOtFormula = `=E${rowIndex}*(B${rowIndex}*1.5)`;
      const totalPayFormula = `=D${rowIndex}+F${rowIndex}+G${rowIndex}`;

      csvContent += `${name},${rate.toFixed(2)},${regHours.toFixed(2)},"${totalRegFormula}",${otHours.toFixed(
        2,
      )},"${totalOtFormula}",${bonus.toFixed(2)},"${totalPayFormula}"\n`;
      rowIndex++;
    });

    csvContent += `TOTALS,,=SUM(C2:C${rowIndex - 1}),=SUM(D2:D${rowIndex - 1}),=SUM(E2:E${rowIndex - 1}),=SUM(F2:F${
      rowIndex - 1
    }),=SUM(G2:G${rowIndex - 1}),=SUM(H2:H${rowIndex - 1})\n`;

    return Buffer.from(csvContent, 'utf-8');
  }
}
