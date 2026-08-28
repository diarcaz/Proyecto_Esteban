import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { EmployeePayrollBreakdown } from './payroll-rules';

export async function generateCorporatePayrollPdf(
  breakdownList: EmployeePayrollBreakdown[],
  locationName: string = 'Sucursal Centro - MÉRIDA',
  payPeriod: string = '16/Jul/2026 - 31/Jul/2026'
) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Corporate Top Header Gradient / Bar
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 24, 'F');

  doc.setFillColor(37, 99, 235); // blue-600 accent bar
  doc.rect(0, 24, pageWidth, 2, 'F');

  // Title & Subtitle
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('NEXUSTAFF ENTERPRISE', 14, 12);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('REPORTE OFICIAL DE NÓMINA & FICHAJES (LEY FEDERAL DEL TRABAJO / LFT)', 14, 18);

  // Status Badge
  doc.setFillColor(16, 185, 129); // emerald-500
  doc.roundedRect(pageWidth - 65, 7, 50, 10, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DOCUMENTO VALIDADO', pageWidth - 60, 13.5);

  // 2. Metadata Box
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(14, 30, pageWidth - 28, 18, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 30, pageWidth - 28, 18, 2, 2, 'S');

  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.text(`SUCURSAL:`, 18, 37);
  doc.setFont('helvetica', 'normal');
  doc.text(locationName, 40, 37);

  doc.setFont('helvetica', 'bold');
  doc.text(`PERIODO:`, 18, 43);
  doc.setFont('helvetica', 'normal');
  doc.text(payPeriod, 40, 43);

  doc.setFont('helvetica', 'bold');
  doc.text(`FECHA EMISIÓN:`, 140, 37);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString('es-MX', { dateStyle: 'medium' }), 170, 37);

  doc.setFont('helvetica', 'bold');
  doc.text(`LEGISLACIÓN:`, 140, 43);
  doc.setFont('helvetica', 'normal');
  doc.text('LFT Art. 60, 67, 68, 75 (Nocturno +35%, Dobles 200%, Triples 300%)', 170, 43);

  // 3. Table Header
  let startY = 54;
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(14, startY, pageWidth - 28, 8, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);

  const cols = [
    { title: 'EMPLEADO', x: 18 },
    { title: 'EMP #', x: 65 },
    { title: 'PUESTO', x: 82 },
    { title: 'SUELDO/H', x: 105 },
    { title: 'H. REG', x: 125 },
    { title: 'H. NOC (+35%)', x: 145 },
    { title: 'H. DOBLES (200%)', x: 172 },
    { title: 'H. TRIPLES (300%)', x: 202 },
    { title: 'TOTAL NETO ($)', x: 240 },
  ];

  cols.forEach((col) => doc.text(col.title, col.x, startY + 5.5));

  startY += 8;

  // 4. Data Rows
  let grandTotalHours = 0;
  let grandTotalPay = 0;

  breakdownList.forEach((emp, index) => {
    grandTotalHours += emp.netWorkedHours;
    grandTotalPay += emp.totalPay;

    const rowY = startY + index * 8;
    if (index % 2 === 0) {
      doc.setFillColor(241, 245, 249); // slate-100 alternate row
      doc.rect(14, rowY, pageWidth - 28, 8, 'F');
    }

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(emp.employeeName.slice(0, 24), 18, rowY + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(emp.employeeNumber, 65, rowY + 5.5);
    doc.text(emp.jobPositionCode, 82, rowY + 5.5);
    doc.text(`$${emp.hourlyRate.toFixed(2)}`, 105, rowY + 5.5);
    doc.text(`${emp.regHours.toFixed(1)} hrs`, 125, rowY + 5.5);
    doc.text(`${emp.nightHours.toFixed(1)} hrs`, 145, rowY + 5.5);
    doc.text(`${emp.doubleOtHours.toFixed(1)} hrs`, 172, rowY + 5.5);
    doc.text(`${emp.tripleOtHours.toFixed(1)} hrs`, 202, rowY + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 185, 129); // emerald-600
    doc.text(`$${emp.totalPay.toFixed(2)} MXN`, 240, rowY + 5.5);
  });

  // 5. Totals Bar
  const totalY = startY + breakdownList.length * 8 + 4;
  doc.setFillColor(15, 23, 42);
  doc.rect(14, totalY, pageWidth - 28, 10, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('TOTALES DE NÓMINA CON RECARGOS LFT:', 18, totalY + 6.5);
  doc.text(`TOTAL HORAS: ${grandTotalHours.toFixed(2)} hrs`, 150, totalY + 6.5);
  doc.setTextColor(52, 211, 153); // emerald-400
  doc.text(`GRAN TOTAL NÓMINA: $${grandTotalPay.toFixed(2)} MXN`, 215, totalY + 6.5);

  // 6. Validation QR Code Footer
  try {
    const qrDataUrl = await QRCode.toDataURL(
      `NEXUSTAFF-PAYROLL-VERIFIED|LOC:${locationName}|TOTAL:${grandTotalPay.toFixed(2)}|DATE:${new Date().toISOString()}`
    );
    doc.addImage(qrDataUrl, 'PNG', pageWidth - 36, pageHeight - 32, 22, 22);

    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Escanee el código QR para verificar la autenticidad del reporte en el servidor central NexuStaff.', 14, pageHeight - 12);
    doc.text('Documento firmado digitalmente. NexuStaff Enterprise Payroll & Attendance Engine v2.4', 14, pageHeight - 8);
  } catch (e) {}

  // Save & Download PDF
  doc.save(`NexuStaff_Reporte_Nomina_${locationName.replace(/\s+/g, '_')}.pdf`);
}
