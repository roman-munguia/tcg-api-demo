// Teaching knobs: simulated latency and simulated failures ("chaos"). Both apply only to /cards and /decks
// routes, never to /health, /docs, /auth or /reset, so health checks and logging in keep working.
//
// Server-wide (env / compose): LATENCY_MS and CHAOS_RATE.
// Per request (when TEACHING_HEADERS=true):
//   X-Delay-Ms: 0-10000                    adds that many ms to LATENCY_MS
//   X-Chaos-Fail-Times: 1-5 + X-Chaos-Key  the first N requests with that key fail with 500, later ones pass

import { setTimeout as sleep } from 'node:timers/promises';
import { ApiError, validationError } from './errors.js';

export const MAX_DELAY_MS = 10000;
const MAX_FAIL_TIMES = 5;
const MAX_CHAOS_KEYS = 1000;
const CHAOS_KEY = /^[A-Za-z0-9._:-]{1,100}$/;

function parseTeachingHeaders(req) {
  const details = [];
  const intHeader = (name, min, max) => {
    const raw = req.get(name);
    if (raw === undefined) return undefined;
    const field = `header.${name.toLowerCase()}`;
    if (!/^\d+$/.test(raw.trim())) {
      details.push({ field, rule: 'type', message: `must be a whole number from ${min} to ${max}` });
      return undefined;
    }
    const n = Number(raw);
    if (n < min) details.push({ field, rule: 'minimum', message: `must be >= ${min}` });
    else if (n > max) details.push({ field, rule: 'maximum', message: `must be <= ${max}` });
    return n;
  };
  const delayMs = intHeader('X-Delay-Ms', 0, MAX_DELAY_MS) ?? 0;
  const failTimes = intHeader('X-Chaos-Fail-Times', 1, MAX_FAIL_TIMES);
  const chaosKey = req.get('X-Chaos-Key');
  if (chaosKey !== undefined && !CHAOS_KEY.test(chaosKey)) {
    details.push({ field: 'header.x-chaos-key', rule: 'pattern', message: 'must be 1-100 letters, digits or . _ : -' });
  }
  if ((chaosKey === undefined) !== (req.get('X-Chaos-Fail-Times') === undefined)) {
    const missing = chaosKey === undefined ? 'header.x-chaos-key' : 'header.x-chaos-fail-times';
    details.push({ field: missing, rule: 'requiredWith', message: 'X-Chaos-Fail-Times and X-Chaos-Key must be sent together' });
  }
  if (details.length) throw validationError(details);
  return { delayMs, failTimes, chaosKey };
}

/**
 * Route middleware (first on every /cards and /decks route): checks the teaching headers, then waits
 * LATENCY_MS + X-Delay-Ms. Delayed responses carry X-Delay-Applied-Ms.
 */
export async function latency(req, res, next) {
  const { config } = req.app.locals;
  req.teaching = config.teachingHeaders ? parseTeachingHeaders(req) : { delayMs: 0 };
  const total = config.latencyMs + req.teaching.delayMs;
  if (total > 0) {
    await sleep(total);
    res.set('X-Delay-Applied-Ms', String(total));
  }
  next();
}

function consumeForcedFailure(chaosKeys, key, failTimes) {
  if (!chaosKeys.has(key)) {
    if (chaosKeys.size >= MAX_CHAOS_KEYS) chaosKeys.delete(chaosKeys.keys().next().value); // forget the oldest
    chaosKeys.set(key, failTimes);
  }
  const left = chaosKeys.get(key);
  if (left <= 0) return false;
  chaosKeys.set(key, left - 1);
  return true;
}

/**
 * Called by the handlers right before they change data or send a success response - after every check
 * (400/401/403/404/409). So chaos only fails requests that would have succeeded, and nothing is written:
 * retrying is always safe.
 */
export function injectChaos(req) {
  const { config, chaosKeys } = req.app.locals;
  const { chaosKey, failTimes } = req.teaching ?? {};
  const forced = chaosKey !== undefined && consumeForcedFailure(chaosKeys, chaosKey, failTimes);
  if (forced || (config.chaosRate > 0 && Math.random() < config.chaosRate)) {
    const source = forced ? `X-Chaos-Fail-Times for key '${chaosKey}'` : `CHAOS_RATE=${config.chaosRate}`;
    throw new ApiError(500, 'CHAOS_INJECTED',
      `Simulated failure injected by the chaos knob (${source}). Nothing was changed; it is safe to retry.`,
      { headers: { 'X-Chaos': 'injected' } });
  }
}
