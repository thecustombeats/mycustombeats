/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",

        ivory: "#FBF9F6",
        "misty-stone": "#E9E5DF",
        espresso: "#2E2623",
        gold: "#C6A46C",
        ocean: "#243746",
        sunset: "#D9B08C",

        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
      },

      fontFamily: {
        serif: ['Playfair Display', 'serif'],
        sans: ['Arimo', 'sans-serif'],
      },

      corePlugins: {
  preflight: true,
},

      fontSize: {
        body: '18px',
        section: '20px',
        'hero-sub': '22px',
      },

      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
        "2xl": "1rem",
        "3xl": "1.5rem",
      },

      boxShadow: {
        luxury: "0 12px 40px rgba(46, 38, 35, 0.06)",
        "luxury-hover": "0 20px 50px rgba(46, 38, 35, 0.1)",
        card: "0 8px 30px rgba(46, 38, 35, 0.08)",
      },

      transitionDuration: {
        fast: '0.18s',
        text: '0.25s',
        scroll: '0.3s',
        page: '0.35s',
        press: '0.05s',
      },

      animation: {
        pulseSlow: "pulse 2.5s infinite",
      },
    },
  },

  plugins: [require("tailwindcss-animate")],
}