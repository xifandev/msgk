// app.js
App({
  onLaunch() {},

  // 扫码进入时解析并缓存 cid（场所 ID）
  onShow(options) {
    const query = (options && options.query) || {};
    const cid = query.cid;
    if (!cid) {
      return;
    }
    const cachedCid = wx.getStorageSync('cid');
    if (cachedCid !== cid) {
      wx.setStorageSync('cid', cid);
    }
  },

  globalData: {
    // 后端 API 地址，全局仅此一处配置
    apiUrl: 'https://api.msgk.getweb.cn',
  },
});
