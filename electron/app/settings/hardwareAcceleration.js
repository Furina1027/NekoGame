const { app } = require("electron");
const { db } = require("../database");

// 该开关在创建窗口前就要生效（disableHardwareAcceleration 只能在 ready 前调用），
// 而这里随模块加载同步执行，所以直接复用 database.js 已打开的连接发一条查询。
// 查询是异步的：本地文件通常几毫秒就返回，赶在 ready 之前；
// 万一竞态失败，按「保持硬件加速开启」降级（与读取失败同策略）。
function loadHardwareAccelerationSetting() {
    return new Promise((resolve) => {
        db.get("SELECT value FROM settings WHERE key = 'hardwareAcceleration'", (err, row) => {
            if (err) {
                console.error("获取硬件加速配置出现问题:", err.message);
                resolve(false);
                return;
            }
            // 该开关的含义是「禁用硬件加速」，仅在用户显式开启时才禁用；
            // 旧逻辑在配置缺失时会反向命中，导致全新安装默认关闭硬件加速。
            resolve(row?.value === "true");
        });
    });
}

loadHardwareAccelerationSetting().then((disabled) => {
    if (disabled && app.isReady() === false) {
        app.disableHardwareAcceleration();
        console.log("禁用了硬件加速");
    } else if (disabled) {
        console.log("应用已就绪，硬件加速配置本次不生效（需重启）");
    } else {
        console.log("启用了硬件加速");
    }
});
