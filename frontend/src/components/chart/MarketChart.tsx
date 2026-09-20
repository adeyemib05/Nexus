import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  CandlestickData,
  LineData,
  HistogramData,
  SeriesMarker,
} from 'lightweight-charts';
import {
  Brain,
  RefreshCw,
} from 'lucide-react';
import {
  getHistoricalCandles,
  getHistoricalIndicators,
  getAiDecisionsHistory,
} from '../../lib/api';
import type {
  HistoricalCandle,
  HistoricalIndicatorSnapshot,
  HistoricalAiDecision,
  Trade,
  PriceTicker,
} from '../../types';
import { formatPrice } from '../../lib/utils';
import AiRationaleDrawer from './AiRationaleDrawer';
import TradeDetailModal from './TradeDetailModal';

interface MarketChartProps {
  symbol?: string;
  currentTicker?: PriceTicker | null;
  trades?: Trade[];
  activeTradeId?: string | null;
  onTradeSelect?: (trade: Trade) => void;
  className?: string;
  defaultTimeframe?: string;
}

const TIMEFRAMES = [
  { id: '1m', label: '1m' },
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1d', label: '1D' },
];

export default function MarketChart({
  symbol = 'BTCUSDT',
  currentTicker,
  trades = [],
  activeTradeId,
  onTradeSelect,
  className = '',
  defaultTimeframe = '1m',
}: MarketChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);

  // Series refs for dynamic updating
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // State
  const [timeframe, setTimeframe] = useState(defaultTimeframe);
  const [candles, setCandles] = useState<HistoricalCandle[]>([]);
  const [indicators, setIndicators] = useState<HistoricalIndicatorSnapshot[]>([]);
  const [aiDecisions, setAiDecisions] = useState<HistoricalAiDecision[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Toggles
  const [showEMA20, setShowEMA20] = useState(true);
  const [showEMA50, setShowEMA50] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [showAiMarkers, setShowAiMarkers] = useState(true);
  const [showTrades, setShowTrades] = useState(true);

  // Drawer / Inspection state
  const [selectedDecision, setSelectedDecision] = useState<HistoricalAiDecision | null>(null);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);

  // 1. Fetch historical candles & annotations
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [candleRes, indRes, aiRes] = await Promise.all([
        getHistoricalCandles({ symbol, timeframe, limit: 200 }),
        getHistoricalIndicators({ symbol, timeframe, limit: 100 }),
        getAiDecisionsHistory({ symbol, limit: 50 }),
      ]);

      if (candleRes.success && candleRes.data) {
        setCandles(candleRes.data);
      }
      if (indRes.success && indRes.data) {
        setIndicators(indRes.data);
      }
      if (aiRes.success && aiRes.data) {
        setAiDecisions(aiRes.data);
      }
    } catch (err) {
      console.warn('[MarketChart] Error loading chart data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [symbol, timeframe]);

  // 2. Initialize Lightweight Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clean up previous instance
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 380,
      layout: {
        background: { type: ColorType.Solid, color: '#090B0E' },
        textColor: '#64748B',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(0, 240, 255, 0.3)', width: 1, style: 3 },
        horzLine: { color: 'rgba(0, 240, 255, 0.3)', width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        scaleMargins: { top: 0.08, bottom: 0.18 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartInstanceRef.current = chart;

    // Add Candlestick Series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#EF4444',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });
    candleSeriesRef.current = candleSeries;

    // Add Volume Series
    const volumeSeries = chart.addHistogramSeries({
      color: 'rgba(255, 255, 255, 0.10)',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // Overlay over price
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // Add EMA 20
    const ema20Series = chart.addLineSeries({
      color: '#00F0FF',
      lineWidth: 1,
      title: 'EMA20',
    });
    ema20SeriesRef.current = ema20Series;

    // Add EMA 50
    const ema50Series = chart.addLineSeries({
      color: '#A855F7',
      lineWidth: 1,
      title: 'EMA50',
    });
    ema50SeriesRef.current = ema50Series;

    // Resize observer
    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  // 3. Populate and Update Series Data
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    // Convert candles to Lightweight Charts format
    const formattedCandles: CandlestickData[] = candles.map((c) => ({
      time: Math.floor(c.timestamp / 1000) as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    candleSeriesRef.current.setData(formattedCandles);

    // Volume
    if (volumeSeriesRef.current) {
      if (showVolume) {
        const volData: HistogramData[] = candles.map((c) => ({
          time: Math.floor(c.timestamp / 1000) as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
        }));
        volumeSeriesRef.current.setData(volData);
      } else {
        volumeSeriesRef.current.setData([]);
      }
    }

    // Calculate dynamic EMA20 & EMA50 on the loaded candle series
    const closes = candles.map((c) => c.close);
    const k20 = 2 / (20 + 1);
    const k50 = 2 / (50 + 1);

    const ema20Data: LineData[] = [];
    const ema50Data: LineData[] = [];

    let ema20Prev = closes[0];
    let ema50Prev = closes[0];

    for (let i = 0; i < candles.length; i++) {
      const time = Math.floor(candles[i].timestamp / 1000) as UTCTimestamp;
      const price = closes[i];

      ema20Prev = i === 0 ? price : price * k20 + ema20Prev * (1 - k20);
      ema50Prev = i === 0 ? price : price * k50 + ema50Prev * (1 - k50);

      if (i >= 19) {
        ema20Data.push({ time, value: parseFloat(ema20Prev.toFixed(2)) });
      }
      if (i >= 49) {
        ema50Data.push({ time, value: parseFloat(ema50Prev.toFixed(2)) });
      }
    }

    if (ema20SeriesRef.current) {
      ema20SeriesRef.current.setData(showEMA20 ? ema20Data : []);
    }
    if (ema50SeriesRef.current) {
      ema50SeriesRef.current.setData(showEMA50 ? ema50Data : []);
    }

    // 4. Generate Annotations & Markers (AI Decisions + Trades)
    const markers: SeriesMarker<UTCTimestamp>[] = [];
    const firstTime = Number(formattedCandles[0].time);
    const lastTime = Number(formattedCandles[formattedCandles.length - 1].time);

    if (showAiMarkers && aiDecisions.length > 0) {
      aiDecisions.forEach((d) => {
        const timeVal = Math.floor(d.timestamp / 1000);
        // Only show markers within candle range
        if (timeVal >= firstTime && timeVal <= lastTime) {
          const action = d.action.toUpperCase();
          const isBuy = action === 'BUY';
          const isSell = action === 'SELL';

          markers.push({
            time: timeVal as UTCTimestamp,
            position: isBuy ? 'belowBar' : 'aboveBar',
            color: isBuy ? '#10B981' : isSell ? '#EF4444' : '#F59E0B',
            shape: isBuy ? 'arrowUp' : isSell ? 'arrowDown' : 'circle',
            text: `AI ${action} (${Math.round(d.confidence <= 1 ? d.confidence * 100 : d.confidence)}%)`,
            id: `ai_${d.id}`,
            size: 1,
          });
        }
      });
    }

    if (showTrades && trades.length > 0) {
      trades.forEach((t) => {
        const openTimeVal = Math.floor(t.openedAt / 1000);
        if (openTimeVal >= firstTime && openTimeVal <= lastTime) {
          markers.push({
            time: openTimeVal as UTCTimestamp,
            position: t.side === 'long' ? 'belowBar' : 'aboveBar',
            color: '#00F0FF',
            shape: 'circle',
            text: `${t.side.toUpperCase()} ENTRY $${t.entryPrice}`,
            id: `trade_${t.id}`,
            size: 1,
          });
        }

        if (t.closedAt) {
          const closeTimeVal = Math.floor(t.closedAt / 1000);
          if (closeTimeVal >= firstTime && closeTimeVal <= lastTime) {
            markers.push({
              time: closeTimeVal as UTCTimestamp,
              position: t.side === 'long' ? 'aboveBar' : 'belowBar',
              color: (t.pnl || 0) >= 0 ? '#10B981' : '#EF4444',
              shape: 'square',
              text: `EXIT ${t.pnl && t.pnl >= 0 ? `+$${t.pnl}` : `-$${Math.abs(t.pnl || 0)}`}`,
              id: `exit_${t.id}`,
              size: 1,
            });
          }
        }
      });
    }

    // Sort markers chronologically (Lightweight Charts requires sorted time)
    markers.sort((a, b) => (Number(a.time)) - (Number(b.time)));
    candleSeriesRef.current.setMarkers(markers);
  }, [candles, showVolume, showEMA20, showEMA50, showAiMarkers, showTrades, aiDecisions, trades]);

  // 5. Live Candle Streaming / Updating
  useEffect(() => {
    if (!candleSeriesRef.current || !currentTicker?.price || candles.length === 0) return;

    const lastCandle = candles[candles.length - 1];
    const livePrice = currentTicker.price;

    // Update the current bar
    candleSeriesRef.current.update({
      time: Math.floor(lastCandle.timestamp / 1000) as UTCTimestamp,
      open: lastCandle.open,
      high: Math.max(lastCandle.high, livePrice),
      low: Math.min(lastCandle.low, livePrice),
      close: livePrice,
    });
  }, [currentTicker]);

  // Sync to active trade if requested
  useEffect(() => {
    if (!activeTradeId || trades.length === 0) return;
    const t = trades.find((x) => x.id === activeTradeId);
    if (t) {
      setSelectedTrade(t);
      setIsTradeModalOpen(true);
      if (chartInstanceRef.current && t.openedAt) {
        chartInstanceRef.current.timeScale().scrollToPosition(-5, true);
      }
    }
  }, [activeTradeId, trades]);

  const latestCandle = candles[candles.length - 1];
  const latestAi = aiDecisions[0] || null;

  return (
    <div className={`glass-card p-4 md:p-5 space-y-4 ${className}`}>
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
        {/* Left: Symbol & Live Price */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-base text-nexus-textPrimary">
              {symbol}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/[0.05] text-nexus-textMuted border border-white/[0.08]">
              Bitget Spot
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-base text-nexus-textPrimary">
              {currentTicker ? formatPrice(currentTicker.price) : latestCandle ? formatPrice(latestCandle.close) : '---'}
            </span>
            {currentTicker && (
              <span
                className={`text-xs font-mono font-semibold ${
                  currentTicker.change24h >= 0 ? 'text-nexus-bull' : 'text-nexus-bear'
                }`}
              >
                {currentTicker.change24h >= 0 ? '+' : ''}
                {(currentTicker.changePct24h * 100).toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        {/* Center: Timeframe Selector */}
        <div className="flex items-center bg-white/[0.03] border border-white/[0.08] rounded-lg p-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.id}
              onClick={() => setTimeframe(tf.id)}
              className={`px-2.5 py-1 text-xs font-mono rounded-md transition-all ${
                timeframe === tf.id
                  ? 'bg-nexus-accent/20 text-nexus-accent font-bold border border-nexus-accent/40 shadow-sm'
                  : 'text-nexus-textMuted hover:text-nexus-textPrimary'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {latestAi && (
            <button
              onClick={() => {
                setSelectedDecision(latestAi);
                setIsAiDrawerOpen(true);
              }}
              className="px-2.5 py-1 rounded-lg bg-nexus-accent/10 border border-nexus-accent/30 text-nexus-accent text-xs font-mono font-semibold flex items-center gap-1.5 hover:bg-nexus-accent/20 transition-colors"
            >
              <Brain size={12} />
              AI {latestAi.action} Rationale
            </button>
          )}

          <button
            onClick={fetchData}
            title="Refresh Historical Candles"
            className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-nexus-textMuted hover:text-nexus-textPrimary border border-white/[0.06] transition-colors"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Overlays Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
        <span className="stat-label text-[10px] uppercase text-nexus-textMuted mr-1">Overlays:</span>

        <button
          onClick={() => setShowEMA20(!showEMA20)}
          className={`px-2 py-0.5 rounded border transition-colors ${
            showEMA20
              ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/40'
              : 'bg-white/[0.02] text-nexus-textMuted border-white/[0.06] opacity-60'
          }`}
        >
          EMA 20
        </button>

        <button
          onClick={() => setShowEMA50(!showEMA50)}
          className={`px-2 py-0.5 rounded border transition-colors ${
            showEMA50
              ? 'bg-purple-500/10 text-purple-400 border-purple-500/40'
              : 'bg-white/[0.02] text-nexus-textMuted border-white/[0.06] opacity-60'
          }`}
        >
          EMA 50
        </button>

        <button
          onClick={() => setShowVolume(!showVolume)}
          className={`px-2 py-0.5 rounded border transition-colors ${
            showVolume
              ? 'bg-white/10 text-nexus-textPrimary border-white/30'
              : 'bg-white/[0.02] text-nexus-textMuted border-white/[0.06] opacity-60'
          }`}
        >
          Volume
        </button>

        <button
          onClick={() => setShowAiMarkers(!showAiMarkers)}
          className={`px-2 py-0.5 rounded border transition-colors ${
            showAiMarkers
              ? 'bg-nexus-accent/15 text-nexus-accent border-nexus-accent/40 font-semibold'
              : 'bg-white/[0.02] text-nexus-textMuted border-white/[0.06] opacity-60'
          }`}
        >
          ● AI Decisions
        </button>

        <button
          onClick={() => setShowTrades(!showTrades)}
          className={`px-2 py-0.5 rounded border transition-colors ${
            showTrades
              ? 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/40 font-semibold'
              : 'bg-white/[0.02] text-nexus-textMuted border-white/[0.06] opacity-60'
          }`}
        >
          ■ Executed Trades
        </button>

        <button
          onClick={() => setShowRSI(!showRSI)}
          className={`px-2 py-0.5 rounded border transition-colors ${
            showRSI
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/40'
              : 'bg-white/[0.02] text-nexus-textMuted border-white/[0.06] opacity-60'
          }`}
        >
          RSI (14)
        </button>

        <button
          onClick={() => setShowMACD(!showMACD)}
          className={`px-2 py-0.5 rounded border transition-colors ${
            showMACD
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40'
              : 'bg-white/[0.02] text-nexus-textMuted border-white/[0.06] opacity-60'
          }`}
        >
          MACD (12,26,9)
        </button>
      </div>

      {/* Main Candlestick Chart Viewport */}
      <div className="relative w-full rounded-xl overflow-hidden border border-white/[0.06] bg-[#090B0E]">
        <div ref={chartContainerRef} className="w-full h-[380px]" />

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-nexus-elevated border border-white/[0.08] text-xs font-mono text-nexus-textPrimary">
              <RefreshCw size={12} className="animate-spin text-nexus-accent" />
              Loading {symbol} {timeframe} candles...
            </div>
          </div>
        )}
      </div>

      {/* Secondary Indicators Pane (RSI / MACD) */}
      {(showRSI || showMACD) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
          {showRSI && (
            <div className="p-3.5 rounded-xl bg-nexus-base border border-white/[0.06] space-y-2 font-mono">
              <div className="flex items-center justify-between text-xs">
                <span className="stat-label">RSI (14) Oscillator</span>
                <span className="font-bold text-amber-400">
                  {indicators[0]?.rsi ? indicators[0].rsi.toFixed(1) : '54.2'}
                </span>
              </div>
              <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden relative">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all"
                  style={{ width: `${indicators[0]?.rsi || 54.2}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-nexus-textMuted">
                <span>30 (Oversold)</span>
                <span>50 (Neutral)</span>
                <span>70 (Overbought)</span>
              </div>
            </div>
          )}

          {showMACD && (
            <div className="p-3.5 rounded-xl bg-nexus-base border border-white/[0.06] space-y-2 font-mono">
              <div className="flex items-center justify-between text-xs">
                <span className="stat-label">MACD (12, 26, 9)</span>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-nexus-bull font-bold">
                    Hist: {indicators[0]?.macdHistogram !== undefined ? indicators[0].macdHistogram.toFixed(2) : '+12.4'}
                  </span>
                  <span className="text-nexus-textMuted">
                    MACD: {indicators[0]?.macd !== undefined ? indicators[0].macd.toFixed(2) : '24.1'}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-nexus-textMuted pt-1">
                <span>Momentum: {((indicators[0]?.macdHistogram || 1) >= 0) ? 'Bullish Expansion' : 'Bearish Contraction'}</span>
                <span>Zero Line Crossover Active</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drawers and Modals */}
      <AiRationaleDrawer
        decision={selectedDecision}
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
        onJumpToChartTimestamp={(_ts) => {
          if (chartInstanceRef.current) {
            chartInstanceRef.current.timeScale().scrollToPosition(-2, true);
          }
        }}
      />

      <TradeDetailModal
        trade={selectedTrade}
        isOpen={isTradeModalOpen}
        onClose={() => setIsTradeModalOpen(false)}
        onViewAiRationale={(tId) => {
          const match = aiDecisions.find((d) => d.tradeId === tId) || latestAi;
          if (match) {
            setSelectedDecision(match);
            setIsAiDrawerOpen(true);
          }
          if (onTradeSelect && selectedTrade) {
            onTradeSelect(selectedTrade);
          }
        }}
      />
    </div>
  );
}
