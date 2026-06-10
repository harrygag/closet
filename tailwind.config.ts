import type { Config } from 'tailwindcss'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        retro: {
          bg: '#0f0f23',
          dark: '#1a1a2e',
          purple: '#16213e',
          blue: '#0f3460',
          cyan: '#00d9ff',
          pink: '#ff006e',
          yellow: '#ffbe0b',
          green: '#06ffa5',
          red: '#ff006e',
          white: '#f8f9fa',
          gray: '#6c757d',
        }
      },
      fontFamily: {
        arcade: ['"Press Start 2P"', 'cursive'],
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite',
        'slide-in': 'slideIn 0.3s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        glow: {
          '0%, 100%': { 
            boxShadow: '0 0 20px rgba(0, 217, 255, 0.5)',
          },
          '50%': { 
            boxShadow: '0 0 30px rgba(0, 217, 255, 0.8), 0 0 60px rgba(0, 217, 255, 0.4)',
          },
        },
        slideIn: {
          '0%': { 
            opacity: '0',
            transform: 'scale(0.9) translateY(20px)',
          },
          '100%': { 
            opacity: '1',
            transform: 'scale(1) translateY(0)',
          },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
