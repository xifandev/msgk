// components/ms-tree-select/index.js
// 原生左右分栏选择器（场所选择），替代 vant tree-select
Component({
  options: { addGlobalClass: true },

  properties: {
    items: { type: Array, value: [] },
    mainActiveIndex: { type: Number, value: 0 },
    activeId: { type: null, value: null },
    height: { type: Number, value: 300 },
  },

  data: {
    children: [],
    currentIndex: 0,
  },

  lifetimes: {
    attached() {
      this.refresh();
    },
  },

  observers: {
    'items, mainActiveIndex'() {
      this.refresh();
    },
  },

  methods: {
    refresh() {
      const list = this.data.items || [];
      const index = Math.min(
        Math.max(this.data.mainActiveIndex || 0, 0),
        Math.max(list.length - 1, 0)
      );
      const current = list[index] || { children: [] };
      this.setData({ currentIndex: index, children: current.children || [] });
    },

    onNav(e) {
      const index = Number(e.currentTarget.dataset.index);
      if (index === this.data.currentIndex) {
        return;
      }
      this.triggerEvent('clicknav', { index });
    },

    onItem(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.children[index];
      if (!item) {
        return;
      }
      this.triggerEvent('clickitem', { id: item.id, text: item.text });
    },
  },
});
