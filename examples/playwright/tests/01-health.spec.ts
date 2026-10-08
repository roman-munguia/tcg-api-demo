// Lesson 1: the first request - status, headers and a JSON body.
import { test, expect } from '@playwright/test';
import { BaseService } from '../services/baseService.service';
import type { Health } from '../types';

test.describe('Health Tests', () => {
  let baseService: BaseService;

  test.beforeEach(async ({ request }) => {
    baseService = new BaseService(request);
  });

  test('GET /health answers 200 with JSON', async () => {
    const response = await baseService.getHealth();

    await expect(response).toBeOK(); // any 2xx; prints the body when it fails
    expect(response.status()).toBe(200);
    // Header names are always lower-case in Playwright.
    expect(response.headers()['content-type']).toContain('application/json');

    const body = (await response.json()) as Health;
    expect(body).toEqual(
      expect.objectContaining({ status: 'ok', name: 'glyphwild-tcg-api' })
    );
    expect(body.data.cards).toBeGreaterThanOrEqual(25);
  });

  test('the API echoes our X-Request-Id', async ({ request }) => {
    // Under the hood a service is just `request`: this is the same call written by hand.
    const response = await request.get('/health', {
      headers: { 'X-Request-Id': 'lesson-01' },
    });
    expect(response.headers()['x-request-id']).toBe('lesson-01');
  });
});
