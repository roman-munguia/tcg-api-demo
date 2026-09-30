// Error handling: the ApiError class, the catalogue of error codes, the JSON 404/405 fallback and the
// error handler that turns every failure into the same JSON envelope:
//   { status, code, message, details: [{ field, rule, message }], requestId }

export const ERROR_CODES = {
  VALIDATION_ERROR: { status: 400, when: 'Any query, body, header or business-rule problem. Every problem is listed in details.' },
  INVALID_JSON: { status: 400, when: 'The body is not valid JSON (strict parsing: the top level must be an object or array).' },
  MISSING_TOKEN: { status: 401, when: 'No Authorization header on an endpoint that needs a token.' },
  MALFORMED_AUTH_HEADER: { status: 401, when: "The Authorization header does not look like 'Bearer <token>'." },
  INVALID_TOKEN: { status: 401, when: 'The token is unknown, revoked by logout, or from before a server restart.' },
  TOKEN_EXPIRED: { status: 401, when: 'The token lifetime (TOKEN_TTL_SECONDS) has passed.' },
  INVALID_CREDENTIALS: { status: 401, when: 'Login with a wrong username or password.' },
  FORBIDDEN_ROLE: { status: 403, when: 'A read-only (viewer) user tried to change data.' },
  NOT_FOUND: { status: 404, when: 'No card or deck has that (well-formed) id, or an unknown schema file.' },
  ROUTE_NOT_FOUND: { status: 404, when: 'The path does not exist.' },
  METHOD_NOT_ALLOWED: { status: 405, when: 'The path exists but not for this HTTP method (see the Allow header).' },
  NAME_TAKEN: { status: 409, when: 'Another card (or deck) already has this name, ignoring upper/lower case.' },
  CARD_IN_USE: { status: 409, when: 'The card is still used by at least one deck.' },
  PAYLOAD_TOO_LARGE: { status: 413, when: 'The body is larger than 100 kB.' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, when: "No body was sent, or it was not sent as 'Content-Type: application/json'." },
  CHAOS_INJECTED: { status: 500, when: 'A simulated failure from the chaos knob. Nothing was changed; it is safe to retry.' },
  INTERNAL_ERROR: { status: 500, when: 'A real bug in the API.' },
};

export class ApiError extends Error {
  constructor(status, code, message, { details = [], headers = {} } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

export const validationError = (details) =>
  new ApiError(400, 'VALIDATION_ERROR', details.map((d) => `${d.field} ${d.message}`).join('; '), { details });

/** Lower-cases a path and strips one trailing slash, the way Express 5 matches routes by default. */
const normalizePath = (path) => (path.length > 1 ? path.replace(/\/$/, '') : path).toLowerCase();

/**
 * The last route: answers 405 (with an Allow header) for a known path with the wrong method, otherwise 404.
 * knownRoutes: { '/cards': ['GET', 'POST', ...], '/schemas/:file': ['GET'] }
 */
export function notFoundOrMethodNotAllowed(knownRoutes) {
  const matchers = Object.entries(knownRoutes).map(([path, methods]) => {
    const pattern = normalizePath(path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[a-z]+/gi, '[^/]+');
    const allow = methods.includes('GET') ? [...methods.slice(0, 1), 'HEAD', ...methods.slice(1)] : methods;
    return { regex: new RegExp(`^${pattern}$`), allow: allow.join(', ') };
  });
  return (req, res, next) => {
    const path = normalizePath(req.path);
    const match = matchers.find((m) => m.regex.test(path));
    if (match && req.method === 'OPTIONS') return res.set('Allow', match.allow).status(204).end();
    if (match) {
      return next(new ApiError(405, 'METHOD_NOT_ALLOWED', `${req.method} is not supported on ${req.path}. Allowed: ${match.allow}.`,
        { headers: { Allow: match.allow } }));
    }
    next(new ApiError(404, 'ROUTE_NOT_FOUND',
      `There is no route ${req.method} ${req.path}. Main routes: /cards, /cards/search, /decks, /decks/search, /auth/login, /health. Docs: /docs/`));
  };
}

// Errors thrown by Express's JSON body parser, by their `type`.
const BODY_PARSER_ERRORS = {
  'entity.parse.failed': [400, 'INVALID_JSON', 'The request body is not valid JSON. Check for trailing commas, single quotes or missing braces.'],
  'request.aborted': [400, 'INVALID_JSON', 'The request body was not received completely.'],
  'entity.too.large': [413, 'PAYLOAD_TOO_LARGE', 'The request body is larger than 100 kB.'],
  'charset.unsupported': [415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported charset. Send the body as UTF-8 JSON.'],
  'encoding.unsupported': [415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported Content-Encoding. Send the body uncompressed.'],
};

const WWW_AUTHENTICATE = {
  MALFORMED_AUTH_HEADER: 'Bearer realm="glyphwild", error="invalid_request"',
  INVALID_TOKEN: 'Bearer realm="glyphwild", error="invalid_token"',
  TOKEN_EXPIRED: 'Bearer realm="glyphwild", error="invalid_token"',
};

// Express recognises error middleware by its four parameters.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err); // too late for JSON; Express closes the connection

  let error = err;
  if (!(err instanceof ApiError)) {
    const known = BODY_PARSER_ERRORS[err.type];
    if (known) {
      error = new ApiError(...known);
    } else if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
      // A client error raised by Express itself, e.g. an undecodable %-escape in the path.
      error = new ApiError(err.status, 'VALIDATION_ERROR', 'The request could not be understood.');
    } else {
      console.error(`[error] ${req.id ?? '-'} ${req.method} ${req.originalUrl}\n`, err);
      error = new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong inside the API. The server log has the details (search for the requestId).');
    }
  }
  res.set(error.headers);
  if (error.status === 401) res.set('WWW-Authenticate', WWW_AUTHENTICATE[error.code] ?? 'Bearer realm="glyphwild"');
  res.status(error.status).json({
    status: error.status,
    code: error.code,
    message: error.message,
    details: error.details,
    requestId: req.id,
  });
}
