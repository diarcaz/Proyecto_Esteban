import { createHmac, timingSafeEqual } from 'crypto';

// An opaque credential generation, never the password hash itself. A password
// reset changes this generation and invalidates both access and refresh tokens.
export function credentialVersion(secret: string, user: { id: string; passwordHash: string }): string {
  return createHmac('sha256', secret).update(JSON.stringify(['credential-v1', user.id, user.passwordHash])).digest('hex');
}

export function matchesCredentialVersion(value: unknown, secret: string, user: { id: string; passwordHash: string }): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
    && timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(credentialVersion(secret, user), 'hex'));
}
