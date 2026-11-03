// pages/finance/finance.js
const { get } = require('../../utils/request');
const { formatDate, formatMoney, previousMonth } = require('../../utils/format');
const { getVenueId, redirectHome } = require('../../utils/venue');

Page({
  // 忽略旧请求的响应，防止切换月份/年份时旧数据覆盖新数据
  monthlyRequestId: 0,
  yearlyRequestId: 0,

  data: {
    venueId: '',

    // --------- 月度 ---------
    month: '', // YYYY-MM
    monthText: '',
    bill: null,
    items: [],
    monthLoaded: false,
    // 月份选择
    monthPickerShow: false,
    currentDate: Date.now(),
    minDate: new Date(2000, 0, 1).getTime(),
    maxDate: Date.now(),

    // --------- 年度 ---------
    year: 0,
    months: [],
    totals: null,
    yearLoaded: false,
    // 年份选择
    yearPickerShow: false,
    yearColumns: [],
    yearDefaultIndex: 0,
    pendingYearIndex: 0,

    // 月份选择器显示文案
    monthFormatter(type, value) {
      if (type === 'year') {
        return `${value}年`;
      }
      if (type === 'month') {
        return `${value}月`;
      }
      return value;
    },
  },

  // ------------------- 月度 -------------------
  loadMonthly() {
    const requestId = ++this.monthlyRequestId;
    this.setData({ monthLoaded: false });
    get('/api/public/finance/monthly', {
      venueId: this.data.venueId,
      month: this.data.month,
    })
      .then((res) => {
        if (requestId !== this.monthlyRequestId) {
          return;
        }
        const bill = res.bill
          ? {
              income: formatMoney(res.bill.income),
              expense: formatMoney(res.bill.expense),
              previousBalance: formatMoney(res.bill.previousBalance),
              currentBalance: formatMoney(res.bill.currentBalance),
            }
          : null;
        const items = (res.items || []).map((item) => ({
          ...item,
          kindText: item.kind === 'expense' ? '支出' : '收入',
          amountText: `${item.kind === 'expense' ? '-' : '+'}${formatMoney(item.amount)}`,
          date: formatDate(item.occurredOn),
        }));
        this.setData({ bill, items, monthLoaded: true });
      })
      .catch(() => {
        if (requestId !== this.monthlyRequestId) {
          return;
        }
        this.setData({ bill: null, items: [], monthLoaded: true });
      });
  },

  openMonthPicker() {
    this.setData({ monthPickerShow: true });
  },

  closeMonthPicker() {
    this.setData({ monthPickerShow: false });
  },

  onMonthInput(e) {
    this.setData({ currentDate: e.detail });
  },

  confirmMonth() {
    const d = new Date(this.data.currentDate);
    const year = d.getFullYear();
    const month = `0${d.getMonth() + 1}`.slice(-2);
    this.setData(
      {
        month: `${year}-${month}`,
        monthText: `${year}年${month}月`,
        monthPickerShow: false,
        bill: null,
        items: [],
      },
      () => this.loadMonthly()
    );
  },

  // ------------------- 年度 -------------------
  loadYearly() {
    const requestId = ++this.yearlyRequestId;
    this.setData({ yearLoaded: false });
    get('/api/public/finance/yearly', {
      venueId: this.data.venueId,
      year: String(this.data.year),
    })
      .then((res) => {
        if (requestId !== this.yearlyRequestId) {
          return;
        }
        const months = (res.months || []).map((item) => {
          const parts = String(item.month).split('-');
          return {
            ...item,
            monthText: parts.length === 2 ? `${parts[0]}年${parseInt(parts[1], 10)}月份` : String(item.month),
            income: formatMoney(item.income),
            expense: formatMoney(item.expense),
            previousBalance: formatMoney(item.previousBalance),
            currentBalance: formatMoney(item.currentBalance),
          };
        });
        const totals = res.totals
          ? {
              income: formatMoney(res.totals.income),
              expense: formatMoney(res.totals.expense),
            }
          : null;
        this.setData({ months, totals, yearLoaded: true });
      })
      .catch(() => {
        if (requestId !== this.yearlyRequestId) {
          return;
        }
        this.setData({ months: [], totals: null, yearLoaded: true });
      });
  },

  openYearPicker() {
    this.setData({ yearPickerShow: true });
  },

  closeYearPicker() {
    this.setData({ yearPickerShow: false });
  },

  onYearChange(e) {
    this.setData({ pendingYearIndex: e.detail.index });
  },

  confirmYear() {
    const year = Number(this.data.yearColumns[this.data.pendingYearIndex]);
    this.setData(
      {
        year,
        yearDefaultIndex: this.data.pendingYearIndex,
        yearPickerShow: false,
        months: [],
        totals: null,
      },
      () => this.loadYearly()
    );
  },

  // ------------------- 生命周期 -------------------
  onLoad(options) {
    const venueId = getVenueId(options);
    if (!venueId) {
      redirectHome();
      return;
    }

    const month = previousMonth();
    const [y, m] = month.split('-');
    const now = new Date();
    const currentYear = now.getFullYear();
    const targetYear = Number(y);
    const yearColumns = [];
    let yearDefaultIndex = 0;
    for (let i = currentYear - 10; i <= currentYear; i++) {
      yearColumns.push(`${i}`);
      if (i === targetYear) {
        yearDefaultIndex = yearColumns.length - 1;
      }
    }

    // 选择器默认定位到当前展示月份
    const pickerDate = new Date(Number(y), Number(m) - 1, 1).getTime();

    this.setData(
      {
        venueId,
        month,
        monthText: `${y}年${m}月`,
        currentDate: pickerDate,
        year: targetYear,
        yearColumns,
        yearDefaultIndex,
        pendingYearIndex: yearDefaultIndex,
      },
      () => this.loadMonthly()
    );
  },

  onTabChange(e) {
    if (e.detail.title === '年度收支') {
      this.loadYearly();
    }
  },

  onShareAppMessage() {
    return {
      title: '财务公开',
      path: `/pages/finance/finance?venueId=${this.data.venueId}`,
    };
  },
});
