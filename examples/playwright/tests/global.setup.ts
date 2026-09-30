// Runs once per test run, before every spec (see `projects` in playwright.config.ts).
import { test as setup, expect } from '@playwright/test';
import { CREDENTIALS } from '../data';

setup('the Glyphwild API is running', async ({ request, baseURL }) => {
  const res = await request.get('/health');
  const isOurApi = res.ok() && (res.headers()['content-type'] ?? '').includes('application/json') && (await res.json()).name === 'glyphwild-tcg-api';
  expect(isOurApi, `Something else is answering on ${baseURL} (not the Glyphwild API). Stop it, or set PORT / API_BASE_URL.`).toBe(true);
});

// Reset ONCE per run, never per test: tests run in parallel and share the data.
// On a shared server, set RESET_BEFORE_RUN=false so you do not wipe your classmates' data.
setup('reset the data to the seed', async ({ request }) => {
  setup.skip(process.env.RESET_BEFORE_RUN === 'false', 'RESET_BEFORE_RUN=false');
  const login = await request.post('/auth/login', { data: CREDENTIALS.admin });
  await expect(login).toBeOK();
  const { token } = await login.json();
  const reset = await request.post('/reset', { headers: { Authorization: `Bearer ${token}` } });
  await expect(reset).toBeOK();
  console.log('Reset the API data to the seed (set RESET_BEFORE_RUN=false to keep your data).');
});
