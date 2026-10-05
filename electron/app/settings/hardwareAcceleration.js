const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const { db } = require("../database");

// 该开关的含义是「禁用硬件加速」，仅在用户显式开启时才禁用。
const flagFile = () => path.join(process.env.NEKO_GAME_FOLDER_PATH, 'hardware_acceleration.flag');

/**
 * 把当前设置镜像到 sidecar 文件。
 * disableHardwareAcceleration() 只能在 ready 之前调用，而 sqlite3 只有异步接口，
 * 所以启动时只能同步读这个纯文本标记来决策；读到后再异步向数据库核对一次，
 * 并顺手把标记刷新成真实值，下次启动就是确定的。
 */
function persistHardwareAcceleration(disabled) {
    try {
        fs.writeFileSync(flagFile(), disabled ? '1' : '0', 'utf8');
    } catch (err) {
        console.error('写入硬件加速标记失败:', err.message);
    }
}

function readHardwareAccelerationSetting() {
    return new Promise((resolve) => {
        db.get("SELECT value FROM settings WHERE key = 'hardwareAcceleration'", (err, row) => {
            if (err) {
                console.error("获取硬件加速配置出现问题:", err.message);
                resolve(null);
                return;
            }
            resolve(row?.value === "true");
        });
    });
}

function apply(disabled) {
    if (disabled && !app.isReady()) {
        app.disableHardwareAcceleration();
        console.log("禁用了硬件加速");
    } else if (disabled) {
        console.log("应用已就绪，硬件加速配置本次不生效（需重启）");
    } else {
        console.log("启用了硬件加速");
    }
}

// 快路径：同步读标记，ready 之前就能定论
let decided = false;
try {
    const raw = fs.readFileSync(flagFile(), 'utf8').trim();
    decided = true;
    apply(raw === '1');
} catch {
    // 没有标记（新装、或首次运行这一版）：交给下面的异步核对
}

// 无论走哪条路都校正一次标记文件，让后续启动不再依赖竞态
readHardwareAccelerationSetting().then((disabled) => {
    if (disabled === null) return;
    if (!decided) apply(disabled);
    persistHardwareAcceleration(disabled);
});

module.exports = { persistHardwareAcceleration };