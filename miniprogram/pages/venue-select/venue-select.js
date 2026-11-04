// pages/venue-select/venue-select.js
// 场所选择独立页：沉浸式页头 + 搜索 + 乡镇分组列表 + 右侧索引导航
// 选择后写入本地存储 cid 并返回首页，首页 onShow 同步刷新
const { get } = require('../../utils/request');

const SEARCH_LIMIT = 50;

Page({
  data: {
    // 状态栏高度：自定义导航栏下自行留出安全区
    statusBarHeight: 20,
    loading: true,
    loadError: false,
    keyword: '',
    results: [],
    sections: [],
    rail: [],
    total: 0,
    townshipCount: 0,
    activeRail: -1,
  },

  onLoad() {
    const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.venueList = [];
    this.setData({ statusBarHeight: (info && info.statusBarHeight) || 20 });
    this.load();
  },

  // 拉取场所列表并组装分组与索引
  load() {
    this.setData({ loading: true, loadError: false });
    get('/api/public/venues', {}, { loading: false })
      .then((res) => {
        const sections = (res.tree || []).map((group, index) => {
          const children = (group.children || [])
            .slice()
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
            .map((v) => ({
              id: v.id,
              // 树节点用 text 承载名称，兼容 name 字段
              name: v.name || v.text || '',
              township: v.township || group.text || '',
            }));
          return { id: 'sec-' + index, text: group.text, count: children.length, children };
        });

        this.venueList = [];
        sections.forEach((s) => s.children.forEach((c) => this.venueList.push(c)));

        this.setData({
          loading: false,
          sections,
          rail: sections.map((s, i) => ({ index: i, label: shortLabel(s.text) })),
          total: this.venueList.length,
          townshipCount: sections.length,
        });
      })
      .catch(() => {
        this.setData({ loading: false, loadError: true });
      });
  },

  // 搜索：名称或乡镇模糊匹配，命中片段高亮
  onSearch(e) {
    const keyword = String((e.detail && e.detail.value) || '').trim();
    if (!keyword) {
      this.setData({ keyword: '', results: [] });
      return;
    }
    const results = (this.venueList || [])
      .filter((v) => v.name.indexOf(keyword) > -1 || v.township.indexOf(keyword) > -1)
      .slice(0, SEARCH_LIMIT)
      .map((v) => ({ id: v.id, name: v.name, township: v.township, segs: splitHighlight(v.name, keyword) }));
    this.setData({ keyword, results });
  },

  clearSearch() {
    this.setData({ keyword: '', results: [] });
  },

  // 选择场所：写入 cid 并返回
  onPick(e) {
    const id = e.currentTarget.dataset.id;
    if (id == null) {
      return;
    }
    const venue = (this.venueList || []).find((v) => String(v.id) === String(id));
    if (!venue) {
      return;
    }

    wx.vibrateShort({ type: 'light' });
    wx.setStorageSync('cid', String(id));
    wx.showToast({ title: '已选择该场所', icon: 'success', duration: 500 });
    setTimeout(() => {
      wx.navigateBack({
        fail: () => wx.reLaunch({ url: '/pages/index/index' }),
      });
    }, 450);
  },

  // 右侧索引：滚动到对应乡镇分组
  onRailTap(e) {
    const index = Number(e.currentTarget.dataset.index) || 0;
    wx.vibrateShort({ type: 'light' });
    this.setData({ activeRail: index });
    wx.pageScrollTo({ selector: '#sec-' + index, duration: 300 });
  },

  goBack() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/index/index' }),
    });
  },
});

// 索引标签：去掉“镇 / 乡”，保留“街道”
function shortLabel(text) {
  return String(text || '').replace(/[镇乡]$/, '');
}

// 名称按关键词拆成高亮片段
function splitHighlight(name, keyword) {
  const segs = [];
  const idx = name.indexOf(keyword);
  if (idx === -1) {
    return [{ t: name, hit: false, i: 0 }];
  }
  if (idx > 0) {
    segs.push({ t: name.slice(0, idx), hit: false, i: segs.length });
  }
  segs.push({ t: keyword, hit: true, i: segs.length });
  const rest = name.slice(idx + keyword.length);
  if (rest) {
    segs.push({ t: rest, hit: false, i: segs.length });
  }
  return segs;
}
