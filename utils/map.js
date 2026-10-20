// utils/map.js —— 腾讯位置服务（微信小程序 JavaScript SDK）封装
// + 归一化 / 去重 / 排除过滤 / 兜底搜索
// 说明：不装 npm 包，SDK 文件放在同目录 qqmap-wx-jssdk.js，直接 require 使用；
//       门店数据 100% 来自腾讯位置服务，工程内没有任何本地假数据。
// 使用前：
//   ① https://lbs.qq.com → 控制台 → 应用管理 → 我的应用 → 添加 Key，勾选「WebServiceAPI」；
//   ② 把 Key 填到下面的 KEY（不填也能编译，点「转！别想了」会弹中文指引）；
//   ③ 发布前到小程序后台「开发管理 → 开发设置 → 服务器域名 → request 合法域名」
//      添加 https://apis.map.qq.com
//      （开发阶段可先在开发者工具「详情 → 本地设置」勾「不校验合法域名」）。

const QQMapWX = require('./qqmap-wx-jssdk.js');

// 腾讯位置服务 Key（必须勾选 WebServiceAPI，否则周边搜索会报 status 199 / 311）
// 请到 https://lbs.qq.com 申请后替换下面这行；留空不会白屏，点「转！别想了」会弹中文指引
const KEY = 'YOUR_QQMAP_KEY';

// 官方 SDK 的构造函数里 key 为空会直接 throw，导致整包白屏；
// 这里用哨兵值占位，真正发请求前由 noKeyError() 拦下并给中文指引
const PLACEHOLDER_KEY = 'NOT_SET_YET';
const qqmapsdk = new QQMapWX({ key: KEY || PLACEHOLDER_KEY });

const LOCATION_TIMEOUT = 8000;
const PAGE_SIZE = 20;              // 腾讯 page_size 上限 20
const DEFAULT_RADIUS = 500;

/**
 * 排除法分类表
 * key     显示名（同时作为兜底搜索关键词）
 * emoji   贴纸风格图标
 * tokens  匹配腾讯 category（形如 "美食:中餐厅:快餐"）用，也拼上店名一起匹配，命中率更高
 */
const CATEGORIES = [
  { key: '小吃', emoji: '🍢', tokens: ['小吃', '零食', '卤味', '炸串', '串串', '烤冷面', '凉皮', '肉夹馍', '臭豆腐', '关东煮'] },
  { key: '快餐', emoji: '🍔', tokens: ['快餐', '便当', '汉堡', '炸鸡', '披萨', '简餐', '麻辣烫', '沙县', '盖浇饭', '肯德基', '麦当劳'] },
  { key: '面食', emoji: '🍜', tokens: ['面食', '面馆', '拉面', '牛肉面', '刀削面', '面条', '馄饨', '饺子', '包子', '米粉', '螺蛳粉', '米线'] },
  { key: '米饭', emoji: '🍚', tokens: ['米饭', '炒饭', '盖饭', '黄焖鸡', '煲仔饭', '家常菜', '小炒', '食堂', '中餐厅', '中式快餐'] },
  { key: '火锅', emoji: '🍲', tokens: ['火锅', '涮', '麻辣锅', '串串香', '羊蝎子'] },
  { key: '烧烤', emoji: '🍡', tokens: ['烧烤', '烤肉', '烤串', '铁板烧', '小龙虾', '大排档', 'bbq'] },
  { key: '日料', emoji: '🍣', tokens: ['日料', '日本料理', '日式', '寿司', '居酒屋', '刺身', '烧鸟', '天妇罗', '日韩料理', '韩国料理', '石锅拌饭'] },
  { key: '西餐', emoji: '🍝', tokens: ['西餐', '西式', '牛排', '意面', '意大利', '法餐', '外国餐厅'] },
  { key: '甜品', emoji: '🍰', tokens: ['甜品', '蛋糕', '面包', '烘焙', '冰淇淋', '冰激凌', '糖水', '糕点', '面包甜点', '甜点'] },
  { key: '咖啡奶茶', emoji: '☕', tokens: ['咖啡', '奶茶', '茶饮', '饮品', '果茶', '柠檬茶', '咖啡厅', '冷饮', '茶艺馆'] }
];

// 匹配优先级：越靠前越"专属"，避免"西餐厅"被"米饭"的 token（中餐厅）抢走
const MATCH_ORDER = ['日料', '西餐', '火锅', '烧烤', '咖啡奶茶', '甜品', '面食', '快餐', '米饭', '小吃'];

// 平台给的"泛"类目（腾讯"美食:中餐厅"）：认不出具体菜系时兜底算作米饭类，
// 保证"不想吃米饭"这类排除对普通中餐馆也生效
const GENERIC_TOKENS = [
  { key: '米饭', tokens: ['中餐厅', '中餐', '餐厅', '家常菜', '小炒', '食堂', '餐饮'] }
];

const CATEGORY_MAP = {};
CATEGORIES.forEach(function (c) { CATEGORY_MAP[c.key] = c; });

/** 球面距离（米） */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** 去掉空白与常见标点，用于店名去重 */
function nameKey(name) {
  return String(name || '').replace(/[\s·•\-—_（）()【】[\],，。.、]/g, '').toLowerCase();
}

/**
 * 把平台分类串统一成"空格分隔的可匹配文本"
 * 高德："餐饮服务;西餐厅;西餐"        腾讯："美食:中餐厅:快餐"
 * 两种分隔符都拍平成空格，剩下的就是纯子串匹配
 */
function categoryText(text) {
  return String(text || '').replace(/[;:：|/、,，]/g, ' ');
}

/** 在一段文本里按"专属优先"的顺序找类别 key */
function matchCategoryKey(text) {
  if (!text) return '';
  const low = categoryText(text).toLowerCase();
  for (let i = 0; i < MATCH_ORDER.length; i++) {
    const cat = CATEGORY_MAP[MATCH_ORDER[i]];
    if (!cat) continue;
    for (let j = 0; j < cat.tokens.length; j++) {
      if (low.indexOf(String(cat.tokens[j]).toLowerCase()) > -1) return cat.key;
    }
  }
  return '';
}

/**
 * 推断类别，三步走：
 * 1) 只看平台返回的 category（最权威，腾讯"美食:外国餐厅:日本料理" -> 日料）
 * 2) 认不出再看 category + 店名（"美食:中餐厅 + 老张牛肉面" -> 面食）
 * 3) 还是认不出，用泛类目兜底（"美食:中餐厅" -> 米饭），保证排除功能对它也生效
 */
function guessCategoryKey(poi) {
  const cat = String((poi && (poi.category || poi.type)) || '');
  const title = String((poi && (poi.title || poi.name)) || '');

  const byCategory = matchCategoryKey(cat);
  if (byCategory) return byCategory;

  const byName = matchCategoryKey(cat + ' ' + title);
  if (byName) return byName;

  const low = categoryText(cat).toLowerCase();
  for (let i = 0; i < GENERIC_TOKENS.length; i++) {
    const g = GENERIC_TOKENS[i];
    for (let j = 0; j < g.tokens.length; j++) {
      if (low.indexOf(String(g.tokens[j]).toLowerCase()) > -1) return g.key;
    }
  }
  return '';
}

function guessEmoji(poi) {
  const cat = guessCategoryKey(poi);
  return (CATEGORY_MAP[cat] && CATEGORY_MAP[cat].emoji) || '🍽️';
}

/**
 * 解析坐标，三种格式都吃：
 * 腾讯：location = { lat: 28.1, lng: 112.9 }
 * 字符串："112.938814,28.228209"（经度在前，高德风格的历史数据）
 * 对象：{ latitude, longitude }
 */
function parseLocation(loc) {
  if (typeof loc === 'string') {
    const p = loc.split(',');
    return { lng: Number(p[0]), lat: Number(p[1]) };
  }
  const o = loc || {};
  const lat = (o.lat !== undefined && o.lat !== null) ? o.lat : o.latitude;
  const lng = (o.lng !== undefined && o.lng !== null) ? o.lng : o.longitude;
  return { lat: Number(lat), lng: Number(lng) };
}

/** 把腾讯返回的原始 POI 统一成项目内部结构（字段一个都不多、一个都不少） */
function normalizePoi(poi, origin) {
  const p = poi || {};
  const loc = parseLocation(p.location);
  const lat = loc.lat;
  const lng = loc.lng;
  const name = p.title || p.name || '无名小店';

  // 腾讯：_distance 是"米"；没有就自己用球面距离算，保证展示和排序都有数
  let distance = Number(p.distance !== undefined ? p.distance : p._distance);
  if (!distance || isNaN(distance)) {
    distance = (origin && origin.latitude)
      ? haversine(origin.latitude, origin.longitude, lat, lng)
      : null;
  }

  const catKey = guessCategoryKey(p);

  // 地址优先级：腾讯 address -> address_reference 地标 -> 高德老字段 -> 缺
  let address = p.address;
  if (Array.isArray(address)) address = address.join('');
  address = String(address || '').trim();
  if (!address && p.address_reference && typeof p.address_reference === 'object') {
    const l2 = p.address_reference.landmark_l2 || {};
    const l1 = p.address_reference.landmark_l1 || {};
    address = String(l2.title || l1.title || '').trim();
  }
  if (!address) {
    address = String((p.pname || '') + (p.cityname || '') + (p.adname || '')) ||
      (p.ad_info && p.ad_info.title) || '';
  }
  if (!address) address = '地址暂缺';

  const id = p.id || (nameKey(name) + '@' +
    (isNaN(lat) ? '?' : lat.toFixed(5)) + ',' + (isNaN(lng) ? '?' : lng.toFixed(5)));

  return {
    id: id,
    name: name,
    catKey: catKey,
    category: p.category || p.type || catKey || '美食',
    address: address,
    latitude: lat,
    longitude: lng,
    distance: distance,
    emoji: guessEmoji(p)
  };
}

/** 去重：同店名 或 相距 60m 内视为同一家 */
function dedupe(list) {
  const out = [];
  const seen = {};
  (list || []).forEach(function (p) {
    const k = nameKey(p.name);
    if (k && seen[k]) return;
    for (let i = 0; i < out.length; i++) {
      const o = out[i];
      if (o.latitude && p.latitude &&
        haversine(o.latitude, o.longitude, p.latitude, p.longitude) < 60) return;
    }
    if (k) seen[k] = true;
    out.push(p);
  });
  return out;
}

/** 是否落在用户勾选的"不想吃"里（客户端最后一道防线） */
function isExcluded(poi, excluded) {
  if (!excluded || !excluded.length) return false;
  const hay = String(poi.category || '') + ' ' + String(poi.name || '');
  for (let i = 0; i < excluded.length; i++) {
    const cat = CATEGORY_MAP[excluded[i]];
    if (!cat) continue;
    if (poi.catKey === cat.key) return true;
    for (let j = 0; j < cat.tokens.length; j++) {
      if (hay.indexOf(cat.tokens[j]) > -1) return true;
    }
  }
  return false;
}

/** 还没填 Key：单独一种错误，弹窗直接教怎么填 */
function noKeyError() {
  const e = new Error('还没填腾讯位置服务 Key');
  e.noKey = true;
  e.raw = 'utils/map.js 顶部的 KEY 是空的';
  return e;
}

/** 把 wx.request 的英文 errMsg 翻译成"照做就能好"的中文 */
function requestFailText(msg) {
  if (/url not in domain list/i.test(msg)) {
    return '腾讯地图域名没放行：开发者工具「详情 → 本地设置」勾「不校验合法域名」可先跑通；上线前须在小程序后台「开发管理 → 开发设置 → 服务器域名」把 https://apis.map.qq.com 加入 request 合法域名';
  }
  if (/timeout/i.test(msg)) return '请求腾讯位置服务超时，检查网络后重试';
  if (/ssl|handshake/i.test(msg)) return 'HTTPS 证书校验失败，换网络或关掉代理后重试';
  return msg;
}

/**
 * 把失败翻译成弹窗文案（页面只管展示），纯提示：
 * 调用方拿到的仍然是 reject —— 工程绝不因为报错而返回任何本地假数据
 * 腾讯错误码：http://lbs.qq.com/webservice_v1/guide-error.html
 */
function explainError(err) {
  const raw = (err && (err.raw || err.message)) || '';
  if (err && err.noKey) {
    return {
      title: '先填腾讯地图 Key',
      content: '打开 utils/map.js，把顶部 const KEY 的值换成你自己的 Key：https://lbs.qq.com → 控制台 → 应用管理 → 我的应用 → 添加 Key，勾选「WebServiceAPI」，保存后复制（形如 TZNBZ-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX）',
      canRetry: true
    };
  }
  const FIX = {
    '311': '这把 Key 不对：确认完整复制（形如 TZNBZ-XXXXX-…），且控制台里勾了「WebServiceAPI」',
    '199': '这把 Key 没开 WebServiceAPI：腾讯控制台 → 我的应用 → 该 Key → 勾选「WebServiceAPI」并保存',
    '121': '这把 Key 今天的调用量用完了：控制台看配额，明天再转（或换一把 Key）',
    '120': '请求太密被限流：停两秒再点「转！别想了」',
    '110': '请求参数不合法（多半是坐标没拿到）：点首页定位卡重新定位后再试',
    '111': '签名校验失败：腾讯控制台把该 Key 的「签名校验 / SK」关掉',
    '112': '这把 Key 配了 IP 白名单：小程序出口 IP 不固定，去控制台清空白名单',
    '113': '这把 Key 没被授权调用该功能：检查「WebServiceAPI」是否勾选',
    '300': '缺少必要参数：确认已经拿到定位（首页定位卡显示"已锁定"）再来'
  };
  const status = String((err && err.status) || '');
  if (FIX[status]) {
    return {
      title: '腾讯地图要调一下',
      content: FIX[status] + '（status=' + status + '）',
      canRetry: true
    };
  }
  if (err && err.isDomainBlocked) {
    return {
      title: '腾讯地图域名没放行',
      content: '① 开发者工具「详情 → 本地设置」勾选「不校验合法域名…」；② 上线前到小程序后台「开发管理 → 开发设置 → 服务器域名」，把 https://apis.map.qq.com 加进 request 合法域名。',
      canRetry: true
    };
  }
  return { title: '命运卡住了', content: String(raw) || '网络不太行，再试一次', canRetry: true };
}

/* ------------------------------------------------------------------
 * 搜索
 * ------------------------------------------------------------------ */

/**
 * 单次 POI 周边检索（腾讯 place/v1/search）
 * @param {{latitude:number, longitude:number, radius:number, keyword:string, pageSize:number, filter:string}} p
 * @returns Promise<Array> 原始 POI 列表（腾讯 data 数组，保留 _distance / address_reference）
 */
function searchKeyword(p) {
  const pageSize = Math.min(p.pageSize || PAGE_SIZE, PAGE_SIZE);
  const radius = Number(p.radius) || DEFAULT_RADIUS;

  return new Promise(function (resolve, reject) {
    if (!KEY) {
      reject(noKeyError());
      return;
    }
    const opts = {
      keyword: p.keyword || '美食',
      // 腾讯：纬度在前、经度在后；SDK 内部拼成 nearby(lat,lng,半径,auto_extend)
      location: { latitude: Number(p.latitude), longitude: Number(p.longitude) },
      distance: String(radius),          // 半径，用户选"找多远"就搜多远
      // 关键：SDK 源码里是 options.auto_extend || 1，传数字 0 会被吞成 1
      //（自动扩到 1km、2km 甚至全城），必须传字符串 '0'
      auto_extend: '0',
      page_size: pageSize,
      page_index: 1,
      success: function (res) {
        resolve(Array.isArray(res && res.data) ? res.data : []);
      },
      fail: function (err) {
        const msg = (err && (err.message || err.errMsg)) || '腾讯位置服务请求失败';
        const e = new Error(requestFailText(msg));
        e.status = String((err && err.status) || '');
        e.raw = msg;
        e.isDomainBlocked = /url not in domain list/i.test(msg);
        reject(e);
      }
    };
    // 形如 category<>美食:中餐厅；不需要过滤时干脆不传这个参数
    if (p.filter) opts.filter = p.filter;

    qqmapsdk.search(opts);
  });
}

/** 按距离升序（腾讯接口虽默认 _distance 排序，客户端再排一次兜底） */
function sortByDistance(list) {
  return list.sort(function (a, b) {
    const av = (a.distance === null || a.distance === undefined) ? 9e9 : a.distance;
    const bv = (b.distance === null || b.distance === undefined) ? 9e9 : b.distance;
    return av - bv;
  });
}

/**
 * 附近餐厅主流程（逻辑与高德版一致，只换了数据源）
 * 1) keyword='美食' 搜一遍（page_size 20，腾讯上限 20）
 * 2) 归一化 + 去重 + 过滤掉用户排除的类别
 * 3) 过滤后不足 4 家 -> 用未排除的类别关键词分别再搜一次，合并去重
 * @returns Promise<Array> 内部结构列表，按距离升序
 */
function searchNearby(o) {
  const origin = { latitude: o.latitude, longitude: o.longitude };
  const excluded = o.excluded || [];

  return searchKeyword({
    latitude: o.latitude,
    longitude: o.longitude,
    radius: o.radius,
    keyword: '美食',
    pageSize: PAGE_SIZE
  }).then(function (raw) {
    let list = dedupe((raw || []).map(function (p) { return normalizePoi(p, origin); }))
      .filter(function (p) { return !isExcluded(p, excluded); });

    if (list.length >= 4) return sortByDistance(list);

    // 兜底：按未排除的类别关键词分别补搜，合并去重
    const allowed = CATEGORIES.filter(function (c) { return excluded.indexOf(c.key) === -1; });
    const tasks = allowed.map(function (c) {
      return searchKeyword({
        latitude: o.latitude,
        longitude: o.longitude,
        radius: o.radius,
        keyword: c.key,
        pageSize: 10
      }).catch(function () { return []; }); // 单个关键词失败不阻塞主流程
    });

    return Promise.all(tasks).then(function (groups) {
      const extra = [];
      groups.forEach(function (g) {
        (g || []).forEach(function (p) { extra.push(normalizePoi(p, origin)); });
      });
      list = dedupe(list.concat(extra)).filter(function (p) { return !isExcluded(p, excluded); });
      return sortByDistance(list);
    });
  });
}


/**
 * 转盘候选池：> max 随机取 max 家，2~max 全上，< 2 返回空数组（页面走空状态）
 * @param avoidId 上一次选中的店，能避开就避开（池子太小则不强求）
 */
function sampleForWheel(list, max, avoidId) {
  const pool = (list || []).slice();
  if (pool.length < 2) return [];
  // Fisher-Yates 洗牌
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  const limit = Math.min(max || 8, pool.length);
  const out = pool.slice(0, limit);
  if (avoidId && limit > 1) {
    let hit = -1;
    for (let k = 0; k < out.length; k++) {
      if (out[k].id === avoidId) { hit = k; break; }
    }
    if (hit > -1) {
      for (let m = limit; m < pool.length; m++) {
        if (pool[m].id !== avoidId) { out[hit] = pool[m]; break; }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------
 * 定位 / 逆地址解析
 * ------------------------------------------------------------------ */

/**
 * 定位 Promise 封装，denied=true 表示用户拒绝授权
 * 微信 getLocation 与腾讯位置服务同为 GCJ-02，坐标系一致，无需转换
 * 返回 { latitude, longitude, accuracy }
 */
function locate() {
  return new Promise(function (resolve, reject) {
    wx.getLocation({
      type: 'gcj02',                 // 腾讯和微信都用 GCJ-02；换成 wgs84 会整体偏几百米
      isHighAccuracy: true,          // 强开 GPS：false 走基站/WiFi，城里误差能到几百米
      highAccuracyExpireTime: 4000,  // 最多等 4 秒拿一个高精度坐标
      timeout: LOCATION_TIMEOUT,
      success: function (res) {
        const pos = {
          latitude: res.latitude,
          longitude: res.longitude,
          accuracy: Math.round(res.accuracy || 0)   // 精度（米），用来判断坐标靠不靠谱
        };
        console.log('[locate]', pos);
        resolve(pos);
      },
      fail: function (err) {
        const msg = (err && err.errMsg) || '';
        const denied = /auth deny|auth denied|authorize|permission/i.test(msg);
        const e = new Error(denied ? '定位权限被拒绝' : '定位失败');
        e.denied = denied;
        e.raw = msg;
        reject(e);
      }
    });
  });
}

/**
 * 逆地址解析：把坐标翻译成"城市+区"
 * 只用来给用户自检（卡片上看到"长沙市岳麓区"，人不在长沙就立刻知道坐标不对），失败静默
 */
function regeo(latitude, longitude) {
  return new Promise(function (resolve, reject) {
    if (!KEY) {
      reject(noKeyError());
      return;
    }
    qqmapsdk.reverseGeocoder({
      location: { latitude: Number(latitude), longitude: Number(longitude) },
      get_poi: 0,
      success: function (res) {
        const r = (res && res.result) || {};
        const ac = r.address_component || {};
        const city = ac.city || ac.province || '';   // 直辖市 city 为空，退回 province
        const district = ac.district || '';
        const rec = (r.formatted_addresses && r.formatted_addresses.recommend) || '';
        resolve({
          city: city,
          district: district,
          label: city + district,          // 例如"长沙市岳麓区"
          address: rec || r.address || ''  // 例如"岳麓区麓山南路xx号"
        });
      },
      fail: function (err) {
        const msg = (err && (err.message || err.errMsg)) || '逆地址解析失败';
        const e = new Error(requestFailText(msg));
        e.status = String((err && err.status) || '');
        e.raw = msg;
        e.isDomainBlocked = /url not in domain list/i.test(msg);
        reject(e);
      }
    });
  });
}

module.exports = {
  KEY: KEY,
  CATEGORIES: CATEGORIES,
  MATCH_ORDER: MATCH_ORDER,
  haversine: haversine,
  nameKey: nameKey,
  guessCategoryKey: guessCategoryKey,
  guessEmoji: guessEmoji,
  normalizePoi: normalizePoi,
  dedupe: dedupe,
  isExcluded: isExcluded,
  searchKeyword: searchKeyword,
  searchNearby: searchNearby,
  explainError: explainError,
  sampleForWheel: sampleForWheel,
  locate: locate,
  regeo: regeo
};




