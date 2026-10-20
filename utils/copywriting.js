// utils/copywriting.js —— 随机文案池。每次进入页面随机一句，纯本地、无网络

const POOLS = {
  // 首页副标题
  indexSub: [
    '别纠结了，命运替你选',
    '选不出来？那就交给运气',
    '今天的午饭，随机才公平',
    '手指点两下，午饭有着落',
    '纠结十分钟，不如转一圈'
  ],
  // 搜索中的沙雕等待文案
  loading: [
    '正在翻你附近的锅…',
    '命运正在扫街…',
    '闻到了，有点香…',
    '正在把好吃的抓进盘子…',
    '掐指一算，快好了…'
  ],
  // 转盘页顶部
  spinTop: [
    '转不转？不转也得转',
    '转盘一响，纠结退场',
    '别看了，看也没用',
    '闭上眼也行，反正你说了不算'
  ],
  // 转盘开转后
  spinning: [
    '还在转，别催',
    '让它转，你先站着',
    '手别抖，再等等',
    '快了快了，就快了'
  ],
  // 结果页
  resultTop: [
    '就它了，别问为什么',
    '命运说了，就这家',
    '别想了，进去点单',
    '缘分到了，别改主意'
  ],
  // 超限
  limit: [
    '今天命运已锁定，明天再来',
    '改主意要趁早，机会用完了',
    '命运下班了，明天再上班'
  ],
  // 空状态
  empty: [
    '附近没饭吃？扩大范围试试',
    '这一圈啥也没有，把网撒大点',
    '转盘空转了，半径调大点'
  ]
};

/** 从文案池里随机取一句，池子不存在时返回兜底文案 */
function pick(key, fallback) {
  const arr = POOLS[key];
  if (!arr || !arr.length) return fallback || '';
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 取整池（需要同时显示多句时用） */
function list(key) {
  return (POOLS[key] || []).slice();
}

module.exports = {
  POOLS: POOLS,
  pick: pick,
  list: list
};
