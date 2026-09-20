import { useEffect, useRef } from 'react';
import { useNexusStore } from '../store';
import {
  getTicker,
  getAgentState,
  getSignals,
  getCurrentRegime,
  getTrades,
  getPerformance,
} from '../lib/api';

const TICKER_INTERVAL_VISIBLE_MS = 3500;
const TICKER_INTERVAL_HIDDEN_MS = 15000;
const AGENT_INTERVAL_MS = 8000;
const SIGNALS_INTERVAL_MS = 20000;

export function useSSE() {
  const store = useNexusStore();
  const isFetchingTicker = useRef(false);
  const isFetchingState = useRef(false);
  const isFetchingSignals = useRef(false);
  const consecutiveErrors = useRef(0);

  useEffect(() => {
    let tickerTimer: ReturnType<typeof setTimeout> | null = null;
    let agentTimer: ReturnType<typeof setTimeout> | null = null;
    let signalsTimer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    // 1. Ticker Poller (Fast Cadence for Live Market Feel)
    const pollTicker = async () => {
      if (isFetchingTicker.current || !isMounted) return;
      isFetchingTicker.current = true;
      try {
        const res = await getTicker();
        if (isMounted && res.success && res.data) {
          store.setTicker(res.data);
          store.setLastUpdate(Date.now());
          store.setIsConnected(true);
          consecutiveErrors.current = 0;
        } else if (isMounted) {
          consecutiveErrors.current += 1;
          if (consecutiveErrors.current >= 3) {
            store.setIsConnected(false);
          }
        }
      } catch {
        if (isMounted) {
          consecutiveErrors.current += 1;
          if (consecutiveErrors.current >= 3) {
            store.setIsConnected(false);
          }
        }
      } finally {
        isFetchingTicker.current = false;
        if (isMounted) {
          const delay = document.hidden ? TICKER_INTERVAL_HIDDEN_MS : TICKER_INTERVAL_VISIBLE_MS;
          tickerTimer = setTimeout(pollTicker, delay);
        }
      }
    };

    // 2. Agent State Poller (Synchronizes Cycles & Execution State)
    const pollAgentState = async () => {
      if (isFetchingState.current || !isMounted) return;
      isFetchingState.current = true;
      try {
        const res = await getAgentState();
        if (isMounted && res.success && res.data) {
          store.setAgentState(res.data);
          if (res.data.currentRegime) {
            store.setCurrentRegime(res.data.currentRegime);
            if (res.data.currentRegime.signals) {
              store.setSignals(res.data.currentRegime.signals);
            }
          }
        }
      } catch (err) {
        console.warn('[useLiveStream] Agent state poll error:', err);
      } finally {
        isFetchingState.current = false;
        if (isMounted) {
          const delay = document.hidden ? AGENT_INTERVAL_MS * 2 : AGENT_INTERVAL_MS;
          agentTimer = setTimeout(pollAgentState, delay);
        }
      }
    };

    // 3. Signals & Trades Poller (Broad Telemetry Refresh)
    const pollSignalsAndTrades = async () => {
      if (isFetchingSignals.current || !isMounted) return;
      isFetchingSignals.current = true;
      try {
        const [sigRes, regRes, tradeRes, perfRes] = await Promise.allSettled([
          getSignals(),
          getCurrentRegime(),
          getTrades(30),
          getPerformance(),
        ]);

        if (isMounted) {
          if (sigRes.status === 'fulfilled' && sigRes.value.success && sigRes.value.data) {
            store.setSignals(sigRes.value.data);
          }
          if (regRes.status === 'fulfilled' && regRes.value.success && regRes.value.data) {
            store.setCurrentRegime(regRes.value.data);
          }
          if (tradeRes.status === 'fulfilled' && tradeRes.value.success && tradeRes.value.data) {
            store.setTrades(tradeRes.value.data);
          }
          if (perfRes.status === 'fulfilled' && perfRes.value.success && perfRes.value.data) {
            store.setPerformance(perfRes.value.data);
          }
        }
      } catch (err) {
        console.warn('[useLiveStream] Telemetry poll error:', err);
      } finally {
        isFetchingSignals.current = false;
        if (isMounted) {
          signalsTimer = setTimeout(pollSignalsAndTrades, SIGNALS_INTERVAL_MS);
        }
      }
    };

    // 4. Tab Visibility Listener
    const handleVisibilityChange = () => {
      if (!document.hidden && isMounted) {
        // Tab became active: trigger immediate fast poll
        if (tickerTimer) clearTimeout(tickerTimer);
        if (agentTimer) clearTimeout(agentTimer);
        pollTicker();
        pollAgentState();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial triggers
    tickerTimer = setTimeout(pollTicker, 500);
    agentTimer = setTimeout(pollAgentState, 1500);
    signalsTimer = setTimeout(pollSignalsAndTrades, 5000);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (tickerTimer) clearTimeout(tickerTimer);
      if (agentTimer) clearTimeout(agentTimer);
      if (signalsTimer) clearTimeout(signalsTimer);
    };
  }, []);
}
