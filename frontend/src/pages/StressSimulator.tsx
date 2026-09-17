import { useState, useEffect, useMemo, useCallback } from 'react';
import { LUIIntentBar } from '../components/stress/LUIIntentBar';
import { PreFlightVerdict } from '../components/stress/PreFlightVerdict';
import { StressConeChart } from '../components/stress/StressConeChart';
import { CascadeImpactMatrix } from '../components/stress/CascadeImpactMatrix';
import { HistoricalAnalogsView } from '../components/stress/HistoricalAnalogsView';
import { ActionPlaybook } from '../components/stress/ActionPlaybook';
import { ShareModal } from '../components/stress/ShareModal';
import { POPULAR_EQUITIES, STRESS_SCENARIOS } from '../data/blackSwans';
import { calculateStressTest } from '../services/stressEngine';
import { fetchQwenCascadeReasoning } from '../services/qwenEngine';
import { EquityData, StressScenario, ShockSeverity, StressResult, QwenAnalysisResponse } from '../types';
import { ShieldCheck, Share2 } from 'lucide-react';

export default function StressSimulator() {
  // Core States
  const [activeSymbol, setActiveSymbol] = useState<string>('NVDA');
  const [scenario, setScenario] = useState<StressScenario>(STRESS_SCENARIOS[1]); // Mega-Cap AI Capex Miss
  const [positionUsd, setPositionUsd] = useState<number>(25000);
  const [severity, setSeverity] = useState<ShockSeverity>('severe');
  const [userThesis, setUserThesis] = useState<string>(
    'Long $25k rNVDA into weekend close, stress-test against AI guidance miss'
  );

  // AI State & Modal
  const [qwenReasoning, setQwenReasoning] = useState<QwenAnalysisResponse | undefined>(undefined);
  const [isLoadingQwen, setIsLoadingQwen] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);

  // Active Equity Data
  const equity: EquityData = useMemo(() => {
    return POPULAR_EQUITIES[activeSymbol] || POPULAR_EQUITIES['NVDA'];
  }, [activeSymbol]);

  // Synchronous Core Stress Calculation (Zero-Lag)
  const stressResult: StressResult = useMemo(() => {
    const res = calculateStressTest(equity, scenario, positionUsd, severity);
    return {
      ...res,
      qwenReasoning,
    };
  }, [equity, scenario, positionUsd, severity, qwenReasoning]);

  // Asynchronously trigger Qwen 3.8 Max Reasoning
  const triggerQwenReasoning = useCallback(async (baseResult: StressResult, thesis: string) => {
    setIsLoadingQwen(true);
    try {
      const qwenData = await fetchQwenCascadeReasoning(baseResult, thesis);
      setQwenReasoning(qwenData);
    } catch (e) {
      console.error('Error fetching Qwen reasoning:', e);
    } finally {
      setIsLoadingQwen(false);
    }
  }, []);

  // Run reasoning on initial load and when key params change
  useEffect(() => {
    const currentBase = calculateStressTest(equity, scenario, positionUsd, severity);
    triggerQwenReasoning(currentBase, userThesis);
  }, [activeSymbol, scenario.id, triggerQwenReasoning]);

  // Handler for custom natural language query
  const handleRunAnalysis = (newThesis: string) => {
    setUserThesis(newThesis);
    const currentBase = calculateStressTest(equity, scenario, positionUsd, severity);
    triggerQwenReasoning(currentBase, newThesis);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Asset & Quick Selector Strip */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-nexus-accent/10 text-nexus-accent border border-nexus-accent/30 tracking-wider uppercase">
              <ShieldCheck className="w-3.5 h-3.5 text-nexus-accent" />
              Pre-Flight Mission Control
            </span>
            <span className="text-xs font-mono text-gray-500">
              Track 3 · AI Trading Desk (Decision Stress Testing)
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-white">
            7×24 Pre-Trade Stress Simulator
          </h1>
          <p className="text-sm text-nexus-textSecondary mt-1 max-w-2xl leading-relaxed">
            When tokenized US stocks turn trading into 7×24, humans sleep — markets don't. Stress-test your position against weekend liquidity shocks and empirical black swans before entering.
          </p>
        </div>

        {/* Selected Asset Pill & Share Trigger */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          <div className="flex items-center gap-1 bg-[#0C1220] p-1 rounded-xl border border-white/[0.08]">
            {(['NVDA', 'AAPL', 'TSLA', 'MSFT', 'COIN', 'MSTR'] as const).map((sym) => (
              <button
                key={sym}
                onClick={() => setActiveSymbol(sym)}
                className={`px-2.5 py-1 text-xs font-mono rounded-lg transition-all cursor-pointer ${
                  activeSymbol === sym
                    ? 'bg-nexus-accent text-black font-bold shadow-[0_0_12px_rgba(0,200,255,0.4)]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsShareModalOpen(true)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-nexus-accent hover:text-white transition-all cursor-pointer"
            title="Share to X (#BitgetHackathon)"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* LUI Intent Search & Scenario Selector */}
      <LUIIntentBar
        equity={equity}
        scenario={scenario}
        positionUsd={positionUsd}
        onUpdateEquity={setActiveSymbol}
        onUpdateScenario={setScenario}
        onUpdatePosition={setPositionUsd}
        onRunAnalysis={handleRunAnalysis}
        isLoading={isLoadingQwen}
      />

      {/* Pre-Flight Verdict & Financial Telemetry */}
      <PreFlightVerdict
        result={stressResult}
        equity={equity}
      />

      {/* Core Analytics Grid: Stress Cone & Qwen Transmission Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: 7-Day Stress Cone & Interactive Scrubber */}
        <div className="lg:col-span-7">
          <StressConeChart
            result={stressResult}
            activeSeverity={severity}
            onUpdateSeverity={setSeverity}
          />
        </div>

        {/* Right: Cascade Transmission Matrix (Qwen 3.8 Max) */}
        <div className="lg:col-span-5">
          <CascadeImpactMatrix
            symbol={equity.symbol}
            qwenReasoning={qwenReasoning}
            isLoading={isLoadingQwen}
          />
        </div>
      </div>

      {/* Retrieved Historical Analogs */}
      <HistoricalAnalogsView
        analogs={stressResult.analogs}
        symbol={equity.symbol}
      />

      {/* Actionable Execution Playbook */}
      <ActionPlaybook
        result={stressResult}
        onOpenShareModal={() => setIsShareModalOpen(true)}
      />

      {/* 1-Click Viral X Share Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        result={stressResult}
        equity={equity}
      />
    </div>
  );
}
