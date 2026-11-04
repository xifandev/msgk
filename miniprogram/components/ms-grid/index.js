// components/ms-grid/index.js
Component({
  options: { addGlobalClass: true },
  properties: {
    columnNum: { type: Number, value: 4 },
    direction: { type: String, value: 'vertical' },
    border: { type: Boolean, value: false },
    clickable: { type: Boolean, value: false },
  },
});
