const { db2 } = require('../../../app/database');

/**
 * 把抽卡记录批量写入指定的卡池表。
 * 之前每个模块逐条 INSERT OR IGNORE：sqlite3 每条语句一个隐式事务，
 * 各带一次 fsync，首次全量导入上万条会把主进程阻塞到分钟级。
 * 这里用 prepared statement + 显式事务，整个批次一次落盘。
 * tableName 只接受调用方写死的常量，不接用户输入。
 */
function insertGachaLogs(tableName, logs) {
    if (!logs.length) return Promise.resolve(0);
    return new Promise((resolve, reject) => {
        let insertedCount = 0;
        let failure = null;

        db2.serialize(() => {
            db2.run('BEGIN');
            const stmt = db2.prepare(
                `INSERT OR IGNORE INTO ${tableName}
                 (id, uid, gacha_id, gacha_type, item_id, count, time, name, lang, item_type, rank_type)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            for (const log of logs) {
                stmt.run(
                    [log.id, log.uid, log.gacha_id, log.gacha_type, log.item_id || '', log.count, log.time, log.name, log.lang, log.item_type, log.rank_type],
                    function (err) {
                        if (err) {
                            failure = failure ?? err;
                        } else if (this.changes > 0) {
                            insertedCount++;
                        }
                    }
                );
            }
            stmt.finalize(() => {
                if (failure) {
                    db2.run('ROLLBACK', () => reject(failure));
                } else {
                    db2.run('COMMIT', (err) => (err ? reject(err) : resolve(insertedCount)));
                }
            });
        });
    });
}

module.exports = { insertGachaLogs };
