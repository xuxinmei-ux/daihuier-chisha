// utils/time.js —— 时间相关纯函数（不依赖 wx，可直接被 Node 单测）

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 返回 YYYY-MM-DD，用于"每天限 3 次"的跨天判断 */
function today(d) {
  const date = d || new Date();
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

/** 周一~周五算工作日（不接节假日接口，工具类够用） */
function isWorkday(d) {
  const w = (d || new Date()).getDay();
  return w >= 1 && w <= 5;
}

/** 11:30 - 13:00 午饭高峰 */
function isLunchPeak(d) {
  const date = d || new Date();
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= 11 * 60 + 30 && minutes < 13 * 60;
}

/**
 * 智能默认半径：
 * 工作日午饭高峰 -> 100m（走两步就能吃上）
 * 其他时间     -> 500m（多给点选择）
 */
function getSmartRadius(d) {
  return (isWorkday(d) && isLunchPeak(d)) ? 100 : 500;
}

/** 距离文案：< 1km 显示整数米，否则显示 1 位小数公里 */
function formatDistance(meters) {
  if (meters === null || typeof meters === 'undefined' || isNaN(meters)) return '距离未知';
  const m = Math.round(Number(meters));
  if (m < 1000) return m + 'm';
  return (m / 1000).toFixed(1) + 'km';
}

module.exports = {
  today: today,
  isWorkday: isWorkday,
  isLunchPeak: isLunchPeak,
  getSmartRadius: getSmartRadius,
  formatDistance: formatDistance
};
