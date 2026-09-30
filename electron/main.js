const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
//在调用database前设置
require('./app/settings/dataFile');
require("./app/console");  // 导入日志管理
require('./utils/syncMessage'); //导入消息通知


const { initializeDatabase, getSetting, setSetting} = require('./app/database');
const { startGameTracking, sendRunningStatus } = require('./app/gameTracker');
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
    protocol.handle('media', async (request) => {
        // 路径放在 query 里，绕开 URL 规范化对盘符/中文的改写
        const filePath = new URL(request.url).searchParams.get('p');
        if (!filePath) return new Response('Bad Request', { status: 400 });
        if (!MEDIA_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
            return new Response('Forbidden', { status: 403 });
        }
        try {
            const stat = await fs.promises.stat(filePath);
            if (!stat.isFile()) return new Response('Not Found', { status: 404 });
        } catch {
            return new Response('Not Found', { status: 404 });
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
            sandbox: false,
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


// 窗口控制事件
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});
ipcMain.on('window-close', () => mainWindow.close());
ipcMain.on('window-is-maximized', (event) => {
    event.returnValue = mainWindow.isMaximized();
});
ipcMain.handle('window-maximized-state', () => mainWindow.isMaximized());
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
    // 启动后台进程检测，每20秒检测一次（由 gameTracker.js 设置间隔）
    startGameTracking();
    module.exports = { createWindow, DATA_SYNC_URL, DEV_SERVER_URL };
    require('./app/uploadData/uploadDataIpc');  // 初始化上传代码
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
    app.setLoginItemSettings({ openAtLogin: enabled });
});

ipcMain.on('open-external', (event, url) => {
    if (url) {
        shell.openExternal(url);
    }
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
