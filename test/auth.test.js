import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { cardId } from '../src/seed.js';
import { cardPayload, startApi } from './helpers.js';

describe('auth', () => {
  let api;
  before(async () => { api = await startApi({ TOKEN_TTL_SECONDS: '60' }); });
  after(() => api.close());

  it('logs in both users with a tcg_ token', async () => {
    for (const [username, password, role] of [['admin', 'admin123', 'admin'], ['viewer', 'viewer123', 'viewer']]) {
      const res = await api.call('POST', '/auth/login', { body: { username, password } });
      assert.equal(res.status, 200);
      assert.match(res.body.token, /^tcg_[A-Za-z0-9_-]{43}$/);
      assert.equal(res.body.tokenType, 'Bearer');
      assert.equal(res.body.expiresIn, 60);
      assert.deepEqual(res.body.user, { username, role });
      assert.equal(res.headers.get('set-cookie'), null);
    }
  });

  it('rejects wrong credentials with 401 INVALID_CREDENTIALS', async () => {
    for (const body of [{ username: 'admin', password: 'nope' }, { username: 'Admin', password: 'admin123' }, { username: 'x', password: 'admin123' }]) {
      const res = await api.call('POST', '/auth/login', { body });
      assert.equal(res.status, 401);
      assert.equal(res.body.code, 'INVALID_CREDENTIALS');
      assert.match(res.headers.get('www-authenticate'), /^Bearer realm="glyphwild"/);
    }
  });

  it('validates the login body', async () => {
    const missing = await api.call('POST', '/auth/login', { body: { username: 'admin' } });
    assert.equal(missing.status, 400);
    assert.deepEqual(missing.body.details.map((d) => [d.field, d.rule]), [['body.password', 'required']]);
    const extra = await api.call('POST', '/auth/login', { body: { username: 'admin', password: 'admin123', remember: true } });
    assert.equal(extra.status, 400);
    assert.equal(extra.body.details[0].rule, 'additionalProperties');
  });

  it('GET /auth/me returns the token owner', async () => {
    const token = await api.login('viewer');
    const res = await api.call('GET', '/auth/me', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.username, 'viewer');
    assert.equal(res.body.role, 'viewer');
  });

  const authCases = [
    ['no header', {}, 'MISSING_TOKEN', /needs a token/],
    ['raw token without Bearer', { Authorization: 'tcg_abc' }, 'MALFORMED_AUTH_HEADER', /Prefix the token/],
    ['Basic auth', { Authorization: 'Basic YWRtaW46YWRtaW4xMjM=' }, 'MALFORMED_AUTH_HEADER', /not Basic auth/],
    ['Bearer twice', { Authorization: 'Bearer Bearer tcg_x' }, 'MALFORMED_AUTH_HEADER', /twice/],
    ['Bearer alone', { Authorization: 'Bearer' }, 'MALFORMED_AUTH_HEADER', /missing after/],
    ['other scheme', { Authorization: 'Token abc' }, 'MALFORMED_AUTH_HEADER', /must look like/],
    ['undefined token', { Authorization: 'Bearer undefined' }, 'INVALID_TOKEN', /does not look like a Glyphwild token/],
    ['quoted token', { Authorization: `Bearer "tcg_${'a'.repeat(43)}"` }, 'INVALID_TOKEN', /does not look like/],
    ['unknown token', { Authorization: `Bearer tcg_${'a'.repeat(43)}` }, 'INVALID_TOKEN', /Unknown or revoked/],
  ];
  for (const [title, headers, code, message] of authCases) {
    it(`401 ${code}: ${title}`, async () => {
      const res = await api.call('GET', '/auth/me', { headers });
      assert.equal(res.status, 401);
      assert.equal(res.body.code, code);
      assert.match(res.body.message, message);
      assert.ok(res.headers.get('www-authenticate').startsWith('Bearer realm="glyphwild"'));
    });
  }

  it('accepts a lowercase bearer scheme', async () => {
    const token = await api.login();
    const res = await api.call('GET', '/auth/me', { headers: { Authorization: `bearer ${token}` } });
    assert.equal(res.status, 200);
  });

  it('expires tokens after TOKEN_TTL_SECONDS', async () => {
    const token = await api.login();
    api.clock.advance(61_000);
    for (let i = 0; i < 2; i++) {
      const res = await api.call('GET', '/auth/me', { token });
      assert.equal(res.status, 401);
      assert.equal(res.body.code, 'TOKEN_EXPIRED');
      assert.match(res.headers.get('www-authenticate'), /error="invalid_token"/);
    }
  });

  it('logout revokes only that token', async () => {
    const a = await api.login();
    const b = await api.login();
    assert.equal((await api.call('POST', '/auth/logout', { token: a })).status, 204);
    assert.equal((await api.call('GET', '/auth/me', { token: a })).body.code, 'INVALID_TOKEN');
    assert.equal((await api.call('GET', '/auth/me', { token: b })).status, 200);
  });

  it('viewer gets 403 FORBIDDEN_ROLE on every write and on /reset', async () => {
    const token = await api.login('viewer');
    const writes = [
      ['POST', '/cards', {}, cardPayload()],
      ['PUT', '/cards', { id: cardId(25) }, cardPayload()],
      ['DELETE', '/cards', { id: cardId(25) }],
      ['POST', '/decks', {}, { name: 'x', theme: 'y', difficulty: 'beginner' }],
      ['PUT', '/decks', { id: cardId(1) }, {}],
      ['DELETE', '/decks', { id: cardId(1) }],
      ['POST', '/reset', {}],
    ];
    for (const [method, path, query, body] of writes) {
      const res = await api.call(method, path, { token, query, body });
      assert.equal(res.status, 403, `${method} ${path}`);
      assert.equal(res.body.code, 'FORBIDDEN_ROLE');
      assert.equal(res.headers.get('www-authenticate'), null);
    }
  });

  it('public reads ignore the Authorization header', async () => {
    const res = await api.call('GET', '/cards', { query: { id: cardId(1) }, headers: { Authorization: 'junk' } });
    assert.equal(res.status, 200);
  });

  it('tokens survive POST /reset', async () => {
    const token = await api.login();
    assert.equal((await api.call('POST', '/reset', { token })).status, 200);
    assert.equal((await api.call('GET', '/auth/me', { token })).status, 200);
  });
});
