const { ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { isTrustedSender } = require('../trustedSender');

ipcMain.handle('launch-game', (event, gamePath) => {
    if (!isTrustedSender(event)) return Promise.resolve(false);
    if (typeof gamePath !== 'string' || !gamePath) {
        return Promise.reject(new Error('游戏路径无效'));
    }
    if (!fs.existsSync(gamePath)) {
        return Promise.reject(new Error('游戏路径不存在'));
    }

    // 之前用 exec(`Start-Process -FilePath "${gamePath}"`) 拼命令串，
    // 路径里的引号可以被闭合逃逸成任意命令执行。现在两条路径都不经过命令解析：
    //   .exe  → spawn 直接 CreateProcess
    //   其它  → shell.openPath 交给 ShellExecute（快捷方式、启动器等）
    // openPath 传的是路径本身而不是命令行，所以同样不存在注入面。
    if (path.extname(gamePath).toLowerCase() !== '.exe') {
        return shell.openPath(gamePath).then((errMsg) => {
            if (errMsg) {
                console.error(`启动游戏失败: ${errMsg}`);
                return Promise.reject(new Error(errMsg));
            }
            console.log(`游戏启动成功: ${gamePath}`);
            return true;
        });
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