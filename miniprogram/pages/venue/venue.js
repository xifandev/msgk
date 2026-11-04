// pages/venue/venue.js
// 场所介绍页：概况卡 + 简介排版 + 登记信息分组
const { get } = require('../../utils/request');
const { getVenueId, redirectHome } = require('../../utils/venue');
const { enhanceRichText, isRichTextEmpty } = require('../../utils/richtext');

Page({
  data: {
    venueId: '',
    venue: null,
    loaded: false,
    // 当前标签：0 场所简介 / 1 登记注册信息
    tabIndex: 0,
    // 简介富文本（已内联排版样式）
    summaryHtml: '',
  },

  // 拉取场所详情
  loadVenue() {
    get(`/api/public/venues/${this.data.venueId}`)
      .then((res) => {
        const summary = res && res.profile ? res.profile.summary : '';
        this.setData({
          venue: res,
          summaryHtml: isRichTextEmpty(summary) ? '' : enhanceRichText(summary),
          loaded: true,
        });
        // 导航栏显示场所名称，避免与页头标题重复
        if (res && res.name) {
          wx.setNavigationBarTitle({ title: res.name });
        }
      })
      .catch(() => {
        // 加载失败不白屏，展示整页空态
        this.setData({ loaded: true, summaryHtml: '' });
      });
  },

  // 切换标签（ms-tabs change 事件）
  onTabChange(e) {
    this.setData({ tabIndex: e.detail.index || 0 });
  },

  // 拨打场所联系电话
  callPhone() {
    const phone = this.data.venue && this.data.venue.profile ? this.data.venue.profile.phone : '';
    if (!phone) {
      wx.showToast({ title: '暂无联系电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({
      phoneNumber: String(phone),
      fail: () => {
        wx.showToast({ title: '拨号未完成', icon: 'none' });
      },
    });
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
