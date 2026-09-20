import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  FlaskConical,
  Play,
  TrendingUp,
  Percent,
  Target,
  ShieldAlert,
  BarChart3,
  Layers,
  Clock,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { runBacktest } from '../lib/api';
import type { BacktestResult, BacktestTrade } from '../types';
import { formatPrice, formatPct, formatTimestamp } from '../lib/utils';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import StatCard from '../components/ui/StatCard';
import MarketChart from '../components/chart/MarketChart';
import TradeDetailModal from '../components/chart/TradeDetailModal';

export default function BacktestLab() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [granularity, setGranularity] = useState('1h');
  const [days, setDays] = useState(30);
  const [initialCapital, setInitialCapital] = useState(10000);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Selected trade for deep chart inspection
  const [selectedTrade, setSelectedTrade] = useState<any | null>(null);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const res = await runBacktest({
        symbol: symbol.toUpperCase().trim(),
        granularity: granularity.toLowerCase().trim(),
        days,
      });

      if (res.success && res.data) {
        setResult(res.data);
      } else {
        setError(res.error || 'Backtest failed to execute. Check symbol or timeframe availability.');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error communicating with backtest engine.');
    } finally {
      setIsRunning(false);
    }
  };

  // Convert backtest trades to standard Trade format for modal
  const openTradeInspection = (bt: BacktestTrade, idx: number) => {
    setSelectedTrade({
      id: `bt-${idx + 1}`,
      symbol: result?.symbol || symbol,
      side: bt.side,
      strategy: bt.strategy,
      entryPrice: bt.entryPrice,
      exitPrice: bt.exitPrice,
      positionSizePct: 0.02,
      positionSizeUSD: Math.round(initialCapital * 0.2),
      stopLoss: bt.side === 'long' ? bt.entryPrice * 0.97 : bt.entryPrice * 1.03,
      takeProfit: bt.side === 'long' ? bt.entryPrice * 1.05 : bt.entryPrice * 0.95,
      status: 'closed',
      openedAt: bt.entryTimestamp,
      closedAt: bt.exitTimestamp,
      pnl: bt.pnl,
      pnlPct: bt.pnlPct,
      explanation: `Systematic ${bt.strategy.replace(/_/g, ' ')} execution triggered during historical ${bt.regime.replace(/_/g, ' ')} regime.`,
      regimeAtEntry: bt.regime,
      regimeConfidence: 78,
      source: 'live_simulated',
    });
    setIsTradeModalOpen(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6 max-w-7xl mx-auto"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-nexus-accent/10 border border-nexus-accent/30 text-nexus-accent">
              <FlaskConical size={18} />
            </span>
            <h1 className="text-xl font-display font-bold text-nexus-textPrimary tracking-tight">
              Quantitative Backtest Laboratory
            </h1>
          </div>
          <p className="text-xs font-mono text-nexus-textMuted mt-1">
            Replay the NEXUS 5-signal intelligence regime against historical Bitget market data.
          </p>
        </div>

        <span className="px-2.5 py-1 rounded text-xs font-mono bg-white/[0.03] border border-white/[0.08] text-nexus-textMuted self-start sm:self-auto">
          Track 2 Algorithmic Verification
        </span>
      </div>

      {/* Laboratory Controls Card */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-xs font-mono text-nexus-accent uppercase font-bold tracking-wider">
          <span>Simulation Configuration</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {/* Symbol */}
          <div>
            <label className="stat-label block mb-1.5">Asset Pair</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-mono text-nexus-textPrimary focus:border-nexus-accent/40 focus:outline-none"
              placeholder="BTCUSDT"
            />
          </div>

          {/* Granularity */}
          <div>
            <label className="stat-label block mb-1.5">Granularity</label>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-2 py-2 text-xs font-mono text-nexus-textPrimary focus:border-nexus-accent/40 focus:outline-none"
            >
              <option value="1m">1m (High Precision)</option>
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="1h">1h (Recommended)</option>
              <option value="4h">4h (Swing Trend)</option>
              <option value="1d">1d (Macro Daily)</option>
            </select>
          </div>

          {/* Historical Period */}
          <div>
            <label className="stat-label block mb-1.5">Historical Period</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-2 py-2 text-xs font-mono text-nexus-textPrimary focus:border-nexus-accent/40 focus:outline-none"
            >
              <option value={7}>7 days (Fast)</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days (Standard)</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days (Quarter)</option>
            </select>
          </div>

          {/* Initial Capital */}
          <div>
            <label className="stat-label block mb-1.5">Starting Capital</label>
            <input
              type="number"
              value={initialCapital}
              onChange={(e) => setInitialCapital(Number(e.target.value))}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-mono text-nexus-textPrimary focus:border-nexus-accent/40 focus:outline-none"
            />
          </div>

          {/* Action Button */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-1 flex items-end">
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="w-full py-2.5 px-4 rounded-lg bg-nexus-accent/15 border border-nexus-accent/40 text-nexus-accent font-display font-bold text-xs flex items-center justify-center gap-2 hover:bg-nexus-accent/25 transition-all disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {isRunning ? (
                <>
                  <LoadingSpinner size="sm" /> Simulating...
                </>
              ) : (
                <>
                  <Play size={13} fill="currentColor" /> Run Backtest
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3.5 rounded-lg bg-nexus-bear/10 border border-nexus-bear/30 text-nexus-bear text-xs font-mono flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Results Workspace */}
      {result && (
        <div className="space-y-6">
          {/* 1. EXECUTIVE SUMMARY CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              label="INITIAL CAPITAL"
              value={`$${initialCapital.toLocaleString()}`}
              icon={BarChart3}
            />
            <StatCard
              label="FINAL CAPITAL"
              value={`$${Math.round(initialCapital * (1 + result.totalReturnPct)).toLocaleString()}`}
              trend={result.totalReturnPct >= 0 ? 'up' : 'down'}
              subvalue={result.totalReturnPct >= 0 ? '▲ Profit' : '▼ Loss'}
              icon={TrendingUp}
            />
            <StatCard
              label="NET RETURN"
              value={formatPct(result.totalReturnPct * 100)}
              trend={result.totalReturnPct >= 0 ? 'up' : 'down'}
              icon={Percent}
            />
            <StatCard
              label="WIN RATE"
              value={formatPct(result.winRate * 100)}
              subvalue={`${result.totalTrades} total trades`}
              icon={Target}
            />
            <StatCard
              label="PROFIT FACTOR"
              value={result.profitFactor > 0 ? result.profitFactor.toFixed(2) : '0.00'}
              subvalue={result.profitFactor > 1.5 ? 'Institutional' : 'Calibrated'}
              icon={BarChart3}
            />
            <StatCard
              label="MAX DRAWDOWN"
              value={formatPct(result.maxDrawdown * 100)}
              subvalue="Peak-to-trough"
              trend="down"
              icon={ShieldAlert}
            />
          </div>

          {/* 2. INTERACTIVE EQUITY CURVE */}
          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-nexus-accent" />
                <h3 className="text-sm font-display font-bold text-nexus-textPrimary">
                  Historical Portfolio Equity Curve
                </h3>
              </div>
              <span className="text-[11px] font-mono text-nexus-textMuted">
                {result.equityCurve.length} Evaluation Snapshots
              </span>
            </div>

            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={result.equityCurve}>
                  <defs>
                    <linearGradient id="backtestEquity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#00F0FF" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(v) => new Date(v).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    stroke="#64748B"
                    fontSize={10}
                    fontFamily="monospace"
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tickFormatter={(v) => `$${Math.round(v)}`}
                    stroke="#64748B"
                    fontSize={10}
                    fontFamily="monospace"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0C1017',
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      fontSize: 11,
                      fontFamily: 'monospace',
                    }}
                    formatter={(val: any) => [`$${Number(val).toFixed(2)}`, 'Portfolio Value']}
                    labelFormatter={(label) => formatTimestamp(Number(label))}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#00F0FF"
                    strokeWidth={2}
                    fill="url(#backtestEquity)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3. HISTORICAL MARKET CHART WITH TRADE ANNOTATIONS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="stat-label text-xs uppercase font-mono">
                Interactive Market Replay & Trade Markers
              </span>
              <span className="text-[10px] font-mono text-nexus-textMuted">
                Click any trade marker or table row for full entry/exit parameters
              </span>
            </div>
            <MarketChart
              symbol={result.symbol}
              defaultTimeframe={granularity}
            />
          </div>

          {/* 4. STRATEGY & REGIME BREAKDOWN */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Strategy Breakdown */}
            <div className="glass-card p-4 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-white/[0.06]">
                <Layers size={14} className="text-nexus-accent" />
                <h4 className="text-xs font-display font-bold text-nexus-textPrimary">
                  Performance by Strategy
                </h4>
              </div>
              <div className="space-y-2 font-mono text-xs">
                {Object.entries(result.strategyBreakdown || {}).map(([strat, val]) => {
                  const stats = val as { count: number; winRate: number; avgPnl: number };
                  return (
                    <div
                      key={strat}
                      className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] flex items-center justify-between"
                    >
                      <div>
                        <span className="text-nexus-textPrimary font-semibold capitalize block">
                          {strat.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] text-nexus-textMuted">
                          {stats.count} executions • Win rate: {(stats.winRate * 100).toFixed(1)}%
                        </span>
                      </div>
                      <span className={`font-bold ${stats.avgPnl >= 0 ? 'text-nexus-bull' : 'text-nexus-bear'}`}>
                        {stats.avgPnl >= 0 ? `+$${stats.avgPnl.toFixed(2)}` : `-$${Math.abs(stats.avgPnl).toFixed(2)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Regime Distribution */}
            <div className="glass-card p-4 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-white/[0.06]">
                <Clock size={14} className="text-nexus-accent" />
                <h4 className="text-xs font-display font-bold text-nexus-textPrimary">
                  Market Regime Distribution
                </h4>
              </div>
              <div className="space-y-2 font-mono text-xs">
                {Object.entries(result.regimeDistribution || {}).map(([regime, val]) => {
                  const count = Number(val);
                  return (
                    <div
                      key={regime}
                      className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] flex items-center justify-between"
                    >
                      <span className="text-nexus-textPrimary capitalize">
                        {regime.replace(/_/g, ' ')}
                      </span>
                      <span className="text-nexus-accent font-semibold">
                        {count} intervals ({((count / (result.equityCurve.length || 1)) * 100).toFixed(0)}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 5. HISTORICAL TRADE LEDGER */}
          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <BarChart3 size={16} className="text-nexus-accent" />
                <h3 className="text-sm font-display font-bold text-nexus-textPrimary">
                  Historical Trade Execution Ledger ({result.trades.length})
                </h3>
              </div>
              <span className="text-[11px] font-mono text-nexus-textMuted">
                Deterministic SL / TP Execution
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-nexus-textMuted text-[10px] uppercase">
                    <th className="pb-2.5">Side</th>
                    <th className="pb-2.5">Strategy</th>
                    <th className="pb-2.5">Entry Price</th>
                    <th className="pb-2.5">Exit Price</th>
                    <th className="pb-2.5">Net P&L</th>
                    <th className="pb-2.5">Return</th>
                    <th className="pb-2.5">Regime</th>
                    <th className="pb-2.5">Time</th>
                    <th className="pb-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {result.trades.map((t, idx) => {
                    const isLong = t.side === 'long';
                    const isProfit = t.pnl >= 0;

                    return (
                      <tr
                        key={idx}
                        onClick={() => openTradeInspection(t, idx)}
                        className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                      >
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                              isLong
                                ? 'bg-nexus-bull/15 text-nexus-bull border-nexus-bull/30'
                                : 'bg-nexus-bear/15 text-nexus-bear border-nexus-bear/30'
                            }`}
                          >
                            {t.side}
                          </span>
                        </td>
                        <td className="py-2.5 text-nexus-textPrimary capitalize">
                          {t.strategy.replace(/_/g, ' ')}
                        </td>
                        <td className="py-2.5 text-nexus-textPrimary font-medium">
                          {formatPrice(t.entryPrice)}
                        </td>
                        <td className="py-2.5 text-nexus-textPrimary font-medium">
                          {formatPrice(t.exitPrice)}
                        </td>
                        <td className={`py-2.5 font-bold ${isProfit ? 'text-nexus-bull' : 'text-nexus-bear'}`}>
                          {isProfit ? `+$${t.pnl.toFixed(2)}` : `-$${Math.abs(t.pnl).toFixed(2)}`}
                        </td>
                        <td className={`py-2.5 font-semibold ${isProfit ? 'text-nexus-bull' : 'text-nexus-bear'}`}>
                          {formatPct(t.pnlPct * 100)}
                        </td>
                        <td className="py-2.5 text-nexus-textMuted capitalize">
                          {t.regime.replace(/_/g, ' ')}
                        </td>
                        <td className="py-2.5 text-[10px] text-nexus-textMuted">
                          {new Date(t.entryTimestamp).toLocaleDateString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2.5 text-right">
                          <span className="text-nexus-accent opacity-0 group-hover:opacity-100 transition-opacity text-[11px] flex items-center justify-end gap-1">
                            Inspect <ChevronRight size={12} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Trade Inspection Modal */}
      <TradeDetailModal
        trade={selectedTrade}
        isOpen={isTradeModalOpen}
        onClose={() => setIsTradeModalOpen(false)}
      />
    </motion.div>
  );
}
