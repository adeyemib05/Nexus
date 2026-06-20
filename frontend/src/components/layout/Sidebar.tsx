import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Brain, BarChart2, Settings as SettingsIcon } from 'lucide-react';
import { useNexusStore } from '../../store';
import { cn } from '../../lib/utils';
import type { AgentStatus } from '../../types';

const NAV_ITEMS = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Intelligence', path: '/intelligence', icon: Brain },
  { name: 'Performance', path: '/performance', icon: BarChart2 },
  { name: 'Settings', path: '/settings', icon: SettingsIcon },
];

const STATUS_DOT: Record<AgentStatus, string> = {
  running: 'bg-nexus-bull animate-pulse',
  paused: 'bg-nexus-caution',
  halted: 'bg-nexus-bear',
  error: 'bg-nexus-bear',
  idle: 'bg-nexus-muted',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Same mark already approved in Layout.tsx — five signals converging into one decision.
function NexusLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 44 52" fill="none">
      <line x1="22" y1="26" x2="6" y2="8" stroke="#00C8FF" strokeWidth="1.5" opacity="0.85" />
      <line x1="22" y1="26" x2="6" y2="44" stroke="#00C8FF" strokeWidth="1.5" opacity="0.85" />
      <line x1="22" y1="26" x2="38" y2="4" stroke="#00C8FF" strokeWidth="1.5" opacity="0.6" />
      <line x1="22" y1="26" x2="38" y2="48" stroke="#00C8FF" strokeWidth="1.5" opacity="0.6" />
      <line x1="22" y1="26" x2="36" y2="26" stroke="#00C8FF" strokeWidth="1.5" opacity="0.4" />
      <circle cx="6" cy="8" r="3" fill="#00C8FF" />
      <circle cx="6" cy="44" r="3" fill="#00C8FF" />
      <circle cx="38" cy="4" r="2.5" fill="#00C8FF" opacity="0.7" />
      <circle cx="38" cy="48" r="2.5" fill="#00C8FF" opacity="0.7" />
      <circle cx="36" cy="26" r="2" fill="#00C8FF" opacity="0.5" />
      <circle cx="22" cy="26" r="5" fill="#00C8FF" />
    </svg>
  );
}

function NavLinks() {
  return (
    <>
      {NAV_ITEMS.map(({ name, path, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body transition-all duration-150',
              isActive
                ? 'bg-nexus-accent/[0.08] text-nexus-accent border-l-2 border-nexus-accent pl-[10px]'
                : 'text-nexus-textSecondary hover:text-nexus-textPrimary hover:bg-white/[0.04]'
            )
          }
        >
          <Icon size={17} className="flex-shrink-0" />
          <span>{name}</span>
        </NavLink>
      ))}
    </>
  );
}

export default function Sidebar() {
  const status = useNexusStore((s) => s.agentState?.status || 'idle');

  return (
    <>
      <aside className="hidden lg:flex w-[220px] flex-shrink-0 flex-col bg-nexus-depth border-r border-white/[0.06]">
        <div className="p-6 pb-4 flex items-center">
          <NexusLogo />
          <div className="ml-2.5">
            <div className="font-display font-bold text-white text-lg tracking-wider leading-none">NEXUS</div>
            <div className="font-display text-[9px] text-nexus-accent tracking-[0.25em] font-medium uppercase mt-1">
              Trading Intel
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.06] mx-4" />

        <nav className="px-3 py-4 flex-1 space-y-1">
          <div className="stat-label px-3 mb-2">Navigation</div>
          <NavLinks />
        </nav>

        <div className="p-4 border-t border-white/[0.06]">
          <div className="glass-card p-3">
            <div className="flex items-center gap-2">
              <span className={cn('w-2 h-2 rounded-full', STATUS_DOT[status])} />
              <span className="text-xs font-display text-nexus-textPrimary">Agent {capitalize(status)}</span>
            </div>
            <div className="stat-label mt-0.5">NEXUS v1.0.0</div>
          </div>
        </div>
      </aside>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-nexus-depth/95 backdrop-blur border-t border-white/[0.06] flex">
        {NAV_ITEMS.map(({ path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              cn('flex-1 flex items-center justify-center py-3', isActive ? 'text-nexus-accent' : 'text-nexus-textMuted')
            }
          >
            <Icon size={20} />
          </NavLink>
        ))}
      </nav>
    </>
  );
}
