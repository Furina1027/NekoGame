/**
 * 米哈游接口 HTTP 封装
 * 统一关闭代理：NekoGame 是桌面端，默认直连即可，避免被系统/环境代理劫持
 */
const axios = require('axios');
const { UA_PC, BBS_VERSION, API } = require('./constants');
const { getDS } = require('./ds');
const { getDeviceInfo } = require('./device');

const client = axios.create({
  timeout: 15000,
  proxy: false,
  headers: { 'user-agent': UA_PC },
});

/**
 * 构造通用的 takumi 请求头
 * @param {Record<string,string>} cookieObj cookie 键值对
 * @param {'GET'|'POST'} method
 * @param {Record<string, any>|string} data
 * @param {'K2'|'LK2'|'X4'|'X6'|'PROD'} saltType
 * @param {boolean} sign
 */
function buildHeaders(cookieObj, method, data, saltType = 'X4', sign = false) {
  const headers = {
    'user-agent': UA_PC,
    'x-rpc-app_version': BBS_VERSION,
    'x-rpc-client_type': '5',
    'x-requested-with': 'com.mihoyo.hyperion',
    referer: 'https://webstatic.mihoyo.com',
    'x-rpc-device_id': getDeviceInfo('device_id'),
    'x-rpc-device_fp': getDeviceInfo('device_fp'),
    ds: getDS(method, data, saltType, sign),
  };
  if (cookieObj && Object.keys(cookieObj).length > 0) {
    headers.cookie = Object.keys(cookieObj)
      .sort()
      .map((k) => `${k}=${cookieObj[k]}`)
      .join(';') + ';';
  }
  return headers;
}

/**
 * GET
 * @param {string} url
 * @param {Record<string, any>} query
 * @param {object} opts { cookie, saltType, sign, headers }
 */
async function get(url, query = {}, opts = {}) {
  const resp = await client.get(url, {
    params: query,
    headers: { ...buildHeaders(opts.cookie, 'GET', query, opts.saltType || 'X4', !!opts.sign), ...(opts.headers || {}) },
  });
  return resp.data;
}

/**
 * POST
 * @param {string} url
 * @param {object} body
 * @param {object} opts { cookie, saltType, sign, headers }
 */
async function post(url, body = {}, opts = {}) {
  const resp = await client.post(url, body, {
    headers: { ...buildHeaders(opts.cookie, 'POST', body, opts.saltType || 'X4', !!opts.sign), ...(opts.headers || {}) },
  });
  return resp.data;
}

/**
 * 带主备域名切换的 POST（takumi 主域名抽风时自动换 miyoushe）
 */
async function postTakumi(pathname, body, opts = {}) {
  try {
    return await post(`${API.takumi}${pathname}`, body, opts);
  } catch (e) {
    if (!opts.noBackup) {
      return await post(`${API.takumiBackup}${pathname}`, body, { ...opts, noBackup: true });
    }
    throw e;
  }
}

/**
 * 带主备域名切换的 GET
 */
async function getTakumi(pathname, query, opts = {}) {
  try {
    return await get(`${API.takumi}${pathname}`, query, opts);
  } catch (e) {
    if (!opts.noBackup) {
      return await get(`${API.takumiBackup}${pathname}`, query, { ...opts, noBackup: true });
    }
    throw e;
  }
}

/** 抽卡记录接口直接用裸 UA 请求，不需要 DS/cookie */
async function getGacha(url) {
  const resp = await client.get(url, { headers: { 'user-agent': UA_PC } });
  return resp.data;
}

module.exports = { client, buildHeaders, get, post, postTakumi, getTakumi, getGacha };
