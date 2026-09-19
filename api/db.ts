import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_URL || '',
  authToken: process.env.TURSO_AUTH_TOKEN || '',
});

let initPromise: Promise<void> | null = null;

export async function initDb(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await client.execute(`
          CREATE TABLE IF NOT EXISTS kv_store (
            key TEXT PRIMARY KEY,
            value TEXT
          )
        `);
      } catch (err) {
        console.warn('[Turso initDb] Failed to create kv_store table:', err);
        initPromise = null;
      }
    })();
  }
  return initPromise;
}

export async function kvGet(key: string): Promise<any | null> {
  try {
    await initDb();
    const result = await client.execute({
      sql: 'SELECT value FROM kv_store WHERE key = ?',
      args: [key],
    });
    if (!result.rows || result.rows.length === 0 || !result.rows[0]?.value) {
      return null;
    }
    return JSON.parse(result.rows[0].value as string);
  } catch (err) {
    console.warn(`[Turso kvGet] Error reading "${key}":`, err);
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    await initDb();
    await client.execute({
      sql: 'INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)',
      args: [key, JSON.stringify(value)],
    });
  } catch (err) {
    console.warn(`[Turso kvSet] Error writing "${key}":`, err);
  }
}

export default client;
