/**
 * 米游社扫码登录
 * 参考 TeyvatGuide src/components/pageConfig/tco-gameLogin.vue
 *   createQRLogin      -> 拿 ticket + 二维码内容
 *   queryQRLoginStatus -> 轮询，Confirmed 时返回 stoken / mid
 */
const { API, PASSPORT_APP_ID, HYPCONTAINER_VERSION } = require('./constants');
const { post, get } = require('./http');
const { getDeviceInfo } = require('./device');

function loginHeaders() {
  return {
    'x-rpc-device_id': getDeviceInfo('device_id'),
    'user-agent': `HYPContainer/${HYPCONTAINER_VERSION}`,
    'x-rpc-app_id': PASSPORT_APP_ID,
    'x-rpc-client_type': '3',
  };
}

/**
 * 创建登录二维码
 * @returns {Promise<{success:boolean, message?:string, ticket?:string, url?:string}>}
 */
async function createQrLogin() {
  const resp = await post(`${API.passport}/account/ma-cn-passport/app/createQRLogin`, {}, {
    headers: loginHeaders(),
  });
  if (!resp || resp.retcode !== 0) {
    return { success: false, message: `[${resp && resp.retcode}] ${resp && resp.message}` };
  }
  return { success: true, ticket: resp.data.ticket, url: resp.data.url };
}

/**
 * 查询扫码状态
 * @param {string} ticket
 * @returns {Promise<{success:boolean, status?:string, message?:string, account?:object}>}
 *   status: Created / Scanned / Confirmed / Expired
 */
async function queryQrLogin(ticket) {
  const resp = await post(`${API.passport}/account/ma-cn-passport/app/queryQRLoginStatus`, { ticket }, {
    headers: loginHeaders(),
  });
  if (!resp || resp.retcode !== 0) {
    // -106 = 二维码过期
    return { success: false, expired: resp && resp.retcode === -106, message: `[${resp && resp.retcode}] ${resp && resp.message}` };
  }
  const status = resp.data.status;
  if (status !== 'Confirmed') return { success: true, status };

  const info = resp.data.user_info || {};
  const token = (resp.data.tokens || [])[0] || {};
  return {
    success: true,
    status,
    account: {
      account_id: info.aid,
      ltuid: info.aid,
      stuid: info.aid,
      mid: info.mid,
      cookie_token: '',
      stoken: token.token || '',
      ltoken: '',
      nickname: info.nickname || '',
    },
  };
}

/**
 * 用 stoken 换 cookie_token / ltoken（可选，补全 cookie 方便后续接口）
 * @param {{stoken:string, mid:string, account_id:string}} acc
 */
async function fillCookieToken(acc) {
  const ck = { stoken: acc.stoken, mid: acc.mid };
  try {
    const r1 = await get(`${API.passport}/account/auth/api/getCookieAccountInfoBySToken`, { stoken: acc.stoken }, {
      cookie: { ...ck, ...(acc.account_id ? { account_id: acc.account_id } : {}) },
      saltType: 'X4',
    });
    if (r1 && r1.retcode === 0 && r1.data && r1.data.cookie_token) {
      acc.cookie_token = r1.data.cookie_token;
    }
  } catch (e) {
    console.warn('[mihoyo/passport] 获取 cookie_token 失败:', e.message);
  }
  try {
    const r2 = await post(`${API.passport}/account/auth/api/getLTokenBySToken`, { stoken: acc.stoken }, {
      cookie: ck, saltType: 'X4',
    });
    if (r2 && r2.retcode === 0 && r2.data && r2.data.ltoken) {
      acc.ltoken = r2.data.ltoken;
    }
  } catch (e) {
    console.warn('[mihoyo/passport] 获取 ltoken 失败:', e.message);
  }
  return acc;
}

module.exports = { createQrLogin, queryQrLogin, fillCookieToken };
