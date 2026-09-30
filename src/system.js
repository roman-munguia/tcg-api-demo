// GET /health and POST /reset.

import { readFileSync } from 'node:fs';
import { iso } from './common.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

/** GET /health: never slowed down or failed by the teaching knobs. */
export function health(req, res) {
  const { config, db, now, startedAt } = req.app.locals;
  res.json({
    status: 'ok',
    name: 'glyphwild-tcg-api',
    version: VERSION,
    startedAt: iso(startedAt),
    uptimeSeconds: Math.floor((now() - startedAt) / 1000),
    data: { cards: db.count('cards'), decks: db.count('decks') },
    settings: {
      latencyMs: config.latencyMs,
      chaosRate: config.chaosRate,
      teachingHeaders: config.teachingHeaders,
      tokenTtlSeconds: config.tokenTtlSeconds,
      resetOnStart: config.resetOnStart,
    },
  });
}

/** POST /reset (admin): restores the seed data. Tokens stay valid; X-Chaos-Key counters are forgotten. */
export function reset(req, res) {
  const { db, now, chaosKeys } = req.app.locals;
  const counts = db.resetToSeed();
  chaosKeys.clear();
  res.json({ message: 'Seed data restored.', ...counts, resetAt: iso(now()) });
}
