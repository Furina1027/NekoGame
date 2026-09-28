/**
 * 米游社相关 IPC
 */
const { ipcMain } = require('electron');
const QRCode = require('qrcode');
const { createQrLogin, queryQrLogin, fillCookieToken } = require('./passport');
const { checkLogin, getGameRoles, genAuthKey } = require('./takumi');
const { getAccount, saveAccount, clearAccount, setPreferredUid } = require('./store');
const { GAMES } = require('./constants');
const { buildGachaUrl } = require('./gachaLink');
const { getGacha } = require('./http');

/** 创建登录二维码（返回可直接 <img src> 的 dataURL） */
ipcMain.handle('mhy-login-create-qr', async () => {
  const r = await createQrLogin();
  if (!r.success) return r;
  try {
    r.qrDataUrl = await QRCode.toDataURL(r.url, { margin: 1, width: 240 });
  } catch (e) {
    console.error('[mihoyo] 生成二维码失败:', e.message);
  }
  return r;
});

/** 轮询扫码状态 */
ipcMain.handle('mhy-login-poll', async (_e, ticket) => {
  const r = await queryQrLogin(ticket);
  if (r.success && r.status === 'Confirmed' && r.account) {
    const acc = await fillCookieToken(r.account);
    saveAccount(acc);
    return { success: true, status: 'Confirmed', accountId: acc.account_id, nickname: acc.nickname };
  }
  return r;
});

/** 当前登录状态 */
ipcMain.handle('mhy-account-info', async () => {
  const acc = getAccount();
  if (!acc) return { success: false, loggedIn: false, message: '未登录' };
  const r = await checkLogin();
  if (!r.success) return { success: false, loggedIn: false, message: r.message, accountId: acc.account_id };
  const games = {};
  for (const key of Object.keys(GAMES)) {
    const g = GAMES[key];
    games[key] = {
      label: g.label,
      cookieSupported: g.cookieSupported,
      candidates: r.roles.filter((x) => x.gameBiz === g.biz).map((x) => ({
        uid: x.gameUid, region: x.region, regionName: x.regionName, level: x.level, nickname: x.nickname,
      })),
    };
  }
  return { success: true, loggedIn: true, accountId: acc.account_id, nickname: acc.nickname, updated: acc.updated, games };
});

/** 游戏角色列表 */
ipcMain.handle('mhy-game-roles', async () => await getGameRoles());

/** 指定某个游戏用哪个 UID */
ipcMain.handle('mhy-set-preferred-uid', async (_e, gameKey, uid) => {
  setPreferredUid(gameKey, uid);
  return { success: true };
});

/** 登出 */
ipcMain.handle('mhy-logout', async () => {
  clearAccount();
  return { success: true };
});

/**
 * 自检：换 authkey 并拉一页，用来确认这条链路通不通
 */
ipcMain.handle('mhy-test-gacha', async (_e, gameKey) => {
  const game = GAMES[gameKey];
  if (!game) return { success: false, message: `未知游戏 ${gameKey}` };
  const t0 = Date.now();
  const ak = await genAuthKey(gameKey);
  if (!ak.success) return { success: false, game: game.label, step: 'genAuthKey', message: ak.message, cost: Date.now() - t0 };
  const firstType = gameKey === 'genshin' ? '301' : Object.keys(game.types)[0];
  const url = buildGachaUrl(gameKey, ak.authkey, ak.uid, ak.region, firstType, { size: 5 });
  try {
    const data = await getGacha(url);
    return {
      success: data.retcode === 0,
      game: game.label,
      step: 'getGachaLog',
      uid: ak.uid,
      region: ak.region,
      retcode: data.retcode,
      message: data.message,
      count: ((data.data || {}).list || []).length,
      url: url.replace(/authkey=[^&]+/, 'authkey=***'),
      cost: Date.now() - t0,
    };
  } catch (e) {
    return { success: false, game: game.label, step: 'getGachaLog', message: e.message, cost: Date.now() - t0 };
  }
});

console.log('[mihoyo] IPC 已注册');
