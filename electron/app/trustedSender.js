/**
 * IPC sender 校验。
 * 应用内所有窗口都只加载 app://（开发时为 Vite dev server），任何其他来源
 * （例如被注入的 iframe、意外创建的窗口）都不该能调用主进程能力。
 * 目前先套在后果最重的几个通道上（启动程序 / 打开外部链接 / 云端同步覆盖数据）。
 */
const APP_ORIGIN = 'app://neko';

function isTrustedSender(event) {
    const frame = event?.senderFrame;
    if (!frame) return false;
    const url = frame.url || '';
    if (url.startsWith(APP_ORIGIN)) return true;
    // 开发模式走 Vite dev server
    if (process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL)) {
        return true;
    }
    console.error(`拒绝来自不受信来源的 IPC 调用: ${url}`);
    return false;
}

module.exports = { isTrustedSender };
