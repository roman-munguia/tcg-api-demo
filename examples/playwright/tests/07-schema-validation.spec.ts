// Lesson 7: contract tests - validate whole responses against the API's published JSON Schemas.
import { test, expect, type APIRequestContext } from '@playwright/test';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { SEED } from '../data';

// allowUnionTypes: card attribute values may be a string, number, boolean or array.
const ajv = addFormats(new Ajv2020({ allErrors: true, allowUnionTypes: true }));

async function validatorFor(request: APIRequestContext, name: string) {
  const schema = await (await request.get(`/schemas/${name}.json`)).json();
  return ajv.getSchema(name) ?? (ajv.addSchema(schema, name), ajv.getSchema(name)!);
}

test('GET /cards?id= matches the Card schema', async ({ request }) => {
  const validate = await validatorFor(request, 'Card');
  const card = await (await request.get('/cards', { params: { id: SEED.cards.seaGlassSerpent } })).json();
  expect(validate(card), ajv.errorsText(validate.errors)).toBe(true);
});

test('search results match the CardPage schema', async ({ request }) => {
  const validate = await validatorFor(request, 'CardPage');
  const page = await (await request.get('/cards/search', { params: { pageSize: 50 } })).json();
  expect(validate(page), ajv.errorsText(validate.errors)).toBe(true);
});

test('errors match the ErrorResponse schema', async ({ request }) => {
  const validate = await validatorFor(request, 'ErrorResponse');
  const error = await (await request.get('/cards')).json();
  expect(validate(error), ajv.errorsText(validate.errors)).toBe(true);
});

test('a schema catches a broken response', async ({ request }) => {
  const validate = await validatorFor(request, 'Card');
  const card = await (await request.get('/cards', { params: { id: SEED.cards.cinderwingDrake } })).json();
  const broken = { ...card, dropRate: '6%' }; // pretend the API had a bug
  expect(validate(broken)).toBe(false);
  expect(ajv.errorsText(validate.errors)).toContain('dropRate');
});
