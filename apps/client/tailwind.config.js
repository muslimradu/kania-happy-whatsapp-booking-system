/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette Kania Happy: hangat, feminin, profesional
        primary: {
          50:  '#fdf2f8',
          100: '#fce7f3',
          200: '#fbcfe8',
          300: '#f9a8d4',
          400: '#f472b6',
          500: '#ec4899',  // pink utama
          600: '#db2777',
          700: '#be185d',
          800: '#9d174d',
          900: '#831843',
        },
        surface: {
          DEFAULT: '#fdfcfb',  // putih hangat
          card:    '#ffffff',
          border:  '#f3e8ee',  // border pink sangat muda
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui'],
        mono: ['"JetBrains Mono"', 'ui-monospace'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(236 72 153 / 0.08), 0 1px 2px -1px rgb(236 72 153 / 0.06)',
        'card-hover': '0 4px 12px 0 rgb(236 72 153 / 0.12)',
      },
    },
  },
  plugins: [],
};
