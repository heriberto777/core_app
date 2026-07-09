/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Colores corporativos — dirección "Grid": azul de señal único,
      // casi monocromo en el resto (ver slate más abajo).
      colors: {
        // Brand colors
        primary: {
          50: '#eef3ff',
          100: '#dbe6ff',
          200: '#b9d0ff',
          300: '#8bb0ff',
          400: '#5687ff',
          500: '#1447e6',
          600: '#0f3ab8',
          700: '#0c2e93',
          800: '#0a2570',
          900: '#081a4d',
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
        // Slate — neutro casi puro (sin matiz azulado), no el slate por
        // defecto de Tailwind. Es el gris que carga casi todo el peso
        // visual de la app (fondos, bordes, texto), así que es el cambio
        // de mayor alcance de este token system.
        slate: {
          50: '#fafafa',
          100: '#f2f2f2',
          200: '#e6e6e6',
          300: '#d1d1d1',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#383838',
          800: '#232323',
          900: '#121212',
        }
      },
      // Border radius — dirección "Grid": esquinas casi sin redondear.
      // Colapsa la escala xl/2xl/3xl (antes 12/16/24px) a un rango muy
      // ajustado, así todo lo que usa rounded-xl/2xl/3xl en los templates
      // (478 usos) se ve afectado sin tocar cada archivo.
      borderRadius: {
        base: '3px',
        sm: '2px',
        md: '3px',
        lg: '4px',
        xl: '4px',
        '2xl': '5px',
        '3xl': '6px',
      },
      // Box shadows — dirección "Grid": hairlines en vez de sombras suaves.
      // Se aplanan también lg/xl/2xl (built-ins de Tailwind) para que los
      // 130 usos existentes de shadow-lg/xl/2xl bajen de intensidad sin
      // tocar cada archivo.
      boxShadow: {
        soft: '0 0 0 1px rgba(0, 0, 0, 0.06)',
        premium: '0 0 0 1px rgba(0, 0, 0, 0.08)',
        gray: '0 0 0 1px rgba(0, 0, 0, 0.1)',
        lg: '0 1px 2px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.04)',
        xl: '0 2px 4px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.05)',
        '2xl': '0 4px 8px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.06)',
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
