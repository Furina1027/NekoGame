import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { copyAssets, stripCrossOrigin } from './vite-plugin-copy-assets';

export default defineConfig({
  plugins: [react(), tailwindcss(), copyAssets(), stripCrossOrigin()],
  // Electron loads the build from disk via file://, so all asset URLs must be relative.
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5273,
    strictPort: true,
  },
  build: {
    outDir: 'out',
    emptyOutDir: true,
    // Electron 33 ships Chromium 130
    target: 'chrome130',
    // CSS 必须单独指定目标：默认的 Lightning CSS 会把标准 backdrop-filter
    // 降级成只剩 -webkit- 前缀，Chromium 130 不认，磨砂和遮罩会整体失效。
    cssTarget: 'chrome130',
    // 发布版会带 out/** 全量进安装包，sourcemap 等于把源码一起发出去
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
        dataSync: path.resolve(__dirname, 'dataSync.html'),
      },
    },
  },
});
