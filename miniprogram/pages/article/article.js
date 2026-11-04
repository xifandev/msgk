// pages/article/article.js
const { get } = require('../../utils/request');
const { formatDate } = require('../../utils/format');
const { enhanceRichText } = require('../../utils/richtext');

const KIND_TEXT = {
  safety: '场所安全',
  notice: '公告通知',
  news: '政策法规',
};

Page({
  data: {
    kind: '',
    id: '',
    article: null,
    date: '',
    kindText: '信息公开',
    contentHtml: '',
    loadFailed: false,
  },

  loadArticle() {
    const { kind, id } = this.data;
    get(`/api/public/articles/${kind}/${id}`)
      .then((res) => {
        this.setData({
          article: res,
          date: formatDate(res.createdAt),
          kindText: KIND_TEXT[kind] || '信息公开',
          // 正文样式内联 + 图片自适应，解决图片横向溢出
          contentHtml: enhanceRichText(res.content),
          loadFailed: false,
        });
        if (res.title) {
          wx.setNavigationBarTitle({ title: res.title });
        }
      })
      .catch(() => {
        this.setData({ loadFailed: true });
      });
  },

  onLoad(options) {
    const kind = (options && options.kind) || '';
    const id = (options && options.id) || '';
    if (!kind || !id) {
      this.setData({ loadFailed: true });
      return;
    }
    this.setData({ kind, id }, () => this.loadArticle());
  },

  onShareAppMessage() {
    // 分享保留文章参数，好友打开直达本文
    return {
      title: (this.data.article && this.data.article.title) || '码上公开',
      path: `/pages/article/article?kind=${this.data.kind}&id=${this.data.id}`,
    };
  },

  onShareTimeline() {
    return {
      title: (this.data.article && this.data.article.title) || '码上公开',
      query: `kind=${this.data.kind}&id=${this.data.id}`,
    };
  },
});
