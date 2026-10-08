// Lesson 6: negative and boundary tests, generated from a table of cases (data-driven tests).
// Assert on status, code and details[].field / details[].rule - not on the English message text.
import { test, expect } from '@playwright/test';
import { cardPayload, uniqueName } from '../data/testData';
import { AuthService } from '../services/authService.service';
import { CardsService } from '../services/cardsService.service';
import type { ErrorResponse } from '../types';

const invalidCards: {
  title: string;
  change: Record<string, unknown>;
  field: string;
  rule: string;
}[] = [
  {
    title: 'empty name',
    change: { name: '' },
    field: 'body.name',
    rule: 'minLength',
  },
  {
    title: '81-character name',
    change: { name: 'x'.repeat(81) },
    field: 'body.name',
    rule: 'maxLength',
  },
  {
    title: 'dropRate 0',
    change: { dropRate: 0 },
    field: 'body.dropRate',
    rule: 'exclusiveMinimum',
  },
  {
    title: 'dropRate 1.01',
    change: { dropRate: 1.01 },
    field: 'body.dropRate',
    rule: 'maximum',
  },
  {
    title: 'dropRate as a percentage',
    change: { dropRate: 15 },
    field: 'body.dropRate',
    rule: 'maximum',
  },
  {
    title: 'dropRate as a string',
    change: { dropRate: '0.5' },
    field: 'body.dropRate',
    rule: 'type',
  },
  {
    title: 'relative imageUrl',
    change: { imageUrl: '/card.png' },
    field: 'body.imageUrl',
    rule: 'pattern',
  },
  {
    title: 'nested attribute object',
    change: { attributes: { stats: { attack: 1 } } },
    field: 'body.attributes.stats',
    rule: 'type',
  },
  {
    title: 'unknown field',
    change: { rarity: 'Rare' },
    field: 'body.rarity',
    rule: 'additionalProperties',
  },
];

test.describe('Card Validation Tests', () => {
  let adminToken: string;
  let cardsService: CardsService;

  test.beforeAll(async ({ request }) => {
    adminToken = await new AuthService(request).loginAs('admin');
  });

  test.beforeEach(async ({ request }) => {
    cardsService = new CardsService(request, adminToken);
  });

  test.afterEach(async () => {
    await cardsService.cleanup();
  });

  for (const c of invalidCards) {
    test(`POST /cards rejects ${c.title}`, async () => {
      const response = await cardsService.create(cardPayload(c.change));
      expect(response.status()).toBe(400);
      const body = (await response.json()) as ErrorResponse;
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.details).toContainEqual(
        expect.objectContaining({ field: c.field, rule: c.rule })
      );
    });
  }

  test('boundary values that ARE allowed', async () => {
    // 80 characters is the maximum name length
    for (const change of [
      { name: uniqueName('x').padEnd(80, 'x') },
      { dropRate: 1 },
      { dropRate: 0.0001 },
    ]) {
      const response = await cardsService.create(cardPayload(change));
      expect(response.status(), JSON.stringify(change)).toBe(201);
    }
  });

  test('all problems are reported at once', async () => {
    const response = await cardsService.create({ dropRate: 5 });
    const { details } = (await response.json()) as ErrorResponse;
    expect(details.map((d) => d.field)).toEqual([
      'body.dropRate',
      'body.imageUrl',
      'body.name',
    ]);
  });

  test('415 when the body is not sent as JSON', async ({ request }) => {
    // A string in `data` is sent as-is with Content-Type application/octet-stream.
    const response = await request.post('/cards', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: JSON.stringify(cardPayload()),
    });
    expect(response.status()).toBe(415);
    expect(((await response.json()) as ErrorResponse).code).toBe(
      'UNSUPPORTED_MEDIA_TYPE'
    );
  });

  test('400 INVALID_JSON for malformed JSON', async ({ request }) => {
    // Know your tool: a *string* with a JSON Content-Type would be JSON-encoded again by Playwright.
    // A Buffer is sent byte for byte, so the trailing comma really reaches the server.
    const response = await request.post('/cards', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      data: Buffer.from('{"name": "Broken",}'),
    });
    expect(response.status()).toBe(400);
    expect(((await response.json()) as ErrorResponse).code).toBe(
      'INVALID_JSON'
    );
  });

  test('409 when the name is taken (ignoring case)', async () => {
    const payload = cardPayload();
    expect((await cardsService.create(payload)).status()).toBe(201);

    const second = await cardsService.create({
      ...payload,
      name: payload.name.toUpperCase(),
    });
    expect(second.status()).toBe(409);
    expect(((await second.json()) as ErrorResponse).code).toBe('NAME_TAKEN');
    // This is why tests never hardcode names: a re-run, or a parallel test, would hit this 409.
  });
});
