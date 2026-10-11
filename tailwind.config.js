/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Jua"', '"Noto Sans KR"', 'system-ui', 'sans-serif'],
      },
      colors: {
        cream: '#FFF8EC',
        sun: '#FFB703',
        batchim: '#F77F00',
        leaf: '#52B788',
        sky: '#4CC9F0',
      },
    },
  },
  plugins: [],
}
