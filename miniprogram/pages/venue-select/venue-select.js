// pages/venue-select/venue-select.js
// 场所选择独立页：沉浸式页头 + 搜索 + 当前场所 + 最近选择 + 乡镇分组列表 + 索引导航
// 选择后写入本地存储 cid 并返回首页，首页 onShow 同步刷新
const { get } = require('../../utils/request');

const RECENT_KEY = 'ms_recent_venues';
const RECENT_MAX = 6;
const SEARCH_LIMIT = 50;

Page({
  data: {
    loading: true,
    loadError: false,
    // 搜索
    keyword: '',
    results: [],
    // 分组数据
    sections: [],
    rail: [],
    total: 0,
    townshipCount: 0,
    // 当前场所 / 最近选择
    current: null,
    recent: [],
    activeRail: 0,
  },

  onLoad() {
    this.venueList = [];
    this.load();
  },

  // 拉取场所列表并组装分组、索引、当前场所与最近选择
  load() {
    this.setData({ loading: true, loadError: false });
    get('/api/public/venues', {}, { loading: false })
      .then((res) => {
        const list = res.list || [];
        this.venueList = list;

        const sections = (res.tree || []).map((group, index) => {
          const children = (group.children || [])
            .slice()
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
            .map((v) => ({ id: v.id, name: v.name, township: v.township }));
          return { id: 'sec-' + index, text: group.text, count: children.length, children };
        });

        const rail = sections.map((s, i) => ({ index: i, label: s.text.slice(0, 1) }));

        const cid = String(wx.getStorageSync('cid') || '');
        const current = cid ? list.find((v) => String(v.id) === cid) || null : null;

        this.setData({
          loading: false,
          sections,
          rail,
          total: list.length,
          townshipCount: sections.length,
          current: current ? { id: current.id, name: current.name, township: current.township } : null,
          recent: this.buildRecent(list),
        });
      })
      .catch(() => {
        this.setData({ loading: false, loadError: true });
      });
  },

  // 最近选择：按存储顺序解析成场所对象，最多 RECENT_MAX 个
  buildRecent(list) {
    const raw = wx.getStorageSync(RECENT_KEY);
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const map = {};
    list.forEach((v) => {
      map[String(v.id)] = v;
    });
    return raw
      .map((id) => map[String(id)])
      .filter(Boolean)
      .slice(0, RECENT_MAX)
      .map((v) => ({ id: v.id, name: v.name, township: v.township }));
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
      .map((v) => ({ id: v.id, township: v.township, segs: splitHighlight(v.name, keyword) }));
    this.setData({ keyword, results });
  },

  clearSearch() {
    this.setData({ keyword: '', results: [] });
  },

  // 选择场所：写入存储、记录最近选择并返回
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

    const raw = (wx.getStorageSync(RECENT_KEY) || []).filter((x) => x !== String(id));
    raw.unshift(String(id));
    wx.setStorageSync(RECENT_KEY, raw.slice(0, RECENT_MAX));

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
