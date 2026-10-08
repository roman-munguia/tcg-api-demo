// Lesson 10: flaky servers and retries.
// X-Chaos-Fail-Times: N + X-Chaos-Key: <unique text> -> the first N requests with that key return 500, later ones succeed.
// Server-wide: CHAOS_RATE=0.3 makes 30% of successful /cards and /decks requests fail (try `npx playwright test --retries=2`).
import { test, expect } from '@playwright/test';
import { RUN_ID, SEED } from '../data/testData';
import { CardsService } from '../services/cardsService.service';
import type { ErrorResponse, Health } from '../types';

// A key unique per test, per run and per attempt: a retry gets a fresh key and sees the same failures again.
// (Pass sameOnRetry = true to share the key between attempts, as the DEMO_FLAKY test below does.)
const chaosKey = (sameOnRetry = false) => {
  const info = test.info();
  const attempt = sameOnRetry ? 'any' : info.retry;
  return `${RUN_ID}-${info.repeatEachIndex}-${attempt}-${info.title.replace(/[^A-Za-z0-9]/g, '-')}`.slice(
    0,
    100
  );
};
const failTimes = (times: number, sameOnRetry = false) => ({
  headers: {
    'X-Chaos-Fail-Times': String(times),
    'X-Chaos-Key': chaosKey(sameOnRetry),
  },
});

test.describe('Retry Tests', () => {
  let cardsService: CardsService;

  test.beforeAll(async ({ request }) => {
    const { settings } = (await (
      await new CardsService(request).getHealth()
    ).json()) as Health;
    test.skip(
      !settings.teachingHeaders,
      'the server runs with TEACHING_HEADERS=false'
    );
  });

  test.beforeEach(async ({ request }) => {
    cardsService = new CardsService(request);
  });

  test('an injected failure looks like this', async () => {
    const options = failTimes(1);
    const failed = await cardsService.getById(
      SEED.cards.cinderwingDrake,
      options
    );
    expect(failed.status()).toBe(500);
    expect(failed.headers()['x-chaos']).toBe('injected');
    expect(((await failed.json()) as ErrorResponse).code).toBe(
      'CHAOS_INJECTED'
    );

    await expect(
      await cardsService.getById(SEED.cards.cinderwingDrake, options)
    ).toBeOK();
  });

  test('retry a block until it passes with toPass()', async () => {
    const options = failTimes(2);
    let attempts = 0;
    await expect(async () => {
      attempts++;
      const response = await cardsService.getById(
        SEED.cards.cinderwingDrake,
        options
      );
      expect(response.status()).toBe(200);
    }).toPass({ intervals: [100, 200, 400] });
    expect(attempts).toBe(3); // failed twice, passed on the third try
  });

  test('poll a value with expect.poll()', async () => {
    const options = failTimes(2);
    await expect
      .poll(async () => (await cardsService.search({}, options)).status(), {
        intervals: [100, 200, 400],
      })
      .toBe(200);
  });

  test('maxRetries does NOT retry a 500', async () => {
    // maxRetries only repeats requests that fail at the network level (e.g. ECONNRESET), never an HTTP error status.
    const response = await cardsService.search(
      {},
      { ...failTimes(1), maxRetries: 3 }
    );
    expect(response.status()).toBe(500);
  });

  // Opt-in demo of a test that Playwright reports as "flaky": DEMO_FLAKY=1 npx playwright test 10-retries
  test.describe(() => {
    test.describe.configure({ retries: 1 });
    test('fails the first time, passes on retry', async () => {
      test.skip(
        !process.env.DEMO_FLAKY,
        'set DEMO_FLAKY=1 to see a flaky test in the report'
      );
      // The same key on the retry: its single failure is used up, so the retry passes.
      const response = await cardsService.search({}, failTimes(1, true));
      expect(response.status()).toBe(200);
    });
  });
});
