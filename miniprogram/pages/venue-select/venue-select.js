// pages/venue-select/venue-select.js
// 场所选择独立页：沉浸式页头 + 搜索 + 乡镇筛选条 + 分组列表
// 选择后写入本地存储 cid 并返回首页，首页 onShow 同步刷新
const { get } = require('../../utils/request');

const SEARCH_LIMIT = 50;

Page({
  data: {
    // 状态栏高度：自定义导航栏下自行留出安全区
    statusBarHeight: 20,
    // 吸顶筛选条高度（px），用于分组标题的 sticky 偏移
    chipBarHeight: 42,
    loading: true,
    loadError: false,
    keyword: '',
    results: [],
    sections: [],
    towns: [],
    total: 0,
    townshipCount: 0,
    // 当前高亮 / 需要滚动到可视区的乡镇
    activeChip: 0,
    chipIntoView: '',
  },

  onLoad() {
    const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const winWidth = (info && info.windowWidth) || 375;
    this.venueList = [];
    this.sectionTops = [];
    this.setData({
      statusBarHeight: (info && info.statusBarHeight) || 20,
      // 84rpx 的筛选条高度换算成 px，供 sticky 偏移使用
      chipBarHeight: Math.round((84 * winWidth) / 750),
    });
    this.load();
  },

  // 拉取场所列表并组装分组与乡镇筛选
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

        this.setData(
          {
            loading: false,
            sections,
            towns: sections.map((s, i) => ({ index: i, label: shortLabel(s.text) })),
            total: this.venueList.length,
            townshipCount: sections.length,
          },
          () => this.measureSections()
        );
      })
      .catch(() => {
        this.setData({ loading: false, loadError: true });
      });
  },

  // 记录各分组标题的位置，用于滚动时高亮当前乡镇
  measureSections() {
    wx.createSelectorQuery()
      .selectAll('.section__head')
      .boundingClientRect()
      .selectViewport()
      .scrollOffset()
      .exec((res) => {
        const rects = (res && res[0]) || [];
        const scrollTop = (res && res[1] && res[1].scrollTop) || 0;
        this.sectionTops = rects.map((r) => r.top + scrollTop);
      });
  },

  onPageScroll(e) {
    const tops = this.sectionTops || [];
    if (!tops.length) {
      return;
    }
    const line = e.scrollTop + this.data.statusBarHeight + this.data.chipBarHeight + 16;
    let index = 0;
    for (let i = 0; i < tops.length; i += 1) {
      if (tops[i] <= line) {
        index = i;
      }
    }
    if (index !== this.data.activeChip) {
      this.setData({ activeChip: index });
    }
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

  // 乡镇筛选：滚动到对应分组，并把胶囊滚进可视区
  onChipTap(e) {
    const index = Number(e.currentTarget.dataset.index) || 0;
    wx.vibrateShort({ type: 'light' });
    this.setData({ activeChip: index, chipIntoView: 'chip-' + index });
    wx.pageScrollTo({
      selector: '#sec-' + index,
      offsetTop: -(this.data.statusBarHeight + this.data.chipBarHeight),
      duration: 300,
    });
  },

  goBack() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/index/index' }),
    });
  },
});

// 筛选标签：去掉“镇 / 乡”，保留“街道”
function shortLabel(text) {
  return String(text || '').replace(/[镇乡]$/, '');
}

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
