// pages/index/index.js
const { get } = require('../../utils/request');
const { formatDate } = require('../../utils/format');

const KIND_TEXT = {
  safety: '安全',
  notice: '公告',
  news: '动态',
};

Page({
  data: {
    // 当前场所
    cid: '',
    venueName: '',
    showCard: false,
    // 场所选择弹层
    venuePopup: false,
    venueTree: [],
    venueNav: 0,
    activeVenueId: null,
    // 首页动态
    items: [],
    itemsLoaded: false,
    // 技术支持
    companyShow: false,
    // 版本号
    version: '',
  },

  // 拉取场所列表与分组树
  loadVenues() {
    return get('/api/public/venues', {}, { loading: false })
      .then((res) => {
        const tree = (res.tree || []).map((group) => ({
          text: group.text,
          children: (group.children || [])
            .slice()
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
        }));
        this.venueList = res.list || [];
        this.setData({ venueTree: tree });

        if (this.data.cid) {
          const venue = this.venueList.find((item) => String(item.id) === String(this.data.cid));
          this.setData({
            venueName: venue ? venue.name : '',
            activeVenueId: venue ? venue.id : null,
          });
        }
      })
      .catch(() => {});
  },

  // 拉取首页动态
  loadHome() {
    const { cid } = this.data;
    if (!cid) {
      this.setData({ items: [], itemsLoaded: true });
      return;
    }
    get('/api/public/home', { venueId: cid }, { loading: false })
      .then((res) => {
        const items = (res.items || []).map((item) => ({
          ...item,
          kindText: KIND_TEXT[item.kind] || '动态',
          date: formatDate(item.createdAt),
        }));
        this.setData({ items, itemsLoaded: true });
      })
      .catch(() => {
        this.setData({ itemsLoaded: true });
      });
  },

  openVenuePopup() {
    wx.vibrateShort({ type: 'light' });
    this.setData({ venuePopup: true });
  },

  closeVenuePopup() {
    this.setData({ venuePopup: false });
  },

  onVenueNav(e) {
    this.setData({ venueNav: e.detail.index || 0 });
  },

  onVenueSelect(e) {
    const detail = e.detail || {};
    if (detail.id == null) {
      return;
    }
    const cid = String(detail.id);
    wx.setStorageSync('cid', cid);
    wx.vibrateShort({ type: 'light' });
    this.setData(
      {
        cid,
        venueName: detail.text || '',
        activeVenueId: detail.id,
        venuePopup: false,
        items: [],
        itemsLoaded: false,
      },
      () => this.loadHome()
    );
  },

  // 打开动态文章
  openItem(e) {
    const { kind, id } = e.currentTarget.dataset;
    if (!kind || id == null) {
      return;
    }
    wx.navigateTo({ url: `/pages/article/article?kind=${kind}&id=${id}` });
  },

  // 功能入口：需要场所的页面前先校验
  navigate(e) {
    const { url, needVenue } = e.currentTarget.dataset;
    wx.vibrateShort({ type: 'light' });
    if (needVenue && !this.data.cid) {
      this.setData({ venuePopup: true });
      return;
    }
    wx.navigateTo({ url });
  },

  openCompany() {
    this.setData({ companyShow: true });
  },

  closeCompany() {
    this.setData({ companyShow: false });
  },

  callCompany() {
    wx.makePhoneCall({ phoneNumber: '15224499331' });
  },

  onLoad(options) {
    let cid = (options && options.cid) || wx.getStorageSync('cid') || '';
    if (cid) {
      wx.setStorageSync('cid', cid);
    }
    this.setData({ cid: String(cid) });
    this.loadVenues();
    this.loadHome();
    // 延迟触发场所卡片的上滑动画
    setTimeout(() => this.setData({ showCard: true }), 120);
  },

  onReady() {
    const accountInfo = wx.getAccountInfoSync();
    this.setData({ version: accountInfo.miniProgram.version || '开发版' });
  },

  onShareAppMessage() {
    return {
      title: '码上公开',
      path: this.data.cid ? `/pages/index/index?cid=${this.data.cid}` : '/pages/index/index',
    };
  },

  onShareTimeline() {
    return {
      title: '码上公开',
      query: this.data.cid ? `cid=${this.data.cid}` : '',
    };
  },
});
