/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        avionics: {
          bg: 'var(--color-bg)',
          surface: 'var(--color-surface)',
          card: 'var(--color-card)',
          border: 'var(--color-border)',
          text: 'var(--color-text)',
          muted: 'var(--color-muted)',
          accent: 'var(--color-accent)',
          success: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
          night: '#818CF8',
        }
      },
      fontSize: {
        '2xs': '0.7rem',
      }
    },
  },
  plugins: [],
}
