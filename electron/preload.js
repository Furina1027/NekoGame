const { contextBridge, ipcRenderer } = require('electron');

let appPath = '';

ipcRenderer.on('set-app-path', (_, path) => {
  appPath = path;
});

/**
 * 通用 on/send/invoke 的通道白名单。
 * 白名单之外的通道一律拒绝——否则这三个兜底方法会让渲染层
 * 可以触达主进程注册的任意 IPC（包括覆盖数据库、改自启动这种高危通道）。
 */
const INVOKE_CHANNELS = new Set([
  // 设置 / 通用
  'load-settings',
  'save-setting',
  'set-auto-launch',
  'open-common-items',
  // 米游社账号
  'mhy-account-info',
  'mhy-login-create-qr',
  'mhy-login-poll',
  'mhy-logout',
  'mhy-set-preferred-uid',
  // 抽卡链接
  'getGenshinWishLink',
  'getStarRailUrl',
  // 抽卡模块（config.ts 的 channels）
  'get-genshin-player-uids',
  'get-genshin-gacha-records',
  'get-last-genshin-uid',
  'fetchGenshinGachaData',
  'export-genshin-data',
  'import-genshin-data',
  'clear-genshin-url-cache',
  'get-starRail-player-uids',
  'get-starRail-gacha-records',
  'get-last-starRail-uid',
  'fetchStarRailGachaData',
  'export-starRail-data',
  'import-starRail-data',
  'clear-starRail-url-cache',
  'get-zzz-player-uids',
  'get-zzz-gacha-records',
  'get-last-zzz-uid',
  'fetchZzzGachaData',
  'export-zzz-data',
  'import-zzz-data',
  'clear-zzz-url-cache',
  'get-miliastra-player-uids',
  'get-miliastra-gacha-records',
  'get-last-miliastra-uid',
  'fetchMiliastraGachaData',
  'export-miliastra-data',
  // 卡池记录维护
  'get-common-items',
  'count-gacha-records-by-time',
  'delete-gacha-records-by-time',
]);

const SEND_CHANNELS = new Set([
  'openDataSyncWindow',
  'closeDataSyncWindow',
  'request-running-status',
]);

const LISTEN_CHANNELS = new Set([
  'syncSettingsStatus',
  'gacha-records-status',
  // 命名方法内部也走 subscribe()，这些通道同样要在白名单里
  'window-maximized-changed',
  'running-status-updated',
  'background-settings',
]);

function assertAllowed(set, channel, method) {
  if (!set.has(channel)) {
    throw new Error(`未授权的 IPC 通道 (${method}): ${channel}`);
  }
}

/**
 * 把数据库里存的图片路径转成可加载的 URL。
 * - `./assets/...` 是应用自带资源，走 app:// 协议（打包后位于 app.asar 内）
 * - 其余是用户在本机选的文件，走 media:// 协议由主进程代理
 *   （Chromium 禁止非 file:// 源直接引用 file:// 子资源）
 */
/**
 * @param {string} filePath
 * @param {number} [maxWidth] 显示宽度（CSS px）。给图标这类小图传一下，
 *   主进程会返回缩略图，避免浏览器去解码 3000x7200 的原图。
 */
function filePathToURL(filePath, maxWidth) {
  if (!filePath) return '';
  if (filePath.startsWith('./assets')) {
    const rest = filePath.slice('./assets/'.length).replace(/\\/g, '/');
    return `app://neko/assets/${rest}`;
  }
  const size = maxWidth ? `&w=${Math.round(maxWidth * 2)}` : '';
  return `media://local/?p=${encodeURIComponent(filePath)}${size}`;
}

/**
 * 统一包装事件订阅：返回取消订阅函数。
 * 直接把 ipcRenderer.on() 的返回值交给 React 会在卸载时被当作 cleanup 调用，
 * 导致整棵组件树崩溃。
 */
function subscribe(channel, callback) {
  assertAllowed(LISTEN_CHANNELS, channel, 'on');
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

  // ---- 数据同步（独立窗口） ----
  saveSyncSettings: (payload) => ipcRenderer.send('saveSyncSettings', payload),
  loadSyncSettings: () => ipcRenderer.invoke('load-sync-settings'),
  uploadFirstData: () => ipcRenderer.send('uploadFirstData'),
  downloadLastedData: (payload) => ipcRenderer.send('downloadLastedData', payload),
  onSyncSettingsStatus: (callback) => subscribe('syncSettingsStatus', callback),

  // ---- 通用 ----
  openDataPath: (path) => ipcRenderer.send('open-data-path', path),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  /** 白名单内的通道订阅，返回取消订阅函数，可直接用作 useEffect 的 cleanup */
  on: (channel, listener) => subscribe(channel, listener),
  send: (channel, data) => {
    assertAllowed(SEND_CHANNELS, channel, 'send');
    ipcRenderer.send(channel, data);
  },
  invoke: (channel, ...args) => {
    assertAllowed(INVOKE_CHANNELS, channel, 'invoke');
    return ipcRenderer.invoke(channel, ...args);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
