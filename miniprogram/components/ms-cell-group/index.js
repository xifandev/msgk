// components/ms-cell-group/index.js
Component({
  options: { addGlobalClass: true, multipleSlots: true },
  properties: {
    title: { type: String, value: '' },
    inset: { type: Boolean, value: false },
    border: { type: Boolean, value: false },
  },
});
