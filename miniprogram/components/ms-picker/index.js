// components/ms-picker/index.js
// 原生单列选择器，基于官方 picker-view 实现
Component({
  options: { addGlobalClass: true },

  properties: {
    columns: { type: Array, value: [] },
    defaultIndex: { type: Number, value: 0 },
    showToolbar: { type: Boolean, value: true },
    title: { type: String, value: '' },
  },

  data: {
    pickerValue: [0],
    textColumns: [],
  },

  lifetimes: {
    attached() {
      this.refresh();
    },
  },

  observers: {
    'columns, defaultIndex'() {
      this.refresh();
    },
  },

  methods: {
    refresh() {
      const list = (this.data.columns || []).map((item) =>
        typeof item === 'object' && item !== null ? String(item.text ?? '') : String(item)
      );
      const index = Math.min(
        Math.max(this.data.defaultIndex || 0, 0),
        Math.max(list.length - 1, 0)
      );
      this.setData({ textColumns: list, pickerValue: [index] });
    },

    onChange(e) {
      const index = (e.detail.value || [])[0] || 0;
      this.setData({ pickerValue: [index] });
      this.triggerEvent('change', { index, value: this.data.textColumns[index] });
    },

    onConfirm() {
      const index = this.data.pickerValue[0] || 0;
      this.triggerEvent('confirm', { index, value: this.data.textColumns[index] });
    },

    onCancel() {
      this.triggerEvent('cancel');
    },
  },
});
