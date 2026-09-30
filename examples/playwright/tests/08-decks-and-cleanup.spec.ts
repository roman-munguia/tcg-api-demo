// Lesson 8: related data. A deck points at cards, so creation and teardown have an ORDER:
// create cards -> create deck; delete deck -> delete cards. The cleanup fixture does it in that order.
import { test, expect } from '../fixtures';
import { cardPayload, deckPayload, SEED } from '../data';

test('build a deck from new cards', async ({ adminRequest, request, cleanup }) => {
  const cards = [];
  for (let i = 0; i < 2; i++) {
    const res = await adminRequest.post('/cards', { data: cardPayload() });
    expect(res.status()).toBe(201);
    const card = await res.json();
    cleanup.card(card.id);
    cards.push(card);
  }

  const deckRes = await adminRequest.post('/decks', {
    data: deckPayload({ cards: [{ cardId: cards[0].id, quantity: 3 }, { cardId: cards[1].id, quantity: 2 }] }),
  });
  expect(deckRes.status()).toBe(201);
  const deck = await deckRes.json();
  cleanup.deck(deck.id);
  expect(deck.totalCards).toBe(5); // computed by the server

  // Find the decks that use a card
  const { items } = await (await request.get('/decks/search', { params: { cardId: cards[0].id } })).json();
  expect(items.map((d: any) => d.id)).toEqual([deck.id]);

  // A card that is in a deck cannot be deleted yet
  const blocked = await adminRequest.delete('/cards', { params: { id: cards[0].id } });
  expect(blocked.status()).toBe(409);
  const body = await blocked.json();
  expect(body.code).toBe('CARD_IN_USE');
  expect(body.details[0].message).toContain(deck.id);
});

test('deck rules', async ({ adminRequest }) => {
  const twice = await adminRequest.post('/decks', {
    data: deckPayload({ cards: [{ cardId: SEED.cards.wanderingGlyph, quantity: 1 }, { cardId: SEED.cards.wanderingGlyph, quantity: 1 }] }),
  });
  expect(twice.status()).toBe(400);
  expect((await twice.json()).details).toContainEqual(expect.objectContaining({ field: 'body.cards[1].cardId', rule: 'uniqueCardIds' }));

  const ghost = await adminRequest.post('/decks', { data: deckPayload({ cards: [{ cardId: SEED.missingCardId, quantity: 1 }] }) });
  expect(ghost.status()).toBe(400);
  expect((await ghost.json()).details[0].rule).toBe('cardExists');

  const fourCopies = await adminRequest.post('/decks', { data: deckPayload({ cards: [{ cardId: SEED.cards.wanderingGlyph, quantity: 4 }] }) });
  expect((await fourCopies.json()).details[0]).toMatchObject({ field: 'body.cards[0].quantity', rule: 'maximum' });
});

test('decks sort by difficulty rank, not alphabetically', async ({ request }) => {
  const { items } = await (await request.get('/decks/search', { params: { sortBy: 'difficulty', order: 'desc', pageSize: 50 } })).json();
  const seedDecks = items.filter((d: any) => d.id.startsWith('d0000000-'));
  expect(seedDecks.map((d: any) => d.difficulty).slice(0, 3)).toEqual(['expert', 'advanced', 'intermediate']);
});
