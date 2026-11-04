// pages/personnel/personnel.js
// 人员公开页：旧版 renyuan 页面的 1:1 还原（全部使用自研 ms-* 组件）
const { get } = require('../../utils/request');
const { getVenueId, redirectHome } = require('../../utils/venue');

Page({
  data: {
    venueId: '',
    members: [],
    loaded: false,
  },

  // 拉取场所人员列表（列表不分页，无需 chudi 触底加载）
  loadMembers() {
    get('/api/public/personnel', { venueId: this.data.venueId })
      .then((res) => {
        const members = (res.members || [])
          .slice()
          .sort((a, b) => (a.sort || 0) - (b.sort || 0));
        this.setData({ members, loaded: true });
      })
      .catch(() => {
        // 加载失败不白屏，展示空态
        this.setData({ loaded: true });
      });
  },

  // 拨打电话
  callPhone(e) {
    const phone = e.currentTarget.dataset.phone;
    if (phone) {
      wx.makePhoneCall({ phoneNumber: String(phone) });
    }
  },

  onLoad(options) {
    const venueId = getVenueId(options);
    if (!venueId) {
      redirectHome();
      return;
    }
    this.setData({ venueId }, () => this.loadMembers());
  },

  onShareAppMessage() {
    return {
      title: '人员公开',
      path: `/pages/personnel/personnel?venueId=${this.data.venueId}`,
    };
  },
});
