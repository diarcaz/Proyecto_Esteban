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
