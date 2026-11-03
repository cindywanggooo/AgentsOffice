import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8001',
        ws: true,
      },
    },
  },
  // 開發時維持原本的 /static/office/。正式建置用相對路徑，
  // 同一份產物可給 FastAPI、GitHub Pages 和 Vercel。
  base: process.env.VITE_BASE || (command === 'serve' ? '/static/office/' : './'),
  build: {
    outDir: '../app/static/office',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        pixel: fileURLToPath(new URL('./pixel.html', import.meta.url)),
      },
    },
  },
}))
