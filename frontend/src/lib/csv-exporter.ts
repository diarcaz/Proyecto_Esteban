import type { AttendancePunch } from '@/types/attendance';

export function exportPunchesToCsv(punches: AttendancePunch[], filename: string = 'time_punches_payroll_report.csv') {
  if (!punches || punches.length === 0) {
    alert('No time punch records available to export.');
    return;
  }

  // Define CSV Header Columns matching Adams Keegan / Client Layout
  const headers = [
    'LAST NAME',
    'FIRST NAME',
    'EMP NO',
    'SCHED IN',
    'ACTUAL IN',
    'SCHED OUT',
    'ACTUAL OUT',
    'LUNCH TAKEN',
    'JC_POS',
    'JC_LOC',
    'DEF DEPT',
    'HOURS',
    'STATUS',
  ];

  // Map Rows
  const rows = punches.map((p) => {
    const nameParts = p.employeeName.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    return [
      `"${lastName}"`,
      `"${firstName}"`,
      `"${p.employeeNumber}"`,
      `"${p.scheduledIn || 'N/A'}"`,
      `"${p.actualIn || 'N/A'}"`,
      `"${p.scheduledOut || 'N/A'}"`,
      `"${p.actualOut || 'ON SHIFT'}"`,
      `"${p.takenLunch ? 'YES' : 'NO'}"`,
      `"${p.jobPositionCode}"`,
      `"${p.locationCode}"`,
      '"MAIN"',
      p.calculatedHours === undefined ? 'N/A' : p.calculatedHours.toFixed(2),
      `"${p.status}"`,
    ];
  });

  // Construct CSV String
  const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

  // Trigger Browser Download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
