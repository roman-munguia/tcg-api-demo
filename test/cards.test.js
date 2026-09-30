import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MISSING_CARD_ID, SEED_CARDS, cardId } from '../src/seed.js';
import { cardPayload, rules, startApi } from './helpers.js';

describe('cards', () => {
  let api;
  let admin;
  before(async () => {
    api = await startApi();
    admin = await api.login();
  });
  beforeEach(() => api.db.resetToSeed());
  after(() => api.close());

  describe('GET /cards?id=', () => {
    it('returns a seed card exactly', async () => {
      const res = await api.call('GET', '/cards', { query: { id: cardId(1) } });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, SEED_CARDS[0]);
      assert.match(res.headers.get('content-type'), /application\/json/);
    });

    it('without id returns ALL cards as an array, ordered by id', async () => {
      const res = await api.call('GET', '/cards');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.deepEqual(res.body, SEED_CARDS);
      const created = (await api.call('POST', '/cards', { token: admin, body: cardPayload() })).body;
      const after = await api.call('GET', '/cards');
      assert.equal(after.body.length, 26);
      assert.ok(after.body.some((c) => c.id === created.id));
      assert.deepEqual(rules((await api.call('GET', '/cards', { query: { limit: 5 } })).body), ['query.limit:additionalProperties']);
    });

    for (const bad of ['C0000000-0000-4000-8000-000000000001', 'abc', `urn:uuid:${cardId(1)}`, '']) {
      it(`400 pattern for malformed id '${bad}'`, async () => {
        const res = await api.call('GET', '/cards', { query: { id: bad } });
        assert.equal(res.status, 400);
        assert.deepEqual(rules(res.body), ['query.id:pattern']);
      });
    }

    it('400 singleValue for a repeated id', async () => {
      const res = await api.call('GET', '/cards', { query: { id: [cardId(1), cardId(2)] } });
      assert.deepEqual(rules(res.body), ['query.id:singleValue']);
      const same = await api.call('GET', '/cards', { query: { id: [cardId(1), cardId(1)] } });
      assert.match(same.body.details[0].message, /same value/);
    });

    it('404 for well-formed ids that do not exist', async () => {
      for (const id of [MISSING_CARD_ID, '00000000-0000-0000-0000-000000000000']) {
        const res = await api.call('GET', '/cards', { query: { id } });
        assert.equal(res.status, 404);
        assert.equal(res.body.code, 'NOT_FOUND');
      }
    });

    it('400 for unknown query parameters', async () => {
      const res = await api.call('GET', '/cards', { query: { id: cardId(1), expand: 'decks' } });
      assert.deepEqual(rules(res.body), ['query.expand:additionalProperties']);
    });
  });

  describe('POST /cards', () => {
    it('201 with Location, defaults and server fields', async () => {
      const payload = cardPayload();
      delete payload.description;
      delete payload.attributes;
      const res = await api.call('POST', '/cards', { token: admin, body: payload });
      assert.equal(res.status, 201);
      assert.equal(res.headers.get('location'), `/cards?id=${res.body.id}`);
      assert.equal(res.body.description, '');
      assert.deepEqual(res.body.attributes, {});
      assert.equal(res.body.createdAt, res.body.updatedAt);
      const get = await api.call('GET', res.headers.get('location'));
      assert.deepEqual(get.body, res.body);
    });

    it('accepts a GET body re-posted with a new name (read-only fields are ignored)', async () => {
      const seed = (await api.call('GET', '/cards', { query: { id: cardId(2) } })).body;
      const res = await api.call('POST', '/cards', { token: admin, body: { ...seed, name: 'Phoenix Copy' } });
      assert.equal(res.status, 201);
      assert.notEqual(res.body.id, seed.id);
      assert.notEqual(res.body.createdAt, seed.createdAt);
      assert.deepEqual(res.body.attributes, seed.attributes);
    });

    it('409 NAME_TAKEN ignoring case', async () => {
      const res = await api.call('POST', '/cards', { token: admin, body: cardPayload({ name: 'CINDERWING drake' }) });
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'NAME_TAKEN');
      assert.deepEqual(rules(res.body), ['body.name:unique']);
    });

    it('401 before anything else', async () => {
      const res = await api.call('POST', '/cards', { body: {} });
      assert.equal(res.status, 401);
      assert.equal(res.body.code, 'MISSING_TOKEN');
    });

    const invalid = [
      ['missing name', (p) => { delete p.name; }, 'body.name:required'],
      ['empty name', (p) => { p.name = ''; }, 'body.name:minLength'],
      ['81-char name', (p) => { p.name = 'x'.repeat(81); }, 'body.name:maxLength'],
      ['name not a string', (p) => { p.name = 42; }, 'body.name:type'],
      ['description too long', (p) => { p.description = 'x'.repeat(501); }, 'body.description:maxLength'],
      ['relative imageUrl', (p) => { p.imageUrl = '/img.png'; }, 'body.imageUrl:pattern'],
      ['ftp imageUrl', (p) => { p.imageUrl = 'ftp://x.example/a.png'; }, 'body.imageUrl:pattern'],
      ['imageUrl with a space', (p) => { p.imageUrl = 'https://bad host/x.png'; }, 'body.imageUrl:format'],
      ['dropRate 0', (p) => { p.dropRate = 0; }, 'body.dropRate:exclusiveMinimum'],
      ['dropRate 1.01', (p) => { p.dropRate = 1.01; }, 'body.dropRate:maximum'],
      ['dropRate as a percentage', (p) => { p.dropRate = 15; }, 'body.dropRate:maximum'],
      ['dropRate as text', (p) => { p.dropRate = '0.5'; }, 'body.dropRate:type'],
      ['missing dropRate', (p) => { delete p.dropRate; }, 'body.dropRate:required'],
      ['attribute key with a space', (p) => { p.attributes = { 'Bad Key': 1 }; }, 'body.attributes.Bad Key:propertyNames'],
      ['attribute key starting uppercase', (p) => { p.attributes = { Type: 'x' }; }, 'body.attributes.Type:propertyNames'],
      ['nested attribute object', (p) => { p.attributes = { stats: { a: 1 } }; }, 'body.attributes.stats:type'],
      ['object inside an attribute array', (p) => { p.attributes = { keywords: ['a', {}] }; }, 'body.attributes.keywords[1]:type'],
      ['empty attribute array', (p) => { p.attributes = { keywords: [] }; }, 'body.attributes.keywords:minItems'],
      ['11 attribute values', (p) => { p.attributes = { keywords: Array.from({ length: 11 }, (_, i) => `k${i}`) }; }, 'body.attributes.keywords:maxItems'],
      ['13 attributes', (p) => { p.attributes = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`k${i}`, i])); }, 'body.attributes:maxProperties'],
      ['empty attribute string', (p) => { p.attributes = { type: '' }; }, 'body.attributes.type:minLength'],
      ['attributes as an array', (p) => { p.attributes = ['a']; }, 'body.attributes:type'],
      ['unknown field', (p) => { p.rarity = 'Rare'; }, 'body.rarity:additionalProperties'],
      ['bad createdAt', (p) => { p.createdAt = 'yesterday'; }, 'body.createdAt:format'],
      ['bad id', (p) => { p.id = 'abc'; }, 'body.id:pattern'],
    ];
    for (const [title, mutate, expected] of invalid) {
      it(`400 ${title}`, async () => {
        const body = cardPayload();
        mutate(body);
        const res = await api.call('POST', '/cards', { token: admin, body });
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'VALIDATION_ERROR');
        assert.deepEqual(rules(res.body), [expected]);
      });
    }

    it('accepts boundary values', async () => {
      for (const overrides of [{ name: 'x'.repeat(80) }, { dropRate: 1 }, { dropRate: 0.0001 }, { description: 'x'.repeat(500) }]) {
        const res = await api.call('POST', '/cards', { token: admin, body: cardPayload(overrides) });
        assert.equal(res.status, 201, JSON.stringify(overrides));
      }
    });

    it('reports every problem at once, sorted by field', async () => {
      const res = await api.call('POST', '/cards', { token: admin, body: { dropRate: 5, droprate: 1 } });
      assert.deepEqual(rules(res.body), ['body.droprate:additionalProperties', 'body.dropRate:maximum', 'body.imageUrl:required', 'body.name:required']);
      assert.match(res.body.message, /body.dropRate must be <= 1; body.imageUrl is required/);
    });

    it('rejects query parameters on POST', async () => {
      const res = await api.call('POST', '/cards', { token: admin, query: { id: cardId(1) }, body: cardPayload() });
      assert.deepEqual(rules(res.body), ['query.id:additionalProperties']);
    });
  });

  describe('PUT /cards?id=', () => {
    it('replaces the whole card, keeps createdAt, bumps updatedAt', async () => {
      const before = SEED_CARDS[24];
      const res = await api.call('PUT', '/cards', {
        token: admin, query: { id: before.id },
        body: { name: before.name, imageUrl: before.imageUrl, dropRate: 0.5 },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.description, '');
      assert.deepEqual(res.body.attributes, {});
      assert.equal(res.body.createdAt, before.createdAt);
      assert.ok(res.body.updatedAt > before.updatedAt);
      const again = await api.call('PUT', '/cards', { token: admin, query: { id: before.id }, body: res.body });
      assert.ok(again.body.updatedAt > res.body.updatedAt, 'updatedAt increases even within the same millisecond');
    });

    it('accepts a GET response sent back unchanged', async () => {
      const seed = (await api.call('GET', '/cards', { query: { id: cardId(3) } })).body;
      const res = await api.call('PUT', '/cards', { token: admin, query: { id: seed.id }, body: seed });
      assert.equal(res.status, 200);
      assert.equal(res.body.name, seed.name);
    });

    it('400 idMatchesQuery when the body id differs', async () => {
      const res = await api.call('PUT', '/cards', { token: admin, query: { id: cardId(25) }, body: { ...SEED_CARDS[24], id: cardId(1) } });
      assert.deepEqual(rules(res.body), ['body.id:idMatchesQuery']);
    });

    it('404 for an unknown id, 409 for another card\'s name, own name is fine', async () => {
      const missing = await api.call('PUT', '/cards', { token: admin, query: { id: MISSING_CARD_ID }, body: cardPayload() });
      assert.equal(missing.status, 404);
      const clash = await api.call('PUT', '/cards', { token: admin, query: { id: cardId(25) }, body: cardPayload({ name: 'Cinder Imp' }) });
      assert.equal(clash.status, 409);
      const own = await api.call('PUT', '/cards', { token: admin, query: { id: cardId(25) }, body: cardPayload({ name: 'WANDERING glyph' }) });
      assert.equal(own.status, 200);
    });

    it('one 400 lists the missing ?id and the body problems together', async () => {
      const res = await api.call('PUT', '/cards', { token: admin, body: { dropRate: 7 } });
      assert.deepEqual(rules(res.body), ['body.dropRate:maximum', 'body.imageUrl:required', 'body.name:required', 'query.id:required']);
    });
  });

  describe('DELETE /cards?id=', () => {
    it('204 with an empty body, then 404', async () => {
      const res = await api.call('DELETE', '/cards', { token: admin, query: { id: cardId(25) } });
      assert.equal(res.status, 204);
      assert.equal(res.text, '');
      assert.equal(res.headers.get('content-type'), null);
      assert.equal((await api.call('GET', '/cards', { query: { id: cardId(25) } })).status, 404);
      assert.equal((await api.call('DELETE', '/cards', { token: admin, query: { id: cardId(25) } })).status, 404);
    });

    it('409 CARD_IN_USE lists the decks that use the card', async () => {
      const res = await api.call('DELETE', '/cards', { token: admin, query: { id: cardId(1) } });
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'CARD_IN_USE');
      assert.equal(res.body.details.length, 2);
      assert.ok(res.body.details.every((d) => d.field === 'query.id' && d.rule === 'notInUse'));
    });
  });

  describe('GET /cards/search', () => {
    const names = (res) => res.body.items.map((c) => c.name);

    it('pages through all 25 seed cards by name', async () => {
      const first = await api.call('GET', '/cards/search');
      assert.equal(first.status, 200);
      assert.deepEqual([first.body.items.length, first.body.page, first.body.pageSize, first.body.total, first.body.totalPages], [10, 1, 10, 25, 3]);
      const third = await api.call('GET', '/cards/search', { query: { page: 3 } });
      assert.deepEqual(names(third), ['Umbral Stalker', 'Undercurrent Snare', 'Wandering Glyph', "Warden's Oath", 'Zéphyr Kite']);
      const fourth = await api.call('GET', '/cards/search', { query: { page: 4 } });
      assert.deepEqual([fourth.body.items.length, fourth.body.total], [0, 25]);
    });

    const counts = [
      [{ element: 'Lumen' }, 5],
      [{ element: 'lumen' }, 5],
      [{ type: 'Spell' }, 5],
      [{ name: '&' }, 2],
      [{ name: "'s" }, 2],
      [{ name: 'zephyr' }, 0],
      [{ name: 'Zéphyr' }, 1],
      [{ minDropRate: 0.3 }, 9],
      [{ maxDropRate: 0.02 }, 2],
      [{ minPoints: 7 }, 3],
      [{ maxPoints: 1 }, 3],
      [{ type: 'Creature', element: 'Ember' }, 3],
      [{ element: 'Nope' }, 0],
    ];
    for (const [query, expected] of counts) {
      it(`${JSON.stringify(query)} finds ${expected}`, async () => {
        const res = await api.call('GET', '/cards/search', { query: { ...query, pageSize: 50 } });
        assert.equal(res.status, 200);
        assert.equal(res.body.total, expected);
      });
    }

    it('sorts by dropRate desc with an id tie-breaker', async () => {
      const res = await api.call('GET', '/cards/search', { query: { sortBy: 'dropRate', order: 'desc', pageSize: 50 } });
      const rates = res.body.items.map((c) => c.dropRate);
      assert.deepEqual(rates, rates.toSorted((a, b) => b - a));
      assert.equal(res.body.items[0].name, 'Zéphyr Kite');
      const tie = res.body.items.filter((c) => c.dropRate === 0.06).map((c) => c.id);
      assert.deepEqual(tie, tie.toSorted());
    });

    const badQueries = [
      [{ nmae: 'x' }, 'query.nmae:additionalProperties'],
      [{ name: '' }, 'query.name:minLength'],
      [{ pageSize: 51 }, 'query.pageSize:maximum'],
      [{ page: 0 }, 'query.page:minimum'],
      [{ page: 'two' }, 'query.page:type'],
      [{ sortBy: 'cost' }, 'query.sortBy:enum'],
      [{ order: 'up' }, 'query.order:enum'],
      [{ minDropRate: 0.5, maxDropRate: 0.1 }, 'query.minDropRate:minNotAboveMax'],
      [{ minPoints: 5, maxPoints: 2 }, 'query.minPoints:minNotAboveMax'],
      [{ name: ['a', 'b'] }, 'query.name:singleValue'],
    ];
    for (const [query, expected] of badQueries) {
      it(`400 for ${JSON.stringify(query)}`, async () => {
        const res = await api.call('GET', '/cards/search', { query });
        assert.equal(res.status, 400);
        assert.deepEqual(rules(res.body), [expected]);
      });
    }
  });
});
