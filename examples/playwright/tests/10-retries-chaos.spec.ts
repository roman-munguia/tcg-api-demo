// Lesson 10: flaky servers and retries.
// X-Chaos-Fail-Times: N + X-Chaos-Key: <unique text> -> the first N requests with that key return 500, later ones succeed.
// Server-wide: CHAOS_RATE=0.3 makes 30% of successful /cards and /decks requests fail (try `npx playwright test --retries=2`).
import { test, expect } from '@playwright/test';
import { RUN_ID, SEED } from '../data';

test.beforeAll(async ({ request }) => {
  const { settings } = await (await request.get('/health')).json();
  test.skip(!settings.teachingHeaders, 'the server runs with TEACHING_HEADERS=false');
});

// A key unique per test, per run and per attempt: a retry gets a fresh key and sees the same failures again.
// (Pass sameOnRetry = true to share the key between attempts, as the DEMO_FLAKY test below does.)
const chaosKey = (sameOnRetry = false) => {
  const info = test.info();
  const attempt = sameOnRetry ? 'any' : info.retry;
  return `${RUN_ID}-${info.repeatEachIndex}-${attempt}-${info.title.replace(/[^A-Za-z0-9]/g, '-')}`.slice(0, 100);
};

test('an injected failure looks like this', async ({ request }) => {
  const headers = { 'X-Chaos-Fail-Times': '1', 'X-Chaos-Key': chaosKey() };
  const failed = await request.get('/cards', { params: { id: SEED.cards.cinderwingDrake }, headers });
  expect(failed.status()).toBe(500);
  expect(failed.headers()['x-chaos']).toBe('injected');
  expect((await failed.json()).code).toBe('CHAOS_INJECTED');

  const next = await request.get('/cards', { params: { id: SEED.cards.cinderwingDrake }, headers });
  await expect(next).toBeOK();
});

test('retry a block until it passes with toPass()', async ({ request }) => {
  const headers = { 'X-Chaos-Fail-Times': '2', 'X-Chaos-Key': chaosKey() };
  let attempts = 0;
  await expect(async () => {
    attempts++;
    const response = await request.get('/cards', { params: { id: SEED.cards.cinderwingDrake }, headers });
    expect(response.status()).toBe(200);
  }).toPass({ intervals: [100, 200, 400] });
  expect(attempts).toBe(3); // failed twice, passed on the third try
});

test('poll a value with expect.poll()', async ({ request }) => {
  const headers = { 'X-Chaos-Fail-Times': '2', 'X-Chaos-Key': chaosKey() };
  await expect.poll(async () => (await request.get('/cards/search', { headers })).status(), { intervals: [100, 200, 400] }).toBe(200);
});

test('maxRetries does NOT retry a 500', async ({ request }) => {
  // maxRetries only repeats requests that fail at the network level (e.g. ECONNRESET), never an HTTP error status.
  const headers = { 'X-Chaos-Fail-Times': '1', 'X-Chaos-Key': chaosKey() };
  const response = await request.get('/cards/search', { headers, maxRetries: 3 });
  expect(response.status()).toBe(500);
});

// Opt-in demo of a test that Playwright reports as "flaky": DEMO_FLAKY=1 npx playwright test 10-retries
test.describe(() => {
  test.describe.configure({ retries: 1 });
  test('fails the first time, passes on retry', async ({ request }) => {
    test.skip(!process.env.DEMO_FLAKY, 'set DEMO_FLAKY=1 to see a flaky test in the report');
    // The same key on the retry: its single failure is used up, so the retry passes.
    const headers = { 'X-Chaos-Fail-Times': '1', 'X-Chaos-Key': chaosKey(true) };
    const response = await request.get('/cards/search', { headers });
    expect(response.status()).toBe(200);
  });
});
