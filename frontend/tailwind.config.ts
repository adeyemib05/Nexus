import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nexus: {
          void:          '#06090F',
          depth:         '#0C1220',
          surface:       '#111827',
          border:        'rgba(148,163,184,0.08)',
          ring:          'rgba(0,200,255,0.25)',
          accent:        '#00C8FF',
          bull:          '#10B981',
          bear:          '#EF4444',
          caution:       '#F59E0B',
          muted:         '#6B7280',
          textPrimary:   '#F1F5F9',
          textSecondary: '#94A3B8',
          textMuted:     '#475569',
        },
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body:    ['Inter', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glow-accent':  '0 0 24px rgba(0,200,255,0.18)',
        'glow-bull':    '0 0 24px rgba(16,185,129,0.22)',
        'glow-bear':    '0 0 24px rgba(239,68,68,0.22)',
        'glow-caution': '0 0 24px rgba(245,158,11,0.22)',
        'card':         '0 1px 3px rgba(0,0,0,0.5)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in':    'fadeIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0', transform: 'translateY(6px)' },
                  '100%': { opacity: '1', transform: 'translateY(0)' } }
      },
    },
  },
  plugins: [],
}
export default config
