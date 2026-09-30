// SQLite storage, using the node:sqlite module that ships with Node (no native add-ons to install).
//
// Each table is a tiny "document store": one row per resource, with the resource saved as JSON exactly as
// the API returns it. There are no joins and no migrations, and adding a field needs no DDL.
// This is the only file that contains SQL.
//
// All calls are synchronous. Handlers never `await` between a check and a write, so two requests can never
// interleave in the middle of an update. Keep it that way when you change a handler.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SEED_CARDS, SEED_DECKS } from './seed.js';

export const TABLES = ['cards', 'decks'];

const DDL = TABLES.map((t) => `
  CREATE TABLE IF NOT EXISTS ${t} (
    id   TEXT PRIMARY KEY,
    data TEXT NOT NULL CHECK (json_valid(data))
  );`).join('\n');

function checkTable(table) {
  if (!TABLES.includes(table)) throw new Error(`Unknown table ${table}`);
}

/**
 * Opens (and on first use creates and seeds) the database.
 * A brand-new file gets the seed data straight away; resetting an existing one is up to the caller.
 */
export function openDatabase({ dbFile }) {
  if (dbFile !== ':memory:') mkdirSync(dirname(dbFile), { recursive: true });
  // timeout: wait up to 5 s when another program (e.g. DB Browser for SQLite) holds a lock.
  const sqlite = new DatabaseSync(dbFile, { timeout: 5000 });

  const transaction = (fn) => {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      sqlite.exec('COMMIT');
      return result;
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  };

  const insert = (table, doc) => {
    checkTable(table);
    sqlite.prepare(`INSERT INTO ${table} (id, data) VALUES (?, ?)`).run(doc.id, JSON.stringify(doc));
  };

  const insertSeedRows = () => {
    for (const card of SEED_CARDS) insert('cards', card);
    for (const deck of SEED_DECKS) insert('decks', deck);
  };

  const version = sqlite.prepare('PRAGMA user_version').get().user_version;
  if (version === 0) {
    transaction(() => {
      sqlite.exec(DDL);
      insertSeedRows();
      sqlite.exec('PRAGMA user_version = 1');
    });
  }

  return {
    /** All documents of a table, ordered by id. */
    listAll(table) {
      checkTable(table);
      return sqlite.prepare(`SELECT data FROM ${table} ORDER BY id`).all().map((row) => JSON.parse(row.data));
    },
    /** One document, or undefined. */
    findById(table, id) {
      checkTable(table);
      const row = sqlite.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(id);
      return row ? JSON.parse(row.data) : undefined;
    },
    insert,
    replace(table, doc) {
      checkTable(table);
      sqlite.prepare(`UPDATE ${table} SET data = ? WHERE id = ?`).run(JSON.stringify(doc), doc.id);
    },
    /** Returns true when a row was deleted. */
    remove(table, id) {
      checkTable(table);
      return sqlite.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes > 0;
    },
    count(table) {
      checkTable(table);
      return sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    },
    transaction,
    /** Deletes everything and restores the seed data, in one transaction. */
    resetToSeed() {
      transaction(() => {
        for (const t of TABLES) sqlite.exec(`DELETE FROM ${t}`);
        insertSeedRows();
      });
      return { cards: SEED_CARDS.length, decks: SEED_DECKS.length };
    },
    close() {
      sqlite.close();
    },
  };
}
