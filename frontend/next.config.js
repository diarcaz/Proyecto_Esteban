if (process.env.NODE_ENV === 'production') {
  const value = process.env.NEXT_PUBLIC_API_URL;
  if (!value) throw new Error('NEXT_PUBLIC_API_URL is required before a production build/start');
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/api/v1') throw new Error('NEXT_PUBLIC_API_URL must be an HTTP(S) URL ending in /api/v1');
}
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;
