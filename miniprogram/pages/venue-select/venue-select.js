// pages/venue-select/venue-select.js
// 场所选择独立页：沉浸式页头 + 搜索 + 乡镇筛选条 + 分组列表
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
    total: 0,
    townshipCount: 0,
    // 场所切换：先展示加载状态，再展示完成状态
    switching: false,
    switchDone: false,
  },

  onLoad() {
    const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.venueList = [];
    this.setData({
      statusBarHeight: (info && info.statusBarHeight) || 20,
    });
    this.load();
  },

  // 拉取场所列表并组装分组
  load() {
    this.setData({ loading: true, loadError: false });
    get('/api/public/venues', {}, { loading: false })
      .then((res) => {
        const sections = (res.tree || []).map((group, index) => {
          const township = group.text || '';
          const children = (group.children || [])
            .slice()
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
            .map((v) => {
              // 树节点用 text 承载名称，兼容 name 字段
              const name = v.name || v.text || '';
              return {
                id: v.id,
                name,
                // 分组头已标明乡镇，条目内去掉重复的乡镇前缀
                label: stripTownship(name, township),
                township: v.township || township,
              };
            });
          return { id: 'sec-' + index, text: township, count: children.length, children };
        });

        this.venueList = [];
        sections.forEach((s) => s.children.forEach((c) => this.venueList.push(c)));

        this.setData({
          loading: false,
          sections,
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
      .map((v) => ({ id: v.id, name: v.name, township: v.township, segs: splitHighlight(v.label, keyword) }));
    this.setData({ keyword, results });
  },

  clearSearch() {
    this.setData({ keyword: '', results: [] });
  },

  // 选择场所：写入 cid，先展示载入状态，再提示完成并返回
  onPick(e) {
    if (this.data.switching) {
      return;
    }
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
    this.setData({ switching: true, switchDone: false });
    this.switchDoneTimer = setTimeout(() => {
      this.setData({ switchDone: true });
    }, 500);
    this.switchBackTimer = setTimeout(() => {
      wx.navigateBack({
        fail: () => wx.reLaunch({ url: '/pages/index/index' }),
      });
    }, 1050);
  },

  onUnload() {
    clearTimeout(this.switchDoneTimer);
    clearTimeout(this.switchBackTimer);
  },

  goBack() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/index/index' }),
    });
  },
});

// 去掉场所名前重复的乡镇前缀（仅用于分组列表展示，未改动原始数据）
// 例：沂城街道茶庵社区基督教堂 → 茶庵社区基督教堂；道托镇小店子基督教 → 小店子基督教
function stripTownship(name, township) {
  const full = String(township || '').trim();
  if (!full || !name) {
    return name;
  }
  if (name.indexOf(full) === 0) {
    return name.slice(full.length) || name;
  }
  // 兼容简称：乡镇名去掉“镇/乡/街道”后缀后再匹配
  const base = full.replace(/(镇|乡|街道)$/, '');
  if (base && name.indexOf(base) === 0) {
    const rest = name.slice(base.length).replace(/^(镇|乡|街道)/, '');
    return rest || name;
  }
  return name;
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
