// pages/venue/venue.js
const { get } = require('../../utils/request');
const { getVenueId, redirectHome } = require('../../utils/venue');

Page({
  data: {
    venueId: '',
    venue: null,
    loaded: false,
  },

  loadVenue() {
    get(`/api/public/venues/${this.data.venueId}`)
      .then((res) => {
        this.setData({ venue: res, loaded: true });
      })
      .catch(() => {
        this.setData({ loaded: true });
      });
  },

  onLoad(options) {
    const venueId = getVenueId(options);
    if (!venueId) {
      redirectHome();
      return;
    }
    this.setData({ venueId }, () => this.loadVenue());
  },

  onShareAppMessage() {
    return {
      title: '场所介绍',
      path: `/pages/venue/venue?venueId=${this.data.venueId}`,
    };
  },
});
