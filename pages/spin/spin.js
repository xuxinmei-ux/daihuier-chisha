// pages/spin/spin.js —— 一个按钮两段状态：转 / 停
const map = require('../../utils/map.js');
const storage = require('../../utils/storage.js');
const copy = require('../../utils/copywriting.js');

const app = getApp();
const MAX_SECTOR = 8;   // 转盘最多 8 个扇区

Page({
  data: {
    items: [],        // 上转盘的候选（<= 8）
    total: 0,         // 附近去重后的总数
    spinning: 0,      // 0 待转 / 1 转中 / 2 定格中
    mainText: '转！别想了',
    tip: '',
    remain: storage.MAX_AGAIN,
    emptySub: ''
  },

  onLoad() {
    // 优先用 globalData，其次用当日缓存（防止直接打开本页时白屏）
    const cached = storage.getCandidates();
    const list = (app.globalData.candidates && app.globalData.candidates.length)
      ? app.globalData.candidates
      : cached;
    app.globalData.candidates = list;

    const avoidId = app.globalData.lastPick ? app.globalData.lastPick.id : '';
    this.setData({
      items: map.sampleForWheel(list, MAX_SECTOR, avoidId),
      total: list.length,
      tip: copy.pick('spinTop'),
      remain: storage.getRemainCount(),
      emptySub: list.length === 0
        ? '这一圈一家都没搜到'
        : '只搜到 ' + list.length + ' 家，转盘至少要 2 家才转得动'
    });
  },

  onShow() {
    this.setData({ remain: storage.getRemainCount() });
  },

  /** 同一个按钮：待转 -> 开转；转中 -> 停 */
  onMainTap() {
    if (this.data.spinning === 0) this.startSpin();
    else if (this.data.spinning === 1) this.stopSpin();
    // spinning === 2（定格中）时忽略点击，避免连点
  },

  startSpin() {
    this.wheel = this.wheel || this.selectComponent('#wheel');
    if (!this.wheel || !this.data.items.length) return;
    this.wheel.start();
    this.setData({
      spinning: 1,
      mainText: '停！就它了',
      tip: copy.pick('spinning')
    });
  },

  stopSpin() {
    if (!this.wheel) return;
    const n = this.data.items.length;
    const index = Math.floor(Math.random() * n);   // 随机结果
    this.wheel.stop(index);
    this.setData({ spinning: 2, mainText: '命运定格中…' });
  },

  /** 转盘减速停稳后（约 500ms）跳结果页 */
  onStopEnd(e) {
    const index = (e.detail && typeof e.detail.index === 'number') ? e.detail.index : 0;
    const pick = this.data.items[index];
    if (!pick) {
      this.setData({ spinning: 0, mainText: '转！别想了' });
      return;
    }
    app.globalData.pick = pick;
    storage.savePick(pick);
    wx.redirectTo({ url: '/pages/result/result' });
  },

  /** 空状态 / 回首页改半径 */
  goHome() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.reLaunch({ url: '/pages/index/index' });
  }
});
