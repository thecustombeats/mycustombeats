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

        /* ---- MVIS™ palette (authoritative) ---------------------------
         * Ivory is the dominant canvas. Midnight Ink is for selective dark
         * fields and strong contrast. Heritage Gold is an accent only —
         * never a large background, never body copy.
         * ------------------------------------------------------------- */
        ivory: "#F8F5F0",   // MVIS Ivory
        ink: "#0D1B2A",     // MVIS Midnight Ink
        gold: "#C9A14A",    // MVIS Heritage Gold
        /* Interaction tints of Heritage Gold, per MVIS Theme Specification. */
        "gold-light": "#D8B96A",
        "gold-dark": "#A8842F",
        /**
         * Heritage Gold darkened for TEXT ON IVORY only.
         *
         * Heritage Gold on Ivory measures 2.22:1 — well below WCAG AA — so it
         * must not carry small copy on a light field. This shade reaches
         * 4.83:1 while reading as the same accent. Gold on Midnight Ink is
         * 7.19:1 and needs no substitute, so dark sections keep `gold`.
         * MVIS: "Legibility always wins over decorative brand colour."
         */
        "gold-deep": "#856823",

        /* ---- Legacy palette (pre-MVIS) -------------------------------
         * Retained so unmodified routes are not silently repainted.
         * Migration to `ink` is tracked as outstanding MVIS work.
         * ------------------------------------------------------------- */
        "misty-stone": "#E9E5DF",
        espresso: "#2E2623",
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
        /* MVIS™: Cormorant Garamond for display, Manrope for body and UI,
         * IBM Plex Mono for technical values — prices, song capacities,
         * lead times. Mono is for figures only, never for prose. */
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
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