// Small cross-cutting middleware: request ids, CORS and the request log.

import { randomUUID } from 'node:crypto';

const CLIENT_REQUEST_ID = /^[A-Za-z0-9._:-]{1,64}$/;

/** Gives every request an id (echoes a sensible client X-Request-Id), returned as the X-Request-Id header. */
export function requestId(req, res, next) {
  const fromClient = req.get('X-Request-Id');
  req.id = fromClient && CLIENT_REQUEST_ID.test(fromClient) ? fromClient : randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

const ALLOW_HEADERS = 'Authorization, Content-Type, X-Request-Id, X-Delay-Ms, X-Chaos-Fail-Times, X-Chaos-Key';
const EXPOSE_HEADERS = 'Location, X-Request-Id, X-Delay-Applied-Ms, X-Chaos, WWW-Authenticate, Allow';

/** CORS so browser-based API clients (e.g. Hoppscotch) can call the API and read the teaching headers. */
export function cors(req, res, next) {
  const { corsOrigins } = req.app.locals.config;
  const origin = req.get('Origin');
  if (corsOrigins === '*') {
    res.set('Access-Control-Allow-Origin', '*');
  } else {
    res.vary('Origin');
    if (origin && corsOrigins.includes(origin)) res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Expose-Headers', EXPOSE_HEADERS);
  if (req.method === 'OPTIONS' && req.get('Access-Control-Request-Method')) {
    res.set({
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': ALLOW_HEADERS,
      'Access-Control-Max-Age': '600',
    });
    return res.status(204).end();
  }
  next();
}

/** One line per finished request, e.g. "POST /cards 201 12ms user=admin id=...". Skips /health and /docs. */
export function requestLogger(req, res, next) {
  if (!req.app.locals.config.logRequests || req.path === '/health' || req.path.startsWith('/docs')) return next();
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number((process.hrtime.bigint() - started) / 1_000_000n);
    const user = req.user ? ` user=${req.user.username}` : '';
    const chaos = res.get('X-Chaos') ? ' [chaos]' : '';
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms${user}${chaos} id=${req.id}`);
  });
  next();
}
