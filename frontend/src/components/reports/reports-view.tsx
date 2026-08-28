'use client';

import React, { useMemo } from 'react';
import { usePunchStore } from '@/store/use-punch-store';
import { useLocationStore, isLocationMatching } from '@/store/use-location-store';
import { formatHours } from '@/lib/utils';
import { exportPunchesToCsv } from '@/lib/csv-exporter';
import { calculatePayrollBreakdown } from '@/lib/payroll-rules';
import { generateCorporatePayrollPdf } from '@/lib/pdf-generator';
import { FileSpreadsheet, Download, Printer, ShieldCheck, FileText, DollarSign, Moon, Clock, Award } from 'lucide-react';

export function ReportsView() {
  const { punches } = usePunchStore();
  const { selectedLocationId, getSelectedLocation } = useLocationStore();
  const activeLoc = getSelectedLocation();

  const filteredPunches = useMemo(() => {
    return punches.filter((p) =>
      isLocationMatching(p.locationId, p.locationCode, selectedLocationId)
    );
  }, [punches, selectedLocationId]);

  const payrollData = useMemo(() => {
    return calculatePayrollBreakdown(
      filteredPunches.map((p) => ({
        id: p.id,
        userId: p.userId,
        employeeNumber: p.employeeNumber,
        employeeName: p.employeeName,
        jobPositionCode: p.jobPositionCode,
        locationCode: p.locationCode,
        calculatedHours: p.calculatedHours,
        isOvertime: p.isOvertime,
        actualIn: p.actualIn,
        actualOut: p.actualOut,
        hourlyRate: 25.0,
      }))
    );
  }, [filteredPunches]);

  const totalNetHours = payrollData.reduce((sum, item) => sum + item.netWorkedHours, 0);
  const totalPayrollCost = payrollData.reduce((sum, item) => sum + item.totalPay, 0);
  const totalNightHours = payrollData.reduce((sum, item) => sum + item.nightHours, 0);
  const totalDoubleOtHours = payrollData.reduce((sum, item) => sum + item.doubleOtHours, 0);
  const totalTripleOtHours = payrollData.reduce((sum, item) => sum + item.tripleOtHours, 0);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    await generateCorporatePayrollPdf(
      payrollData,
      activeLoc ? activeLoc.name : 'Downtown Branch - MERIDA',
      'Jul 16, 2026 - Jul 31, 2026'
    );
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Action Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4 print:hidden">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            Payroll &amp; Corporate Reports <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">NexuStaff Payroll</span>
          </h2>
          <p className="text-xs text-slate-400 font-medium">
            Automatic calculation of night surcharges, statutory holidays, and double/triple overtime multipliers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => exportPunchesToCsv(filteredPunches)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-extrabold text-white shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4" /> Export CSV
          </button>
          <button
            onClick={handleDownloadPdf}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-xs font-black text-white shadow-xl transition-all active:scale-95 cursor-pointer border border-blue-400/30 connecteam-glow-blue"
          >
            <FileText className="h-4 w-4" /> Corporate PDF (Logo &amp; QR)
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-extrabold text-slate-200 border border-slate-700 transition-all active:scale-95 cursor-pointer"
          >
            <Printer className="h-4 w-4" /> Print View
          </button>
        </div>
      </div>

      {/* Compliance Rules Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 text-xs">
        <div className="flex items-center gap-2 text-slate-300 font-bold">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Active Labor Compliance Rules:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] font-mono font-bold flex items-center gap-1">
            <Moon className="h-3 w-3" /> Night Shift: +35%
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-mono font-bold flex items-center gap-1">
            <Clock className="h-3 w-3" /> Double OT (&lt;=9h): 200%
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[10px] font-mono font-bold flex items-center gap-1">
            <Award className="h-3 w-3" /> Triple OT (&gt;9h): 300%
          </span>
        </div>
      </div>

      {/* Summary KPI Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 print:grid-cols-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-500 font-black uppercase">Active Branch</span>
          <p className="text-sm font-black text-white">{activeLoc ? activeLoc.name : 'All Authorized Branches'}</p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-500 font-black uppercase">Total Hours Worked</span>
          <p className="text-base font-black text-blue-400 font-mono">{formatHours(totalNetHours)}</p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-500 font-black uppercase">Overtime Breakdown</span>
          <p className="text-xs font-extrabold text-amber-400 font-mono">
            Night: {totalNightHours.toFixed(1)}h | Dbl: {totalDoubleOtHours.toFixed(1)}h | Trp: {totalTripleOtHours.toFixed(1)}h
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1 bg-gradient-to-br from-slate-900 to-emerald-950/40 border-emerald-500/30">
          <span className="text-[10px] text-emerald-400 font-black uppercase flex items-center gap-1">
            <DollarSign className="h-3 w-3" /> Total Payroll Cost
          </span>
          <p className="text-lg font-black text-emerald-400 font-mono">${totalPayrollCost.toFixed(2)} USD</p>
        </div>
      </div>

      {/* Detailed Payroll Breakdown Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">STAFF MEMBER</th>
                <th className="px-4 py-3.5">EMP #</th>
                <th className="px-4 py-3.5">POSITION</th>
                <th className="px-4 py-3.5 text-right">HOURLY RATE</th>
                <th className="px-4 py-3.5 text-right">REGULAR HRS</th>
                <th className="px-4 py-3.5 text-right">NIGHT SHIFT (+35%)</th>
                <th className="px-4 py-3.5 text-right">DOUBLE OT (200%)</th>
                <th className="px-4 py-3.5 text-right">TRIPLE OT (300%)</th>
                <th className="px-4 py-3.5 text-right font-black text-emerald-400">TOTAL PAY ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {payrollData.map((emp) => (
                <tr key={emp.userId} className="hover:bg-slate-800/60 transition-colors">
                  <td className="px-4 py-3 font-bold text-white font-sans">{emp.employeeName}</td>
                  <td className="px-4 py-3 text-slate-400">{emp.employeeNumber}</td>
                  <td className="px-4 py-3 text-blue-400">{emp.jobPositionCode}</td>
                  <td className="px-4 py-3 text-right text-slate-300">${emp.hourlyRate.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">{emp.regHours.toFixed(1)}h</td>
                  <td className="px-4 py-3 text-right text-indigo-300">{emp.nightHours.toFixed(1)}h</td>
                  <td className="px-4 py-3 text-right text-amber-400">{emp.doubleOtHours.toFixed(1)}h</td>
                  <td className="px-4 py-3 text-right text-rose-400">{emp.tripleOtHours.toFixed(1)}h</td>
                  <td className="px-4 py-3 text-right font-black text-emerald-400 text-sm">${emp.totalPay.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
