// components/ms-icon/index.js
// 原生图标组件：SVG 作为 mask 上色（样式见 icons.wxss），随文字颜色变色，无字体包、无外链资源
const { NAMES } = require('./icons');

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    name: { type: String, value: '' },
    // 尺寸，如 32rpx / 20px，默认 1em
    size: { type: String, value: '1em' },
    // 颜色，默认继承父级文字颜色
    color: { type: String, value: '' },
  },

  data: {
    className: '',
    iconStyle: '',
  },

  lifetimes: {
    attached() {
      this.render();
    },
  },

  observers: {
    'name, size, color'() {
      this.render();
    },
  },

  methods: {
    render() {
      const { name, size, color } = this.data;
      this.setData({
        className: NAMES.indexOf(name) > -1 ? `ms-icon--${name}` : '',
        iconStyle: [
          `width:${size || '1em'}`,
          `height:${size || '1em'}`,
          `background-color:${color || 'currentColor'}`,
        ].join(';'),
      });
    },
  },
});
