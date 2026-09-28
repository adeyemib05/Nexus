import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Target,
  X,
  Activity,
  Compass,
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
  BacktestTradeAnnotation,
  PriceTicker,
} from '../../types';
import { formatPrice } from '../../lib/utils';
import {
  aggregateCandles,
  getBucketAnchor,
  calculateContinuousEMA,
} from '../../lib/candleAggregation';
import ChartHUD, { HoveredCandleContext } from './ChartHUD';
import AiRationaleDrawer, { classifyRiskStatus } from './AiRationaleDrawer';
import TradeDetailModal from './TradeDetailModal';
import OscillatorPane from './OscillatorPane';

interface MarketChartProps {
  symbol?: string;
  currentTicker?: PriceTicker | null;
  trades?: Trade[];
  backtestTrades?: BacktestTradeAnnotation[];
  activeTradeId?: string | null;
  onTradeSelect?: (trade: Trade) => void;
  onBacktestTradeSelect?: (trade: BacktestTradeAnnotation) => void;
  className?: string;
  defaultTimeframe?: string;
  selectedDecision?: HistoricalAiDecision | null;
  onSelectDecision?: (decision: HistoricalAiDecision | null) => void;
}

const TIMEFRAMES = [
  { id: '1m', label: '1m' },
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1H' },
];

export default function MarketChart({
  symbol = 'BTCUSDT',
  currentTicker,
  trades = [],
  backtestTrades = [],
  activeTradeId,
  onTradeSelect,
  onBacktestTradeSelect,
  className = '',
  defaultTimeframe = '1m',
  selectedDecision: externalSelectedDecision,
  onSelectDecision,
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
  const [raw1mCandles, setRaw1mCandles] = useState<HistoricalCandle[]>([]);
  const [raw1hCandles, setRaw1hCandles] = useState<HistoricalCandle[]>([]);
  const [indicators, setIndicators] = useState<HistoricalIndicatorSnapshot[]>([]);
  const [aiDecisions, setAiDecisions] = useState<HistoricalAiDecision[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Synchronized chart instance passing
  const [mainChartReady, setMainChartReady] = useState<IChartApi | null>(null);

  // Up-to-date refs for chart event callbacks (prevents stale closures)
  const aiDecisionsRef = useRef<HistoricalAiDecision[]>([]);
  const tradesRef = useRef<Trade[]>([]);
  const backtestTradesRef = useRef<BacktestTradeAnnotation[]>([]);
  const timeframeRef = useRef<string>(timeframe);
  const displayCandlesRef = useRef<HistoricalCandle[]>([]);
  const ema20MapRef = useRef<Map<number, number>>(new Map());
  const ema50MapRef = useRef<Map<number, number>>(new Map());

  aiDecisionsRef.current = aiDecisions;
  tradesRef.current = trades;
  backtestTradesRef.current = backtestTrades;
  timeframeRef.current = timeframe;

  // HUD State
  const [hudData, setHudData] = useState<HoveredCandleContext | null>(null);
  const [isHudHovered, setIsHudHovered] = useState(false);

  // Navigation State
  const [isScrolledBack, setIsScrolledBack] = useState(false);

  // Toggles
  const [showEMA20, setShowEMA20] = useState(true);
  const [showEMA50, setShowEMA50] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [showAiMarkers, setShowAiMarkers] = useState(true);
  const [showTrades, setShowTrades] = useState(true);

  // Drawer / Inspection state
  const [internalSelectedDecision, setInternalSelectedDecision] = useState<HistoricalAiDecision | null>(null);
  const selectedDecision = externalSelectedDecision !== undefined ? externalSelectedDecision : internalSelectedDecision;
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | BacktestTradeAnnotation | null>(null);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);

  const handleSelectDecision = useCallback((d: HistoricalAiDecision | null) => {
    setInternalSelectedDecision(d);
    if (onSelectDecision) onSelectDecision(d);
  }, [onSelectDecision]);

  // Center chart and adjust viewport when selectedDecision changes
  useEffect(() => {
    if (selectedDecision && chartInstanceRef.current) {
      const targetAnchorMs = getBucketAnchor(selectedDecision.timestamp, timeframe);
      const centerSec = Math.floor(targetAnchorMs / 1000);
      const windowSec = timeframe === '1h' ? 3600 * 12 : timeframe === '15m' ? 900 * 12 : 1800;
      try {
        chartInstanceRef.current.timeScale().setVisibleRange({
          from: (centerSec - windowSec) as UTCTimestamp,
          to: (centerSec + windowSec) as UTCTimestamp,
        });
      } catch {
        chartInstanceRef.current.timeScale().scrollToPosition(-3, true);
      }
    }
  }, [selectedDecision?.id, timeframe]);

  // Dynamic main chart height
  const mainChartHeight = showRSI && showMACD ? 260 : showRSI || showMACD ? 310 : 380;

  // 1. Fetch historical candles & annotations according to authoritative storage rules
  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (timeframe === '1h') {
        // Native stored 1H candles (up to 200 candles to cover complete backtest replay window)
        const [candleRes, aiRes] = await Promise.all([
          getHistoricalCandles({ symbol, timeframe: '1h', limit: 200 }),
          getAiDecisionsHistory({ symbol, limit: 50 }),
        ]);

        if (candleRes.success && candleRes.data) {
          setRaw1hCandles(candleRes.data);
        }
        if (aiRes.success && aiRes.data) {
          setAiDecisions(aiRes.data);
        }
      } else {
        // 1m source for 1m native, or 5m/15m derived aggregation
        const [candleRes, indRes, aiRes] = await Promise.all([
          getHistoricalCandles({ symbol, timeframe: '1m', limit: 500 }),
          getHistoricalIndicators({ symbol, timeframe: '1m', limit: 300 }),
          getAiDecisionsHistory({ symbol, limit: 50 }),
        ]);

        if (candleRes.success && candleRes.data) {
          setRaw1mCandles(candleRes.data);
        }
        if (indRes.success && indRes.data) {
          setIndicators(indRes.data);
        }
        if (aiRes.success && aiRes.data) {
          setAiDecisions(aiRes.data);
        }
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

  // 2. Resolve Active Display Candles (Native or Aggregated)
  const displayCandles = useMemo<HistoricalCandle[]>(() => {
    if (timeframe === '1h') {
      return raw1hCandles;
    }
    if (timeframe === '5m') {
      return aggregateCandles(raw1mCandles, 5);
    }
    if (timeframe === '15m') {
      return aggregateCandles(raw1mCandles, 15);
    }
    // Default 1m native stored
    return raw1mCandles;
  }, [timeframe, raw1mCandles, raw1hCandles]);

  displayCandlesRef.current = displayCandles;

  // Initialize Default HUD data to latest candle when not hovered
  useEffect(() => {
    if (!isHudHovered && displayCandles.length > 0) {
      const latest = displayCandles[displayCandles.length - 1];
      const latestSec = Math.floor(latest.timestamp / 1000);
      const matchDecision = aiDecisions.find(
        (d) => Math.floor(getBucketAnchor(d.timestamp, timeframe) / 1000) === latestSec
      );

      setHudData({
        timestamp: latest.timestamp,
        open: latest.open,
        high: latest.high,
        low: latest.low,
        close: latest.close,
        volume: latest.volume,
        ema20: ema20MapRef.current.get(latestSec) ?? null,
        ema50: ema50MapRef.current.get(latestSec) ?? null,
        emaSource: timeframe === '1m' ? 'STORED' : 'DERIVED',
        isForming: (latest as any).isForming,
        aiDecision: matchDecision
          ? {
              id: matchDecision.id,
              action: matchDecision.action,
              confidence: matchDecision.confidence,
              strategy: matchDecision.strategy,
              executed: matchDecision.executed,
              blockReason: matchDecision.blockReason,
              decisionType: matchDecision.decisionType,
            }
          : null,
      });
    }
  }, [displayCandles, isHudHovered, aiDecisions, timeframe]);

  // 3. Initialize Lightweight Chart instance
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clean up previous instance
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
      setMainChartReady(null);
    }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: mainChartHeight,
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
    setMainChartReady(chart);

    // Candlestick Series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#EF4444',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });
    candleSeriesRef.current = candleSeries;

    // Volume Series
    const volumeSeries = chart.addHistogramSeries({
      color: 'rgba(255, 255, 255, 0.10)',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // Overlay over price
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // EMA 20
    const ema20Series = chart.addLineSeries({
      color: '#00F0FF',
      lineWidth: 1,
      title: 'EMA20',
    });
    ema20SeriesRef.current = ema20Series;

    // EMA 50
    const ema50Series = chart.addLineSeries({
      color: '#A855F7',
      lineWidth: 1,
      title: 'EMA50',
    });
    ema50SeriesRef.current = ema50Series;

    // Crosshair Move Handler (Updates HUD with hovered point-in-time context)
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.time) {
        setIsHudHovered(false);
        return;
      }

      const hoverSec = Number(param.time);
      const candle = displayCandlesRef.current.find(
        (c) => Math.floor(c.timestamp / 1000) === hoverSec
      );

      if (candle) {
        const matchDecision = aiDecisionsRef.current.find((d) => {
          const anchorMs = getBucketAnchor(d.timestamp, timeframeRef.current);
          return Math.floor(anchorMs / 1000) === hoverSec;
        });

        const ema20Val = ema20MapRef.current.get(hoverSec) ?? null;
        const ema50Val = ema50MapRef.current.get(hoverSec) ?? null;

        setHudData({
          timestamp: candle.timestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          ema20: ema20Val,
          ema50: ema50Val,
          emaSource: timeframeRef.current === '1m' ? 'STORED' : 'DERIVED',
          isForming: (candle as any).isForming,
          aiDecision: matchDecision
            ? {
                id: matchDecision.id,
                action: matchDecision.action,
                confidence: matchDecision.confidence,
                strategy: matchDecision.strategy,
                executed: matchDecision.executed,
                blockReason: matchDecision.blockReason,
                decisionType: matchDecision.decisionType,
              }
            : null,
        });
        setIsHudHovered(true);
      }
    });

    // Detect when user pans/scrolls away from the latest candle
    chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
      if (!logicalRange || displayCandlesRef.current.length === 0) return;
      const totalBars = displayCandlesRef.current.length;
      // If right edge is 2 or more bars behind the frontier, user is in historical memory
      const isBack = logicalRange.to < totalBars - 2;
      setIsScrolledBack(isBack);
    });

    // Chart Click Handler (Inspect AI Decisions and Executed Trades)
    chart.subscribeClick((param) => {
      if (!param.point) return;

      // 1. Direct marker click match via hoveredObjectId
      if (param.hoveredObjectId) {
        const rawId = String(param.hoveredObjectId);
        if (rawId.startsWith('ai_')) {
          const decId = rawId.replace(/^ai_/, '');
          const match = aiDecisionsRef.current.find((d) => d.id === decId || `ai_${d.id}` === rawId);
          if (match) {
            handleSelectDecision(match);
            setIsAiDrawerOpen(true);
            return;
          }
        } else if (rawId.startsWith('trade_') || rawId.startsWith('exit_')) {
          const tradeId = rawId.replace(/^(trade|exit)_/, '');
          const matchTrade = tradesRef.current.find((t) => t.id === tradeId);
          if (matchTrade) {
            setSelectedTrade(matchTrade);
            setIsTradeModalOpen(true);
            if (onTradeSelect) onTradeSelect(matchTrade);
            return;
          }
        } else if (rawId.startsWith('bt_entry_') || rawId.startsWith('bt_exit_')) {
          const tradeId = rawId.replace(/^bt_(entry|exit)_/, '');
          const matchBt = backtestTradesRef.current.find((t) => t.id === tradeId);
          if (matchBt) {
            setSelectedTrade(matchBt);
            setIsTradeModalOpen(true);
            if (onBacktestTradeSelect) onBacktestTradeSelect(matchBt);
            return;
          }
        }
      }

      // 2. Bar click: find AI decision anchored to this candle bucket
      if (param.time) {
        const clickSec = Number(param.time);
        const candidates = aiDecisionsRef.current.filter((d) => {
          const anchorMs = getBucketAnchor(d.timestamp, timeframeRef.current);
          return Math.floor(anchorMs / 1000) === clickSec;
        });

        if (candidates.length > 0) {
          handleSelectDecision(candidates[0]);
          setIsAiDrawerOpen(true);
          return;
        }
      }
    });

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
        setMainChartReady(null);
      }
    };
  }, [handleSelectDecision, onTradeSelect, onBacktestTradeSelect]);

  // Update chart height dynamically when oscillators are toggled
  useEffect(() => {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.applyOptions({
        height: mainChartHeight,
      });
    }
  }, [mainChartHeight]);

  // 4. Populate and Update Series Data (Candles, Volume, EMAs, Markers)
  useEffect(() => {
    if (!candleSeriesRef.current || displayCandles.length === 0) return;

    // Convert candles to Lightweight Charts format
    const formattedCandles: CandlestickData[] = displayCandles.map((c) => ({
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
        const volData: HistogramData[] = displayCandles.map((c) => ({
          time: Math.floor(c.timestamp / 1000) as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
        }));
        volumeSeriesRef.current.setData(volData);
      } else {
        volumeSeriesRef.current.setData([]);
      }
    }

    // Indicator Binding: Authoritative Stored on 1m, Continuous Derived on 5m/15m/1h
    const ema20Map = new Map<number, number>();
    const ema50Map = new Map<number, number>();

    let ema20LineData: LineData[] = [];
    let ema50LineData: LineData[] = [];

    if (timeframe === '1m' && indicators.length > 0) {
      // Map stored indicator snapshots by timestamp
      const indMap = new Map<number, HistoricalIndicatorSnapshot>();
      for (const ind of indicators) {
        indMap.set(Math.floor(ind.timestamp / 60000) * 60, ind);
      }

      // Build continuous line using stored snapshots where available
      const rawEma20 = calculateContinuousEMA(displayCandles, 20);
      const rawEma50 = calculateContinuousEMA(displayCandles, 50);
      const fallback20 = new Map(rawEma20.map((d) => [d.time, d.value]));
      const fallback50 = new Map(rawEma50.map((d) => [d.time, d.value]));

      for (const c of displayCandles) {
        const sec = Math.floor(c.timestamp / 1000);
        const canonSec = Math.floor(c.timestamp / 60000) * 60;
        const stored = indMap.get(canonSec);

        const v20 = stored?.ema20 ?? fallback20.get(sec) ?? null;
        const v50 = stored?.ema50 ?? fallback50.get(sec) ?? null;

        if (v20 !== null) {
          ema20LineData.push({ time: sec as UTCTimestamp, value: v20 });
          ema20Map.set(sec, v20);
        }
        if (v50 !== null) {
          ema50LineData.push({ time: sec as UTCTimestamp, value: v50 });
          ema50Map.set(sec, v50);
        }
      }
    } else {
      // Derived timeframes (5m, 15m, 1h): compute continuous moving averages
      const e20 = calculateContinuousEMA(displayCandles, 20);
      const e50 = calculateContinuousEMA(displayCandles, 50);

      ema20LineData = e20.map((d) => {
        ema20Map.set(d.time, d.value);
        return { time: d.time as UTCTimestamp, value: d.value };
      });
      ema50LineData = e50.map((d) => {
        ema50Map.set(d.time, d.value);
        return { time: d.time as UTCTimestamp, value: d.value };
      });
    }

    ema20MapRef.current = ema20Map;
    ema50MapRef.current = ema50Map;

    if (ema20SeriesRef.current) {
      ema20SeriesRef.current.setData(showEMA20 ? ema20LineData : []);
    }
    if (ema50SeriesRef.current) {
      ema50SeriesRef.current.setData(showEMA50 ? ema50LineData : []);
    }

    // 5. Point-in-Time AI Decision Markers with Full Execution & Risk Classification
    const markers: SeriesMarker<UTCTimestamp>[] = [];
    const candleTimeSet = new Set<number>(displayCandles.map((c) => Math.floor(c.timestamp / 1000)));

    if (showAiMarkers && aiDecisions.length > 0) {
      aiDecisions.forEach((d) => {
        const bucketAnchorMs = getBucketAnchor(d.timestamp, timeframe);
        const anchorSec = Math.floor(bucketAnchorMs / 1000);

        // Only place marker if containing candle bucket exists in current display range
        if (candleTimeSet.has(anchorSec)) {
          const classification = classifyRiskStatus(d, null);
          const isBuy = d.action === 'BUY';
          const isSell = d.action === 'SELL';
          const isFailsafe = d.decisionType === 'failsafe_hold' || d.provider === 'fallback_hold' || classification.resultTitle.includes('Failsafe');
          const isBlocked = classification.status === 'BLOCKED';
          const isExecuted = classification.status === 'EXECUTED';
          const isSelected = selectedDecision?.id === d.id;

          let markerColor = '#64748B'; // Default neutral slate
          let markerShape: 'circle' | 'arrowUp' | 'arrowDown' = 'circle';
          let markerPos: 'aboveBar' | 'belowBar' | 'inBar' = 'inBar';
          let markerText = `HOLD`;

          if (isExecuted) {
            if (isBuy) {
              markerColor = '#10B981'; // Green
              markerShape = 'arrowUp';
              markerPos = 'belowBar';
              markerText = `BUY (Executed)`;
            } else if (isSell) {
              markerColor = '#EF4444'; // Red
              markerShape = 'arrowDown';
              markerPos = 'aboveBar';
              markerText = `SELL (Executed)`;
            }
          } else if (isBlocked) {
            markerColor = '#F97316'; // Orange / Warning
            markerShape = isBuy ? 'arrowUp' : 'arrowDown';
            markerPos = isBuy ? 'belowBar' : 'aboveBar';
            markerText = isBuy ? `BUY (Blocked)` : `SELL (Blocked)`;
          } else if (isFailsafe) {
            markerColor = '#F59E0B'; // Amber
            markerShape = 'circle';
            markerPos = 'aboveBar';
            markerText = `HOLD (Failsafe)`;
          } else if (d.action === 'HOLD') {
            markerColor = '#94A3B8'; // Slate
            markerShape = 'circle';
            markerPos = 'inBar';
            const confPct = Math.round(d.confidence <= 1 ? d.confidence * 100 : d.confidence);
            markerText = `HOLD (${confPct}%)`;
          } else {
            markerColor = '#94A3B8';
            markerShape = isBuy ? 'arrowUp' : 'arrowDown';
            markerPos = isBuy ? 'belowBar' : 'aboveBar';
            markerText = `${d.action} (Unfilled)`;
          }

          if (isSelected) {
            markerText = `★ ${markerText} [Active]`;
          }

          markers.push({
            time: anchorSec as UTCTimestamp,
            position: markerPos,
            color: isSelected ? '#00F0FF' : markerColor,
            shape: markerShape,
            text: markerText,
            id: `ai_${d.id}`,
            size: isSelected ? 2 : 1,
          });
        }
      });
    }

    // 6. Verified Trade Markers (Only from verified historical trade ledger records)
    if (showTrades && trades.length > 0) {
      const verifiedTrades = trades.filter(
        (t) => t.id && (t.status === 'open' || t.status === 'closed') && t.entryPrice > 0
      );

      verifiedTrades.forEach((t) => {
        const openAnchorSec = Math.floor(getBucketAnchor(t.openedAt, timeframe) / 1000);
        if (candleTimeSet.has(openAnchorSec)) {
          markers.push({
            time: openAnchorSec as UTCTimestamp,
            position: t.side === 'long' ? 'belowBar' : 'aboveBar',
            color: '#00F0FF',
            shape: 'circle',
            text: `${t.side.toUpperCase()} ENTRY $${t.entryPrice}`,
            id: `trade_${t.id}`,
            size: 1,
          });
        }

        if (t.closedAt) {
          const closeAnchorSec = Math.floor(getBucketAnchor(t.closedAt, timeframe) / 1000);
          if (candleTimeSet.has(closeAnchorSec)) {
            markers.push({
              time: closeAnchorSec as UTCTimestamp,
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

    // 7. Backtest Replay Trade Markers ([BT] Prefix with Strict Provenance)
    if (showTrades && backtestTrades.length > 0) {
      backtestTrades.forEach((t) => {
        const openAnchorSec = Math.floor(getBucketAnchor(t.entryTimestamp, timeframe) / 1000);
        const isSelected = activeTradeId === t.id;

        if (candleTimeSet.has(openAnchorSec)) {
          markers.push({
            time: openAnchorSec as UTCTimestamp,
            position: t.side === 'long' ? 'belowBar' : 'aboveBar',
            color: isSelected ? '#00D2FF' : t.side === 'long' ? '#10B981' : '#F43F5E',
            shape: 'circle',
            text: isSelected
              ? `★ [BT] ${t.side.toUpperCase()} $${formatPrice(t.entryPrice)} [Active]`
              : `[BT] ${t.side.toUpperCase()} $${formatPrice(t.entryPrice)}`,
            id: `bt_entry_${t.id}`,
            size: isSelected ? 2 : 1,
          });
        }

        if (t.exitTimestamp) {
          const closeAnchorSec = Math.floor(getBucketAnchor(t.exitTimestamp, timeframe) / 1000);
          if (candleTimeSet.has(closeAnchorSec)) {
            const isExitSelected = activeTradeId === t.id;
            markers.push({
              time: closeAnchorSec as UTCTimestamp,
              position: t.side === 'long' ? 'aboveBar' : 'belowBar',
              color: isExitSelected ? '#00D2FF' : t.pnl >= 0 ? '#10B981' : '#F43F5E',
              shape: 'square',
              text: isExitSelected
                ? `★ [BT] EXIT ${t.pnl >= 0 ? `+$${t.pnl.toFixed(2)}` : `-$${Math.abs(t.pnl).toFixed(2)}`} [Active]`
                : `[BT] EXIT ${t.pnl >= 0 ? `+$${t.pnl.toFixed(2)}` : `-$${Math.abs(t.pnl).toFixed(2)}`}`,
              id: `bt_exit_${t.id}`,
              size: isExitSelected ? 2 : 1,
            });
          }
        }
      });
    }

    // Sort markers chronologically (Lightweight Charts requires strictly ascending time)
    markers.sort((a, b) => Number(a.time) - Number(b.time));
    candleSeriesRef.current.setMarkers(markers);
  }, [displayCandles, showVolume, showEMA20, showEMA50, showAiMarkers, showTrades, aiDecisions, trades, backtestTrades, activeTradeId, selectedDecision, timeframe, indicators]);

  // 6. Live Candle Streaming / Updating (Separated from historical data to prevent mutation)
  useEffect(() => {
    if (!candleSeriesRef.current || !currentTicker?.price || displayCandles.length === 0) return;

    const lastCandle = displayCandles[displayCandles.length - 1];
    const livePrice = currentTicker.price;

    // Update the current bar dynamically without mutating the historical array
    candleSeriesRef.current.update({
      time: Math.floor(lastCandle.timestamp / 1000) as UTCTimestamp,
      open: lastCandle.open,
      high: Math.max(lastCandle.high, livePrice),
      low: Math.min(lastCandle.low, livePrice),
      close: livePrice,
    });
  }, [currentTicker, displayCandles]);

  // Sync and center to active trade (Backtest or Live)
  useEffect(() => {
    if (!activeTradeId) return;

    // A) Check backtest trades
    const bt = backtestTrades.find((x) => x.id === activeTradeId);
    if (bt) {
      setSelectedTrade(bt);
      if (chartInstanceRef.current && bt.entryTimestamp) {
        const anchorMs = getBucketAnchor(bt.entryTimestamp, timeframe);
        const centerSec = Math.floor(anchorMs / 1000);
        const windowSec = timeframe === '1h' ? 3600 * 12 : timeframe === '15m' ? 900 * 12 : 1800;
        try {
          chartInstanceRef.current.timeScale().setVisibleRange({
            from: (centerSec - windowSec) as UTCTimestamp,
            to: (centerSec + windowSec) as UTCTimestamp,
          });
        } catch {
          chartInstanceRef.current.timeScale().scrollToPosition(-3, true);
        }
      }
      return;
    }

    // B) Check live trades
    const t = trades.find((x) => x.id === activeTradeId);
    if (t) {
      setSelectedTrade(t);
      if (chartInstanceRef.current && t.openedAt) {
        const anchorMs = getBucketAnchor(t.openedAt, timeframe);
        const centerSec = Math.floor(anchorMs / 1000);
        const windowSec = timeframe === '1h' ? 3600 * 12 : timeframe === '15m' ? 900 * 12 : 1800;
        try {
          chartInstanceRef.current.timeScale().setVisibleRange({
            from: (centerSec - windowSec) as UTCTimestamp,
            to: (centerSec + windowSec) as UTCTimestamp,
          });
        } catch {
          chartInstanceRef.current.timeScale().scrollToPosition(-3, true);
        }
      }
    }
  }, [activeTradeId, backtestTrades, trades, timeframe]);

  const latestCandle = displayCandles[displayCandles.length - 1];
  const latestAi = aiDecisions[0] || null;

  return (
    <div className={`glass-card p-4 md:p-5 space-y-3 ${className}`}>
      {/* 1. Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-white/[0.06]">
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
              className={`px-2.5 py-1 text-xs font-mono rounded-md transition-all cursor-pointer ${
                timeframe === tf.id
                  ? 'bg-nexus-accent/20 text-nexus-accent font-bold border border-nexus-accent/40 shadow-sm'
                  : 'text-nexus-textMuted hover:text-nexus-textPrimary'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Right: AI Decision Navigator & Actions */}
        <div className="flex items-center gap-2">
          {aiDecisions.length > 0 && (
            <div className="flex items-center bg-white/[0.03] border border-white/[0.08] rounded-lg p-0.5 text-xs font-mono">
              <button
                onClick={() => {
                  const currIdx = selectedDecision ? aiDecisions.findIndex((d) => d.id === selectedDecision.id) : -1;
                  const nextIdx = currIdx < aiDecisions.length - 1 ? currIdx + 1 : 0;
                  const nextDec = aiDecisions[nextIdx];
                  if (nextDec) {
                    handleSelectDecision(nextDec);
                    setIsAiDrawerOpen(true);
                  }
                }}
                title="Inspect Earlier Historical Decision"
                className="px-1.5 py-0.5 hover:bg-white/[0.08] rounded text-nexus-textMuted hover:text-nexus-textPrimary transition-colors cursor-pointer"
              >
                <ChevronLeft size={13} />
              </button>

              <button
                onClick={() => {
                  handleSelectDecision(selectedDecision || latestAi);
                  setIsAiDrawerOpen(true);
                }}
                className="px-2 py-0.5 text-nexus-accent font-semibold flex items-center gap-1.5 hover:bg-nexus-accent/10 rounded transition-colors cursor-pointer"
              >
                <Brain size={12} />
                {selectedDecision
                  ? `AI ${selectedDecision.action} (${Math.round(selectedDecision.confidence <= 1 ? selectedDecision.confidence * 100 : selectedDecision.confidence)}%)`
                  : latestAi
                  ? `AI ${latestAi.action} Rationale`
                  : 'AI Decision'}
              </button>

              <button
                onClick={() => {
                  const currIdx = selectedDecision ? aiDecisions.findIndex((d) => d.id === selectedDecision.id) : 0;
                  const prevIdx = currIdx > 0 ? currIdx - 1 : aiDecisions.length - 1;
                  const prevDec = aiDecisions[prevIdx];
                  if (prevDec) {
                    handleSelectDecision(prevDec);
                    setIsAiDrawerOpen(true);
                  }
                }}
                title="Inspect Later Historical Decision"
                className="px-1.5 py-0.5 hover:bg-white/[0.08] rounded text-nexus-textMuted hover:text-nexus-textPrimary transition-colors cursor-pointer"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}

          <button
            onClick={fetchData}
            title="Refresh Historical Candles"
            className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-nexus-textMuted hover:text-nexus-textPrimary border border-white/[0.06] transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 2. Point-in-Time Crosshair HUD Legend */}
      <ChartHUD
        data={hudData}
        symbol={symbol}
        timeframe={timeframe}
        isHovered={isHudHovered}
      />

      {/* 3. Active Inspector Chip when Drawer is Open */}
      {selectedDecision && isAiDrawerOpen && (
        <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-nexus-accent/10 border border-nexus-accent/30 text-xs font-mono animate-fadeIn">
          <div className="flex items-center gap-2">
            <Target size={13} className="text-nexus-accent" />
            <span className="text-nexus-textMuted">Inspecting Historical Decision:</span>
            <span className="font-bold text-nexus-accent">
              AI {selectedDecision.action}
            </span>
            <span className="text-[11px] text-nexus-textPrimary">
              ({Math.round(selectedDecision.confidence <= 1 ? selectedDecision.confidence * 100 : selectedDecision.confidence)}% conf)
            </span>
            <span className="text-[10px] text-nexus-textMuted border-l border-white/[0.1] pl-2">
              {new Date(selectedDecision.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          <button
            onClick={() => setIsAiDrawerOpen(false)}
            className="flex items-center gap-1 text-[11px] text-nexus-textMuted hover:text-nexus-textPrimary transition-colors cursor-pointer"
          >
            <X size={12} />
            <span>Close Inspector</span>
          </button>
        </div>
      )}

      {/* 4. Overlays & Oscillators Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-2">
          <span className="stat-label text-[10px] uppercase text-nexus-textMuted mr-1">Overlays:</span>

          <button
            onClick={() => setShowEMA20(!showEMA20)}
            className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
              showEMA20
                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/40 font-semibold'
                : 'bg-white/[0.02] text-nexus-textMuted border-white/[0.06] opacity-60'
            }`}
          >
            EMA 20
          </button>

          <button
            onClick={() => setShowEMA50(!showEMA50)}
            className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
              showEMA50
                ? 'bg-purple-500/10 text-purple-400 border-purple-500/40 font-semibold'
                : 'bg-white/[0.02] text-nexus-textMuted border-white/[0.06] opacity-60'
            }`}
          >
            EMA 50
          </button>

          <button
            onClick={() => setShowVolume(!showVolume)}
            className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
              showVolume
                ? 'bg-white/10 text-nexus-textPrimary border-white/30 font-semibold'
                : 'bg-white/[0.02] text-nexus-textMuted border-white/[0.06] opacity-60'
            }`}
          >
            Volume
          </button>

          <button
            onClick={() => setShowAiMarkers(!showAiMarkers)}
            className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
              showAiMarkers
                ? 'bg-nexus-accent/15 text-nexus-accent border-nexus-accent/40 font-semibold'
                : 'bg-white/[0.02] text-nexus-textMuted border-white/[0.06] opacity-60'
            }`}
          >
            ● AI Decision Markers
          </button>

          <button
            onClick={() => setShowTrades(!showTrades)}
            className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
              showTrades
                ? 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/40 font-semibold'
                : 'bg-white/[0.02] text-nexus-textMuted border-white/[0.06] opacity-60'
            }`}
          >
            ■ Executed Trades
          </button>
        </div>

        {/* Synchronized Oscillators Toggles */}
        <div className="flex items-center gap-2">
          <span className="stat-label text-[10px] uppercase text-nexus-textMuted mr-1">Oscillators:</span>

          <button
            onClick={() => setShowRSI(!showRSI)}
            className={`px-2 py-0.5 rounded border transition-colors flex items-center gap-1 cursor-pointer ${
              showRSI
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/40 font-semibold shadow-sm'
                : 'bg-white/[0.02] text-nexus-textMuted border-white/[0.06] opacity-60'
            }`}
          >
            <Activity size={10} />
            RSI (14)
          </button>

          <button
            onClick={() => setShowMACD(!showMACD)}
            className={`px-2 py-0.5 rounded border transition-colors flex items-center gap-1 cursor-pointer ${
              showMACD
                ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40 font-semibold shadow-sm'
                : 'bg-white/[0.02] text-nexus-textMuted border-white/[0.06] opacity-60'
            }`}
          >
            <Activity size={10} />
            MACD (12, 26, 9)
          </button>
        </div>
      </div>

      {/* 5. Main Candlestick Chart Viewport */}
      <div className="relative w-full rounded-xl overflow-hidden border border-white/[0.06] bg-[#090B0E]">
        <div
          ref={chartContainerRef}
          style={{ height: `${mainChartHeight}px` }}
          className="w-full transition-all duration-200"
        />

        {/* Return to Live Button (Appears when panned into historical memory) */}
        {isScrolledBack && (
          <button
            onClick={() => {
              if (chartInstanceRef.current) {
                chartInstanceRef.current.timeScale().scrollToRealTime();
                setIsScrolledBack(false);
              }
            }}
            title="Return chart viewport to latest market candle"
            className="absolute bottom-4 right-4 z-20 px-3 py-1.5 rounded-lg bg-nexus-accent/20 hover:bg-nexus-accent/30 border border-nexus-accent/50 text-nexus-accent font-mono text-xs font-semibold shadow-lg backdrop-blur-md flex items-center gap-1.5 transition-all cursor-pointer animate-pulse"
          >
            <Compass size={13} />
            <span>● Return to Live</span>
          </button>
        )}

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-nexus-elevated border border-white/[0.08] text-xs font-mono text-nexus-textPrimary">
              <RefreshCw size={12} className="animate-spin text-nexus-accent" />
              Loading {symbol} {timeframe} market memory...
            </div>
          </div>
        )}
      </div>

      {/* 6. Synchronized Historical Oscillator Panes (RSI / MACD) */}
      {showRSI && (
        <OscillatorPane
          type="rsi"
          indicators={indicators}
          mainChart={mainChartReady}
          onClose={() => setShowRSI(false)}
        />
      )}

      {showMACD && (
        <OscillatorPane
          type="macd"
          indicators={indicators}
          mainChart={mainChartReady}
          onClose={() => setShowMACD(false)}
        />
      )}

      {/* 7. Drawers and Modals (only rendered internally if parent does not control selection) */}
      {!onSelectDecision && (
        <AiRationaleDrawer
          decision={selectedDecision}
          isOpen={isAiDrawerOpen}
          onClose={() => setIsAiDrawerOpen(false)}
          onJumpToChartTimestamp={(ts) => {
            if (chartInstanceRef.current && ts) {
              const targetAnchorMs = getBucketAnchor(ts, timeframe);
              const centerSec = Math.floor(targetAnchorMs / 1000);
              const windowSec = timeframe === '1h' ? 3600 * 12 : 1800;
              try {
                chartInstanceRef.current.timeScale().setVisibleRange({
                  from: (centerSec - windowSec) as UTCTimestamp,
                  to: (centerSec + windowSec) as UTCTimestamp,
                });
              } catch {
                chartInstanceRef.current.timeScale().scrollToPosition(-3, true);
              }
            } else if (chartInstanceRef.current) {
              chartInstanceRef.current.timeScale().scrollToPosition(-3, true);
            }
          }}
        />
      )}

      <TradeDetailModal
        trade={selectedTrade}
        isOpen={isTradeModalOpen}
        onClose={() => setIsTradeModalOpen(false)}
        onViewAiRationale={(tId) => {
          const match = aiDecisions.find((d) => d.tradeId === tId) || latestAi;
          if (match) {
            handleSelectDecision(match);
            setIsAiDrawerOpen(true);
          }
          if (onTradeSelect && selectedTrade && (selectedTrade as any).source !== 'backtest') {
            onTradeSelect(selectedTrade as Trade);
          }
        }}
      />
    </div>
  );
}
