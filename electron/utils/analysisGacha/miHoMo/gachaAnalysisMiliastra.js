const {genAuthKey} = require("../../mihoyo/takumi");
const {normalizeGachaBType, gachaBEndId, fetchGachaBPool, existingUids} = require('../../mihoyo/gachaLink');
const { insertGachaLogs: insertGachaRows } = require("./insertGacha");

/** GachaB.vue:250-251 的卡池列表，20011/20012/20021/20022 是注释掉的细分池，不单独请求 */
const GACHA_POOLS = [
    { type: "1000", name: "常驻颂愿" },
    { type: "2000", name: "活动颂愿" },
];

async function insertGachaLogs(logs) {
    // GachaB 接口的字段名与其它游戏不同，先归一化到表字段，再走共享的事务批量插入
    const normalized = logs.map(log => ({
        id: log.id,
        uid: log.uid,
        gacha_id: log.schedule_id || log.gacha_id || "",
        // 对齐 TeyvatGuide userGachaB.ts:37：非 1000 一律收敛成 2000
        gacha_type: normalizeGachaBType(log.op_gacha_type || log.gacha_type),
        item_id: log.item_id || "",
        count: log.count || 1, // 默认 1
        time: log.time,
        name: log.item_name || log.name || "",
        lang: log.lang || "zh-cn",
        item_type: log.item_type || "",
        rank_type: log.rank_type || "",
    }));
    return insertGachaRows('miliastra_gacha', normalized);
}

async function fetchMiliastraGachaData(event) {
    // 千星奇域和原神共用 hk4e_cn，一个米游社号下可能绑了好几个原神号。
    // 优先选本地已经有数据的那一个，避免拉到没玩过千星的号（那里恒为 0 条）。
    const preferUids = await existingUids('miliastra');
    // 换 authkey：走米游社 stoken，逻辑与 TeyvatGuide GachaB.vue:225 一致
    const ak = await genAuthKey('miliastra', { preferUids });
    if (!ak.success) {
        console.error(ak.message);
        return {success: false, message: ak.message};
    }
    const { authkey, uid } = ak;
    const notify = (msg) => event.sender.send('gacha-records-status', msg);

    const results = [];
    let totalInserted = 0;
    try {
        for (const pool of GACHA_POOLS) {
            // 增量断点：从库里已有最大 id 开始（对齐 GachaB.vue:309）
            const endId = await gachaBEndId(uid, pool.type);
            notify(`正在获取 ${pool.name} 的记录...`);
            const r = await fetchGachaBPool({
                authkey,
                uid,
                gachaType: pool.type,
                gachaName: pool.name,
                endId,
                onProgress: notify,
                onBatch: async (batch) => {
                    totalInserted += await insertGachaLogs(batch);
                },
            });
            results.push(r);
        }
    } catch (error) {
        console.error('获取抽卡数据时出错:', error);
        notify(`获取抽卡数据时出错:${error}`);
        return { success: false, message: `获取抽卡数据时出错\n${error}`};
    }

    // 对齐 GachaB.vue:256-268：哪个池失败就点名哪个，不静默当成功
    const failed = results.filter((r) => !r.success);
    const totalFetched = results.reduce((n, r) => n + r.count, 0);
    const message = failed.length
        ? `颂愿数据已部分刷新，${failed.map((f) => f.label).join("、")}失败：\n${failed.map((f) => f.error).join("\n")}`
        : `查询到的抽卡记录: ${totalFetched} 条,成功插入: ${totalInserted} 条`;
    notify(message);
    return { success: failed.length === 0, message};
}

module.exports = { fetchMiliastraGachaData }
