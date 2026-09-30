import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig } from '@playwright/test';

// Read the repo-root .env (the same file `npm start` reads), without overriding variables you set in your shell.
// So custom credentials or a custom PORT work for the tests too.
const rootEnv = path.resolve(__dirname, '../../.env');
if (fs.existsSync(rootEnv)) {
  for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(rootEnv, 'utf8')))) process.env[key] ??= value;
}

// One id per test RUN. Workers (and retries, which run in new workers) re-read this file,
// so the id is passed through the environment instead of being generated again.
process.env.TCG_RUN_ID ??= randomUUID().slice(0, 8);

const port = process.env.PORT || '3000';
// Point the suite at a server you started yourself (e.g. the compose container) with API_BASE_URL.
// Keep it an ORIGIN without a path: request.get('/cards') replaces any path in baseURL.
const baseURL = process.env.API_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    extraHTTPHeaders: { Accept: 'application/json' },
    trace: 'retain-on-failure',
  },
  projects: [
    // Runs once before everything else: resets the data to the seed.
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    { name: 'api', testMatch: /.*\.spec\.ts/, dependencies: ['setup'] },
  ],
  // Starts the API from the repo root, unless API_BASE_URL points at one that is already running.
  // The env below pins the knobs, so a LATENCY_MS, CHAOS_RATE or short TOKEN_TTL_SECONDS left in .env cannot make
  // the default run flaky. For knob exercises, start the API yourself and set API_BASE_URL.
  webServer: process.env.API_BASE_URL ? undefined : {
    command: 'npm start',
    cwd: '../..',
    url: `http://localhost:${port}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { PORT: port, LATENCY_MS: '0', CHAOS_RATE: '0', TEACHING_HEADERS: 'true', TOKEN_TTL_SECONDS: '86400', LOG_REQUESTS: 'false' },
  },
});
