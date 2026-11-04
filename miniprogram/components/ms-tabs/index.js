// components/ms-tabs/index.js
// 原生标签页：等宽/横滑标题 + 触控滑动切换，替代 vant tabs
Component({
  options: { addGlobalClass: true, multipleSlots: true },

  properties: {
    // 标题数组，支持 ['最新动态'] 或 [{ title: '最新动态' }]
    tabs: { type: Array, value: [] },
    active: { type: Number, value: 0 },
    swipeable: { type: Boolean, value: false },
    animated: { type: Boolean, value: true },
    ellipsis: { type: Boolean, value: true },
    color: { type: String, value: '#d31027' },
    lineWidth: { type: String, value: '48rpx' },
  },

  data: {
    titles: [],
    scrollable: false,
  },

  lifetimes: {
    attached() {
      this.refresh();
    },
  },

  observers: {
    tabs() {
      this.refresh();
    },
  },

  methods: {
    refresh() {
      const titles = (this.data.tabs || []).map((item) =>
        typeof item === 'string' ? item : item.title || item.name || ''
      );
      this.setData({ titles, scrollable: titles.length > 4 });
    },

    onTapTitle(e) {
      const index = Number(e.currentTarget.dataset.index);
      if (index === this.data.active) {
        return;
      }
      this.triggerEvent('change', { index });
      this.triggerEvent('click', { index, title: this.data.titles[index] });
    },

    onTouchStart(e) {
      if (!this.data.swipeable) {
        return;
      }
      const touch = e.touches[0];
      this.startX = touch.clientX;
      this.startY = touch.clientY;
    },

    onTouchEnd(e) {
      if (!this.data.swipeable || this.startX == null) {
        return;
      }
      const touch = e.changedTouches[0];
      const dx = touch.clientX - this.startX;
      const dy = touch.clientY - this.startY;
      this.startX = null;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) {
        return;
      }
      const next = dx < 0 ? this.data.active + 1 : this.data.active - 1;
      if (next < 0 || next >= this.data.titles.length) {
        return;
      }
      this.triggerEvent('change', { index: next });
      this.triggerEvent('click', { index: next, title: this.data.titles[next] });
    },
  },
});
