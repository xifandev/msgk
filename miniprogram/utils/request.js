// utils/request.js
// 统一的网络请求封装：自动拼接 apiUrl、加载提示、失败提示，始终以 Promise 返回
function request(path, { data, method = 'GET', loading = true } = {}) {
  return new Promise((resolve, reject) => {
    if (loading) {
      wx.showLoading({ title: '加载中...', mask: true });
    }
    wx.request({
      url: getApp().globalData.apiUrl + path,
      method,
      data,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          wx.showToast({ title: '请求失败，请稍后重试', icon: 'none', duration: 1500 });
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      },
      fail(err) {
        wx.showToast({ title: '网络错误，请稍后重试', icon: 'none', duration: 1500 });
        reject(err);
      },
      complete() {
        if (loading) {
          wx.hideLoading();
        }
      },
    });
  });
}

function get(path, data, options) {
  return request(path, { ...options, data, method: 'GET' });
}

module.exports = { request, get };
