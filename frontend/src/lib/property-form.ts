export const FALLBACK_TIMEZONES = ['America/Merida', 'America/Mexico_City', 'America/Cancun', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'UTC'];

export function timezoneOptions(current = ''): string[] {
  let zones = FALLBACK_TIMEZONES;
  try {
    if (typeof Intl.supportedValuesOf === 'function') zones = [...zones, ...Intl.supportedValuesOf('timeZone')];
  } catch { /* Older runtimes retain the small supported fallback. */ }
  try {
    if (current) { new Intl.DateTimeFormat('en', { timeZone: current }); zones = [...zones, current]; }
  } catch { /* Invalid saved values must be replaced with a valid selection. */ }
  return Array.from(new Set(zones)).sort();
}

export function timezoneLabel(zone: string, date = new Date()): string {
  const cities: Record<string, string> = { 'America/Merida': 'Mérida', 'America/Mexico_City': 'Mexico City', 'America/Cancun': 'Cancún' };
  const city = cities[zone] || zone.split('/').slice(1).join(' / ').replace(/_/g, ' ') || zone;
  try {
    const part = (timeZoneName: 'longGeneric' | 'shortOffset') => new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName }).formatToParts(date).find(p => p.type === 'timeZoneName')?.value;
    const label = part('longGeneric');
    const offset = part('shortOffset')?.replace('GMT', 'UTC');
    return `${city}${label && !label.includes('/') && label !== city ? ` — ${label}` : ''}${offset ? ` (${offset})` : ''}`;
  } catch { return city; }
}

export function propertyPayload(form: { name: string; code?: string; address: string; timezone: string }) {
  return { name: form.name.trim(), ...(form.code === undefined ? {} : { code: form.code.trim() }), address: form.address.trim(), timezone: form.timezone.trim() };
}
