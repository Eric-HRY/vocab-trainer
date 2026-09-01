import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    inspectAttr(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: '啸啸单词斩',
        short_name: '单词斩',
        description: '啸啸单词斩：轻松有趣的背单词应用，基于记忆曲线科学复习。',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        // 与 src/index.css 的 --background: 40 36% 96% 换算一致
        background_color: '#F8F6F1',
        theme_color: '#F8F6F1',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // SPA 路由离线可用：导航请求回退到 index.html
        navigateFallback: 'index.html',
        // 预缓存全部构建产物（单 bundle，words 数据已打进 bundle）
        globPatterns: ['**/*.{js,css,html,png,svg,ico,json,woff,woff2,mp3,m4a}'],
      },
    }),
  ],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
