// components/page-main/page-main.js
Component({
  properties: {
    title: {
      type: String,
      value: '',
    },
    title1: {
      type: String,
      value: '',
    },
    title2: {
      type: String,
      value: '',
    },
    title3: {
      type: String,
      value: '',
    },
  },

  methods: {
    onScrollToLower() {
      this.triggerEvent('chudi');
    },
  },
});
