import type { VercelRequest, VercelResponse } from '@vercel/node';

// Shared Turso Cloud SQLite KV-Store Client for Vercel Serverless Functions
// Uses stateless HTTP transport for high resilience and zero cold starts.

let clientInstance: any = null;
let initPromise: Promise<any> | null = null;

export async function getTursoClient() {
  const url = process.env.TURSO_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    return null;
  }

  if (clientInstance) {
    return clientInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      let createClientFn: any = null;

      // Safe dynamic import to prevent bundler failure when @libsql/client is not installed
      try {
        const mod = await import('@libsql/client');
        createClientFn = mod.createClient;
      } catch {
        const req = typeof require !== 'undefined' ? require : null;
        if (req) {
          try {
            const mod = req('@libsql/client');
            createClientFn = mod.createClient;
          } catch {
            // Package not yet installed in node_modules
          }
        }
      }

      if (!createClientFn) {
        return null;
      }

      const client = createClientFn({
        url,
        authToken,
      });

      await client.execute(`
        CREATE TABLE IF NOT EXISTS kv_store (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);

      clientInstance = client;
      return clientInstance;
    } catch (err) {
      console.warn('[Turso] Client initialization failed:', err);
      return null;
    }
  })();

  return initPromise;
}

export async function kvGet<T = any>(key: string): Promise<T | null> {
  try {
    const client = await getTursoClient();
    if (!client) return null;

    const res = await client.execute({
      sql: 'SELECT value FROM kv_store WHERE key = ?',
      args: [key],
    });

    if (!res.rows || res.rows.length === 0 || !res.rows[0]?.value) {
      return null;
    }

    return JSON.parse(res.rows[0].value as string) as T;
  } catch (err) {
    console.warn(`[Turso kvGet] Error retrieving key "${key}":`, err);
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<boolean> {
  try {
    const client = await getTursoClient();
    if (!client) return false;

    const serialized = JSON.stringify(value);
    await client.execute({
      sql: 'INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      args: [key, serialized],
    });
    return true;
  } catch (err) {
    console.warn(`[Turso kvSet] Error saving key "${key}":`, err);
    return false;
  }
}

export default clientInstance;
