export function allowedOrigins(env = process.env): string[] {
  const origins = (env.CORS_ORIGIN || (env.NODE_ENV === 'production' ? '' : 'http://localhost:3000')).split(',').map(s => s.trim()).filter(Boolean);
  if (!origins.length) throw new Error('CORS_ORIGIN is required');
  for (const origin of origins) {
    let url: URL;
    try { url = new URL(origin); } catch { throw new Error('CORS_ORIGIN must contain exact HTTP(S) origins'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) throw new Error('CORS_ORIGIN must contain exact HTTP(S) origins');
    if (env.NODE_ENV === 'production' && (url.protocol !== 'https:' || /^(localhost|127\.|\[::1\])/.test(url.hostname))) throw new Error('Production CORS requires non-local HTTPS origins');
  }
  return origins;
}
export function validateProductionEnvironment(env = process.env): void {
  allowedOrigins(env);
  if (env.NODE_ENV !== 'production') return;
  if (!env.JWT_SECRET || env.JWT_SECRET.trim().length < 32) throw new Error('Production JWT_SECRET must contain at least 32 characters');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!env.REDIS_URL && !env.REDIS_HOST) throw new Error('REDIS_URL or REDIS_HOST is required');
}
