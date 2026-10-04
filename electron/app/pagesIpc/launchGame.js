const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { isTrustedSender } = require('../trustedSender');

ipcMain.handle('launch-game', (event, gamePath) => {
    if (!isTrustedSender(event)) return Promise.resolve(false);
    if (typeof gamePath !== 'string' || !gamePath) {
        return Promise.reject(new Error('游戏路径无效'));
    }
    // 不经过任何 shell：之前用 PowerShell 的 Start-Process 拼接路径，
    // 路径里的引号可以被闭合逃逸成任意命令执行。
    if (!fs.existsSync(gamePath) || path.extname(gamePath).toLowerCase() !== '.exe') {
        return Promise.reject(new Error('游戏路径不存在或不是 exe 主程序'));
    }
    return new Promise((resolve, reject) => {
        spawn(gamePath, [], {
            detached: true,
            cwd: path.dirname(gamePath),
            stdio: 'ignore',
        })
            .on('error', (err) => {
                console.error(`启动游戏失败: ${err.message}`);
                reject(err);
            })
            .unref();
        console.log(`游戏启动成功: ${gamePath}`);
        resolve(true);
    });
});
