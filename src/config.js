// Reads the settings from environment variables once at start-up.
// Every setting has a default, so nothing has to be configured. An invalid value stops the server
// with a message that names the variable (see server.js).

export class ConfigError extends Error {}

const int = (min, max) => (raw, name) => {
  if (!/^-?\d+$/.test(raw)) throw new ConfigError(`${name}="${raw}" must be a whole number between ${min} and ${max}`);
  const n = Number(raw);
  if (n < min || n > max) throw new ConfigError(`${name}="${raw}" must be a whole number between ${min} and ${max}`);
  return n;
};

const num = (min, max) => (raw, name) => {
  const n = Number(raw);
  if (raw.trim() === '' || Number.isNaN(n) || n < min || n > max) {
    throw new ConfigError(`${name}="${raw}" must be a number between ${min} and ${max}`);
  }
  return n;
};

const bool = (raw, name) => {
  const v = raw.toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new ConfigError(`${name}="${raw}" must be true or false`);
};

const text = (maxLength) => (raw, name) => {
  if (raw.length > maxLength) throw new ConfigError(`${name} must be at most ${maxLength} characters`);
  return raw;
};

// name: environment variable, key: property on the config object.
// compose: true when compose.yaml passes it into the container.
export const ENV_VARS = [
  { name: 'PORT', key: 'port', default: '3000', parse: int(0, 65535), compose: false, description: 'Port the API listens on (0 = any free port).' },
  { name: 'DB_FILE', key: 'dbFile', default: 'data/tcg.db', parse: text(500), compose: false, description: 'SQLite database file, or :memory: for a throw-away database.' },
  { name: 'RESET_ON_START', key: 'resetOnStart', default: 'true', parse: bool, compose: true, description: 'true = restore the seed data on every start; false = keep your changes.' },
  { name: 'ADMIN_USERNAME', key: 'adminUsername', default: 'admin', parse: text(50), compose: true, description: 'User that can read and write.' },
  { name: 'ADMIN_PASSWORD', key: 'adminPassword', default: 'admin123', parse: text(100), compose: true, description: 'Password of the admin user.' },
  { name: 'VIEWER_USERNAME', key: 'viewerUsername', default: 'viewer', parse: text(50), compose: true, description: 'Read-only user: every write returns 403.' },
  { name: 'VIEWER_PASSWORD', key: 'viewerPassword', default: 'viewer123', parse: text(100), compose: true, description: 'Password of the viewer user.' },
  { name: 'TOKEN_TTL_SECONDS', key: 'tokenTtlSeconds', default: '86400', parse: int(1, 2592000), compose: true, description: 'How long a login token stays valid (try 30 to practise TOKEN_EXPIRED).' },
  { name: 'LATENCY_MS', key: 'latencyMs', default: '0', parse: int(0, 60000), compose: true, description: 'Extra delay in milliseconds for every /cards and /decks request.' },
  { name: 'CHAOS_RATE', key: 'chaosRate', default: '0', parse: num(0, 1), compose: true, description: 'Share (0-1) of successful /cards and /decks requests that fail with 500 CHAOS_INJECTED instead.' },
  { name: 'TEACHING_HEADERS', key: 'teachingHeaders', default: 'true', parse: bool, compose: true, description: 'Allow the per-request X-Delay-Ms, X-Chaos-Fail-Times and X-Chaos-Key headers.' },
  { name: 'LOG_REQUESTS', key: 'logRequests', default: 'true', parse: bool, compose: true, description: 'Print one log line per request.' },
  { name: 'CORS_ORIGIN', key: 'corsOrigin', default: '*', parse: text(1000), compose: true, description: 'Browser origins allowed to call the API: * or a comma-separated list.' },
];

/** Builds the frozen config object from an env-like object (process.env in production). */
export function loadConfig(env = process.env) {
  const config = {};
  for (const v of ENV_VARS) {
    const raw = env[v.name] === undefined || env[v.name] === '' ? v.default : String(env[v.name]);
    config[v.key] = v.parse(raw, v.name);
  }
  for (const key of ['adminUsername', 'adminPassword', 'viewerUsername', 'viewerPassword']) {
    if (config[key] === '') throw new ConfigError(`${key} must not be empty`);
  }
  if (config.adminUsername === config.viewerUsername) {
    throw new ConfigError('ADMIN_USERNAME and VIEWER_USERNAME must be different');
  }
  config.corsOrigins = config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);
  return Object.freeze(config);
}
