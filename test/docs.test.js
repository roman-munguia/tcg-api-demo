// The documentation is part of the product: these tests keep it complete and truthful.

import assert from 'node:assert/strict';
import vm from 'node:vm';
import { after, before, describe, it } from 'node:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as S from '../src/schemas.js';
import { SEED_CARDS, SEED_DECKS } from '../src/seed.js';
import { responseAjv, startApi } from './helpers.js';

/** Calls visit(node, path) for every schema node. */
function walk(node, path, visit) {
  visit(node, path);
  for (const [key, child] of Object.entries(node.properties ?? {})) walk(child, `${path}.${key}`, visit);
  if (node.items) walk(node.items, `${path}[]`, visit);
  if (node.additionalProperties && typeof node.additionalProperties === 'object') walk(node.additionalProperties, `${path}{*}`, visit);
  if (node.propertyNames) walk(node.propertyNames, `${path}{name}`, visit);
}

const QUERY_SCHEMAS = { IdQuery: S.IdQuery, NoQuery: S.NoQuery, CardSearchQuery: S.CardSearchQuery, DeckSearchQuery: S.DeckSearchQuery };

describe('schemas are well documented', () => {
  for (const [name, schema] of Object.entries({ ...S.PUBLIC_SCHEMAS, ...QUERY_SCHEMAS })) {
    it(`${name}: every node has a description, examples and real limits`, () => {
      assert.ok(schema.title, 'top-level title');
      walk(schema, name, (node, path) => {
        assert.ok(node.description, `${path} has no description`);
        assert.ok(Array.isArray(node.examples) && node.examples.length > 0, `${path} has no examples`);
        assert.equal(node.example, undefined, `${path} uses 'example'; use 'examples'`);
        assert.equal(node.$ref, undefined, `${path} uses $ref`);
        const types = [node.type].flat();
        if (types.includes('string')) {
          assert.ok(node.maxLength || node.enum || node.const || node.pattern, `${path} is an unbounded string`);
        }
        if (types.includes('array')) assert.ok(node.maxItems, `${path} has no maxItems`);
        if (node.type === 'object' && node.properties) assert.ok('additionalProperties' in node, `${path} has no additionalProperties decision`);
      });
    });
  }

  it('each schema example validates against its own schema', () => {
    const ajv = responseAjv();
    for (const [name, schema] of Object.entries(S.PUBLIC_SCHEMAS)) {
      const validate = ajv.compile(schema);
      for (const example of schema.examples) assert.ok(validate(example), `${name}: ${ajv.errorsText(validate.errors)}`);
    }
  });

  it('every seed record is a valid Card/Deck and a valid CardInput/DeckInput', () => {
    const ajv = responseAjv();
    const [card, cardInput, deck, deckInput] = [S.Card, S.CardInput, S.Deck, S.DeckInput].map((s) => ajv.compile(s));
    for (const c of SEED_CARDS) assert.ok(card(c) && cardInput(c), c.name);
    for (const d of SEED_DECKS) assert.ok(deck(S.withTotal(d)) && deckInput(S.withTotal(d)), d.name);
  });
});

describe('OpenAPI document and docs pages', () => {
  let api;
  before(async () => { api = await startApi(); });
  after(() => api.close());

  it('every operation is documented and protected ones declare security', () => {
    const protectedOps = ['createCard', 'replaceCard', 'deleteCard', 'createDeck', 'replaceDeck', 'deleteDeck', 'resetData', 'getMe', 'logout'];
    for (const [path, ops] of Object.entries(api.openapi.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        const where = `${method.toUpperCase()} ${path}`;
        for (const key of ['operationId', 'summary', 'description', 'tags']) assert.ok(op[key], `${where} has no ${key}`);
        assert.ok(Object.keys(op.responses).some((s) => s.startsWith('2')), `${where} has no 2xx response`);
        assert.equal(Boolean(op.security), protectedOps.includes(op.operationId), `${where} security`);
      }
    }
  });

  it('every documented operation exists', async () => {
    for (const [path, ops] of Object.entries(api.openapi.paths)) {
      for (const method of Object.keys(ops)) {
        const res = await fetch(new URL(path.replace('{file}', 'Card.json'), api.baseUrl), { method: method.toUpperCase() });
        const body = res.headers.get('content-type')?.includes('json') ? await res.json() : {};
        assert.ok(!['ROUTE_NOT_FOUND', 'METHOD_NOT_ALLOWED'].includes(body.code), `${method} ${path}`);
      }
    }
  });

  it('every named request example returns the status in its summary', async () => {
    for (const [path, ops] of Object.entries(api.openapi.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        const examples = op.requestBody?.content['application/json'].examples ?? {};
        const idExample = op.parameters?.find((p) => p.name === 'id')?.example;
        for (const [key, example] of Object.entries(examples)) {
          const expected = /^(\d{3}) - /.exec(example.summary)?.[1];
          assert.ok(expected, `${op.operationId}.${key} summary must start with the status`);
          api.db.resetToSeed();
          const token = await api.login();
          const res = await api.call(method.toUpperCase(), path, { token, body: example.value, query: idExample ? { id: idExample } : undefined });
          assert.equal(String(res.status), expected, `${op.operationId}.${key}: ${res.text}`);
        }
      }
    }
    api.db.resetToSeed();
  });

  it('custom credentials are never published in the docs', async () => {
    const custom = await startApi({ ADMIN_PASSWORD: 'S3cret-for-class', VIEWER_PASSWORD: 'other-secret' });
    try {
      const text = JSON.stringify(custom.openapi);
      assert.doesNotMatch(text, /S3cret-for-class|other-secret/);
      assert.match(custom.openapi.info.description, /ask your instructor/);
    } finally {
      await custom.close();
    }
  });

  it('/openapi.json has an absolute server URL for Postman/Bruno imports', async () => {
    const res = await api.call('GET', '/openapi.json');
    assert.equal(res.body.openapi, '3.1.0');
    assert.equal(res.body.servers[0].url, api.baseUrl);
  });

  it('/schemas lists self-contained schemas that compile in Ajv 2020 and draft-07', async () => {
    const index = await api.call('GET', '/schemas');
    assert.equal(index.body.items.length, Object.keys(S.PUBLIC_SCHEMAS).length);
    for (const { url } of index.body.items) {
      const schema = (await api.call('GET', url)).body;
      addFormats(new Ajv({ allowUnionTypes: true, strict: true })).compile(schema);
      responseAjv().compile(schema);
    }
    const card = (await api.call('GET', '/schemas/Card.json')).body;
    assert.ok(responseAjv().compile(card)(SEED_CARDS[0]));
    assert.equal((await api.call('GET', '/schemas/Nope.json')).status, 404);
  });

  it('/ and /docs redirect; /docs/ is the Swagger page', async () => {
    const root = await fetch(`${api.baseUrl}/`, { redirect: 'manual' });
    assert.deepEqual([root.status, root.headers.get('location')], [302, '/docs/']);
    const docs = await fetch(`${api.baseUrl}/docs`, { redirect: 'manual' });
    assert.deepEqual([docs.status, docs.headers.get('location')], [301, '/docs/']);
    const page = await fetch(`${api.baseUrl}/docs/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Glyphwild TCG API - docs/);
  });

  it('the Swagger init script applies the login token automatically', async () => {
    const source = await (await fetch(`${api.baseUrl}/docs/swagger-ui-init.js`)).text();
    const calls = [];
    let captured;
    const ui = { preauthorizeApiKey: (...args) => calls.push(args) };
    const SwaggerUIBundle = (options) => { captured = options; return ui; };
    SwaggerUIBundle.presets = { apis: {} };
    SwaggerUIBundle.plugins = { DownloadUrl: {} };
    const window = { location: { search: '', origin: 'http://localhost' } };
    const context = vm.createContext({ window, SwaggerUIBundle, SwaggerUIStandalonePreset: {}, console, setInterval, clearInterval });
    new vm.Script(source).runInContext(context);
    window.onload();
    assert.equal(captured.url, '/openapi.json');
    assert.equal(typeof captured.responseInterceptor, 'function');
    assert.equal(window.ui, ui);

    const token = `tcg_${'a'.repeat(43)}`;
    captured.responseInterceptor({ ok: true, url: 'http://localhost/auth/login', body: { token } });
    captured.responseInterceptor({ ok: true, url: 'http://localhost/cards?id=x', body: { token: 'ignored' } });
    captured.responseInterceptor({ ok: false, url: 'http://localhost/auth/login', body: {} });
    assert.deepEqual(calls, [['bearerAuth', token]]);
  });
});
