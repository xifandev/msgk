// pages/personnel/personnel.js
const { get } = require('../../utils/request');
const { getVenueId, redirectHome } = require('../../utils/venue');

Page({
  data: {
    venueId: '',
    members: [],
    loaded: false,
  },

  loadMembers() {
    get('/api/public/personnel', { venueId: this.data.venueId })
      .then((res) => {
        const members = (res.members || [])
          .slice()
          .sort((a, b) => (a.sort || 0) - (b.sort || 0));
        this.setData({ members, loaded: true });
      })
      .catch(() => {
        this.setData({ loaded: true });
      });
  },

  callPhone(e) {
    const phone = e.currentTarget.dataset.phone;
    if (phone) {
      wx.makePhoneCall({ phoneNumber: String(phone) });
    }
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
