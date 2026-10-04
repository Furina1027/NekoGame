const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');

const keyDir = () => path.join(process.env.NEKO_GAME_FOLDER_PATH, 'key');
const configFilePath = () => path.join(keyDir(), 'neko_config.neko');
const legacyKeyFilePath = () => path.join(keyDir(), 'secret_key.neko');

/**
 * 同步凭据（仓库地址 + token）以前用 AES-256-CBC 自行加密，
 * 但密钥文件和密文存在同一目录，加密等于没加密。
 * 现在统一走 safeStorage（Windows 上是 DPAPI），密钥由系统按用户保管。
 */

function encrypt(text) {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('系统不支持凭据加密（safeStorage 不可用），无法保存同步配置');
    }
    return safeStorage.encryptString(text).toString('base64');
}

function decrypt(base64) {
    return safeStorage.decryptString(Buffer.from(base64, 'base64'));
}

function saveSyncConfigToFile(repoUrl, token) {
    const payload = encrypt(JSON.stringify({ repoUrl, token }));

    fs.mkdirSync(keyDir(), { recursive: true });
    fs.writeFileSync(configFilePath(), payload, 'utf8');

    // 旧格式的密钥文件在新格式下没有用了
    if (fs.existsSync(legacyKeyFilePath())) {
        try {
            fs.rmSync(legacyKeyFilePath(), { force: true });
        } catch (err) {
            console.error('清理旧密钥文件失败:', err.message);
        }
    }

    console.log('同步配置已保存（safeStorage 加密）');
}

/* ---- 旧版 AES-256-CBC，仅用于把历史配置无损迁移到 safeStorage ---- */

function legacyDecrypt(encryptedText, secretKey, iv) {
    const ivBuffer = Buffer.from(iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', secretKey, ivBuffer);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function loadLegacyConfig(configData) {
    const config = JSON.parse(configData);
    if (!config.encryptedRepoUrl || !fs.existsSync(legacyKeyFilePath())) return null;
    const secretKey = Buffer.from(fs.readFileSync(legacyKeyFilePath(), 'utf8'), 'hex');
    return {
        repoUrl: legacyDecrypt(config.encryptedRepoUrl, secretKey, config.repoUrlIV),
        token: legacyDecrypt(config.encryptedToken, secretKey, config.tokenIV),
    };
}

// 从本地读取并解密配置
function loadSyncConfigFromFile() {
    const file = configFilePath();
    if (!fs.existsSync(file)) {
        console.error('同步配置文件不存在');
        return null;
    }

    try {
        const raw = fs.readFileSync(file, 'utf8').trim();

        if (raw.startsWith('{')) {
            // 旧格式：读出明文后立刻用 safeStorage 重新保存，完成迁移
            const creds = loadLegacyConfig(raw);
            if (!creds) {
                console.error('旧版同步配置缺少密钥文件，无法读取');
                return null;
            }
            try {
                saveSyncConfigToFile(creds.repoUrl, creds.token);
                console.log('同步配置已从旧版加密迁移到 safeStorage');
            } catch (err) {
                console.error('迁移同步配置失败（本次仍使用旧数据）:', err.message);
            }
            return { decryptedRepoUrl: creds.repoUrl, decryptedToken: creds.token };
        }

        const { repoUrl, token } = JSON.parse(decrypt(raw));
        return { decryptedRepoUrl: repoUrl, decryptedToken: token };
    } catch (err) {
        console.error('读取同步配置失败:', err.message);
        return null;
    }
}

module.exports = { saveSyncConfigToFile, loadSyncConfigFromFile };
