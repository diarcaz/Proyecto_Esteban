import { isIP } from 'node:net';
import { normalizeIp } from '@nestjs/throttler';

type ClientIpRequest = {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};

/**
 * Render routes public web-service traffic through Cloudflare. Cloudflare
 * supplies CF-Connecting-IP with the visitor address; X-Forwarded-For is
 * intentionally ignored because it can contain caller-supplied entries.
 * Outside production, ignore Cloudflare headers and use the socket peer.
 */
export function getClientIp(request: ClientIpRequest): string {
  if (process.env.NODE_ENV === 'production') {
    const header = request.headers?.['cf-connecting-ip'];
    const candidate = Array.isArray(header) ? undefined : header?.trim();
    if (candidate && isIP(candidate)) return candidate;
  }

  return request.socket?.remoteAddress || 'unknown';
}

export function clientIpTracker(request: ClientIpRequest): string {
  return normalizeIp(getClientIp(request));
}
