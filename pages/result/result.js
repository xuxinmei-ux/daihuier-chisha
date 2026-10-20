// pages/result/result.js —— 结果页：导航 + 每天限 3 次「不服再转」
const storage = require('../../utils/storage.js');
const copy = require('../../utils/copywriting.js');
const time = require('../../utils/time.js');

const app = getApp();

Page({
  data: {
    pick: null,
    distanceText: '',
    remain: storage.MAX_AGAIN,
    over: false,           // 今日次数用尽
    againText: '',
    tip: ''
  },

  onLoad() {
    // 优先 globalData，其次当日缓存，都没有说明用户直接打开了本页
    const pick = app.globalData.pick || storage.getPick();
    if (!pick || !pick.name) {
      wx.showToast({ title: '还没结果，先去转一次', icon: 'none' });
      setTimeout(function () {
        wx.reLaunch({ url: '/pages/index/index' });
      }, 900);
      return;
    }
    app.globalData.pick = pick;
    this.setData({
      pick: pick,
      distanceText: time.formatDistance(pick.distance),
      tip: copy.pick('resultTop')
    });
    this.refreshAgain();
  },

  onShow() {
    this.refreshAgain();
  },

  /** 刷新"不服再转"按钮与剩余次数 */
  refreshAgain() {
    const remain = storage.getRemainCount();
    this.setData({
      remain: remain,
      over: remain <= 0,
      againText: remain > 0
        ? ('不服？再转一次（剩 ' + remain + ' 次）')
        : '今天命运已锁定，明天再来'
    });
  },

  /** 调用微信内置地图导航 */
  onNav() {
    const pick = this.data.pick;
    if (!pick) return;
    const address = pick.address;
    wx.openLocation({
      latitude: Number(pick.latitude),
      longitude: Number(pick.longitude),
      name: pick.name,
      address: address,
      scale: 18,
      fail: function () {
        // 兜底：导航失败就复制地址，用户还能自己贴
        wx.setClipboardData({
          data: address,
          success: function () {
            wx.showToast({ title: '导航开不了，地址已复制', icon: 'none' });
          }
        });
      }
    });
  },

  /** 不服再转：每天限 3 次（首转不计数） */
  onAgain() {
    if (storage.getRemainCount() <= 0) {
      this.setData({
        over: true,
        againText: '今天命运已锁定，明天再来',
        tip: copy.pick('limit')
      });
      wx.showModal({
        title: '今天命运已锁定',
        content: '明天再来',
        showCancel: false,
        confirmText: '好吧'
      });
      return;
    }

    storage.bumpSpinCount();                       // 用掉一次
    app.globalData.lastPick = this.data.pick;      // 让转盘尽量避开刚选过的那家
    app.globalData.pick = null;
    wx.redirectTo({ url: '/pages/spin/spin' });    // 用 redirectTo 避免页面栈越堆越深
  },

  goHome() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.reLaunch({ url: '/pages/index/index' });
  }
});
