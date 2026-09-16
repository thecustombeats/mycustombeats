import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [inspectAttr(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // '@gsap/react' was listed here but imported by nothing; naming it as a
          // manual chunk kept it installed. Only `gsap` itself is used
          // (src/lib/scrollReveal.ts).
          'vendor-utils': ['gsap', 'lucide-react', 'react-helmet-async'],
        }
      }
    },
    chunkSizeWarningLimit: 1000,
  }
});
