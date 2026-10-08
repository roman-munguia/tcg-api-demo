// Lesson 2: GET everything, GET one resource with a query parameter (?id=), and the difference between 400 and 404.
import { test, expect } from '@playwright/test';
import { SEED } from '../data/testData';
import { CardsService } from '../services/cardsService.service';
import { DecksService } from '../services/decksService.service';
import type { Card, Deck, ErrorResponse } from '../types';

test.describe('Get Cards Tests', () => {
  let cardsService: CardsService;

  test.beforeEach(async ({ request }) => {
    cardsService = new CardsService(request);
  });

  test('GET /cards without ?id= returns all cards', async () => {
    const response = await cardsService.getAll();
    await expect(response).toBeOK();
    const cards = (await response.json()) as Card[];
    expect(Array.isArray(cards)).toBe(true); // a list is an array; one card (below) is an object
    expect(cards.length).toBeGreaterThanOrEqual(25); // other tests may add cards in parallel
    expect(cards.map((c) => c.name)).toContain('Cinderwing Drake');
  });

  test('GET /cards?id= returns the card', async () => {
    // getById sends params: { id }, which builds and encodes /cards?id=c0000000-...
    const response = await cardsService.getById(SEED.cards.ashAndEmberPhoenix);
    await expect(response).toBeOK();

    const card = (await response.json()) as Card;
    // toMatchObject: only the fields we list must match; extra fields are fine.
    expect(card).toMatchObject({
      id: SEED.cards.ashAndEmberPhoenix,
      name: 'Ash & Ember Phoenix',
      attributes: { type: 'Creature', rarity: 'Mythic', legendary: true },
    });
    expect(card.dropRate).toBeCloseTo(0.015); // never compare decimals with toBe
    expect(card.attributes.keywords).toEqual(
      expect.arrayContaining(['Rebirth'])
    );
  });

  test('an attribute can hold several values (an array)', async () => {
    const card = (await (
      await cardsService.getById(SEED.cards.seaGlassSerpent)
    ).json()) as Card;
    expect(card.attributes.element).toEqual(['Tide', 'Lumen']);
  });

  test('400 when the id is malformed', async () => {
    const response = await cardsService.getById(
      SEED.cards.cinderwingDrake.toUpperCase()
    );
    expect(response.status()).toBe(400);
    const body = (await response.json()) as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details[0]).toMatchObject({
      field: 'query.id',
      rule: 'pattern',
    });
  });

  test('404 when a well-formed id does not exist', async () => {
    const response = await cardsService.getById(SEED.missingCardId);
    expect(response.status()).toBe(404);
    expect(((await response.json()) as ErrorResponse).code).toBe('NOT_FOUND');
  });
});

test.describe('Get Decks Tests', () => {
  let decksService: DecksService;

  test.beforeEach(async ({ request }) => {
    decksService = new DecksService(request);
  });

  test('GET /decks?id= returns the deck list with quantities', async () => {
    const deck = (await (
      await decksService.getById(SEED.decks.ashesAndEmbers)
    ).json()) as Deck;
    expect(deck.totalCards).toBe(10);
    expect(deck.cards).toContainEqual({
      cardId: SEED.cards.cinderwingDrake,
      quantity: 2,
    });
  });
});
