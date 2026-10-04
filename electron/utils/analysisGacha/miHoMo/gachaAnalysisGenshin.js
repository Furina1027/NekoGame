const {getGenshinWishUrl} = require("./getGenshinUrl");
const {fetchGachaRecords} = require("./fetchGacha");
const { insertGachaLogs } = require("./insertGacha");

// 定义祈愿类型映射
const GACHA_TYPE_MAP = {
    "100": "新手祈愿",
    "200": "常驻祈愿",
    "301": "角色活动祈愿",
    "302": "武器活动祈愿",
    "400": "角色活动祈愿-2",
    "500": "集录祈愿",
};

async function fetchGenshinGachaData(event) {
    // 获取抽卡记录链接
    const result = await getGenshinWishUrl();
    if (!result.success) {
        console.error(result.message);
        return {success: result.success, message:result.message};
    }

    const gachaUrl = result.message.split('\n')[1].trim();
    console.log(`获取的抽卡记录链接: ${gachaUrl}`);
    // 通知走 WebSocket，链接里的 authkey 等同于账号凭据，由 Notify 统一打码
    global.Notify(true, '已获取抽卡链接并复制到剪贴板')
    // 获取祈愿日志数据
    try {
        const allRecords = { '100': [], '200': [], '301': [], '302': [], '400': [], '500': [] };
        let totalFetched = await fetchGachaRecords(allRecords,GACHA_TYPE_MAP,gachaUrl,event);
        // 插入查询到的所有数据
        const totalInserted = await insertGachaLogs('genshin_gacha', allRecords['100'].concat(allRecords['200'], allRecords['301'], allRecords['302'], allRecords["400"], allRecords["500"]));
        event.sender.send('gacha-records-status', `查询到的抽卡记录: ${totalFetched} 条,成功插入: ${totalInserted} 条`);
        return { success: true, message: `查询到的抽卡记录: ${totalFetched} 条\n成功插入: ${totalInserted} 条`};
    } catch (error) {
        console.error('获取抽卡数据时出错:', error);
        event.sender.send('gacha-records-status', `获取抽卡数据时出错:${error}`);
        return { success: false, message: `获取抽卡数据时出错\n${error}`};
    }
}

module.exports = { fetchGenshinGachaData }
