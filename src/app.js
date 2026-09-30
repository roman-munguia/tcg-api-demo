// Builds the Express app. The route table below is the best place to start reading: each line lists its
// checks in the order they run, e.g. latency -> auth (401/403) -> JSON body (415/413/400) -> validation (400)
// -> handler (404, 409, chaos, success).

import express from 'express';
import { requireAdmin, requireUser, login, logout, me } from './auth.js';
import { createCard, deleteCard, getCard, replaceCard, searchCards } from './cards.js';
import { createDeck, deckRules, deleteDeck, getDeck, replaceDeck, searchDecks } from './decks.js';
import { idMatchesQuery } from './common.js';
import { mountDocs } from './docs.js';
import { errorHandler, notFoundOrMethodNotAllowed } from './errors.js';
import { latency } from './knobs.js';
import { cors, requestId, requestLogger } from './middleware.js';
import { buildOpenApi } from './openapi.js';
import * as S from './schemas.js';
import { minNotAboveMax } from './search.js';
import { health, reset } from './system.js';
import { jsonBody, validate } from './validation.js';

/** Known paths and methods, used for the 405 (+ Allow) answer. */
const ROUTES = {
  '/': ['GET'],
  '/docs/': ['GET'],
  '/openapi.json': ['GET'],
  '/schemas': ['GET'],
  '/schemas/:file': ['GET'],
  '/health': ['GET'],
  '/auth/login': ['POST'],
  '/auth/me': ['GET'],
  '/auth/logout': ['POST'],
  '/reset': ['POST'],
  '/cards': ['GET', 'POST', 'PUT', 'DELETE'],
  '/cards/search': ['GET'],
  '/decks': ['GET', 'POST', 'PUT', 'DELETE'],
  '/decks/search': ['GET'],
};

/**
 * createApp({ config, db, now }) - `now` returns epoch milliseconds (tests pass a controllable clock).
 * All state lives in app.locals, so several independent apps can run in one process.
 */
export function createApp({ config, db, now = Date.now }) {
  const app = express();
  app.set('x-powered-by', false);
  app.set('etag', false); // no surprise 304 responses while learning
  app.set('json spaces', 2);
  Object.assign(app.locals, {
    config,
    db,
    now,
    startedAt: now(),
    tokens: new Map(), // token -> { username, role, expiresAt }
    chaosKeys: new Map(), // X-Chaos-Key -> failures left
    openapi: buildOpenApi(config),
  });

  app.use(requestId, cors, requestLogger);

  app.get('/', (req, res) => res.redirect(302, '/docs/'));
  mountDocs(app);
  app.get('/health', health);

  app.post('/auth/login', jsonBody, validate({ body: S.LoginRequest }), login);
  app.get('/auth/me', requireUser, me);
  app.post('/auth/logout', requireUser, logout);
  app.post('/reset', requireAdmin, reset);

  const cardSearchRules = minNotAboveMax(['minDropRate', 'maxDropRate'], ['minPoints', 'maxPoints']);
  app.get('/cards/search', latency, validate({ query: S.CardSearchQuery, check: cardSearchRules }), searchCards);
  app.get('/cards', latency, validate({ query: S.IdQuery }), getCard);
  app.post('/cards', latency, requireAdmin, jsonBody, validate({ query: S.NoQuery, body: S.CardInput }), createCard);
  app.put('/cards', latency, requireAdmin, jsonBody, validate({ query: S.IdQuery, body: S.CardInput, check: idMatchesQuery }), replaceCard);
  app.delete('/cards', latency, requireAdmin, validate({ query: S.IdQuery }), deleteCard);

  app.get('/decks/search', latency, validate({ query: S.DeckSearchQuery }), searchDecks);
  app.get('/decks', latency, validate({ query: S.IdQuery }), getDeck);
  app.post('/decks', latency, requireAdmin, jsonBody, validate({ query: S.NoQuery, body: S.DeckInput, check: deckRules }), createDeck);
  app.put('/decks', latency, requireAdmin, jsonBody, validate({ query: S.IdQuery, body: S.DeckInput, check: deckRules }), replaceDeck);
  app.delete('/decks', latency, requireAdmin, validate({ query: S.IdQuery }), deleteDeck);

  app.use(notFoundOrMethodNotAllowed(ROUTES)); // JSON 404, or 405 with an Allow header
  app.use(errorHandler); // the one JSON error envelope
  return app;
}
