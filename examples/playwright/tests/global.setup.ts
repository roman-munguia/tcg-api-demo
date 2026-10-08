// Runs once per test run, before every spec (see `projects` in playwright.config.ts).
import { test as setup, expect } from '@playwright/test';
import { AuthService } from '../services/authService.service';
import type { Health } from '../types';

setup('the Glyphwild API is running', async ({ request, baseURL }) => {
  const authService = new AuthService(request);
  const response = await authService.getHealth();
  const isJson = (response.headers()['content-type'] ?? '').includes(
    'application/json'
  );
  const isOurApi =
    response.ok() &&
    isJson &&
    ((await response.json()) as Health).name === 'glyphwild-tcg-api';
  expect(
    isOurApi,
    `Something else is answering on ${baseURL} (not the Glyphwild API). Stop it, or set PORT / API_BASE_URL.`
  ).toBe(true);
});

// Reset ONCE per run, never per test: tests run in parallel and share the data.
// On a shared server, set RESET_BEFORE_RUN=false so you do not wipe your classmates' data.
setup('reset the data to the seed', async ({ request }) => {
  setup.skip(
    process.env.RESET_BEFORE_RUN === 'false',
    'RESET_BEFORE_RUN=false'
  );
  const authService = new AuthService(request);
  await authService.loginAs('admin'); // the service keeps the token...
  await expect(await authService.resetData()).toBeOK(); // ...and sends it here
  console.log(
    'Reset the API data to the seed (set RESET_BEFORE_RUN=false to keep your data).'
  );
});
