// app.js —— 只做全局缓存 + 跨天检查，无后端、无登录
const storage = require('./utils/storage.js');

App({
  /**
   * 全局缓存说明：
   * POI 数据量较大（最多几十家），不适合用 URL 传参，页面之间统一走 globalData，
   * 同时 utils/storage.js 会落一份当日缓存，防止 spin / result 被直接打开时白屏。
   */
  globalData: {
    latitude: 0,
    longitude: 0,
    located: false,   // 本次会话是否已成功定位
    radius: 500,      // 本次搜索半径（100 / 250 / 500）
    excluded: [],     // 用户勾选的"不想吃"类别 key
    candidates: [],   // 去重后的候选池
    pick: null,       // 转盘选中的店
    lastPick: null    // 上一家被选中的店，再次开转时用于避免重复
  },

  onLaunch() {
    // 每次启动做一次跨天检查，避免用户隔夜打开时"不服再转"次数没重置
    storage.getSpinRecord();
  },

  onShow() {
    storage.getSpinRecord();
  },

  onError(err) {
    console.error('[app error]', err);
  }
});
