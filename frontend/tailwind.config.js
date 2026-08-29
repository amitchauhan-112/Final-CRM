/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        mountain: {
          50:  '#f5f3ff',
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
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      transitionTimingFunction: {
        // Fast start, gentle settle — the "premium SaaS" hover feel
        // (Linear/Vercel-style) without the bounce of a spring easing.
        enterprise: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      boxShadow: {
        elevate: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -4px rgba(15,23,42,0.12)',
        'elevate-lg': '0 4px 8px rgba(15,23,42,0.06), 0 16px 40px -8px rgba(15,23,42,0.18)',
      },
    },
  },
  plugins: [],
};
