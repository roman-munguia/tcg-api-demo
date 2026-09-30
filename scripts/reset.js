// npm run reset: logs in as the admin user and restores the seed data of a running API.
// Works the same on Windows, macOS and Linux. Reads the same settings as the server (.env / env vars).
//   API_BASE_URL  where the API runs (default http://localhost:<HOST_PORT, PORT or 3000>)

const baseUrl = process.env.API_BASE_URL ?? `http://localhost:${process.env.HOST_PORT || process.env.PORT || 3000}`;
const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD || 'admin123';

async function main() {
  const login = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!login.ok) throw new Error(`login as '${username}' failed with ${login.status}: ${await login.text()}`);
  const { token } = await login.json();
  const reset = await fetch(`${baseUrl}/reset`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  if (!reset.ok) throw new Error(`POST /reset failed with ${reset.status}: ${await reset.text()}`);
  const body = await reset.json();
  console.log(`${body.message} ${body.cards} cards, ${body.decks} decks (${baseUrl}).`);
}

main().catch((err) => {
  console.error(`Could not reset ${baseUrl}: ${err.cause?.code === 'ECONNREFUSED' ? 'the API is not running there' : err.message}`);
  process.exit(1);
});
