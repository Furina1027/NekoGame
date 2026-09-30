/**
 * takumi 接口：游戏角色列表 + 生成 authkey
 * 参考 TeyvatGuide src/request/takumiReq.ts
 */
const { GAMES } = require('./constants');
const { postTakumi, getTakumi } = require('./http');
const { getAccount, saveAccount, getPreferredUid } = require('./store');

/**
 * 拉取米游社绑定的游戏角色
 * @param {object} account 不传则取已保存的账号
 * @returns {Promise<{success:boolean, message?:string, roles?:Array}>}
 */
async function getGameRoles(account) {
  const acc = account || getAccount();
  if (!acc) return { success: false, message: '未登录米游社账号' };
  const cookie = { account_id: acc.account_id, cookie_token: acc.cookie_token };
  if (!cookie.cookie_token) return { success: false, message: '账号缺少 cookie_token，请重新登录' };
  try {
    const resp = await getTakumi('/binding/api/getUserGameRolesByCookie', {}, { cookie });
    if (!resp || resp.retcode !== 0) {
      return { success: false, message: `[${resp && resp.retcode}] ${resp && resp.message}` };
    }
    const roles = (resp.data.list || []).map((r) => ({
      gameBiz: r.game_biz,
      gameUid: String(r.game_uid),
      region: r.region,
      regionName: r.region_name,
      nickname: r.nickname,
      level: r.level,
      isOfficial: r.is_official,
    }));
    return { success: true, roles };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * 为某个游戏生成 authkey
 * @param {string} gameKey genshin / miliastra / starrail / zzz
 * @param {object} opts { uid, region, account }
 * @returns {Promise<{success:boolean, message?:string, authkey?:string, uid?:string, region?:string}>}
 */
async function genAuthKey(gameKey, opts = {}) {
  const game = GAMES[gameKey];
  if (!game) return { success: false, message: `未知游戏 ${gameKey}` };
  const acc = opts.account || getAccount();
  if (!acc) return { success: false, message: '未登录米游社账号' };

  let uid = opts.uid || getPreferredUid(gameKey);
  let region = opts.region || game.defaultRegion;

  if (!uid || !opts.region) {
    // 没有指定就按 biz 自动挑一个角色
    const r = await getGameRoles(acc);
    if (!r.success) return { success: false, message: `获取游戏角色失败：${r.message}` };
    const hits = r.roles.filter((x) => x.gameBiz === game.biz);
    if (hits.length === 0) return { success: false, message: `米游社账号下没有${game.label}角色` };
    const preferred = (opts.preferUids || []).map(String);
    const chosen =
      (uid && hits.find((x) => x.gameUid === String(uid))) ||
      hits.find((x) => preferred.includes(x.gameUid)) ||
      hits[0];
    uid = chosen.gameUid;
    region = chosen.region;
  }

  const cookie = { stoken: acc.stoken, mid: acc.mid };
  const body = { auth_appid: 'webview_gacha', game_biz: game.biz, game_uid: uid, region };
  try {
    const resp = await postTakumi('/binding/api/genAuthKey', body, { cookie, saltType: 'LK2', sign: true });
    if (!resp || resp.retcode !== 0) {
      return { success: false, message: `[${resp && resp.retcode}] ${resp && resp.message}` };
    }
    return { success: true, authkey: resp.data.authkey, uid: String(uid), region };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * 校验当前 cookie 是否还活着（用角色列表接口试探）
 */
async function checkLogin() {
  const acc = getAccount();
  if (!acc) return { success: false, message: '未登录' };
  const r = await getGameRoles(acc);
  if (!r.success) return { success: false, message: r.message };
  return { success: true, account: { account_id: acc.account_id, nickname: acc.nickname, updated: acc.updated }, roles: r.roles };
}

module.exports = { getGameRoles, genAuthKey, checkLogin, saveAccount };
