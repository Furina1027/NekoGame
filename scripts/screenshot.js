/**
 * 开发期 UI 截图工具：加载真实主进程（真实数据库与 IPC），逐页截图到 temp 目录。
 *
 *   node scripts/screenshot.js                 # 全部页面
 *   node scripts/screenshot.js home library    # 指定页面
 *
 * 该文件位于 electron-builder 的 files 白名单之外，不会进入安装包。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');

// 以脚本方式启动时 appName 会变，必须先对齐，否则 userData 指向别的目录、读到空数据库
app.setName('NekoGame');

const OUT_DIR = process.env.NEKO_SHOT_DIR || path.join(os.tmpdir(), 'nekogame-shots');
const ROUTES = {
  home: '#/',
  library: '#/library',
  tools: '#/tools',
  settings: '#/settings',
  'gacha:genshin': '#/tools/genshin',
  'gacha:hsr': '#/tools/starrail',
  'gacha:zzz': '#/tools/zzz',
  'gacha:miliastra': '#/tools/miliastra',
  'dataSync': 'app://neko/dataSync.html',
};
const WIDTH = Number(process.env.NEKO_SHOT_W || 1440);
const HEIGHT = Number(process.env.NEKO_SHOT_H || 900);
const SETTLE = Number(process.env.NEKO_SHOT_SETTLE || 3500);

const wanted = process.argv.slice(2).filter((a) => a in ROUTES);
const targets = wanted.length ? wanted : Object.keys(ROUTES);

// 让真实主进程先跑起来，窗口与数据库就绪
require('../electron/main');

const { BrowserWindow } = require('electron');

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await app.whenReady();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 等主进程把窗口建出来
  let win = null;
  for (let i = 0; i < 60 && !win; i++) {
    await wait(250);
    win = BrowserWindow.getAllWindows()[0] ?? null;
  }
  if (!win) {
    console.error('未找到主窗口，可能处于静默模式（silentMode=true）');
    process.exit(1);
  }
  console.log(`主窗口就绪: ${win.getTitle()}`);

  for (const key of targets) {
    const route = ROUTES[key];
    if (!route) continue;
    // dataSync 是独立入口，URL 就是完整地址；其余走主窗口的 hash 路由
    const url = route.startsWith('app://') ? route : `app://neko/index.html${route}`;
    await win.loadURL(url);
    await wait(SETTLE);
    const image = await win.webContents.capturePage();
    // Windows 文件名不能含 ':'
    const file = path.join(OUT_DIR, `${key.replace(/[^\w-]/g, '_')}.png`);
    fs.writeFileSync(file, image.toPNG());
    console.log(`已保存 ${file}`);
  }

  app.exit(0);
}

main().catch((err) => {
  console.error(err);
  app.exit(1);
});
