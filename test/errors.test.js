import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { MISSING_CARD_ID, cardId } from '../src/seed.js';
import { cardPayload, rules, startApi } from './helpers.js';

describe('errors, headers and check order', () => {
  let api;
  let admin;
  let viewer;
  before(async () => {
    api = await startApi();
    admin = await api.login();
    viewer = await api.login('viewer');
  });
  after(() => api.close());

  it('400 INVALID_JSON for malformed JSON and top-level strings', async () => {
    for (const rawBody of ['{"name": "x",}', '"just a string"', '{bad json']) {
      const res = await api.call('POST', '/cards', { token: admin, rawBody, headers: { 'Content-Type': 'application/json' } });
      assert.equal(res.status, 400, rawBody);
      assert.equal(res.body.code, 'INVALID_JSON');
    }
  });

  it('400 body:type for an array body', async () => {
    const res = await api.call('POST', '/cards', { token: admin, body: [cardPayload()] });
    assert.deepEqual(rules(res.body), ['body:type']);
  });

  it('415 for text/plain, octet-stream, no body; message says what arrived', async () => {
    const plain = await api.call('POST', '/cards', { token: admin, rawBody: JSON.stringify(cardPayload()), headers: { 'Content-Type': 'text/plain' } });
    assert.equal(plain.status, 415);
    assert.match(plain.body.message, /'text\/plain'/);
    assert.deepEqual(rules(plain.body), ['header.content-type:mediaType']);
    const octet = await api.call('POST', '/cards', { token: admin, rawBody: 'x', headers: { 'Content-Type': 'application/octet-stream' } });
    assert.equal(octet.status, 415);
    const none = await api.call('POST', '/cards', { token: admin });
    assert.equal(none.status, 415);
    assert.match(none.body.message, /No request body/);
    // An empty body WITH a JSON Content-Type parses to {} and fails validation instead.
    const empty = await api.call('POST', '/cards', { token: admin, headers: { 'Content-Type': 'application/json' } });
    assert.deepEqual(rules(empty.body), ['body.dropRate:required', 'body.imageUrl:required', 'body.name:required']);
  });

  it('415 for an unsupported charset, 413 for a body over 100 kB', async () => {
    const latin = await api.call('POST', '/cards', { token: admin, rawBody: '{}', headers: { 'Content-Type': 'application/json; charset=latin1' } });
    assert.equal(latin.status, 415);
    const big = await api.call('POST', '/cards', { token: admin, body: cardPayload({ description: 'x'.repeat(110_000) }) });
    assert.equal(big.status, 413);
    assert.equal(big.body.code, 'PAYLOAD_TOO_LARGE');
  });

  it('JSON 404 for unknown routes (also under /docs), 405 with Allow for wrong methods', async () => {
    const nope = await api.call('GET', '/nope');
    assert.equal(nope.status, 404);
    assert.equal(nope.body.code, 'ROUTE_NOT_FOUND');
    const docsNope = await api.call('GET', '/docs/nope');
    assert.equal(docsNope.body.code, 'ROUTE_NOT_FOUND');
    const patch = await api.call('PATCH', '/cards');
    assert.equal(patch.status, 405);
    assert.equal(patch.headers.get('allow'), 'GET, HEAD, POST, PUT, DELETE');
    const upper = await api.call('PATCH', '/CARDS/');
    assert.equal(upper.status, 405);
    const schema = await api.call('POST', '/schemas/Card.json');
    assert.equal(schema.status, 405);
    const login = await api.call('GET', '/auth/login');
    assert.deepEqual([login.status, login.headers.get('allow')], [405, 'POST']);
  });

  it('a client error from Express (bad %-escape) stays a 4xx', async () => {
    const res = await fetch(`${api.baseUrl}/schemas/%E0.json`);
    assert.ok(res.status >= 400 && res.status < 500, String(res.status));
  });

  it('HEAD works on GET routes; OPTIONS preflight answers 204 with CORS headers', async () => {
    const head = await api.call('HEAD', '/cards', { query: { id: cardId(1) } });
    assert.equal(head.status, 200);
    assert.equal(head.text, '');
    const pre = await fetch(`${api.baseUrl}/cards`, {
      method: 'OPTIONS', headers: { Origin: 'http://example.test', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization' },
    });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), '*');
    assert.match(pre.headers.get('access-control-allow-headers'), /Authorization/);
    assert.match(pre.headers.get('access-control-allow-headers'), /X-Chaos-Key/);
    assert.match(pre.headers.get('access-control-expose-headers'), /Location/);
  });

  it('OPTIONS without CORS preflight: 204 + Allow on known paths, 404 elsewhere', async () => {
    const known = await fetch(`${api.baseUrl}/cards`, { method: 'OPTIONS' });
    assert.deepEqual([known.status, known.headers.get('allow')], [204, 'GET, HEAD, POST, PUT, DELETE']);
    assert.equal((await fetch(`${api.baseUrl}/nope`, { method: 'OPTIONS' })).status, 404);
    const stock = await fetch(`${api.baseUrl}/docs/index.html`, { redirect: 'manual' });
    assert.deepEqual([stock.status, stock.headers.get('location')], [301, '/docs/']);
  });

  it('no x-powered-by or etag; X-Request-Id echoed or generated and equal to requestId', async () => {
    const res = await api.call('GET', '/nope', { headers: { 'X-Request-Id': 'my-trace-1' } });
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('x-request-id'), 'my-trace-1');
    assert.equal(res.body.requestId, 'my-trace-1');
    const ok = await api.call('GET', '/health');
    assert.equal(ok.headers.get('etag'), null);
    const generated = await api.call('GET', '/nope', { headers: { 'X-Request-Id': 'bad id with spaces' } });
    assert.match(generated.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  });

  describe('check order', () => {
    it('viewer + invalid body -> 403', async () => {
      const res = await api.call('POST', '/cards', { token: viewer, body: { nope: 1 } });
      assert.equal(res.status, 403);
    });
    it('no token + malformed id -> 401', async () => {
      const res = await api.call('DELETE', '/cards', { query: { id: 'bad' } });
      assert.equal(res.status, 401);
    });
    it('admin + text/plain body -> 415 before validation', async () => {
      const res = await api.call('PUT', '/cards', { token: admin, rawBody: 'x', headers: { 'Content-Type': 'text/plain' } });
      assert.equal(res.status, 415);
    });
    it('admin + valid body + unknown id -> 404', async () => {
      const res = await api.call('PUT', '/cards', { token: admin, query: { id: MISSING_CARD_ID }, body: cardPayload() });
      assert.equal(res.status, 404);
    });
    it('a bad teaching header is checked first', async () => {
      const res = await api.call('POST', '/cards', { body: cardPayload(), headers: { 'X-Delay-Ms': 'soon' } });
      assert.equal(res.status, 400);
      assert.deepEqual(rules(res.body), ['header.x-delay-ms:type']);
    });
  });

  it('CORS with an origin list', async () => {
    const listed = await startApi({ CORS_ORIGIN: 'http://a.test, http://b.test' });
    try {
      const yes = await fetch(`${listed.baseUrl}/health`, { headers: { Origin: 'http://b.test' } });
      assert.equal(yes.headers.get('access-control-allow-origin'), 'http://b.test');
      assert.match(yes.headers.get('vary'), /Origin/);
      const no = await fetch(`${listed.baseUrl}/health`, { headers: { Origin: 'http://evil.test' } });
      assert.equal(no.headers.get('access-control-allow-origin'), null);
    } finally {
      await listed.close();
    }
  });
});
