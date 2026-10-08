// Lesson 8: related data. A deck points at cards, so creation and teardown have an ORDER:
// create cards -> create deck; delete deck -> delete cards.
import { test, expect } from '@playwright/test';
import { cardPayload, deckPayload, SEED } from '../data/testData';
import { AuthService } from '../services/authService.service';
import { CardsService } from '../services/cardsService.service';
import { DecksService } from '../services/decksService.service';
import type { Card, Deck, ErrorResponse, SearchPage } from '../types';

test.describe('Deck Tests', () => {
  let adminToken: string;
  let cardsService: CardsService;
  let decksService: DecksService;

  test.beforeAll(async ({ request }) => {
    adminToken = await new AuthService(request).loginAs('admin');
  });

  test.beforeEach(async ({ request }) => {
    cardsService = new CardsService(request, adminToken);
    decksService = new DecksService(request, adminToken);
  });

  // Decks first: a card that is still in a deck cannot be deleted (409 CARD_IN_USE).
  test.afterEach(async () => {
    await decksService.cleanup();
    await cardsService.cleanup();
  });

  test('build a deck from new cards', async () => {
    const cards: Card[] = [];
    for (let i = 0; i < 2; i++) {
      const response = await cardsService.create(cardPayload());
      expect(response.status()).toBe(201);
      cards.push((await response.json()) as Card);
    }

    const deckResponse = await decksService.create(
      deckPayload({
        cards: [
          { cardId: cards[0].id, quantity: 3 },
          { cardId: cards[1].id, quantity: 2 },
        ],
      })
    );
    expect(deckResponse.status()).toBe(201);
    const deck = (await deckResponse.json()) as Deck;
    expect(deck.totalCards).toBe(5); // computed by the server

    // Find the decks that use a card
    const { items } = (await (
      await decksService.search({ cardId: cards[0].id })
    ).json()) as SearchPage<Deck>;
    expect(items.map((d) => d.id)).toEqual([deck.id]);

    // A card that is in a deck cannot be deleted yet
    const blocked = await cardsService.deleteById(cards[0].id);
    expect(blocked.status()).toBe(409);
    const body = (await blocked.json()) as ErrorResponse;
    expect(body.code).toBe('CARD_IN_USE');
    expect(body.details[0].message).toContain(deck.id);
  });

  test('deck rules', async () => {
    const glyph = SEED.cards.wanderingGlyph;
    const twice = await decksService.create(
      deckPayload({
        cards: [
          { cardId: glyph, quantity: 1 },
          { cardId: glyph, quantity: 1 },
        ],
      })
    );
    expect(twice.status()).toBe(400);
    expect(((await twice.json()) as ErrorResponse).details).toContainEqual(
      expect.objectContaining({
        field: 'body.cards[1].cardId',
        rule: 'uniqueCardIds',
      })
    );

    const ghost = await decksService.create(
      deckPayload({ cards: [{ cardId: SEED.missingCardId, quantity: 1 }] })
    );
    expect(ghost.status()).toBe(400);
    expect(((await ghost.json()) as ErrorResponse).details[0].rule).toBe(
      'cardExists'
    );

    const fourCopies = await decksService.create(
      deckPayload({ cards: [{ cardId: glyph, quantity: 4 }] })
    );
    expect(
      ((await fourCopies.json()) as ErrorResponse).details[0]
    ).toMatchObject({ field: 'body.cards[0].quantity', rule: 'maximum' });
  });

  test('decks sort by difficulty rank, not alphabetically', async () => {
    const { items } = (await (
      await decksService.search({
        sortBy: 'difficulty',
        order: 'desc',
        pageSize: 50,
      })
    ).json()) as SearchPage<Deck>;
    const seedDecks = items.filter((d) => d.id.startsWith('d0000000-'));
    expect(seedDecks.map((d) => d.difficulty).slice(0, 3)).toEqual([
      'expert',
      'advanced',
      'intermediate',
    ]);
  });
});
