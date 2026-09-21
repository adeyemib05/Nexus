// Shared Turso Cloud SQLite KV-Store Client & Core Domain Models for Vercel Serverless Functions
// Uses direct stateless HTTP pipeline for zero-cold-start performance and 100% compatibility.

// ── TYPES & INTERFACES ────────────────────────────────────────────────────────

export type SignalType = 'macro' | 'technical' | 'sentiment' | 'onchain' | 'news';
export type MarketRegime = 'bullish_trend' | 'bearish_trend' | 'ranging' | 'uncertain';
export type StrategyType = 'momentum_long' | 'momentum_short' | 'mean_reversion' | 'capital_protection';
export type SignalStrength = 'strong_bullish' | 'weak_bullish' | 'neutral' | 'weak_bearish' | 'strong_bearish' | 'bullish' | 'bearish';
export type TradeSide = 'long' | 'short';

export interface SignalReading {
  type: SignalType;
  score: number;        // [-1.0, +1.0]
  strength: SignalStrength;
  confidence: number;   // [0.0, 1.0]
  label: string;
  source: 'live' | 'local' | 'fallback';
  available?: boolean; // false if provider failed
  details: Record<string, unknown>;
  timestamp: number;
}

export interface RegimeReading {
  regime: MarketRegime;
  confidence: number;   // 0 - 97
  fusedScore: number;   // [-1.0, +1.0]
  signals: SignalReading[];
  timestamp: number;
  reasoning: string;
}

export interface Trade {
  id: string;
  symbol: string;
  side: TradeSide;
  strategy: StrategyType;
  entryPrice: number;
  exitPrice?: number;
  positionSizePct: number;
  positionSizeUSD: number;
  stopLoss: number;
  takeProfit: number;
  peakPrice?: number;
  status: 'open' | 'closed';
  openedAt: number;
  closedAt?: number;
  pnl?: number;
  pnlPct?: number;
  unrealizedPnl?: number;
  unrealizedPnlPct?: number;
  explanation: string;
  regimeAtEntry: MarketRegime;
  regimeConfidence: number;
  fusedScoreAtEntry?: number;
  source: 'seed_historical' | 'live_simulated';
  cycleId?: number;
}

export interface TradeStatsResponse {
  totalTrades: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  strategyBreakdown: Record<string, { count: number; winRate: number; avgPnl: number }>;
}

export interface PerformanceSnapshot {
  timestamp: number;
  portfolioValue: number;
  totalPnl: number;
  totalPnlPct: number;
  sharpeRatio: number | null;
  winRate: number;
  maxDrawdown: number;
  currentDrawdown: number;
  totalTrades: number;
  openTrades: number;
}

export interface DetailedPerformance extends PerformanceSnapshot {
  openTradesCount: number;
  closedTradesCount: number;
  winningTradesCount: number;
  losingTradesCount: number;
  profitFactor: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

// ── TURSO HTTP TRANSPORT ──────────────────────────────────────────────────────

function getEndpoint(): { url: string; token: string } | null {
  const rawUrl = (
    process.env.TURSO_URL ||
    process.env.TURSO_DATABASE_URL ||
    process.env.TURSO_DB_URL ||
    process.env.DATABASE_URL ||
    'libsql://nexus-production-adeyemib05.aws-us-east-1.turso.io'
  ).replace(/["']/g, '').trim();

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

      const initStatements = [
        'CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT)',
        `CREATE TABLE IF NOT EXISTS market_candles (
          symbol TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          open REAL NOT NULL,
          high REAL NOT NULL,
          low REAL NOT NULL,
          close REAL NOT NULL,
          volume REAL NOT NULL,
          PRIMARY KEY (symbol, timeframe, timestamp)
        )`,
        'CREATE INDEX IF NOT EXISTS idx_market_candles_lookup ON market_candles (symbol, timeframe, timestamp DESC)',
        `CREATE TABLE IF NOT EXISTS indicator_snapshots (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          rsi REAL,
          ema20 REAL,
          ema50 REAL,
          macd REAL,
          macd_signal REAL,
          macd_histogram REAL,
          indicators_json TEXT
        )`,
        'CREATE INDEX IF NOT EXISTS idx_indicators_lookup ON indicator_snapshots (symbol, timeframe, timestamp DESC)',
        `CREATE TABLE IF NOT EXISTS signal_snapshots (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          symbol TEXT NOT NULL,
          technical_score REAL,
          technical_confidence REAL,
          technical_strength TEXT,
          liquidity_score REAL,
          liquidity_confidence REAL,
          liquidity_strength TEXT,
          sentiment_score REAL,
          sentiment_confidence REAL,
          sentiment_strength TEXT,
          onchain_score REAL,
          onchain_confidence REAL,
          onchain_strength TEXT,
          news_score REAL,
          news_confidence REAL,
          news_strength TEXT,
          fused_score REAL,
          regime TEXT,
          regime_confidence REAL,
          details_json TEXT
        )`,
        'CREATE INDEX IF NOT EXISTS idx_signals_lookup ON signal_snapshots (symbol, timestamp DESC)',
        `CREATE TABLE IF NOT EXISTS ai_decisions (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          symbol TEXT NOT NULL,
          market_price REAL NOT NULL,
          action TEXT NOT NULL,
          confidence REAL NOT NULL,
          strategy TEXT NOT NULL,
          reasoning TEXT NOT NULL,
          provider TEXT,
          fused_score REAL,
          regime TEXT,
          executed INTEGER NOT NULL DEFAULT 0,
          block_reason TEXT,
          trade_id TEXT,
          provider_attempted TEXT,
          provider_success INTEGER DEFAULT 0,
          provider_failure_reason TEXT,
          latency_ms INTEGER,
          decision_type TEXT DEFAULT 'model'
        )`,
        'CREATE INDEX IF NOT EXISTS idx_ai_decisions_lookup ON ai_decisions (symbol, timestamp DESC)',
        `CREATE TABLE IF NOT EXISTS risk_events (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          symbol TEXT NOT NULL,
          action TEXT NOT NULL,
          strategy TEXT,
          confidence REAL,
          block_reason TEXT NOT NULL,
          executed INTEGER NOT NULL DEFAULT 0,
          trade_id TEXT,
          fused_score REAL,
          regime TEXT,
          details_json TEXT
        )`,
        'CREATE INDEX IF NOT EXISTS idx_risk_events_lookup ON risk_events (timestamp DESC)',
        // Safe additive migrations for existing deployments (SQLite ignores duplicate columns on IF NOT EXISTS)
        // We run these separately and swallow errors for already-migrated databases
      ];

      // Safe ALTER TABLE migrations for existing tables (safe to run repeatedly)
      const migrationStatements = [
        'ALTER TABLE ai_decisions ADD COLUMN provider_attempted TEXT',
        'ALTER TABLE ai_decisions ADD COLUMN provider_success INTEGER DEFAULT 0',
        'ALTER TABLE ai_decisions ADD COLUMN provider_failure_reason TEXT',
        'ALTER TABLE ai_decisions ADD COLUMN latency_ms INTEGER',
        'ALTER TABLE ai_decisions ADD COLUMN decision_type TEXT DEFAULT \'model\'',
        'ALTER TABLE risk_events ADD COLUMN action TEXT',
        'ALTER TABLE risk_events ADD COLUMN strategy TEXT',
        'ALTER TABLE risk_events ADD COLUMN confidence REAL',
        'ALTER TABLE risk_events ADD COLUMN block_reason TEXT',
        'ALTER TABLE risk_events ADD COLUMN executed INTEGER DEFAULT 0',
        'ALTER TABLE risk_events ADD COLUMN trade_id TEXT',
        'ALTER TABLE risk_events ADD COLUMN fused_score REAL',
        'ALTER TABLE risk_events ADD COLUMN regime TEXT',
        'ALTER TABLE risk_events ADD COLUMN details_json TEXT',
      ];

      // Execute each init statement independently so one error does not abort the others
      for (const sql of initStatements) {
        try {
          await fetch(endpoint.url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${endpoint.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              requests: [
                { type: 'execute', stmt: { sql } },
                { type: 'close' },
              ],
            }),
          });
        } catch (err) {
          console.warn('[Turso initDb] Stmt notice:', err);
        }
      }

      // Run migrations independently — each ALTER TABLE may fail on already-migrated columns, that is safe
      for (const migSql of migrationStatements) {
        try {
          const endpoint2 = getEndpoint();
          if (!endpoint2) break;
          await fetch(endpoint2.url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${endpoint2.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              requests: [
                { type: 'execute', stmt: { sql: migSql } },
                { type: 'close' },
              ],
            }),
          });
        } catch (_) {
          // Expected when column already exists in SQLite
        }
      }
    })();
  }
  return tableInitPromise;
}

function formatSqlArg(val: any): { type: string; value?: any } {
  if (val === null || val === undefined) return { type: 'null' };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { type: 'integer', value: String(val) };
    return { type: 'float', value: val };
  }
  if (typeof val === 'boolean') {
    return { type: 'integer', value: val ? '1' : '0' };
  }
  return { type: 'text', value: String(val) };
}

function extractCellValue(cell: any): any {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'object' && 'value' in cell) {
    const val = cell.value;
    if (val === null || val === undefined) return null;
    if (cell.type === 'integer') {
      const num = Number(val);
      return Number.isSafeInteger(num) ? num : val;
    }
    if (cell.type === 'float') {
      return Number(val);
    }
    return val;
  }
  return cell;
}

export async function querySql<T = Record<string, any>>(sql: string, args: any[] = []): Promise<T[]> {
  const endpoint = getEndpoint();
  if (!endpoint) return [];

  try {
    await initDb();
    const formattedArgs = args.map(formatSqlArg);
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
            stmt: { sql, args: formattedArgs },
          },
          { type: 'close' },
        ],
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    if (data?.results?.[0]?.type === 'error' || data?.results?.[0]?.error) {
      console.warn('[Turso querySql] Query error:', data.results[0].error, 'SQL:', sql);
    }
    const result = data?.results?.[0]?.response?.result;
    if (!result) return [];

    const cols: Array<{ name: string }> = result.cols || [];
    const rows: any[][] = result.rows || [];

    return rows.map((row) => {
      const obj: Record<string, any> = {};
      cols.forEach((col, idx) => {
        obj[col.name] = extractCellValue(row[idx]);
      });
      return obj as T;
    });
  } catch (err) {
    console.warn('[Turso querySql] Error executing query:', err);
    return [];
  }
}

export async function executeSql(sql: string, args: any[] = []): Promise<boolean> {
  const endpoint = getEndpoint();
  if (!endpoint) return false;

  try {
    await initDb();
    const formattedArgs = args.map(formatSqlArg);
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
            stmt: { sql, args: formattedArgs },
          },
          { type: 'close' },
        ],
      }),
    });

    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    if (data?.results?.[0]?.type === 'error' || data?.results?.[0]?.error) {
      console.warn('[Turso executeSql] Statement error:', data.results[0].error, 'SQL:', sql);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Turso executeSql] Error executing statement:', err);
    return false;
  }
}

export async function executeBatchSql(stmts: Array<{ sql: string; args?: any[] }>): Promise<boolean> {
  const endpoint = getEndpoint();
  if (!endpoint || stmts.length === 0) return false;

  try {
    await initDb();
    const requests = stmts.map(({ sql, args }) => ({
      type: 'execute',
      stmt: {
        sql,
        args: (args || []).map(formatSqlArg),
      },
    }));
    requests.push({ type: 'close' } as any);

    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${endpoint.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });

    return res.ok;
  } catch (err) {
    console.warn('[Turso executeBatchSql] Error executing batch:', err);
    return false;
  }
}

// ── RELATIONAL HISTORICAL STORE ACCESSORS ──────────────────────────────────────

export interface HistoricalCandle {
  symbol: string;
  timeframe: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function saveCandles(candles: HistoricalCandle[]): Promise<boolean> {
  if (!candles || candles.length === 0) return true;
  const stmts = candles.map((c) => ({
    sql: `INSERT OR REPLACE INTO market_candles (symbol, timeframe, timestamp, open, high, low, close, volume)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [c.symbol, c.timeframe, c.timestamp, c.open, c.high, c.low, c.close, c.volume],
  }));
  return executeBatchSql(stmts);
}

export async function getHistoricalCandles(
  symbol = 'BTCUSDT',
  timeframe = '1m',
  limit = 100,
  from?: number,
  to?: number
): Promise<HistoricalCandle[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  let sql = 'SELECT symbol, timeframe, timestamp, open, high, low, close, volume FROM market_candles WHERE symbol = ? AND timeframe = ?';
  const args: any[] = [symbol, timeframe];

  if (from) {
    sql += ' AND timestamp >= ?';
    args.push(from);
  }
  if (to) {
    sql += ' AND timestamp <= ?';
    args.push(to);
  }

  sql += ' ORDER BY timestamp DESC LIMIT ?';
  args.push(safeLimit);

  const rows = await querySql<HistoricalCandle>(sql, args);
  return rows.reverse(); // Return ascending chronological order for charts
}

export interface HistoricalIndicatorSnapshot {
  id?: string;
  symbol: string;
  timeframe: string;
  timestamp: number;
  rsi: number;
  ema20: number;
  ema50: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  indicatorsJson?: Record<string, any>;
}

export async function saveIndicatorSnapshot(data: HistoricalIndicatorSnapshot): Promise<boolean> {
  const id = data.id || `ind_${data.symbol}_${data.timeframe}_${data.timestamp}`;
  const sql = `INSERT OR REPLACE INTO indicator_snapshots
    (id, symbol, timeframe, timestamp, rsi, ema20, ema50, macd, macd_signal, macd_histogram, indicators_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const args = [
    id,
    data.symbol,
    data.timeframe,
    data.timestamp,
    data.rsi,
    data.ema20,
    data.ema50,
    data.macd,
    data.macdSignal,
    data.macdHistogram,
    data.indicatorsJson ? JSON.stringify(data.indicatorsJson) : null,
  ];
  return executeSql(sql, args);
}

export async function getHistoricalIndicators(
  symbol = 'BTCUSDT',
  timeframe = '1m',
  limit = 50,
  from?: number,
  to?: number
): Promise<HistoricalIndicatorSnapshot[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  let sql = 'SELECT id, symbol, timeframe, timestamp, rsi, ema20, ema50, macd, macd_signal as macdSignal, macd_histogram as macdHistogram, indicators_json as indicatorsJson FROM indicator_snapshots WHERE symbol = ? AND timeframe = ?';
  const args: any[] = [symbol, timeframe];

  if (from) {
    sql += ' AND timestamp >= ?';
    args.push(from);
  }
  if (to) {
    sql += ' AND timestamp <= ?';
    args.push(to);
  }

  sql += ' ORDER BY timestamp DESC LIMIT ?';
  args.push(safeLimit);

  const rows = await querySql<any>(sql, args);
  return rows.map((r) => ({
    ...r,
    indicatorsJson: r.indicatorsJson ? JSON.parse(r.indicatorsJson) : undefined,
  })).reverse();
}

export interface HistoricalSignalSnapshot {
  id?: string;
  timestamp: number;
  symbol: string;
  technical: { score: number; confidence: number; strength: string };
  liquidity: { score: number; confidence: number; strength: string };
  sentiment: { score: number; confidence: number; strength: string };
  onchain: { score: number; confidence: number; strength: string };
  news: { score: number; confidence: number; strength: string };
  fusedScore: number;
  regime: string;
  regimeConfidence: number;
  details?: Record<string, any>;
}

export async function saveSignalSnapshot(data: HistoricalSignalSnapshot): Promise<boolean> {
  const id = data.id || `sig_${data.symbol}_${data.timestamp}`;
  const sql = `INSERT OR REPLACE INTO signal_snapshots
    (id, timestamp, symbol, technical_score, technical_confidence, technical_strength,
     liquidity_score, liquidity_confidence, liquidity_strength,
     sentiment_score, sentiment_confidence, sentiment_strength,
     onchain_score, onchain_confidence, onchain_strength,
     news_score, news_confidence, news_strength,
     fused_score, regime, regime_confidence, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const args = [
    id,
    data.timestamp,
    data.symbol,
    data.technical.score,
    data.technical.confidence,
    data.technical.strength,
    data.liquidity.score,
    data.liquidity.confidence,
    data.liquidity.strength,
    data.sentiment.score,
    data.sentiment.confidence,
    data.sentiment.strength,
    data.onchain.score,
    data.onchain.confidence,
    data.onchain.strength,
    data.news.score,
    data.news.confidence,
    data.news.strength,
    data.fusedScore,
    data.regime,
    data.regimeConfidence,
    data.details ? JSON.stringify(data.details) : null,
  ];
  return executeSql(sql, args);
}

export async function getHistoricalSignals(
  symbol = 'BTCUSDT',
  limit = 50,
  from?: number,
  to?: number
): Promise<HistoricalSignalSnapshot[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  let sql = `SELECT id, timestamp, symbol,
    technical_score as tech_s, technical_confidence as tech_c, technical_strength as tech_st,
    liquidity_score as liq_s, liquidity_confidence as liq_c, liquidity_strength as liq_st,
    sentiment_score as sent_s, sentiment_confidence as sent_c, sentiment_strength as sent_st,
    onchain_score as onc_s, onchain_confidence as onc_c, onchain_strength as onc_st,
    news_score as news_s, news_confidence as news_c, news_strength as news_st,
    fused_score as fusedScore, regime, regime_confidence as regimeConfidence, details_json as detailsJson
    FROM signal_snapshots WHERE symbol = ?`;
  const args: any[] = [symbol];

  if (from) {
    sql += ' AND timestamp >= ?';
    args.push(from);
  }
  if (to) {
    sql += ' AND timestamp <= ?';
    args.push(to);
  }

  sql += ' ORDER BY timestamp DESC LIMIT ?';
  args.push(safeLimit);

  const rows = await querySql<any>(sql, args);
  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    symbol: r.symbol,
    technical: { score: r.tech_s, confidence: r.tech_c, strength: r.tech_st },
    liquidity: { score: r.liq_s, confidence: r.liq_c, strength: r.liq_st },
    sentiment: { score: r.sent_s, confidence: r.sent_c, strength: r.sent_st },
    onchain: { score: r.onc_s, confidence: r.onc_c, strength: r.onc_st },
    news: { score: r.news_s, confidence: r.news_c, strength: r.news_st },
    fusedScore: r.fusedScore,
    regime: r.regime,
    regimeConfidence: r.regimeConfidence,
    details: r.detailsJson ? JSON.parse(r.detailsJson) : undefined,
  })).reverse();
}

export interface HistoricalAiDecision {
  id: string;
  timestamp: number;
  symbol: string;
  marketPrice: number;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  strategy: string;
  reasoning: string;
  provider?: string;
  fusedScore?: number;
  regime?: string;
  executed: boolean;
  blockReason?: string | null;
  tradeId?: string | null;
  // Provider telemetry
  providerAttempted?: string | null;
  providerSuccess?: boolean;
  providerFailureReason?: string | null;
  latencyMs?: number | null;
  decisionType?: 'model' | 'failsafe_hold'; // 'model' = genuine AI inference, 'failsafe_hold' = AI failure
}

export async function saveHistoricalAiDecision(data: HistoricalAiDecision): Promise<boolean> {
  const sql = `INSERT OR REPLACE INTO ai_decisions
    (id, timestamp, symbol, market_price, action, confidence, strategy, reasoning, provider,
     fused_score, regime, executed, block_reason, trade_id,
     provider_attempted, provider_success, provider_failure_reason, latency_ms, decision_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const args = [
    data.id,
    data.timestamp,
    data.symbol,
    data.marketPrice,
    data.action,
    data.confidence,
    data.strategy,
    data.reasoning,
    data.provider || null,
    data.fusedScore ?? null,
    data.regime || null,
    data.executed ? 1 : 0,
    data.blockReason || null,
    data.tradeId || null,
    data.providerAttempted || null,
    data.providerSuccess ? 1 : 0,
    data.providerFailureReason || null,
    data.latencyMs ?? null,
    data.decisionType || 'model',
  ];
  return executeSql(sql, args);
}

export async function getHistoricalAiDecisions(
  symbol = 'BTCUSDT',
  limit = 50,
  from?: number,
  to?: number
): Promise<HistoricalAiDecision[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  let sql = `SELECT id, timestamp, symbol, market_price as marketPrice, action, confidence, strategy, reasoning,
    provider, fused_score as fusedScore, regime, executed, block_reason as blockReason, trade_id as tradeId,
    provider_attempted as providerAttempted, provider_success as providerSuccess,
    provider_failure_reason as providerFailureReason, latency_ms as latencyMs, decision_type as decisionType
    FROM ai_decisions WHERE symbol = ?`;
  const args: any[] = [symbol];

  if (from) {
    sql += ' AND timestamp >= ?';
    args.push(from);
  }
  if (to) {
    sql += ' AND timestamp <= ?';
    args.push(to);
  }

  sql += ' ORDER BY timestamp DESC LIMIT ?';
  args.push(safeLimit);

  const rows = await querySql<any>(sql, args);
  return rows.map((r) => ({
    ...r,
    executed: Boolean(r.executed),
    providerSuccess: Boolean(r.providerSuccess),
  })).reverse();
}

// ── RISK EVENTS ───────────────────────────────────────────────────────────────

export interface HistoricalRiskEvent {
  id: string;
  timestamp: number;
  symbol: string;
  action: string;           // The AI action that was blocked (BUY/SELL/HOLD)
  strategy?: string | null;
  confidence?: number | null;
  blockReason: string;      // Why execution was blocked
  executed: boolean;        // Always false for risk_events (they are non-executed)
  tradeId?: string | null;
  fusedScore?: number | null;
  regime?: string | null;
  details?: Record<string, any> | null;
}

export async function saveRiskEvent(data: HistoricalRiskEvent): Promise<boolean> {
  const sql = `INSERT OR REPLACE INTO risk_events
    (id, timestamp, symbol, action, strategy, confidence, block_reason, executed, trade_id, fused_score, regime, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const args = [
    data.id,
    data.timestamp,
    data.symbol,
    data.action,
    data.strategy || null,
    data.confidence ?? null,
    data.blockReason,
    data.executed ? 1 : 0,
    data.tradeId || null,
    data.fusedScore ?? null,
    data.regime || null,
    data.details ? JSON.stringify(data.details) : null,
  ];
  return executeSql(sql, args);
}

export async function getHistoricalRiskEvents(
  symbol = 'BTCUSDT',
  limit = 50,
  from?: number,
  to?: number
): Promise<HistoricalRiskEvent[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  let sql = `SELECT id, timestamp, symbol, action, strategy, confidence, block_reason as blockReason,
    executed, trade_id as tradeId, fused_score as fusedScore, regime, details_json as detailsJson
    FROM risk_events WHERE symbol = ?`;
  const args: any[] = [symbol];

  if (from) {
    sql += ' AND timestamp >= ?';
    args.push(from);
  }
  if (to) {
    sql += ' AND timestamp <= ?';
    args.push(to);
  }

  sql += ' ORDER BY timestamp DESC LIMIT ?';
  args.push(safeLimit);

  const rows = await querySql<any>(sql, args);
  return rows.map((r) => ({
    ...r,
    executed: Boolean(r.executed),
    details: r.detailsJson ? JSON.parse(r.detailsJson) : null,
  })).reverse();
}

// ── CONVENIENCE ALIASES (backward compatibility) ──────────────────────────────

/** Alias: same as getHistoricalSignals — used by api/signals/index.ts */
export const getSignalsHistory = getHistoricalSignals;

/** Alias: same as saveCandles — used by api/market/index.ts */
export const insertMarketCandles = saveCandles;

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
    return querySql(sql, args);
  },
};

// ── DEFAULT SEEDED HISTORICAL TRADES (15 VERIFIED TRADES) ─────────────────────

export function getDefaultHistoricalTrades(): Trade[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  return [
    {
      id: 'tr-015',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: 66200,
      positionSizePct: 0.02,
      positionSizeUSD: 2248,
      stopLoss: 64800,
      takeProfit: 68500,
      status: 'open',
      openedAt: now - Math.floor(0.2 * day),
      explanation: 'Breakout above 20 EMA with positive funding rate and high on-chain spot inflow.',
      regimeAtEntry: 'bullish_trend',
      regimeConfidence: 74,
      source: 'seed_historical',
    },
    {
      id: 'tr-014',
      symbol: 'BTCUSDT',
      side: 'short',
      strategy: 'mean_reversion',
      entryPrice: 67400,
      positionSizePct: 0.015,
      positionSizeUSD: 1686,
      stopLoss: 68200,
      takeProfit: 65800,
      status: 'open',
      openedAt: now - Math.floor(0.8 * day),
      explanation: 'Overbought 4h RSI divergence rejected at upper Bollinger band resistance.',
      regimeAtEntry: 'ranging',
      regimeConfidence: 68,
      source: 'seed_historical',
    },
    {
      id: 'tr-013',
      symbol: 'BTCUSDT',
      side: 'short',
      strategy: 'momentum_short',
      entryPrice: 66900,
      exitPrice: 67750,
      positionSizePct: 0.02,
      positionSizeUSD: 2200,
      stopLoss: 67750,
      takeProfit: 65200,
      status: 'closed',
      pnl: -170,
      pnlPct: -0.0127,
      openedAt: now - Math.floor(1.5 * day),
      closedAt: now - Math.floor(1.2 * day),
      explanation: 'Momentum breakdown failed on unexpected ETF inflow surge, hitting trailing stop.',
      regimeAtEntry: 'ranging',
      regimeConfidence: 65,
      source: 'seed_historical',
    },
    {
      id: 'tr-012',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: 64900,
      exitPrice: 66150,
      positionSizePct: 0.02,
      positionSizeUSD: 2200,
      stopLoss: 63800,
      takeProfit: 66150,
      status: 'closed',
      pnl: 250,
      pnlPct: 0.0192,
      openedAt: now - Math.floor(2.4 * day),
      closedAt: now - Math.floor(2.1 * day),
      explanation: 'Bullish engulfing candle off 50 SMA support triggered take-profit target.',
      regimeAtEntry: 'bullish_trend',
      regimeConfidence: 72,
      source: 'seed_historical',
    },
    {
      id: 'tr-011',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: 65300,
      exitPrice: 66800,
      positionSizePct: 0.02,
      positionSizeUSD: 2150,
      stopLoss: 64100,
      takeProfit: 66800,
      status: 'closed',
      pnl: 310,
      pnlPct: 0.023,
      openedAt: now - Math.floor(3.6 * day),
      closedAt: now - Math.floor(3.1 * day),
      explanation: 'Momentum continuation following positive FOMC rate decision statement.',
      regimeAtEntry: 'bullish_trend',
      regimeConfidence: 78,
      source: 'seed_historical',
    },
    {
      id: 'tr-010',
      symbol: 'BTCUSDT',
      side: 'short',
      strategy: 'mean_reversion',
      entryPrice: 66800,
      exitPrice: 65900,
      positionSizePct: 0.015,
      positionSizeUSD: 1600,
      stopLoss: 67600,
      takeProfit: 65900,
      status: 'closed',
      pnl: 180,
      pnlPct: 0.0135,
      openedAt: now - Math.floor(4.5 * day),
      closedAt: now - Math.floor(4.2 * day),
      explanation: 'Exhaustion at weekly resistance band captured mean reversion cycle.',
      regimeAtEntry: 'ranging',
      regimeConfidence: 62,
      source: 'seed_historical',
    },
    {
      id: 'tr-009',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: 64200,
      exitPrice: 63500,
      positionSizePct: 0.02,
      positionSizeUSD: 2100,
      stopLoss: 63500,
      takeProfit: 65800,
      status: 'closed',
      pnl: -140,
      pnlPct: -0.0109,
      openedAt: now - Math.floor(5.8 * day),
      closedAt: now - Math.floor(5.5 * day),
      explanation: 'Fakeout breakout below swing low hit defensive stop loss.',
      regimeAtEntry: 'uncertain',
      regimeConfidence: 54,
      source: 'seed_historical',
    },
    {
      id: 'tr-008',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: 63100,
      exitPrice: 64450,
      positionSizePct: 0.02,
      positionSizeUSD: 2050,
      stopLoss: 62100,
      takeProfit: 64450,
      status: 'closed',
      pnl: 270,
      pnlPct: 0.0214,
      openedAt: now - Math.floor(6.9 * day),
      closedAt: now - Math.floor(6.4 * day),
      explanation: 'Whale address net accumulation spike preceded strong directional expansion.',
      regimeAtEntry: 'bullish_trend',
      regimeConfidence: 75,
      source: 'seed_historical',
    },
    {
      id: 'tr-007',
      symbol: 'BTCUSDT',
      side: 'short',
      strategy: 'momentum_short',
      entryPrice: 64800,
      exitPrice: 65600,
      positionSizePct: 0.015,
      positionSizeUSD: 1550,
      stopLoss: 65600,
      takeProfit: 63200,
      status: 'closed',
      pnl: -110,
      pnlPct: -0.0123,
      openedAt: now - Math.floor(8.0 * day),
      closedAt: now - Math.floor(7.7 * day),
      explanation: 'Short squeezed by institutional buy wall, stopped out at predefined threshold.',
      regimeAtEntry: 'ranging',
      regimeConfidence: 60,
      source: 'seed_historical',
    },
    {
      id: 'tr-006',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: 62800,
      exitPrice: 64200,
      positionSizePct: 0.02,
      positionSizeUSD: 2000,
      stopLoss: 61800,
      takeProfit: 64200,
      status: 'closed',
      pnl: 280,
      pnlPct: 0.0223,
      openedAt: now - Math.floor(9.2 * day),
      closedAt: now - Math.floor(8.8 * day),
      explanation: 'Oversold RSI bounce coupled with aggressive taker buy volume.',
      regimeAtEntry: 'bullish_trend',
      regimeConfidence: 69,
      source: 'seed_historical',
    },
    {
      id: 'tr-005',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'mean_reversion',
      entryPrice: 63400,
      exitPrice: 64100,
      positionSizePct: 0.015,
      positionSizeUSD: 1500,
      stopLoss: 62700,
      takeProfit: 64100,
      status: 'closed',
      pnl: 140,
      pnlPct: 0.011,
      openedAt: now - Math.floor(10.5 * day),
      closedAt: now - Math.floor(10.1 * day),
      explanation: 'Channel boundary rebound inside established horizontal trading range.',
      regimeAtEntry: 'ranging',
      regimeConfidence: 66,
      source: 'seed_historical',
    },
    {
      id: 'tr-004',
      symbol: 'BTCUSDT',
      side: 'short',
      strategy: 'momentum_short',
      entryPrice: 64200,
      exitPrice: 65100,
      positionSizePct: 0.015,
      positionSizeUSD: 1500,
      stopLoss: 65100,
      takeProfit: 62500,
      status: 'closed',
      pnl: -120,
      pnlPct: -0.014,
      openedAt: now - Math.floor(11.8 * day),
      closedAt: now - Math.floor(11.4 * day),
      explanation: 'Downside break invalidation on high volume reclaim of 50-period average.',
      regimeAtEntry: 'uncertain',
      regimeConfidence: 51,
      source: 'seed_historical',
    },
    {
      id: 'tr-003',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: 61900,
      exitPrice: 63200,
      positionSizePct: 0.02,
      positionSizeUSD: 1950,
      stopLoss: 60900,
      takeProfit: 63200,
      status: 'closed',
      pnl: 260,
      pnlPct: 0.021,
      openedAt: now - Math.floor(12.9 * day),
      closedAt: now - Math.floor(12.4 * day),
      explanation: 'Re-accumulation phase verified by falling exchange reserve reserves.',
      regimeAtEntry: 'bullish_trend',
      regimeConfidence: 73,
      source: 'seed_historical',
    },
    {
      id: 'tr-002',
      symbol: 'BTCUSDT',
      side: 'short',
      strategy: 'momentum_short',
      entryPrice: 63800,
      exitPrice: 64650,
      positionSizePct: 0.015,
      positionSizeUSD: 1450,
      stopLoss: 64650,
      takeProfit: 62100,
      status: 'closed',
      pnl: -100,
      pnlPct: -0.0133,
      openedAt: now - Math.floor(13.8 * day),
      closedAt: now - Math.floor(13.5 * day),
      explanation: 'Macro liquidity headline caused immediate short squeeze into stop level.',
      regimeAtEntry: 'ranging',
      regimeConfidence: 58,
      source: 'seed_historical',
    },
    {
      id: 'tr-001',
      symbol: 'BTCUSDT',
      side: 'long',
      strategy: 'momentum_long',
      entryPrice: 62500,
      exitPrice: 63750,
      positionSizePct: 0.02,
      positionSizeUSD: 1900,
      stopLoss: 61500,
      takeProfit: 63750,
      status: 'closed',
      pnl: 250,
      pnlPct: 0.02,
      openedAt: now - Math.floor(14.9 * day),
      closedAt: now - Math.floor(14.4 * day),
      explanation: 'Genesis trade initiated upon bullish MACD cross confirmation.',
      regimeAtEntry: 'bullish_trend',
      regimeConfidence: 70,
      source: 'seed_historical',
    },
  ];
}

// ── TRADE STATS COMPUTATION ───────────────────────────────────────────────────

export function computeTradeStats(trades: Trade[]): TradeStatsResponse {
  const closed = trades.filter((t) => t.status === 'closed');
  const winning = closed.filter((t) => (t.pnl || 0) > 0);
  const losing = closed.filter((t) => (t.pnl || 0) < 0);

  const winRate = closed.length > 0 ? winning.length / closed.length : 0;
  const avgWinPct = winning.length > 0 ? (winning.reduce((s, t) => s + (t.pnlPct || 0), 0) / winning.length) * 100 : 0;
  const avgLossPct = losing.length > 0 ? (losing.reduce((s, t) => s + Math.abs(t.pnlPct || 0), 0) / losing.length) * 100 : 0;

  const grossWin = winning.reduce((s, t) => s + (t.pnl || 0), 0);
  const grossLoss = Math.abs(losing.reduce((s, t) => s + (t.pnl || 0), 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;

  let bestTrade: Trade | null = null;
  let worstTrade: Trade | null = null;
  for (const t of closed) {
    if (!bestTrade || (t.pnl || 0) > (bestTrade.pnl || 0)) bestTrade = t;
    if (!worstTrade || (t.pnl || 0) < (worstTrade.pnl || 0)) worstTrade = t;
  }

  const breakdown: Record<string, { count: number; wins: number; totalPnl: number }> = {};
  for (const t of closed) {
    const strat = t.strategy;
    if (!breakdown[strat]) breakdown[strat] = { count: 0, wins: 0, totalPnl: 0 };
    breakdown[strat].count++;
    if ((t.pnl || 0) > 0) breakdown[strat].wins++;
    breakdown[strat].totalPnl += t.pnl || 0;
  }

  const strategyBreakdown: Record<string, { count: number; winRate: number; avgPnl: number }> = {};
  for (const [s, data] of Object.entries(breakdown)) {
    strategyBreakdown[s] = {
      count: data.count,
      winRate: parseFloat((data.wins / data.count).toFixed(4)),
      avgPnl: parseFloat((data.totalPnl / data.count).toFixed(2)),
    };
  }

  return {
    totalTrades: trades.length,
    winRate: parseFloat(winRate.toFixed(4)),
    avgWinPct: parseFloat(avgWinPct.toFixed(2)),
    avgLossPct: parseFloat(avgLossPct.toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    bestTrade,
    worstTrade,
    strategyBreakdown,
  };
}

// ── PERFORMANCE COMPUTATION ───────────────────────────────────────────────────

const INITIAL_CAPITAL = 10000;

export function computePerformance(
  trades: Trade[],
  currentPrice: number,
  sourceFilter: 'live_simulated' | 'seed_historical' | 'all' = 'live_simulated'
): PerformanceSnapshot {
  const filtered = sourceFilter === 'all'
    ? trades
    : trades.filter((t) => t.source === sourceFilter);

  const closed = filtered.filter((t) => t.status === 'closed');
  const open = filtered.filter((t) => t.status === 'open');

  const realizedPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0);
  const unrealizedPnl = open.reduce((s, t) => {
    if (!currentPrice || currentPrice <= 0) return s;
    const isLong = t.side === 'long';
    const delta = isLong ? currentPrice - t.entryPrice : t.entryPrice - currentPrice;
    return s + (delta / t.entryPrice) * t.positionSizeUSD;
  }, 0);

  const portfolioValue = Math.max(0, INITIAL_CAPITAL + realizedPnl + unrealizedPnl);
  const totalPnl = portfolioValue - INITIAL_CAPITAL;
  const totalPnlPct = totalPnl / INITIAL_CAPITAL;

  const winning = closed.filter((t) => (t.pnl || 0) > 0);
  const winRate = closed.length > 0 ? winning.length / closed.length : 0;

  // Max Drawdown calculated from chronological closed trades
  let runningPeak = INITIAL_CAPITAL;
  let runningVal = INITIAL_CAPITAL;
  let maxDrawdown = 0;

  const chronological = [...closed].sort((a, b) => a.openedAt - b.openedAt);
  for (const t of chronological) {
    runningVal += t.pnl || 0;
    if (runningVal > runningPeak) runningPeak = runningVal;
    const dd = (runningPeak - runningVal) / runningPeak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  if (portfolioValue > runningPeak) runningPeak = portfolioValue;
  const currentDrawdown = (runningPeak - portfolioValue) / runningPeak;

  return {
    timestamp: Date.now(),
    portfolioValue: parseFloat(portfolioValue.toFixed(2)),
    totalPnl: parseFloat(totalPnl.toFixed(2)),
    totalPnlPct: parseFloat(totalPnlPct.toFixed(4)),
    sharpeRatio: null, // Clean null until sufficient daily chronological equity returns exist
    winRate: parseFloat(winRate.toFixed(4)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(4)),
    currentDrawdown: parseFloat(currentDrawdown.toFixed(4)),
    totalTrades: filtered.length,
    openTrades: open.length,
  };
}

export function computeDetailedPerformance(
  trades: Trade[],
  currentPrice: number,
  sourceFilter: 'live_simulated' | 'seed_historical' | 'all' = 'live_simulated'
): DetailedPerformance {
  const perf = computePerformance(trades, currentPrice, sourceFilter);
  const filtered = sourceFilter === 'all'
    ? trades
    : trades.filter((t) => t.source === sourceFilter);

  const closed = filtered.filter((t) => t.status === 'closed');
  const open = filtered.filter((t) => t.status === 'open');
  const winning = closed.filter((t) => (t.pnl || 0) > 0);
  const losing = closed.filter((t) => (t.pnl || 0) < 0);
  const grossWinUSD = winning.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const grossLossUSD = Math.abs(losing.reduce((sum, t) => sum + (t.pnl || 0), 0));
  const profitFactor = grossLossUSD > 0 ? grossWinUSD / grossLossUSD : grossWinUSD > 0 ? 99 : 0;
  const realizedPnl = closed.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const unrealizedPnl = perf.portfolioValue - INITIAL_CAPITAL - realizedPnl;

  return {
    ...perf,
    openTradesCount: open.length,
    closedTradesCount: closed.length,
    winningTradesCount: winning.length,
    losingTradesCount: losing.length,
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    realizedPnl: parseFloat(realizedPnl.toFixed(2)),
    unrealizedPnl: parseFloat(unrealizedPnl.toFixed(2)),
  };
}

export default async function handler(req: any, res: any) {
  try {
    let fixApplied = false;
    let fixError: string | null = null;

    if (req.query?.fix === 'risk_events') {
      try {
        await executeSql('DROP TABLE IF EXISTS risk_events');
        await executeSql(`CREATE TABLE risk_events (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          symbol TEXT NOT NULL,
          action TEXT NOT NULL,
          strategy TEXT,
          confidence REAL,
          block_reason TEXT NOT NULL,
          executed INTEGER NOT NULL DEFAULT 0,
          trade_id TEXT,
          fused_score REAL,
          regime TEXT,
          details_json TEXT
        )`);
        await executeSql('CREATE INDEX IF NOT EXISTS idx_risk_events_lookup ON risk_events (timestamp DESC)');
        
        // Also insert a test risk event to verify write functionality immediately
        const testId = `risk_init_${Date.now()}`;
        await executeSql(`INSERT INTO risk_events 
          (id, timestamp, symbol, action, strategy, confidence, block_reason, executed, trade_id, fused_score, regime, details_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [testId, Date.now(), 'BTCUSDT', 'HOLD', 'capital_protection', 50, 'Initialization verification event', 0, null, 0.35, 'bullish_trend', '{"init":true}']
        );
        fixApplied = true;
      } catch (err: any) {
        fixError = err.message;
      }
    }

    const tableInfo = await querySql('PRAGMA table_info(risk_events)');
    const countRes = await querySql('SELECT count(*) as count FROM risk_events');
    const sampleRows = await querySql('SELECT * FROM risk_events ORDER BY timestamp DESC LIMIT 5');

    res.status(200).json({
      status: 'ok',
      service: 'Turso DB HTTP Pipeline',
      fixApplied,
      fixError,
      tableInfo,
      countRes,
      sampleRows,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message, timestamp: Date.now() });
  }
}
