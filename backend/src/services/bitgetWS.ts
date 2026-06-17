import type { PriceTicker } from '../types';

const WS_URL = 'wss://ws.bitget.com/v2/ws/public';
const PING_INTERVAL_MS = 20000;
const MAX_RECONNECT_DELAY_MS = 30000;

export class BitgetWebSocket {
  private ws: any = null;
  private symbol: string;
  private reconnectAttempts = 0;
  private maxReconnects = 10;
  private reconnectDelay = 2000;
  private pingTimer: NodeJS.Timeout | null = null;
  private listeners = new Set<(t: PriceTicker) => void>();
  private lastTicker: PriceTicker | null = null;
  private _isConnecting = false;

  constructor(symbol = 'BTCUSDT') {
    this.symbol = symbol;
  }

  connect(): void {
    // Guard against duplicate connections
    if (this._isConnecting) return;
    if (this.ws && this.ws.readyState === 1 /* OPEN */) return;

    this._isConnecting = true;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WS = require('ws');
    this.ws = new WS(WS_URL);

    this.ws.on('open', () => {
      this.reconnectAttempts = 0;
      this.reconnectDelay = 2000;
      this._isConnecting = false;

      // Subscribe to ticker channel
      this.ws.send(JSON.stringify({
        op: 'subscribe',
        args: [{ instType: 'SPOT', channel: 'ticker', instId: this.symbol }],
      }));

      // Start heartbeat ping
      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === 1) {
          this.ws.send(JSON.stringify({ op: 'ping' }));
        }
      }, PING_INTERVAL_MS);

      console.log(`✅ Bitget WS connected — ${this.symbol}`);
    });

    this.ws.on('message', (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString());

        // Respond to server pings
        if (msg.op === 'ping') {
          this.ws.send(JSON.stringify({ op: 'pong' }));
          return;
        }

        // Process ticker data
        if (msg.action && msg.data && Array.isArray(msg.data) && msg.data.length > 0) {
          const raw = msg.data[0];
          const ticker = this.mapToTicker(raw);
          this.lastTicker = ticker;
          this.listeners.forEach((cb) => cb(ticker));
        }
      } catch {
        // Silently ignore malformed messages
      }
    });

    this.ws.on('error', (err: Error) => {
      console.error(`[BitgetWS] Error: ${err.message}`);
    });

    this.ws.on('close', () => {
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      this._isConnecting = false;

      console.warn(
        `⚠️  Bitget WS closed (attempt ${this.reconnectAttempts}/${this.maxReconnects})`
      );

      if (this.reconnectAttempts < this.maxReconnects) {
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
        this.reconnectAttempts++;
      } else {
        console.error('[BitgetWS] Max reconnect attempts reached — giving up');
      }
    });
  }

  private mapToTicker(data: Record<string, string>): PriceTicker {
    const price = parseFloat(data.lastPr);
    const changePct24h = parseFloat(data.chgUtc24h);
    return {
      symbol: data.instId ?? this.symbol,
      price,
      changePct24h,
      change24h: price * changePct24h / 100,
      high24h: parseFloat(data.high24h),
      low24h: parseFloat(data.low24h),
      volume24h: parseFloat(data.baseVolume),
      timestamp: parseInt(data.ts, 10),
    };
  }

  /** Subscribe to ticker updates. Returns an unsubscribe function. */
  subscribe(cb: (t: PriceTicker) => void): () => void {
    this.listeners.add(cb);
    // Immediately emit last known ticker if available
    if (this.lastTicker) cb(this.lastTicker);
    return () => this.listeners.delete(cb);
  }

  getLastTicker(): PriceTicker | null {
    return this.lastTicker;
  }

  isConnected(): boolean {
    return this.ws?.readyState === 1;
  }

  disconnect(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
