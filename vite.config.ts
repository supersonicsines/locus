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
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4747' },
  },
})
