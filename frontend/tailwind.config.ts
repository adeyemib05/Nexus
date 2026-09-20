import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nexus: {
          void:          '#07090E',
          depth:         '#0D121D',
          surface:       '#0D121D',
          elevated:      '#131B2A',
          border:        'rgba(255,255,255,0.07)',
          borderSubtle:  'rgba(255,255,255,0.04)',
          ring:          'rgba(0,210,255,0.25)',
          accent:        '#00D2FF',
          teal:          '#00E5BE',
          bull:          '#10B981',
          bear:          '#F43F5E',
          caution:       '#F59E0B',
          muted:         '#64748B',
          textPrimary:   '#F8FAFC',
          textSecondary: '#94A3B8',
          textMuted:     '#64748B',
        },
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body:    ['Inter', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        card:    '12px',
        control: '8px',
        smControl: '6px',
      },
      boxShadow: {
        'card':     '0 1px 3px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        'elevated': '0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
        'subtle':   '0 1px 2px rgba(0,0,0,0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in':    'fadeIn 0.25s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0', transform: 'translateY(4px)' },
                  '100%': { opacity: '1', transform: 'translateY(0)' } }
      },
    },
  },
  plugins: [],
}
export default config
