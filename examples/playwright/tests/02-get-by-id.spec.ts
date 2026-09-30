// Lesson 2: GET everything, GET one resource with a query parameter (?id=), and the difference between 400 and 404.
import { test, expect } from '@playwright/test';
import { SEED } from '../data';

test('GET /cards without ?id= returns all cards', async ({ request }) => {
  const response = await request.get('/cards');
  await expect(response).toBeOK();
  const cards = await response.json();
  expect(Array.isArray(cards)).toBe(true); // a list is an array; one card (below) is an object
  expect(cards.length).toBeGreaterThanOrEqual(25); // other tests may add cards in parallel
  expect(cards.map((c: any) => c.name)).toContain('Cinderwing Drake');
});

test('GET /cards?id= returns the card', async ({ request }) => {
  // `params` builds and encodes the query string for us: /cards?id=c0000000-...
  const response = await request.get('/cards', { params: { id: SEED.cards.ashAndEmberPhoenix } });
  await expect(response).toBeOK();

  const card = await response.json();
  // toMatchObject: only the fields we list must match; extra fields are fine.
  expect(card).toMatchObject({
    id: SEED.cards.ashAndEmberPhoenix,
    name: 'Ash & Ember Phoenix',
    attributes: { type: 'Creature', rarity: 'Mythic', legendary: true },
  });
  expect(card.dropRate).toBeCloseTo(0.015); // never compare decimals with toBe
  expect(card.attributes.keywords).toEqual(expect.arrayContaining(['Rebirth']));
});

test('an attribute can hold several values (an array)', async ({ request }) => {
  const card = await (await request.get('/cards', { params: { id: SEED.cards.seaGlassSerpent } })).json();
  expect(card.attributes.element).toEqual(['Tide', 'Lumen']);
});

test('GET /decks?id= returns the deck list with quantities', async ({ request }) => {
  const deck = await (await request.get('/decks', { params: { id: SEED.decks.ashesAndEmbers } })).json();
  expect(deck.totalCards).toBe(10);
  expect(deck.cards).toContainEqual({ cardId: SEED.cards.cinderwingDrake, quantity: 2 });
});

test('400 when the id is malformed', async ({ request }) => {
  const response = await request.get('/cards', { params: { id: SEED.cards.cinderwingDrake.toUpperCase() } });
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.code).toBe('VALIDATION_ERROR');
  expect(body.details[0]).toMatchObject({ field: 'query.id', rule: 'pattern' });
});

test('404 when a well-formed id does not exist', async ({ request }) => {
  const response = await request.get('/cards', { params: { id: SEED.missingCardId } });
  expect(response.status()).toBe(404);
  expect((await response.json()).code).toBe('NOT_FOUND');
});
