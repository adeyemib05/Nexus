import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingScreen from './components/LoadingScreen';
import Dashboard from './pages/Dashboard';
import Intelligence from './pages/Intelligence';
import Performance from './pages/Performance';
import Settings from './pages/Settings';
import { useSSE } from './hooks/useSSE';
import { useNexusStore } from './store';
import {
  getAgentState,
  getSignals,
  getCurrentRegime,
  getTrades,
  getPerformance,
  getEquityCurve,
  getTicker,
} from './lib/api';

export default function App() {
  useSSE();
  const store = useNexusStore();
  const isConnected = useNexusStore((s) => s.isConnected);
  const [showLoading, setShowLoading] = useState(true);

  // Initial one-time data fetch — SSE keeps everything live after this
  useEffect(() => {
    Promise.allSettled([
      getAgentState().then((r) => r.success && r.data && store.setAgentState(r.data)),
      getSignals().then((r) => r.success && r.data && store.setSignals(r.data)),
      getCurrentRegime().then((r) => r.success && r.data && store.setCurrentRegime(r.data)),
      getTrades(30).then((r) => r.success && r.data && store.setTrades(r.data)),
      getPerformance().then((r) => r.success && r.data && store.setPerformance(r.data)),
      getEquityCurve(100).then((r) => r.success && r.data && store.setEquityCurve(r.data)),
      getTicker().then((r) => r.success && r.data && store.setTicker(r.data)),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show the loading screen for at least 2s, or until SSE connects — whichever is first to feel right
  useEffect(() => {
    const timer = setTimeout(() => setShowLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isConnected) setShowLoading(false);
  }, [isConnected]);

  if (showLoading) return <LoadingScreen />;

  return (
    <ErrorBoundary>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/intelligence" element={<Intelligence />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </Router>
    </ErrorBoundary>
  );
}
