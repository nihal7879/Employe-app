/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#0B1020', deep: '#070A18' },
        surface: { DEFAULT: 'rgba(255,255,255,0.06)', strong: 'rgba(255,255,255,0.10)' },
        ink:    { DEFAULT: '#F8FAFC', mute: '#94A3B8', soft: '#CBD5E1' },
        brand:  { 50: '#F5F3FF', 100:'#EDE9FE', 200:'#DDD6FE', 300:'#C4B5FD', 400:'#A78BFA', 500:'#8B5CF6', 600:'#7C3AED', 700:'#6D28D9', 800:'#5B21B6', 900:'#4C1D95' },
        cyan2:  { 400:'#22D3EE', 500:'#06B6D4', 600:'#0891B2' },
        ok:     { DEFAULT: '#22C55E' },
        warn:   { DEFAULT: '#F59E0B' },
        bad:    { DEFAULT: '#EF4444' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        glow:        '0 10px 40px -10px rgba(124, 58, 237, 0.45)',
        'glow-cyan': '0 10px 40px -10px rgba(6, 182, 212, 0.45)',
        soft:        '0 4px 24px rgba(0,0,0,0.25)',
        inset:       'inset 0 1px 0 rgba(255,255,255,0.08)',
      },
      backgroundImage: {
        'mesh': 'radial-gradient(at 12% 0%, rgba(124,58,237,0.22) 0px, transparent 50%), radial-gradient(at 90% 10%, rgba(6,182,212,0.18) 0px, transparent 55%), radial-gradient(at 60% 100%, rgba(124,58,237,0.18) 0px, transparent 55%)',
        'card-grad': 'linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))',
        'btn-grad': 'linear-gradient(135deg, #7C3AED, #06B6D4)',
      },
      keyframes: {
        floaty: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%':     { transform: 'translateY(-6px)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(124,58,237,0.4)' },
          '50%':     { boxShadow: '0 0 0 12px rgba(124,58,237,0)' },
        },
      },
      animation: {
        floaty: 'floaty 5s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        pulseGlow: 'pulseGlow 2s ease-out infinite',
      },
    },
  },
  plugins: [],
};
