// Replaced with the real version when the API is bundled (see scripts/bundle.mjs); "dev" when run from source.
declare const __APP_VERSION__: string | undefined;
export const VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : (process.env.APP_VERSION ?? 'dev');
