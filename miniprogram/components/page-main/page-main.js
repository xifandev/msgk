// components/page-main/page-main.js
// 二级页面统一框架：红色渐变页头 + 标题 + 副标题标签 + 白色内容区
Component({
  options: { addGlobalClass: true, multipleSlots: true },

  properties: {
    title: { type: String, value: '' },
    title1: { type: String, value: '' },
    title2: { type: String, value: '' },
    title3: { type: String, value: '' },
  },

  methods: {
    onScrollToLower() {
      this.triggerEvent('chudi');
    },
  },
});
