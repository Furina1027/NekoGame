const Database = require("better-sqlite3");
const { app } = require("electron");
const path = require("path");

function loadHardwareAccelerationSettingSync() {
    try {
        const db = new Database(path.join(process.env.NEKO_GAME_FOLDER_PATH, "neko_game.db")); // 替换为实际数据库路径
        const row = db.prepare("SELECT value FROM settings WHERE key = 'hardwareAcceleration'").get();
        // 该开关的含义是「禁用硬件加速」，仅在用户显式开启时才禁用；
        // 旧逻辑在配置缺失时会反向命中，导致全新安装默认关闭硬件加速。
        return row?.value === "true";
    } catch (err) {
        console.error("获取硬件加速配置出现问题:", err);
        return false; // 读取失败时保持硬件加速开启
    }
}

// 加载配置
const hardwareAccelerationDisabled = loadHardwareAccelerationSettingSync();
if (hardwareAccelerationDisabled) {
    app.disableHardwareAcceleration();
    console.log("禁用了硬件加速");
} else {
    console.log("启用了硬件加速");
}
