const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');

dayjs.extend(utc);
dayjs.extend(timezone);
const chinaTimezone = 'Asia/Shanghai';

// 全库统一的时间格式（本地墙钟）。之前 start_time 写本地格式、
// endSession 写 ISO 格式，字符串比较永远错位，派生出多条死逻辑。
const TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const nowLocal = () => dayjs().tz(chinaTimezone).format(TIME_FORMAT);


// 获取 nekoGameFolderPath
const nekoGameFolderPath = process.env.NEKO_GAME_FOLDER_PATH;

const db = new sqlite3.Database(path.join(nekoGameFolderPath, "neko_game.db"), (err) => {
    if (err) {
        console.error("Database connection failed:", err.message);
    } else {
        console.log("Connected to the database.");
    }
});
const db2 = new sqlite3.Database(path.join(nekoGameFolderPath, "gacha_data.db"), (err) => {
    if (err) {
        console.error("Database connection failed:", err.message);
    } else {
        console.log("Connected to the database.");
    }
});


// 初始化数据库函数
function initializeDatabase() {
    db.serialize(() => {
        // 创建 games 表
        db.run(`
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                icon BLOB,
                poster_vertical BLOB,
                poster_horizontal BLOB,
                path TEXT UNIQUE NOT NULL,
                total_time INTEGER DEFAULT 0
            )
        `, (err) => {
            if (err) {
                console.error("Error creating games table:", err.message);
            } else {
                console.log("Games table created or already exists.");
            }
        });

        // 创建 game_sessions 表
        db.run(`
            CREATE TABLE IF NOT EXISTS game_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                end_time TIMESTAMP,
                duration INTEGER,
                FOREIGN KEY (game_id) REFERENCES games (id)
            )
        `, (err) => {
            if (err) {
                console.error("Error creating game_sessions table:", err.message);
            } else {
                console.log("Game_sessions table created or already exists.");
            }
        });

        // 新增设置表
        db.run(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `, (err) => {
            if (err) {
                console.error("Error creating settings table:", err.message);
            } else {
                console.log("Settings table created or already exists.");
            }
        });

        // 创建分析数据缓存表
        db.run(`
            CREATE TABLE IF NOT EXISTS analysis_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                analysis_type TEXT NOT NULL,
                date DATE NOT NULL,
                data TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(analysis_type, date)
            )
        `, (err) => {
            if (err) console.error("Error creating analysis_cache table:", err.message);
            else console.log("Analysis cache table created or already exists.");
        });

        // 创建索引以优化查询性能
        db.run(`
            CREATE INDEX IF NOT EXISTS idx_game_sessions_game_id ON game_sessions (game_id)
        `, (err) => {
            if (err) {
                console.error("Error creating index on game_sessions (game_id):", err.message);
            } else {
                console.log("Index on game_sessions (game_id) created or already exists.");
            }
        });

        db.run(`
            CREATE INDEX IF NOT EXISTS idx_game_sessions_start_time ON game_sessions (start_time)
        `, (err) => {
            if (err) {
                console.error("Error creating index on game_sessions (start_time):", err.message);
            } else {
                console.log("Index on game_sessions (start_time) created or already exists.");
            }
        });
    });
    db2.serialize(() => {
        db2.run(`
            CREATE TABLE IF NOT EXISTS starRail_gacha (
                id TEXT PRIMARY KEY,
                uid TEXT NOT NULL,
                gacha_id TEXT NOT NULL,
                gacha_type TEXT NOT NULL,
                item_id TEXT,
                count INTEGER,
                time TEXT NOT NULL,
                name TEXT,
                lang TEXT,
                item_type TEXT,
                rank_type INTEGER
            );
        `, (err) => {
            if (err) {
                console.error("Failed to initialize starRail_gacha table:", err.message);
            } else {
                console.log("starRail_gacha table initialized successfully.");
            }
        });
        db2.run(`
            CREATE TABLE IF NOT EXISTS genshin_gacha (
                id TEXT PRIMARY KEY,
                uid TEXT NOT NULL,
                gacha_id TEXT,
                gacha_type TEXT NOT NULL,
                item_id TEXT DEFAULT '',
                count INTEGER,
                time TEXT NOT NULL,
                name TEXT,
                lang TEXT,
                item_type TEXT,
                rank_type INTEGER
            );
        `, (err) => {
            if (err) {
                console.error("Failed to initialize genshin_gacha table:", err.message);
            } else {
                console.log("genshin_gacha table initialized successfully.");
            }
        });
        db2.run(`
            CREATE TABLE IF NOT EXISTS zzz_gacha (
                id TEXT PRIMARY KEY,
                uid TEXT NOT NULL,
                gacha_id TEXT,
                gacha_type TEXT NOT NULL,
                item_id TEXT,
                count INTEGER,
                time TEXT NOT NULL,
                name TEXT,
                lang TEXT,
                item_type TEXT,
                rank_type INTEGER
            );
        `, (err) => {
            if (err) {
                console.error("Failed to initialize zzz_gacha table:", err.message);
            } else {
                console.log("zzz_gacha table initialized successfully.");
            }
        });
        db2.run(`
            CREATE TABLE IF NOT EXISTS miliastra_gacha (
                id TEXT PRIMARY KEY,
                uid TEXT NOT NULL,
                gacha_id TEXT,
                gacha_type TEXT NOT NULL,
                item_id TEXT,
                count INTEGER,
                time TEXT NOT NULL,
                name TEXT,
                lang TEXT,
                item_type TEXT,
                rank_type INTEGER
            );
        `, (err) => {
            if (err) {
                console.error("Failed to initialize miliastra_gacha table:", err.message);
            } else {
                console.log("miliastra_gacha table initialized successfully.");
            }
        });

        // 抽卡表按 (uid, gacha_type) 过滤、DISTINCT uid、GROUP BY uid 都很频繁，
        // 没有索引时全部走全表扫描（记录可达数万行）
        for (const table of ['genshin_gacha', 'starRail_gacha', 'zzz_gacha', 'miliastra_gacha']) {
            db2.run(`CREATE INDEX IF NOT EXISTS idx_${table}_uid_type ON ${table} (uid, gacha_type)`, (err) => {
                if (err) console.error("Error creating gacha index:", err.message);
            });
        }
    });
    // 上次运行异常退出遗留的进行中会话，启动时统一收口
    closeOrphanSessions();
}


// 添加游戏信息
function addGame(gameData, callback) {
    const { name, icon, poster_vertical, poster_horizontal, path } = gameData;
    db.run(
        `INSERT INTO games (name, icon, poster_vertical, poster_horizontal, path) VALUES (?, ?, ?, ?, ?)`,
        [name, icon, poster_vertical, poster_horizontal, path],
        function (err) {
            if (err) return callback(err);
            callback(null, this.lastID);
        }
    );
}


function getSetting(key, callback) {
    db.get(`SELECT value FROM settings WHERE key = ?`, [key], (err, row) => {
        if (err) {
            console.error("Error fetching setting:", err);
            callback(err);
        } else {
            callback(null, row ? row.value : "false"); // 返回默认值 "false"
        }
    });
}


function setSetting(key, value, callback) {
    db.run(`INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, value], (err) => {
        if (err) {
            console.error("Error setting value:", err);
            callback(err);
        } else {
            callback(null);
        }
    });
}





// 获取游戏详细信息
function getGameDetails(gameId, callback) {
    db.get(`
        SELECT g.name, g.icon, g.poster_horizontal, g.poster_vertical, g.path,
               g.total_time, 
               (SELECT end_time FROM game_sessions WHERE game_id = g.id ORDER BY end_time DESC LIMIT 1) AS last_played,
               (SELECT CASE WHEN g.total_time > 0 THEN 
                   (SELECT COUNT(*) + 1 FROM games AS g2 WHERE g2.total_time > g.total_time)
                   ELSE '--' END) AS rank,
               (SELECT AVG(daily.total_time) / 3600  -- 将秒数转换为小时
                FROM (
                    SELECT SUM(duration) AS total_time
                    FROM game_sessions
                    WHERE game_id = g.id 
                    AND DATE(start_time) >= DATE('now', '-6 months')
                    GROUP BY DATE(start_time)
                ) AS daily
               ) AS avg_daily_time  -- 平均每日游戏时长
        FROM games AS g
        WHERE g.id = ?
    `, [gameId], callback);
}

// 获取游戏时长趋势数据
function getGameTrendData(gameId, callback) {
    db.all(`
        SELECT DATE(start_time) AS date, SUM(duration) AS total_time
        FROM game_sessions
        WHERE game_id = ?
        GROUP BY DATE(start_time)
        ORDER BY date DESC
        LIMIT 30
    `, [gameId], (err, rows) => {
        if (err) return callback(err);
        const sortedRows = rows.sort((a, b) => new Date(a.date) - new Date(b.date));
        callback(null, sortedRows);
    });
}



function startSession(gameId, callback) {
    const startTime = nowLocal();
    // 进行中的会话 end_time 留空，由 gameTracker 每 15 秒推进；
    // 之前把 end_time 预填成 start_time，导致 endSession 的
    // `WHERE end_time IS NULL` 永远匹配不到，成了死逻辑
    db.run(`
        INSERT INTO game_sessions (game_id, start_time, end_time, duration)
        VALUES (?, ?, NULL, NULL)
    `, [gameId], function (err) {
        if (err) {
            console.error("Error starting session:", err);
            callback(err);
        } else {
            callback(null, this.lastID); // 返回新 session 的 ID
        }
    });
}



function endSession(gameId, callback) {
    // 收尾该游戏所有「还没被 tick 推进过」的会话（游戏退出早于下一次 15 秒 tick 时）。
    // 已经有 end_time 的会话保持最后一次 tick 的值，它对真实退出时间的偏差不超过一个周期。
    const endTime = nowLocal();
    db.run(`
        UPDATE game_sessions 
        SET end_time = ?, duration = strftime('%s', ?) - strftime('%s', start_time)
        WHERE game_id = ? AND end_time IS NULL
    `, [endTime, endTime, gameId], function (err) {
        if (err) return callback(err);
        callback(null, this.changes);
    });
}


// 应用启动时收尾上次异常退出遗留的进行中会话：没有真实结束时间可用，
// 置为 0 时长（start_time = end_time），交给「检查与整理数据」按空记录清掉
function closeOrphanSessions() {
    db.run(`UPDATE game_sessions SET end_time = start_time, duration = 0 WHERE end_time IS NULL`, (err) => {
        if (err) console.error("Error closing orphan sessions:", err.message);
    });
}


// 查询游戏时长数据
function getGameTimeData(callback) {
    // 与 start_time 同格式的本地时间边界，字符串比较才有效；
    // 之前传 ISO 格式（带 T/Z），和本地格式比较在日期相同的时刻会全部判错
    const todayStart = dayjs().tz(chinaTimezone).startOf('day').format(TIME_FORMAT);
    const twoWeeksAgo = dayjs().tz(chinaTimezone).subtract(14, 'days').format(TIME_FORMAT);

    db.all(`
        SELECT 
            g.id,
            g.name,
            g.icon,
            g.poster_horizontal,
            g.poster_vertical,
            g.total_time,
            g.path,
            COALESCE(SUM(CASE WHEN s.start_time >= ? THEN s.duration ELSE 0 END), 0) AS today_time,
            COALESCE(SUM(CASE WHEN s.start_time >= ? THEN s.duration ELSE 0 END), 0) AS two_weeks_time
        FROM games g
        LEFT JOIN game_sessions s ON g.id = s.game_id
        GROUP BY g.id
        ORDER BY today_time DESC
    `, [todayStart, twoWeeksAgo], (err, rows) => {
        if (err) {
            console.error("Error fetching game time data:", err);
            callback(err);
        } else {
            callback(null, rows);
        }
    });
}

function deleteGame(gameId, callback) {
    // games 与 game_sessions 分两条删，包进事务：任一条失败时不留孤儿 session
    db.serialize(() => {
        let firstError = null;
        db.run('BEGIN');
        db.run(`DELETE FROM games WHERE id = ?`, [gameId], (err) => {
            firstError = firstError ?? err;
        });
        db.run(`DELETE FROM game_sessions WHERE game_id = ?`, [gameId], (err) => {
            firstError = firstError ?? err;
            if (firstError) {
                db.run('ROLLBACK', () => callback(firstError));
            } else {
                db.run('COMMIT', (commitErr) => callback(commitErr ?? null));
            }
        });
    });
}

// 检查路径是否已存在
function updateGame(gameData, callback) {
    const { id, name, icon, poster_vertical, poster_horizontal, path } = gameData;

    db.get(`SELECT id FROM games WHERE path = ? AND id != ?`, [path, id], (err, row) => {
        if (row) {
            return callback(new Error("游戏路径已存在"));
        }
        db.run(`
            UPDATE games SET name = ?, icon = ?, poster_vertical = ?, poster_horizontal = ?, path = ?
            WHERE id = ?
        `, [name, icon, poster_vertical, poster_horizontal, path, id], callback);
    });
}

//获取过去半年的每日游戏时长数据
function getGameDailyTimeData(gameId, callback) {
    const sixMonthsAgo = dayjs().tz(chinaTimezone).subtract(6, 'months').format(TIME_FORMAT);
    db.all(`
        SELECT start_time, SUM(duration) AS total_time
        FROM game_sessions
        WHERE game_id = ? AND start_time >= ?
        GROUP BY DATE(start_time)
        ORDER BY start_time ASC
    `, [gameId, sixMonthsAgo], (err, rows) => {
        if (err) {
            console.error("Error fetching daily time data:", err);
            callback(err);
        } else {
            // 使用 dayjs 将每个记录的 start_time 转换为 UTC-8 的日期
            const transformedRows = rows.map(row => {
                const dateInUTC8 = dayjs(row.start_time).tz('Asia/Shanghai').format('YYYY-MM-DD');
                return {
                    date: dateInUTC8,
                    total_time: row.total_time
                };
            });
            callback(null, transformedRows);
        }
    });
}


//计算逻辑以返回平均每日游戏时间。
function getGameAverageDailyTimeData(gameId, callback) {
    db.all(`
        SELECT DATE(start_time) AS date, SUM(duration) AS total_time
        FROM game_sessions
        WHERE game_id = ? AND DATE(start_time) >= DATE('now', '-6 months')
        GROUP BY DATE(start_time)
        ORDER BY date ASC
    `, [gameId], (err, rows) => {
        if (err) {
            console.error("Error fetching average daily time data:", err);
            callback(err);
        } else {
            // 计算出勤日的平均每日游戏时间
            const totalDays = rows.length;
            const totalTime = rows.reduce((sum, row) => sum + row.total_time, 0);
            const averageTimePerDay = totalDays > 0 ? (totalTime / totalDays) / 3600 : 0; // 转换为小时

            callback(null, averageTimePerDay);
        }
    });
}





/**
 * 关闭两个数据库连接。替换/复制数据库文件前必须先关闭：
 * SQLite 连接持有页缓存与文件句柄，直接字节覆写正在使用的库文件极易损坏。
 * 注意关闭后模块级 db/db2 引用失效，调用方随后应重启应用（app.relaunch）。
 */
function closeDatabases() {
    const close = (database) => new Promise((resolve) => database.close((err) => {
        if (err) console.error('关闭数据库失败:', err.message);
        resolve();
    }));
    return Promise.all([close(db2), close(db)]);
}


// 导出数据库实例和初始化函数
module.exports = {
    db,
    db2,
    initializeDatabase,
    closeDatabases,
    closeOrphanSessions,
    addGame,
    startSession,
    endSession,
    getGameTimeData,
    getGameDetails,
    getGameTrendData,
    deleteGame,
    updateGame,
    getSetting,
    setSetting,
    getGameDailyTimeData,
};
