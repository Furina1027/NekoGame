import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * 渲染层以 `./assets/xxx` 引用图标与壁纸，这些文件由主进程/打包共用，
 * 不进 Vite 的 publicDir，改为构建时原样复制到产物根下。
 */
export function copyAssets(): Plugin {
  const from = path.resolve(__dirname, 'assets');
  const to = path.resolve(__dirname, 'out', 'assets');

  return {
    name: 'nekogame:copy-assets',
    apply: 'build',
    // closeBundle 在 Vite 写出自己的 chunk 之后执行，这里是「合并」而非「清空」，
    // 否则会把 out/assets/*.js 一并删掉。
    closeBundle() {
      if (!fs.existsSync(from)) return;
      fs.cpSync(from, to, { recursive: true, force: true });
    },
  };
}

/**
 * Vite 默认给 module script / modulepreload / stylesheet 加上 crossorigin，
 * 在 Electron 的 file:// 加载下会触发 CORS 校验失败，脚本直接被拦掉。
 */
export function stripCrossOrigin(): Plugin {
  return {
    name: 'nekogame:strip-crossorigin',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html
          .replace(/ crossorigin(="[^"]*")?/g, '')
          .replace(/<script type="module"/g, '<script type="module"');
      },
    },
  };
}

