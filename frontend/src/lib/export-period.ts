export function periodParameters(kind: string, start: string, end: string, location: string) {
  if (!['custom','weekly','biweekly'].includes(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error('Choose a valid period start.');
  const params: Record<string,string> = { period:kind,start_date:start };
  if(kind==='custom') {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start) throw new Error('Choose an end date on or after the start.');
    params.end_date=end;
  }
  if(location && location!=='ALL') params.location_id=location;
  return params;
}

export function reportFilename(kind: 'detail'|'summary', branch: string | undefined, period: string, start: string, end: string, allBranches = false) {
  periodParameters(period, start, end, 'ALL');
  const last = period === 'custom' ? end : new Date(Date.parse(start + 'T00:00:00Z') + (period === 'weekly' ? 6 : 13) * 86400000).toISOString().slice(0,10);
  const label = allBranches ? 'All-Authorized-Branches' : (branch || 'Selected-Branch');
  const safe = label.normalize('NFKC').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0,100) || 'Selected-Branch';
  return `NexuStaff_${safe}_${kind === 'detail' ? 'Attendance-Detail' : 'Period-Summary'}_${start}_${last}.csv`;
}
