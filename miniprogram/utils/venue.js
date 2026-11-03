// utils/venue.js
// 场所（venueId，即扫码/缓存的 cid）读取与校验
function getVenueId(options) {
  if (options && options.venueId) {
    wx.setStorageSync('cid', options.venueId);
    return options.venueId;
  }
  return wx.getStorageSync('cid') || '';
}

// 无场所时返回首页选择
function redirectHome() {
  wx.redirectTo({ url: '/pages/index/index' });
}

module.exports = { getVenueId, redirectHome };
