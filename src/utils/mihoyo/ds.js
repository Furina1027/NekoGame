/**
 * DS 签名
 * 参考 TeyvatGuide src/utils/getRequestHeader.ts
 */
const crypto = require('crypto');
const { SALT } = require('./constants');

/**
 * 取 6 位随机字符串
 * @returns {string}
 */
function randomString6() {
  const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += pool[Math.floor(Math.random() * pool.length)];
  return out;
}

/**
 * 对象按字典序拼成 query string
 * @param {Record<string, any>|string} obj
 * @returns {string}
 */
function transParams(obj) {
  if (typeof obj === 'string') return obj;
  const keys = Object.keys(obj).sort();
  return keys.map((k) => `${k}=${String(obj[k])}`).join('&');
}

/**
 * 生成 DS
 * @param {string} method GET / POST
 * @param {Record<string, any>|string} data GET 传 query，POST 传 body
 * @param {'K2'|'LK2'|'X4'|'X6'|'PROD'} saltType
 * @param {boolean} sign 是否签名模式（只 hash salt/t/r，用于 genAuthKey）
 * @returns {string} `${t},${r},${md5}`
 */
function getDS(method, data, saltType = 'X4', sign = false) {
  const salt = SALT[saltType] || SALT.X4;
  const t = Math.floor(Date.now() / 1000).toString();
  const r = sign ? randomString6() : Math.floor(Math.random() * 100001 + 100000).toString();
  const str = typeof data === 'string' ? data : transParams(data);
  let hashStr;
  if (sign) {
    hashStr = `salt=${salt}&t=${t}&r=${r}`;
  } else {
    const body = method === 'GET' ? '' : str;
    const query = method === 'GET' ? str : '';
    hashStr = `salt=${salt}&t=${t}&r=${r}&b=${body}&q=${query}`;
  }
  return `${t},${r},${crypto.createHash('md5').update(hashStr).digest('hex')}`;
}

module.exports = { getDS, transParams, randomString6 };
