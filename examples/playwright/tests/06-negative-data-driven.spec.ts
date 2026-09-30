// Lesson 6: negative and boundary tests, generated from a table of cases (data-driven tests).
// Assert on status, code and details[].field / details[].rule - not on the English message text.
import { test, expect } from '../fixtures';
import { cardPayload, uniqueName } from '../data';

const invalidCards: { title: string; change: Record<string, unknown>; field: string; rule: string }[] = [
  { title: 'empty name', change: { name: '' }, field: 'body.name', rule: 'minLength' },
  { title: '81-character name', change: { name: 'x'.repeat(81) }, field: 'body.name', rule: 'maxLength' },
  { title: 'dropRate 0', change: { dropRate: 0 }, field: 'body.dropRate', rule: 'exclusiveMinimum' },
  { title: 'dropRate 1.01', change: { dropRate: 1.01 }, field: 'body.dropRate', rule: 'maximum' },
  { title: 'dropRate as a percentage', change: { dropRate: 15 }, field: 'body.dropRate', rule: 'maximum' },
  { title: 'dropRate as a string', change: { dropRate: '0.5' }, field: 'body.dropRate', rule: 'type' },
  { title: 'relative imageUrl', change: { imageUrl: '/card.png' }, field: 'body.imageUrl', rule: 'pattern' },
  { title: 'nested attribute object', change: { attributes: { stats: { attack: 1 } } }, field: 'body.attributes.stats', rule: 'type' },
  { title: 'unknown field', change: { rarity: 'Rare' }, field: 'body.rarity', rule: 'additionalProperties' },
];

for (const c of invalidCards) {
  test(`POST /cards rejects ${c.title}`, async ({ adminRequest }) => {
    const response = await adminRequest.post('/cards', { data: cardPayload(c.change) });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toContainEqual(expect.objectContaining({ field: c.field, rule: c.rule }));
  });
}

test('boundary values that ARE allowed', async ({ adminRequest, cleanup }) => {
  for (const change of [{ name: uniqueName('x').padEnd(80, 'x') }, { dropRate: 1 }, { dropRate: 0.0001 }]) { // 80 characters is the maximum
    const response = await adminRequest.post('/cards', { data: cardPayload(change) });
    expect(response.status(), JSON.stringify(change)).toBe(201);
    cleanup.card((await response.json()).id);
  }
});

test('all problems are reported at once', async ({ adminRequest }) => {
  const response = await adminRequest.post('/cards', { data: { dropRate: 5 } });
  const { details } = await response.json();
  expect(details.map((d: any) => d.field)).toEqual(['body.dropRate', 'body.imageUrl', 'body.name']);
});

test('415 when the body is not sent as JSON', async ({ adminRequest }) => {
  // A string in `data` is sent as-is with Content-Type application/octet-stream.
  const response = await adminRequest.post('/cards', { data: JSON.stringify(cardPayload()) });
  expect(response.status()).toBe(415);
  expect((await response.json()).code).toBe('UNSUPPORTED_MEDIA_TYPE');
});

test('400 INVALID_JSON for malformed JSON', async ({ adminRequest }) => {
  // Know your tool: a *string* with a JSON Content-Type would be JSON-encoded again by Playwright.
  // A Buffer is sent byte for byte, so the trailing comma really reaches the server.
  const response = await adminRequest.post('/cards', {
    data: Buffer.from('{"name": "Broken",}'),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).code).toBe('INVALID_JSON');
});

test('409 when the name is taken (ignoring case)', async ({ adminRequest, cleanup }) => {
  const payload = cardPayload();
  const first = await adminRequest.post('/cards', { data: payload });
  expect(first.status()).toBe(201);
  cleanup.card((await first.json()).id);

  const second = await adminRequest.post('/cards', { data: { ...payload, name: payload.name.toUpperCase() } });
  expect(second.status()).toBe(409);
  expect((await second.json()).code).toBe('NAME_TAKEN');
  // This is why tests never hardcode names: a re-run, or a parallel test, would hit this 409.
});
