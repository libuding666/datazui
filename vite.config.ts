import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 相对路径，便于部署到任意子目录
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    // 开发时把接口转发到 Node 服务（npm run dev）
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
    rollupOptions: {
      // 双入口：前台 index.html + 后台 admin.html
      // 分开打包，后台代码不会进入前台访客的包
      input: {
        main: path.resolve(root, 'index.html'),
        admin: path.resolve(root, 'admin.html'),
      },
    },
  },
})
