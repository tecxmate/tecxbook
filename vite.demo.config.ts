// Build for the classroom AI Scribe demo: a standalone page in dist-demo/,
// served by the Cloudflare Worker in demo/worker.ts (see docs/classroom-demo.md).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'demo',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // `npm run demo` serves the Worker on :8787
      '/api': 'http://localhost:8787'
    }
  }
})
