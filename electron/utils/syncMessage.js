const WebSocket = require('ws');

// 监听端口 22334
const wss = new WebSocket.Server({ port: 22334 });

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

// 将消息推送到前端
global.Notify = (success, message) => {
    const updatedData = { success, message };
    if (connectedClient) {
        connectedClient.send(JSON.stringify(updatedData));
    }
};
