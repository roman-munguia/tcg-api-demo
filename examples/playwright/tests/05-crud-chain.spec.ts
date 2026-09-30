// Lesson 5: a full create -> read -> update -> delete chain, passing the generated id along.
// From here on we use the fixtures from fixtures.ts: adminRequest is already logged in.
import { test, expect } from '../fixtures';
import { cardPayload } from '../data';

test('create, read, replace and delete a card', async ({ adminRequest, request, cleanup }) => {
  const payload = cardPayload();
  let id = '';
  let location = '';

  await test.step('POST -> 201 with the new card and a Location header', async () => {
    const response = await adminRequest.post('/cards', { data: payload });
    expect(response.status()).toBe(201);
    const card = await response.json();
    expect(card).toMatchObject(payload); // everything we sent comes back...
    expect(card.id).toMatch(/^[0-9a-f-]{36}$/); // ...plus server fields
    id = card.id;
    cleanup.card(id); // deleted after the test even if a later step fails
    location = response.headers()['location'];
    expect(location).toBe(`/cards?id=${id}`);
  });

  await test.step('GET via the Location header', async () => {
    // The Location already contains ?id=, so do NOT also pass params: { id } (that sends id twice -> 400).
    const response = await request.get(location);
    await expect(response).toBeOK();
    expect((await response.json()).name).toBe(payload.name);
  });

  await test.step('PUT: send the GET response back with one change', async () => {
    const current = await (await request.get('/cards', { params: { id } })).json();
    const response = await adminRequest.put('/cards', { params: { id }, data: { ...current, description: 'Updated by a test.' } });
    await expect(response).toBeOK();
    const updated = await response.json();
    expect(updated.description).toBe('Updated by a test.');
    expect(updated.createdAt).toBe(current.createdAt);
    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(current.updatedAt));
  });

  await test.step('DELETE -> 204 with an EMPTY body', async () => {
    const response = await adminRequest.delete('/cards', { params: { id } });
    expect(response.status()).toBe(204);
    expect(await response.text()).toBe(''); // response.json() would throw here
  });

  await test.step('afterwards: GET and DELETE give 404', async () => {
    expect((await request.get('/cards', { params: { id } })).status()).toBe(404);
    expect((await adminRequest.delete('/cards', { params: { id } })).status()).toBe(404);
  });
});
