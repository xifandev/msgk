// pages/venue/venue.js
// 场所介绍页：全屏沉浸式，只展示场所概况与简介正文
const { get } = require('../../utils/request');
const { getVenueId, redirectHome } = require('../../utils/venue');
const { enhanceRichText, isRichTextEmpty } = require('../../utils/richtext');
const { getSafeArea } = require('../../utils/system');

Page({
  data: {
    venueId: '',
    venue: null,
    loaded: false,
    // 简介富文本（已内联排版样式）
    summaryHtml: '',
    // 自定义导航栏安全区
    statusBarHeight: 20,
    navBarHeight: 44,
    safeTop: 64,
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
      })
      .catch(() => {
        // 加载失败不白屏，展示整页空态
        this.setData({ loaded: true, summaryHtml: '' });
      });
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

  // 全屏页返回：无上级页面时兜底回首页
  goBack() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/index/index' }),
    });
  },

  // 计算并同步顶部安全区，onReady 再校正一次（个别机型 onLoad 取不到胶囊信息）
  updateSafeArea() {
    const area = getSafeArea();
    if (
      area.statusBarHeight === this.data.statusBarHeight &&
      area.navBarHeight === this.data.navBarHeight &&
      area.safeTop === this.data.safeTop
    ) {
      return;
    }
    this.setData({
      statusBarHeight: area.statusBarHeight,
      navBarHeight: area.navBarHeight,
      safeTop: area.safeTop,
    });
  },

  onLoad(options) {
    this.updateSafeArea();
    const venueId = getVenueId(options);
    if (!venueId) {
      redirectHome();
      return;
    }
    this.setData({ venueId }, () => this.loadVenue());
  },

  onReady() {
    this.updateSafeArea();
  },

  onShareAppMessage() {
    return {
      title: this.data.venue && this.data.venue.name ? this.data.venue.name : '场所介绍',
      path: `/pages/venue/venue?venueId=${this.data.venueId}`,
    };
  },
});
