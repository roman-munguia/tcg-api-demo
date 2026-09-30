# Glyphwild TCG API (tcg-api-demo)

A small practice REST API for **Glyphwild**, a made-up trading card game. It is built for teaching API test automation with
Playwright (or Postman, REST Assured, ...):

- cards and decks you can **get, search, create, replace and delete**
- **login** with a hardcoded user that returns a random bearer token, plus a **read-only user** (401 vs 403)
- interactive **Swagger docs** where "Try it out" logs in for you
- 25 cards and 6 decks of **seed data** with fixed ids, and a **reset** endpoint
- **teaching knobs** for slow responses and random failures
- runs with **Node.js** or **Docker/Podman compose**
- a **Playwright starter suite** in [`examples/playwright`](examples/playwright/README.md)

> For learning only. The credentials are public on purpose; do not expose it to the internet.

---

## 1. Quick start

### A. With Node.js

You need Node.js **22.18 or newer** (`node -v`). The current LTS from <https://nodejs.org> is fine; with nvm run `nvm install` (reads `.nvmrc`).

```bash
npm ci        # install (first time only)
npm start     # start the API
```

Open **<http://localhost:3000/docs/>**. The terminal shows a banner with the URL, users and active knobs:

```
Glyphwild TCG API 1.0.0 listening on http://localhost:3000
  Docs:   http://localhost:3000/docs/
  Users:  admin / admin123 (read + write)   viewer / viewer123 (read-only)
  Data:   data/tcg.db (reset to seed data on start)
  Knobs:  LATENCY_MS=0  CHAOS_RATE=0  TEACHING_HEADERS=true  TOKEN_TTL_SECONDS=86400
  Reset the data any time with: npm run reset   (or POST /reset in the docs)
```

`npm run dev` restarts the API on every source change. The line `.env not found. Continuing without it.` is harmless.

### B. With Docker

```bash
docker compose up --build -d     # build the image and start it in the background
docker compose logs -f api       # watch the log (Ctrl+C stops watching, not the API)
docker compose down              # stop (add -v to also delete the data volume)
```

### C. With Podman

Podman needs a compose provider. Install one once, e.g. `pipx install podman-compose`
(or `python3 -m venv ~/.venvs/pc && ~/.venvs/pc/bin/pip install podman-compose`), then:

```bash
podman-compose up --build -d
podman-compose logs -f api
podman-compose down
```

Without compose: `podman build -t tcg-api-demo:local .` then `podman run -d --name tcg-api --init -p 3000:3000 -v tcg-data:/app/data tcg-api-demo:local`.

---

## 2. Log in and make your first calls

### In Swagger (recommended for the first minutes)

1. Open <http://localhost:3000/docs/>, expand **Auth > POST /auth/login** and click **Execute** (the body is pre-filled with `admin` / `admin123`).
2. The token is **applied automatically**: the padlocks close and every later "Try it out" sends `Authorization: Bearer <token>`.
3. Try **Cards > POST /cards** with the example body: **201**. Log in again as `viewer` / `viewer123` and repeat: **403**.

To paste a token yourself, click **Authorize** and paste **only the token** (no `Bearer `). A page refresh forgets the token; log in again.

### With curl (macOS / Linux / Git Bash)

```bash
curl "http://localhost:3000/cards?id=c0000000-0000-4000-8000-000000000001"

TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

curl -i -X POST http://localhost:3000/cards -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"My First Card","imageUrl":"https://images.glyphwild.example/cards/mine.png","dropRate":0.2}'
```

These commands work in bash, zsh and Git Bash. In PowerShell use its own client instead:

```powershell
$login = Invoke-RestMethod -Method Post http://localhost:3000/auth/login -ContentType 'application/json' `
  -Body '{"username":"admin","password":"admin123"}'
Invoke-RestMethod -Method Post http://localhost:3000/cards -Headers @{ Authorization = "Bearer $($login.token)" } `
  -ContentType 'application/json' -Body '{"name":"My First Card","imageUrl":"https://images.glyphwild.example/cards/mine.png","dropRate":0.2}'
```

### Users

| Username | Password | Can |
|---|---|---|
| `admin` | `admin123` | read and write, `POST /reset` |
| `viewer` | `viewer123` | read only; every write returns **403 FORBIDDEN_ROLE** |

Tokens are random opaque strings (`tcg_` + 43 characters, not JWTs), valid for 24 hours by default. They live in server memory:
**logout** revokes one, and a **server restart** clears all of them (log in again). Each login creates a new token; older ones stay valid.

---

## 3. Endpoints

Reading is public. Creating, changing and deleting needs an **admin** token. One resource is addressed with the **`?id=` query parameter**; lists come from **`/search`**.

| Method | Path | Auth | What it does | Success |
|---|---|---|---|---|
| GET | `/health` | - | Is the API up? Shows the active knobs | 200 |
| POST | `/auth/login` | - | `{ username, password }` -> a bearer token | 200 |
| GET | `/auth/me` | any token | Who owns this token | 200 |
| POST | `/auth/logout` | any token | Revoke this token | 204 |
| GET | `/cards?id=` | - | One card | 200 |
| GET | `/cards/search` | - | Filter, sort and page through cards | 200 |
| POST | `/cards` | admin | Create a card | 201 + `Location` |
| PUT | `/cards?id=` | admin | Replace a card (full replacement) | 200 |
| DELETE | `/cards?id=` | admin | Delete a card (409 while a deck uses it) | 204 |
| GET | `/decks?id=` | - | One deck | 200 |
| GET | `/decks/search` | - | Filter, sort and page through decks | 200 |
| POST | `/decks` | admin | Create a deck | 201 + `Location` |
| PUT | `/decks?id=` | admin | Replace a deck | 200 |
| DELETE | `/decks?id=` | admin | Delete a deck (its cards stay) | 204 |
| POST | `/reset` | admin | Restore the seed data | 200 |
| GET | `/docs/` | - | Swagger UI | 200 |
| GET | `/openapi.json` | - | OpenAPI 3.1 document (import into Postman, Bruno, Insomnia) | 200 |
| GET | `/schemas`, `/schemas/{Name}.json` | - | Standalone JSON Schemas for contract tests | 200 |

Good to know:

- `GET /cards` **without** `?id=` is a 400 that points you to `/cards/search`.
- POST and PUT bodies have **the same shape as GET responses**. Read-only fields (`id`, `createdAt`, `updatedAt`, `totalCards`) are accepted and ignored,
  so you can PUT a GET response back unchanged. For POST, change the `name` first: names are unique.
- PUT is a **full replacement**: optional fields you leave out go back to their defaults. `createdAt` is kept; `updatedAt` always changes.
- DELETE returns **204 with an empty body**. Don't call `response.json()` on it.
- Every response carries an `X-Request-Id` header (send your own to have it echoed). Errors repeat it as `requestId`.
- Wrong method on a known path: **405** with an `Allow` header. Unknown path: JSON **404 ROUTE_NOT_FOUND**.

---

## 4. Data model

The full, documented JSON Schemas are in Swagger (bottom of the page) and at <http://localhost:3000/schemas>.

### Card

| Field | Type | Rules | Example |
|---|---|---|---|
| `id` | UUID | read-only, generated | `c0000000-0000-4000-8000-000000000001` |
| `name` | string | **required**, 1-80, unique ignoring case (409) | `Cinderwing Drake` |
| `description` | string | 0-500, default `""` | `Flying. When it enters...` |
| `imageUrl` | string | **required**, absolute `http(s)://` URL, max 500 | `https://images.glyphwild.example/cards/cinderwing-drake.png` |
| `attributes` | object | key/value pairs, default `{}`; see below | `{"type":"Creature","element":["Tide","Lumen"],"cost":4}` |
| `dropRate` | number | **required**, above 0 and at most 1 (0.05 = 5%) | `0.06` |
| `createdAt`, `updatedAt` | date-time | read-only, UTC | `2026-01-01T00:01:00.000Z` |

`attributes`: at most 12 keys; names start with a lowercase letter and contain only letters and digits (max 30). A value is a string (1-60),
a number, `true`/`false`, or, **when there are several, an array** of 1-10 strings or numbers. No nested objects.
Conventional keys used by the seed data: `type` (Creature, Spell, Relic, Terrain), `element` (Ember, Tide, Gale, Stone, Lumen, Umbra),
`cost`, `points`, `rarity` (Common, Uncommon, Rare, Mythic), `keywords`, `legendary`.

The seed image URLs use the reserved `.example` domain: they are placeholders and never load.

### Deck

| Field | Type | Rules | Example |
|---|---|---|---|
| `id` | UUID | read-only, generated | `d0000000-0000-4000-8000-000000000001` |
| `name` | string | **required**, 1-80, unique ignoring case (409) | `Ashes & Embers` |
| `theme` | string | **required**, 1-60 | `Aggressive Ember burn` |
| `description` | string | 0-500, default `""` | `Cheap Ember creatures...` |
| `difficulty` | enum | **required**: `beginner`, `intermediate`, `advanced`, `expert` | `beginner` |
| `cards` | array | `[{ "cardId": <uuid>, "quantity": 1-3 }]`, default `[]`; each card once; at most 40 cards in total; every card must exist | `[{"cardId":"c0000000-...-000000000003","quantity":3}]` |
| `totalCards` | integer | read-only: the sum of the quantities | `10` |
| `createdAt`, `updatedAt` | date-time | read-only | |

---

## 5. Errors

Every error has the same shape. Assert on `status`, `code` and `details[].field` / `details[].rule`; the English messages may change.

```json
{
  "status": 400,
  "code": "VALIDATION_ERROR",
  "message": "body.dropRate must be <= 1; body.name is required",
  "details": [
    { "field": "body.dropRate", "rule": "maximum", "message": "must be <= 1" },
    { "field": "body.name", "rule": "required", "message": "is required" }
  ],
  "requestId": "3f0c2a8e-5d1b-4c7e-9a44-0b7f1f6d2c10"
}
```

All problems are reported at once, one per field, sorted by field. Unknown fields and unknown query parameters are **rejected** (400), not ignored.

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Any query, body, header or rule problem (see `details`) |
| 400 | `INVALID_JSON` | The body is not valid JSON |
| 401 | `MISSING_TOKEN` | No `Authorization` header |
| 401 | `MALFORMED_AUTH_HEADER` | Not `Bearer <token>` (e.g. the prefix is missing, `Bearer` twice, Basic auth) |
| 401 | `INVALID_TOKEN` | Unknown token, logged out, from before a restart, or not token-shaped (`undefined`, quotes) |
| 401 | `TOKEN_EXPIRED` | Older than `TOKEN_TTL_SECONDS` |
| 401 | `INVALID_CREDENTIALS` | Wrong username or password at login |
| 403 | `FORBIDDEN_ROLE` | The viewer tried to change data |
| 404 | `NOT_FOUND` | No card/deck with that (well-formed) id |
| 404 | `ROUTE_NOT_FOUND` | Unknown path |
| 405 | `METHOD_NOT_ALLOWED` | Known path, wrong method (see `Allow`) |
| 409 | `NAME_TAKEN` | The name exists already, ignoring case |
| 409 | `CARD_IN_USE` | Deleting a card that a deck still uses (details list the decks) |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 100 kB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | No body at all, or not sent as `Content-Type: application/json` (an empty body *with* the JSON type parses as `{}` and gets 400) |
| 500 | `CHAOS_INJECTED` | A simulated failure from a chaos knob. Nothing was changed; safe to retry |
| 500 | `INTERNAL_ERROR` | A real bug (the server log has the details under the `requestId`) |

**Check order.** When a request has several problems, you get the first of: teaching headers (400) -> 401 -> 403 -> body format (415 / 413 / 400 INVALID_JSON)
-> validation (400) -> not found (404) -> unknown cards in a deck (400) -> conflicts (409). Examples: the viewer sending an invalid body gets **403**;
no token plus a malformed id gets **401**.

Field rules at a glance (each row is a ready-made negative test):

| Send | You get `field` / `rule` |
|---|---|
| no `name` | `body.name` / `required` |
| `"name": ""` or 81 characters | `body.name` / `minLength` or `maxLength` |
| `"dropRate": 0`, `15`, `"0.5"` | `body.dropRate` / `exclusiveMinimum`, `maximum`, `type` |
| `"imageUrl": "/img.png"` or `"ftp://..."` | `body.imageUrl` / `pattern` |
| `"imageUrl": "https://bad host/x.png"` | `body.imageUrl` / `format` |
| `"attributes": {"Bad Key": 1}` | `body.attributes.Bad Key` / `propertyNames` |
| `"attributes": {"stats": {"a": 1}}` | `body.attributes.stats` / `type` |
| `"rarity": "Rare"` (top level) | `body.rarity` / `additionalProperties` |
| deck `"quantity": 4` | `body.cards[0].quantity` / `maximum` |
| the same `cardId` twice | `body.cards[1].cardId` / `uniqueCardIds` |
| a `cardId` that doesn't exist | `body.cards[0].cardId` / `cardExists` |
| more than 40 cards in total | `body.cards` / `maxTotalCards` |
| PUT with a body `id` different from `?id` | `body.id` / `idMatchesQuery` |
| `?id=` missing / `ABC` / given twice | `query.id` / `required`, `pattern`, `singleValue` |
| `/cards/search?nmae=x` | `query.nmae` / `additionalProperties` |

---

## 6. Search, sort and paging

`GET /cards/search` filters (all optional, combined with AND):

| Param | Matches |
|---|---|
| `name` | name **contains** the text, ignoring case (accents count: `zephyr` does not find "Zéphyr Kite") |
| `type` | `attributes.type` **equals** it, ignoring case |
| `element` | `attributes.element` equals it, or **contains** it when the element is an array |
| `minDropRate`, `maxDropRate` | `dropRate` range (0-1) |
| `minPoints`, `maxPoints` | `attributes.points` range (cards without points never match) |
| `sortBy` | `name` (default), `dropRate`, `createdAt` |

`GET /decks/search`: `name`, `theme` (contains), `difficulty` (exact), `cardId` (decks that use this card),
`sortBy` = `name` (default), `difficulty` (beginner < intermediate < advanced < expert), `totalCards`, `createdAt`.

Both take `order` (`asc` default, `desc`), `page` (from 1) and `pageSize` (1-50, default 10) and answer:

```json
{ "items": [ ... ], "page": 1, "pageSize": 10, "total": 25, "totalPages": 3 }
```

No match is **200 with `items: []`**, never 404. Ties are always broken by id, so the order is stable between runs.

---

## 7. Seed data

**Glyphwild**: on the Shattered Isles, duelists called Scribes ink living glyphs onto cards. Every glyph has one or two elements
(Ember, Tide, Gale, Stone, Lumen, Umbra) and is a Creature, Spell, Relic or Terrain.

The ids and timestamps are fixed, so they are the same after every reset: cards are `c0000000-0000-4000-8000-0000000000NN` (NN = 01-25),
decks `d0000000-0000-4000-8000-0000000000NN` (01-06). `c0000000-0000-4000-8000-000000000999` never exists (use it for 404).

| Id (last digits) | Card | Notes |
|---|---|---|
| ...001 | Cinderwing Drake | used by 2 decks: DELETE gives 409 CARD_IN_USE |
| ...002 | Ash & Ember Phoenix | Mythic, legendary, dropRate 0.015; `&` in the name |
| ...008 | Sea-Glass Serpent | element is an array `["Tide", "Lumen"]` |
| ...012 | Zéphyr Kite | non-ASCII name, highest dropRate (0.44) |
| ...025 | Wandering Glyph | in **no** deck (safe to delete) and has no element |

| Id (last digits) | Deck | Difficulty | totalCards |
|---|---|---|---|
| ...001 | Ashes & Embers | beginner | 10 |
| ...002 | Tidebound Control | advanced | 13 |
| ...003 | Gale Force Rush | intermediate | 7 |
| ...004 | Stonewall Fortress | beginner | 9 |
| ...005 | Twilight Paradox | expert | 14 |
| ...006 | Blank Grimoire | beginner | 0 (empty, for PUT practice) |

Handy demo queries: `/cards/search?element=Lumen` (5 cards, including array values), `?type=Spell` (5), `?minPoints=7` (3),
`?maxDropRate=0.02` (the 2 mythics), `?name=zephyr` (0: the accent lesson), `/decks/search?cardId=c0000000-0000-4000-8000-000000000001` (2 decks),
`/decks/search?sortBy=difficulty&order=desc` (expert first).

All 25 cards are in [`src/seed.js`](src/seed.js).

**Reset the data:** `POST /reset` (admin) in Swagger, or `npm run reset` from the repo folder (works on every OS and for the container;
it uses `HOST_PORT`/`PORT` from `.env`, or set `API_BASE_URL`).
With `RESET_ON_START=true` (the default) every restart restores the seed data too.

---

## 8. Teaching knobs

All are **off by default**, so normal test runs are deterministic. They only affect `/cards` and `/decks` routes, never `/health`, `/docs`, `/auth` or `/reset`.

| Knob | How | Try this |
|---|---|---|
| Slow server | `LATENCY_MS=2000` (env / compose) | Watch the duration in Swagger; set a short `timeout` in Playwright |
| Slow request | header `X-Delay-Ms: 1500` (0-10000) | `request.get('/cards/search', { headers: { 'X-Delay-Ms': '1500' }, timeout: 500 })` fails with a timeout |
| Flaky server | `CHAOS_RATE=0.3` (0-1) | 30% of otherwise successful requests return 500 `CHAOS_INJECTED`; run `npx playwright test --retries=2` |
| Predictable failures | headers `X-Chaos-Fail-Times: 2` + `X-Chaos-Key: my-test-1` | the first 2 requests with that key fail, then they pass: practise `expect(...).toPass()`. The count is fixed on first use of a key (until `POST /reset`), so use a new key per test |
| Token expiry | `TOKEN_TTL_SECONDS=30` | log in, wait 30 s, get 401 `TOKEN_EXPIRED` |
| Read-only user | log in as `viewer` | 403 on every write |

Chaos fails a request only after all its checks passed (so 400/401/403/404/409 answers are never replaced), and before anything is written: retrying
is always safe. With `CHAOS_RATE=0.3`, tests that make many requests in a row (like a full CRUD chain) often fail even with retries. That's the
lesson: retries hide flakiness, they don't remove it. `TEACHING_HEADERS=false` disables the per-request headers (e.g. on a shared server).
Delayed responses carry `X-Delay-Applied-Ms`; injected failures carry `X-Chaos: injected`.

---

## 9. Configuration

Set variables in a **`.env` file** (copy [`.env.example`](.env.example): `cp .env.example .env`, PowerShell `Copy-Item .env.example .env`,
cmd `copy .env.example .env`). Both `npm start` and compose read it. Variables set in your shell win over `.env`.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port for `npm start` (in compose, change `HOST_PORT` instead) |
| `DB_FILE` | `data/tcg.db` | SQLite file (`:memory:` = throw-away). Its folder is created automatically |
| `RESET_ON_START` | `true` | `true`: seed data on every start. `false`: keep your changes |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin123` | The read-write user |
| `VIEWER_USERNAME` / `VIEWER_PASSWORD` | `viewer` / `viewer123` | The read-only user |
| `TOKEN_TTL_SECONDS` | `86400` | Token lifetime (1 - 2592000) |
| `LATENCY_MS` | `0` | Delay for `/cards` and `/decks` requests (0 - 60000) |
| `CHAOS_RATE` | `0` | Share of successful `/cards` and `/decks` requests that fail with 500 (0 - 1) |
| `TEACHING_HEADERS` | `true` | Honour `X-Delay-Ms`, `X-Chaos-Fail-Times`, `X-Chaos-Key` |
| `LOG_REQUESTS` | `true` | One log line per request |
| `CORS_ORIGIN` | `*` | Browser origins allowed to call the API (`*` or a comma-separated list) |

An invalid value stops the API with a message naming the variable, e.g. `Invalid setting: LATENCY_MS="abc" must be a whole number between 0 and 60000`.

A one-off value without `.env`: bash/zsh `LATENCY_MS=2000 npm start`; PowerShell `$env:LATENCY_MS=2000; npm start` (undo with
`Remove-Item Env:LATENCY_MS`); cmd `set LATENCY_MS=2000&& npm start`.

---

## 10. Docker Compose parameters

Everything in [`compose.yaml`](compose.yaml) is commented. The parameters, for teaching:

| Key | Value here | What it means |
|---|---|---|
| `name` | `tcg-api-demo` | Project name: prefix of container, network and volume names |
| `services.api` | | One service called `api` (`docker compose logs api`) |
| `build.context` / `build.dockerfile` | `.` / `Dockerfile` | Where and how the image is built (`up --build`) |
| `build.args.NODE_VERSION` | `${NODE_VERSION:-24}` | Build argument: Node major of the base image (22, 24, 26) |
| `image` | `tcg-api-demo:local` | Name:tag of the built image |
| `ports` | `"${HOST_PORT:-3000}:3000"` | `<your computer>:<container>`. `HOST_PORT=8080` -> <http://localhost:8080/docs/> |
| `environment` | the variables of section 9 | Settings inside the container; `${X:-d}` = `X` from your shell / `.env`, else `d` |
| `volumes` | `tcg-data:/app/data` | Named volume: the database file survives `down` / `up` (not `down -v`) |
| `init` | `true` | A tiny init process, so Ctrl+C and `stop` shut down promptly |
| `restart` | `"no"` | `on-failure`, `unless-stopped`, `always` restart the container automatically |
| `healthcheck` | `GET /health` every 10 s | `docker compose ps` shows `healthy` |
| top-level `volumes` | `tcg-data: {}` | Declares the named volume |

After changing a value, run `docker compose up -d` again (it re-creates the container). `docker compose restart` does **not** pick up changes.

Compose lessons to try:

1. `HOST_PORT=8080 docker compose up -d`, then open <http://localhost:8080/docs/>.
2. Set `RESET_ON_START=false`, create a card, `docker compose down` + `up -d`: the card is still there. `down -v` deletes it for good.
3. `LATENCY_MS=2000` or `CHAOS_RATE=0.3`, then run the Playwright examples against the container.
4. Change `ADMIN_PASSWORD` and watch the old password get 401.
5. `NODE_VERSION=22 docker compose up --build -d`, then check `docker compose exec api node -v`.

Podman notes: containers are called `tcg-api-demo_api_1`; host ports must be 1024 or above (rootless); for a bind mount on
Fedora/SELinux use `./data:/app/data:Z,U`; check health by hand with `podman healthcheck run tcg-api-demo_api_1`.

---

## 11. Playwright examples

```bash
npm ci                     # the API's own dependencies (the examples start it with `npm start`)
npm run examples:install   # installs the example suite (no browsers needed: API tests only)
npm run examples:test
```

Against a server that is already running (e.g. the compose container): `cd examples/playwright && API_BASE_URL=http://localhost:3000 npx playwright test`.
See [examples/playwright/README.md](examples/playwright/README.md) for the lesson map and exercises.

---

## 12. Changing the API

The code is plain JavaScript (no build step) in [`src/`](src). Start with the route table in [`src/app.js`](src/app.js).

| I want to... | Do this |
|---|---|
| add a card field | add it to `cardProperties` in `src/schemas.js` (with description and examples) and to `cardFrom()` in `src/cards.js`; the docs update themselves |
| add a search filter | add a property to `CardSearchQuery` in `src/schemas.js` and one `if (q.x !== undefined) ...` line in `searchCards()` |
| change the seed data | edit `src/seed.js`, then `npm run reset` (or restart) |
| change the default credentials | `ADMIN_*` / `VIEWER_*` in `.env` or compose, or the defaults in `src/config.js` |
| add an endpoint | a handler, a line in the route table in `src/app.js`, the path in `ROUTES` there, and its documentation in `src/openapi.js` |

`npm test` runs the internal regression suite (Node's built-in test runner). It also checks the docs: every schema field must have a description,
limits and examples, every documented example must return the status in its title, and every response is validated against the OpenAPI document.

---

## 13. Troubleshooting and common mistakes

| Symptom | Cause / fix |
|---|---|
| `Port 3000 is already in use` | Another program (or the container) uses it: `docker compose down`, or set `PORT` / `HOST_PORT` |
| Tests get HTML instead of JSON | Something else (a React/Next dev server?) answers on that port |
| 415 `UNSUPPORTED_MEDIA_TYPE` from Playwright | You passed `data: JSON.stringify(body)`. Pass the object itself: `data: body` |
| 401 `MALFORMED_AUTH_HEADER` | Missing `Bearer ` prefix, or `Bearer` twice (in Swagger's Authorize box paste only the token) |
| 401 `INVALID_TOKEN` after a while | The server restarted (tokens live in memory): log in again |
| `response.json()` throws after DELETE | 204 has no body: use `response.status()` / `response.text()` |
| 409 `NAME_TAKEN` on the second run | Hardcoded names: generate unique ones |
| 400 `singleValue` on `id` | You followed the `Location` header **and** passed `params: { id }` |
| `request.get('/cards')` ignores the `/api` in baseURL | A leading `/` replaces the path of baseURL; keep baseURL an origin like `http://localhost:3000` |
| `Cannot open the database file` in a container | Use the named volume from compose.yaml; for Podman bind mounts add `:Z,U` |
| `npm ci` fails with an engine error | Node is too old: install 22.18+ (`nvm install`) |
| One `ExperimentalWarning: SQLite` line | Only when running `node src/server.js` by hand on Node 22; harmless (npm scripts hide it) |

---

## Maintainers

- `npm test`: internal suite, about 170 tests, no extra dependencies. `npm run examples:test`: the Playwright starter suite.
- Stack: Node >= 22.18 with the built-in `node:sqlite` (no native modules), Express 5, Ajv (JSON Schema 2020-12), swagger-ui-express.
  Dependencies are pinned exactly; `swagger-ui-dist` is pinned on purpose because swagger-ui-express accepts any `>=5`.
- The image runs Node 24 on Alpine as the unprivileged `node` user. To run the internal tests on that runtime:
  `podman run --rm -v "$PWD":/src:ro,z docker.io/library/node:24-alpine sh -c 'mkdir /w && cd /src && tar --exclude=./node_modules --exclude=./examples/playwright/node_modules -cf - . | tar -xf - -C /w && cd /w && npm ci --ignore-scripts && npm test'`
