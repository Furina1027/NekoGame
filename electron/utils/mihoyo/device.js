/**
 * 设备信息（device_id / device_fp）
 * 参考 TeyvatGuide：device_id 是一个 uuid v4，device_fp 固定 13 个 0。
 * 需要持久化，否则每次请求换 device_id 容易被风控。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getStoreDir() {
  if (process.env.NEKO_GAME_FOLDER_PATH) return process.env.NEKO_GAME_FOLDER_PATH;
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'NekoGame');
  } catch (e) {
    return path.join(process.env.APPDATA || '.', 'nekogame', 'NekoGame');
  }
}

const STORE = path.join(getStoreDir(), 'mihoyo_device.json');

function uuidV4() {
  return crypto.randomUUID();
}

let cached = null;

function load() {
  if (cached) return cached;
  try {
    if (fs.existsSync(STORE)) {
      cached = JSON.parse(fs.readFileSync(STORE, 'utf-8'));
      return cached;
    }
  } catch (e) {
    console.error('[mihoyo/device] 读取失败，将重新生成:', e.message);
  }
  cached = { device_id: uuidV4(), device_fp: '0000000000000' };
  try {
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(cached, null, 2), 'utf-8');
  } catch (e) {
    console.error('[mihoyo/device] 写入失败:', e.message);
  }
  return cached;
}

/**
 * 取设备信息字段
 * @param {'device_id'|'device_fp'} key
 * @returns {string}
 */
function getDeviceInfo(key) {
  return load()[key];
}

module.exports = { getDeviceInfo, STORE };
