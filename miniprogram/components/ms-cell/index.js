// components/ms-cell/index.js
Component({
  options: { addGlobalClass: true, multipleSlots: true },
  properties: {
    title: { type: String, value: '' },
    value: { type: String, value: '' },
    label: { type: String, value: '' },
    icon: { type: String, value: '' },
    iconColor: { type: String, value: '' },
    isLink: { type: Boolean, value: false },
    border: { type: Boolean, value: true },
    clickable: { type: Boolean, value: false },
    useIconSlot: { type: Boolean, value: false },
    useLabelSlot: { type: Boolean, value: false },
  },
  methods: {
    onTap() {
      this.triggerEvent('click');
    },
  },
});
