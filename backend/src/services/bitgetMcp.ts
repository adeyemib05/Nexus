/**
 * NEXUS Official Bitget Agent Hub MCP Service (Backend Colocation)
 *
 * Colocated within backend/src/services/ to satisfy backend/tsconfig.json rootDir "./src"
 * while maintaining 100% protocol and contract parity with api/mcp/client.ts.
 */

export const BITGET_MCP_ENDPOINT = process.env.BITGET_MCP_ENDPOINT || 'https://agent.bitget.com/mcp';
export const MCP_PROTOCOL_VERSION = '2025-06-18';

export interface McpProvenance {
  servedBy: 'Bitget';
  tool: 'do_query' | 'guide';
  entryId?: string;
  origin: string | null;
  relay: string | null;
  attribution: string;
  retrievedAt: string;
  observedAt: string | null;
  delaySeconds: number | null;
  sourceType: 'delayed-intraday-quote' | 'undated-quote' | 'catalog-meta';
}

export interface McpSuccess<T = any> {
  ok: true;
  data: T;
  provenance: McpProvenance;
  latencyMs: number;
}

export interface McpFailure {
  ok: false;
  reason: string;
  detail?: string;
  servedBy: 'Bitget';
  attemptedAt: string;
  latencyMs: number;
}

export type McpResult<T = any> = McpSuccess<T> | McpFailure;

interface RpcFrame {
  ok: boolean;
  result?: any;
  error?: { code: number; message: string };
  sessionId?: string | null;
  detail?: string;
  status?: number | null;
  ms: number;
}

let cachedSessionId: string | null = null;
let sessionExpiresAt = 0;
const SESSION_TTL_MS = 90_000;

export function clearMcpSession(): void {
  cachedSessionId = null;
  sessionExpiresAt = 0;
}

export function getCachedMcpSession(): string | null {
  if (cachedSessionId && Date.now() < sessionExpiresAt) {
    return cachedSessionId;
  }
  clearMcpSession();
  return null;
}

export function parseMcpTransport(raw: string, contentType: string): any | null {
  if (!raw || typeof raw !== 'string') return null;

  let text = raw.trim();

  if (contentType.toLowerCase().includes('text/event-stream')) {
    const lines = raw.split(/\r?\n/);
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (dataLines.length === 0) return null;
    text = dataLines.join('\n');
  }

  try {
    return JSON.parse(text);
  } catch {
    try {
      const chunks = text.split(/\n(?=\{)/).filter(Boolean);
      if (chunks.length > 0) {
        return JSON.parse(chunks[chunks.length - 1]);
      }
    } catch {
      return null;
    }
    return null;
  }
}

export function textOfMcpResult(result: any): string {
  const blocks = result?.content ?? [];
  if (!Array.isArray(blocks)) {
    return typeof result === 'string' ? result : JSON.stringify(result || '');
  }
  return blocks
    .map((b: any) => (typeof b?.text === 'string' ? b.text : typeof b === 'string' ? b : ''))
    .filter(Boolean)
    .join('\n');
}

async function executeRpc(
  method: string,
  params: unknown,
  options: {
    sessionId?: string | null;
    timeoutMs?: number;
    notification?: boolean;
    endpoint?: string;
  } = {}
): Promise<RpcFrame> {
  const endpoint = options.endpoint || BITGET_MCP_ENDPOINT;
  const timeoutMs = options.timeoutMs || 3_000;
  const isNotification = !!options.notification;

  const body = isNotification
    ? { jsonrpc: '2.0', method, params }
    : { jsonrpc: '2.0', id: Date.now(), method, params };

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    'user-agent': 'NEXUS-Backend/2.0 (Official Bitget Agent Hub Client)',
  };

  if (options.sessionId) {
    headers['mcp-session-id'] = options.sessionId;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const ms = Date.now() - started;
    const issuedSession = res.headers.get('mcp-session-id');

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return {
        ok: false,
        status: res.status,
        ms,
        detail: `HTTP ${res.status}: ${errBody.slice(0, 150)}`,
        sessionId: issuedSession,
      };
    }

    if (isNotification) {
      return { ok: true, ms, sessionId: issuedSession };
    }

    const raw = await res.text();
    const contentType = res.headers.get('content-type') || '';
    const message = parseMcpTransport(raw, contentType);

    if (!message) {
      return { ok: false, ms, detail: 'Failed to parse JSON/SSE transport payload', sessionId: issuedSession };
    }

    if (message.error) {
      return {
        ok: false,
        ms,
        error: message.error,
        detail: `JSON-RPC error [${message.error.code}]: ${message.error.message}`,
        sessionId: issuedSession,
      };
    }

    return {
      ok: true,
      ms,
      result: message.result,
      sessionId: issuedSession,
    };
  } catch (err: any) {
    const ms = Date.now() - started;
    return {
      ok: false,
      ms,
      detail: err.name === 'AbortError' ? `Timeout exceeded (${timeoutMs}ms)` : `Network unreachable: ${err.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureMcpSession(
  timeoutMs = 3_000,
  endpoint = BITGET_MCP_ENDPOINT
): Promise<{ ok: boolean; sessionId: string | null; serverInfo: any; error?: string; latencyMs: number }> {
  const existing = getCachedMcpSession();
  if (existing) {
    return { ok: true, sessionId: existing, serverInfo: null, latencyMs: 0 };
  }

  const start = Date.now();
  const init = await executeRpc(
    'initialize',
    {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'nexus-backend-hub', version: '2.0.0' },
    },
    { timeoutMs, endpoint }
  );

  if (!init.ok || !init.sessionId) {
    return {
      ok: false,
      sessionId: null,
      serverInfo: null,
      error: init.detail || 'Initialization failed',
      latencyMs: Date.now() - start,
    };
  }

  cachedSessionId = init.sessionId;
  sessionExpiresAt = Date.now() + SESSION_TTL_MS;

  await executeRpc('notifications/initialized', {}, { sessionId: cachedSessionId, notification: true, endpoint });

  return {
    ok: true,
    sessionId: cachedSessionId,
    serverInfo: init.result?.serverInfo ?? null,
    latencyMs: Date.now() - start,
  };
}

export async function queryBitgetMcp<T = any>(
  entryId: string,
  params: Record<string, unknown> = {},
  options: { timeoutMs?: number; endpoint?: string } = {}
): Promise<McpResult<T>> {
  const timeoutMs = options.timeoutMs || 2_500;
  const endpoint = options.endpoint || BITGET_MCP_ENDPOINT;
  const retrievedAt = new Date().toISOString();
  const start = Date.now();

  const session = await ensureMcpSession(timeoutMs, endpoint);
  if (!session.ok || !session.sessionId) {
    return {
      ok: false,
      reason: 'Bitget MCP session unavailable',
      detail: session.error,
      servedBy: 'Bitget',
      attemptedAt: retrievedAt,
      latencyMs: Date.now() - start,
    };
  }

  let call = await executeRpc(
    'tools/call',
    { name: 'do_query', arguments: { entry_id: entryId, params } },
    { sessionId: session.sessionId, timeoutMs, endpoint }
  );

  if (!call.ok && (call.status === 400 || call.status === 401 || (call.detail && /session/i.test(call.detail)))) {
    clearMcpSession();
    const freshSession = await ensureMcpSession(timeoutMs, endpoint);
    if (freshSession.ok && freshSession.sessionId) {
      call = await executeRpc(
        'tools/call',
        { name: 'do_query', arguments: { entry_id: entryId, params } },
        { sessionId: freshSession.sessionId, timeoutMs, endpoint }
      );
    }
  }

  const latencyMs = Date.now() - start;

  if (!call.ok) {
    return {
      ok: false,
      reason: 'Bitget MCP do_query call failed',
      detail: call.detail,
      servedBy: 'Bitget',
      attemptedAt: retrievedAt,
      latencyMs,
    };
  }

  const text = textOfMcpResult(call.result);
  if (!text) {
    return {
      ok: false,
      reason: 'Bitget MCP returned empty content',
      servedBy: 'Bitget',
      attemptedAt: retrievedAt,
      latencyMs,
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }

  const envelope = parsed?.data ?? parsed;
  const meta = envelope?.extra?.metadata?.arguments ?? {};
  const origin = meta?.extra_params?.source ? String(meta.extra_params.source).toUpperCase() : null;
  const relay = meta?.provider_choices?.provider ? String(meta.provider_choices.provider) : 'massive';

  const row = Array.isArray(envelope?.results) && envelope.results.length > 0 ? envelope.results[0] : null;
  const observedIso = row?.last_timestamp || (row?.time ? new Date(Number(row.time)).toISOString() : null);

  const delaySeconds =
    observedIso && Number.isFinite(Date.parse(retrievedAt))
      ? Math.round((Date.parse(retrievedAt) - Date.parse(observedIso)) / 1000)
      : null;

  const attribution = origin
    ? `via Bitget Agent Hub, sourced from ${origin}`
    : `via Bitget Agent Hub (relayed by ${relay})`;

  return {
    ok: true,
    data: parsed as T,
    provenance: {
      servedBy: 'Bitget',
      tool: 'do_query',
      entryId,
      origin,
      relay,
      attribution,
      retrievedAt,
      observedAt: observedIso,
      delaySeconds,
      sourceType: observedIso ? 'delayed-intraday-quote' : 'catalog-meta',
    },
    latencyMs,
  };
}

export class BitgetMcpClient {
  async callTool(name: string, args: Record<string, unknown>): Promise<any> {
    const session = await ensureMcpSession(2_500);
    if (!session.ok || !session.sessionId) {
      throw new Error(`Bitget MCP session unavailable: ${session.error}`);
    }
    const res = await executeRpc('tools/call', { name, arguments: args }, { sessionId: session.sessionId, timeoutMs: 2_500 });
    if (!res.ok) {
      throw new Error(res.detail || 'Tool invocation failed');
    }
    return res.result;
  }
}

export const bitgetMcp = new BitgetMcpClient();
