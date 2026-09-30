// Entry point: read the settings, open the database, start listening, print a banner.

import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { VERSION } from './system.js';

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

let config;
try {
  config = loadConfig(process.env);
} catch (err) {
  if (err instanceof ConfigError) fail(`Invalid setting: ${err.message}. Fix it in .env, your shell, or compose.yaml.`);
  throw err;
}

let db;
try {
  db = openDatabase({ dbFile: config.dbFile });
} catch (err) {
  if (err.errcode === 14 || err.code === 'EACCES') {
    fail(`Cannot open the database file '${config.dbFile}' (${err.message}).\n`
      + 'Check that its folder is writable. In a container use the named volume from compose.yaml; '
      + 'for a Podman bind mount add :Z,U (e.g. ./data:/app/data:Z,U).');
  }
  throw err;
}

const app = createApp({ config, db });
const server = app.listen(config.port, (err) => {
  if (err) {
    if (err.code === 'EADDRINUSE') {
      fail(`Port ${config.port} is already in use. Stop the other program (is the Docker/Podman container still running? `
        + 'try "docker compose down"), or set PORT (npm) / HOST_PORT (compose) to another port.');
    }
    throw err;
  }
  // Reset only after the port is ours, so a second accidental "npm start" cannot wipe the running instance's data.
  if (config.resetOnStart) db.resetToSeed();
  const url = `http://localhost:${server.address().port}`;
  console.log([
    `Glyphwild TCG API ${VERSION} listening on ${url}`,
    `  Docs:   ${url}/docs/`,
    `  Users:  ${config.adminUsername} / ${config.adminPassword} (read + write)   ${config.viewerUsername} / ${config.viewerPassword} (read-only)`,
    `  Data:   ${config.dbFile} (${config.resetOnStart ? 'reset to seed data on start' : 'kept between restarts'})`,
    `  Knobs:  LATENCY_MS=${config.latencyMs}  CHAOS_RATE=${config.chaosRate}  TEACHING_HEADERS=${config.teachingHeaders}  TOKEN_TTL_SECONDS=${config.tokenTtlSeconds}`,
    '  Reset the data any time with: npm run reset   (or POST /reset in the docs)',
  ].join('\n'));
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down.`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  server.closeAllConnections();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
