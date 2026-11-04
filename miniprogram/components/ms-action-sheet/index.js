// components/ms-action-sheet/index.js
Component({
  options: { addGlobalClass: true, multipleSlots: true },
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    closeOnClickOverlay: { type: Boolean, value: true },
  },
  methods: {
    onClose() {
      this.triggerEvent('close');
    },
    noop() {},
  },
});
