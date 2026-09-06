const { ipcMain } = require('electron');
const { db2 } = require('../../app/database'); // 引入数据库实例
const db = db2; // 数据库实例

// 导入其他抽卡分析IPC
require('./miHoMo/genShinIpc');
require('./miHoMo/starRailIpc');
require('./miHoMo/zzzIpc');
require('./miHoMo/miliastraIpc');
require('./deleteUID');
require('./commonitems');
require('./gachaDelete');
