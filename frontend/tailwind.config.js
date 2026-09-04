/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0a0f1a',
          800: '#111827',
          700: '#1f2937',
        },
        cyan: {
          400: '#22d3ee',
          500: '#06b6d4',
        },
        purple: {
          400: '#a855f7',
          500: '#9333ea',
        },
        orange: {
          400: '#fb923c',
          500: '#f97316',
        },
        coral: {
          400: '#f87171',
          500: '#ef4444',
        },
        cyber: {
          950: '#060911',
          900: '#0b1120',
          850: '#0f172a',
          800: '#1e293b',
          700: '#334155',
          cyan: '#06b6d4',
          violet: '#a855f7',
          amber: '#f59e0b',
          coral: '#ef4444',
          emerald: '#10b981',
        },
      },
    },
  },
  plugins: [],
}