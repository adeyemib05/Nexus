import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useNexusStore } from '../../store';
import { useRelativeTime } from '../../hooks/useRelativeTime';
import { formatPrice, formatPct } from '../../lib/utils';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/intelligence': 'Intelligence',
  '/performance': 'Performance',
  '/settings': 'Settings',
};

export default function Header() {
  const location = useLocation();
  const ticker = useNexusStore((s) => s.ticker);
  const isConnected = useNexusStore((s) => s.isConnected);
  const lastUpdate = useNexusStore((s) => s.lastUpdate);
  const relativeTime = useRelativeTime(lastUpdate);

  const title = PAGE_TITLES[location.pathname] || 'Dashboard';

  return (
    <header className="h-14 border-b border-white/[0.06] flex items-center px-6 gap-4 bg-nexus-depth/50 flex-shrink-0">
      <span className="font-display font-semibold text-nexus-textPrimary text-sm">{title}</span>

      <div className="flex-1 flex justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={ticker ? ticker.price.toFixed(0) : 'none'}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-2"
          >
            {ticker ? (
              <>
                <span className="text-nexus-textMuted text-xs font-display font-medium">BTC</span>
                <span className="price-value font-medium text-sm">{formatPrice(ticker.price)}</span>
                <span className={ticker.changePct24h >= 0 ? 'text-nexus-bull text-xs' : 'text-nexus-bear text-xs'}>
                  {formatPct(ticker.changePct24h)}
                </span>
              </>
            ) : (
              <span className="text-nexus-textMuted text-sm">BTC ——</span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-nexus-bull animate-pulse' : 'bg-nexus-bear'}`} />
          <span className="text-[10px] font-display tracking-widest uppercase text-nexus-textMuted">
            {isConnected ? 'LIVE' : 'OFF'}
          </span>
        </div>
        <span className="stat-label hidden md:block">Updated {relativeTime}</span>
      </div>
    </header>
  );
}
