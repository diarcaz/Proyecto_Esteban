export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = 'ApiError'; }
}

// A status alone does not make a message safe. Only reviewed UI messages cross this boundary.
const propertyMessages = new Set([
  'A valid IANA timezone is required.',
  'An explicit company is required.',
  'Property name is required.',
  'Property address is required.',
  'Property code already exists.',
  'Access denied: You cannot request resources belonging to another company tenant.',
  "Access denied: Missing required permission 'PROPERTY_MANAGE'.",
]);

export function safePropertyError(error: unknown, fallback: string): string {
  return error instanceof ApiError && [400, 403, 409].includes(error.status) && propertyMessages.has(error.message)
    ? error.message : fallback;
}
