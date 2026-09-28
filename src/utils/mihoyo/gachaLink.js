/**
 * 抽卡链接 / 记录获取
 *
 * 两条路：
 *  1. cookie 路线（原神 / 千星奇域 / 绝区零）：米游社 stoken -> genAuthKey -> 自己拼完整 URL
 *  2. 缓存路线（兜底，星穹铁道唯一可用）：走各游戏原有的 webCaches 抓取
 *
 * ⚠️ 星穹铁道不能用 cookie 路线：genAuthKey 能返回 authkey，
 *    但 getGachaLog 一律 -100 authkey error（已实测多种组合），与社区结论一致。
 */
const { GAMES } = require('./constants');
const { genAuthKey } = require('./takumi');
const { getGacha } = require('./http');

/** 各游戏在本地库里的抽卡表名，用来挑默认 UID */
const UID_TABLE = {
  genshin: 'genshin_gacha',
  miliastra: 'miliastra_gacha',
  starrail: 'starRail_gacha',
  zzz: 'zzz_gacha',
};

/**
 * 本地已有记录的 UID（按记录数从多到少）
 * 目的：多角色时默认接着已经攒了数据的那个 UID 拉，避免串号
 * @param {string} gameKey
 * @returns {Promise<string[]>}
 */
function existingUids(gameKey) {
  const table = UID_TABLE[gameKey];
  if (!table) return Promise.resolve([]);
  return new Promise((resolve) => {
    try {
      const { db2 } = require('../../app/database');
      db2.all(`SELECT uid, COUNT(*) AS c FROM ${table} GROUP BY uid ORDER BY c DESC`, (err, rows) => {
        if (err || !rows) return resolve([]);
        resolve(rows.map((r) => String(r.uid)));
      });
    } catch (e) {
      resolve([]);
    }
  });
}

/**
 * 用 authkey 拼出完整的抽卡记录请求 URL
 * @param {string} gameKey
 * @param {string} authkey
 * @param {string} uid
 * @param {string} region
 * @param {string} gachaType
 * @param {object} page { endId, size, page }
 * @returns {string}
 */
function buildGachaUrl(gameKey, authkey, uid, region, gachaType, page = {}) {
  const game = GAMES[gameKey];
  const type = String(gachaType);
  const pathname = game.ldTypes && game.ldTypes.includes(type) ? game.pathLd : game.path;
  // 参数对齐 PizzaHelper 的 GachaClient.generateGachaRequest，但**刻意去掉 real_gacha_type**。
  // 实测（ZZZ 常驻频段 1001）：
  //   精简参数                -> 5 条
  //   +real_gacha_type=1001   -> 0 条（retcode 仍是 0，静默返回空）
  //   完整集 -real_gacha_type -> 5 条
  // 逐个二分确认只有 real_gacha_type 有害。PizzaHelper 没暴露这个坑是因为它压根不支持
  // 给绝区零生成链接。其余 default_gacha_type / win_mode / os_system / device_model
  // 均单独与组合实测无害，保留下来让请求更接近官方 webview 形态。
  const params = {
    lang: 'zh-cn',
    auth_appid: 'webview_gacha',
    authkey: authkey,
    authkey_ver: '1',
    sign_type: '2',
    game_biz: game.biz,
    region: region,
    gacha_type: type,
    default_gacha_type: type,
    win_mode: 'fullscreen',
    size: String(page.size || 20),
    end_id: String(page.endId || '0'),
    page: String(page.page || 1),
    plat_type: 'pc',
    os_system: 'Windows 11',
    device_model: 'PC',
    timestamp: Math.floor(Date.now() / 1000).toString(),
  };
  const query = Object.keys(params)
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join('&');
  return `${game.base}${pathname}?${query}`;
}

/**
 * 校验一条抽卡链接是否具备可用的必要参数
 * 参考 PizzaHelper 的 GachaClient.parseGachaURL：authkey / authkey_ver / region / sign_type
 * 缺任一都拿不到数据。用于缓存抓取路线，尽早发现抓到的是残缺链接。
 * @param {string} url
 * @returns {{ok:boolean, message?:string}}
 */
function validateGachaUrl(url) {
  if (!url || !/^https?:\/\//.test(url)) return { ok: false, message: '不是合法的 http(s) 链接' };
  let q;
  try {
    q = new URL(url).searchParams;
  } catch (e) {
    return { ok: false, message: '链接解析失败' };
  }
  const need = ['authkey', 'authkey_ver', 'region', 'sign_type'];
  const missing = need.filter((k) => !q.get(k));
  if (missing.length) return { ok: false, message: `链接缺少必要参数：${missing.join(', ')}` };
  if (!/api\/get(?:Beyond|Ld)?GachaLog/.test(url)) {
    return { ok: false, message: '链接不是抽卡记录接口（getGachaLog）' };
  }
  return { ok: true };
}

/**
 * cookie 路线：取一条可用的抽卡链接
 * @param {string} gameKey
 * @param {object} opts { uid, region }
 * @returns {Promise<{success:boolean, message?:string, url?:string, uid?:string, region?:string}>}
 */
async function getGachaUrlByCookie(gameKey, opts = {}) {
  const game = GAMES[gameKey];
  if (!game) return { success: false, message: `未知游戏 ${gameKey}` };
  if (!game.cookieSupported) {
    return { success: false, message: `${game.label}不支持通过米游社换取抽卡链接` };
  }
  if (!opts.uid) opts.preferUids = opts.preferUids || (await existingUids(gameKey));
  const ak = await genAuthKey(gameKey, opts);
  if (!ak.success) return { success: false, message: ak.message };
  const url = buildGachaUrl(gameKey, ak.authkey, ak.uid, ak.region, defaultTypeOf(gameKey));
  return { success: true, url, uid: ak.uid, region: ak.region, authkey: ak.authkey };
}

function defaultTypeOf(gameKey) {
  const types = Object.keys(GAMES[gameKey].types);
  return gameKey === 'genshin' ? '301' : types[0];
}

/**
 * 用 cookie 路线直接翻页拉某个卡池
 * @param {string} gameKey
 * @param {string} authkey
 * @param {string} uid
 * @param {string} region
 * @param {string} gachaType
 * @param {(msg:string)=>void} [onProgress]
 * @returns {Promise<Array>}
 */
async function fetchPool(gameKey, authkey, uid, region, gachaType, onProgress) {
  const out = [];
  let endId = '0';
  let page = 1;
  let retries = 0;
  const label = GAMES[gameKey].types[gachaType] || gachaType;
  while (retries < 3) {
    const url = buildGachaUrl(gameKey, authkey, uid, region, gachaType, { endId, size: 20, page });
    try {
      const data = await getGacha(url);
      if (data.retcode !== 0) {
        // -100 authkey error 说明这个 authkey 本身无效，重试多少次都一样，直接放弃
        if (data.retcode === -100) {
          if (onProgress) onProgress(`[${label}] authkey 无效 [${data.retcode}] ${data.message}`);
          break;
        }
        retries++;
        if (onProgress) onProgress(`[${label}] 第 ${page} 页失败 [${data.retcode}] ${data.message}，重试 ${retries}/3`);
        // -110 visit too frequently 要退避更久，短重试只会继续被限
        await sleep(data.retcode === -110 ? 2000 + retries * 1000 : 400);
        continue;
      }
      const list = (data.data && data.data.list) || [];
      if (list.length === 0) break;
      out.push(...list);
      endId = list[list.length - 1].id;
      retries = 0;
      page++;
      if (onProgress) onProgress(`[${label}] 第 ${page - 1} 页，累计 ${out.length} 条`);
      // 跟 PizzaHelper 一致：每页随机 sleep 0.8~1.5s。
      // 实测不加延迟连续翻页会撞 -110 visit too frequently。
      await sleep(800 + Math.floor(Math.random() * 700));
    } catch (e) {
      retries++;
      if (onProgress) onProgress(`[${label}] 请求异常 ${e.message}，重试 ${retries}/3`);
      await sleep(400);
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 统一入口：先试 cookie 路线，拿不到再走原来的游戏缓存
 * @param {string} gameKey
 * @param {() => ({success:boolean, message:string})} fallback 缓存抓取函数
 * @param {object} opts { uid, region, clipboard }
 * @returns {Promise<{success:boolean, message:string, source?:'cookie'|'cache'}>}
 */
async function resolveGachaLink(gameKey, fallback, opts = {}) {
  const game = GAMES[gameKey];
  try {
    const r = await getGachaUrlByCookie(gameKey, opts);
    if (r.success) {
      if (opts.clipboard) opts.clipboard.writeText(r.url);
      return {
        success: true,
        source: 'cookie',
        message: `${game.label}抽卡链接已通过米游社获取${opts.clipboard ? '，已复制到剪贴板' : ''}。\n${r.url}`,
      };
    }
  } catch (e) {
    console.warn(`[mihoyo] ${gameKey} cookie 路线异常:`, e.message);
  }
  const fb = await fallback();
  return fb ? { ...fb, source: fb.success ? 'cache' : undefined } : fb;
}

/* ===================================================================
 * 千星奇域（miliastra / getBeyondGachaLog）
 *
 * 以下四个实现直接照搬 TeyvatGuide：
 *   - runGachaRequest  ← src/request/hk4eReq.ts:14-43（串行 + 1s 间隔）
 *   - buildBeyondUrl   ← src/request/hk4eReq.ts:170-193（8 个参数，一个不多）
 *   - fetchGachaBPool  ← src/pages/User/GachaB.vue:298-380（翻页 + 增量断点）
 *   - normalizeGachaBType ← src/plugins/Sqlite/modules/userGachaB.ts:37
 *
 * 刻意不共用上面的 buildGachaUrl：那边是给原神 / 绝区零的 16 参数版本，
 * 里面带 page / default_gacha_type，跨页漂移会和这里的 end_id 断点打架。
 * =================================================================== */

/** 串行 + 最小间隔，避免 -110 visit too frequently（hk4eReq.ts:14-43） */
const GACHA_REQUEST_INTERVAL = 1000;
let lastGachaRequestAt = 0;
let gachaRequestQueue = Promise.resolve();

async function runGachaRequest(request) {
  const previousRequest = gachaRequestQueue;
  let release;
  gachaRequestQueue = new Promise((resolve) => {
    release = resolve;
  });
  await previousRequest;
  const waitTime = GACHA_REQUEST_INTERVAL - (Date.now() - lastGachaRequestAt);
  if (waitTime > 0) {
    await sleep(waitTime);
  }
  lastGachaRequestAt = Date.now();
  try {
    return await request();
  } finally {
    if (release) release();
  }
}

/**
 * 千星奇域抽卡记录 URL，参数集严格对齐 hk4eReq.ts:175-184
 * 只有 end_id 翻页，没有 page / default_gacha_type
 * @param {string} authkey
 * @param {string} gachaType
 * @param {string} endId
 * @returns {string}
 */
function buildBeyondUrl(authkey, gachaType, endId = '0') {
  const game = GAMES.miliastra;
  const params = {
    lang: 'zh-cn',
    auth_appid: 'webview_gacha',
    authkey: authkey,
    authkey_ver: '1',
    sign_type: '2',
    gacha_type: gachaType,
    size: '5',
    end_id: endId,
  };
  const query = Object.keys(params)
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join('&');
  return `${game.base}${game.path}?${query}`;
}

/**
 * op_gacha_type 归一化。
 * 活动颂愿实际会返回 20011 / 20012 / 20021 / 20022 等细分类型，
 * TeyvatGuide 一律收敛成 2000（userGachaB.ts:37），不归一的话
 * miliastraIpc.js 的卡片池映射表会落空、UI 直接显示 "20021"。
 * @param {string} opGachaType
 * @returns {'1000'|'2000'}
 */
function normalizeGachaBType(opGachaType) {
  return String(opGachaType) === '1000' ? '1000' : '2000';
}

/**
 * 取某个池子已落库的最大 id，作为增量断点（GachaB.vue:309 的 getGachaCheck）
 * @param {string} uid
 * @param {string} gachaType 归一化后的类型
 * @returns {Promise<string>}
 */
function gachaBEndId(uid, gachaType) {
  return new Promise((resolve) => {
    try {
      const { db2 } = require('../../app/database');
      db2.get(
        'SELECT id FROM miliastra_gacha WHERE uid = ? AND gacha_type = ? ORDER BY id DESC LIMIT 1',
        [String(uid), gachaType],
        (err, row) => {
          if (err || !row || !row.id) return resolve('0');
          resolve(String(row.id));
        },
      );
    } catch (e) {
      resolve('0');
    }
  });
}

/**
 * 拉完一个卡池，端口对齐 GachaB.vue:298-380。
 * 增量语义：endId 是本地已有的最大 id，翻到某一页里出现它就停，
 * 所以重复点「刷新」不会全量重拉。
 * @param {object} opts
 * @param {string} opts.authkey
 * @param {string} opts.uid
 * @param {string} opts.gachaType '1000' | '2000'
 * @param {string} opts.gachaName
 * @param {string} [opts.endId] 增量断点，默认从 0 全量
 * @param {(msg:string)=>void} [opts.onProgress]
 * @param {(records:Array)=>Promise<void>} [opts.onBatch]
 * @returns {Promise<{success:boolean, label:string, count:number, error?:string}>}
 */
async function fetchGachaBPool(opts) {
  const { authkey, uid, gachaType, gachaName, onProgress } = opts;
  const MAX_RETRIES = 3; // GachaB.vue:113
  let endId = opts.endId || '0';
  let reqId = '0';
  let page = 0;
  let count = 0;

  for (;;) {
    page++;
    let gachaRes;
    let requestError;
    for (let retryCount = 0; retryCount <= MAX_RETRIES; retryCount++) {
      try {
        const response = await runGachaRequest(async () => {
          const data = await getGacha(buildBeyondUrl(authkey, gachaType, reqId));
          return data;
        });
        if (response && response.retcode === 0) {
          gachaRes = response;
          break;
        }
        requestError = new Error(`[${response && response.retcode}] ${(response && response.message) || '未知错误'}`);
      } catch (e) {
        requestError = e;
      }
      if (retryCount < MAX_RETRIES) {
        if (onProgress) onProgress(`[${gachaName}] 第${page}页失败，重试 ${retryCount + 1}/${MAX_RETRIES}`);
      }
    }
    // GachaB.vue:332 —— 这一池彻底失败要如实上报，不能静默当成功
    if (!gachaRes) {
      return {
        success: false,
        label: gachaName,
        count,
        error: requestError ? requestError.message : '未知错误',
      };
    }
    if (!gachaRes.data || !Array.isArray(gachaRes.data.list)) {
      return { success: false, label: gachaName, count, error: '响应数据缺少颂愿列表' };
    }
    const gachaList = gachaRes.data.list;
    // GachaB.vue:345 —— 空列表才是「抽干了」
    if (gachaList.length === 0) {
      return { success: true, label: gachaName, count };
    }
    if (onProgress) onProgress(`[${gachaName}] 第${page}页，${gachaList.length} 条`);
    if (opts.onBatch) await opts.onBatch(gachaList);
    count += gachaList.length;
    // GachaB.vue:374 —— 已经翻到本地断点，说明增量补齐了
    if (endId !== '0' && gachaList.some((i) => String(i.id) === endId)) {
      return { success: true, label: gachaName, count };
    }
    reqId = String(gachaList[gachaList.length - 1].id);
    await sleep(1000); // GachaB.vue:378
  }
}

module.exports = {
  buildGachaUrl,
  validateGachaUrl,
  getGachaUrlByCookie,
  fetchPool,
  resolveGachaLink,
  existingUids,
  buildBeyondUrl,
  normalizeGachaBType,
  gachaBEndId,
  fetchGachaBPool,
};
