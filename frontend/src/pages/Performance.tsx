import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { useNexusStore } from '../store';
import StatCard from '../components/ui/StatCard';
import Badge from '../components/ui/Badge';
import ProgressBar from '../components/ui/ProgressBar';
import { getTradeStats } from '../lib/api';
import { formatPrice, formatPct, formatTimestamp, formatDuration } from '../lib/utils';
import type { Trade } from '../types';

type FilterKey = 'all' | 'long' | 'short' | 'open' | 'closed';

interface TradeStats {
  totalTrades: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  strategyBreakdown: Record<string, { count: number; winRate: number; avgPnl: number }>;
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'long', label: 'Long' },
  { key: 'short', label: 'Short' },
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
];

export default function Performance() {
  const trades = useNexusStore((s) => s.trades);
  const performance = useNexusStore((s) => s.performance);
  const equityCurve = useNexusStore((s) => s.equityCurve);
  const [tradeStats, setTradeStats] = useState<TradeStats | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  useEffect(() => {
    getTradeStats().then((res) => {
      if (res.success && res.data) setTradeStats(res.data as TradeStats);
    });
  }, []);

  const filteredTrades = trades.filter((t) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'long' || activeFilter === 'short') return t.side === activeFilter;
    return t.status === activeFilter;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* KPI ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="PORTFOLIO VALUE" value={formatPrice(performance?.portfolioValue || 10000)} />
        <StatCard
          label="TOTAL P&L"
          value={formatPrice(Math.abs(performance?.totalPnl || 0))}
          trend={(performance?.totalPnl || 0) >= 0 ? 'up' : 'down'}
        />
        <StatCard label="WIN RATE" value={formatPct((performance?.winRate || 0) * 100)} />
        <StatCard label="SHARPE RATIO" value={(performance?.sharpeRatio || 0).toFixed(2)} />
        <StatCard label="MAX DRAWDOWN" value={formatPct((performance?.maxDrawdown || 0) * 100)} />
      </div>

      {/* EQUITY CURVE */}
      <div className="glass-card p-5">
        <h3 className="font-display font-semibold text-sm text-nexus-textPrimary mb-4">Portfolio Equity Curve</h3>
        {equityCurve.length < 2 ? (
          <div className="h-[280px] flex items-center justify-center text-nexus-textMuted text-sm">
            Accumulating equity data...
          </div>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(ts) => formatTimestamp(ts)}
                  tick={{ fontSize: 10, fill: '#475569' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                  tick={{ fontSize: 10, fill: '#475569' }}
                  axisLine={false}
                  tickLine={false}
                  domain={['auto', 'auto']}
                />
                <RechartsTooltip
                  contentStyle={{
                    background: '#0C1220',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelFormatter={(ts) => formatTimestamp(Number(ts))}
                  formatter={(v) => [formatPrice(Number(v)), 'Portfolio']}
                />
                <ReferenceLine y={10000} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="value" stroke="#10B981" strokeWidth={2} fill="url(#eq)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* TWO COLUMNS */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* LEFT — TRADE LOG */}
        <div className="lg:col-span-7">
          <div className="flex gap-2 mb-4 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-display font-medium transition-all ${
                  activeFilter === f.key
                    ? 'bg-nexus-accent/15 text-nexus-accent border border-nexus-accent/30'
                    : 'glass-card border border-white/[0.06] text-nexus-textSecondary'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="glass-card overflow-hidden overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-nexus-surface/50">
                  {['Side', 'Strategy', 'Entry', 'Exit/Current', 'P&L', 'Duration', 'Regime'].map((h) => (
                    <th key={h} className="stat-label text-left py-2.5 px-3 font-normal whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTrades.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-nexus-textMuted">
                      No trades match this filter
                    </td>
                  </tr>
                ) : (
                  filteredTrades.map((t) => {
                    const duration = t.closedAt ? t.closedAt - t.openedAt : Date.now() - t.openedAt;
                    const pnlPct = (t.pnlPct || 0) * 100;
                    return (
                      <tr key={t.id} className="hover:bg-white/[0.02] transition border-t border-white/[0.04]">
                        <td className="py-2.5 px-3">
                          <Badge variant={t.side === 'long' ? 'bullish' : 'bearish'}>{t.side}</Badge>
                        </td>
                        <td className="py-2.5 px-3 text-nexus-textSecondary capitalize whitespace-nowrap">
                          {t.strategy.replace(/_/g, ' ')}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-nexus-textPrimary tabular-nums">
                          {formatPrice(t.entryPrice)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-nexus-textPrimary tabular-nums">
                          {t.exitPrice ? formatPrice(t.exitPrice) : '—'}
                        </td>
                        <td
                          className={`py-2.5 px-3 font-mono tabular-nums ${
                            (t.pnl || 0) >= 0 ? 'text-nexus-bull' : 'text-nexus-bear'
                          }`}
                        >
                          {t.status === 'closed' ? formatPct(pnlPct) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-nexus-textSecondary font-mono whitespace-nowrap">
                          {formatDuration(duration)}
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant="default" className="text-[9px]">
                            {t.regimeAtEntry.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-card p-4">
            <h3 className="font-display font-semibold text-sm text-nexus-textPrimary mb-3">Strategy Performance</h3>
            {!tradeStats || Object.keys(tradeStats.strategyBreakdown).length === 0 ? (
              <div className="text-xs text-nexus-textMuted text-center py-4">No closed trades yet</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(tradeStats.strategyBreakdown).map(([strategy, stats]) => (
                  <div key={strategy} className="glass-card p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-display text-nexus-textPrimary capitalize">
                        {strategy.replace(/_/g, ' ')}
                      </span>
                      <Badge variant="default">{stats.count}</Badge>
                    </div>
                    <ProgressBar value={stats.winRate} color={stats.winRate > 0.5 ? '#10B981' : '#EF4444'} />
                    <div className="font-mono text-xs text-nexus-textSecondary mt-1.5">
                      Avg PnL: {formatPrice(stats.avgPnl)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card p-3 border border-nexus-bull/30 bg-nexus-bull/5">
              <div className="stat-label text-nexus-bull">BEST TRADE</div>
              {tradeStats?.bestTrade ? (
                <>
                  <div className="font-mono font-bold text-nexus-bull mt-1">
                    {formatPrice(tradeStats.bestTrade.pnl || 0)}
                  </div>
                  <div className="text-[10px] text-nexus-textSecondary mt-1 capitalize">
                    {tradeStats.bestTrade.strategy.replace(/_/g, ' ')} @ {formatPrice(tradeStats.bestTrade.entryPrice)}
                  </div>
                </>
              ) : (
                <div className="text-xs text-nexus-textMuted mt-2">—</div>
              )}
            </div>

            <div className="glass-card p-3 border border-nexus-bear/30 bg-nexus-bear/5">
              <div className="stat-label text-nexus-bear">WORST TRADE</div>
              {tradeStats?.worstTrade ? (
                <>
                  <div className="font-mono font-bold text-nexus-bear mt-1">
                    {formatPrice(tradeStats.worstTrade.pnl || 0)}
                  </div>
                  <div className="text-[10px] text-nexus-textSecondary mt-1 capitalize">
                    {tradeStats.worstTrade.strategy.replace(/_/g, ' ')} @ {formatPrice(tradeStats.worstTrade.entryPrice)}
                  </div>
                </>
              ) : (
                <div className="text-xs text-nexus-textMuted mt-2">—</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
