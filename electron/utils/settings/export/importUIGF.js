const fs = require('fs');
const { db2 } = require('../../../app/database');
const { ipcMain, dialog } = require("electron");
const {fetchItemId, itemCache, fetchItemName} = require("./UIGFapi");
const {checkUIGF} = require("./checkUIGF");

const UIGF_FIELDS = [
    "id", "uid", "gacha_id", "gacha_type", "item_id", "count",
    "time", "name", "lang", "item_type", "rank_type"
];


async function importUIGFData(filePath, tableName, gameKey, fetchItemIdFn, gameType=null) {
    try {
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const parsedData = JSON.parse(rawData);

        // 检测数据格式标准
        const isUIGF3 = parsedData.info && parsedData.list && parsedData.info.uigf_version;
        const isUIGF4 = parsedData[gameKey] && Array.isArray(parsedData[gameKey]);
        const isSRGF = parsedData.info && parsedData.list && parsedData.info.srgf_version;
        let formatType = "未知格式"; // 数据格式类型
        let recordCount = 0; // 记录总数

        if (!isUIGF3 && !isUIGF4 && !isSRGF) {
            throw new Error(`无效的 UIGF 格式: 缺少 '${gameKey}' 或 'list' 数据`);
        }
        if (isUIGF3 && gameType !== "genshin") {
            throw new Error(`UIGF 3.0 数据仅支持导入到原神`);
        }
        if (isSRGF && gameType !== "starrail") {
            throw new Error(`SRGF 格式仅支持崩坏：星穹铁道数据`);
        }
        if (isUIGF3) {
            formatType = "UIGF3.0";
            recordCount = parsedData.list.length;
        } else if (isSRGF) {
            formatType = "SRGF";
            recordCount = parsedData.list.length;
        } else if (isUIGF4) {
            formatType = "UIGF4.0";
            recordCount = parsedData[gameKey].reduce((total, playerData) => {
                return total + (playerData.list ? playerData.list.length : 0);
            }, 0);
        }

        const query = `INSERT OR IGNORE INTO ${tableName} (${UIGF_FIELDS.join(', ')}) VALUES (${UIGF_FIELDS.map(() => '?').join(', ')})`;
        let insertedCount = 0;

        if (isUIGF4) {
            global.Notify(true, `${formatType}数据验证成功\n共查询到${recordCount}条记录\n正在导入`)
            // UIGF 4.0
            for (const playerData of parsedData[gameKey]) {
                const { uid, list, lang = "zh-cn" } = playerData;
                if (!list || !Array.isArray(list)) continue;
                insertedCount = await insertUIGF(query, insertedCount, uid, lang, fetchItemIdFn, list); //导入数据
            }
        } else if (isUIGF3 || isSRGF) {
            // UIGF 3.0 & isSRGF1.0格式处理
            const { uid, lang = "zh-cn" } = parsedData.info;
            global.Notify(true, `${formatType}数据验证成功\n共查询到${recordCount}条记录\n正在导入`)
            insertedCount = await insertUIGF(query, insertedCount, uid, lang, fetchItemIdFn, parsedData.list); //导入数据
        }
        console.log(`成功导入 ${insertedCount} 条 ${formatType} 记录`);
        return { success: true, message: `成功导入 ${insertedCount} 条 ${formatType} 记录` };
    } catch (error) {
        console.error("导入 UIGF/SRGF 数据失败:", error.message);
        return { success: false, message: `导入数据失败: ${error.message}` };
    }
}

/** 并行限流地补齐缺失的 item_id：之前一条一条串行等网络，大文件导入要慢上数倍 */
async function fillItemIds(records, fetchItemIdFn) {
    const missing = records.filter((r) => !r.item_id && r.name);
    const CONCURRENCY = 5;
    for (let i = 0; i < missing.length; i += CONCURRENCY) {
        await Promise.all(missing.slice(i, i + CONCURRENCY).map(async (recordData) => {
            try {
                recordData.item_id = await fetchItemIdFn(recordData.name);
            } catch (err) {
                global.Notify(false, `获取 item_id 失败: ${recordData.name}\n已跳过此记录\n 错误: ${err.message}`);
                console.warn(`获取 item_id 失败: ${recordData.name}, 错误: ${err.message}`);
                recordData.__skip = true;
            }
        }));
    }
}

async function insertUIGF(query, insertedCount, uid, lang, fetchItemIdFn, list){
    const records = list.map((record) => ({ ...record, uid, lang }));

    // 字段完整性先整体校验，避免导到一半才在坏记录上失败
    for (const recordData of records) {
        checkUIGF(recordData.id, recordData.uid, recordData.gacha_type, recordData.time, recordData.rank_type, recordData);
    }
    await fillItemIds(records, fetchItemIdFn);
    const valid = records.filter((r) => !r.__skip);
    if (valid.length === 0) return insertedCount;

    // 单个事务批量落盘：逐条 autocommit 每条都 fsync 一次，大文件导入主进程会卡到分钟级
    return new Promise((resolve, reject) => {
        let inserted = 0;
        let failure = null;
        db2.serialize(() => {
            db2.run('BEGIN');
            const stmt = db2.prepare(query);
            for (const recordData of valid) {
                stmt.run(UIGF_FIELDS.map((field) => recordData[field] || ""), function (err) {
                    if (err) {
                        failure = failure ?? err;
                    } else if (this.changes > 0) {
                        inserted++;
                    }
                });
            }
            stmt.finalize(() => {
                if (failure) {
                    db2.run('ROLLBACK', () => reject(failure));
                } else {
                    db2.run('COMMIT', (err) => (err ? reject(err) : resolve(insertedCount + inserted)));
                }
            });
        });
    });
}

ipcMain.handle('import-genshin-data', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '选择 原神 UIGF 数据文件 - 如果不需要导入其他工具的抽卡记录，进入对应界面点击刷新数据即可',
        filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        properties: ['openFile']
    });
    if (canceled || filePaths.length === 0) {
        return { success: false, message: '未选择文件' };
    }

    const filePath = filePaths[0];
    return await importUIGFData(filePath, 'genshin_gacha', 'hk4e', fetchItemId, "genshin");
});

ipcMain.handle('import-starRail-data', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '选择 崩铁 UIGF 数据文件 - 如果不需要导入其他工具的抽卡记录，进入对应界面点击刷新数据即可',
        filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        properties: ['openFile']
    });
    if (canceled || filePaths.length === 0) {
        return { success: false, message: '未选择文件' };
    }

    const filePath = filePaths[0];
    return await importUIGFData(filePath, 'starRail_gacha', 'hkrpg', fetchItemId, "starrail");
});

ipcMain.handle('import-zzz-data', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '选择 绝区零 UIGF 数据文件 - 如果不需要导入其他工具的抽卡记录，进入对应界面点击刷新数据即可',
        filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        properties: ['openFile']
    });
    if (canceled || filePaths.length === 0) {
        return { success: false, message: '未选择文件' };
    }

    const filePath = filePaths[0];
    return await importUIGFData(filePath, 'zzz_gacha', 'nap', fetchItemId);
});
