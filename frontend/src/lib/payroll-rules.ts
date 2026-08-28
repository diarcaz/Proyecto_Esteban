// NexuStaff Labor Law Payroll Surcharge & Multiplier Engine (LFT Mexico & US FLSA Rules)

export interface PunchRecordForPayroll {
  id: string;
  userId: string;
  employeeNumber: string;
  employeeName: string;
  jobPositionCode: string;
  locationCode: string;
  calculatedHours?: number;
  isOvertime?: boolean;
  actualIn?: string;
  actualOut?: string;
  hourlyRate?: number;
  isHoliday?: boolean;
}

export interface EmployeePayrollBreakdown {
  userId: string;
  employeeNumber: string;
  employeeName: string;
  jobPositionCode: string;
  locationCode: string;
  hourlyRate: number;
  regHours: number;
  nightHours: number;
  doubleOtHours: number;
  tripleOtHours: number;
  holidayHours: number;
  regPay: number;
  nightSurchargePay: number;
  doubleOtPay: number;
  tripleOtPay: number;
  holidayPay: number;
  totalPay: number;
  netWorkedHours: number;
}

/**
 * Calculates Mexican Ley Federal del Trabajo (LFT) payroll rules & surcharges:
 * - Night Shift (20:00 - 06:00): +35% surcharge on base hourly rate.
 * - Holiday Pay (Día Festivo): 200% extra (300% total).
 * - Double Overtime (Primeras 9 hrs extra semanales): 200% rate.
 * - Triple Overtime (Excedente de 9 hrs extra semanales): 300% rate.
 */
export function calculatePayrollBreakdown(punches: PunchRecordForPayroll[]): EmployeePayrollBreakdown[] {
  const map = new Map<string, { userPunches: PunchRecordForPayroll[]; hourlyRate: number }>();

  // Group punches by employee
  for (const punch of punches) {
    if (!map.has(punch.userId)) {
      map.set(punch.userId, {
        userPunches: [],
        hourlyRate: punch.hourlyRate || 25.0, // Default $25/hr rate if unspecified
      });
    }
    map.get(punch.userId)!.userPunches.push(punch);
  }

  const results: EmployeePayrollBreakdown[] = [];

  map.forEach(({ userPunches, hourlyRate }, userId) => {
    let regHours = 0;
    let nightHours = 0;
    let totalOtHours = 0;
    let holidayHours = 0;
    let netWorkedHours = 0;

    const first = userPunches[0];

    for (const punch of userPunches) {
      const totalHrs = punch.calculatedHours !== undefined && punch.calculatedHours !== null ? punch.calculatedHours : 0;
      netWorkedHours += totalHrs;

      // Check if punch falls on a statutory holiday
      if (punch.isHoliday) {
        holidayHours += totalHrs;
      } else if (punch.isOvertime || totalHrs > 8.0) {
        regHours += Math.min(8.0, totalHrs);
        totalOtHours += Math.max(0, totalHrs - 8.0);
      } else {
        regHours += totalHrs;
      }

      // Check Night Shift overlap (e.g. 20:00 to 06:00 estimation - approx 2 hrs per night shift)
      if (punch.actualIn && (punch.actualIn.includes('PM') || punch.actualIn.includes('20:') || punch.actualIn.includes('21:'))) {
        nightHours += Math.min(totalHrs, 3.5);
      }
    }

    // LFT Overtime Split: First 9 hours = Double (200%), Exceeding 9 hours = Triple (300%)
    const doubleOtHours = Math.min(totalOtHours, 9.0);
    const tripleOtHours = Math.max(0, totalOtHours - 9.0);

    // Pay Calculations
    const regPay = regHours * hourlyRate;
    const nightSurchargePay = nightHours * (hourlyRate * 0.35); // +35% LFT Night Shift surcharge
    const doubleOtPay = doubleOtHours * (hourlyRate * 2.0); // 200% Dobles
    const tripleOtPay = tripleOtHours * (hourlyRate * 3.0); // 300% Triples
    const holidayPay = holidayHours * (hourlyRate * 3.0); // 300% Día Festivo LFT

    const totalPay = regPay + nightSurchargePay + doubleOtPay + tripleOtPay + holidayPay;

    results.push({
      userId,
      employeeNumber: first.employeeNumber,
      employeeName: first.employeeName,
      jobPositionCode: first.jobPositionCode,
      locationCode: first.locationCode,
      hourlyRate,
      regHours,
      nightHours,
      doubleOtHours,
      tripleOtHours,
      holidayHours,
      regPay,
      nightSurchargePay,
      doubleOtPay,
      tripleOtPay,
      holidayPay,
      totalPay,
      netWorkedHours,
    });
  });

  return results;
}
