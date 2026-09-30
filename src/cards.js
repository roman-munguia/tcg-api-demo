// Card handlers. Validation has already happened (see the route table in app.js); what is left here is
// what needs the database: 404 for unknown ids, 409 for duplicate names or cards still used by a deck.

import { randomUUID } from 'node:crypto';
import { ApiError } from './errors.js';
import { assertNameFree, findOr404, iso, nextUpdatedAt } from './common.js';
import { injectChaos } from './knobs.js';
import { includesText, paginate, sameText, sortItems } from './search.js';

const SORT_VALUE = {
  name: (c) => c.name.toLowerCase(),
  dropRate: (c) => c.dropRate,
  createdAt: (c) => c.createdAt,
};

/** true when attributes[key] equals `wanted` (ignoring case), or contains it when the value is an array. */
const attributeMatches = (card, key, wanted) => [card.attributes[key] ?? []].flat().some((v) => sameText(v, wanted));

const points = (card) => (typeof card.attributes.points === 'number' ? card.attributes.points : undefined);

/** Builds the stored card field by field; read-only input (id, timestamps) is ignored this way. */
const cardFrom = (body, id, createdAt, updatedAt) => ({
  id,
  name: body.name,
  description: body.description,
  imageUrl: body.imageUrl,
  attributes: body.attributes,
  dropRate: body.dropRate,
  createdAt,
  updatedAt,
});

/** GET /cards?id= (one card), or GET /cards (all cards, ordered by id) */
export function getCards(req, res) {
  const { db } = req.app.locals;
  const { id } = req.validQuery;
  const result = id === undefined ? db.listAll('cards') : findOr404(db, 'cards', id);
  injectChaos(req);
  res.json(result);
}

/** GET /cards/search */
export function searchCards(req, res) {
  const q = req.validQuery;
  let cards = req.app.locals.db.listAll('cards');
  if (q.name !== undefined) cards = cards.filter((c) => includesText(c.name, q.name));
  if (q.type !== undefined) cards = cards.filter((c) => attributeMatches(c, 'type', q.type));
  if (q.element !== undefined) cards = cards.filter((c) => attributeMatches(c, 'element', q.element));
  if (q.minDropRate !== undefined) cards = cards.filter((c) => c.dropRate >= q.minDropRate);
  if (q.maxDropRate !== undefined) cards = cards.filter((c) => c.dropRate <= q.maxDropRate);
  if (q.minPoints !== undefined) cards = cards.filter((c) => points(c) !== undefined && points(c) >= q.minPoints);
  if (q.maxPoints !== undefined) cards = cards.filter((c) => points(c) !== undefined && points(c) <= q.maxPoints);
  injectChaos(req);
  res.json(paginate(sortItems(cards, SORT_VALUE[q.sortBy], q.order), q.page, q.pageSize));
}

/** POST /cards */
export function createCard(req, res) {
  const { db, now } = req.app.locals;
  assertNameFree(db, 'cards', req.body.name);
  injectChaos(req);
  const at = iso(now());
  const card = cardFrom(req.body, randomUUID(), at, at);
  db.insert('cards', card);
  res.status(201).location(`/cards?id=${card.id}`).json(card);
}

/** PUT /cards?id= (full replacement) */
export function replaceCard(req, res) {
  const { db, now } = req.app.locals;
  const existing = findOr404(db, 'cards', req.validQuery.id);
  assertNameFree(db, 'cards', req.body.name, existing.id);
  injectChaos(req);
  const card = cardFrom(req.body, existing.id, existing.createdAt, nextUpdatedAt(existing.updatedAt, now()));
  db.replace('cards', card);
  res.json(card);
}

/** DELETE /cards?id= (409 while decks still use the card) */
export function deleteCard(req, res) {
  const { db } = req.app.locals;
  const card = findOr404(db, 'cards', req.validQuery.id);
  const usedBy = db.listAll('decks').filter((d) => d.cards.some((entry) => entry.cardId === card.id));
  if (usedBy.length) {
    throw new ApiError(409, 'CARD_IN_USE',
      `Card '${card.id}' (${card.name}) is used by ${usedBy.length} deck(s). Delete those decks or remove the card from them first.`,
      { details: usedBy.map((d) => ({ field: 'query.id', rule: 'notInUse', message: `used by deck ${d.id} (${d.name})` })) });
  }
  injectChaos(req);
  db.remove('cards', card.id);
  res.status(204).end();
}
