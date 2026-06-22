import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { buildAuthHeaders } from './auth';
import type { PriceTicker, Candle } from '../types';

interface BitgetResponse<T> {
  code: string;
  msg: string;
  data: T;
}

interface BitgetRESTConfig {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  baseUrl: string;
}

export class BitgetRESTClient {
  private apiKey: string;
  private secretKey: string;
  private passphrase: string;
  private client: AxiosInstance;

  constructor(config: BitgetRESTConfig) {
    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
    this.passphrase = config.passphrase;
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: 8000,
    });
  }

  private authHeaders(method: string, requestPath: string, body = ''): Record<string, string> {
    return buildAuthHeaders(method, requestPath, body, this.apiKey, this.secretKey, this.passphrase);
  }

  private buildQueryString(params: Record<string, string>): string {
    const qs = new URLSearchParams(params).toString();
    return qs ? `?${qs}` : '';
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const qs = params ? this.buildQueryString(params) : '';
    const requestPath = path + qs;
    const headers = this.authHeaders('GET', requestPath, '');

    try {
      const response = await this.client.get<BitgetResponse<T>>(requestPath, { headers });
      const { code, msg, data } = response.data;
      if (code !== '00000') {
        throw new Error(`Bitget API error [${code}]: ${msg}`);
      }
      return data;
    } catch (err: any) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        throw new Error(`Bitget auth failed [${err.response.status}]: Check API key/passphrase — ${err.message}`);
      }
      if (err.code === 'ECONNABORTED') {
        throw new Error(`Bitget API timeout — using fallback`);
      }
      throw new Error(`Bitget GET ${path} failed: ${err.message}`);
    }
  }

  private async post<T>(path: string, payload: object): Promise<T> {
    const body = JSON.stringify(payload);
    const headers = this.authHeaders('POST', path, body);

    try {
      const response = await this.client.post<BitgetResponse<T>>(path, payload, { headers });
      const { code, msg, data } = response.data;
      if (code !== '00000') {
        throw new Error(`Bitget API error [${code}]: ${msg}`);
      }
      return data;
    } catch (err: any) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        throw new Error(`Bitget auth failed [${err.response.status}]: Check API key/passphrase — ${err.message}`);
      }
      if (err.code === 'ECONNABORTED') {
        throw new Error(`Bitget API timeout — using fallback`);
      }
      throw new Error(`Bitget POST ${path} failed: ${err.message}`);
    }
  }

  async getTicker(symbol: string): Promise<PriceTicker> {
    type RawTicker = {
      symbol: string; lastPr: string; change24h: string; changeUtc24h: string;
      high24h: string; low24h: string; baseVolume: string; ts: string;
    }[];

    const data = await this.get<RawTicker>('/api/v2/spot/market/tickers', { symbol });
    const raw = Array.isArray(data) ? data[0] : (data as any);
    if (!raw) throw new Error(`No ticker data returned for ${symbol}`);

    const price = parseFloat(raw.lastPr);
    const changePct24h = parseFloat(raw.changeUtc24h);

    return {
      symbol: raw.symbol ?? symbol,
      price,
      change24h: parseFloat(raw.change24h),
      changePct24h,
      high24h: parseFloat(raw.high24h),
      low24h: parseFloat(raw.low24h),
      volume24h: parseFloat(raw.baseVolume),
      timestamp: parseInt(raw.ts, 10),
    };
  }

  async getCandles(symbol: string, granularity: string, limit = 200): Promise<Candle[]> {
    // Bitget returns: [ts, open, high, low, close, baseVol, quoteVol]
    const data = await this.get<string[][]>('/api/v2/spot/market/history-candles', {
      symbol, granularity, limit: String(limit),
    });

    const candles: Candle[] = (data ?? []).map((row) => ({
      timestamp: parseInt(row[0], 10),
      open: parseFloat(row[1]),
      high: parseFloat(row[2]),
      low: parseFloat(row[3]),
      close: parseFloat(row[4]),
      volume: parseFloat(row[5]),
    }));

    return candles.sort((a, b) => a.timestamp - b.timestamp);
  }

  async getHistoricalCandles(
    symbol: string,
    granularity: string,
    startTime: number,
    endTime: number
  ): Promise<Candle[]> {
    const allCandles: Candle[] = [];
    let currentEnd = endTime;
    const MAX_PAGES = 5;

    for (let page = 0; page < MAX_PAGES; page++) {
      try {
        const data = await this.get<string[][]>('/api/v2/spot/market/history-candles', {
          symbol, granularity,
          endTime: String(currentEnd),
          limit: '200',
        });

        if (!data || data.length === 0) break;

        const batch: Candle[] = data.map((row) => ({
          timestamp: parseInt(row[0], 10),
          open: parseFloat(row[1]),
          high: parseFloat(row[2]),
          low: parseFloat(row[3]),
          close: parseFloat(row[4]),
          volume: parseFloat(row[5]),
        }));

        allCandles.push(...batch);

        // Move cursor backwards
        const oldest = Math.min(...batch.map((c) => c.timestamp));
        if (oldest <= startTime) break;
        currentEnd = oldest - 1;
      } catch (err: any) {
        console.warn(`[BACKTEST] History-candles page ${page} failed: ${err.message}`);
        break;
      }
    }

    // Deduplicate by timestamp
    const seen = new Set<number>();
    const unique = allCandles.filter((c) => {
      if (seen.has(c.timestamp)) return false;
      seen.add(c.timestamp);
      return true;
    });

    return unique.sort((a, b) => a.timestamp - b.timestamp);
  }

  async placeSimOrder(params: {
    symbol: string;
    side: string;
    size: number;
    price?: number;
  }): Promise<{ orderId: string; status: string }> {
    // SIMULATION MODE ONLY — no real order placed
    const orderId = uuidv4();
    console.log(
      `[SIM ORDER] ${params.side.toUpperCase()} ${params.size} ${params.symbol} @ ${params.price ?? 'MARKET'}`
    );
    return { orderId, status: 'simulated' };
  }

  static create(): BitgetRESTClient {
    const apiKey = process.env.BITGET_API_KEY ?? '';
    const secretKey = process.env.BITGET_SECRET_KEY ?? '';
    const passphrase = process.env.BITGET_PASSPHRASE ?? '';
    const baseUrl = process.env.BITGET_BASE_URL ?? 'https://api.bitget.com';

    if (!apiKey || !secretKey || !passphrase) {
      console.warn('[BitgetREST] ⚠️  API credentials missing — live data unavailable');
    }

    return new BitgetRESTClient({ apiKey, secretKey, passphrase, baseUrl });
  }
}
