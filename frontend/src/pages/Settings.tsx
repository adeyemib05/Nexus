import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart2 } from 'lucide-react';
import { useNexusStore } from '../store';
import Badge from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { useInterval } from '../hooks/useInterval';
import { getHealth, runBacktest, pauseAgent } from '../lib/api';
import { formatPct, formatDuration } from '../lib/utils';
import type { BacktestResult } from '../types';

interface HealthServices {
  bitgetWS: boolean;
  qwen: boolean;
  gemini: boolean;
  bitgetApi: boolean;
}

export default function Settings() {
  const agentState = useNexusStore((s) => s.agentState);

  const [symbol, setSymbol] = useState('BTCUSDT');
  const [cycleInterval, setCycleInterval] = useState(60);
  const [maxPosition, setMaxPosition] = useState(2);
  const [maxDrawdown, setMaxDrawdown] = useState(10);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');

  const [btSymbol, setBtSymbol] = useState('BTCUSDT');
  const [btGranularity, setBtGranularity] = useState('1H');
  const [btDays, setBtDays] = useState(30);
  const [isRunningBacktest, setIsRunningBacktest] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);

  const [services, setServices] = useState<HealthServices | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  async function fetchHealth() {
    const res = await getHealth();
    if (res.success && res.data) {
      const data = res.data as { services?: HealthServices };
      if (data.services) setServices(data.services);
    }
  }

  useEffect(() => {
    fetchHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useInterval(fetchHealth, 30000);

  function handleSave() {
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 2000);
  }

  async function handleRunBacktest() {
    setIsRunningBacktest(true);
    setBacktestResult(null);
    try {
      const res = await runBacktest({ symbol: btSymbol, granularity: btGranularity, days: btDays });
      if (res.success && res.data) setBacktestResult(res.data);
    } finally {
      setIsRunningBacktest(false);
    }
  }

  async function handleReset() {
    await pauseAgent();
    setShowResetConfirm(false);
    window.location.reload();
  }

  const SERVICE_ROWS: { key: keyof HealthServices; label: string }[] = [
    { key: 'bitgetApi', label: 'Bitget REST API' },
    { key: 'bitgetWS', label: 'Bitget WebSocket' },
    { key: 'qwen', label: 'Qwen API' },
    { key: 'gemini', label: 'Gemini API' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="grid lg:grid-cols-12 gap-6">
        {/* LEFT */}
        <div className="lg:col-span-7 space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-sm text-nexus-textPrimary">Agent Configuration</h3>
              <Badge variant="default">NEXUS v1.0.0</Badge>
            </div>

            <div className="space-y-5">
              <div>
                <label className="stat-label block mb-1.5">Trading Symbol</label>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono text-nexus-textPrimary focus:outline-none focus:border-nexus-accent/50"
                />
                <p className="text-[11px] text-nexus-textMuted mt-1">Primary trading pair monitored by NEXUS</p>
              </div>

              <div>
                <label className="stat-label block mb-1.5">Cycle Interval</label>
                <input
                  type="range"
                  min={30}
                  max={300}
                  step={10}
                  value={cycleInterval}
                  onChange={(e) => setCycleInterval(Number(e.target.value))}
                  className="w-full accent-nexus-accent"
                />
                <p className="text-[11px] text-nexus-textSecondary mt-1">{cycleInterval} seconds</p>
              </div>

              <div>
                <label className="stat-label block mb-1.5">Max Position Size</label>
                <input
                  type="range"
                  min={0.5}
                  max={5}
                  step={0.5}
                  value={maxPosition}
                  onChange={(e) => setMaxPosition(Number(e.target.value))}
                  className="w-full accent-nexus-accent"
                />
                <p className="text-[11px] text-nexus-textSecondary mt-1">{maxPosition}% of portfolio per trade</p>
              </div>

              <div>
                <label className="stat-label block mb-1.5">Max Drawdown Limit</label>
                <input
                  type="range"
                  min={5}
                  max={25}
                  step={1}
                  value={maxDrawdown}
                  onChange={(e) => setMaxDrawdown(Number(e.target.value))}
                  className="w-full accent-nexus-accent"
                />
                <p className="text-[11px] text-nexus-textSecondary mt-1">
                  {maxDrawdown}% — agent halts if portfolio drops this much
                </p>
                {maxDrawdown > 15 && (
                  <p className="text-[11px] text-nexus-bear mt-1">⚠ High drawdown tolerance — use with caution</p>
                )}
              </div>

              <div>
                <label className="stat-label block mb-1.5">Agent Mode</label>
                <div className="flex gap-2">
                  <button className="flex-1 py-2 rounded-lg text-xs font-display font-semibold bg-nexus-accent/15 text-nexus-accent border border-nexus-accent/30">
                    SIMULATION
                  </button>
                  <button
                    disabled
                    title="Available in production"
                    className="flex-1 py-2 rounded-lg text-xs font-display font-semibold bg-white/[0.02] text-nexus-textMuted border border-white/[0.06] cursor-not-allowed"
                  >
                    LIVE
                  </button>
                </div>
              </div>

              <button
                onClick={handleSave}
                className="w-full py-2.5 rounded-lg bg-nexus-accent text-nexus-void font-display font-bold text-sm transition-all hover:opacity-90"
              >
                {saveState === 'saved' ? 'Saved ✓' : 'Save Configuration'}
              </button>
              <p className="text-[10px] text-nexus-textMuted text-center">
                Settings apply locally to this dashboard session
              </p>
            </div>
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 size={15} className="text-nexus-accent" />
              <h3 className="font-display font-semibold text-sm text-nexus-textPrimary">Backtest Engine</h3>
            </div>
            <p className="stat-label mb-4">Verify NEXUS strategy on real Bitget historical data</p>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="stat-label block mb-1.5">Symbol</label>
                <select
                  value={btSymbol}
                  onChange={(e) => setBtSymbol(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-2 py-2 text-xs font-mono text-nexus-textPrimary"
                >
                  <option value="BTCUSDT">BTCUSDT</option>
                  <option value="ETHUSDT">ETHUSDT</option>
                  <option value="SOLUSDT">SOLUSDT</option>
                </select>
              </div>
              <div>
                <label className="stat-label block mb-1.5">Granularity</label>
                <select
                  value={btGranularity}
                  onChange={(e) => setBtGranularity(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-2 py-2 text-xs font-mono text-nexus-textPrimary"
                >
                  <option value="1H">1H</option>
                  <option value="4H">4H</option>
                  <option value="1D">1D</option>
                </select>
              </div>
              <div>
                <label className="stat-label block mb-1.5">Period</label>
                <select
                  value={btDays}
                  onChange={(e) => setBtDays(Number(e.target.value))}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-2 py-2 text-xs font-mono text-nexus-textPrimary"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleRunBacktest}
              disabled={isRunningBacktest}
              className="w-full py-2.5 rounded-lg bg-nexus-accent/10 border border-nexus-accent/30 text-nexus-accent font-display font-semibold text-sm flex items-center justify-center gap-2 hover:bg-nexus-accent/20 transition-all disabled:opacity-60"
            >
              {isRunningBacktest ? (
                <>
                  <LoadingSpinner size="sm" /> Running backtest...
                </>
              ) : (
                <>▶ Run Backtest</>
              )}
            </button>

            {backtestResult && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass-card p-4 mt-4 bg-nexus-bull/[0.03] border border-nexus-bull/20"
              >
                <div className="text-sm font-display font-semibold text-nexus-bull mb-3">Backtest Complete ✓</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="stat-label">Return</div>
                    <div className="font-mono text-sm text-nexus-textPrimary">
                      {formatPct(backtestResult.totalReturnPct * 100)}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Sharpe Ratio</div>
                    <div className="font-mono text-sm text-nexus-textPrimary">{backtestResult.sharpeRatio.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="stat-label">Win Rate</div>
                    <div className="font-mono text-sm text-nexus-textPrimary">
                      {formatPct(backtestResult.winRate * 100)}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Max Drawdown</div>
                    <div className="font-mono text-sm text-nexus-textPrimary">
                      {formatPct(backtestResult.maxDrawdown * 100)}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Total Trades</div>
                    <div className="font-mono text-sm text-nexus-textPrimary">{backtestResult.totalTrades}</div>
                  </div>
                  <div>
                    <div className="stat-label">Profit Factor</div>
                    <div className="font-mono text-sm text-nexus-textPrimary">{backtestResult.profitFactor.toFixed(2)}</div>
                  </div>
                </div>
                <div className="stat-label mt-3">
                  Data source: Bitget historical candles | {backtestResult.periodDays}d {backtestResult.granularity}
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-card p-5">
            <h3 className="font-display font-semibold text-sm text-nexus-textPrimary mb-3">API Connections</h3>
            <div className="space-y-2.5">
              {SERVICE_ROWS.map(({ key, label }) => {
                const connected = services?.[key] || false;
                return (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-nexus-bull' : 'bg-nexus-bear'}`} />
                      <span className="text-xs text-nexus-textSecondary">{label}</span>
                    </div>
                    <Badge variant={connected ? 'bullish' : 'bearish'}>{connected ? 'Connected' : 'Not Set'}</Badge>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="font-display font-semibold text-sm text-nexus-textPrimary mb-3">System Information</h3>
            <div className="space-y-2 text-xs">
              {[
                ['Version', 'NEXUS 1.0.0'],
                ['Build', 'Bitget Hackathon S1 2026'],
                ['Cycles Run', String(agentState?.cycleCount || 0)],
                ['Uptime', agentState?.startedAt ? formatDuration(Date.now() - agentState.startedAt) : '—'],
                ['Mode', 'Simulation'],
                ['Strategy', 'Adaptive Multi-Signal Regime'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-nexus-textMuted">{k}</span>
                  <span className="font-mono text-nexus-textPrimary">{v}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              {!showResetConfirm ? (
                <button
                  onClick={() => setShowResetConfirm(true)}
                  disabled={!agentState || agentState.status === 'idle'}
                  className="w-full py-2 rounded-lg border border-nexus-bear/30 text-nexus-bear text-xs font-display font-semibold hover:bg-nexus-bear/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Reset Agent
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-nexus-textSecondary text-center">Pause the agent and reload the dashboard?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleReset}
                      className="flex-1 py-2 rounded-lg bg-nexus-bear/15 border border-nexus-bear/30 text-nexus-bear text-xs font-display font-semibold"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setShowResetConfirm(false)}
                      className="flex-1 py-2 rounded-lg border border-white/[0.08] text-nexus-textSecondary text-xs font-display"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
