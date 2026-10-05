const { BrowserWindow, ipcMain, shell, app } = require('electron');
const { saveSyncConfigToFile, loadSyncConfigFromFile } = require('./syncSettings');
const path = require("path");
const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');
const { closeDatabases } = require('../database');
const { stopGameTracking } = require('../gameTracker');
const { isTrustedSender } = require('../trustedSender');

let dataSyncWindow = null;
function createDataSyncWindow() {
    if (dataSyncWindow) {
        return;
    }
    dataSyncWindow = new BrowserWindow({
        width: 520,
        height: 560,
        minWidth: 460,
        minHeight: 420,
        resizable: true,
        parent: global.mainWindow ?? null,
        modal: true,
        show: false,
        backgroundColor: '#16161c',
        frame: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true, // 开启上下文隔离
            preload: path.join(__dirname, '../../preload.js')
        }
    });
    // 数据同步窗口同样走 app:// 协议（file:// 下 ES module 会被 CORS 拦截）
    if (process.env.VITE_DEV_SERVER_URL) {
        dataSyncWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL.replace(/index\.html.*$/, '')}dataSync.html`);
    } else {
        dataSyncWindow.loadURL('app://neko/dataSync.html');
    }
    // 窗口加载完毕后显示
    dataSyncWindow.once('ready-to-show', () => {
        dataSyncWindow.show();
    });
    dataSyncWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isHttpUrl(url)) shell.openExternal(url);
        return { action: 'deny' };
    });

    // 拦截导航事件，阻止内部导航并改为默认浏览器打开
    dataSyncWindow.webContents.on('will-navigate', (event, url) => {
        if (url !== dataSyncWindow.webContents.getURL()) {
            event.preventDefault(); // 阻止导航
            if (isHttpUrl(url)) shell.openExternal(url);
        }
    });
    // 关闭窗口时清理引用
    dataSyncWindow.on('closed', () => {
        dataSyncWindow.destroy();
        dataSyncWindow = null;
    });
}

/** 只放行网页链接，file:/// 等协议在 Windows 上会被 ShellExecute 直接执行 */
function isHttpUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}
// 监听前端发送的 'openDataSyncWindow' 事件，创建数据同步窗口
ipcMain.on('openDataSyncWindow', () => {
    createDataSyncWindow();
});

// 监听前端发送的 'saveSyncSettings' 事件，保存同步设置
ipcMain.on('saveSyncSettings', (event, { repoUrl, token }) => {
    if (!isTrustedSender(event)) return;
    try {
        // 保存加密配置信息到文件
        saveSyncConfigToFile(repoUrl, token);
        event.reply('syncSettingsStatus', { success: true, message: '同步设置已成功更新并已经上传数据、之后每次启动应用后会自动同步数据' });
    } catch (error) {
        console.error('保存设置失败:', error);
        event.reply('syncSettingsStatus', { success: false, message: `保存失败: ${error.message}` });
    }
});
ipcMain.on('uploadFirstData', async (event) => {
    if (!isTrustedSender(event)) return;
    try {
        await initUpload({ allowRestart: false });  // 手动触发的上传不重启应用
        event.reply('syncSettingsStatus', { success: true, message: '数据上传成功' });
    } catch (error) {
        console.error('初始化数据失败:', error);
        event.reply('syncSettingsStatus', { success: false, message: `同步失败: ${error.message}` });
    }
});

// 回显已保存的同步配置：没有这条通道，用户每次打开窗口都得重新输入仓库地址和令牌
ipcMain.handle('load-sync-settings', (event) => {
    if (!isTrustedSender(event)) return null;
    const config = loadSyncConfigFromFile();
    return config ? { repoUrl: config.decryptedRepoUrl, token: config.decryptedToken } : null;
});

ipcMain.on('downloadLastedData', async (event, { repoUrl, token } = {}) => {
    if (!isTrustedSender(event)) return;
    try {
        // 输入留空时回退到已保存的配置
        const saved = loadSyncConfigFromFile();
        const effectiveRepoUrl = repoUrl || saved?.decryptedRepoUrl;
        const effectiveToken = token || saved?.decryptedToken;
        if (!effectiveRepoUrl || !effectiveToken) {
            throw new Error('请先填写仓库地址和访问令牌，或先保存过同步设置');
        }

        await restoreDatabasesFromRepo(effectiveRepoUrl, effectiveToken);

        event.reply('syncSettingsStatus', { success: true, message: '云端数据已下载，正在重启应用以完成替换...' });
    } catch (error) {
        console.error('下载失败:', error);
        event.reply('syncSettingsStatus', { success: false, message: `下载失败: ${error.message}` });
    }
});

/**
 * 从仓库拉取两个数据库文件到临时文件，全部成功后
 * 停止追踪 → 关闭数据库连接 → 原子替换 → 重启应用。
 * 之前的实现直接 writeFileSync 覆盖「正被打开」的 SQLite 文件，
 * 页缓存和文件句柄都还挂着，几乎必然把库写坏。
 */
async function restoreDatabasesFromRepo(repoUrl, token) {
    const dataDir = process.env.NEKO_GAME_FOLDER_PATH;
    const files = [
        { fileName: 'neko_game.db', localPath: path.join(dataDir, 'neko_game.db') },
        { fileName: 'gacha_data.db', localPath: path.join(dataDir, 'gacha_data.db') },
    ];

    // 先把两个文件都完整拉到临时路径，任何一个失败都不碰本地数据
    const tmpFiles = [];
    try {
        for (const { fileName, localPath } of files) {
            const blob = await fetchFileFromRepo(repoUrl, token, fileName);
            const tmpPath = `${localPath}.downloading`;
            fs.writeFileSync(tmpPath, blob);
            tmpFiles.push({ tmpPath, localPath, fileName });
        }
    } catch (error) {
        for (const { tmpPath } of tmpFiles) {
            try { fs.rmSync(tmpPath, { force: true }); } catch { /* 尽力清理 */ }
        }
        throw error;
    }

    // 备份当前文件（restoreDatabasesFromRepo 失败时还能从备份找回）
    for (const { localPath, fileName } of tmpFiles) {
        if (fs.existsSync(localPath)) await backupFile(localPath, fileName);
    }

    eventSafeNotify(true, '云端数据校验完成，正在重启应用以替换本地数据库...');

    // 给窗口一点时间把提示显示出来，再执行不可逆的替换
    setTimeout(async () => {
        stopGameTracking();
        await closeDatabases();

        const movedBackups = [];
        const swappedIn = [];
        try {
            for (const { tmpPath, localPath } of tmpFiles) {
                // 先把旧文件挪走再换上新文件：替换中途出错可以整体回滚
                const backupPath = `${localPath}.replacing`;
                if (fs.existsSync(localPath)) {
                    fs.renameSync(localPath, backupPath);
                    movedBackups.push(backupPath);
                }
                fs.renameSync(tmpPath, localPath);
                swappedIn.push(localPath);
            }
        } catch (error) {
            console.error('替换数据库失败，尝试回滚:', error);
            // 只清理真正换上去了的那些文件。没换成功的 localPath 要原样保留，
            // 早先的写法对所有 tmpFiles 无差别 rmSync，会在还没有回滚文件可用的
            // 情况下把原库删掉。
            for (const localPath of swappedIn) {
                try { fs.rmSync(localPath, { force: true }); } catch { /* 忽略 */ }
            }
            for (const backupPath of movedBackups) {
                try { fs.renameSync(backupPath, backupPath.replace(/\.replacing$/, '')); } catch { /* 忽略 */ }
            }
            eventSafeNotify(false, `替换数据库失败: ${error.message}`);
            setTimeout(() => app.relaunch() || app.exit(1), 2000);
            return;
        }

        // 替换成功，清掉挪走的旧文件
        for (const backupPath of movedBackups) {
            try { fs.rmSync(backupPath, { force: true }); } catch { /* 忽略 */ }
        }
        app.relaunch();
        app.exit(0);
    }, 1500);
}

function eventSafeNotify(success, message) {
    console.log(`[sync] ${message}`);
    global.Notify(success, message);
}

// 监听关闭数据同步窗口的事件
ipcMain.on('closeDataSyncWindow', () => {
    if (dataSyncWindow) {
        dataSyncWindow.close();  // 关闭数据同步窗口
    }
});

// 获取当前文件的时间戳
function getFileTimestamp(filePath) {
    // 本地文件一定存在时，可直接读取
    try {
        const stats = fs.statSync(filePath);
        return Math.floor(stats.mtime.getTime() / 1000) * 1000;  // 转换为毫秒级时间戳
    } catch (e) {
        console.warn(`无法获取文件时间戳: ${filePath}`, e.message);
        return null;
    }
}


// 获取文件的时间戳
async function getFileTimestampFromRepo(repoUrl, token, fileName) {
    const { owner, repo, platform } = parseRepoUrl(repoUrl);
    // console.log('owner,repo,platform', owner, repo, platform);

    let apiUrl, commitResponse;
    if (platform === 'gitee') {
        // 确保路径和分支名正确
        apiUrl = `https://gitee.com/api/v5/repos/${owner}/${repo}/commits?path=NekoGame/${fileName}`;
    } else if (platform === 'github') {
        apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits?path=NekoGame/${fileName}`;
    } else {
        throw new Error('不支持的仓库平台');
    }
    try {
        // 设置请求头
        let headers = {};
        if (platform === 'github') {
            headers['Authorization'] = `token ${token}`;  // GitHub 的 token 使用 Authorization 头
        }
        let params = {};
        if (platform === 'gitee') {
            params.access_token = token;  // Gitee 使用查询参数传递 token
        }
        commitResponse = await axios.get(apiUrl, { headers: headers, params: params });
        console.log('apiUrl', apiUrl);
        // console.log('commitResponse信息', JSON.stringify(commitResponse.data));

        if (commitResponse.data && commitResponse.data.length > 0) {
            const commitDate = commitResponse.data[0].commit.committer.date;
            console.log('文件最新提交时间戳:', commitDate);
            return new Date(commitDate).getTime();  // 返回最新提交的时间戳
        } else {
            console.error('没有找到文件的提交记录');
            return null;
        }
    } catch (error) {
        console.error('获取文件时间戳失败:', error);
        return null;
    }
}


// 解析 仓库的 URL，获取 owner 和 repo
function parseRepoUrl(repoUrl) {
    const giteeRegex = /https:\/\/gitee\.com\/([^\/]+)\/([^\/]+)/;
    const githubRegex = /https:\/\/github\.com\/([^\/]+)\/([^\/]+)/;
    let matches;

    if ((matches = repoUrl.match(giteeRegex))) {
        return {
            owner: matches[1],
            repo: matches[2],
            platform: 'gitee'
        };
    } else if ((matches = repoUrl.match(githubRegex))) {
        return {
            owner: matches[1],
            repo: matches[2],
            platform: 'github'
        };
    } else {
        throw new Error('无效的仓库 URL');
    }
}

// 检查文件是否已存在于仓库中
async function checkFileExists(repoUrl, token, fileName, platform) {
    const { owner, repo } = parseRepoUrl(repoUrl);
    let apiUrl;

    if (platform === 'gitee') {
        // Gitee API 请求，使用 access_token 作为 URL 参数
        apiUrl = `https://gitee.com/api/v5/repos/${owner}/${repo}/contents/NekoGame/${fileName}`;
    } else if (platform === 'github') {
        // GitHub API 请求，使用 Authorization header 传递 token
        apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/NekoGame/${fileName}`;
    } else {
        throw new Error('不支持的仓库平台');
    }

    try {
        const headers = platform === 'github' ? {
            'Authorization': `Bearer ${token}` // 使用 Bearer token 进行身份验证
        } : {}; // 对于 Gitee，不需要额外的 headers

        const response = await axios.get(apiUrl, {
            params: platform === 'gitee' ? { access_token: token } : {}, // 对于 Gitee 使用 access_token 作为 URL 参数
            headers: headers
        });

        // 返回文件的 SHA 值
        return response.data.sha;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return null; // 文件不存在
        }
        throw error; // 其他错误
    }
}


// 上传文件到仓库
async function uploadFileToRepo(repoUrl, token, filePath, fileName) {
    let platformMessage = '';
    const maxRetries = 3; // 最大重试次数
    let retries = 0;

    try {
        const { owner, repo, platform } = parseRepoUrl(repoUrl);
        platformMessage = platform;

        const fileContent = fs.readFileSync(filePath);
        const base64Content = fileContent.toString('base64');

        let apiUrl;
        if (platform === 'gitee') {
            apiUrl = `https://gitee.com/api/v5/repos/${owner}/${repo}/contents/NekoGame/${fileName}`;
        } else if (platform === 'github') {
            apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/NekoGame/${fileName}`;
        } else {
            throw new Error('不支持的仓库平台');
        }

        // 检查文件是否存在，存在返回 sha，不存在返回 null
        const existingSha = await checkFileExists(repoUrl, token, fileName, platform);

        // 统一先 PUT
        const data = existingSha
          ? { message: 'NekoGame数据文件', content: base64Content, sha: existingSha }
          : { message: 'NekoGame数据文件', content: base64Content };

        try {
            const response = await axios.put(apiUrl, data, {
                headers: platform === 'github' ? { Authorization: `Bearer ${token}` } : {},
                params: platform === 'gitee' ? { access_token: token } : {}
            });
            console.log(fileName, '更新/创建成功 (PUT)', response.data?.commit?.message || '');
            return;
        } catch (putErr) {
            // GitHub: 不支持 /contents 的 POST 创建，直接抛错
            if (platform !== 'gitee') throw putErr;

            const postData = { message: 'NekoGame数据文件', content: base64Content };
            console.log(`尝试上传文件 (POST): ${fileName}`);
            while (retries < maxRetries) {
                try {
                    const response = await axios.post(apiUrl, postData, {
                        headers: {},
                        params: { access_token: token }
                    });
                    console.log(fileName, '上传成功 (POST)', response.data?.commit?.message || '');
                    return;
                } catch (postErr) {
                    retries++;
                    console.error(`POST 上传失败 (尝试 ${retries}/${maxRetries}):`, postErr.message);
                    if (retries >= maxRetries) throw postErr;
                    await new Promise(r => setTimeout(r, 500));
                }
            }
        }
    } catch (error) {
        let errorMessage = `${fileName}上传失败\n平台:${platformMessage}\n`;
        if (error.response) {
            const status = error.response.status;
            if (status === 401) errorMessage += '认证失败：Token 可能无效或权限不足';
            else if (status === 403) errorMessage += '权限不足或 API 受限（可能限流）';
            else if (status === 404) errorMessage += '路径不存在（检查 NekoGame/ 目录与文件名）';
            else errorMessage += `HTTP ${status}: ${error.response.data?.message || '未知错误'}`;
        } else {
            errorMessage += error.message;
        }
        global.Notify(false, errorMessage);
        console.error('数据上传失败:', error);
        throw error; // 让上层感知
    }
}


const {backupFile} = require("./backupData");
// 从仓库下载文件，返回二进制内容（不落盘，由调用方决定写到哪里）
async function fetchFileFromRepo(repoUrl, token, fileName) {
    const { owner, repo, platform } = parseRepoUrl(repoUrl);
    let apiUrl;

    if (platform === 'gitee') {
        apiUrl = `https://gitee.com/api/v5/repos/${owner}/${repo}/contents/NekoGame/${fileName}`;
    } else if (platform === 'github') {
        apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/NekoGame/${fileName}`;
    } else {
        throw new Error('不支持的仓库平台');
    }

    try {
        const headers = platform === 'github' ? { Authorization: `Bearer ${token}` } : {};
        const params  = platform === 'gitee'  ? { access_token: token } : {};

        // 先拿元数据
        const meta = await axios.get(apiUrl, { params, headers });

        if (platform === 'github' && meta.data?.download_url) {
            // 优先使用 download_url 直下二进制
            const bin = await axios.get(meta.data.download_url, { responseType: 'arraybuffer', headers });
            return Buffer.from(bin.data);
        }
        if (meta.data?.content) {
            // 回退到 content base64
            return Buffer.from(meta.data.content, 'base64');
        }
        throw new Error('无法从 API 获取文件内容（content 为空且无 download_url）');
    } catch (error) {
        const detail = error.response ? error.response.data?.message || error.message : error.message;
        eventSafeNotify(false, `${fileName}下载失败\n平台:${platform}\n${detail}`);
        console.error('数据下载失败:', error);
        throw error;
    }
}

// 计算文件的 hash 值
function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256');
  hash.update(fileBuffer);
  return hash.digest('hex');  // 返回文件的 hash 值
}

// 数据同步代码：判断单个文件应该上传、下载还是跳过
async function planFileSync(repoUrl, token, localFilePath, fileName) {
    const localFileTimestamp = getFileTimestamp(localFilePath);
    if (localFileTimestamp === null) {
        console.log('本地文件不存在或无法读取，跳过同步逻辑。');
        return 'skip';
    }
    const remoteFileTimestamp = await getFileTimestampFromRepo(repoUrl, token, fileName);
    if (remoteFileTimestamp === null) {
        // 仓库里没有这个文件，上传本地文件
        console.log(fileName, '在仓库中不存在，上传本地文件...');
        return 'upload';
    }
    // 时间容差。上传后本地 mtime 与远端 commit 时间天然有先后差，
    // 容差太小会把「自己刚上传的」再下载/上传一遍
    const TIME_TOLERANCE = 6000000; // 100 分钟
    const timeDiff = Math.abs(localFileTimestamp - remoteFileTimestamp);
    if (timeDiff <= TIME_TOLERANCE) {
        console.log(fileName, '本地文件和仓库中文件时间差异较小，无需同步');
        return 'skip';
    }
    return localFileTimestamp > remoteFileTimestamp ? 'upload' : 'download';
}

/**
 * 一次开机只允许因「云端较新」自动重启一次。
 * 下载会刷新本地 mtime，重启后再同步会走上传分支，正常不会成环；
 * 这个标记兜底网络/时钟异常导致的循环重启。
 */
const SYNC_RESTART_MARKER = () => path.join(process.env.NEKO_GAME_FOLDER_PATH, '.sync-restarted');
const SYNC_RESTART_COOLDOWN = 10 * 60 * 1000;

function syncRestartOnCooldown() {
    const marker = SYNC_RESTART_MARKER();
    try {
        if (fs.existsSync(marker) && Date.now() - fs.statSync(marker).mtimeMs < SYNC_RESTART_COOLDOWN) {
            return true;
        }
        fs.writeFileSync(marker, String(Date.now()));
    } catch { /* 标记写不进去就放行，替换本身仍受事务回滚保护 */ }
    return false;
}

// 初始化上传下载
async function initUpload({ allowRestart = true } = {}) {
    const config = loadSyncConfigFromFile();
    if (!config) return;

    const { decryptedRepoUrl: repoUrl, decryptedToken: token } = config;
    const dataDir = process.env.NEKO_GAME_FOLDER_PATH;
    const files = [
        { fileName: 'neko_game.db', localPath: path.join(dataDir, 'neko_game.db') },
        { fileName: 'gacha_data.db', localPath: path.join(dataDir, 'gacha_data.db') },
    ];

    // 先对两个文件都判定方向，再统一执行：避免一半上传一半下载时序交错
    const plans = [];
    for (const file of files) {
        const action = await planFileSync(repoUrl, token, file.localPath, file.fileName);
        if (action !== 'skip') plans.push({ ...file, action });
    }

    const downloads = plans.filter((p) => p.action === 'download');
    const uploads = plans.filter((p) => p.action === 'upload');

    if (downloads.length > 0) {
        // 云端较新：下载到临时文件后整体替换并重启，绝不覆写打开中的 SQLite
        if (!allowRestart) {
            eventSafeNotify(false, '云端数据较新，已跳过自动下载。\n请使用「从云端覆盖本地数据」手动恢复。');
            for (const p of uploads) {
                await uploadFileToRepo(repoUrl, token, p.localPath, p.fileName);
            }
            return;
        }
        if (syncRestartOnCooldown()) {
            eventSafeNotify(false, '检测到云端数据较新，但刚刚已同步重启过一次，本次跳过。\n可稍后手动使用「从云端覆盖本地数据」。');
            return;
        }
        await restoreDatabasesFromRepo(repoUrl, token);
        return;
    }

    for (const p of uploads) {
        await uploadFileToRepo(repoUrl, token, p.localPath, p.fileName);
    }
}

module.exports = { initUpload };
