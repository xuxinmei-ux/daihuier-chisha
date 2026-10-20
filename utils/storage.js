// utils/storage.js —— 本地存储：重转次数、候选池缓存、选中店缓存、用户偏好
// 全部操作 try/catch，存储异常不能影响主流程

const time = require('./time.js');

const KEY_RECORD = 'spinRecord';        // { date: 'YYYY-MM-DD', count: 0 }
const KEY_CANDIDATES = 'lastCandidates'; // { date, list } 当日候选池缓存
const KEY_PICK = 'lastPick';             // { date, pick } 当日选中店缓存
const KEY_PREFS = 'userPrefs';           // { excluded: [] }

/** 首转不计数，只统计结果页「不服？再转一次」，每天最多 3 次 */
const MAX_AGAIN = 3;

function safeGet(key, def) {
  try {
    const v = wx.getStorageSync(key);
    if (v === '' || v === null || typeof v === 'undefined') return def;
    return v;
  } catch (e) {
    console.warn('[storage] get fail', key, e);
    return def;
  }
}

function safeSet(key, val) {
  try {
    wx.setStorageSync(key, val);
  } catch (e) {
    console.warn('[storage] set fail', key, e);
  }
}

/** 读取当日重转记录，跨天自动重置 */
function getSpinRecord() {
  const t = time.today();
  const rec = safeGet(KEY_RECORD, null);
  if (!rec || rec.date !== t) {
    const fresh = { date: t, count: 0 };
    safeSet(KEY_RECORD, fresh);
    return fresh;
  }
  return { date: rec.date, count: Number(rec.count) || 0 };
}

/** 今日还剩几次「不服再转」 */
function getRemainCount() {
  return Math.max(0, MAX_AGAIN - getSpinRecord().count);
}

/** 用掉一次，返回剩余次数 */
function bumpSpinCount() {
  const rec = getSpinRecord();
  rec.count = Math.min(MAX_AGAIN, rec.count + 1);
  safeSet(KEY_RECORD, rec);
  return MAX_AGAIN - rec.count;
}

/** 用户偏好（只存排除类别，半径每次按智能默认给，避免过期半径一直生效） */
function getPrefs() {
  const p = safeGet(KEY_PREFS, {}) || {};
  return { excluded: Array.isArray(p.excluded) ? p.excluded : [] };
}

function savePrefs(p) {
  const cur = getPrefs();
  safeSet(KEY_PREFS, {
    excluded: Array.isArray(p && p.excluded) ? p.excluded : cur.excluded
  });
}

/** 候选池缓存（当日有效），防止 spin 页被直接打开时白屏 */
function saveCandidates(list) {
  safeSet(KEY_CANDIDATES, { date: time.today(), list: list || [] });
}

function getCandidates() {
  const c = safeGet(KEY_CANDIDATES, null);
  if (!c || c.date !== time.today() || !Array.isArray(c.list)) return [];
  return c.list;
}

/** 选中店缓存（当日有效），防止 result 页被直接打开时白屏 */
function savePick(pick) {
  safeSet(KEY_PICK, { date: time.today(), pick: pick || null });
}

function getPick() {
  const c = safeGet(KEY_PICK, null);
  if (!c || c.date !== time.today()) return null;
  return c.pick || null;
}

module.exports = {
  MAX_AGAIN: MAX_AGAIN,
  getSpinRecord: getSpinRecord,
  getRemainCount: getRemainCount,
  bumpSpinCount: bumpSpinCount,
  getPrefs: getPrefs,
  savePrefs: savePrefs,
  saveCandidates: saveCandidates,
  getCandidates: getCandidates,
  savePick: savePick,
  getPick: getPick
};
