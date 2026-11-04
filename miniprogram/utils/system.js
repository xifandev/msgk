// utils/system.js
// 自定义导航栏（navigationStyle: custom）的安全区计算
// 参考微信官方方案：状态栏高度取 getWindowInfo，导航行高度由胶囊按钮位置反推，
// 保证刘海屏、灵动岛、挖孔屏、平板等机型顶部内容都不会被状态栏或胶囊遮挡。

// 计算结果与胶囊可用状态在会话内缓存：
// 1) 同一页面/组件多次取值不必重复调用原生接口；
// 2) 胶囊接口在个别环境（如开发者工具 3.17.x 模拟器）会抛
//    `getMenuButtonBoundingClientRect:fail global.windowMap is not iterable`，
//    抛出后只记一次，后续直接走默认值，避免控制台反复刷同一条红字错误。
let cachedArea = null;
let capsuleUnavailable = false;
let devtoolsEnv = null;

// 是否运行在开发者工具模拟器里：
// 模拟器（尤其 trial 基础库 3.17.x）取胶囊会抛
// `getMenuButtonBoundingClientRect:fail global.windowMap is not iterable`，
// 且该错误是原生日志，JS 侧 try/catch 无法吞掉，因此模拟器内直接跳过，用标准 44。
function isDevtools() {
  if (devtoolsEnv !== null) {
    return devtoolsEnv;
  }
  let platform = '';
  try {
    if (typeof wx.getDeviceInfo === 'function') {
      platform = (wx.getDeviceInfo() || {}).platform || '';
    } else if (typeof wx.getSystemInfoSync === 'function') {
      platform = (wx.getSystemInfoSync() || {}).platform || '';
    }
  } catch (e) {
    platform = '';
  }
  devtoolsEnv = platform === 'devtools';
  return devtoolsEnv;
}

// 兼容旧基础库：getWindowInfo 不可用时退回 getSystemInfoSync
function getWindowMetrics() {
  if (typeof wx.getWindowInfo === 'function') {
    try {
      return wx.getWindowInfo() || {};
    } catch (e) {
      // 继续走兜底
    }
  }
  try {
    return wx.getSystemInfoSync() || {};
  } catch (e) {
    return {};
  }
}

// 读取胶囊按钮位置，失败返回 null（不抛错）
function readCapsuleRect() {
  if (capsuleUnavailable || isDevtools() || typeof wx.getMenuButtonBoundingClientRect !== 'function') {
    return null;
  }
  try {
    const rect = wx.getMenuButtonBoundingClientRect();
    // 少数环境返回空对象或 promise-like，视为无效
    if (!rect || typeof rect.top !== 'number' || typeof rect.height !== 'number') {
      return null;
    }
    return rect;
  } catch (e) {
    capsuleUnavailable = true;
    return null;
  }
}

function computeSafeArea() {
  const metrics = getWindowMetrics();
  const statusBarHeight = Number(metrics.statusBarHeight) || 20;

  // 导航行高度：胶囊上下留白对称，navBarHeight = 上间距 * 2 + 胶囊高度
  let navBarHeight = 44;
  const rect = readCapsuleRect();
  if (rect && rect.height > 0 && rect.width > 0) {
    const gap = rect.top - statusBarHeight;
    if (gap >= 0) {
      navBarHeight = gap * 2 + rect.height;
    }
  }
  // 异常值兜底（个别机型/工具会返回 0 或超大值）
  if (!(navBarHeight >= 32) || navBarHeight > 88) {
    navBarHeight = 44;
  }

  return {
    statusBarHeight,
    navBarHeight,
    safeTop: statusBarHeight + navBarHeight,
  };
}

// 返回 { statusBarHeight, navBarHeight, safeTop }
// safeTop：状态栏 + 导航行（胶囊所在行）总高度，页面顶部内容从这里开始
// 注意：取值稳定后才缓存；胶囊信息尚未就绪时不缓存，留给 onReady 的二次校正。
function getSafeArea() {
  if (cachedArea) {
    return cachedArea;
  }
  const area = computeSafeArea();
  // 胶囊读到了或已确认不可用，结果即为最终值
  if (!capsuleUnavailable || area.navBarHeight !== 44) {
    cachedArea = area;
  }
  return area;
}

module.exports = { getSafeArea };
