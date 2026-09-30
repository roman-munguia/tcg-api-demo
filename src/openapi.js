// Builds the OpenAPI 3.1 document behind Swagger UI (/docs/) and /openapi.json.
// It is generated from the same JSON Schemas that validate requests, so the docs cannot drift from the code.
// Every operation lists every status code it can really return, each with a realistic example.

import { ERROR_CODES } from './errors.js';
import { MAX_DELAY_MS } from './knobs.js';
import * as S from './schemas.js';
import { MISSING_CARD_ID, SEED_CARDS, cardId, deckId } from './seed.js';
import { VERSION } from './system.js';

const IMG = 'https://images.glyphwild.example/cards';
const REQUEST_ID = '3f0c2a8e-5d1b-4c7e-9a44-0b7f1f6d2c10';

// ---------- small builders ----------

const json = (schema, examples) => ({ 'application/json': { schema, ...(examples ? { examples } : {}) } });

const ok = (description, schema, examples) => ({ description, content: json(schema, examples) });

const created = (description, schema, resource) => ({
  description,
  headers: {
    Location: {
      description: `Where the new resource can be fetched, e.g. /${resource}?id=<new id>.`,
      schema: { type: 'string', maxLength: 100, description: 'Relative URL.', examples: [`/${resource}?id=${resource === 'cards' ? cardId(1) : deckId(1)}`] },
    },
  },
  content: json(schema),
});

const noContent = (description) => ({ description });

const SAMPLE_ERRORS = {
  VALIDATION_ERROR: ['body.dropRate must be <= 1', [{ field: 'body.dropRate', rule: 'maximum', message: 'must be <= 1' }]],
  INVALID_JSON: ['The request body is not valid JSON. Check for trailing commas, single quotes or missing braces.', []],
  MISSING_TOKEN: ["This endpoint needs a token. Log in with POST /auth/login, then send 'Authorization: Bearer <token>'.", []],
  MALFORMED_AUTH_HEADER: ["Prefix the token with 'Bearer ': Authorization: Bearer <token>.", []],
  INVALID_TOKEN: ['Unknown or revoked token. Tokens live in server memory: logout and a server restart clear them. Log in again.', []],
  TOKEN_EXPIRED: ['The token expired at 2026-10-01T10:00:00.000Z. Log in again.', []],
  INVALID_CREDENTIALS: ['Wrong username or password.', []],
  FORBIDDEN_ROLE: ["User 'viewer' has the read-only role 'viewer' and cannot change data. Log in as an admin user.", []],
  NOT_FOUND: [`No card has the id '${MISSING_CARD_ID}'.`, []],
  NAME_TAKEN: [`A card named 'Cinderwing Drake' already exists (id ${cardId(1)}). Names are unique ignoring case; add a unique suffix.`,
    [{ field: 'body.name', rule: 'unique', message: `already used by card ${cardId(1)}` }]],
  CARD_IN_USE: [`Card '${cardId(1)}' (Cinderwing Drake) is used by 2 deck(s). Delete those decks or remove the card from them first.`,
    [{ field: 'query.id', rule: 'notInUse', message: `used by deck ${deckId(1)} (Ashes & Embers)` },
      { field: 'query.id', rule: 'notInUse', message: `used by deck ${deckId(3)} (Gale Force Rush)` }]],
  PAYLOAD_TOO_LARGE: ['The request body is larger than 100 kB.', []],
  UNSUPPORTED_MEDIA_TYPE: ["Content-Type was 'text/plain'; send the body as JSON with 'Content-Type: application/json'. In Playwright pass a plain object as data (a JSON.stringify(...) string is sent as application/octet-stream).",
    [{ field: 'header.content-type', rule: 'mediaType', message: 'received text/plain' }]],
  CHAOS_INJECTED: ['Simulated failure injected by the chaos knob (CHAOS_RATE=0.3). Nothing was changed; it is safe to retry.', []],
};

const errorExample = (code) => {
  const [message, details] = SAMPLE_ERRORS[code];
  return { summary: code, value: { status: ERROR_CODES[code].status, code, message, details, requestId: REQUEST_ID } };
};

const WWW_AUTHENTICATE = {
  'WWW-Authenticate': {
    description: 'Tells the client which auth scheme to use, e.g. Bearer realm="glyphwild", error="invalid_token".',
    schema: { type: 'string', maxLength: 100, description: 'Challenge.', examples: ['Bearer realm="glyphwild"'] },
  },
};

const STATUS_TEXT = {
  400: 'Bad request: the input breaks a rule. Every problem is listed in details.',
  401: 'Not authenticated: no token, a malformed header, or an unknown/expired token.',
  403: 'Authenticated, but the read-only viewer cannot change data.',
  404: 'No resource with that id.',
  409: 'Conflict with existing data.',
  413: 'The body is larger than 100 kB.',
  415: "The body is missing or not sent as 'Content-Type: application/json'.",
  500: 'Only when a chaos knob is on (CHAOS_RATE or X-Chaos-Fail-Times): a simulated failure. Nothing was changed.',
};

/** Error responses: errors({ 400: ['VALIDATION_ERROR', 'INVALID_JSON'], 401: [...] }) */
const errors = (byStatus) => Object.fromEntries(Object.entries(byStatus).map(([status, codes]) => [status, {
  description: STATUS_TEXT[status],
  ...(status === '401' ? { headers: WWW_AUTHENTICATE } : {}),
  content: json(S.ErrorResponse, Object.fromEntries(codes.map((code) => [code, errorExample(code)]))),
}]));

const AUTH_401 = ['MISSING_TOKEN', 'MALFORMED_AUTH_HEADER', 'INVALID_TOKEN', 'TOKEN_EXPIRED'];
const BODY_400 = ['VALIDATION_ERROR', 'INVALID_JSON'];

/** Query parameters generated from a query schema. Only `id` gets a pre-filled Try-it-out value. */
const queryParams = (schema, idExample) => Object.entries(schema.properties).map(([name, s]) => ({
  name,
  in: 'query',
  required: schema.required?.includes(name) ?? false,
  description: s.description,
  schema: s,
  ...(name === 'id' ? { example: idExample } : {}),
}));

const TEACHING_HEADERS = [
  {
    name: 'X-Delay-Ms', in: 'header', required: false,
    description: `Teaching aid: wait this many extra milliseconds before answering (0-${MAX_DELAY_MS}). Use it to practise timeouts.`,
    schema: { type: 'integer', minimum: 0, maximum: MAX_DELAY_MS, description: 'Extra delay in ms.', examples: [1500] },
  },
  {
    name: 'X-Chaos-Fail-Times', in: 'header', required: false,
    description: 'Teaching aid (send together with X-Chaos-Key): the first N requests with the same key fail with 500 CHAOS_INJECTED, later ones succeed. Use it to practise retries.',
    schema: { type: 'integer', minimum: 1, maximum: 5, description: 'How many times to fail.', examples: [2] },
  },
  {
    name: 'X-Chaos-Key', in: 'header', required: false,
    description: 'Teaching aid: any unique text (letters, digits, . _ : -) that groups requests for X-Chaos-Fail-Times.',
    schema: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,100}$', description: 'Chaos key.', examples: ['my-test-42'] },
  },
];

const SECURED = [{ bearerAuth: [] }];

// ---------- named request examples (the summary starts with the expected status) ----------

const ONCE = 'Works once: run it again and you get 409 NAME_TAKEN, because names are unique. Change the name or run POST /reset.';

const cardExamples = {
  valid: {
    summary: '201 - valid card', description: ONCE,
    value: {
      name: 'Brine Hatchling', description: 'A small Tide creature for testing.', imageUrl: `${IMG}/brine-hatchling.png`,
      attributes: { type: 'Creature', element: 'Tide', cost: 1, points: 1, rarity: 'Common' }, dropRate: 0.4,
    },
  },
  multi: {
    summary: '201 - several elements (array value)', description: ONCE,
    value: {
      name: 'Stormglass Heron', description: 'Flying. Counts as Gale and Tide.', imageUrl: `${IMG}/stormglass-heron.png`,
      attributes: { type: 'Creature', element: ['Gale', 'Tide'], cost: 3, points: 2, rarity: 'Uncommon', keywords: ['Flying'] }, dropRate: 0.15,
    },
  },
  minimal: {
    summary: '201 - minimal card (defaults)', description: `Only the required fields; description becomes "" and attributes {}. ${ONCE}`,
    value: { name: 'Pebble Sprite', imageUrl: `${IMG}/pebble-sprite.png`, dropRate: 0.35 },
  },
  missingName: {
    summary: '400 - missing name', description: 'name is required.',
    value: { imageUrl: `${IMG}/nameless.png`, dropRate: 0.2 },
  },
  percentage: {
    summary: '400 - dropRate written as a percentage', description: 'dropRate is a fraction: 15% is 0.15, not 15.',
    value: { name: 'Percent Mistake', imageUrl: `${IMG}/percent.png`, dropRate: 15 },
  },
  unknownField: {
    summary: '400 - unknown field', description: 'rarity belongs inside attributes; unknown top-level fields are rejected.',
    value: { name: 'Misplaced Rarity', imageUrl: `${IMG}/misplaced.png`, dropRate: 0.2, rarity: 'Rare' },
  },
  duplicate: {
    summary: '409 - name already taken', description: 'Seed card 01 is Cinderwing Drake; names are compared ignoring case.',
    value: { name: 'cinderwing drake', imageUrl: `${IMG}/copy.png`, dropRate: 0.1 },
  },
};

const card25 = SEED_CARDS[24];
const replaceCardExamples = {
  mirror: {
    summary: '200 - send a GET response back with a new description',
    description: 'PUT accepts exactly what GET /cards returned; id and timestamps are ignored. Use ?id= of card 25.',
    value: { ...card25, description: 'It has finally chosen an element... just not yet.' },
  },
  idMismatch: {
    summary: '400 - body id differs from ?id', description: 'With ?id= of card 25, the body id must be the same (or left out).',
    value: { ...card25, id: cardId(1) },
  },
};

const deckExamples = {
  valid: {
    summary: '201 - valid deck', description: ONCE,
    value: {
      name: 'Tide Starter', theme: 'Simple Tide creatures', description: 'A small deck for practice.', difficulty: 'beginner',
      cards: [{ cardId: cardId(7), quantity: 3 }, { cardId: cardId(9), quantity: 2 }],
    },
  },
  empty: {
    summary: '201 - empty deck', description: `cards defaults to []. ${ONCE}`,
    value: { name: 'Empty Practice Deck', theme: 'Nothing yet', difficulty: 'beginner' },
  },
  tooMany: {
    summary: '400 - four copies of one card', description: 'quantity is 1 to 3.',
    value: { name: 'Greedy Deck', theme: 'Too many imps', difficulty: 'beginner', cards: [{ cardId: cardId(3), quantity: 4 }] },
  },
  twice: {
    summary: '400 - card listed twice', description: 'Each card appears at most once; raise its quantity instead.',
    value: { name: 'Double Entry', theme: 'Duplicates', difficulty: 'beginner', cards: [{ cardId: cardId(3), quantity: 1 }, { cardId: cardId(3), quantity: 2 }] },
  },
  unknownCard: {
    summary: '400 - unknown card id', description: 'Every cardId must exist.',
    value: { name: 'Ghost Deck', theme: 'Cards that do not exist', difficulty: 'beginner', cards: [{ cardId: MISSING_CARD_ID, quantity: 1 }] },
  },
};

const replaceDeckExamples = {
  fill: {
    summary: '200 - add cards to Blank Grimoire (deck 06)', description: 'Use ?id= of deck 06, then GET it and look at totalCards.',
    value: {
      name: 'Blank Grimoire', theme: 'Empty starter to fill in', difficulty: 'beginner',
      description: 'Now with a few cards.', cards: [{ cardId: cardId(25), quantity: 2 }, { cardId: cardId(19), quantity: 1 }],
    },
  },
};

// ---------- landing page ----------

const usesDefaultCredentials = (config) => config.adminUsername === 'admin' && config.adminPassword === 'admin123'
  && config.viewerUsername === 'viewer' && config.viewerPassword === 'viewer123';

function landing(config) {
  const defaults = usesDefaultCredentials(config);
  const users = defaults
    ? `| admin | admin123 | read and write |\n| viewer | viewer123 | read only (writes return 403) |`
    : '| (custom) | ask your instructor | admin: read and write; viewer: read only |';
  const codes = Object.entries(ERROR_CODES).map(([code, { status, when }]) => `| ${status} | ${code} | ${when} |`).join('\n');
  return `A practice REST API for **Glyphwild**, a made-up trading card game, built for learning API test automation
(Playwright, Postman, REST Assured, ...). Not for production use.

### Quick start
1. Open **Auth > POST /auth/login**, click **Execute** (the body is pre-filled). The token is applied automatically: the padlocks close.
2. Try **POST /cards** with the example body, then GET it back with the returned id.
3. Log in again as \`viewer\` and repeat step 2: you get **403**.

Manual alternative: click **Authorize** and paste **only the token** (without "Bearer ").

| User | Password | Can |
|---|---|---|
${users}

### Conventions
- \`GET /cards\` returns all cards; \`GET /cards?id=...\` one card. Replace and delete one with **?id=**. Filter, sort and page with **/search**.
- Reading is public; creating, changing and deleting needs an admin token.
- POST/PUT bodies have the same shape as GET responses (read-only fields are ignored).
- Every error has the shape \`{ status, code, message, details: [{ field, rule, message }], requestId }\`.
- Checks run in this order: teaching headers (400), 401, 403, body format (415/413/400), validation (400), 404, unknown deck cards (400), 409.

Seed ids to try: card \`${cardId(1)}\`, card \`${cardId(25)}\` (in no deck, safe to delete), deck \`${deckId(1)}\`, deck \`${deckId(6)}\` (empty).
Known-missing id for 404: \`${MISSING_CARD_ID}\`. Restore the seed data with **POST /reset**.

Active knobs: LATENCY_MS=${config.latencyMs}, CHAOS_RATE=${config.chaosRate}, TEACHING_HEADERS=${config.teachingHeaders}, TOKEN_TTL_SECONDS=${config.tokenTtlSeconds}.
Downloads: [/openapi.json](/openapi.json) (import into Postman, Bruno, Insomnia), [/schemas](/schemas) (JSON Schemas for contract tests).

<details><summary>All error codes</summary>

| Status | Code | When |
|---|---|---|
${codes}

</details>`;
}

// ---------- the document ----------

export function buildOpenApi(config) {
  // Custom credentials (e.g. on a shared class server) are never published in the docs.
  const loginExamples = usesDefaultCredentials(config)
    ? {
      admin: { summary: '200 - admin', value: { username: 'admin', password: 'admin123' } },
      viewer: { summary: '200 - viewer', value: { username: 'viewer', password: 'viewer123' } },
      wrong: { summary: '401 - wrong password', value: { username: 'admin', password: 'wrong-password' } },
    }
    : { custom: { summary: '401 - replace with the credentials from your instructor', value: { username: 'your-username', password: 'your-password' } } };

  return {
    openapi: '3.1.0',
    info: { title: 'Glyphwild TCG API', version: VERSION, description: landing(config) },
    servers: [{ url: '/', description: 'Same origin as this page' }],
    tags: [
      { name: 'Auth', description: 'Log in to get a bearer token. Tokens are random, kept in memory, and end on logout, expiry or restart.' },
      { name: 'Cards', description: 'Glyphwild cards. GET /cards lists all; get/replace/delete one with ?id=; filter with /cards/search.' },
      { name: 'Decks', description: 'Decks list cards as [{ cardId, quantity }]. totalCards is computed.' },
      { name: 'Admin', description: 'Restore the demo data.' },
      { name: 'Health', description: 'Is the API up, and which knobs are on?' },
      { name: 'Docs', description: 'The machine-readable documentation.' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http', scheme: 'bearer', bearerFormat: 'opaque (tcg_...)',
          description: 'Run POST /auth/login with "Try it out" and the token is applied automatically. Or paste ONLY the token here (no "Bearer ").',
        },
      },
      schemas: S.PUBLIC_SCHEMAS,
    },
    paths: {
      '/health': {
        get: {
          tags: ['Health'], operationId: 'getHealth', summary: 'Health check',
          description: 'Public. Never slowed down or failed by the teaching knobs. Shows the active knob settings.',
          responses: { 200: ok('The API is up.', S.Health) },
        },
      },
      '/auth/login': {
        post: {
          tags: ['Auth'], operationId: 'login', summary: 'Log in and get a bearer token',
          description: 'Public. Returns a new random token for one of the two built-in users. Every login creates a new token; older tokens stay valid.',
          requestBody: { required: true, content: json(S.LoginRequest, loginExamples) },
          responses: {
            200: ok('Logged in.', S.LoginResponse),
            ...errors({ 400: BODY_400, 401: ['INVALID_CREDENTIALS'], 413: ['PAYLOAD_TOO_LARGE'], 415: ['UNSUPPORTED_MEDIA_TYPE'] }),
          },
        },
      },
      '/auth/me': {
        get: {
          tags: ['Auth'], operationId: 'getMe', summary: 'Who am I?', security: SECURED,
          description: 'Any valid token. The simplest protected endpoint: use it to practise the four kinds of 401.',
          responses: { 200: ok('The token owner.', S.Me), ...errors({ 401: AUTH_401 }) },
        },
      },
      '/auth/logout': {
        post: {
          tags: ['Auth'], operationId: 'logout', summary: 'Revoke the token you sent', security: SECURED,
          description: 'Any valid token. Only this token is revoked; using it again returns 401 INVALID_TOKEN.',
          responses: { 204: noContent('Logged out. No body.'), ...errors({ 401: AUTH_401 }) },
        },
      },
      '/cards': {
        get: {
          tags: ['Cards'], operationId: 'getCards', summary: 'Get all cards, or one card by ?id=',
          description: 'Public. Without ?id= you get ALL cards as an array, ordered by id. With ?id= you get that one card as an object: '
            + 'a malformed id gives 400, an unknown one 404. To filter, sort or page, use /cards/search.',
          parameters: [...queryParams(S.OptionalIdQuery, cardId(1)), ...TEACHING_HEADERS],
          responses: {
            200: {
              description: 'With ?id=: the card (an object). Without ?id=: all cards (an array).',
              content: json({ oneOf: [S.Card, S.CardList] }, {
                one: { summary: 'GET /cards?id=... (one card)', value: SEED_CARDS[0] },
                all: { summary: 'GET /cards (all cards; shortened here)', value: [SEED_CARDS[0], SEED_CARDS[1]] },
              }),
            },
            ...errors({ 400: ['VALIDATION_ERROR'], 404: ['NOT_FOUND'], 500: ['CHAOS_INJECTED'] }),
          },
        },
        post: {
          tags: ['Cards'], operationId: 'createCard', summary: 'Create a card', security: SECURED,
          description: 'Admin only. Returns 201 with the new card and a Location header. Names are unique ignoring case.',
          parameters: TEACHING_HEADERS,
          requestBody: { required: true, content: json(S.CardInput, cardExamples) },
          responses: {
            201: created('Created.', S.Card, 'cards'),
            ...errors({
              400: BODY_400, 401: AUTH_401, 403: ['FORBIDDEN_ROLE'], 409: ['NAME_TAKEN'], 413: ['PAYLOAD_TOO_LARGE'],
              415: ['UNSUPPORTED_MEDIA_TYPE'], 500: ['CHAOS_INJECTED'],
            }),
          },
        },
        put: {
          tags: ['Cards'], operationId: 'replaceCard', summary: 'Replace a card by ?id=', security: SECURED,
          description: 'Admin only. Full replacement: send the whole card (optional fields you leave out go back to their defaults). '
            + 'createdAt is kept and updatedAt changes. Pre-filled with card 25; if you deleted it, run POST /reset.',
          parameters: [...queryParams(S.IdQuery, cardId(25)), ...TEACHING_HEADERS],
          requestBody: { required: true, content: json(S.CardInput, replaceCardExamples) },
          responses: {
            200: ok('The updated card.', S.Card),
            ...errors({
              400: BODY_400, 401: AUTH_401, 403: ['FORBIDDEN_ROLE'], 404: ['NOT_FOUND'], 409: ['NAME_TAKEN'],
              413: ['PAYLOAD_TOO_LARGE'], 415: ['UNSUPPORTED_MEDIA_TYPE'], 500: ['CHAOS_INJECTED'],
            }),
          },
        },
        delete: {
          tags: ['Cards'], operationId: 'deleteCard', summary: 'Delete a card by ?id=', security: SECURED,
          description: 'Admin only. 204 with no body. A card used by a deck cannot be deleted (409 CARD_IN_USE): delete or change the deck first. '
            + 'Pre-filled with card 25, which no deck uses. This really deletes; POST /reset brings it back.',
          parameters: [...queryParams(S.IdQuery, cardId(25)), ...TEACHING_HEADERS],
          responses: {
            204: noContent('Deleted. No body.'),
            ...errors({ 400: ['VALIDATION_ERROR'], 401: AUTH_401, 403: ['FORBIDDEN_ROLE'], 404: ['NOT_FOUND'], 409: ['CARD_IN_USE'], 500: ['CHAOS_INJECTED'] }),
          },
        },
      },
      '/cards/search': {
        get: {
          tags: ['Cards'], operationId: 'searchCards', summary: 'Search, sort and page through cards',
          description: 'Public. All filters are optional and combine with AND. No match is 200 with an empty items array. '
            + 'Unknown or repeated parameters give 400.',
          parameters: [...queryParams(S.CardSearchQuery), ...TEACHING_HEADERS],
          responses: { 200: ok('One page of cards.', S.CardPage), ...errors({ 400: ['VALIDATION_ERROR'], 500: ['CHAOS_INJECTED'] }) },
        },
      },
      '/decks': {
        get: {
          tags: ['Decks'], operationId: 'getDecks', summary: 'Get all decks, or one deck by ?id=',
          description: 'Public. Without ?id= you get ALL decks as an array, ordered by id. With ?id= you get that one deck as an object. '
            + 'To filter, sort or page, use /decks/search.',
          parameters: [...queryParams(S.OptionalIdQuery, deckId(1)), ...TEACHING_HEADERS],
          responses: {
            200: {
              description: 'With ?id=: the deck (an object). Without ?id=: all decks (an array).',
              content: json({ oneOf: [S.Deck, S.DeckList] }, {
                one: { summary: 'GET /decks?id=... (one deck)', value: S.Deck.examples[0] },
                all: { summary: 'GET /decks (all decks; shortened here)', value: S.DeckList.examples[0] },
              }),
            },
            ...errors({ 400: ['VALIDATION_ERROR'], 404: ['NOT_FOUND'], 500: ['CHAOS_INJECTED'] }),
          },
        },
        post: {
          tags: ['Decks'], operationId: 'createDeck', summary: 'Create a deck', security: SECURED,
          description: `Admin only. Rules: quantity 1-${S.MAX_COPIES}, each card once, at most ${S.MAX_DECK_CARDS} cards in total, every card must exist, unique name.`,
          parameters: TEACHING_HEADERS,
          requestBody: { required: true, content: json(S.DeckInput, deckExamples) },
          responses: {
            201: created('Created.', S.Deck, 'decks'),
            ...errors({
              400: BODY_400, 401: AUTH_401, 403: ['FORBIDDEN_ROLE'], 409: ['NAME_TAKEN'], 413: ['PAYLOAD_TOO_LARGE'],
              415: ['UNSUPPORTED_MEDIA_TYPE'], 500: ['CHAOS_INJECTED'],
            }),
          },
        },
        put: {
          tags: ['Decks'], operationId: 'replaceDeck', summary: 'Replace a deck by ?id=', security: SECURED,
          description: 'Admin only. Full replacement, same rules as POST. Pre-filled with deck 06 (Blank Grimoire).',
          parameters: [...queryParams(S.IdQuery, deckId(6)), ...TEACHING_HEADERS],
          requestBody: { required: true, content: json(S.DeckInput, replaceDeckExamples) },
          responses: {
            200: ok('The updated deck.', S.Deck),
            ...errors({
              400: BODY_400, 401: AUTH_401, 403: ['FORBIDDEN_ROLE'], 404: ['NOT_FOUND'], 409: ['NAME_TAKEN'],
              413: ['PAYLOAD_TOO_LARGE'], 415: ['UNSUPPORTED_MEDIA_TYPE'], 500: ['CHAOS_INJECTED'],
            }),
          },
        },
        delete: {
          tags: ['Decks'], operationId: 'deleteDeck', summary: 'Delete a deck by ?id=', security: SECURED,
          description: 'Admin only. 204 with no body. The cards in the deck are not deleted. Pre-filled with deck 04; POST /reset brings it back.',
          parameters: [...queryParams(S.IdQuery, deckId(4)), ...TEACHING_HEADERS],
          responses: {
            204: noContent('Deleted. No body.'),
            ...errors({ 400: ['VALIDATION_ERROR'], 401: AUTH_401, 403: ['FORBIDDEN_ROLE'], 404: ['NOT_FOUND'], 500: ['CHAOS_INJECTED'] }),
          },
        },
      },
      '/decks/search': {
        get: {
          tags: ['Decks'], operationId: 'searchDecks', summary: 'Search, sort and page through decks',
          description: 'Public. All filters are optional and combine with AND. cardId finds the decks that use a card.',
          parameters: [...queryParams(S.DeckSearchQuery), ...TEACHING_HEADERS],
          responses: { 200: ok('One page of decks.', S.DeckPage), ...errors({ 400: ['VALIDATION_ERROR'], 500: ['CHAOS_INJECTED'] }) },
        },
      },
      '/reset': {
        post: {
          tags: ['Admin'], operationId: 'resetData', summary: 'Restore the seed data', security: SECURED,
          description: 'Admin only. Replaces all cards and decks with the original demo data. Tokens stay valid. '
            + 'In a test suite, call it once in global setup, never per test.',
          responses: { 200: ok('Restored.', S.ResetResult), ...errors({ 401: AUTH_401, 403: ['FORBIDDEN_ROLE'] }) },
        },
      },
      '/openapi.json': {
        get: {
          tags: ['Docs'], operationId: 'getOpenApi', summary: 'This OpenAPI document',
          description: 'Public. Import it into Postman, Bruno or Insomnia.',
          responses: { 200: { description: 'OpenAPI 3.1 document.', content: { 'application/json': {} } } },
        },
      },
      '/schemas': {
        get: {
          tags: ['Docs'], operationId: 'listSchemas', summary: 'List the downloadable JSON Schemas',
          description: 'Public.',
          responses: { 200: ok('The schemas.', S.SchemaIndex) },
        },
      },
      '/schemas/{file}': {
        get: {
          tags: ['Docs'], operationId: 'getSchema', summary: 'Download one JSON Schema',
          description: 'Public. A self-contained JSON Schema (2020-12, no $ref). Compile it with Ajv (allowUnionTypes: true) plus ajv-formats.',
          parameters: [{
            name: 'file', in: 'path', required: true, description: 'Schema name plus .json.', example: 'Card.json',
            schema: { type: 'string', pattern: '^[A-Za-z]+\\.json$', description: 'File name.', examples: ['Card.json'] },
          }],
          responses: {
            200: { description: 'The schema.', content: { 'application/json': {} } },
            ...errors({ 404: ['NOT_FOUND'] }),
          },
        },
      },
    },
  };
}
