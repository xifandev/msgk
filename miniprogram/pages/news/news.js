// pages/news/news.js
// 政策法规：分类标签 + 书本卡片列表（按旧版 fagui 页逻辑还原）
const { get } = require('../../utils/request');
const { formatDate } = require('../../utils/format');

Page({
  data: {
    categories: [],       // 全部分类
    tabs: [],             // 标签标题数组（供 ms-tabs 使用）
    activeIndex: 0,       // 当前标签下标
    activeCategoryId: '', // 当前分类 id
    list: [],             // 当前分类文章列表
    loaded: false,        // 当前分类列表是否加载完成
    firstLoad: true,      // 是否首次加载（首次需同时拉取分类）
  },

  // 拉取政策法规列表；首次加载时同时保存分类并生成标签
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
        // 首次加载：保存分类，默认选中第一个
        if (this.data.firstLoad && res.categories) {
          patch.categories = res.categories;
          patch.tabs = res.categories.map((item) => item.name);
          if (!this.data.activeCategoryId && res.categories.length > 0) {
            patch.activeCategoryId = String(res.categories[0].id);
          }
        }
        this.setData(patch);
      })
      .catch(() => {
        // 加载失败也置为完成态，让页面显示空态而不是白屏
        this.setData({ loaded: true, firstLoad: false });
      });
  },

  // 切换标签：重新请求该分类的文章列表
  onTabChange(e) {
    const index = e.detail.index;
    const category = this.data.categories[index];
    // 无效分类或重复点击当前分类时不重复请求
    if (!category || String(category.id) === String(this.data.activeCategoryId)) {
      return;
    }
    this.setData(
      {
        activeIndex: index,
        activeCategoryId: String(category.id),
        list: [],
        loaded: false,
      },
      () => this.loadNews(category.id)
    );
  },

  // 打开文章详情
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
