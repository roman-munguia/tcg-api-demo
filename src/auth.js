// Login, logout and the bearer-token checks.
//
// There are two hardcoded users (overridable with env vars): an admin that can read and write, and a
// read-only viewer. Logging in returns a RANDOM opaque token (not a JWT) that is kept in server memory,
// so tokens end on logout, when they expire, or when the server restarts.
//
//   401 = "we don't know who you are" (no token, malformed header, unknown/expired token, failed login)
//   403 = "we know who you are, but your role can't do this"

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';
import { TOKEN_PATTERN } from './schemas.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TOKENS = 10000;
const TOKEN_REGEX = new RegExp(TOKEN_PATTERN);
const iso = (ms) => new Date(ms).toISOString();

// Hashing first gives both sides the same length, which timingSafeEqual requires.
const sha256 = (value) => createHash('sha256').update(String(value)).digest();
const sameText = (a, b) => timingSafeEqual(sha256(a), sha256(b));

export function usersFrom(config) {
  return [
    { username: config.adminUsername, password: config.adminPassword, role: 'admin' },
    { username: config.viewerUsername, password: config.viewerPassword, role: 'viewer' },
  ];
}

/** POST /auth/login */
export function login(req, res) {
  const { config, tokens, now } = req.app.locals;
  const { username, password } = req.body;
  const user = usersFrom(config).find((u) => sameText(username, u.username) && sameText(password, u.password));
  if (!user) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Wrong username or password.');

  const issuedAt = now();
  // Forget tokens that expired more than a day ago (expired ones are kept a while so they report TOKEN_EXPIRED).
  for (const [t, entry] of tokens) if (entry.expiresAt + DAY_MS < issuedAt) tokens.delete(t);
  // Keep memory bounded even under login-heavy load tests: forget the oldest tokens first.
  while (tokens.size >= MAX_TOKENS) tokens.delete(tokens.keys().next().value);

  const token = `tcg_${randomBytes(32).toString('base64url')}`;
  const expiresAt = issuedAt + config.tokenTtlSeconds * 1000;
  tokens.set(token, { username: user.username, role: user.role, expiresAt });
  res.json({
    token,
    tokenType: 'Bearer',
    expiresIn: config.tokenTtlSeconds,
    expiresAt: iso(expiresAt),
    user: { username: user.username, role: user.role },
  });
}

function malformedHeaderMessage(header) {
  if (/^bearer\s+bearer\b/i.test(header)) {
    return "You sent 'Bearer' twice. In Swagger's Authorize box paste only the token; in code send `Bearer ${token}` once.";
  }
  if (/^basic\s/i.test(header)) {
    return "This API uses bearer tokens, not Basic auth. Log in with POST /auth/login and send 'Authorization: Bearer <token>'.";
  }
  if (/^bearer\s*$/i.test(header)) return "The token is missing after 'Bearer'.";
  if (/^tcg_/.test(header)) return "Prefix the token with 'Bearer ': Authorization: Bearer <token>.";
  return "The Authorization header must look like 'Bearer <token>'.";
}

/** Middleware: requires a valid token from any user and sets req.user and req.token. */
export function requireUser(req, res, next) {
  const { tokens, now } = req.app.locals;
  const header = req.get('Authorization');
  if (!header || !header.trim()) {
    throw new ApiError(401, 'MISSING_TOKEN',
      "This endpoint needs a token. Log in with POST /auth/login, then send 'Authorization: Bearer <token>'.");
  }
  const match = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header);
  if (!match) throw new ApiError(401, 'MALFORMED_AUTH_HEADER', malformedHeaderMessage(header));

  const token = match[1];
  if (!TOKEN_REGEX.test(token)) {
    const shown = token.length > 12 ? `${token.slice(0, 12)}...` : token;
    throw new ApiError(401, 'INVALID_TOKEN',
      `The token "${shown}" does not look like a Glyphwild token (tokens start with tcg_ and are 47 characters long). `
      + 'Check for quotes, spaces, a truncated copy or an unset variable.');
  }
  const entry = tokens.get(token);
  if (!entry) {
    throw new ApiError(401, 'INVALID_TOKEN',
      'Unknown or revoked token. Tokens live in server memory: logout and a server restart clear them. Log in again.');
  }
  if (now() >= entry.expiresAt) {
    throw new ApiError(401, 'TOKEN_EXPIRED', `The token expired at ${iso(entry.expiresAt)}. Log in again.`);
  }
  req.user = { username: entry.username, role: entry.role };
  req.token = token;
  next();
}

function requireAdminRole(req, res, next) {
  if (req.user.role !== 'admin') {
    throw new ApiError(403, 'FORBIDDEN_ROLE',
      `User '${req.user.username}' has the read-only role '${req.user.role}' and cannot change data. Log in as an admin user.`);
  }
  next();
}

/** Middleware: a valid token of an admin user (401 first, then 403). */
export const requireAdmin = [requireUser, requireAdminRole];

/** GET /auth/me */
export function me(req, res) {
  const entry = req.app.locals.tokens.get(req.token);
  res.json({ username: req.user.username, role: req.user.role, expiresAt: iso(entry.expiresAt) });
}

/** POST /auth/logout: revokes only the token that was sent. */
export function logout(req, res) {
  req.app.locals.tokens.delete(req.token);
  res.status(204).end();
}
