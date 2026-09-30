// Starts the real entry point (src/server.js) as a child process.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { ENV_VARS } from '../src/config.js';

const SERVER = new URL('../src/server.js', import.meta.url).pathname;

/** Starts the server; resolves once the banner shows the URL (or the process exits). */
function startServer(env) {
  const cleanEnv = { ...process.env };
  for (const v of ENV_VARS) delete cleanEnv[v.name];
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', SERVER], {
    env: { ...cleanEnv, LOG_REQUESTS: 'false', PORT: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  return new Promise((resolve) => {
    child.stdout.on('data', (d) => {
      stdout += d;
      const url = /listening on (http:\/\/\S+)/.exec(stdout)?.[1];
      if (url) resolve({ child, url, output: () => ({ stdout, stderr }) });
    });
    child.on('exit', (code) => resolve({ child, code, output: () => ({ stdout, stderr }) }));
  });
}

const stop = (child) => new Promise((resolve) => {
  if (child.exitCode !== null) return resolve(child.exitCode);
  child.once('exit', (code) => resolve(code));
  child.kill('SIGTERM');
});

const login = async (url) => (await (await fetch(`${url}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }),
})).json()).token;

const createCard = async (url, token, name) => fetch(`${url}/cards`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ name, imageUrl: 'https://images.glyphwild.example/cards/x.png', dropRate: 0.2 }),
});

const cardCount = async (url) => (await (await fetch(`${url}/health`)).json()).data.cards;

describe('server process', () => {
  const dir = mkdtempSync(join(tmpdir(), 'glyphwild-'));
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('prints the banner with the real port, no ExperimentalWarning, exits 0 on SIGTERM', async () => {
    const { child, url, output } = await startServer({ DB_FILE: ':memory:' });
    assert.ok(url, output().stderr);
    assert.match(output().stdout, /Users: {2}admin \/ admin123/);
    assert.equal((await fetch(`${url}/health`)).status, 200);
    assert.equal(await stop(child), 0);
    assert.doesNotMatch(output().stderr, /ExperimentalWarning/);
  });

  it('exits 1 with a clear message for an invalid setting', async () => {
    const { code, output } = await startServer({ LATENCY_MS: 'abc', DB_FILE: ':memory:' });
    assert.equal(code, 1);
    assert.match(output().stderr, /LATENCY_MS="abc" must be a whole number/);
    const same = await startServer({ ADMIN_USERNAME: 'x', VIEWER_USERNAME: 'x', DB_FILE: ':memory:' });
    assert.equal(same.code, 1);
  });

  it('RESET_ON_START=false keeps data in the file; true restores the seed; folders are created', async () => {
    const dbFile = join(dir, 'nested', 'folder', 'tcg.db');
    let s = await startServer({ DB_FILE: dbFile, RESET_ON_START: 'false' });
    assert.equal((await createCard(s.url, await login(s.url), 'Persistent Card')).status, 201);
    await stop(s.child);

    s = await startServer({ DB_FILE: dbFile, RESET_ON_START: 'false' });
    assert.equal(await cardCount(s.url), 26);
    await stop(s.child);

    s = await startServer({ DB_FILE: dbFile, RESET_ON_START: 'true' });
    assert.equal(await cardCount(s.url), 25);
    await stop(s.child);
  });

  it('a second instance on a busy port fails without resetting the running one', async () => {
    const dbFile = join(dir, 'busy.db');
    const first = await startServer({ DB_FILE: dbFile, RESET_ON_START: 'true' });
    assert.equal((await createCard(first.url, await login(first.url), 'Keep Me')).status, 201);
    const port = new URL(first.url).port;
    const second = await startServer({ DB_FILE: dbFile, RESET_ON_START: 'true', PORT: port });
    assert.equal(second.code, 1);
    assert.match(second.output().stderr, /already in use/);
    assert.equal(await cardCount(first.url), 26);
    await stop(first.child);
  });
});
