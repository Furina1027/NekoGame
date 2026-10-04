const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, protocol, net, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
//在调用database前设置
require('./app/settings/dataFile');
require("./app/console");  // 导入日志管理
require('./utils/syncMessage'); //导入消息通知

// 主进程不允许带着未处理异常静默跑飞：记进日志，用户反馈时才有迹可循
process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
});


const { initializeDatabase, getSetting, setSetting} = require('./app/database');
const { startGameTracking, sendRunningStatus } = require('./app/gameTracker');
const { isTrustedSender } = require('./app/trustedSender');
const gotTheLock = app.requestSingleInstanceLock();

// 开发模式下由 Vite dev server 提供渲染进程
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIR = path.join(__dirname, '..', 'out');
// 打包后的页面走自定义协议：file:// 下 ES module 会被 CORS 拦掉，React 根本不会执行
const APP_ORIGIN = 'app://neko';
const INDEX_URL = `${APP_ORIGIN}/index.html`;
const DATA_SYNC_URL = `${APP_ORIGIN}/dataSync.html`;

// 用户自选的图片（游戏图标/海报/壁纸）通过 media:// 提供。
// Chromium 不允许非 file:// 源直接引用 file:// 子资源，必须由主进程代理。
// 只放行图片扩展名，避免渲染层借此读取任意文件。
const MEDIA_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.svg', '.ico',
]);

protocol.registerSchemesAsPrivileged([
    {
        scheme: 'app',
        privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
    {
        scheme: 'media',
        privileges: { standard: false, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
    },
]);

function registerAppProtocol() {
    protocol.handle('app', async (request) => {
        const { pathname } = new URL(request.url);
        const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
        const target = path.join(RENDERER_DIR, relative);
        // 阻断 ../ 穿越
        if (!target.startsWith(RENDERER_DIR + path.sep) && target !== RENDERER_DIR) {
            return new Response('Forbidden', { status: 403 });
        }
        return net.fetch(pathToFileURL(target).toString());
    });
}

function registerMediaProtocol() {
    // 缩略图缓存：图标在界面上只有 36~64px，却常常是 3000x7200 这种原图，
    // 每次整页重挂载都要重新解码三十几兆像素，是切页卡顿的主因。
    const thumbCache = new Map();
    const THUMB_CACHE_MAX = 120;
    const THUMB_FORMAT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp']);

    async function buildThumb(filePath, maxWidth) {
        const key = `${filePath}|${maxWidth}`;
        const hit = thumbCache.get(key);
        if (hit) return hit;
        const img = nativeImage.createFromPath(filePath);
        if (img.isEmpty()) return null;
        const size = img.getSize();
        // 已经够小就原样返回，不必重编码
        const buf = size.width <= maxWidth
            ? img.toPNG()
            : img.resize({ width: maxWidth, quality: 'good' }).toPNG();
        if (thumbCache.size >= THUMB_CACHE_MAX) thumbCache.delete(thumbCache.keys().next().value);
        thumbCache.set(key, buf);
        return buf;
    }

    protocol.handle('media', async (request) => {
        // 路径放在 query 里，绕开 URL 规范化对盘符/中文的改写
        const url = new URL(request.url);
        const filePath = url.searchParams.get('p');
        if (!filePath) return new Response('Bad Request', { status: 400 });
        const ext = path.extname(filePath).toLowerCase();
        if (!MEDIA_EXTENSIONS.has(ext)) {
            return new Response('Forbidden', { status: 403 });
        }
        try {
            const stat = await fs.promises.stat(filePath);
            if (!stat.isFile()) return new Response('Not Found', { status: 404 });
        } catch {
            return new Response('Not Found', { status: 404 });
        }

        const maxWidth = Number(url.searchParams.get('w'));
        if (Number.isFinite(maxWidth) && maxWidth > 0 && THUMB_FORMAT.has(ext)) {
            try {
                const buf = await buildThumb(filePath, Math.round(maxWidth));
                if (buf) {
                    return new Response(buf, {
                        headers: {
                            'Content-Type': ext === '.bmp' ? 'image/bmp' : `image/${ext.slice(1)}`,
                            'Cache-Control': 'no-cache',
                        },
                    });
                }
            } catch {
                // 缩略图失败就退回原图，不能因为图搞崩页面
            }
        }
        return net.fetch(pathToFileURL(filePath).toString());
    });
}

let tray = null;
let mainWindow;
global.mainWindow = mainWindow; // 将 mainWindow 保存在全局对象中
// let isWindowVisible = true;
let minimizeToTraySetting = false;


function createTray() {
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico'); // 使用绝对路径
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
        { label: '退出应用', click: () => {
            tray.destroy();  // 销毁托盘图标
            app.exit();      // 退出应用
        }}
    ]);
    tray.setToolTip('Neko Game');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (!mainWindow) {
            createWindow();  // 如果主窗口未创建，则创建窗口
            sendRunningStatus(); // 立即发送最新的运行状态
        } else {
            if (mainWindow.isVisible()) {
                // mainWindow.hide();
                mainWindow.destroy();  // 销毁窗口并释放资源
                mainWindow = null; // 清除引用
                global.mainWindow = null;  // 清除全局引用
                // isWindowVisible = false;
            } else {
                mainWindow.show();
                // 每次窗口显示时发送刷新事件
                sendRunningStatus(); // 立即发送最新的运行状态
                mainWindow.focus();
            }
        }
    });
    global.tray = tray;
}


function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1000,
        minHeight: 640,
        backgroundColor: '#16161c',
        show: false,
        webPreferences: {
            // preload 只用 contextBridge / ipcRenderer 这类 Electron API，
            // 不需要 Node，开沙箱把渲染进程 compromise 的影响面压到最小
            sandbox: true,
            preload: path.join(__dirname, 'preload.js'), // 指定 preload 脚本
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false
        },
        frame: false
    });
    if (DEV_SERVER_URL) {
        mainWindow.loadURL(DEV_SERVER_URL);
    } else {
        mainWindow.loadURL(INDEX_URL);
    }

    // 渲染进程的报错写进应用日志，方便用户反馈问题
    mainWindow.webContents.on('console-message', (event) => {
        const level = event.level === 'warning' ? 'warn' : event.level;
        console[level]?.(`[renderer] ${event.message} (${event.sourceId}:${event.lineNumber})`);
    });
    mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
        console.error(`[renderer] 加载失败 ${code} ${desc} ${url}`);
    });
    mainWindow.webContents.on('preload-error', (_e, file, error) => {
        console.error(`[preload] ${file}: ${error.message}`);
    });

    // 等 React 挂载完成再显示，避免先闪一下空白窗口；
    // 兜底 3s 后无论如何都显示，防止渲染异常导致窗口永远不出现
    const revealTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            mainWindow.show();
        }
    }, 3000);
    mainWindow.once('ready-to-show', () => {
        clearTimeout(revealTimer);
        mainWindow.show();
    });

    // 打开开发者工具
    // mainWindow.webContents.once('dom-ready', () => {
    //    mainWindow.webContents.openDevTools();
    // });
    // 定义后全局导出 mainWindow
    global.mainWindow = mainWindow; // 更新global.mainWindow
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('set-app-path', app.getAppPath());
        // 背景图片与透明度由渲染进程写入 CSS 变量
        loadBackground(mainWindow);
    });
    // mainWindow.on('minimize', () => {
    //     isWindowVisible = false;
    // });
    // mainWindow.on('restore', () => {
    //     isWindowVisible = true;
    // });
    // 标题栏图标需要跟随最大化状态
    const emitWindowState = () => ipcMain.emit('window-state-change');
    mainWindow.on('maximize', emitWindowState);
    mainWindow.on('unmaximize', emitWindowState);
    mainWindow.on('enter-full-screen', emitWindowState);
    mainWindow.on('leave-full-screen', emitWindowState);
    mainWindow.on('close', (event) => {
        if (minimizeToTraySetting) {
            event.preventDefault();
            // 隐藏窗口
            // mainWindow.hide();
            mainWindow.destroy();  // 销毁窗口并释放资源
            mainWindow = null; //清除引用
            global.mainWindow = null;  // 清除全局引用
            // isWindowVisible = false;
        } else {
            mainWindow = null;  // 清除引用
            global.mainWindow = null;  // 清除全局引用
            app.quit();
        }
    });
}


ipcMain.handle("load-settings", async () => {
    const settings = {};
    const keys = ["minimizeToTray", "silentMode", "autoLaunch", "hardwareAcceleration"];

    for (const key of keys) {
        settings[key] = await new Promise((resolve) => {
            getSetting(key, (err, value) => {
                if (err) {
                    console.error(`Error loading setting ${key}:`, err);
                    resolve("false"); // 默认值
                } else {
                    resolve(value || "false"); // 默认为 "false"
                }
            });
        });
    }
    return settings;
});

ipcMain.handle("save-setting", (event, key, value) => {
    setSetting(key, value, (err) => {
        if (err) {
            console.error(`Error saving setting ${key}:`, err);
        } else {
            if (key === "minimizeToTray") {
                minimizeToTraySetting = value === "true";
            }
        }
    });
});


// 窗口控制事件。dataSyncWindow 与主窗口共用同一 preload，
// 这些 handler 都可能被任意窗口触发，mainWindow 必须判空。
ipcMain.on('window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});
ipcMain.on('window-maximize', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});
ipcMain.on('window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});
ipcMain.on('window-is-maximized', (event) => {
    event.returnValue = !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized();
});
ipcMain.handle('window-maximized-state', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    return mainWindow.isMaximized();
});
// 把最大化状态变化同步给渲染进程，标题栏据此切换还原/最大化图标
ipcMain.on('window-state-change', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('window-maximized-changed', mainWindow.isMaximized());
    }
});

async function initializeSettings() {
    minimizeToTraySetting = await new Promise((resolve) => {
        getSetting("minimizeToTray", (err, value) => {
            resolve(value === "true");
        });
    });

    const silentMode = await new Promise((resolve) => {
        getSetting("silentMode", (err, value) => {
            resolve(value === "true");
        });
    });

    // 如果 silentMode 为 true，不显示主窗口，只创建托盘图标
    if (silentMode) {
        createTray();
    } else {
        createWindow();
        createTray();
    }
}
if (!gotTheLock) {
    dialog.showErrorBox('Neko Game 已运行', '应用已在运行，请检查喵。'); // 提示用户已有进程
    app.exit(); // 使用 app.exit 退出当前实例
}
require('./utils/analysisGacha/analysisIpc'); // 引入分析相关的 IPC 逻辑
require('./utils/mihoyo/ipc'); // 米游社登录 / authkey 换抽卡链接
// 设置页面
require('./utils/settings/checkError');
require('./utils/settings/export/exportExcel');
const { loadBackground } = require('./utils/settings/background');
// 页面功能
require('./app/appIPC');
app.whenReady().then(() => {
    registerAppProtocol();
    registerMediaProtocol();
    initializeDatabase();
    initializeSettings();
    // 启动后台进程检测，每15秒检测一次（由 gameTracker.js 设置间隔）
    startGameTracking();
    // 数据同步延后到窗口加载完再跑：initUpload 内部有多次网络往返，
    // 在模块加载时立即执行会拖慢启动；网络失败也不能变成未处理 rejection
    const { initUpload } = require('./app/uploadData/uploadDataIpc');
    setTimeout(() => {
        initUpload({ allowRestart: true }).catch((err) => {
            console.error('启动时自动同步数据失败:', err);
        });
    }, 5000);
});

// 触发运行状态更新通知
ipcMain.on('running-status-updated', (event, runningStatus) => {
    if (mainWindow && mainWindow.webContents && mainWindow.isVisible()) {
        mainWindow.webContents.send('running-status-updated', runningStatus);
    }
});

ipcMain.on('request-running-status', (event) => {
    sendRunningStatus(); // 立即发送最新的运行状态
});

// 开机自启动
ipcMain.handle("set-auto-launch", (event, enabled) => {
    if (!isTrustedSender(event)) return;
    app.setLoginItemSettings({ openAtLogin: enabled === true });
});

ipcMain.on('open-external', (event, url) => {
    if (!isTrustedSender(event)) return;
    // Windows 上 shell.openExternal 对 file:/// 会用 ShellExecute 直接运行程序，
    // ms-settings: 等协议也能被滥用，只放行网页链接
    if (typeof url !== 'string') return;
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        console.error(`已拒绝打开非网页协议: ${url}`);
        return;
    }
    shell.openExternal(url);
});

app.on('window-all-closed', () => {
    // 在托盘模式下不退出应用
    if (process.platform !== 'darwin' && !tray) {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
