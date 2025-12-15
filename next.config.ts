import type { NextConfig } from "next";

// #region agent log
if (typeof fetch !== 'undefined') {
  fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'next.config.ts:3', message: 'Next.js config loaded', data: { timestamp: new Date().toISOString() }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'C' }) }).catch(() => { });
}
// #endregion

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config, { isServer }) => {
    // #region agent log
    if (typeof fetch !== 'undefined') {
      fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'next.config.ts:webpack', message: 'Webpack config called', data: { isServer, watchOptions: config.watchOptions }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'C' }) }).catch(() => { });
    }
    // #endregion

    // Exclude .cursor directory and log files from file watching
    // Create a new watchOptions object (existing one is read-only)
    const existingWatchOptions = config.watchOptions || {};

    // #region agent log
    if (typeof fetch !== 'undefined') {
      fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'next.config.ts:watchOptions', message: 'Configuring watchOptions to exclude logs', data: { ignored: existingWatchOptions.ignored, ignoredType: typeof existingWatchOptions.ignored, isArray: Array.isArray(existingWatchOptions.ignored) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
    }
    // #endregion

    // Convert ignored to array format if needed
    let existingIgnored: string[] = [];
    if (existingWatchOptions.ignored) {
      if (Array.isArray(existingWatchOptions.ignored)) {
        existingIgnored = existingWatchOptions.ignored.filter((item: unknown): item is string => typeof item === 'string');
      } else if (typeof existingWatchOptions.ignored === 'string') {
        existingIgnored = [existingWatchOptions.ignored];
      }
      // If it's an object or function, ignore it and start fresh
    }

    // Create new watchOptions object with all existing properties plus new ignored array
    config.watchOptions = {
      ...existingWatchOptions,
      ignored: [
        ...existingIgnored,
        '**/.cursor/**',
        '**/*.log',
        '**/ngrok.log',
        '**/node_modules/**',
      ],
    };

    // #region agent log
    if (typeof fetch !== 'undefined') {
      fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'next.config.ts:webpack-end', message: 'Webpack watchOptions configured', data: { ignored: config.watchOptions?.ignored }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
    }
    // #endregion

    return config;
  },
  // Turbopack config (Next.js 16+ requirement when webpack config exists)
  turbopack: {},
};

export default nextConfig;
