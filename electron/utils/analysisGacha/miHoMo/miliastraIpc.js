const { ipcMain, clipboard } = require('electron');
const {fetchMiliastraGachaData} = require("./gachaAnalysisMiliastra");
require("./getGenshinUrl");
const {db2} = require("../../../app/database");
const db = db2;

ipcMain.handle('fetchMiliastraGachaData', async (event) => {
    event.sender.send('gacha-records-status', '正在获取抽卡记录...');
    return await fetchMiliastraGachaData(event);
});

ipcMain.handle('get-last-miliastra-uid', async () => {
    try {
        const row = await new Promise((resolve, reject) => {
            db.get(
                'SELECT uid FROM miliastra_gacha ORDER BY id DESC LIMIT 1',
                (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                }
            );
        });
        return row ? row.uid : null;
    } catch (err) {
        console.error('数据库中无千星奇域抽卡记录:', err);
        return null;
    }
});


ipcMain.handle('get-miliastra-player-uids', async () => {
    try {
        const rows = await new Promise((resolve, reject) => {
            db.all(
                'SELECT DISTINCT uid FROM miliastra_gacha',
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                }
            );
        });
        return rows.map(row => row.uid);
    } catch (err) {
        console.error('未能从数据库获取用户UID:', err);
        return [];
    }
});


ipcMain.handle('get-miliastra-gacha-records', async (event, uid) => {
    try {
        // 只取当前 UID 的记录：表可达数万行，之前全表回传、渲染层再过滤
        const rows = uid
            ? await new Promise((resolve, reject) => {
                db.all('SELECT * FROM miliastra_gacha WHERE uid = ? ORDER BY id DESC', [uid], (err, rows) => (err ? reject(err) : resolve(rows)));
            })
            : await new Promise((resolve, reject) => {
                db.all('SELECT * FROM miliastra_gacha ORDER BY id DESC', (err, rows) => (err ? reject(err) : resolve(rows)));
            });
        // 定义gacha_type对应的中文映射
        // 注意：活动颂愿实际会返回 20011/20012/20021/20022 等细分类型，
        // 新数据入库时已归一化成 2000（见 gachaAnalysisMiliastra.js），
        // 但库里可能还留着归一化之前的老数据，这里兜底一次。
        const gachaTypeMap = {
            "1000": "常驻颂愿",
            "2000": "活动颂愿"
        };
        const mapGachaType = (t) => gachaTypeMap[String(t)] || (String(t) === "1000" ? "常驻颂愿" : "活动颂愿");
        // 替换字段
        return rows.map(record => ({
            id: record.id,
            uid: record.uid,
            gacha_id: record.gacha_id,
            card_pool_type: mapGachaType(record.gacha_type),  // 替换gacha_type为card_pool_type
            item_id: record.item_id,
            count: record.count,
            timestamp: record.time,  // 替换time为timestamp
            name: record.name,
            lang: record.lang,
            item_type: record.item_type,
            quality_level: record.rank_type,  // 替换rank_type为quality_level
        }));
    } catch (err) {
        console.error('从数据库获取原神抽卡记录失败:', err);
        return [];
    }
});
