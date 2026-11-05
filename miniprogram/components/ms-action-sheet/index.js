// components/ms-action-sheet/index.js
Component({
  options: { addGlobalClass: true, multipleSlots: true },
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    showHeader: { type: Boolean, value: true },
    closeOnClickOverlay: { type: Boolean, value: true },
  },
  methods: {
    onClose() {
      this.triggerEvent('close');
    },
    noop() {},
  },
});
