import LoadingSpinner from './ui/LoadingSpinner';

export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-nexus-void flex flex-col items-center justify-center gap-4">
      <div className="flex items-center gap-2">
        <svg width="28" height="28" viewBox="0 0 44 52" fill="none">
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
        <span className="font-display font-bold text-xl tracking-wider text-nexus-accent">NEXUS</span>
      </div>
      <LoadingSpinner size="lg" />
      <p className="stat-label">Connecting to intelligence network...</p>
    </div>
  );
}
