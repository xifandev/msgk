// pages/news/news.js
const { get } = require('../../utils/request');
const { formatDate } = require('../../utils/format');

Page({
  data: {
    categories: [],
    activeCategoryId: '',
    list: [],
    loaded: false,
    firstLoad: true,
  },

  loadNews(categoryId) {
    const data = {};
    if (categoryId) {
      data.categoryId = categoryId;
    }
    get('/api/public/news', data)
      .then((res) => {
        const patch = {
          list: (res.list || []).map((item) => ({
            ...item,
            date: formatDate(item.createdAt),
          })),
          loaded: true,
          firstLoad: false,
        };
        if (this.data.firstLoad && res.categories) {
          patch.categories = res.categories;
          if (!this.data.activeCategoryId && res.categories.length > 0) {
            patch.activeCategoryId = String(res.categories[0].id);
          }
        }
        this.setData(patch);
      })
      .catch(() => {
        this.setData({ loaded: true, firstLoad: false });
      });
  },

  onTabClick(e) {
    const index = e.detail.index;
    const category = this.data.categories[index];
    if (!category || String(category.id) === String(this.data.activeCategoryId)) {
      return;
    }
    this.setData(
      {
        activeCategoryId: String(category.id),
        list: [],
        loaded: false,
      },
      () => this.loadNews(category.id)
    );
  },

  openArticle(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/article/article?kind=news&id=${id}` });
  },

  onLoad() {
    this.loadNews();
  },

  onShareAppMessage() {
    return {
      title: '政策法规',
      path: '/pages/news/news',
    };
  },
});
