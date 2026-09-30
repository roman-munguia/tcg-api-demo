// Helpers shared by cards.js and decks.js.

import { ApiError } from './errors.js';

const LABEL = { cards: 'card', decks: 'deck' };

export const iso = (ms) => new Date(ms).toISOString();

/** updatedAt for a PUT: now, but always at least 1 ms later than before, so it visibly changes. */
export const nextUpdatedAt = (previous, nowMs) => iso(Math.max(nowMs, Date.parse(previous) + 1));

/** The stored document, or 404 NOT_FOUND. */
export function findOr404(db, table, id) {
  const doc = db.findById(table, id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', `No ${LABEL[table]} has the id '${id}'.`);
  return doc;
}

/** 409 NAME_TAKEN when another document (not exceptId) already has this name, ignoring case. */
export function assertNameFree(db, table, name, exceptId) {
  const clash = db.listAll(table).find((d) => d.id !== exceptId && d.name.toLowerCase() === name.toLowerCase());
  if (clash) {
    throw new ApiError(409, 'NAME_TAKEN',
      `A ${LABEL[table]} named '${clash.name}' already exists (id ${clash.id}). Names are unique ignoring case; add a unique suffix.`,
      { details: [{ field: 'body.name', rule: 'unique', message: `already used by ${LABEL[table]} ${clash.id}` }] });
  }
}

/** check() for PUT: a body id, if present, must equal ?id. */
export function idMatchesQuery(req) {
  const bodyId = req.body.id;
  return bodyId !== undefined && bodyId !== req.validQuery.id
    ? [{ field: 'body.id', rule: 'idMatchesQuery', message: `must equal the ?id query parameter (${req.validQuery.id}) or be left out` }]
    : [];
}
