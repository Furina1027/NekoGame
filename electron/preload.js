const { contextBridge, ipcRenderer } = require('electron');

let appPath = '';
let dbPath = '';

ipcRenderer.on('set-db-path', (_, path) => {
  dbPath = path;
});

ipcRenderer.on('set-app-path', (_, path) => {
  appPath = path;
});

/**
 * 把数据库里存的图片路径转成可加载的 URL。
 * - `./assets/...` 是应用自带资源，走 app:// 协议（打包后位于 app.asar 内）
 * - 其余是用户在本机选的文件，走 media:// 协议由主进程代理
 *   （Chromium 禁止非 file:// 源直接引用 file:// 子资源）
 */
function filePathToURL(filePath) {
  if (!filePath) return '';
  if (filePath.startsWith('./assets')) {
    const rest = filePath.slice('./assets/'.length).replace(/\\/g, '/');
    return `app://neko/assets/${rest}`;
  }
  return `media://local/?p=${encodeURIComponent(filePath)}`;
}

/**
 * 统一包装事件订阅：返回取消订阅函数。
 * 直接把 ipcRenderer.on() 的返回值交给 React 会在卸载时被当作 cleanup 调用，
 * 导致整棵组件树崩溃。
 */
function subscribe(channel, callback) {
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  // ---- 窗口 ----
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-maximized-state'),
  onMaximizedChanged: (callback) => subscribe('window-maximized-changed', callback),

  // ---- 游戏库 ----
  loadGames: () => ipcRenderer.invoke('load-games'),
  addGame: (gameData) => ipcRenderer.invoke('add-game', gameData),
  updateGame: (gameData) => ipcRenderer.invoke('update-game', gameData),
  deleteGame: (gameId) => ipcRenderer.invoke('delete-game', gameId),
  getGameDetails: (gameId) => ipcRenderer.invoke('get-game-details', gameId),
  getGameTrendData: (gameId) => ipcRenderer.invoke('get-game-trend-data', gameId),
  getGameDailyTimeData: (gameId) => ipcRenderer.invoke('get-game-daily-time-data', gameId),
  getGameTimeData: () => ipcRenderer.invoke('get-game-time-data'),
  launchGame: (gamePath) => ipcRenderer.invoke('launch-game', gamePath),
  onGameDataUpdated: (callback) => subscribe('game-data-updated', callback),
  onRunningStatusUpdated: (callback) => subscribe('running-status-updated', callback),

  // ---- 文件选择 ----
  openFile: () => ipcRenderer.invoke('open-file'),
  selectImageFile: () => ipcRenderer.invoke('select-image'),
  filePathToURL,

  // ---- 首页统计 ----
  getAnalysisData: (type, range) => ipcRenderer.invoke('fetch-analysis-data', { type, range }),
  refreshAnalysisData: (type) => ipcRenderer.invoke('refresh-analysis-data', type),
  getLeaderboardData: () => ipcRenderer.invoke('getLeaderboardData'),
  getLogData: (page) => ipcRenderer.invoke('get-log-data', page),

  // ---- 设置 ----
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
  checkErrors: () => ipcRenderer.invoke('check-errors'),
  saveBackgroundSettings: (key, value) => ipcRenderer.invoke('saveBackgroundSettings', key, value),
  loadBackgroundSettings: () => ipcRenderer.invoke('loadBackgroundSettings'),
  selectBackgroundFile: () => ipcRenderer.invoke('selectBackgroundFile'),
  restoreDefaultBackgroundSettings: () =>
    ipcRenderer.invoke('restoreDefaultBackgroundSettings'),
  onBackgroundSettings: (callback) => subscribe('background-settings', callback),
  // 主进程抓取抽卡记录时逐页汇报「当前卡池 / 第几页」
  onGachaRecordsStatus: (callback) => subscribe('gacha-records-status', callback),
  browseDataFile: () => ipcRenderer.invoke('browse-dataFile'),
  resetDataFile: () => ipcRenderer.invoke('reset-dataFile'),
  getDataFilePath: () => ipcRenderer.invoke('get-dataFile-path'),

  // ---- 通用 ----
  openDataPath: (path) => ipcRenderer.send('open-data-path', path),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  /** 返回取消订阅函数，可直接用作 useEffect 的 cleanup */
  on: (channel, listener) => subscribe(channel, listener),
  send: (channel, data) => ipcRenderer.send(channel, data),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
};

contextBridge.exposeInMainWorld('electronAPI', api);
