import { create } from 'zustand';
import type {
  AgentState,
  SignalReading,
  RegimeReading,
  Trade,
  PerformanceSnapshot,
  PriceTicker,
  BacktestResult
} from '../types';

interface NexusStore {
  agentState: AgentState | null;
  signals: SignalReading[];
  currentRegime: RegimeReading | null;
  trades: Trade[];
  performance: PerformanceSnapshot | null;
  ticker: PriceTicker | null;
  isConnected: boolean;
  lastUpdate: number;
  equityCurve: Array<{ timestamp: number; value: number }>;
  backtestResults: BacktestResult[];
  regimeHistory: RegimeReading[];

  setAgentState: (state: AgentState | null) => void;
  setSignals: (signals: SignalReading[]) => void;
  setCurrentRegime: (regime: RegimeReading | null) => void;
  setTrades: (trades: Trade[]) => void;
  addTrade: (trade: Trade) => void;
  setPerformance: (performance: PerformanceSnapshot | null) => void;
  setTicker: (ticker: PriceTicker | null) => void;
  setIsConnected: (isConnected: boolean) => void;
  setLastUpdate: (lastUpdate: number) => void;
  setEquityCurve: (equityCurve: Array<{ timestamp: number; value: number }>) => void;
  setBacktestResults: (results: BacktestResult[]) => void;
  setRegimeHistory: (history: RegimeReading[]) => void;
}

export const useNexusStore = create<NexusStore>((set) => ({
  agentState: null,
  signals: [],
  currentRegime: null,
  trades: [],
  performance: null,
  ticker: null,
  isConnected: false,
  lastUpdate: Date.now(),
  equityCurve: [],
  backtestResults: [],
  regimeHistory: [],

  setAgentState: (agentState) => set({ agentState }),
  setSignals: (signals) => set({ signals }),
  setCurrentRegime: (currentRegime) => set({ currentRegime }),
  setTrades: (trades) => set({ trades }),
  addTrade: (trade) => set((state) => ({ trades: [trade, ...state.trades] })),
  setPerformance: (performance) => set({ performance }),
  setTicker: (ticker) => set({ ticker }),
  setIsConnected: (isConnected) => set({ isConnected }),
  setLastUpdate: (lastUpdate) => set({ lastUpdate }),
  setEquityCurve: (equityCurve) => set({ equityCurve }),
  setBacktestResults: (backtestResults) => set({ backtestResults }),
  setRegimeHistory: (regimeHistory) => set({ regimeHistory }),
}));
