// Test helpers for the internal regression suite (node:test + fetch, no extra dependencies).
//
// startApi() runs an isolated API in-process on a free port with an in-memory database.
// call() checks EVERY response against the OpenAPI document: the status must be documented for the
// operation and a JSON body must match the documented schema. So the docs cannot drift from the behaviour.

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db.js';

// Every setting pinned, so the developer's environment and .env never leak into the tests.
export const TEST_DEFAULTS = {
  PORT: '0',
  DB_FILE: ':memory:',
  RESET_ON_START: 'true',
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'admin123',
  VIEWER_USERNAME: 'viewer',
  VIEWER_PASSWORD: 'viewer123',
  TOKEN_TTL_SECONDS: '86400',
  LATENCY_MS: '0',
  CHAOS_RATE: '0',
  TEACHING_HEADERS: 'true',
  LOG_REQUESTS: 'false',
  CORS_ORIGIN: '*',
};

export const responseAjv = () => addFormats(new Ajv2020({ allErrors: true, allowUnionTypes: true, strict: true }));

function operationMatcher(openapi) {
  const entries = Object.entries(openapi.paths).map(([path, ops]) => ({
    regex: new RegExp(`^${path.replace(/\{[^}]+\}/g, '[^/]+').replace(/\./g, '\\.')}$`),
    ops,
  }));
  return (path, method) => entries.find((e) => e.regex.test(path))?.ops[method.toLowerCase()];
}

export async function startApi(overrides = {}) {
  const config = loadConfig({ ...TEST_DEFAULTS, ...overrides });
  const db = openDatabase({ dbFile: config.dbFile });
  let time = Date.now();
  const clock = { now: () => time, advance: (ms) => { time += ms; } };
  const app = createApp({ config, db, now: clock.now });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const { openapi } = app.locals;
  const findOperation = operationMatcher(openapi);
  const ajv = responseAjv();
  const errorSchema = ajv.compile(openapi.components.schemas.ErrorResponse);
  const validators = new Map();
  const validatorFor = (schema) => {
    if (!validators.has(schema)) validators.set(schema, ajv.compile(schema));
    return validators.get(schema);
  };

  function checkContract(method, path, status, headers, body, text) {
    if (method === 'HEAD' || path === '/' || path.startsWith('/docs')) return;
    if (status === 204) {
      if (text !== '') throw new Error(`${method} ${path}: 204 must have an empty body`);
    }
    const op = findOperation(path, method);
    if (!op) {
      if (![404, 405].includes(status) || !errorSchema(body)) throw new Error(`${method} ${path}: undocumented route answered ${status}`);
      return;
    }
    const documented = op.responses[String(status)];
    if (!documented) throw new Error(`${method} ${path}: status ${status} is not documented (documented: ${Object.keys(op.responses)})`);
    const schema = documented.content?.['application/json']?.schema;
    if (schema) {
      const validateBody = validatorFor(schema);
      if (!validateBody(body)) {
        throw new Error(`${method} ${path} ${status}: body does not match the documented schema: ${ajv.errorsText(validateBody.errors)}\n${text}`);
      }
    }
  }

  /** call('POST', '/cards', { body, token, query, headers, rawBody }) -> { status, headers, body, text } */
  async function call(method, path, { query, body, rawBody, token, headers = {} } = {}) {
    const url = new URL(path, baseUrl);
    for (const [k, v] of Object.entries(query ?? {})) {
      for (const value of [v].flat()) url.searchParams.append(k, String(value));
    }
    const init = { method, headers: { ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] ??= 'application/json';
    } else if (rawBody !== undefined) {
      init.body = rawBody;
    }
    const res = await fetch(url, init);
    const text = await res.text();
    const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
    const parsed = isJson && text ? JSON.parse(text) : undefined;
    checkContract(method, url.pathname, res.status, res.headers, parsed, text);
    return { status: res.status, headers: res.headers, body: parsed, text };
  }

  async function login(role = 'admin') {
    const username = role === 'admin' ? config.adminUsername : config.viewerUsername;
    const password = role === 'admin' ? config.adminPassword : config.viewerPassword;
    const res = await call('POST', '/auth/login', { body: { username, password } });
    if (res.status !== 200) throw new Error(`login failed: ${res.text}`);
    return res.body.token;
  }

  const close = () => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => { db.close(); resolve(); });
  });

  return { app, baseUrl, call, login, clock, db, config, openapi, close };
}

/** A valid CardInput with a unique name. */
let counter = 0;
export const cardPayload = (overrides = {}) => ({
  name: `Test Card ${++counter} ${Math.random().toString(16).slice(2, 8)}`,
  description: 'Created by a test.',
  imageUrl: 'https://images.glyphwild.example/cards/test.png',
  attributes: { type: 'Test', element: 'Testium', cost: 1, points: 1 },
  dropRate: 0.2,
  ...overrides,
});

export const deckPayload = (overrides = {}) => ({
  name: `Test Deck ${++counter} ${Math.random().toString(16).slice(2, 8)}`,
  theme: 'Testing',
  description: 'Created by a test.',
  difficulty: 'beginner',
  cards: [],
  ...overrides,
});

/** [{field, rule}] of an error body, for compact assertions. */
export const rules = (body) => body.details.map((d) => `${d.field}:${d.rule}`);
