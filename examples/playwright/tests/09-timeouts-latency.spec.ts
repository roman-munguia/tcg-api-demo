// Lesson 9: timeouts. The X-Delay-Ms request header makes ONE request slow (0-10000 ms).
// Server-wide: set LATENCY_MS in .env or compose.yaml and watch Swagger's request duration.
import { test, expect } from '@playwright/test';
import { SEED } from '../data';

test.beforeAll(async ({ request }) => {
  const { settings } = await (await request.get('/health')).json();
  test.skip(!settings.teachingHeaders, 'the server runs with TEACHING_HEADERS=false');
});

test('a slow response still passes within the timeout', async ({ request }) => {
  const started = Date.now();
  const response = await request.get('/cards', { params: { id: SEED.cards.cinderwingDrake }, headers: { 'X-Delay-Ms': '300' } });
  await expect(response).toBeOK();
  expect(Date.now() - started).toBeGreaterThanOrEqual(300);
  // At least 300: the server may add its own LATENCY_MS on top.
  expect(Number(response.headers()['x-delay-applied-ms'])).toBeGreaterThanOrEqual(300);
});

test('a request slower than its timeout fails', async ({ request }) => {
  const slow = request.get('/cards/search', { headers: { 'X-Delay-Ms': '1500' }, timeout: 500 });
  await expect(slow).rejects.toThrow(/Timeout/);
});

test('delays above the limit are rejected', async ({ request }) => {
  const response = await request.get('/cards/search', { headers: { 'X-Delay-Ms': '60000' } });
  expect(response.status()).toBe(400);
  expect((await response.json()).details[0]).toMatchObject({ field: 'header.x-delay-ms', rule: 'maximum' });
});
