// Lesson 7: contract tests - validate whole responses against the API's published JSON Schemas.
import { test, expect } from '@playwright/test';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { SEED } from '../data/testData';
import { CardsService } from '../services/cardsService.service';
import type { Card } from '../types';

// allowUnionTypes: card attribute values may be a string, number, boolean or array.
const ajv = addFormats(new Ajv2020({ allErrors: true, allowUnionTypes: true }));

test.describe('Contract Tests', () => {
  let cardsService: CardsService;

  test.beforeEach(async ({ request }) => {
    cardsService = new CardsService(request);
  });

  // Downloads /schemas/<name>.json once and compiles it.
  async function validatorFor(name: string) {
    if (!ajv.getSchema(name))
      ajv.addSchema(await (await cardsService.getSchema(name)).json(), name);
    return ajv.getSchema(name)!;
  }

  test('GET /cards?id= matches the Card schema', async () => {
    const validate = await validatorFor('Card');
    const card = await (
      await cardsService.getById(SEED.cards.seaGlassSerpent)
    ).json();
    expect(validate(card), ajv.errorsText(validate.errors)).toBe(true);
  });

  test('GET /cards (all cards) matches the CardList schema', async () => {
    const validate = await validatorFor('CardList');
    const cards = await (await cardsService.getAll()).json();
    expect(validate(cards), ajv.errorsText(validate.errors)).toBe(true);
  });

  test('search results match the CardPage schema', async () => {
    const validate = await validatorFor('CardPage');
    const page = await (await cardsService.search({ pageSize: 50 })).json();
    expect(validate(page), ajv.errorsText(validate.errors)).toBe(true);
  });

  test('errors match the ErrorResponse schema', async () => {
    const validate = await validatorFor('ErrorResponse');
    const error = await (await cardsService.getById('not-a-uuid')).json();
    expect(validate(error), ajv.errorsText(validate.errors)).toBe(true);
  });

  test('a schema catches a broken response', async () => {
    const validate = await validatorFor('Card');
    const card = (await (
      await cardsService.getById(SEED.cards.cinderwingDrake)
    ).json()) as Card;
    const broken = { ...card, dropRate: '6%' }; // pretend the API had a bug
    expect(validate(broken)).toBe(false);
    expect(ajv.errorsText(validate.errors)).toContain('dropRate');
  });
});
