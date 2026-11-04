// pages/personnel/personnel.js
// 人员公开页：竖版证件照 + 职务/教职标签列表（全部使用自研 ms-* 组件）
const { get } = require('../../utils/request');
const { getVenueId, redirectHome } = require('../../utils/venue');

// 把"安全生产组织成员 财务管理组织成员"这类合并填写拆成独立标签
function splitRoles(value) {
  return String(value || '')
    .split(/[\s,，、;；\/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

Page({
  data: {
    venueId: '',
    members: [],
    loaded: false,
  },

  // 拉取场所人员列表（列表不分页，无需 chudi 触底加载）
  loadMembers() {
    get('/api/public/personnel', { venueId: this.data.venueId })
      .then((res) => {
        const members = (res.members || [])
          .slice()
          .sort((a, b) => (a.sort || 0) - (b.sort || 0))
          .map((member) => ({
            ...member,
            // 职务/教职可能一次填多个（空格、顿号、逗号、斜杠、换行分隔），拆成独立标签一行一个展示
            positions: splitRoles(member.position),
            clergies: splitRoles(member.clergy),
          }));
        this.setData({ members, loaded: true });
      })
      .catch(() => {
        // 加载失败不白屏，展示空态
        this.setData({ loaded: true });
      });
  },

  onLoad(options) {
    const venueId = getVenueId(options);
    if (!venueId) {
      redirectHome();
      return;
    }
    this.setData({ venueId }, () => this.loadMembers());
  },

  onShareAppMessage() {
    return {
      title: '人员公开',
      path: `/pages/personnel/personnel?venueId=${this.data.venueId}`,
    };
  },
});
