// components/ms-grid-item/index.js
Component({
  options: { addGlobalClass: true },
  properties: {
    clickable: { type: Boolean, value: true },
  },
  methods: {
    onTap() {
      this.triggerEvent('click');
    },
  },
});
