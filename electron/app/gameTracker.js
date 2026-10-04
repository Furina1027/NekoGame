const { spawn } = require('child_process');
const { startSession, endSession, db } = require('./database');
const { ipcMain } = require('electron');
const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');

dayjs.extend(utc);
dayjs.extend(timezone);
const trackedGames = {}; // 记录当前正在追踪的游戏状态
const chinaTimezone = 'Asia/Shanghai';
let trackingTimer = null;

// 初始化游戏列表，将游戏进程名添加到 `trackedGames` 对象中
function initializeTrackedGames() {
    db.all("SELECT id, name, path, total_time FROM games", (err, rows) => {
        if (err) {
            console.error("Error fetching games from database:", err);
            return;
        }
        // 记录本次从数据库读到的所有有效进程名
        const validProcessNames = new Set();

        rows.forEach(row => {
            const processName = row.path.split('\\').pop(); // 只保留 `game.exe`
            validProcessNames.add(processName);

            // 如果该进程已经在追踪列表中，只更新基础信息，不覆盖正在运行的 session
            if (trackedGames[processName]) {
                trackedGames[processName].id = row.id;

                if (!trackedGames[processName].isRunning) {
                    trackedGames[processName].totalTime = row.total_time;
                }
            } else {

                trackedGames[processName] = {
                    id: row.id,
                    isRunning: false,
                    sessionId: null,
                    totalTime: row.total_time
                };
            }
        });
        Object.keys(trackedGames).forEach(oldProcessName => {
            if (!validProcessNames.has(oldProcessName)) {
                delete trackedGames[oldProcessName];
            }
        });
    });
}


// 检测后台运行的进程并实时更新时长
function detectRunningGames() {
    try {
        const tasklist = spawn('tasklist', ['/FO', 'CSV']); // 输出为 CSV 格式
        let fullOutput = ''; // 用于存储完整输出
        tasklist.stdout.on('data', (data) => {
            fullOutput += data.toString(); // 累积输出数据
        });
        tasklist.on('close', (code) => {
            if (code !== 0) {
                console.error(`Tasklist exited with code ${code}`);
                return;
            }
            try {
                // 将输出解析为数组（去掉 CSV 表头）
                const processList = fullOutput
                    .split('\n')
                    .slice(1) // 去掉表头
                    .map((line) => line.split('","')[0]?.replace(/"/g, '').trim()) // 提取进程名
                Object.keys(trackedGames).forEach(processName => {
                    const game = trackedGames[processName];
                    const isRunning = processList.some((proc) => proc.toLowerCase() === processName.toLowerCase());

                    if (isRunning && !game.isRunning) {
                        game.isRunning = true;
                        startSession(game.id, (err, sessionId) => {
                            if (err) {
                                console.error("Error starting session:", err);
                            } else {
                                console.log(`Started session for ${processName}`);
                                game.sessionId = sessionId;
                                game.lastTickAt = Date.now();
                                sendRunningStatus();
                            }
                        });
                    } else if (isRunning && game.isRunning && game.sessionId) {
                        const endTime = dayjs().tz(chinaTimezone).format('YYYY-MM-DD HH:mm:ss');

                        // 进行中的会话 end_time 为空，tick 负责每 15 秒推进一次
                        db.run(`
                            UPDATE game_sessions 
                            SET end_time = ?, duration = strftime('%s', ?) - strftime('%s', start_time)
                            WHERE id = ? AND end_time IS NULL
                        `, [endTime, endTime, game.sessionId], (err) => {
                            if (err) console.error("Error updating session duration:", err);
                        });

                        // total_time 按真实时间差累加：tasklist 偶发变慢时
                        // 固定 +15 会让它和 game_sessions.duration 永久漂移
                        const now = Date.now();
                        const increment = Math.max(0, Math.round((now - (game.lastTickAt ?? now)) / 1000));
                        game.lastTickAt = now;
                        game.totalTime += increment;
                        db.run(`UPDATE games SET total_time = ? WHERE id = ?`, [game.totalTime, game.id], (err) => {
                            if (err) console.error("Error updating total time:", err);
                        });
                        sendRunningStatus();
                    } else if (!isRunning && game.isRunning && game.sessionId) {
                        game.isRunning = false;
                        // 收尾会话：绝大多数已被 tick 推进过（endSession 只补漏，
                        // 不会覆盖已有 end_time），游戏秒退时由它补上真实的短会话
                        endSession(game.id, (err) => {
                            if (err) {
                                console.error("Error ending session:", err);
                            } else {
                                console.log(`Ended session for ${processName}`);
                            }
                            game.sessionId = null;
                            sendRunningStatus();
                        });
                    }
                });
            } catch (err) {
                console.error("Error processing tasklist output:", err);
            }
        });
        tasklist.stderr.on('data', (data) => {
            console.error(`Error fetching process list: ${data.toString()}`);
        });
        tasklist.on('error', (err) => {
            console.error("Error spawning tasklist:", err);
        });
    } catch (err) {
        global.Notify(false, `发生了权限错误${err}\n如果频繁出现，请重启应用`);
        console.error("Error in detectRunningGames:", err);
    }
}

// 向前端发送游戏运行状态
function sendRunningStatus() {
    //if (!mainWindow || !mainWindow.webContents) return; // 添加保护性判断
    const runningStatus = Object.keys(trackedGames).map(processName => {
        const game = trackedGames[processName];
        return { id: game.id, isRunning: game.isRunning };
    });
    //mainWindow.webContents.send('running-status-updated', runningStatus);
    ipcMain.emit('running-status-updated', null, runningStatus);  // 发送到主进程
}


// 启动检测循环，每15秒检测一次
function startGameTracking() {
    initializeTrackedGames();
    trackingTimer = setInterval(() => detectRunningGames(), 15000);
}

// 停止检测循环。替换数据库文件前必须先停：tick 仍会尝试写已关闭的库
function stopGameTracking() {
    if (trackingTimer) {
        clearInterval(trackingTimer);
        trackingTimer = null;
    }
}

module.exports = {
    startGameTracking,
    stopGameTracking,
    initializeTrackedGames,
    sendRunningStatus
};
