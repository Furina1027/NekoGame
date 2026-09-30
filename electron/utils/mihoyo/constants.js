/**
 * 米游社 / 米哈游接口常量与三游戏抽卡接口配置
 *
 * 数据来源（均已在真机实测通过，见 _tmp 测试脚本）：
 * - 接口地址取自游戏 webCaches 缓存中真实的 getGachaLog 请求
 * - genAuthKey 与 DS 算法参考 TeyvatGuide
 */

const BBS_VERSION = '2.112.0';

/** PC 端米游社 UA，所有 takumi 请求统一使用 */
const UA_PC = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) miHoYoBBS/${BBS_VERSION}`;

/**
 * DS salt，2.112.0 版本
 *
 * LK2 有两个社区流传值，实测**都能**通过 genAuthKey（返回 retcode=0、344 位 authkey），
 * 但签出来的 authkey 内容不同，两者对崩铁都无效：
 *  - 720eebad…  TeyvatGuide 用
 *  - AUtLYA9P…  PizzaHelper / Snap.Hutao 用（他们源码里注明 "The following salts are LK2.
 *                Intelligence provided by Snap.Hutao"）
 * 默认用 TeyvatGuide 的（原神、千星、绝区零均已实测跑通）。
 */
const SALT = {
  K2: '5e54bba5a8acdf5981ae2c95e528d56f',
  LK2: '720eebad04f745764ea4413fe603f3a9',
  /** PizzaHelper / Snap.Hutao 的 LK2，作为备选 */
  LK2_HUTAO: 'AUtLYA9P6PLDXW6VC7pEBDLRarap3RsA',
  X4: 'xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs',
  X6: 't0qEgfub6cvueAPgR5m9aQWWVciEer7v',
  PROD: 't0qEgfub6cvueAPgR5m9aQWWVciEer7v',
};

const API = {
  /** takumi 主站（国服） */
  takumi: 'https://api-takumi.mihoyo.com',
  /** 备用域名，主域名异常时可切换 */
  takumiBackup: 'https://api-takumi.miyoushe.com',
  /** passport，扫码登录用 */
  passport: 'https://passport-api.mihoyo.com',
};

/** 扫码登录使用的 app_id（米游社） */
const PASSPORT_APP_ID = 'ddxf5dufpuyo';
/** HYPContainer UA 里的启动器版本 */
const HYPCONTAINER_VERSION = '1.3.3.182';

/**
 * 游戏配置
 * - biz / region 用于 genAuthKey
 * - base + path 组成抽卡记录接口，pathLd 是联动卡池专用路径
 * - cookieSupported: genAuthKey 换出来的 authkey 是否真的能用于该游戏的抽卡接口
 *   ⚠️ 星穹铁道实测为 false：genAuthKey 返回 retcode=0 且给出 344 位 authkey，
 *      但调 getGachaLog 一律返回 -100 authkey error（换域名/换路径/带不带 region 都一样）。
 *      原神、绝区零同流程均正常。所以崩铁仍然走游戏缓存。
 */
const GAMES = {
  genshin: {
    key: 'genshin',
    label: '原神',
    biz: 'hk4e_cn',
    defaultRegion: 'cn_gf01',
    base: 'https://public-operation-hk4e.mihoyo.com',
    path: '/gacha_info/api/getGachaLog',
    cookieSupported: true,
    types: {
      100: '新手祈愿',
      200: '常驻祈愿',
      301: '角色活动祈愿',
      302: '武器活动祈愿',
      400: '角色活动祈愿-2',
      500: '集录祈愿',
    },
  },
  miliastra: {
    key: 'miliastra',
    label: '千星奇域',
    biz: 'hk4e_cn',
    defaultRegion: 'cn_gf01',
    base: 'https://public-operation-hk4e.mihoyo.com',
    path: '/gacha_info/api/getBeyondGachaLog',
    cookieSupported: true,
    types: {
      1000: '常驻颂愿',
      2000: '活动颂愿',
    },
  },
  starrail: {
    key: 'starrail',
    label: '崩坏：星穹铁道',
    biz: 'hkrpg_cn',
    defaultRegion: 'prod_gf_cn',
    base: 'https://public-operation-hkrpg.mihoyo.com',
    // 取自本机游戏 webCaches 里真实请求的路径。
    // PizzaHelper 源码里用的是 /common/gacha_record/api/getGachaLog（少了 hkrpg_ 前缀），
    // 这两个路径我都实测过，配合两种 LK2 salt，共 8 种组合全是 -100 authkey error。
    path: '/common/hkrpg_gacha_record/api/getGachaLog',
    pathLd: '/common/hkrpg_gacha_record/api/getLdGachaLog',
    cookieSupported: false,
    types: {
      1: '常驻跃迁',
      2: '新手跃迁',
      11: '角色活动跃迁',
      12: '光锥活动跃迁',
      21: '角色联动跃迁',
      22: '光锥联动跃迁',
    },
    /** 走 pathLd 的卡池 */
    ldTypes: ['21', '22'],
  },
  zzz: {
    key: 'zzz',
    label: '绝区零',
    biz: 'nap_cn',
    defaultRegion: 'prod_gf_cn',
    // public-operation-common.mihoyo.com 是本机缓存里抓到的真实 host，且实测能拉到数据。
    // PizzaHelper 用的是 public-operation-nap.mihoyo.com，未验证，作为备选。
    base: 'https://public-operation-common.mihoyo.com',
    path: '/common/gacha_record/api/getGachaLog',
    cookieSupported: true,
    types: {
      1001: '常驻频段',
      2001: '独家频段',
      3001: '音擎频段',
      5001: '邦布频段',
      12001: '独家重映',
      13001: '音擎回响',
    },
  },
};

/** 千星奇域与原神共用 hk4e_cn，用 gacha_type 区分 */
const GAME_BY_BIZ = {
  hk4e_cn: ['genshin', 'miliastra'],
  hkrpg_cn: ['starrail'],
  nap_cn: ['zzz'],
};

module.exports = {
  BBS_VERSION,
  UA_PC,
  SALT,
  API,
  PASSPORT_APP_ID,
  HYPCONTAINER_VERSION,
  GAMES,
  GAME_BY_BIZ,
};
