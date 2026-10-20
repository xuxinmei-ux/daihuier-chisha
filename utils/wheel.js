// utils/wheel.js —— 转盘的纯计算（不依赖 wx/组件，方便离线单测）
// 角度约定：0deg = 12 点方向，顺时针为正，和后端 conic-gradient 的默认起点一致

/** 高饱和撞色色板（不用图片、不用品牌色） */
const PALETTE = [
  '#FF4D6D', '#FFB300', '#2EC4B6', '#4D96FF',
  '#FF8A3D', '#B388FF', '#00C2A8', '#FF6FB5',
  '#FFD93D', '#7C4DFF'
];

function toRad(d) {
  return d * Math.PI / 180;
}

/** Fisher-Yates 洗牌，rnd 可注入（单测用） */
function shuffle(arr, rnd) {
  const rand = rnd || Math.random;
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** 扇区文字：去掉括号内容与空白，超过 5 个字截断 */
function shortName(name) {
  const s = String(name || '小店')
    .replace(/[（(][^)）]*[)）]/g, '')
    .replace(/\s+/g, '')
    .replace(/[·•]/g, '');
  return s.length > 5 ? s.slice(0, 5) + '…' : s;
}

/**
 * 生成扇区数据
 * @returns [{ rot, emoji, short, color }]  rot = 扇区中心角度（顺时针，从 12 点算）
 */
function buildSectors(items, rnd) {
  const list = items || [];
  const n = list.length;
  if (!n) return [];
  const seg = 360 / n;
  const colors = shuffle(PALETTE, rnd);
  const sectors = list.map(function (item, i) {
    return {
      rot: i * seg + seg / 2,
      emoji: (item && item.emoji) || '🍽️',
      short: shortName(item && item.name),
      color: colors[i % colors.length]
    };
  });
  // 相邻同色时往后换一个，避免两扇区糊成一块（首尾也算相邻）
  for (let i = 1; i < sectors.length; i++) {
    if (sectors[i].color === sectors[i - 1].color) {
      const swapWith = (i + 1) % sectors.length;
      const tmp = sectors[i].color;
      sectors[i].color = sectors[swapWith].color;
      sectors[swapWith].color = tmp;
    }
  }
  return sectors;
}

/** 拼 conic-gradient（从 12 点开始顺时针铺色） */
function buildGradient(sectors) {
  const n = (sectors || []).length;
  if (!n) return '#EFEFEF';
  const seg = 360 / n;
  const parts = sectors.map(function (s, i) {
    return s.color + ' ' + (i * seg).toFixed(2) + 'deg ' + ((i + 1) * seg).toFixed(2) + 'deg';
  });
  return 'conic-gradient(from 0deg, ' + parts.join(', ') + ')';
}

/**
 * 计算"让第 index 个扇区停在指针（12 点）下"所需的最终视觉角度（0-360）
 * 在扇区中心附近做 ±22% 扇区宽的随机抖动，避免每次都停在正中间
 */
function targetAngle(index, count, rnd) {
  const rand = rnd || Math.random;
  const n = count > 0 ? count : 1;
  const seg = 360 / n;
  const center = (index % n) * seg + seg / 2;
  const jitter = (rand() * 0.44 - 0.22) * seg;
  return ((360 - center - jitter) % 360 + 360) % 360;
}

/** 角度规范化到 [0,360) */
function norm(deg) {
  return ((deg % 360) + 360) % 360;
}

module.exports = {
  PALETTE: PALETTE,
  toRad: toRad,
  shuffle: shuffle,
  shortName: shortName,
  buildSectors: buildSectors,
  buildGradient: buildGradient,
  targetAngle: targetAngle,
  norm: norm
};
