import fs from 'fs';
import path from 'path';
import type { Trade, RegimeReading, PerformanceSnapshot, BacktestResult } from '../types';

type StoreKey = 'trades' | 'regimeHistory' | 'perfHistory' | 'equityCurve' | 'backtestResults';

export class NexusDB {
  private db: any = null;
  private initialized = false;
  private usingSqlite = false;
  private dbPath = path.join(process.cwd(), 'nexus.db');

  // In-memory store — this is always the live working data for the running
  // process. SQLite (via sql.js) is used purely as a persistence layer that
  // hydrates these arrays on startup and is written to after every mutation.
  private trades: Trade[] = [];
  private regimeHistory: RegimeReading[] = [];
  private perfHistory: PerformanceSnapshot[] = [];
  private equityCurve: Array<{ timestamp: number; value: number }> = [];
  private backtestResults: BacktestResult[] = [];

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    try {
      const initSqlJs = require('sql.js');
      const SQL = await initSqlJs();

      const existing = fs.existsSync(this.dbPath) ? fs.readFileSync(this.dbPath) : undefined;
      this.db = existing ? new SQL.Database(existing) : new SQL.Database();
      this.db.run('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT)');

      this.hydrate();
      this.usingSqlite = true;
      this.initialized = true;
      console.log(`✅ Database: SQLite (sql.js${existing ? ', loaded existing nexus.db' : ', new nexus.db'})`);
    } catch (err) {
      this.usingSqlite = false;
      this.initialized = true;
      console.warn('⚠️  No SQLite available — using in-memory store (data will not persist across restarts)');
    }
  }

  private hydrate(): void {
    if (!this.db) return;
    const keys: StoreKey[] = ['trades', 'regimeHistory', 'perfHistory', 'equityCurve', 'backtestResults'];
    for (const key of keys) {
      try {
        const stmt = this.db.prepare('SELECT value FROM kv_store WHERE key = ?');
        stmt.bind([key]);
        if (stmt.step()) {
          const row = stmt.getAsObject();
          const parsed = JSON.parse(row.value as string);
          (this as any)[key] = parsed;
        }
        stmt.free();
      } catch {
        // Corrupt or missing row — keep the empty default for this key
      }
    }
  }

  private persist(key: StoreKey, value: unknown): void {
    if (!this.db || !this.usingSqlite) return;
    try {
      this.db.run('DELETE FROM kv_store WHERE key = ?', [key]);
      this.db.run('INSERT INTO kv_store (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
      const data = this.db.export();
      fs.writeFileSync(this.dbPath, Buffer.from(data));
    } catch (err) {
      console.warn(`[DB] Failed to persist "${key}":`, (err as Error).message);
    }
  }

  // ── Trades ─────────────────────────────────────────────────────────────
  saveTrade(trade: Trade): void {
    this.trades.unshift(trade);
    this.persist('trades', this.trades);
  }

  updateTrade(id: string, updates: Partial<Trade>): void {
    const idx = this.trades.findIndex((t) => t.id === id);
    if (idx !== -1) {
      this.trades[idx] = { ...this.trades[idx], ...updates };
      this.persist('trades', this.trades);
    }
  }

  getTrades(limit?: number): Trade[] {
    return limit ? this.trades.slice(0, limit) : this.trades;
  }

  getOpenTrades(): Trade[] {
    return this.trades.filter((t) => t.status === 'open');
  }

  getTradeById(id: string): Trade | null {
    return this.trades.find((t) => t.id === id) ?? null;
  }

  // ── Regime history ────────────────────────────────────────────────────
  saveRegime(regime: RegimeReading): void {
    this.regimeHistory.unshift(regime);
    if (this.regimeHistory.length > 500) this.regimeHistory.length = 500;
    this.persist('regimeHistory', this.regimeHistory);
  }

  getRegimeHistory(limit?: number): RegimeReading[] {
    return limit ? this.regimeHistory.slice(0, limit) : this.regimeHistory;
  }

  // ── Performance snapshots ────────────────────────────────────────────
  savePerformanceSnapshot(snap: PerformanceSnapshot): void {
    this.perfHistory.unshift(snap);
    if (this.perfHistory.length > 1000) this.perfHistory.length = 1000;
    this.persist('perfHistory', this.perfHistory);
  }

  getPerformanceHistory(limit?: number): PerformanceSnapshot[] {
    return limit ? this.perfHistory.slice(0, limit) : this.perfHistory;
  }

  getLatestPerformance(): PerformanceSnapshot | null {
    return this.perfHistory[0] ?? null;
  }

  // ── Equity curve ──────────────────────────────────────────────────────
  saveEquityPoint(timestamp: number, value: number): void {
    this.equityCurve.push({ timestamp, value });
    if (this.equityCurve.length > 5000) this.equityCurve.shift();
    this.persist('equityCurve', this.equityCurve);
  }

  getEquityCurve(limit?: number): Array<{ timestamp: number; value: number }> {
    return limit ? this.equityCurve.slice(-limit) : this.equityCurve;
  }

  // ── Backtest results ──────────────────────────────────────────────────
  saveBacktestResult(result: BacktestResult): void {
    this.backtestResults.unshift(result);
    if (this.backtestResults.length > 50) this.backtestResults.length = 50;
    this.persist('backtestResults', this.backtestResults);
  }

  getBacktestResults(limit?: number): BacktestResult[] {
    return limit ? this.backtestResults.slice(0, limit) : this.backtestResults;
  }

  getBacktestById(id: string): BacktestResult | null {
    return this.backtestResults.find((r) => r.id === id) ?? null;
  }
}

export const db = new NexusDB();
