import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/studio',
  plugins: [react()],
  build: {
    outDir: '../../dist/studio',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    // The CSP says font-src 'self', so a small font subset inlined as a data: URL would be blocked.
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4747' },
  },
})
