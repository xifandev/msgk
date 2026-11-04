// components/ms-datetime-picker/index.js
// 原生日期/年月选择器，基于官方 picker-view 实现
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

Component({
  options: { addGlobalClass: true },

  properties: {
    // date | year-month
    type: { type: String, value: 'date' },
    // 时间戳
    value: { type: Number, value: 0 },
    minDate: { type: Number, value: 0 },
    maxDate: { type: Number, value: 0 },
    showToolbar: { type: Boolean, value: true },
  },

  data: {
    isDate: true,
    years: [],
    months: [],
    days: [],
    pickerValue: [0, 0, 0],
    year: 0,
    month: 1,
    day: 1,
  },

  lifetimes: {
    attached() {
      this.build();
    },
  },

  observers: {
    'value, type, minDate, maxDate'() {
      this.build();
    },
  },

  methods: {
    build() {
      const type = this.data.type || 'date';
      const min = this.data.minDate || new Date(2000, 0, 1).getTime();
      const max = this.data.maxDate || new Date(2099, 11, 31).getTime();
      const minYear = new Date(min).getFullYear();
      const maxYear = new Date(max).getFullYear();
      const value = this.data.value || Date.now();
      const current = new Date(value);
      const base = isNaN(current.getTime()) ? new Date() : current;

      const year = Math.min(Math.max(base.getFullYear(), minYear), maxYear);
      const month = base.getMonth() + 1;
      const day = Math.min(base.getDate(), daysInMonth(year, month));

      const years = [];
      for (let y = minYear; y <= maxYear; y += 1) {
        years.push(`${y}年`);
      }
      const months = [];
      for (let m = 1; m <= 12; m += 1) {
        months.push(`${m}月`);
      }
      const days = [];
      for (let d = 1; d <= daysInMonth(year, month); d += 1) {
        days.push(`${d}日`);
      }

      this.setData({
        isDate: type === 'date',
        years,
        months,
        days,
        year,
        month,
        day,
        pickerValue: [year - minYear, month - 1, day - 1],
      });
    },

    onChange(e) {
      const raw = e.detail.value || [];
      const minYear = new Date(this.data.minDate || new Date(2000, 0, 1).getTime()).getFullYear();
      const year = minYear + (raw[0] || 0);
      const month = (raw[1] || 0) + 1;
      const maxDay = daysInMonth(year, month);
      const day = Math.min((raw[2] || 0) + 1, maxDay);

      const days = [];
      for (let d = 1; d <= maxDay; d += 1) {
        days.push(`${d}日`);
      }

      this.setData(
        {
          year,
          month,
          day,
          days,
          pickerValue: [year - minYear, month - 1, day - 1],
        },
        () => {
          this.triggerEvent('input', { value: this.timestamp() });
        }
      );
    },

    timestamp() {
      const { year, month, day, isDate } = this.data;
      return new Date(year, month - 1, isDate ? day : 1).getTime();
    },

    onConfirm() {
      this.triggerEvent('confirm', { value: this.timestamp() });
    },

    onCancel() {
      this.triggerEvent('cancel');
    },
  },
});
