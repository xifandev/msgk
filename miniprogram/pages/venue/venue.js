// pages/venue/venue.js
// 场所介绍页：旧版 changsuo 页面的 1:1 还原（全部使用自研 ms-* 组件）
const { get } = require('../../utils/request');
const { getVenueId, redirectHome } = require('../../utils/venue');

Page({
  data: {
    venueId: '',
    venue: null,
    loaded: false,
    // 当前标签：0 场所简介 / 1 登记注册信息
    tabIndex: 0,
  },

  // 拉取场所详情
  loadVenue() {
    get(`/api/public/venues/${this.data.venueId}`)
      .then((res) => {
        this.setData({ venue: res, loaded: true });
      })
      .catch(() => {
        // 加载失败不白屏，展示整页空态
        this.setData({ loaded: true });
      });
  },

  // 切换标签（ms-tabs change 事件）
  onTabChange(e) {
    this.setData({ tabIndex: e.detail.index || 0 });
  },

  onLoad(options) {
    const venueId = getVenueId(options);
    if (!venueId) {
      redirectHome();
      return;
    }
    this.setData({ venueId }, () => this.loadVenue());
  },

  onShareAppMessage() {
    return {
      title: this.data.venue && this.data.venue.name ? this.data.venue.name : '场所介绍',
      path: `/pages/venue/venue?venueId=${this.data.venueId}`,
    };
  },
});
