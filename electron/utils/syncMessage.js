const WebSocket = require('ws');

// 只绑定回环地址：通知里可能带抽卡相关的敏感信息，不应暴露给局域网；
// WebSocket 握手不受 CORS 约束，绑 0.0.0.0 时任意网页也能连 ws://127.0.0.1:22334
const wss = new WebSocket.Server({ port: 22334, host: '127.0.0.1' });

// 端口是写死的，很容易被占用：多开一个实例、或别的程序占了这个端口都会
// 触发 EADDRINUSE。之前没有 error 监听，它会变成未捕获异常直接把主进程带崩，
// 表现为启动时弹 "A JavaScript error occurred in the main process"。
// 通知只是附加功能，取不到就降级，不能因此让整个应用起不来。
wss.on('error', (err) => {
    console.error(`通知服务启动失败（端口 22334），本次运行不会显示通知：${err.message}`);
});

// 存储 WebSocket 连接的客户端
let connectedClient = null;
wss.on('connection', (ws) => {
    console.log('通知系统已启用');
    connectedClient = ws;
    // 在连接时，前端可以接收到初始化的消息
    // ws.send(JSON.stringify({ success: true, message: '已连接到服务器' }));
    // 监听关闭事件
    ws.on('close', () => {
        console.log('通知系统已断开');
        connectedClient = null; // 清空连接
    });
});

/** 抽卡链接里的 authkey 等同于账号凭据，出通知前一律打码 */
function redactCredentials(message) {
    return message
        .replace(/([?&]authkey=)[^&\s"']+/g, '$1***')
        .replace(/([?&]auth_appid=)[^&\s"']+/g, '$1***');
}

// 将消息推送到前端
global.Notify = (success, message) => {
    const safeMessage = typeof message === 'string' ? redactCredentials(message) : message;
    const updatedData = { success, message: safeMessage };
    if (connectedClient) {
        connectedClient.send(JSON.stringify(updatedData));
    }
};
