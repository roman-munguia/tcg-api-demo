// Lesson 3: filtering, sorting and paging with query parameters.
import { test, expect } from '@playwright/test';
import { SEED } from '../data/testData';
import { CardsService } from '../services/cardsService.service';
import type { Card, ErrorResponse, SearchPage } from '../types';

test.describe('Card Search Tests', () => {
  let cardsService: CardsService;

  test.beforeEach(async ({ request }) => {
    cardsService = new CardsService(request);
  });

  test('filter by element also matches array values', async () => {
    const { items } = (await (
      await cardsService.search({ element: 'Lumen', pageSize: 50 })
    ).json()) as SearchPage<Card>;
    // Assert on the data you own: other tests may have created cards in parallel.
    const seedNames = items
      .filter((c) => SEED.isSeedCard(c.id))
      .map((c) => c.name);
    expect(seedNames).toEqual([
      "Bram's Lantern",
      'Dawnbreaker Seraph',
      'Eclipse Rite',
      'Lumen Wisp',
      'Sea-Glass Serpent',
    ]);
  });

  test('params encode special characters', async () => {
    // Building the URL by hand ('/cards/search?name=Ash & Ember') breaks on the '&'. params encodes it.
    const { items } = (await (
      await cardsService.search({ name: 'Ash & Ember' })
    ).json()) as SearchPage<Card>;
    expect(items.map((c) => c.name)).toEqual(['Ash & Ember Phoenix']);
  });

  test('no match is 200 with an empty list, not 404', async () => {
    const response = await cardsService.search({ name: 'zephyr' }); // the card is "Zéphyr Kite"
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [],
      total: 0,
      totalPages: 0,
    });
  });

  test('a misspelled parameter is a 400, not silently ignored', async () => {
    const response = await cardsService.search({ nmae: 'drake' });
    expect(response.status()).toBe(400);
    expect(((await response.json()) as ErrorResponse).details[0]).toMatchObject(
      { field: 'query.nmae', rule: 'additionalProperties' }
    );
  });

  test('page through all Creature cards', async () => {
    // Count only the seed cards: on a shared server others may have created Creatures too.
    const seen: string[] = [];
    let page = 1;
    let totalPages: number;
    do {
      const body = (await (
        await cardsService.search({ type: 'Creature', pageSize: 5, page })
      ).json()) as SearchPage<Card>;
      expect(body.pageSize).toBe(5);
      totalPages = body.totalPages;
      seen.push(...body.items.map((c) => c.id));
      page++;
    } while (page <= totalPages);

    expect(new Set(seen).size).toBe(seen.length); // no card on two pages
    expect(seen.filter(SEED.isSeedCard)).toHaveLength(16);
    const pastTheEnd = (await (
      await cardsService.search({
        type: 'Creature',
        pageSize: 5,
        page: totalPages + 1,
      })
    ).json()) as SearchPage<Card>;
    expect(pastTheEnd.items).toEqual([]);
  });

  test('sort by dropRate, highest first', async () => {
    const { items } = (await (
      await cardsService.search({
        type: 'Spell',
        sortBy: 'dropRate',
        order: 'desc',
      })
    ).json()) as SearchPage<Card>;
    const rates = items.map((c) => c.dropRate);
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
    expect(items[0].name).toBe('Undercurrent Snare');
  });
});
