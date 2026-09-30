/**
 * 米游社账号存储
 * stoken 是高权限凭据，必须用 Electron safeStorage 加密落盘；
 * 万一加密不可用（Linux 无 keyring 等情况）退化为明文并打日志警告。
 */
const fs = require('fs');
const path = require('path');
const { safeStorage, app } = require('electron');

function getStoreDir() {
  if (process.env.NEKO_GAME_FOLDER_PATH) return process.env.NEKO_GAME_FOLDER_PATH;
  return path.join(app.getPath('userData'), 'NekoGame');
}

const FILE = () => path.join(getStoreDir(), 'mihoyo_account.dat');

/** 当前内存中的账号 */
let current = null;

function readRaw() {
  const file = FILE();
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  let text = buf.toString('utf-8');
  if (text.startsWith('ENC:')) {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('[mihoyo/store] 加密数据但本机不支持解密');
      return null;
    }
    text = safeStorage.decryptString(Buffer.from(text.slice(4), 'base64'));
  }
  return JSON.parse(text);
}

function writeRaw(obj) {
  const file = FILE();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = JSON.stringify(obj);
  let out;
  if (safeStorage.isEncryptionAvailable()) {
    out = 'ENC:' + safeStorage.encryptString(text).toString('base64');
  } else {
    console.warn('[mihoyo/store] safeStorage 不可用，cookie 将以明文保存');
    out = text;
  }
  fs.writeFileSync(file, out, 'utf-8');
}

/**
 * 读取已保存的账号
 * @returns {null|{account_id:string, mid:string, stoken:string, cookie_token:string, ltoken:string, nickname:string, updated:string, preferred:Record<string,string>}}
 */
function getAccount() {
  if (current) return current;
  try {
    current = readRaw();
  } catch (e) {
    console.error('[mihoyo/store] 读取账号失败:', e.message);
    current = null;
  }
  return current;
}

function saveAccount(acc) {
  acc.updated = new Date().toISOString();
  acc.preferred = acc.preferred || {};
  writeRaw(acc);
  current = acc;
  return acc;
}

function clearAccount() {
  current = null;
  try {
    if (fs.existsSync(FILE())) fs.unlinkSync(FILE());
  } catch (e) {
    console.error('[mihoyo/store] 删除账号文件失败:', e.message);
  }
}

/**
 * 记录某个游戏选用的 UID（一个米游社号可能有多个同游戏角色）
 * @param {string} gameKey
 * @param {string} uid
 */
function setPreferredUid(gameKey, uid) {
  const acc = getAccount();
  if (!acc) return;
  acc.preferred[gameKey] = String(uid);
  saveAccount(acc);
}

function getPreferredUid(gameKey) {
  const acc = getAccount();
  return acc && acc.preferred ? acc.preferred[gameKey] : null;
}

module.exports = {
  getAccount,
  saveAccount,
  clearAccount,
  setPreferredUid,
  getPreferredUid,
  FILE,
};
