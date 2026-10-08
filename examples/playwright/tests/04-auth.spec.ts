// Lesson 4: logging in, sending the token, and 401 vs 403.
//   401 = "we don't know who you are"      403 = "we know who you are, but you may not do this"
import { test, expect } from '@playwright/test';
import { CREDENTIALS, cardPayload } from '../data/testData';
import { AuthService } from '../services/authService.service';
import { CardsService } from '../services/cardsService.service';
import type { ErrorResponse, LoginResponse, Me } from '../types';

test.describe('Auth Tests', () => {
  let authService: AuthService;

  test.beforeEach(async ({ request }) => {
    authService = new AuthService(request);
  });

  test('login returns a bearer token', async () => {
    const response = await authService.login(CREDENTIALS.admin); // sent as JSON
    await expect(response).toBeOK();
    const body = (await response.json()) as LoginResponse;
    expect(body.token).toMatch(/^tcg_[A-Za-z0-9_-]{43}$/);
    expect(body).toMatchObject({
      tokenType: 'Bearer',
      user: { username: CREDENTIALS.admin.username, role: 'admin' },
    });
  });

  test('wrong password -> 401, missing password -> 400', async () => {
    const wrong = await authService.login({
      ...CREDENTIALS.admin,
      password: 'nope',
    });
    expect(wrong.status()).toBe(401);
    expect(((await wrong.json()) as ErrorResponse).code).toBe(
      'INVALID_CREDENTIALS'
    );

    const missing = await authService.login({
      username: CREDENTIALS.admin.username,
    });
    expect(missing.status()).toBe(400);
  });

  test('reuse the token: by hand, then with a service', async ({ request }) => {
    const token = await authService.loginAs('viewer');

    // 1. By hand: send the header yourself on every request
    const byHand = await request.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    await expect(byHand).toBeOK();

    // 2. A service that keeps the token (authService now has it) and adds the header for you
    const me = (await (await authService.me()).json()) as Me;
    expect(me.role).toBe('viewer');

    // 3. Give the token to any other service through its constructor
    const cardsService = new CardsService(request, token);
    await expect(await cardsService.search()).toBeOK();
  });

  test('the kinds of 401', async ({ request }) => {
    const noToken = await authService.me(); // this service has no token yet
    expect(noToken.status()).toBe(401);
    expect(((await noToken.json()) as ErrorResponse).code).toBe(
      'MISSING_TOKEN'
    );
    expect(noToken.headers()['www-authenticate']).toContain('Bearer');

    const token = await authService.loginAs('admin');
    const noPrefix = await request.get('/auth/me', {
      headers: { Authorization: token },
    }); // forgot "Bearer "
    expect(((await noPrefix.json()) as ErrorResponse).code).toBe(
      'MALFORMED_AUTH_HEADER'
    );

    authService.setToken(`tcg_${'x'.repeat(43)}`);
    const unknown = await authService.me();
    expect(((await unknown.json()) as ErrorResponse).code).toBe(
      'INVALID_TOKEN'
    );
    // The 4th, TOKEN_EXPIRED, needs a short TOKEN_TTL_SECONDS on the server: try TOKEN_TTL_SECONDS=30.
  });

  test('viewer can read but gets 403 on writes', async ({ request }) => {
    const cardsService = new CardsService(
      request,
      await authService.loginAs('viewer')
    );

    await expect(await cardsService.search()).toBeOK();
    const create = await cardsService.create(cardPayload());
    expect(create.status()).toBe(403);
    expect(((await create.json()) as ErrorResponse).code).toBe(
      'FORBIDDEN_ROLE'
    );

    // Check order: the role is checked BEFORE the body, so even an invalid body gets 403.
    const invalid = await cardsService.create({ nonsense: true });
    expect(invalid.status()).toBe(403);
  });

  test('logout revokes the token', async () => {
    await authService.loginAs('admin');
    expect((await authService.logout()).status()).toBe(204);
    const after = await authService.me(); // the same (now revoked) token
    expect(after.status()).toBe(401);
    expect(((await after.json()) as ErrorResponse).code).toBe('INVALID_TOKEN');
  });
});
