// Lesson 4: logging in, sending the token, and 401 vs 403.
//   401 = "we don't know who you are"      403 = "we know who you are, but you may not do this"
import { test, expect } from '@playwright/test';
import { CREDENTIALS, cardPayload } from '../data';

test('login returns a bearer token', async ({ request }) => {
  const response = await request.post('/auth/login', { data: CREDENTIALS.admin }); // data: a plain object -> JSON
  await expect(response).toBeOK();
  const body = await response.json();
  expect(body.token).toMatch(/^tcg_[A-Za-z0-9_-]{43}$/);
  expect(body).toMatchObject({ tokenType: 'Bearer', user: { username: CREDENTIALS.admin.username, role: 'admin' } });
});

test('wrong password -> 401, missing password -> 400', async ({ request }) => {
  const wrong = await request.post('/auth/login', { data: { ...CREDENTIALS.admin, password: 'nope' } });
  expect(wrong.status()).toBe(401);
  expect((await wrong.json()).code).toBe('INVALID_CREDENTIALS');

  const missing = await request.post('/auth/login', { data: { username: CREDENTIALS.admin.username } });
  expect(missing.status()).toBe(400);
});

test('reuse the token: 3 ways', async ({ request, playwright, baseURL }) => {
  const { token } = await (await request.post('/auth/login', { data: CREDENTIALS.viewer })).json();

  // 1. Per request
  const me = await request.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  await expect(me).toBeOK();
  expect((await me.json()).role).toBe('viewer');

  // 2. A context that sends the header on every request
  const viewer = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  await expect(await viewer.get('/auth/me')).toBeOK();
  await viewer.dispose();

  // 3. A fixture that logs in once per worker: see fixtures.ts (used from 05-crud-chain.spec.ts on).
});

test('the four kinds of 401', async ({ request }) => {
  const noToken = await request.get('/auth/me');
  expect(noToken.status()).toBe(401);
  expect((await noToken.json()).code).toBe('MISSING_TOKEN');
  expect(noToken.headers()['www-authenticate']).toContain('Bearer');

  const { token } = await (await request.post('/auth/login', { data: CREDENTIALS.admin })).json();
  const noPrefix = await request.get('/auth/me', { headers: { Authorization: token } }); // forgot "Bearer "
  expect((await noPrefix.json()).code).toBe('MALFORMED_AUTH_HEADER');

  const unknown = await request.get('/auth/me', { headers: { Authorization: `Bearer tcg_${'x'.repeat(43)}` } });
  expect((await unknown.json()).code).toBe('INVALID_TOKEN');
  // The 4th, TOKEN_EXPIRED, needs a short TOKEN_TTL_SECONDS on the server: try TOKEN_TTL_SECONDS=30.
});

test('viewer can read but gets 403 on writes', async ({ request }) => {
  const { token } = await (await request.post('/auth/login', { data: CREDENTIALS.viewer })).json();
  const headers = { Authorization: `Bearer ${token}` };

  await expect(await request.get('/cards/search', { headers })).toBeOK();
  const create = await request.post('/cards', { headers, data: cardPayload() });
  expect(create.status()).toBe(403);
  expect((await create.json()).code).toBe('FORBIDDEN_ROLE');

  // Check order: the role is checked BEFORE the body, so even an invalid body gets 403.
  const invalid = await request.post('/cards', { headers, data: { nonsense: true } });
  expect(invalid.status()).toBe(403);
});

test('logout revokes the token', async ({ request }) => {
  const { token } = await (await request.post('/auth/login', { data: CREDENTIALS.admin })).json();
  const headers = { Authorization: `Bearer ${token}` };
  expect((await request.post('/auth/logout', { headers })).status()).toBe(204);
  const after = await request.get('/auth/me', { headers });
  expect(after.status()).toBe(401);
  expect((await after.json()).code).toBe('INVALID_TOKEN');
});
