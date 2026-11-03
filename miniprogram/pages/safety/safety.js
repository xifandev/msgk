// pages/safety/safety.js
const { get } = require('../../utils/request');
const { formatDate } = require('../../utils/format');
const { getVenueId, redirectHome } = require('../../utils/venue');

const PAGE_SIZE = 10;

Page({
  data: {
    venueId: '',
    list: [],
    page: 0,
    totalPages: 1,
    isLoading: false,
    noMoreData: false,
    loaded: false,
  },

  loadPage(page) {
    if (this.data.isLoading || this.data.noMoreData) {
      return;
    }
    this.setData({ isLoading: true });
    get('/api/public/safety', {
      venueId: this.data.venueId,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        const list = (res.list || []).map((item) => ({
          ...item,
          date: formatDate(item.createdAt),
        }));
        const currentPage = res.page || page;
        const totalPages = res.totalPages || 1;
        this.setData({
          list: this.data.list.concat(list),
          page: currentPage,
          totalPages,
          isLoading: false,
          noMoreData: currentPage >= totalPages,
          loaded: true,
        });
      })
      .catch(() => {
        this.setData({ isLoading: false, loaded: true });
      });
  },

  // 滚动触底加载下一页
  onScrollLower() {
    if (!this.data.isLoading && !this.data.noMoreData) {
      this.loadPage(this.data.page + 1);
    }
  },

  openArticle(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/article/article?kind=safety&id=${id}` });
  },

  onLoad(options) {
    const venueId = getVenueId(options);
    if (!venueId) {
      redirectHome();
      return;
    }
    this.setData({ venueId }, () => this.loadPage(1));
  },

  onShareAppMessage() {
    return {
      title: '场所安全动态',
      path: `/pages/safety/safety?venueId=${this.data.venueId}`,
    };
  },
});
