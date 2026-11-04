// components/page-main/page-main.js
// 二级页面统一框架：渐变页头 + 标题 + 副标题标签 + 白色内容区
// theme 控制页头配色：red（默认）/ green
// customNav 为 true 时页面为全屏（页面 json 需配 navigationStyle: custom），
// 组件自动预留状态栏 + 胶囊安全区并渲染返回按钮
const { getSafeArea } = require('../../utils/system');

Component({
  options: { addGlobalClass: true, multipleSlots: true },

  properties: {
    title: { type: String, value: '' },
    title1: { type: String, value: '' },
    title2: { type: String, value: '' },
    title3: { type: String, value: '' },
    theme: { type: String, value: 'red' },
    customNav: { type: Boolean, value: false },
  },

  data: {
    statusBarHeight: 20,
    safeTop: 64,
  },

  lifetimes: {
    attached() {
      const area = getSafeArea();
      this.setData({
        statusBarHeight: area.statusBarHeight,
        safeTop: area.safeTop,
      });
    },
  },

  methods: {
    onScrollToLower() {
      this.triggerEvent('chudi');
    },

    // 全屏模式下的返回：无上级页面时兜底回首页
    goBack() {
      wx.navigateBack({
        fail: () => wx.reLaunch({ url: '/pages/index/index' }),
      });
    },
  },
});
