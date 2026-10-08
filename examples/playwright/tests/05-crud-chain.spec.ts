// Lesson 5: a full create -> read -> update -> delete chain, passing the generated id along.
import { test, expect } from '@playwright/test';
import { cardPayload } from '../data/testData';
import { AuthService } from '../services/authService.service';
import { CardsService } from '../services/cardsService.service';
import type { Card } from '../types';

test.describe('Card CRUD Tests', () => {
  let adminToken: string;
  let cardsService: CardsService;

  // Log in ONCE for all tests in this describe block.
  test.beforeAll(async ({ request }) => {
    adminToken = await new AuthService(request).loginAs('admin');
  });

  test.beforeEach(async ({ request }) => {
    cardsService = new CardsService(request, adminToken);
  });

  // Runs even when the test fails, so no test data is left behind.
  test.afterEach(async () => {
    await cardsService.cleanup();
  });

  test('create, read, replace and delete a card', async ({ request }) => {
    const payload = cardPayload();
    let id = '';
    let location = '';

    await test.step('POST -> 201 with the new card and a Location header', async () => {
      const response = await cardsService.create(payload);
      expect(response.status()).toBe(201);
      const card = (await response.json()) as Card;
      expect(card).toMatchObject(payload); // everything we sent comes back...
      expect(card.id).toMatch(/^[0-9a-f-]{36}$/); // ...plus server fields
      id = card.id;
      location = response.headers()['location'];
      expect(location).toBe(`/cards?id=${id}`);
    });

    await test.step('GET via the Location header', async () => {
      // The Location already contains ?id=, so do NOT also pass params: { id } (that sends id twice -> 400).
      const response = await request.get(location);
      await expect(response).toBeOK();
      expect(((await response.json()) as Card).name).toBe(payload.name);
    });

    await test.step('PUT: send the GET response back with one change', async () => {
      const current = (await (await cardsService.getById(id)).json()) as Card;
      const response = await cardsService.replace(id, {
        ...current,
        description: 'Updated by a test.',
      });
      await expect(response).toBeOK();
      const updated = (await response.json()) as Card;
      expect(updated.description).toBe('Updated by a test.');
      expect(updated.createdAt).toBe(current.createdAt);
      expect(Date.parse(updated.updatedAt)).toBeGreaterThan(
        Date.parse(current.updatedAt)
      );
    });

    await test.step('DELETE -> 204 with an EMPTY body', async () => {
      const response = await cardsService.deleteById(id);
      expect(response.status()).toBe(204);
      expect(await response.text()).toBe(''); // response.json() would throw here
    });

    await test.step('afterwards: GET and DELETE give 404', async () => {
      expect((await cardsService.getById(id)).status()).toBe(404);
      expect((await cardsService.deleteById(id)).status()).toBe(404);
    });
  });
});
