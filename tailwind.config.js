/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534'
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#fafafa',
          subtle: '#f5f5f4'
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ]
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
        lift: '0 2px 4px rgba(16, 24, 40, 0.04), 0 8px 24px rgba(16, 24, 40, 0.06)',
        dock: '0 -1px 0 rgba(16, 24, 40, 0.04), 0 -8px 24px rgba(16, 24, 40, 0.04)'
      },
      keyframes: {
        'pulse-done': {
          '0%, 100%': { backgroundColor: '#f0fdf4' },
          '50%': { backgroundColor: '#bbf7d0' }
        },
        'fade-up': {
          '0%': { opacity: 0, transform: 'translateY(4px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' }
        }
      },
      animation: {
        'pulse-done': 'pulse-done 0.9s ease-in-out 2',
        'fade-up': 'fade-up 0.2s ease-out'
      }
    }
  },
  plugins: []
}
