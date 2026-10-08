// Test data: the fixed seed ids, the credentials, and builders for unique payloads.
import { randomBytes } from 'node:crypto';
import type { CardInput, Credentials, DeckInput, Role } from '../types';

const card = (n: number) =>
  `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deck = (n: number) =>
  `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Seed data that is the same after every reset (see the README of the API). */
export const SEED = {
  cards: {
    cinderwingDrake: card(1), // used by 2 decks -> DELETE gives 409 CARD_IN_USE
    ashAndEmberPhoenix: card(2), // dropRate 0.015, legendary
    seaGlassSerpent: card(8), // element is an ARRAY: ['Tide', 'Lumen']
    wanderingGlyph: card(25), // in no deck, no element
  },
  decks: {
    ashesAndEmbers: deck(1), // 10 cards, beginner
    blankGrimoire: deck(6), // empty
  },
  missingCardId: card(999), // well-formed, never exists -> 404
  isSeedCard: (id: string) => id.startsWith('c0000000-'),
};

export const CREDENTIALS: Record<Role, Credentials> = {
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },
  viewer: {
    username: process.env.VIEWER_USERNAME || 'viewer',
    password: process.env.VIEWER_PASSWORD || 'viewer123',
  },
};

export const RUN_ID = process.env.TCG_RUN_ID ?? 'local';

/**
 * Names must be unique (409 NAME_TAKEN otherwise), and tests run in parallel and are re-run.
 * So never hardcode a name: build one from the run id plus random characters.
 */
export const uniqueName = (prefix: string) =>
  `${prefix} ${RUN_ID} ${randomBytes(4).toString('hex')}`;

/**
 * A valid card body. The attributes ('Test' / 'Testium') never match the seed demo filters,
 * so cards created by one test cannot change the counts another test asserts.
 */
export const cardPayload = (
  overrides: Record<string, unknown> = {}
): CardInput =>
  ({
    name: uniqueName('Test Card'),
    description: 'Created by a Playwright test.',
    imageUrl: 'https://images.glyphwild.example/cards/test.png',
    attributes: { type: 'Test', element: 'Testium', cost: 1 },
    dropRate: 0.2,
    ...overrides,
  }) as CardInput;

export const deckPayload = (
  overrides: Record<string, unknown> = {}
): DeckInput =>
  ({
    name: uniqueName('Test Deck'),
    theme: 'Testing',
    description: 'Created by a Playwright test.',
    difficulty: 'beginner',
    cards: [],
    ...overrides,
  }) as DeckInput;
