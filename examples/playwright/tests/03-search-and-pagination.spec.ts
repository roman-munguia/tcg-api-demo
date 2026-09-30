// Lesson 3: filtering, sorting and paging with query parameters.
import { test, expect } from '@playwright/test';
import { SEED } from '../data';

test('filter by element also matches array values', async ({ request }) => {
  const response = await request.get('/cards/search', { params: { element: 'Lumen', pageSize: 50 } });
  const { items } = await response.json();
  // Assert on the data you own: other tests may have created cards in parallel.
  const seedNames = items.filter((c: any) => SEED.isSeedCard(c.id)).map((c: any) => c.name);
  expect(seedNames).toEqual(['Bram\'s Lantern', 'Dawnbreaker Seraph', 'Eclipse Rite', 'Lumen Wisp', 'Sea-Glass Serpent']);
});

test('let params encode special characters', async ({ request }) => {
  // Building the URL by hand ('/cards/search?name=Ash & Ember') breaks on the '&'. params encodes it.
  const { items } = await (await request.get('/cards/search', { params: { name: 'Ash & Ember' } })).json();
  expect(items.map((c: any) => c.name)).toEqual(['Ash & Ember Phoenix']);
});

test('no match is 200 with an empty list, not 404', async ({ request }) => {
  const response = await request.get('/cards/search', { params: { name: 'zephyr' } }); // the card is "Zéphyr Kite"
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ items: [], total: 0, totalPages: 0 });
});

test('a misspelled parameter is a 400, not silently ignored', async ({ request }) => {
  const response = await request.get('/cards/search', { params: { nmae: 'drake' } });
  expect(response.status()).toBe(400);
  expect((await response.json()).details[0]).toMatchObject({ field: 'query.nmae', rule: 'additionalProperties' });
});

test('page through all Creature cards', async ({ request }) => {
  // Count only the seed cards: on a shared server others may have created Creatures too.
  const seen: string[] = [];
  let page = 1;
  let totalPages: number;
  do {
    const body = await (await request.get('/cards/search', { params: { type: 'Creature', pageSize: 5, page } })).json();
    expect(body.pageSize).toBe(5);
    totalPages = body.totalPages;
    seen.push(...body.items.map((c: any) => c.id));
    page++;
  } while (page <= totalPages);

  expect(new Set(seen).size).toBe(seen.length); // no card on two pages
  expect(seen.filter(SEED.isSeedCard)).toHaveLength(16);
  const pastTheEnd = await (await request.get('/cards/search', { params: { type: 'Creature', pageSize: 5, page: totalPages + 1 } })).json();
  expect(pastTheEnd.items).toEqual([]);
});

test('sort by dropRate, highest first', async ({ request }) => {
  const { items } = await (await request.get('/cards/search', { params: { type: 'Spell', sortBy: 'dropRate', order: 'desc' } })).json();
  const rates = items.map((c: any) => c.dropRate);
  expect(rates).toEqual([...rates].sort((a, b) => b - a));
  expect(items[0].name).toBe('Undercurrent Snare');
});
