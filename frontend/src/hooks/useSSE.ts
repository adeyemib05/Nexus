import { useEffect, useRef } from 'react';
import { useNexusStore } from '../store';
import { SSE_URL } from '../lib/api';

export function useSSE() {
  const store = useNexusStore();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const connect = () => {
      const es = new EventSource(SSE_URL());
      esRef.current = es;

      es.addEventListener('connected', () => store.setIsConnected(true));

      es.addEventListener('agent_state', (e: MessageEvent) => {
        store.setAgentState(JSON.parse(e.data));
      });

      es.addEventListener('regime_updated', (e: MessageEvent) => {
        const r = JSON.parse(e.data);
        store.setCurrentRegime(r);
        store.setSignals(r.signals || []);
      });

      es.addEventListener('trade_opened', (e: MessageEvent) => {
        store.addTrade(JSON.parse(e.data));
      });

      es.addEventListener('trade_closed', () => {
        // Trade list refreshes via the next agent_state / cycle_complete event
      });

      es.addEventListener('cycle_complete', (e: MessageEvent) => {
        const s = JSON.parse(e.data);
        store.setAgentState(s);
        store.setLastUpdate(Date.now());
      });

      es.addEventListener('ticker_update', (e: MessageEvent) => {
        store.setTicker(JSON.parse(e.data));
      });

      es.addEventListener('trades', (e: MessageEvent) => {
        store.setTrades(JSON.parse(e.data));
      });

      es.addEventListener('performance', (e: MessageEvent) => {
        const p = JSON.parse(e.data);
        if (p) store.setPerformance(p);
      });

      es.onerror = () => {
        store.setIsConnected(false);
        es.close();
        setTimeout(connect, 4000); // reconnect after 4s
      };
    };

    connect();
    return () => esRef.current?.close();
  }, []);
}
