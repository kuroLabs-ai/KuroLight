/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          deep: '#0D0E11',
          panel: '#131518',
          card: '#181B20',
          hover: '#22262E',
          input: '#0E1012',
          border: '#2A2F38',
          borderLt: '#3C4250',
          accent: 'var(--obsidian-accent, #0088FF)',
          accentHover: 'var(--obsidian-accent-hover, #1A94FF)',
          textPri: '#F3F5F7',
          textSec: '#B8BFC9',
          textMut: '#78808E',
        }
      },
      fontFamily: {
        sans: ['Segoe UI', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Consolas', 'Fira Code', 'monospace'],
      }
    },
  },
  plugins: [],
}
