import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { withTotal } from '../src/schemas.js';
import { MISSING_CARD_ID, MISSING_DECK_ID, SEED_DECKS, cardId, deckId } from '../src/seed.js';
import { cardPayload, deckPayload, rules, startApi } from './helpers.js';

describe('decks', () => {
  let api;
  let admin;
  before(async () => {
    api = await startApi();
    admin = await api.login();
  });
  beforeEach(() => api.db.resetToSeed());
  after(() => api.close());

  it('GET returns a seed deck with the computed totalCards', async () => {
    const res = await api.call('GET', '/decks', { query: { id: deckId(1) } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, withTotal(SEED_DECKS[0]));
    assert.equal(res.body.totalCards, 10);
    assert.equal((await api.call('GET', '/decks', { query: { id: MISSING_DECK_ID } })).status, 404);
    const all = await api.call('GET', '/decks');
    assert.equal(all.status, 200);
    assert.deepEqual(all.body, SEED_DECKS.map(withTotal));
  });

  it('POST keeps card order, computes totalCards, ignores read-only fields', async () => {
    const cards = [{ cardId: cardId(9), quantity: 1 }, { cardId: cardId(7), quantity: 3 }];
    const res = await api.call('POST', '/decks', { token: admin, body: deckPayload({ cards, totalCards: 12, id: deckId(1) }) });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.cards, cards);
    assert.equal(res.body.totalCards, 4);
    assert.notEqual(res.body.id, deckId(1));
    assert.equal(res.headers.get('location'), `/decks?id=${res.body.id}`);
  });

  it('POST an empty deck (defaults)', async () => {
    const res = await api.call('POST', '/decks', { token: admin, body: { name: 'Only Required', theme: 'x', difficulty: 'expert' } });
    assert.equal(res.status, 201);
    assert.deepEqual([res.body.cards, res.body.totalCards, res.body.description], [[], 0, '']);
  });

  const invalid = [
    ['quantity 0', { cards: [{ cardId: cardId(1), quantity: 0 }] }, ['body.cards[0].quantity:minimum']],
    ['quantity 4', { cards: [{ cardId: cardId(1), quantity: 4 }] }, ['body.cards[0].quantity:maximum']],
    ['quantity 1.5', { cards: [{ cardId: cardId(1), quantity: 1.5 }] }, ['body.cards[0].quantity:type']],
    ['bad cardId', { cards: [{ cardId: 'abc', quantity: 1 }] }, ['body.cards[0].cardId:pattern']],
    ['missing quantity', { cards: [{ cardId: cardId(1) }] }, ['body.cards[0].quantity:required']],
    ['extra field in an entry', { cards: [{ cardId: cardId(1), quantity: 1, name: 'x' }] }, ['body.cards[0].name:additionalProperties']],
    ['unknown difficulty', { difficulty: 'easy' }, ['body.difficulty:enum']],
    ['uppercase difficulty', { difficulty: 'Beginner' }, ['body.difficulty:enum']],
    ['missing theme', { theme: undefined }, ['body.theme:required']],
    ['61-char theme', { theme: 'x'.repeat(61) }, ['body.theme:maxLength']],
    ['card listed twice', { cards: [{ cardId: cardId(1), quantity: 1 }, { cardId: cardId(2), quantity: 1 }, { cardId: cardId(1), quantity: 2 }] },
      ['body.cards[2].cardId:uniqueCardIds']],
    ['41 entries', { cards: Array.from({ length: 41 }, (_, i) => ({ cardId: cardId(i + 1), quantity: 1 })) }, ['body.cards:maxItems']],
    ['43 cards in total', { cards: Array.from({ length: 15 }, (_, i) => ({ cardId: cardId(i + 1), quantity: i < 13 ? 3 : 2 })) },
      ['body.cards:maxTotalCards']],
    ['unknown cards', { cards: [{ cardId: cardId(1), quantity: 1 }, { cardId: MISSING_CARD_ID, quantity: 1 }] }, ['body.cards[1].cardId:cardExists']],
  ];
  for (const [title, overrides, expected] of invalid) {
    it(`400 ${title}`, async () => {
      const body = deckPayload(overrides);
      for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];
      const res = await api.call('POST', '/decks', { token: admin, body });
      assert.equal(res.status, 400);
      assert.deepEqual(rules(res.body), expected);
    });
  }

  it('details are sorted with numeric array indexes', async () => {
    const cards = Array.from({ length: 12 }, (_, i) => ({ cardId: cardId(i + 1), quantity: [2, 5, 8, 11].includes(i) ? 9 : 1 }));
    const res = await api.call('POST', '/decks', { token: admin, body: deckPayload({ cards }) });
    assert.deepEqual(res.body.details.map((d) => d.field), [2, 5, 8, 11].map((i) => `body.cards[${i}].quantity`));
  });

  it('40 cards in total is allowed', async () => {
    const cards = Array.from({ length: 14 }, (_, i) => ({ cardId: cardId(i + 1), quantity: i < 12 ? 3 : 2 }));
    const res = await api.call('POST', '/decks', { token: admin, body: deckPayload({ cards }) });
    assert.equal(res.status, 201);
    assert.equal(res.body.totalCards, 40);
  });

  it('unknown cards are reported before a taken name', async () => {
    const res = await api.call('POST', '/decks', {
      token: admin, body: deckPayload({ name: 'Ashes & Embers', cards: [{ cardId: MISSING_CARD_ID, quantity: 1 }] }),
    });
    assert.equal(res.status, 400);
    const named = await api.call('POST', '/decks', { token: admin, body: deckPayload({ name: 'ashes & embers' }) });
    assert.equal(named.status, 409);
    assert.equal(named.body.code, 'NAME_TAKEN');
  });

  it('PUT fills the empty deck 06 and keeps createdAt', async () => {
    const deck = SEED_DECKS[5];
    const cards = [{ cardId: cardId(25), quantity: 2 }, { cardId: cardId(19), quantity: 1 }];
    const res = await api.call('PUT', '/decks', { token: admin, query: { id: deck.id }, body: { ...withTotal(deck), cards } });
    assert.equal(res.status, 200);
    assert.equal(res.body.totalCards, 3);
    assert.equal(res.body.createdAt, deck.createdAt);
    assert.ok(res.body.updatedAt > deck.updatedAt);
  });

  it('PUT: 404 for an unknown deck comes before unknown cards; idMatchesQuery', async () => {
    const missing = await api.call('PUT', '/decks', {
      token: admin, query: { id: MISSING_DECK_ID }, body: deckPayload({ cards: [{ cardId: MISSING_CARD_ID, quantity: 1 }] }),
    });
    assert.equal(missing.status, 404);
    const mismatch = await api.call('PUT', '/decks', { token: admin, query: { id: deckId(6) }, body: deckPayload({ id: deckId(1) }) });
    assert.deepEqual(rules(mismatch.body), ['body.id:idMatchesQuery']);
  });

  it('DELETE a deck leaves its cards alone; then its cards can be deleted (teardown order)', async () => {
    const card = (await api.call('POST', '/cards', { token: admin, body: cardPayload() })).body;
    const deck = (await api.call('POST', '/decks', { token: admin, body: deckPayload({ cards: [{ cardId: card.id, quantity: 1 }] }) })).body;
    assert.equal((await api.call('DELETE', '/cards', { token: admin, query: { id: card.id } })).status, 409);
    const del = await api.call('DELETE', '/decks', { token: admin, query: { id: deck.id } });
    assert.equal(del.status, 204);
    assert.equal(del.text, '');
    assert.equal((await api.call('GET', '/cards', { query: { id: card.id } })).status, 200);
    assert.equal((await api.call('DELETE', '/cards', { token: admin, query: { id: card.id } })).status, 204);
  });

  describe('search', () => {
    const names = (res) => res.body.items.map((d) => d.name);

    it('lists all six decks by name', async () => {
      const res = await api.call('GET', '/decks/search');
      assert.equal(res.body.total, 6);
      assert.deepEqual(names(res), ['Ashes & Embers', 'Blank Grimoire', 'Gale Force Rush', 'Stonewall Fortress', 'Tidebound Control', 'Twilight Paradox']);
    });

    it('filters by cardId, difficulty, name and theme', async () => {
      assert.deepEqual(names(await api.call('GET', '/decks/search', { query: { cardId: cardId(1) } })), ['Ashes & Embers', 'Gale Force Rush']);
      assert.equal((await api.call('GET', '/decks/search', { query: { cardId: MISSING_CARD_ID } })).body.total, 0);
      assert.equal((await api.call('GET', '/decks/search', { query: { difficulty: 'beginner' } })).body.total, 3);
      assert.deepEqual(names(await api.call('GET', '/decks/search', { query: { name: 'TIDE' } })), ['Tidebound Control']);
      assert.deepEqual(names(await api.call('GET', '/decks/search', { query: { theme: 'combo' } })), ['Twilight Paradox']);
    });

    it('sorts difficulty by rank, not alphabetically', async () => {
      const asc = await api.call('GET', '/decks/search', { query: { sortBy: 'difficulty' } });
      assert.deepEqual(asc.body.items.map((d) => d.difficulty), ['beginner', 'beginner', 'beginner', 'intermediate', 'advanced', 'expert']);
      const desc = await api.call('GET', '/decks/search', { query: { sortBy: 'difficulty', order: 'desc' } });
      assert.equal(desc.body.items[0].name, 'Twilight Paradox');
      // ties broken by id ascending, even for desc
      assert.deepEqual(desc.body.items.slice(3).map((d) => d.id), [deckId(1), deckId(4), deckId(6)]);
    });

    it('sorts by totalCards', async () => {
      const res = await api.call('GET', '/decks/search', { query: { sortBy: 'totalCards', order: 'desc' } });
      assert.deepEqual(res.body.items.map((d) => d.totalCards), [14, 13, 10, 9, 7, 0]);
    });

    it('400 for bad filters', async () => {
      assert.deepEqual(rules((await api.call('GET', '/decks/search', { query: { difficulty: 'hard' } })).body), ['query.difficulty:enum']);
      assert.deepEqual(rules((await api.call('GET', '/decks/search', { query: { cardId: 'x' } })).body), ['query.cardId:pattern']);
    });
  });
});
