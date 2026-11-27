// Bundles the API into one file. The product version (root package.json) is written into it at build time.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const { version } = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
await build({
  entryPoints: ['src/server.ts'],
  bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: 'dist/server.js',
  external: ['pg-native', 'bufferutil', 'utf-8-validate', 'cpu-features', '*.node'],
  define: { __APP_VERSION__: JSON.stringify(version) },
  banner: { js: "import { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; import { dirname as __dn } from 'node:path'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);" },
  logLevel: 'info',
});
console.log(`Bundled Pulseboard ${version}`);
