import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MISSING_CARD_ID, cardId } from '../src/seed.js';
import { cardPayload, rules, startApi } from './helpers.js';

const timed = async (fn) => {
  const start = performance.now();
  const result = await fn();
  return { result, ms: performance.now() - start };
};

describe('teaching knobs', () => {
  it('LATENCY_MS slows /cards and /decks only', async () => {
    const api = await startApi({ LATENCY_MS: '300' });
    try {
      const slow = await timed(() => api.call('GET', '/cards/search'));
      assert.ok(slow.ms >= 290, `took ${slow.ms}`);
      assert.equal(slow.result.headers.get('x-delay-applied-ms'), '300');
      for (const [method, path, body] of [['GET', '/health'], ['POST', '/auth/login', { username: 'admin', password: 'admin123' }], ['GET', '/docs/'], ['PATCH', '/cards']]) {
        const fast = await timed(() => api.call(method, path, { body }));
        assert.ok(fast.ms < 200, `${method} ${path} took ${fast.ms}`);
      }
    } finally {
      await api.close();
    }
  });

  it('X-Delay-Ms adds a per-request delay and is validated', async () => {
    const api = await startApi();
    try {
      const slow = await timed(() => api.call('GET', '/decks/search', { headers: { 'X-Delay-Ms': '200' } }));
      assert.ok(slow.ms >= 190);
      assert.equal(slow.result.headers.get('x-delay-applied-ms'), '200');
      assert.deepEqual(rules((await api.call('GET', '/cards/search', { headers: { 'X-Delay-Ms': '10001' } })).body), ['header.x-delay-ms:maximum']);
      assert.deepEqual(rules((await api.call('GET', '/cards/search', { headers: { 'X-Delay-Ms': '-5' } })).body), ['header.x-delay-ms:type']);
      assert.deepEqual(rules((await api.call('GET', '/cards/search', { headers: { 'X-Delay-Ms': '1.5' } })).body), ['header.x-delay-ms:type']);
    } finally {
      await api.close();
    }
  });

  it('TEACHING_HEADERS=false ignores the teaching headers', async () => {
    const api = await startApi({ TEACHING_HEADERS: 'false' });
    try {
      const res = await api.call('GET', '/cards/search', { headers: { 'X-Delay-Ms': 'abc', 'X-Chaos-Fail-Times': '5' } });
      assert.equal(res.status, 200);
    } finally {
      await api.close();
    }
  });

  it('CHAOS_RATE=1 fails only requests that would have succeeded, and writes nothing', async () => {
    const api = await startApi({ CHAOS_RATE: '1' });
    try {
      const admin = await api.login();
      const before = api.db.count('cards');
      const post = await api.call('POST', '/cards', { token: admin, body: cardPayload() });
      assert.equal(post.status, 500);
      assert.equal(post.body.code, 'CHAOS_INJECTED');
      assert.equal(post.headers.get('x-chaos'), 'injected');
      assert.equal(api.db.count('cards'), before);
      assert.equal((await api.call('POST', '/cards', { token: admin, body: { name: '' } })).status, 400);
      assert.equal((await api.call('POST', '/cards', { body: cardPayload() })).status, 401);
      assert.equal((await api.call('GET', '/cards', { query: { id: MISSING_CARD_ID } })).status, 404);
      assert.equal((await api.call('DELETE', '/cards', { token: admin, query: { id: cardId(1) } })).status, 409);
      assert.equal((await api.call('POST', '/cards', { token: admin, body: cardPayload({ name: 'Cinder Imp' }) })).status, 409);
      assert.equal((await api.call('GET', '/cards', { query: { id: cardId(1) } })).status, 500);
      assert.equal((await api.call('GET', '/health')).status, 200);
      assert.equal((await api.call('POST', '/reset', { token: admin })).status, 200);
    } finally {
      await api.close();
    }
  });

  it('CHAOS_RATE=0 never fails', async () => {
    const api = await startApi();
    try {
      for (let i = 0; i < 30; i++) assert.equal((await api.call('GET', '/cards/search')).status, 200);
    } finally {
      await api.close();
    }
  });

  it('X-Chaos-Fail-Times + X-Chaos-Key: fail N times, then pass; keys are independent; reset clears them', async () => {
    const api = await startApi();
    try {
      const get = (key, times = '2') => api.call('GET', '/cards', { query: { id: cardId(1) }, headers: { 'X-Chaos-Fail-Times': times, 'X-Chaos-Key': key } });
      assert.deepEqual([(await get('k1')).status, (await get('k1')).status, (await get('k1')).status, (await get('k1')).status], [500, 500, 200, 200]);
      assert.equal((await get('k2', '1')).status, 500);
      assert.equal((await get('k2', '1')).status, 200);
      await api.call('POST', '/reset', { token: await api.login() });
      assert.equal((await get('k1')).status, 500);

      const onlyTimes = await api.call('GET', '/cards/search', { headers: { 'X-Chaos-Fail-Times': '2' } });
      assert.deepEqual(rules(onlyTimes.body), ['header.x-chaos-key:requiredWith']);
      const onlyKey = await api.call('GET', '/cards/search', { headers: { 'X-Chaos-Key': 'abc' } });
      assert.deepEqual(rules(onlyKey.body), ['header.x-chaos-fail-times:requiredWith']);
      const tooMany = await api.call('GET', '/cards/search', { headers: { 'X-Chaos-Fail-Times': '6', 'X-Chaos-Key': 'abc' } });
      assert.deepEqual(rules(tooMany.body), ['header.x-chaos-fail-times:maximum']);
    } finally {
      await api.close();
    }
  });

  it('POST /reset restores mutated and deleted seed data', async () => {
    const api = await startApi();
    try {
      const admin = await api.login();
      await api.call('DELETE', '/cards', { token: admin, query: { id: cardId(25) } });
      await api.call('POST', '/cards', { token: admin, body: cardPayload() });
      const res = await api.call('POST', '/reset', { token: admin });
      assert.equal(res.status, 200);
      assert.deepEqual([res.body.cards, res.body.decks], [25, 6]);
      assert.equal((await api.call('GET', '/cards', { query: { id: cardId(25) } })).status, 200);
      assert.equal(api.db.count('cards'), 25);
    } finally {
      await api.close();
    }
  });
});
