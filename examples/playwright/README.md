# Playwright starter suite for the Glyphwild TCG API

Worked examples of API tests with [Playwright Test](https://playwright.dev/docs/api-testing). They use only the `request`
fixture, so **no browsers are downloaded**. Each spec is one lesson and is commented for beginners.

## Run it

From the repository root:

```bash
npm ci                     # the API itself (the suite starts it with `npm start`)
npm run examples:install   # this folder's dependencies
npm run examples:test      # all specs
```

Or from this folder: `npx playwright test`, one file `npx playwright test 04-auth`, the HTML report `npx playwright show-report`.

- **Server:** if nothing runs on port 3000, Playwright starts the API for you (`webServer` in `playwright.config.ts`) with
  `LATENCY_MS=0`, `CHAOS_RATE=0` and the default token lifetime, whatever `.env` says. For the knob exercises, start the API yourself. To test a server that already runs, e.g. the compose container: `API_BASE_URL=http://localhost:3000 npx playwright test`
  (PowerShell: `$env:API_BASE_URL='http://localhost:3000'; npx playwright test`).
- **Reset:** `tests/global.setup.ts` resets the data to the seed once per run. On a shared server set `RESET_BEFORE_RUN=false`;
  specs 02 and 03 then assume nobody edited the seed rows.
- **Credentials:** the repo-root `.env` is read automatically, so custom `ADMIN_*` / `VIEWER_*` values work for the tests too.

## Files

| File | What it is |
|---|---|
| `playwright.config.ts` | baseURL, the setup project, the webServer |
| `data.ts` | seed ids (`SEED`), credentials, `uniqueName()`, `cardPayload()`, `deckPayload()` |
| `fixtures.ts` | `adminRequest` / `viewerRequest` (already logged in) and `cleanup` (deletes what a test created) |
| `tests/global.setup.ts` | checks the API is up, resets the data |

## Lesson map

| Spec | Lesson | Shows |
|---|---|---|
| `01-health` | The first request | `toBeOK()`, `status()`, lower-case `headers()`, `objectContaining` |
| `02-get-by-id` | Get all, get one, 400 vs 404 | array vs object responses, `params: { id }`, `toMatchObject`, `toBeCloseTo`, `arrayContaining`, `toContainEqual` |
| `03-search-and-pagination` | Filters, sorting, paging | encoding with `params`, empty results, a loop over pages, asserting only on your own data |
| `04-auth` | Tokens, 401 vs 403 | login, 3 ways to reuse a token, the kinds of 401, the viewer's 403, check order, logout |
| `05-crud-chain` | Chaining requests | `test.step`, capturing the id and `Location`, PUT with a GET body, 204 has no body |
| `06-negative-data-driven` | Negative and boundary tests | a table of cases -> one test each, 415, `INVALID_JSON`, 409 and unique data |
| `07-schema-validation` | Contract tests | Ajv with the API's `/schemas/*.json` |
| `08-decks-and-cleanup` | Related data | teardown order (decks before cards), `CARD_IN_USE`, deck rules |
| `09-timeouts-latency` | Timeouts | `X-Delay-Ms`, per-request `timeout` |
| `10-retries-chaos` | Flakiness and retries | `X-Chaos-Fail-Times`, `toPass()`, `expect.poll()`, why `maxRetries` doesn't retry a 500 |

The default run is deterministic (about 50 tests in a few seconds) and safe to run in parallel and repeatedly: every test creates its own
uniquely named data and cleans it up.

Extra demos:

- `DEMO_FLAKY=1 npx playwright test 10-retries` shows a test marked **flaky** in the report.
- Start the API with `CHAOS_RATE=0.3` and run `npx playwright test --retries=2`. Some tests become flaky, and long request chains fail even
  with retries. Discuss why.
- Start the API with `TOKEN_TTL_SECONDS=30` and write a test that waits for `TOKEN_EXPIRED`.

## Exercises

Ideas that build on each spec (the README of the API lists every rule and error code):

1. **01**: assert that `settings.chaosRate` in `/health` is 0 and that `data.decks` is at least 6 (other tests create decks in parallel).
2. **02**: get the deck `Blank Grimoire` (`SEED.decks.blankGrimoire`) and assert that it has no cards and `totalCards` 0; then
   `GET /decks` (all decks) and find it in the array by name.
3. **03**: search `/decks/search?difficulty=beginner` and assert the three seed deck names (keep only ids starting with `d0000000-`:
   test decks are beginner decks too); then page through them with `pageSize: 1`.
4. **04**: write the `TOKEN_EXPIRED` test: start the API yourself with `TOKEN_TTL_SECONDS=5`, run only your spec with `API_BASE_URL`,
   and use `test.setTimeout`.
5. **05**: the same chain for a deck: create it with two cards, PUT it with a third card, check `totalCards`, delete it.
6. **06**: add the deck rules to a data-driven table: quantity 0 and 4, the same card twice, 41 cards in total, an unknown difficulty.
7. **07**: validate `/decks/search` against `DeckPage.json` and a login response against `LoginResponse.json`.
8. **08**: try to delete a card that is used by a seed deck and assert both deck names in `details`.
9. **09**: start the API with `LATENCY_MS=2000`, point the suite at it with `API_BASE_URL`, and make it pass by changing only
   `playwright.config.ts` (hint: `timeout`, `expect.timeout`).
10. **10**: wrap only the flaky step of a longer test in `toPass()` instead of retrying the whole test.
