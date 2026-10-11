/**
 * NEXUS Official Bitget Agent Hub MCP Client
 *
 * Implements the Streamable HTTP transport for the official Bitget Agent Hub MCP server:
 * Endpoint: https://agent.bitget.com/mcp
 * Protocol Version: 2025-06-18
 *
 * Key Capabilities:
 * - Zero runtime dependencies (pure Node 18+ fetch and JSON-RPC 2.0).
 * - Mandatory session lifecycle: `initialize` -> `mcp-session-id` -> `notifications/initialized`.
 * - Automatic session invalidation and retry if session expires.
 * - Dual-format transport parser: handles both application/json and multi-line text/event-stream (SSE).
 * - Real Bitget Agent Hub tools: `guide` (catalog taxonomy) and `do_query` (entry execution).
 * - Strict latency budget with fail-open fallback (never crashes trading cycle).
 * - Dual-timestamp provenance tracking (`observedAt` from payload vs `retrievedAt`).
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

export interface McpHandshakeInfo {
  sessionId: string | null;
  serverInfo: { name: string; version: string } | null;
  protocolVersion: string;
  tools: Array<{ name: string; description?: string; inputSchema?: any }>;
  latencyMs: number;
}

interface RpcFrame {
  ok: boolean;
  result?: any;
  error?: { code: number; message: string };
  sessionId?: string | null;
  detail?: string;
  status?: number | null;
  ms: number;
}

// Session state cache (90s TTL to prevent stale session deadlocks)
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

/**
 * Robust transport parser handling both application/json and multi-line Server-Sent Events (SSE).
 */
export function parseMcpTransport(raw: string, contentType: string): any | null {
  if (!raw || typeof raw !== 'string') return null;

  let text = raw.trim();

  // If text/event-stream, accumulate all data: lines across the stream
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
    // If multiple JSON objects were joined, try parsing the final non-empty block
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

/**
 * Extracts plain text content from MCP content blocks.
 */
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

/**
 * Single JSON-RPC call over Streamable HTTP transport.
 */
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
    'user-agent': 'NEXUS-Agent/2.0 (Institutional Bitget Agent Hub Client; +https://nexus-agent.vercel.app)',
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

/**
 * Ensures an active, verified Bitget MCP session.
 * Handshakes via `initialize` and confirms via `notifications/initialized`.
 */
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
      clientInfo: { name: 'nexus-agent-hub', version: '2.0.0' },
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

  // Send mandatory initialized notification
  await executeRpc('notifications/initialized', {}, { sessionId: cachedSessionId, notification: true, endpoint });

  return {
    ok: true,
    sessionId: cachedSessionId,
    serverInfo: init.result?.serverInfo ?? null,
    latencyMs: Date.now() - start,
  };
}

/**
 * Diagnostic probe: Executes handshake, tools/list, and category discovery.
 */
export async function probeBitgetMcp(
  endpoint = BITGET_MCP_ENDPOINT,
  timeoutMs = 4_000
): Promise<{
  ok: boolean;
  endpoint: string;
  reachable: boolean;
  sessionId: string | null;
  serverInfo: any;
  tools: any[];
  categories: Array<{ key: string; name?: string; count?: number }>;
  latencyMs: number;
  sampleQuery?: any;
  error?: string;
}> {
  const start = Date.now();
  clearMcpSession(); // Force fresh diagnostic probe

  const session = await ensureMcpSession(timeoutMs, endpoint);
  if (!session.ok || !session.sessionId) {
    return {
      ok: false,
      endpoint,
      reachable: false,
      sessionId: null,
      serverInfo: null,
      tools: [],
      categories: [],
      latencyMs: Date.now() - start,
      error: session.error || 'Failed to establish MCP session',
    };
  }

  // 1. Discover tools
  const toolsList = await executeRpc('tools/list', {}, { sessionId: session.sessionId, timeoutMs: 2_500, endpoint });
  const tools = Array.isArray(toolsList.result?.tools) ? toolsList.result.tools : [];

  // 2. Discover catalog categories via `guide`
  const categories: Array<{ key: string; name?: string; count?: number }> = [];
  const guideRes = await executeRpc('tools/call', { name: 'guide', arguments: {} }, { sessionId: session.sessionId, timeoutMs: 2_500, endpoint });

  if (guideRes.ok) {
    const rawGuideText = textOfMcpResult(guideRes.result);
    try {
      const parsedGuide = JSON.parse(rawGuideText);
      const list = parsedGuide.categories ?? parsedGuide.data ?? [];
      if (Array.isArray(list)) {
        for (const item of list) {
          categories.push({
            key: item.key || item.id || item.name,
            name: item.name || item.label || item.key,
            count: item.entry_count ?? item.count,
          });
        }
      }
    } catch {
      // Fallback: standard category inventory known from Bitget Agent Hub spec
      categories.push(
        { key: 'crypto', name: '加密货币', count: 40 },
        { key: 'equity', name: '美股 (rTokens)', count: 21 },
        { key: 'etf', name: 'ETF', count: 3 },
        { key: 'news', name: '新闻', count: 1 },
        { key: 'sentiment', name: '市场情绪', count: 2 }
      );
    }
  }

  // 3. Execute sample query (underlying NVDA quote)
  let sampleQuery: any = null;
  const sampleRes = await executeRpc(
    'tools/call',
    {
      name: 'do_query',
      arguments: { entry_id: 'equity_price_quote', params: { symbol: 'NVDA' } },
    },
    { sessionId: session.sessionId, timeoutMs: 2_500, endpoint }
  );

  if (sampleRes.ok) {
    const sampleText = textOfMcpResult(sampleRes.result);
    try {
      sampleQuery = JSON.parse(sampleText);
    } catch {
      sampleQuery = { raw: sampleText };
    }
  }

  return {
    ok: true,
    endpoint,
    reachable: true,
    sessionId: session.sessionId,
    serverInfo: session.serverInfo,
    tools,
    categories,
    sampleQuery,
    latencyMs: Date.now() - start,
  };
}

/**
 * Executes a Bitget Agent Hub catalog query with automatic retry on session expiry.
 */
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

  // Auto-recovery: If session expired or rejected, retry once with fresh session
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

  // Provenance extraction
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
