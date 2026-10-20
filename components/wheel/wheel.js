// components/wheel/wheel.js —— CSS 转盘（无 Canvas）
// 三阶段：加速 → 匀速无限转（点"停"）→ 减速落在目标扇区 → 500ms 后抛 stopend
//
// 速度衔接（三段必须对得上，否则切换瞬间会看到速度"跳变"）：
//   加速段：300deg / 900ms，cubic-bezier(.45,.05,.6,.52) 末端速度 = 1.2 × 平均 = 0.40 deg/ms
//   匀速段：900ms 一圈                                        = 0.40 deg/ms   ← 与加速段末端一致
//   减速段：约 3 圈 / 2600ms，cubic-bezier(.5,.43,.1,1) 起始 = 0.86 × 平均 ≈ 0.40 deg/ms
const wheelMath = require('../../utils/wheel.js');

const ACCEL_MS = 900;        // 加速阶段时长
const ACCEL_DEG = 300;       // 加速阶段转过的角度
const ACCEL_EASE = 'cubic-bezier(.45, .05, .6, .52)';
const LOOP_PERIOD = 900;     // 匀速阶段：900ms 转一圈
const DECEL_MS = 2600;       // 减速阶段时长
const DECEL_EASE = 'cubic-bezier(.5, .43, .1, 1)';
const DECEL_TURNS = 3;       // 减速期间再转 3 圈（加上落点偏移）
const AFTER_STOP = 500;      // 停稳后再等 500ms 通知页面（需求：停止后约 500ms 跳结果页）
const RENDER_DELAY = 24;     // setData -> 样式生效的延迟补偿（匀速 400deg/s，24ms≈10deg，肉眼不可见）

Component({
  properties: {
    items: {
      type: Array,
      value: [],
      observer: 'onItemsChange'
    }
  },

  data: {
    sectors: [],
    gradient: '#EFEFEF',
    angle: 0,
    transition: 'none',
    animation: 'none'
  },

  lifetimes: {
    attached() {
      this._angle = 0;        // 当前静态角度
      this._loopStart = 0;    // 匀速阶段起点时间戳，0 表示不在匀速阶段
      this._loopBase = 0;     // 匀速阶段的基准角度
      this._accelAngle = 0;
      this._spinning = false;
      this._pendingIndex = -1;
      this.rebuild(this.data.items);
    },
    detached() {
      clearTimeout(this._accelTimer);
      clearTimeout(this._snapTimer);
      clearTimeout(this._reportTimer);
    }
  },

  methods: {
    onItemsChange(list) {
      this.rebuild(list);
    },

    /** 候选变化时重建扇区，并复位角度 */
    rebuild(list) {
      const items = list || [];
      const sectors = wheelMath.buildSectors(items);
      this._angle = 0;
      this._loopStart = 0;
      this._loopBase = 0;
      this._accelAngle = 0;
      this._spinning = false;
      this._pendingIndex = -1;
      this.setData({
        sectors: sectors,
        gradient: wheelMath.buildGradient(sectors),
        angle: 0,
        transition: 'none',
        animation: 'none'
      });
    },

    /** 阶段一：加速（0.9s 转 300deg，末端速度与匀速段一致），随后进入匀速循环 */
    start() {
      if (this._spinning || !this.data.sectors.length) return;
      const self = this;
      this._spinning = true;
      this._pendingIndex = -1;
      this._accelAngle = this._angle + ACCEL_DEG;
      this.setData({
        animation: 'none',
        transition: 'transform ' + ACCEL_MS + 'ms ' + ACCEL_EASE,
        angle: this._accelAngle
      });
      this._accelTimer = setTimeout(function () { self._enterLoop(); }, ACCEL_MS);
    },

    /** 阶段二：匀速循环。动画状态读不到，但周期确定，可用时间戳推算角度 */
    _enterLoop() {
      const self = this;
      this._loopBase = this._accelAngle;
      this._loopStart = Date.now();
      this.setData({
        transition: 'none',
        animation: 'wheel-loop ' + LOOP_PERIOD + 'ms linear infinite'
      });
      // 如果在加速阶段就被点了"停"，等进入匀速后再真正停
      if (this._pendingIndex >= 0) {
        const idx = this._pendingIndex;
        this._pendingIndex = -1;
        setTimeout(function () { self.stop(idx); }, 90);
      }
    },

    /**
     * 阶段三：停在 index 扇区
     * 先把无限动画摘掉、瞬间对齐到"推算出的当前角度"（视觉上几乎无变化），
     * 下一帧再启动减速 transition，保证过渡起点准确，不会跳。
     */
    stop(index) {
      if (!this._spinning) return;
      if (!this._loopStart) {
        this._pendingIndex = index;   // 还在加速中，等进入匀速再停
        return;
      }
      this._spinning = false;
      clearTimeout(this._accelTimer);

      const self = this;
      const n = this.data.sectors.length || 1;
      const elapsed = Math.max(0, Date.now() - this._loopStart - RENDER_DELAY);
      const phase = (elapsed % LOOP_PERIOD) / LOOP_PERIOD * 360; // 当前动画相位
      const snap = this._loopBase + phase;                       // 当前视觉角度快照

      const targetMod = wheelMath.targetAngle(index, n);         // 目标视觉角度 [0,360)
      const delta = wheelMath.norm(targetMod - wheelMath.norm(snap));
      const finalAngle = snap + DECEL_TURNS * 360 + delta;

      this._loopStart = 0;
      this._angle = finalAngle;

      this.setData({ animation: 'none', transition: 'none', angle: snap });
      this._snapTimer = setTimeout(function () {
        self.setData({
          transition: 'transform ' + DECEL_MS + 'ms ' + DECEL_EASE,
          angle: finalAngle
        });
        self._reportTimer = setTimeout(function () {
          self.triggerEvent('stopend', { index: index });
        }, DECEL_MS + AFTER_STOP);
      }, 30);
    },

    /** 复位（需求里未使用，留给后续扩展/调试） */
    reset() {
      this.rebuild(this.data.items);
    }
  }
});
