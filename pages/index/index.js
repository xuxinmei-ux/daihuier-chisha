// pages/index/index.js —— 打开即定位，然后一个按钮决定一切
const map = require('../../utils/map.js');
const storage = require('../../utils/storage.js');
const copy = require('../../utils/copywriting.js');
const time = require('../../utils/time.js');

const app = getApp();

// 定位精度分档：坐标偏多少，搜出来的店就整体偏多少
function accuracyHint(acc) {
  const n = Number(acc) || 0;
  if (!n) return '点这里可以重新定位';
  if (n <= 50) return '精度 ±' + n + 'm · 很准，点这里可重新定位';
  if (n <= 200) return '精度 ±' + n + 'm · 一般，点这里可重新定位';
  return '精度 ±' + n + 'm · 偏粗，去窗边/室外点一下重试';
}

Page({
  data: {
    tip: '',
    loadingText: '',

    located: false,
    locating: false,
    deny: false,               // 是否弹授权引导
    locAccuracy: 0,            // 定位精度（米）
    locHint: '',               // 定位卡副标题（精度分档文案）
    locLabel: '',              // 定位自检：坐标翻译成的"城市+区"
    radius: 500,
    radiusOptions: [100, 250, 500],
    radiusHint: '',
    categories: [],            // [{ key, emoji, off }]
    excluded: [],
    showExclude: false,        // 排除区默认折叠
    busy: false,
    remain: storage.MAX_AGAIN
  },

  onLoad() {
    const now = new Date();
    // 智能默认半径：工作日 11:30-13:00 -> 100m，其他时间 -> 500m
    const peak = time.isWorkday(now) && time.isLunchPeak(now);
    const radius = time.getSmartRadius(now);
    const excluded = storage.getPrefs().excluded;

    app.globalData.radius = radius;
    app.globalData.excluded = excluded;

    this.setData({
      radius: radius,
      radiusHint: peak
        ? '午饭高峰，默认 100m：走两步就能吃上，慢一步就没座了'
        : '非高峰时段，默认 500m：多给你几家备选',
      categories: this.buildCategories(excluded),
      excluded: excluded,
      tip: copy.pick('indexSub'),
      loadingText: copy.pick('loading'),
      remain: storage.getRemainCount()
    });

    this.locate();
  },

  onShow() {
    // 每次回到首页刷一下剩余次数 + 换一句文案
    this.setData({
      remain: storage.getRemainCount(),
      tip: copy.pick('indexSub')
    });
  },

  buildCategories(excluded) {
    return map.CATEGORIES.map(function (c) {
      return { key: c.key, emoji: c.emoji, off: excluded.indexOf(c.key) > -1 };
    });
  },

  /* ---------------- 定位 ---------------- */

  locate() {
    const self = this;
    if (this.data.locating) return;
    this.setData({ locating: true });

    map.locate().then(function (pos) {
      app.globalData.latitude = pos.latitude;
      app.globalData.longitude = pos.longitude;
      app.globalData.located = true;
      self.setData({
        located: true,
        locating: false,
        deny: false,
        locAccuracy: pos.accuracy || 0,
        locHint: accuracyHint(pos.accuracy)
      });

      // 顺手把坐标翻译成"城市+区"：卡片上一眼看出这个坐标对不对
      map.regeo(pos.latitude, pos.longitude).then(function (rg) {
        self.setData({ locLabel: rg.label || rg.address });
      }).catch(function (e) {
        console.warn('[index] regeo fail', e && e.message);
      });
    }).catch(function (err) {
      console.warn('[index] locate fail', err && err.raw);
      self.setData({ located: false, locating: false, deny: true });
    });
  },

  onLocateTap() {
    this.locate();
  },

  // GPS 不准时的兜底：自己在地图上点一下（chooseLocation 需在后台「开发管理 → 接口设置」开通）
  onPickLocation() {
    const self = this;
    wx.chooseLocation({
      success(res) {
        app.globalData.latitude = res.latitude;
        app.globalData.longitude = res.longitude;
        app.globalData.located = true;
        self.setData({
          located: true,
          locating: false,
          deny: false,
          locAccuracy: 0,
          locHint: '手动选点 · 点这里可重新定位',
          locLabel: res.name || res.address || ''
        });
      },
      fail(err) {
        const msg = (err && err.errMsg) || '';
        if (/cancel/i.test(msg)) return;
        const denied = /auth deny|auth denied|authorize|permission/i.test(msg);
        wx.showToast({
          title: denied ? '先允许读取位置才能选点' : '选点暂不可用：后台「接口设置」里开通 chooseLocation',
          icon: 'none'
        });
      }
    });
  },

  openSetting() {
    const self = this;
    wx.openSetting({
      success(res) {
        self.setData({ deny: false });
        if (res.authSetting && res.authSetting['scope.userLocation']) self.locate();
        else wx.showToast({ title: '还是要开定位哦', icon: 'none' });
      },
      fail() {
        self.setData({ deny: false });
      }
    });
  },

  closeDeny() {
    this.setData({ deny: false });
  },

  noop() {
    // 阻止弹窗内部点击冒泡到遮罩
  },

  /* ---------------- 半径 / 排除 ---------------- */

  onRadiusTap(e) {
    const value = Number(e.currentTarget.dataset.value) || 500;
    app.globalData.radius = value;
    this.setData({
      radius: value,
      radiusHint: value === 100
        ? '100m：只吃眼皮子底下的'
        : (value === 250 ? '250m：走两分钟内的范围' : '500m：撒大网，选择多一点')
    });
  },

  toggleExclude() {
    this.setData({ showExclude: !this.data.showExclude });
  },

  onCategoryTap(e) {
    const key = e.currentTarget.dataset.key;
    const excluded = this.data.excluded.slice();
    const i = excluded.indexOf(key);
    if (i > -1) excluded.splice(i, 1);
    else excluded.push(key);

    // 全排除了就没得转，直接拦一下
    if (excluded.length >= map.CATEGORIES.length) {
      wx.showToast({ title: '全排除就没得吃了', icon: 'none' });
      return;
    }
    app.globalData.excluded = excluded;
    storage.savePrefs({ excluded: excluded });
    this.setData({ excluded: excluded, categories: this.buildCategories(excluded) });
  },

  clearExclude() {
    app.globalData.excluded = [];
    storage.savePrefs({ excluded: [] });
    this.setData({ excluded: [], categories: this.buildCategories([]) });
  },

  /* ---------------- 开转 ---------------- */

  onStart() {
    const self = this;
    if (this.data.busy) return;

    if (!app.globalData.located) {
      wx.showToast({ title: '先给我个定位呀', icon: 'none' });
      this.locate();
      return;
    }

    this.setData({ busy: true, loadingText: copy.pick('loading') });

    map.searchNearby({
      latitude: app.globalData.latitude,
      longitude: app.globalData.longitude,
      radius: this.data.radius,
      excluded: this.data.excluded
    }).then(function (list) {
      self.setData({ busy: false });
      app.globalData.candidates = list;
      app.globalData.radius = self.data.radius;
      app.globalData.excluded = self.data.excluded;
      app.globalData.pick = null;
      storage.saveCandidates(list);
      // 少于 2 家也进转盘页，由转盘页统一展示空状态（避免两处判断不一致）
      wx.navigateTo({ url: '/pages/spin/spin' });
    }).catch(function (err) {
      self.setData({ busy: false });
      const info = map.explainError(err);
      wx.showModal({
        title: info.title,
        content: info.content,
        showCancel: !!info.canRetry,
        confirmText: info.canRetry ? '重试' : '好',
        cancelText: '先不转了',
        success: function (r) { if (r.confirm && info.canRetry) self.onStart(); }
      });
    });
  }
});
