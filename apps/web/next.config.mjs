import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The product version lives in the root package.json
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

/** @type {import('next').NextConfig} */
export default {
  // Self-contained server: the Docker image ships only what the app needs to run, no dev tools
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  transpilePackages: ['@pulse/shared'],
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_VERSION: version },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};
