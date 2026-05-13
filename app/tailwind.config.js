/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Colores corporativos - desde tokens.js
      colors: {
        // Brand colors
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        secondary: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        // Status colors
        success: {
          50: '#e6ffe7',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        danger: {
          50: '#fbcbc9',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fef9c3',
          300: '#fef08a',
          400: '#fde68a',
          500: '#facc15',
          600: '#eab308',
          700: '#ca8a04',
          800: '#a16207',
          900: '#713f12',
        },
        info: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Backgrounds
        lightBg: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
        },
        white: '#ffffff',
        // Semantic colors
        income: {
          50: '#e6ffe7',
          600: '#53B257',
        },
        expense: {
          50: '#fbcbc9',
          600: '#fe6156',
        },
        // Slate from Tailwind default
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        }
      },
      // Border radius - desde tokens.js
      borderRadius: {
        base: '6px',
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      // Box shadows - soft and premium
      boxShadow: {
        soft: '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        premium: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        gray: '-2px 14px 20px -4px rgba(0,0,0,0.4)',
      },
      // Spacing - desde tokens.js
      spacing: {
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        xxl: '48px',
      },
      // Typography
      fontSize: {
        xs: '0.75em',
        sm: '0.875em',
        button: '0.875em',
        base: '16px',
        lg: '1.25em',
        xl: '2em',
        xxl: '3em',
        xxxl: '4em',
      },
      // Breakpoints
      screens: {
        maggie: '240px',
        lisa: '480px',
        bart: '768px',
        marge: '992px',
        homer: '1200px',
      },
      // Sidebar
      width: {
        sidebar: '300px',
        sidebarCollapsed: '10vw',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // Custom scrollbar
      scrollbar: {
        thumb: {
          primary: '#4f46e5',
          hover: '#4338ca',
        },
        track: {
          primary: '#f1f5f9',
        },
      },
    },
  },
  plugins: [
    // Custom scrollbar plugin
    function({ addUtilities }) {
      addUtilities({
        '.scrollbar-thumb-primary': {
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: '#4f46e5',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            backgroundColor: '#4338ca',
          },
        },
        '.scrollbar-track-primary': {
          '&::-webkit-scrollbar-track': {
            backgroundColor: '#f1f5f9',
          },
        },
      });
    },
  ],
}
