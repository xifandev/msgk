// utils/system.js
// 自定义导航栏（navigationStyle: custom）的安全区计算
// 参考微信官方方案：状态栏高度取 getWindowInfo，导航行高度由胶囊按钮位置反推，
// 保证刘海屏、灵动岛、挖孔屏、平板等机型顶部内容都不会被状态栏或胶囊遮挡。

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

// 返回 { statusBarHeight, navBarHeight, safeTop }
// safeTop：状态栏 + 导航行（胶囊所在行）总高度，页面顶部内容从这里开始
function getSafeArea() {
  const metrics = getWindowMetrics();
  const statusBarHeight = Number(metrics.statusBarHeight) || 20;

  // 导航行高度：胶囊上下留白对称，navBarHeight = 上间距 * 2 + 胶囊高度
  let navBarHeight = 44;
  try {
    const rect = wx.getMenuButtonBoundingClientRect();
    if (rect && rect.height > 0 && rect.width > 0) {
      const gap = rect.top - statusBarHeight;
      if (gap >= 0) {
        navBarHeight = gap * 2 + rect.height;
      }
    }
  } catch (e) {
    // 部分环境取不到胶囊信息，使用默认 44
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

module.exports = { getSafeArea };
