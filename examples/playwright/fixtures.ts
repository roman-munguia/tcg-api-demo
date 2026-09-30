// Custom fixtures: log in ONCE per worker and hand every test ready-made clients.
//
//   adminRequest / viewerRequest  API clients that already send 'Authorization: Bearer <token>'
//   cleanup                       remember what a test created; it is deleted after the test (even when it fails)
//
// Use them by importing `test` from this file instead of from '@playwright/test'.
// (04-auth.spec.ts shows the manual ways first: log in inside the test, then reuse the token.)
import { test as base, expect, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import { CREDENTIALS } from './data';

type Role = keyof typeof CREDENTIALS;

class Cleanup {
  private cards: string[] = [];
  private decks: string[] = [];
  card(id: string) { this.cards.push(id); }
  deck(id: string) { this.decks.push(id); }

  /** Decks first, then cards: a card that is still in a deck cannot be deleted (409 CARD_IN_USE). */
  async run(admin: APIRequestContext) {
    const targets = [...this.decks.map((id) => `/decks?id=${id}`), ...this.cards.map((id) => `/cards?id=${id}`)];
    for (const url of targets) {
      // Retry simulated failures, in case a chaos knob is on.
      await expect(async () => {
        const res = await admin.delete(url);
        expect([204, 404]).toContain(res.status());
      }).toPass({ intervals: [100, 250, 500], timeout: 5_000 });
    }
  }
}

type WorkerFixtures = { adminToken: string; viewerToken: string };
type TestFixtures = { adminRequest: APIRequestContext; viewerRequest: APIRequestContext; cleanup: Cleanup };

async function loginToken(playwright: PlaywrightWorkerArgs['playwright'], baseURL: string, role: Role): Promise<string> {
  const context = await playwright.request.newContext({ baseURL });
  const res = await context.post('/auth/login', { data: CREDENTIALS[role] });
  if (res.status() === 401) {
    throw new Error(`The API rejected the ${role} credentials. If your instructor changed them, set ADMIN_*/VIEWER_* (the repo .env is read automatically).`);
  }
  await expect(res).toBeOK();
  const { token } = await res.json();
  await context.dispose();
  return token;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Worker-scoped: runs once per worker process. The test-scoped `baseURL` fixture is not available here,
  // so read it from the project config.
  adminToken: [async ({ playwright }, use, workerInfo) => {
    await use(await loginToken(playwright, workerInfo.project.use.baseURL!, 'admin'));
  }, { scope: 'worker' }],
  viewerToken: [async ({ playwright }, use, workerInfo) => {
    await use(await loginToken(playwright, workerInfo.project.use.baseURL!, 'viewer'));
  }, { scope: 'worker' }],

  adminRequest: async ({ playwright, baseURL, adminToken }, use) => {
    const context = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` } });
    await use(context);
    await context.dispose();
  },
  viewerRequest: async ({ playwright, baseURL, viewerToken }, use) => {
    const context = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${viewerToken}` } });
    await use(context);
    await context.dispose();
  },

  cleanup: async ({ adminRequest }, use) => {
    const cleanup = new Cleanup();
    await use(cleanup);
    await cleanup.run(adminRequest);
  },
});

export { expect };
