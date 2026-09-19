/** @type {import('tailwindcss').Config} */

/** Cores derivadas dos tokens de `src/index.css` — trocam de tema sozinhas. */
const token = (name) => `rgb(var(--ui-${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  /**
   * Classes montadas em tempo de execução (`ui-btn-${variant}`) não aparecem
   * inteiras no código-fonte, então o Tailwind as removeria da folha final.
   * A lista abaixo garante que as variações do design system sobrevivam ao build.
   */
  safelist: [
    { pattern: /^ui-btn-(primary|secondary|ghost|danger|success|sm|md|lg|icon|icon-sm)$/ },
    { pattern: /^ui-icon-tile-(sm|md|lg)$/ },
    { pattern: /^ui-tone-(brand|success|warning|danger|info|accent|neutral)$/ },
    { pattern: /^command-icon-(sm|md|lg)$/ },
    { pattern: /^command-tone-(brand|success|warning|danger|info|neutral)$/ },
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        canvas: token('canvas'),
        surface: {
          DEFAULT: token('surface'),
          raised: token('surface-2'),
          muted: token('surface-3'),
        },
        hairline: {
          DEFAULT: token('border'),
          strong: token('border-strong'),
        },
        ink: {
          DEFAULT: token('text'),
          muted: token('text-muted'),
          subtle: token('text-subtle'),
          inverse: token('text-inverse'),
        },
        brand: {
          DEFAULT: token('brand'),
          soft: token('brand-soft'),
          contrast: token('brand-contrast'),
        },
        signal: {
          success: token('success'),
          warning: token('warning'),
          danger: token('danger'),
          info: token('info'),
          accent: token('accent'),
        },
        /* Paletas mantidas para as telas ainda não migradas. */
        ultra: {
          canvas: '#080B12',
          secondary: '#0F131D',
          card: '#151A26',
          primary: '#8B5CF6',
          success: '#34D399',
          warning: '#FBBF24',
          danger: '#FB7185',
          info: '#38BDF8',
        },
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        accent: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
      },
      borderRadius: {
        sm: 'var(--ui-radius-sm)',
        md: 'var(--ui-radius-md)',
        lg: 'var(--ui-radius-lg)',
        xl: 'var(--ui-radius-xl)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'slide-down': 'slideDown 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'bounce-subtle': 'bounceSubtle 0.2s ease-in-out',
        shimmer: 'shimmer 2s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.96)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        hairline: 'var(--ui-shadow-sm)',
        glass: 'var(--ui-shadow)',
        'glass-lg': 'var(--ui-shadow-lg)',
        'inner-lg': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
        neon: 'var(--ui-glow)',
      },
    },
  },
  plugins: [],
};
