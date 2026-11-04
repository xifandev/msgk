// app.js
// 各环境后端地址：develop=开发版（模拟器/真机调试）、trial=体验版、release=正式版
const API_URLS = {
  develop: 'http://localhost:3000',
  trial: 'https://api.msgk.getweb.cn',
  release: 'https://api.msgk.getweb.cn',
};

App({
  onLaunch() {
    // 按当前小程序运行环境自动切换 API 地址，打包上线无需手动改回
    const env = (wx.getAccountInfoSync().miniProgram || {}).envVersion || 'release';
    this.globalData.apiUrl = API_URLS[env] || API_URLS.release;
  },

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
    // 后端 API 地址，由 onLaunch 按环境自动写入，勿在此硬编码
    apiUrl: API_URLS.release,
  },
});
