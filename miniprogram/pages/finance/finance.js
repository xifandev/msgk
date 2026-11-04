// pages/finance/finance.js
const { get } = require('../../utils/request');
const { formatDate, formatAmount, previousMonth } = require('../../utils/format');
const { getVenueId, redirectHome } = require('../../utils/venue');

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 百分比取整，避免出现 NaN
function percent(value, total) {
  if (!total || total <= 0) {
    return 0;
  }
  return Math.round((Number(value) / Number(total)) * 100);
}

// 柱状高度：有值至少留 4% 让细柱可见
function barHeight(value, max) {
  const num = Number(value);
  if (!num || num <= 0 || !max || max <= 0) {
    return 0;
  }
  return Math.max(Math.round((num / max) * 100), 4);
}

// 'YYYY-MM-DD' → '11月04日 周二'
function dayLabel(date) {
  const parts = String(date || '').split('-');
  if (parts.length !== 3) {
    return String(date || '');
  }
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const weekday = isNaN(d.getTime()) ? '' : WEEK[d.getDay()];
  return `${Number(parts[1])}月${parts[2]}日${weekday ? ' ' + weekday : ''}`;
}

Page({
  // 忽略旧请求的响应，防止切换月份/年份时旧数据覆盖新数据
  monthlyRequestId: 0,
  yearlyRequestId: 0,

  data: {
    // 当前标签页索引：0 月度收支 / 1 年度收支
    active: 0,
    venueId: '',

    // --------- 月度 ---------
    month: '', // YYYY-MM
    monthText: '',
    bill: null, // 结余卡数据（含百分比与环比文案）
    items: [],
    groups: [], // 按日期分组的明细
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
    chart: [],
    yearLoaded: false,
    // 年份选择
    yearPickerShow: false,
    yearColumns: [],
    yearDefaultIndex: 0,
    pendingYearIndex: 0,
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
        const bill = this.buildBill(res.bill);
        const items = (res.items || []).map((item) => ({
          ...item,
          kindText: item.kind === 'expense' ? '支出' : '收入',
          amountText: `${item.kind === 'expense' ? '-' : '+'}${formatAmount(item.amount)}`,
          date: formatDate(item.occurredOn),
        }));
        this.setData({ bill, items, groups: this.groupByDay(items), monthLoaded: true });
      })
      .catch(() => {
        if (requestId !== this.monthlyRequestId) {
          return;
        }
        this.setData({ bill: null, items: [], groups: [], monthLoaded: true });
      });
  },

  // 结余卡：金额、环比、收支占比
  buildBill(raw) {
    if (!raw) {
      return null;
    }
    const income = Number(raw.income) || 0;
    const expense = Number(raw.expense) || 0;
    const previous = Number(raw.previousBalance) || 0;
    const current = Number(raw.currentBalance) || 0;
    const delta = Math.round((current - previous) * 100) / 100;
    const flow = income + expense;
    const incomePercent = flow > 0 ? percent(income, flow) : 0;

    let deltaText = '与上月持平';
    if (delta !== 0) {
      deltaText = `${delta > 0 ? '较上月增加' : '较上月减少'} ${formatAmount(Math.abs(delta))} 元`;
    }

    return {
      incomeText: formatAmount(income),
      expenseText: formatAmount(expense),
      previousText: formatAmount(previous),
      currentText: formatAmount(current),
      deltaText,
      deltaUp: delta > 0,
      deltaFlat: delta === 0,
      hasFlow: flow > 0,
      incomePercent,
      expensePercent: flow > 0 ? 100 - incomePercent : 0,
    };
  },

  // 明细按日期分组，组头显示当日收支小计
  groupByDay(items) {
    const groups = [];
    const index = {};
    items.forEach((item) => {
      const key = item.date || '未知日期';
      if (index[key] == null) {
        index[key] = groups.length;
        groups.push({ date: key, label: dayLabel(key), income: 0, expense: 0, incomeText: '', expenseText: '', items: [] });
      }
      const group = groups[index[key]];
      group.items.push(item);
      if (item.kind === 'expense') {
        group.expense += Number(item.amount) || 0;
      } else {
        group.income += Number(item.amount) || 0;
      }
    });
    groups.forEach((group) => {
      group.incomeText = group.income > 0 ? formatAmount(group.income) : '';
      group.expenseText = group.expense > 0 ? formatAmount(group.expense) : '';
    });
    return groups;
  },

  openMonthPicker() {
    this.setData({ monthPickerShow: true });
  },

  closeMonthPicker() {
    this.setData({ monthPickerShow: false });
  },

  // 年月选择器滚动时同步当前时间戳
  onMonthInput(e) {
    this.setData({ currentDate: e.detail.value });
  },

  confirmMonth(e) {
    // ms-datetime-picker 确认事件携带所选时间戳
    const timestamp = e.detail && e.detail.value ? e.detail.value : this.data.currentDate;
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = `0${d.getMonth() + 1}`.slice(-2);
    this.setData(
      {
        month: `${year}-${month}`,
        monthText: `${year}年${month}月`,
        monthPickerShow: false,
        bill: null,
        items: [],
        groups: [],
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
        const rows = (res.months || []).map((item) => {
          const parts = String(item.month).split('-');
          return {
            ...item,
            incomeNum: Number(item.income) || 0,
            expenseNum: Number(item.expense) || 0,
            previousNum: Number(item.previousBalance) || 0,
            currentNum: Number(item.currentBalance) || 0,
            monthText: parts.length === 2 ? `${parts[0]}年${parseInt(parts[1], 10)}月份` : String(item.month),
          };
        });

        const maxValue = rows.reduce(
          (max, item) => Math.max(max, item.incomeNum, item.expenseNum),
          0
        );

        // 柱状图数据
        const chart = rows.map((item) => ({
          month: item.month,
          label: `${parseInt(String(item.month).split('-')[1], 10)}月`,
          incomeHeight: barHeight(item.incomeNum, maxValue),
          expenseHeight: barHeight(item.expenseNum, maxValue),
        }));

        // 月度明细（含单月收入/支出对比条）
        const months = rows.map((item) => {
          const monthMax = Math.max(item.incomeNum, item.expenseNum);
          return {
            month: item.month,
            monthText: item.monthText,
            incomeText: formatAmount(item.incomeNum),
            expenseText: formatAmount(item.expenseNum),
            previousText: formatAmount(item.previousNum),
            currentText: formatAmount(item.currentNum),
            incomeWidth: barHeight(item.incomeNum, monthMax),
            expenseWidth: barHeight(item.expenseNum, monthMax),
          };
        });

        const rawTotals = res.totals || { income: 0, expense: 0 };
        const last = rows.length > 0 ? rows[rows.length - 1] : null;
        const totals = {
          incomeText: formatAmount(rawTotals.income),
          expenseText: formatAmount(rawTotals.expense),
          balanceText: formatAmount(last ? last.currentNum : 0),
        };

        this.setData({ months, totals, chart, yearLoaded: true });
      })
      .catch(() => {
        if (requestId !== this.yearlyRequestId) {
          return;
        }
        this.setData({ months: [], totals: null, chart: [], yearLoaded: true });
      });
  },

  openYearPicker() {
    this.setData({ yearPickerShow: true });
  },

  closeYearPicker() {
    this.setData({ yearPickerShow: false });
  },

  // 年份滚动选中
  onYearChange(e) {
    this.setData({ pendingYearIndex: e.detail.index });
  },

  confirmYear(e) {
    // ms-picker 确认事件携带选中索引
    const index = e.detail && e.detail.index != null ? e.detail.index : this.data.pendingYearIndex;
    const year = Number(this.data.yearColumns[index]);
    this.setData(
      {
        year,
        yearDefaultIndex: index,
        pendingYearIndex: index,
        yearPickerShow: false,
        months: [],
        totals: null,
        chart: [],
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

  // 切换标签页：ms-tabs 为受控组件，需同步 active
  onTabChange(e) {
    const index = e.detail.index;
    this.setData({ active: index });
    if (index === 1) {
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
