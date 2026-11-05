// pages/index/index.js
const { get } = require('../../utils/request');
const { formatDate } = require('../../utils/format');
const { getSafeArea } = require('../../utils/system');

// 类目标签：新闻类目由接口返回（如「政策法规」），安全/公告类文章没有类目，按来源给固定名称
const KIND_LABEL = {
  safety: '场所安全',
  notice: '公告通知',
  news: '政策法规',
};

Page({
  data: {
    // 自定义导航栏安全区（状态栏 + 胶囊行），由 utils/system 按机型计算
    statusBarHeight: 20,
    navBarHeight: 44,
    safeTop: 64,
    // 当前场所
    cid: '',
    venueName: '',
    // 首页动态
    items: [],
    itemsLoaded: false,
    // 技术支持
    companyShow: false,
  },

  // 拉取场所列表（用于展示当前场所名称）
  loadVenues() {
    return get('/api/public/venues', {}, { loading: false })
      .then((res) => {
        this.venueList = res.list || [];
        if (this.data.cid) {
          const venue = this.venueList.find((item) => String(item.id) === String(this.data.cid));
          this.setData({ venueName: venue ? venue.name : '' });
        }
      })
      .catch(() => {});
  },

  // 拉取首页动态（未选场所时展示全局已发布内容，公告与政策法规对所有场所生效）
  loadHome() {
    const { cid } = this.data;
    get('/api/public/home', { venueId: cid }, { loading: false })
      .then((res) => {
        const items = (res.items || []).map((item) => ({
          ...item,
          category: item.category || KIND_LABEL[item.kind] || '公开信息',
          date: formatDate(item.createdAt),
        }));
        this.setData({ items, itemsLoaded: true });
      })
      .catch(() => {
        this.setData({ itemsLoaded: true });
      });
  },

  // 打开场所选择独立页
  openVenueSelect() {
    wx.vibrateShort({ type: 'light' });
    wx.navigateTo({ url: '/pages/venue-select/venue-select' });
  },

  // 返回本页时同步场所选择（来自场所选择页）
  onShow() {
    const cid = String(wx.getStorageSync('cid') || '');
    if (cid === this.data.cid) {
      return;
    }
    const venue = (this.venueList || []).find((item) => String(item.id) === cid);
    this.setData(
      {
        cid,
        venueName: venue ? venue.name : '',
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
      wx.navigateTo({ url: '/pages/venue-select/venue-select' });
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

  copyCompany() {
    wx.setClipboardData({
      data: '15224499331',
      success() {
        wx.showToast({ title: '已复制，请微信添加好友', icon: 'none' });
      },
    });
  },

  onLoad(options) {
    this.updateSafeArea();
    let cid = (options && options.cid) || wx.getStorageSync('cid') || '';
    if (cid) {
      wx.setStorageSync('cid', cid);
    }
    this.setData({ cid: String(cid) });
    this.loadVenues();
    this.loadHome();
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

  onReady() {
    this.updateSafeArea();
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
