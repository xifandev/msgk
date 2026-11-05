// pages/finance/finance.js
const { get } = require('../../utils/request');
const { formatDate, formatAmount } = require('../../utils/format');
const { getVenueId, redirectHome } = require('../../utils/venue');

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 年份选择列：近 11 年，必要时扩展到目标年份
function buildYearColumns(targetYear) {
  const currentYear = new Date().getFullYear();
  const end = Math.max(currentYear, Number(targetYear) || currentYear);
  const yearColumns = [];
  let yearDefaultIndex = 0;
  for (let i = end - 10; i <= end; i++) {
    yearColumns.push(`${i}`);
    if (i === Number(targetYear)) {
      yearDefaultIndex = yearColumns.length - 1;
    }
  }
  return { yearColumns, yearDefaultIndex };
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
    venueName: '',

    // --------- 月度 ---------
    month: '', // YYYY-MM
    monthText: '',
    bill: null, // 结余卡数据（当月结余 + 当月收入/支出）
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
      // 月份为空时由服务端解析为该场所最近一次对外公开的月份
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
        const monthPatch = this.resolveMonth(res.month);
        this.setData(
          Object.assign(
            { bill, items, groups: this.groupByDay(items), monthLoaded: true },
            monthPatch
          ),
          () => {
            // 年份跟随最新公开月份变化时，补齐已激活的年度页
            if (monthPatch && monthPatch.year != null && this.data.active === 1) {
              this.loadYearly();
            }
          }
        );
      })
      .catch(() => {
        if (requestId !== this.monthlyRequestId) {
          return;
        }
        this.setData({ bill: null, items: [], groups: [], monthLoaded: true });
      });
  },

  // 服务端回传的实际月份 → 页面展示状态（月份、选择器定位、年度页年份）
  resolveMonth(month) {
    if (!month) {
      return this.data.month ? null : { monthText: '暂无公开记录' };
    }
    if (month === this.data.month) {
      return null;
    }
    const [y, m] = month.split('-');
    const targetYear = Number(y);
    const patch = {
      month,
      monthText: `${y}年${m}月`,
      currentDate: new Date(targetYear, Number(m) - 1, 1).getTime(),
    };
    if (targetYear !== this.data.year) {
      const columns = buildYearColumns(targetYear);
      patch.year = targetYear;
      patch.yearColumns = columns.yearColumns;
      patch.yearDefaultIndex = columns.yearDefaultIndex;
      patch.pendingYearIndex = columns.yearDefaultIndex;
    }
    return patch;
  },

  // 结余卡：当月结余（当月收入 − 当月支出）+ 当月收入/支出
  buildBill(raw) {
    if (!raw) {
      return null;
    }
    const income = Number(raw.income) || 0;
    const expense = Number(raw.expense) || 0;
    const current = Math.round((income - expense) * 100) / 100;
    return {
      incomeText: formatAmount(income),
      expenseText: formatAmount(expense),
      currentText: formatAmount(current),
      currentNegative: current < 0,
    };
  },

  // 明细按日期分组
  groupByDay(items) {
    const groups = [];
    const index = {};
    items.forEach((item) => {
      const key = item.date || '未知日期';
      if (index[key] == null) {
        index[key] = groups.length;
        groups.push({ date: key, label: dayLabel(key), items: [] });
      }
      groups[index[key]].items.push(item);
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
            monthText: parts.length === 2 ? `${parts[0]}年${parseInt(parts[1], 10)}月份` : String(item.month),
          };
        });

        // 月度明细：当月收入 / 当月支出 / 月结余（收 − 支）
        const months = rows.map((item) => {
          const currentNum = Math.round((item.incomeNum - item.expenseNum) * 100) / 100;
          return {
            month: item.month,
            monthText: item.monthText,
            incomeText: formatAmount(item.incomeNum),
            expenseText: formatAmount(item.expenseNum),
            currentText: formatAmount(currentNum),
            currentNegative: currentNum < 0,
          };
        });

        const rawTotals = res.totals || { income: 0, expense: 0 };
        const incomeNum = Number(rawTotals.income) || 0;
        const expenseNum = Number(rawTotals.expense) || 0;
        // 年结余 = 全年收入 − 全年支出，与卡面两个总数自洽
        const balanceNum = Math.round((incomeNum - expenseNum) * 100) / 100;
        const totals = {
          incomeText: formatAmount(incomeNum),
          expenseText: formatAmount(expenseNum),
          balanceText: formatAmount(balanceNum),
          balanceNegative: balanceNum < 0,
        };

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
    const currentIndex = this.data.yearColumns.indexOf(String(this.data.year));
    const index = Math.max(currentIndex, 0);
    this.setData(
      { yearDefaultIndex: index, pendingYearIndex: index, yearPickerShow: true },
      () => {
        // 弹窗复用时也强制回到当前年份，避免保留组件初始值或上次滚动位置
        const picker = this.selectComponent('#year-picker');
        if (picker) {
          picker.refresh();
        }
      }
    );
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
      },
      () => this.loadYearly()
    );
  },

  // 顶部展示场所名：失败不影响主数据，静默忽略
  loadVenueName() {
    get(`/api/public/venues/${this.data.venueId}`, {}, { loading: false })
      .then((res) => {
        if (res && res.name) {
          this.setData({ venueName: res.name });
        }
      })
      .catch(() => {});
  },

  // ------------------- 生命周期 -------------------
  onLoad(options) {
    const venueId = getVenueId(options);
    if (!venueId) {
      redirectHome();
      return;
    }

    // 默认视图由服务端解析为该场所最近一次对外公开的月份，年度页年份随之对齐
    const currentYear = new Date().getFullYear();
    const columns = buildYearColumns(currentYear);

    this.setData(
      {
        venueId,
        month: '',
        monthText: '',
        currentDate: Date.now(),
        year: currentYear,
        yearColumns: columns.yearColumns,
        yearDefaultIndex: columns.yearDefaultIndex,
        pendingYearIndex: columns.yearDefaultIndex,
      },
      () => {
        this.loadVenueName();
        this.loadMonthly();
      }
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
