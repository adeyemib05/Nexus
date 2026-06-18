import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, BrainCircuit, Activity, Settings as SettingsIcon } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Intelligence', path: '/intelligence', icon: BrainCircuit },
    { name: 'Performance', path: '/performance', icon: Activity },
    { name: 'Settings', path: '/settings', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-nexus-void flex text-nexus-textPrimary">
      {/* Sidebar */}
      <aside className="w-64 bg-nexus-depth border-r border-white/[0.06] flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-white/[0.06]">
          <h1 className="font-display font-bold text-xl tracking-wider text-nexus-accent flex items-center gap-2">
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
            <span>NEXUS</span>
            <span className="text-[10px] bg-nexus-accent/10 text-nexus-accent px-1.5 py-0.5 rounded uppercase">v1.0</span>
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-nexus-accent/10 text-nexus-accent shadow-glow-accent border-l-2 border-nexus-accent'
                    : 'text-nexus-textSecondary hover:bg-white/[0.02] hover:text-nexus-textPrimary'
                }`}
              >
                <Icon size={18} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/[0.06] text-[10px] text-nexus-textMuted font-mono">
          Bitget S1 Hackathon 2026
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-auto bg-nexus-void">
        {/* Header */}
        <header className="h-16 bg-nexus-depth border-b border-white/[0.06] flex items-center justify-between px-8">
          <div className="text-nexus-textSecondary text-sm font-medium">
            Autonomous Multi-Signal Trading Intelligence
          </div>
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-nexus-bull animate-pulse"></span>
            <span className="text-xs text-nexus-textSecondary font-mono">System Live</span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
