// components/ms-popup/index.js
// 原生弹层：遮罩 + 位移动画，替代 vant popup，无第三方依赖
// draggable=true 且 position=bottom 时支持下拉关闭：手势必须从带 data-drag="1" 的抓手区域开始，
// 避免与面板内部的滚动区抢手势
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
    // 下拉关闭开关与位移阈值（px），仅 position=bottom 生效
    draggable: { type: Boolean, value: false },
    dragCloseDistance: { type: Number, value: 110 },
    // 面板顶部多高范围内按下也能拖（px）：抓手 + 标题栏都算拖动区，0 表示只认 data-drag
    dragZone: { type: Number, value: 0 },
  },

  data: {
    render: false,
    visible: false,
    dragging: false,
    // maskDriven：遮罩透明度由拖拽进度接管（内联生效），否则用 class 的淡入淡出
    maskDriven: false,
    panelBottom: 0,
    maskOpacity: 1,
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
    clearTimeout(this.maskTimer);
    clearTimeout(this.measureTimer);
  },

  methods: {
    toggle(value) {
      clearTimeout(this.timer);
      clearTimeout(this.maskTimer);
      clearTimeout(this.measureTimer);
      if (value) {
        // 关闭动画途中重新打开时，上一次拖拽/遮罩状态可能还没复位，这里一并清掉
        this.panelTop = null;
        this.drag = null;
        this.setData(
          { render: true, dragging: false, maskDriven: false, panelBottom: 0, maskOpacity: 1 },
          () => {
            this.timer = setTimeout(() => this.setData({ visible: true }), 30);
          }
        );
        // 入场动画结束后量一次面板位置，供"顶部区域可拖"判定使用
        this.measureTimer = setTimeout(() => this.measure(), 320);
      } else {
        this.drag = null;
        this.panelTop = null;
        // 交还给 class 控制遮罩，避免拖拽后的内联透明度让关闭动画失效
        this.setData({ visible: false, dragging: false, maskDriven: false, maskOpacity: 1 });
        // 滑出动画结束后再清掉拖拽位移，避免下次打开时面板停在半空
        this.timer = setTimeout(
          () =>
            this.setData({
              render: false,
              dragging: false,
              maskDriven: false,
              panelBottom: 0,
              maskOpacity: 1,
            }),
          260
        );
      }
    },

    onMaskTap() {
      if (this.data.closeOnClickOverlay) {
        this.triggerEvent('close');
      }
    },

    // 手指是否落在面板顶部的拖动区
    inDragZone(clientY) {
      if (!this.data.dragZone) {
        return false;
      }
      if (this.panelTop == null) {
        // 还没量到位置时补量一次，本次手势按非拖动处理，不影响正常点按
        this.measure();
        return false;
      }
      return clientY - this.panelTop <= this.data.dragZone;
    },

    // 量面板顶部位置：面板贴底固定，量一次即可稳定复用
    measure() {
      this.createSelectorQuery()
        .select('.ms-popup__panel')
        .boundingClientRect((rect) => {
          if (rect) {
            this.panelTop = rect.top;
          }
        })
        .exec();
    },

    // 只有抓手命中区（data-drag="1"）或面板顶部 dragZone 区域上按下的触摸才接管，
    // 内容区滚动不受影响
    onDragStart(e) {
      if (!this.data.draggable || this.data.position !== 'bottom') {
        return;
      }
      const touch = e.touches && e.touches[0];
      if (!touch) {
        return;
      }
      const dataset = (e.target && e.target.dataset) || {};
      if (!dataset.drag && !this.inDragZone(touch.clientY)) {
        return;
      }
      clearTimeout(this.maskTimer);
      this.drag = { startY: touch.clientY, startTime: Date.now(), dy: 0, sent: 0 };
      this.setData({ dragging: true, maskDriven: true, maskOpacity: 1 });
    },

    onDragMove(e) {
      if (!this.drag) {
        return;
      }
      const touch = e.touches && e.touches[0];
      if (!touch) {
        return;
      }
      // 只跟随向下拖动，向上不跟手，避免和"面板已到顶"的错觉冲突
      const dy = Math.max(touch.clientY - this.drag.startY, 0);
      this.drag.dy = dy;
      // 位移不足 1px 不触发渲染，减少拖动时的 setData 次数
      if (Math.abs(dy - this.drag.sent) < 1) {
        return;
      }
      this.drag.sent = dy;
      const limit = this.data.dragCloseDistance || 110;
      this.setData({
        panelBottom: -dy,
        maskOpacity: 1 - Math.min(dy / limit, 1) * 0.85,
      });
    },

    onDragEnd() {
      const drag = this.drag;
      if (!drag) {
        return;
      }
      this.drag = null;
      const dy = drag.dy;
      const elapsed = Math.max(Date.now() - drag.startTime, 1);
      const limit = this.data.dragCloseDistance || 110;
      // 位移过半或明显快速下滑就关闭，否则回弹
      const shouldClose = dy > limit || (dy > 36 && dy / elapsed > 0.5);
      if (shouldClose) {
        // 保持当前位移直接滑出：不再回弹，遮罩随后淡出，手感更顺
        this.setData({ dragging: false, maskDriven: true, maskOpacity: 0 });
        this.triggerEvent('close', { source: 'drag' });
        return;
      }
      this.setData({ dragging: false, maskDriven: true, panelBottom: 0, maskOpacity: 1 });
      // 回弹结束后交还给 class 控制遮罩，避免影响下次普通关闭的淡出
      clearTimeout(this.maskTimer);
      this.maskTimer = setTimeout(() => this.setData({ maskDriven: false }), 280);
    },
  },
});
