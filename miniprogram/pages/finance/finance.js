// pages/finance/finance.js
const { get } = require('../../utils/request');
const { formatDate, formatAmount } = require('../../utils/format');
const { getVenueId, redirectHome } = require('../../utils/venue');

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

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
  detailRequestId: 0,
  periodRequestId: 0,
  // 已公开账期缓存：场所的公开月份不会频繁变化，首次打开弹窗拉取后复用
  periodCache: null,
  // 年度页月份明细缓存：{ 'YYYY-MM': 渲染数据 }，重复打开同一月份不再请求
  detailCache: null,

  data: {
    // 当前标签页索引：0 月度收支 / 1 年度收支
    active: 0,
    venueId: '',
    venueName: '',

    // --------- 月度 ---------
    month: '', // YYYY-MM
    monthText: '',
    bill: null, // 结余卡数据（期末结余 + 本月收入/支出）
    items: [],
    groups: [], // 按日期分组的明细
    monthLoaded: false,

    // --------- 年度 ---------
    year: 0,
    months: [],
    totals: null,
    yearLoaded: false,
    yearError: false,

    // --------- 选择月份 / 年份（只列已公开账期） ---------
    periodsShow: false,
    periodMode: 'month', // month | year
    periodState: 'idle', // idle | loading | ready | error
    periodYears: [], // [{ year: '2026', months: [{ month: '2026-09', label: '9月' }] }]

    // --------- 年度页：月度明细抽屉 ---------
    detailShow: false,
    detailMonth: '', // YYYY-MM
    detailMonthText: '',
    detailIndex: -1, // 在 months 中的位置，用于上下月切换
    detailPrev: false,
    detailNext: false,
    detailState: 'idle', // idle | loading | ready | error
    detailBill: null,
    detailGroups: [],
    detailSub: '',
    detailScrollTop: 0, // 切月时在 0/1 之间交替，用于把明细区滚回顶部
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
        const items = this.mapItems(res.items);
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
      monthText: `${y}年${parseInt(m, 10)}月`,
    };
    // 年度页年份跟随最近公开月份变化
    if (targetYear !== this.data.year) {
      patch.year = targetYear;
    }
    return patch;
  },

  // 明细行统一加工：收支文案、带符号金额、日期（月度页与抽屉共用）
  mapItems(rawItems) {
    return (rawItems || []).map((item) => ({
      ...item,
      kindText: item.kind === 'expense' ? '支出' : '收入',
      amountText: `${item.kind === 'expense' ? '-' : '+'}${formatAmount(item.amount)}`,
      date: formatDate(item.occurredOn),
    }));
  },

  // 结余卡：期末结余（截至当月末的累计结余）+ 本月收入/支出
  buildBill(raw) {
    if (!raw) {
      return null;
    }
    const current = Number(raw.currentBalance) || 0;
    return {
      incomeText: formatAmount(Number(raw.income) || 0),
      expenseText: formatAmount(Number(raw.expense) || 0),
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

  // ------------------- 选择月份 / 年份（已公开账期） -------------------
  openMonthPicker() {
    this.openPeriods('month');
  },

  openYearPicker() {
    this.openPeriods('year');
  },

  openPeriods(mode) {
    this.setData({ periodsShow: true, periodMode: mode });
    this.loadPeriods();
  },

  closePeriods() {
    this.setData({ periodsShow: false });
  },

  // 账期列表只拉一次：场所的公开月份不会频繁变化，弹窗内切换不再请求
  loadPeriods() {
    if (this.periodCache) {
      this.setData({ periodState: 'ready', periodYears: this.periodCache });
      return;
    }
    const requestId = ++this.periodRequestId;
    this.setData({ periodState: 'loading' });
    get('/api/public/finance/periods', { venueId: this.data.venueId }, { loading: false })
      .then((res) => {
        const groups = this.buildPeriodGroups(res.months);
        this.periodCache = groups;
        if (requestId !== this.periodRequestId) {
          return;
        }
        this.setData({ periodState: 'ready', periodYears: groups });
      })
      .catch(() => {
        if (requestId !== this.periodRequestId) {
          return;
        }
        this.setData({ periodState: 'error', periodYears: [] });
      });
  },

  // ['2026-09','2026-08','2025-12'] → [{ year:'2026', months:[...] }, ...]，最近的排前面
  buildPeriodGroups(months) {
    const groups = [];
    const index = {};
    (months || []).forEach((month) => {
      const parts = String(month).split('-');
      if (parts.length !== 2) {
        return;
      }
      if (index[parts[0]] == null) {
        index[parts[0]] = groups.length;
        groups.push({ year: parts[0], months: [] });
      }
      groups[index[parts[0]]].months.push({
        month,
        label: `${parseInt(parts[1], 10)}月`,
      });
    });
    return groups;
  },

  selectMonth(e) {
    const month = (e.currentTarget && e.currentTarget.dataset || {}).month;
    if (!month) {
      return;
    }
    const parts = String(month).split('-');
    this.setData(
      {
        month,
        monthText: `${parts[0]}年${parseInt(parts[1], 10)}月`,
        periodsShow: false,
        bill: null,
        items: [],
        groups: [],
      },
      () => this.loadMonthly()
    );
  },

  selectYear(e) {
    const year = Number((e.currentTarget && e.currentTarget.dataset || {}).year);
    if (!year) {
      return;
    }
    this.setData(
      {
        year,
        periodsShow: false,
        months: [],
        totals: null,
        yearLoaded: false,
        yearError: false,
      },
      () => this.loadYearly()
    );
  },

  // ------------------- 年度 -------------------
  loadYearly() {
    const requestId = ++this.yearlyRequestId;
    this.setData({ yearLoaded: false, yearError: false });
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

        // 月度明细：本月收入 / 本月支出 / 期末结余（截至当月末的累计结余）
        const months = rows.map((item) => {
          const currentNum = Number(item.currentBalance) || 0;
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
        // 年度期末结余 = 最后一个公开月份的累计结余
        const last = rows.length > 0 ? rows[rows.length - 1] : null;
        const balanceNum = last ? Number(last.currentBalance) || 0 : 0;
        // 该年没有任何公开账单时不给数值，卡片直接显示"暂无公开账单"，避免出现一排 0.00
        const totals =
          months.length > 0
            ? {
                incomeText: formatAmount(incomeNum),
                expenseText: formatAmount(expenseNum),
                balanceText: formatAmount(balanceNum),
                balanceNegative: balanceNum < 0,
              }
            : null;

        this.setData({ months, totals, yearLoaded: true });
      })
      .catch(() => {
        if (requestId !== this.yearlyRequestId) {
          return;
        }
        this.setData({ months: [], totals: null, yearLoaded: true, yearError: true });
      });
  },

  // ------------------- 年度页：月度明细抽屉 -------------------
  // 点开某个月份卡片：先出抽屉骨架，再补该月收支明细（接口复用公开月度接口）
  openMonthDetail(e) {
    const dataset = (e.currentTarget && e.currentTarget.dataset) || {};
    const index = Number(dataset.index);
    const target = this.data.months[index];
    if (!target) {
      return;
    }
    this.setData(
      Object.assign(
        {
          detailShow: true,
          detailMonth: target.month,
          detailMonthText: target.monthText,
          detailIndex: index,
          detailScrollTop: this.nextScrollTop(),
          // 先清掉上一个月份的明细，避免抽屉上升过程中闪出旧数据
          detailState: 'loading',
          detailBill: null,
          detailGroups: [],
          detailSub: '正在加载明细',
        },
        this.resolveNav(index)
      )
    );
    this.loadMonthDetail(target.month);
  },

  closeMonthDetail() {
    this.setData({ detailShow: false });
  },

  // 抽屉内切换上下月：只在当前年份已公开的月份之间移动，到边界不响应
  switchMonthDetail(e) {
    const step = Number((e.currentTarget && e.currentTarget.dataset || {}).step) || 0;
    const index = this.data.detailIndex + step;
    const target = this.data.months[index];
    if (!step || !target) {
      return;
    }
    this.setData(
      Object.assign(
        {
          detailMonth: target.month,
          detailMonthText: target.monthText,
          detailIndex: index,
          detailScrollTop: this.nextScrollTop(),
        },
        this.resolveNav(index)
      )
    );
    this.loadMonthDetail(target.month);
  },

  // scroll-top 只在值变化时生效，0/1 交替即可把新月份的明细拉回顶部
  nextScrollTop() {
    return this.data.detailScrollTop === 0 ? 1 : 0;
  },

  // 上下月按钮是否可用
  resolveNav(index) {
    return {
      detailPrev: index > 0,
      detailNext: index >= 0 && index < this.data.months.length - 1,
    };
  },

  loadMonthDetail(month) {
    if (!month) {
      return;
    }
    const cache = this.detailCache || (this.detailCache = {});
    const cached = cache[month];
    if (cached) {
      this.setData(Object.assign({ detailState: 'ready' }, cached));
      return;
    }

    const requestId = ++this.detailRequestId;
    this.setData({
      detailState: 'loading',
      detailBill: null,
      detailGroups: [],
      detailSub: '正在加载明细',
    });
    get('/api/public/finance/monthly', { venueId: this.data.venueId, month }, { loading: false })
      .then((res) => {
        const items = this.mapItems(res.items);
        const detail = {
          detailBill: this.buildBill(res.bill),
          detailGroups: this.groupByDay(items),
          detailSub: items.length
            ? `共 ${items.length} 笔明细`
            : res.bill
              ? '该月无收支明细'
              : '该月暂无公开数据',
        };
        cache[month] = detail;
        if (requestId !== this.detailRequestId) {
          return;
        }
        this.setData(Object.assign({ detailState: 'ready' }, detail));
      })
      .catch(() => {
        if (requestId !== this.detailRequestId) {
          return;
        }
        this.setData({ detailState: 'error', detailBill: null, detailGroups: [], detailSub: '明细加载失败' });
      });
  },

  retryMonthDetail() {
    this.loadMonthDetail(this.data.detailMonth);
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

    this.setData(
      {
        venueId,
        month: '',
        monthText: '',
        year: currentYear,
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
