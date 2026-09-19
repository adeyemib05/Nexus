// Shared Turso Cloud SQLite KV-Store Client for Vercel Serverless Functions
// Uses direct stateless HTTP pipeline for zero-cold-start performance and 100% compatibility.

function getEndpoint(): { url: string; token: string } | null {
  const rawUrl = (
    process.env.TURSO_URL ||
    process.env.TURSO_DATABASE_URL ||
    process.env.TURSO_DB_URL ||
    process.env.DATABASE_URL
  ) ? (
    process.env.TURSO_URL ||
    process.env.TURSO_DATABASE_URL ||
    process.env.TURSO_DB_URL ||
    process.env.DATABASE_URL
  )!.replace(/["']/g, '').trim() : null;

  const token = (
    process.env.TURSO_AUTH_TOKEN ||
    process.env.TURSO_TOKEN ||
    process.env.TURSO_DB_TOKEN
  ) ? (
    process.env.TURSO_AUTH_TOKEN ||
    process.env.TURSO_TOKEN ||
    process.env.TURSO_DB_TOKEN
  )!.replace(/["']/g, '').trim() : null;

  if (!rawUrl || !token) {
    return null;
  }

  // Convert libsql:// to https://
  let base = rawUrl;
  if (base.startsWith('libsql://')) {
    base = base.replace('libsql://', 'https://');
  } else if (!base.startsWith('http://') && !base.startsWith('https://')) {
    base = `https://${base}`;
  }

  // Ensure trailing slash removed
  base = base.replace(/\/+$/, '');

  return {
    url: `${base}/v2/pipeline`,
    token,
  };
}

let tableInitPromise: Promise<void> | null = null;

export async function initDb(): Promise<void> {
  if (!tableInitPromise) {
    tableInitPromise = (async () => {
      const endpoint = getEndpoint();
      if (!endpoint) return;

      try {
        await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${endpoint.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                type: 'execute',
                stmt: {
                  sql: 'CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT)',
                },
              },
              { type: 'close' },
            ],
          }),
        });
      } catch (err) {
        console.warn('[Turso initDb] Table creation notice:', err);
        tableInitPromise = null;
      }
    })();
  }
  return tableInitPromise;
}

export async function kvGet(key: string): Promise<any | null> {
  const endpoint = getEndpoint();
  if (!endpoint) return null;

  try {
    await initDb();
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${endpoint.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            type: 'execute',
            stmt: {
              sql: 'SELECT value FROM kv_store WHERE key = ?',
              args: [{ type: 'text', value: key }],
            },
          },
          { type: 'close' },
        ],
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const rows = data?.results?.[0]?.response?.result?.rows;
    if (!rows || rows.length === 0 || !rows[0]?.[0]) {
      return null;
    }

    const cell = rows[0][0];
    const valueStr = typeof cell === 'object' && cell !== null && 'value' in cell ? cell.value : cell;
    if (!valueStr) return null;

    return JSON.parse(valueStr);
  } catch (err) {
    console.warn(`[Turso kvGet] Error reading "${key}":`, err);
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<boolean> {
  const endpoint = getEndpoint();
  if (!endpoint) return false;

  try {
    await initDb();
    const serialized = JSON.stringify(value);
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${endpoint.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            type: 'execute',
            stmt: {
              sql: 'INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)',
              args: [
                { type: 'text', value: key },
                { type: 'text', value: serialized },
              ],
            },
          },
          { type: 'close' },
        ],
      }),
    });

    return res.ok;
  } catch (err) {
    console.warn(`[Turso kvSet] Error saving "${key}":`, err);
    return false;
  }
}

export const client = {
  execute: async ({ sql, args }: { sql: string; args?: any[] }) => {
    const endpoint = getEndpoint();
    if (!endpoint) throw new Error('Turso credentials missing');
    const formattedArgs = (args || []).map((a) => ({ type: 'text', value: String(a) }));
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${endpoint.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          { type: 'execute', stmt: { sql, args: formattedArgs } },
          { type: 'close' },
        ],
      }),
    });
    return res.json();
  },
};

export default client;
