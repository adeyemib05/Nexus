import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  LineStyle,
  LineData,
  HistogramData,
} from 'lightweight-charts';
import { X, Activity } from 'lucide-react';
import type { HistoricalIndicatorSnapshot } from '../../types';

export interface OscillatorPaneProps {
  type: 'rsi' | 'macd';
  indicators: HistoricalIndicatorSnapshot[];
  mainChart: IChartApi | null;
  onClose?: () => void;
  className?: string;
}

export default function OscillatorPane({
  type,
  indicators,
  mainChart,
  onClose,
  className = '',
}: OscillatorPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);

  // Series refs
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const signalSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const histSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // 1. Initialize Lightweight Chart instance
  useEffect(() => {
    if (!containerRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 140,
      layout: {
        background: { type: ColorType.Solid, color: '#090B0E' },
        textColor: '#64748B',
        fontSize: 10,
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
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartInstanceRef.current = chart;

    if (type === 'rsi') {
      const rsiSeries = chart.addLineSeries({
        color: '#F59E0B', // Amber
        lineWidth: 2,
        title: 'RSI(14)',
        priceFormat: {
          type: 'price',
          precision: 1,
          minMove: 0.1,
        },
      });

      // Standard RSI Reference Levels (30, 50, 70)
      rsiSeries.createPriceLine({
        price: 70,
        color: 'rgba(239, 68, 68, 0.5)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '70 OB',
      });
      rsiSeries.createPriceLine({
        price: 50,
        color: 'rgba(255, 255, 255, 0.18)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: '50',
      });
      rsiSeries.createPriceLine({
        price: 30,
        color: 'rgba(16, 185, 129, 0.5)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '30 OS',
      });

      rsiSeriesRef.current = rsiSeries;
    } else if (type === 'macd') {
      // MACD Histogram
      const histSeries = chart.addHistogramSeries({
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });
      histSeriesRef.current = histSeries;

      // MACD Line
      const macdSeries = chart.addLineSeries({
        color: '#00F0FF', // Cyan
        lineWidth: 2,
        title: 'MACD',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });
      macdSeriesRef.current = macdSeries;

      // Signal Line
      const signalSeries = chart.addLineSeries({
        color: '#F59E0B', // Amber
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: 'Signal',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });
      signalSeriesRef.current = signalSeries;

      // Zero baseline
      macdSeries.createPriceLine({
        price: 0,
        color: 'rgba(255, 255, 255, 0.25)',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: '0',
      });
    }

    // 2. Synchronize visible logical ranges with main chart (bilateral lockstep)
    let isSyncing = false;

    if (mainChart) {
      const initialRange = mainChart.timeScale().getVisibleLogicalRange();
      if (initialRange) {
        chart.timeScale().setVisibleLogicalRange(initialRange);
      }

      const unSubMain = mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncing || !range || !chartInstanceRef.current) return;
        isSyncing = true;
        try {
          chartInstanceRef.current.timeScale().setVisibleLogicalRange(range);
        } catch (_) {}
        isSyncing = false;
      });

      const unSubOsc = chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncing || !range || !mainChart) return;
        isSyncing = true;
        try {
          mainChart.timeScale().setVisibleLogicalRange(range);
        } catch (_) {}
        isSyncing = false;
      });

      // Clean up subscriptions
      const origRemove = chart.remove.bind(chart);
      chart.remove = () => {
        try {
          mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(unSubMain as any);
          chart.timeScale().unsubscribeVisibleLogicalRangeChange(unSubOsc as any);
        } catch (_) {}
        origRemove();
      };
    }

    // Resize handler
    const handleResize = () => {
      if (containerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: containerRef.current.clientWidth,
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
  }, [type, mainChart]);

  // 3. Populate and Update Indicator Series Data
  useEffect(() => {
    if (!chartInstanceRef.current || indicators.length === 0) return;

    // Deduplicate and sort indicator snapshots chronologically ascending
    const sorted = [...indicators]
      .filter((ind) => typeof ind.timestamp === 'number')
      .sort((a, b) => a.timestamp - b.timestamp);

    // Filter to unique timestamps (preserve point-in-time accuracy)
    const seenTimes = new Set<number>();
    const uniqueInds: HistoricalIndicatorSnapshot[] = [];
    for (const ind of sorted) {
      const timeSec = Math.floor(ind.timestamp / 1000);
      if (!seenTimes.has(timeSec)) {
        seenTimes.add(timeSec);
        uniqueInds.push(ind);
      }
    }

    if (type === 'rsi' && rsiSeriesRef.current) {
      const rsiData: LineData[] = uniqueInds
        .filter((ind) => typeof ind.rsi === 'number' && !isNaN(ind.rsi))
        .map((ind) => ({
          time: Math.floor(ind.timestamp / 1000) as UTCTimestamp,
          value: parseFloat(ind.rsi.toFixed(2)),
        }));

      rsiSeriesRef.current.setData(rsiData);
    } else if (type === 'macd') {
      const histData: HistogramData[] = [];
      const macdData: LineData[] = [];
      const signalData: LineData[] = [];

      for (const ind of uniqueInds) {
        const time = Math.floor(ind.timestamp / 1000) as UTCTimestamp;

        if (typeof ind.macd === 'number' && !isNaN(ind.macd)) {
          macdData.push({ time, value: parseFloat(ind.macd.toFixed(2)) });
        }
        if (typeof ind.macdSignal === 'number' && !isNaN(ind.macdSignal)) {
          signalData.push({ time, value: parseFloat(ind.macdSignal.toFixed(2)) });
        }
        if (typeof ind.macdHistogram === 'number' && !isNaN(ind.macdHistogram)) {
          const val = parseFloat(ind.macdHistogram.toFixed(2));
          histData.push({
            time,
            value: val,
            color: val >= 0 ? 'rgba(16, 185, 129, 0.70)' : 'rgba(239, 68, 68, 0.70)',
          });
        }
      }

      if (histSeriesRef.current) histSeriesRef.current.setData(histData);
      if (macdSeriesRef.current) macdSeriesRef.current.setData(macdData);
      if (signalSeriesRef.current) signalSeriesRef.current.setData(signalData);
    }
  }, [indicators, type]);

  // Derived current metrics for the header
  const latestSnapshot = indicators[0] || null;
  const latestRsi = latestSnapshot?.rsi;
  const latestMacd = latestSnapshot?.macd;
  const latestSignal = latestSnapshot?.macdSignal;
  const latestHist = latestSnapshot?.macdHistogram;

  return (
    <div className={`rounded-xl border border-white/[0.06] bg-[#090B0E] p-3 space-y-2 ${className}`}>
      {/* Pane Header Toolbar */}
      <div className="flex items-center justify-between text-xs font-mono border-b border-white/[0.04] pb-1.5">
        <div className="flex items-center gap-2">
          <Activity size={12} className={type === 'rsi' ? 'text-amber-400' : 'text-cyan-400'} />
          <span className="font-bold text-nexus-textPrimary">
            {type === 'rsi' ? 'RSI (14) OSCILLATOR' : 'MACD (12, 26, 9) MOMENTUM'}
          </span>
          <span className="text-[10px] text-nexus-textMuted px-1.5 py-0.2 bg-white/[0.04] rounded border border-white/[0.06]">
            Historical Series
          </span>
        </div>

        {/* Live Values Display */}
        <div className="flex items-center gap-3">
          {type === 'rsi' && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-nexus-textMuted">RSI:</span>
              <span
                className={`font-bold ${
                  latestRsi !== undefined
                    ? latestRsi >= 70
                      ? 'text-nexus-bear'
                      : latestRsi <= 30
                      ? 'text-nexus-bull'
                      : 'text-amber-400'
                    : 'text-nexus-textMuted'
                }`}
              >
                {latestRsi !== undefined ? latestRsi.toFixed(1) : '---'}
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                  latestRsi !== undefined && latestRsi >= 70
                    ? 'bg-nexus-bear/15 text-nexus-bear border border-nexus-bear/30'
                    : latestRsi !== undefined && latestRsi <= 30
                    ? 'bg-nexus-bull/15 text-nexus-bull border border-nexus-bull/30'
                    : 'bg-white/[0.04] text-nexus-textMuted border border-white/[0.08]'
                }`}
              >
                {latestRsi !== undefined
                  ? latestRsi >= 70
                    ? 'Overbought'
                    : latestRsi <= 30
                    ? 'Oversold'
                    : 'Neutral'
                  : 'No Data'}
              </span>
            </div>
          )}

          {type === 'macd' && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-cyan-400 font-bold">
                MACD: {latestMacd !== undefined ? latestMacd.toFixed(2) : '---'}
              </span>
              <span className="text-amber-400">
                Signal: {latestSignal !== undefined ? latestSignal.toFixed(2) : '---'}
              </span>
              <span
                className={`font-bold ${
                  latestHist !== undefined && latestHist >= 0 ? 'text-nexus-bull' : 'text-nexus-bear'
                }`}
              >
                Hist: {latestHist !== undefined ? (latestHist >= 0 ? `+${latestHist.toFixed(2)}` : latestHist.toFixed(2)) : '---'}
              </span>
            </div>
          )}

          {onClose && (
            <button
              onClick={onClose}
              title={`Hide ${type.toUpperCase()}`}
              className="p-1 rounded hover:bg-white/[0.08] text-nexus-textMuted hover:text-nexus-textPrimary transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Synchronized Viewport */}
      <div ref={containerRef} className="w-full h-[140px]" />
    </div>
  );
}
