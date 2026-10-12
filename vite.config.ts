import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 相对路径，便于部署到任意子目录
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    // 开发时把接口转发到 Node 服务（npm run server）
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4173',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
})
