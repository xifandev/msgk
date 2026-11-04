// components/ms-popup/index.js
// 原生弹层：遮罩 + 位移动画，替代 vant popup，无第三方依赖
Component({
  options: { addGlobalClass: true, multipleSlots: true },

  properties: {
    show: {
      type: Boolean,
      value: false,
      observer(value) {
        this.toggle(value);
      },
    },
    position: { type: String, value: 'center' }, // center | bottom | top | right
    round: { type: Boolean, value: false },
    zIndex: { type: Number, value: 1000 },
    customStyle: { type: String, value: '' },
    closeOnClickOverlay: { type: Boolean, value: true },
  },

  data: {
    render: false,
    visible: false,
  },

  lifetimes: {
    // 初始化时 show 若为 true 则不触发 observer，这里主动处理一次
    attached() {
      if (this.data.show) {
        this.toggle(true);
      }
    },
  },

  detached() {
    clearTimeout(this.timer);
  },

  methods: {
    toggle(value) {
      clearTimeout(this.timer);
      if (value) {
        this.setData({ render: true }, () => {
          this.timer = setTimeout(() => this.setData({ visible: true }), 30);
        });
      } else {
        this.setData({ visible: false });
        this.timer = setTimeout(() => this.setData({ render: false }), 260);
      }
    },

    onMaskTap() {
      if (this.data.closeOnClickOverlay) {
        this.triggerEvent('close');
      }
    },

    noop() {},
  },
});
