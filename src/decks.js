// Deck handlers. A deck lists cards as [{ cardId, quantity }]; totalCards is computed, never stored.

import { randomUUID } from 'node:crypto';
import { validationError } from './errors.js';
import { assertNameFree, findOr404, idMatchesQuery, iso, nextUpdatedAt } from './common.js';
import { injectChaos } from './knobs.js';
import { DIFFICULTIES, MAX_DECK_CARDS, withTotal } from './schemas.js';
import { includesText, paginate, sortItems } from './search.js';

const SORT_VALUE = {
  name: (d) => d.name.toLowerCase(),
  difficulty: (d) => DIFFICULTIES.indexOf(d.difficulty), // beginner < intermediate < advanced < expert
  totalCards: (d) => d.totalCards,
  createdAt: (d) => d.createdAt,
};

/** check() for validate(): deck rules that need no database. PUT also checks the body id. */
export function deckRules(req) {
  const details = req.method === 'PUT' ? idMatchesQuery(req) : [];
  const seen = new Set();
  req.body.cards.forEach((entry, i) => {
    if (seen.has(entry.cardId)) {
      details.push({ field: `body.cards[${i}].cardId`, rule: 'uniqueCardIds', message: 'lists a card that is already in the deck; raise its quantity instead' });
    }
    seen.add(entry.cardId);
  });
  const total = req.body.cards.reduce((sum, entry) => sum + entry.quantity, 0);
  if (total > MAX_DECK_CARDS) {
    details.push({ field: 'body.cards', rule: 'maxTotalCards', message: `total quantity ${total} exceeds ${MAX_DECK_CARDS}` });
  }
  return details;
}

/** 400 cardExists for every deck entry whose card does not exist. */
function assertCardsExist(db, cards) {
  const details = cards
    .map((entry, i) => ({ entry, i }))
    .filter(({ entry }) => !db.findById('cards', entry.cardId))
    .map(({ entry, i }) => ({ field: `body.cards[${i}].cardId`, rule: 'cardExists', message: `no card has the id '${entry.cardId}'` }));
  if (details.length) throw validationError(details);
}

const deckFrom = (body, id, createdAt, updatedAt) => ({
  id,
  name: body.name,
  theme: body.theme,
  description: body.description,
  difficulty: body.difficulty,
  cards: body.cards.map(({ cardId, quantity }) => ({ cardId, quantity })),
  createdAt,
  updatedAt,
});

/** GET /decks?id= */
export function getDeck(req, res) {
  const deck = findOr404(req.app.locals.db, 'decks', req.validQuery.id);
  injectChaos(req);
  res.json(withTotal(deck));
}

/** GET /decks/search */
export function searchDecks(req, res) {
  const q = req.validQuery;
  let decks = req.app.locals.db.listAll('decks').map(withTotal);
  if (q.name !== undefined) decks = decks.filter((d) => includesText(d.name, q.name));
  if (q.theme !== undefined) decks = decks.filter((d) => includesText(d.theme, q.theme));
  if (q.difficulty !== undefined) decks = decks.filter((d) => d.difficulty === q.difficulty);
  if (q.cardId !== undefined) decks = decks.filter((d) => d.cards.some((entry) => entry.cardId === q.cardId));
  injectChaos(req);
  res.json(paginate(sortItems(decks, SORT_VALUE[q.sortBy], q.order), q.page, q.pageSize));
}

/** POST /decks */
export function createDeck(req, res) {
  const { db, now } = req.app.locals;
  assertCardsExist(db, req.body.cards);
  assertNameFree(db, 'decks', req.body.name);
  injectChaos(req);
  const at = iso(now());
  const deck = deckFrom(req.body, randomUUID(), at, at);
  db.insert('decks', deck);
  res.status(201).location(`/decks?id=${deck.id}`).json(withTotal(deck));
}

/** PUT /decks?id= (full replacement) */
export function replaceDeck(req, res) {
  const { db, now } = req.app.locals;
  const existing = findOr404(db, 'decks', req.validQuery.id);
  assertCardsExist(db, req.body.cards);
  assertNameFree(db, 'decks', req.body.name, existing.id);
  injectChaos(req);
  const deck = deckFrom(req.body, existing.id, existing.createdAt, nextUpdatedAt(existing.updatedAt, now()));
  db.replace('decks', deck);
  res.json(withTotal(deck));
}

/** DELETE /decks?id= (the cards themselves are not touched) */
export function deleteDeck(req, res) {
  const { db } = req.app.locals;
  const deck = findOr404(db, 'decks', req.validQuery.id);
  injectChaos(req);
  db.remove('decks', deck.id);
  res.status(204).end();
}
