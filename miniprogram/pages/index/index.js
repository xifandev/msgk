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
    venueKeyword: '',
    venueResults: [],
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
            venueNav: this.navIndexOfVenue(this.data.cid),
          });
        }
      })
      .catch(() => {});
  },

  // 当前场所所属乡镇在左侧导航中的位置
  navIndexOfVenue(id) {
    const venue = (this.venueList || []).find((item) => String(item.id) === String(id));
    if (!venue) return 0;
    const index = (this.data.venueTree || []).findIndex((group) => group.text === venue.township);
    return index > 0 ? index : 0;
  },

  // 选中场所并回到首页
  selectVenue(id, name) {
    const cid = String(id);
    wx.setStorageSync('cid', cid);
    wx.vibrateShort({ type: 'light' });
    this.setData(
      {
        cid,
        venueName: name || '',
        activeVenueId: id,
        venueNav: this.navIndexOfVenue(cid),
        venuePopup: false,
        venueKeyword: '',
        venueResults: [],
        items: [],
        itemsLoaded: false,
      },
      () => this.loadHome()
    );
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
    this.setData({
      venuePopup: true,
      venueNav: this.navIndexOfVenue(this.data.cid),
      venueKeyword: '',
      venueResults: [],
    });
  },

  closeVenuePopup() {
    this.setData({ venuePopup: false, venueKeyword: '', venueResults: [] });
  },

  onVenueNav(e) {
    wx.vibrateShort({ type: 'light' });
    this.setData({ venueNav: e.detail.index || 0 });
  },

  // 搜索场所名称或乡镇
  onVenueSearch(e) {
    const keyword = String((e.detail && e.detail.value) || '').trim();
    const results = keyword
      ? (this.venueList || [])
          .filter((item) => item.name.indexOf(keyword) > -1 || item.township.indexOf(keyword) > -1)
          .slice(0, 50)
          .map((item) => ({ id: item.id, name: item.name, township: item.township }))
      : [];
    this.setData({ venueKeyword: keyword, venueResults: results });
  },

  clearVenueSearch() {
    this.setData({ venueKeyword: '', venueResults: [] });
  },

  // 搜索结果点击
  onVenueResultSelect(e) {
    const { id, name } = e.currentTarget.dataset;
    if (id == null) {
      return;
    }
    this.selectVenue(id, name);
  },

  onVenueSelect(e) {
    const detail = e.detail || {};
    if (detail.id == null) {
      return;
    }
    this.selectVenue(detail.id, detail.text);
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
