// Lesson 2: GET one resource with a query parameter (?id=), and the difference between 400 and 404.
import { test, expect } from '@playwright/test';
import { SEED } from '../data';

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

test('400 when the id is missing or malformed', async ({ request }) => {
  const missing = await request.get('/cards');
  expect(missing.status()).toBe(400);
  const body = await missing.json();
  expect(body.code).toBe('VALIDATION_ERROR');
  expect(body.details[0]).toMatchObject({ field: 'query.id', rule: 'required' });

  const upperCase = await request.get('/cards', { params: { id: SEED.cards.cinderwingDrake.toUpperCase() } });
  expect(upperCase.status()).toBe(400);
});

test('404 when a well-formed id does not exist', async ({ request }) => {
  const response = await request.get('/cards', { params: { id: SEED.missingCardId } });
  expect(response.status()).toBe(404);
  expect((await response.json()).code).toBe('NOT_FOUND');
});
