export interface TerminalConfig { propertyId: string; locationCode: string; propertyName: string; timezone: string; pairedAt?: string }
export function terminalFromProperty(property: { id: string; code: string; name: string; timezone: string }): TerminalConfig {
  if (!property.id || !property.code || !property.name || !property.timezone) throw new Error('Property configuration is incomplete. Contact an administrator.');
  new Intl.DateTimeFormat('en-US', { timeZone: property.timezone });
  return { propertyId: property.id, locationCode: property.code, propertyName: property.name, timezone: property.timezone };
}
export function readTerminalConfig(raw: string | null): TerminalConfig | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return terminalFromProperty({ id: value.propertyId, code: value.locationCode, name: value.propertyName, timezone: value.timezone });
  } catch { return null; }
}
export function formatPropertyTimestamp(timestamp: string | Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(new Date(timestamp));
}
/** Every reset invalidates all requests from the previous employee interaction. */
export class InteractionGeneration {
  private generation = 0;
  next() { return ++this.generation; }
  isCurrent(value: number) { return value === this.generation; }
}
