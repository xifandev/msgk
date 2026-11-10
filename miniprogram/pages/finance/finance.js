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
  // 忽略旧请求的响应，防止切换/翻页时旧数据覆盖新数据
  streamRequestId: 0,
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

    // --------- 月度（信息流：分页拉取已公开月份明细，下滑加载更多） ---------
    monthList: [], // [{ month, monthText, incomeText, expenseText, groups, count }]
    monthStreamState: 'idle', // idle | loading | ready | error
    streamLoadingMore: false,
    monthHasMore: false,

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
    // [{ year: '2026', months: [{ month, label, status }] }]，最近的排前面
    periodYears: [],
    // 年份选择只列有已公开账期的年份
    yearOptions: [],

    // --------- 年度页：月度明细抽屉 ---------
    detailShow: false,
    detailMonth: '', // YYYY-MM
    detailMonthText: '',
    detailIndex: -1, // 在 months 中的位置，用于上下月切换
    detailPrev: false,
    detailNext: false,
    detailState: 'idle', // idle | loading | ready | error
    detailBill: null,
    detailItems: [],
    detailSub: '',
    detailScrollTop: 0, // 切月时在 0/1 之间交替，用于把明细区滚回顶部
  },

  // ------------------- 月度（信息流分页） -------------------
  loadMonthStream(reset) {
    const requestId = ++this.streamRequestId;
    this.setData(
      reset
        ? { monthStreamState: 'loading', monthList: [], monthHasMore: false, streamLoadingMore: false }
        : { streamLoadingMore: true }
    );

    const before = reset ? '' : this.currentStreamCursor();
    const params = { venueId: this.data.venueId, limit: 10 };
    if (before) {
      params.before = before;
    }
    get('/api/public/finance/months', params, { loading: false })
      .then((res) => {
        if (requestId !== this.streamRequestId) {
          return;
        }
        const rows = this.mapStreamMonths(res.months);
        const next = {
          monthStreamState: 'ready',
          monthList: reset ? rows : this.data.monthList.concat(rows),
          monthHasMore: !!res.hasMore,
          streamLoadingMore: false,
        };
        if (reset) {
          // 年度页年份跟随最近公开月份，避免跨年时年度页默认落在空年份
          const first = rows[0];
          if (first) {
            const firstYear = Number(String(first.month).slice(0, 4));
            if (firstYear && firstYear !== this.data.year) {
              next.year = firstYear;
            }
          }
        }
        this.setData(next);
      })
      .catch(() => {
        if (requestId !== this.streamRequestId) {
          return;
        }
        this.setData({ streamLoadingMore: false, ...(reset ? { monthStreamState: 'error' } : {}) });
      });
  },

  // 当前已加载的最早月份，作为翻页游标（列表按月份降序追加）
  currentStreamCursor() {
    const list = this.data.monthList;
    return list.length ? list[list.length - 1].month : '';
  },

  // 月份汇总行 → 卡片渲染数据（含该月全部明细，直接铺开，不再按日分组）
  mapStreamMonths(rawMonths) {
    return (rawMonths || []).map((item) => {
      const parts = String(item.month).split('-');
      const items = this.mapItems(item.items);
      return {
        month: item.month,
        monthText: parts.length === 2 ? `${parts[0]}年${parseInt(parts[1], 10)}月` : String(item.month),
        incomeText: formatAmount(Number(item.income) || 0),
        expenseText: formatAmount(Number(item.expense) || 0),
        items,
        count: items.length,
      };
    });
  },

  // 触底加载更多（page-main 的 chudi 事件），仅月度页生效
  onScrollLower() {
    if (this.data.active !== 0 || this.data.streamLoadingMore || !this.data.monthHasMore) {
      return;
    }
    this.loadMonthStream(false);
  },

  retryMonthStream() {
    this.loadMonthStream(true);
  },

  // 明细行统一加工：收支文案、带符号金额（收入 + / 支出 -，不只靠颜色区分）、
  // 日期标签（直接展示在行内，月度页与抽屉共用，不再按日分组）
  mapItems(rawItems) {
    return (rawItems || []).map((item) => {
      const date = formatDate(item.occurredOn);
      return {
        ...item,
        kindText: item.kind === 'expense' ? '支出' : '收入',
        sign: item.kind === 'expense' ? '−' : '+',
        amountText: `${item.kind === 'expense' ? '-' : '+'}${formatAmount(Math.abs(Number(item.amount) || 0))}`,
        date,
        dateLabel: dayLabel(date),
      };
    });
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

  // ------------------- 选择年份（只列有已公开账期的年份） -------------------
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
      const cached = this.periodCache;
      this.setData({ periodState: 'ready', periodYears: cached.groups, yearOptions: cached.years });
      return;
    }
    const requestId = ++this.periodRequestId;
    this.setData({ periodState: 'loading' });
    get('/api/public/finance/periods', { venueId: this.data.venueId }, { loading: false })
      .then((res) => {
        if (requestId !== this.periodRequestId) {
          return;
        }
        // 兼容尚未升级的旧服务端：旧接口只返回已公开月份数组
        const periods = Array.isArray(res.periods)
          ? res.periods
          : (res.months || []).map((month) => ({ month, status: 'published' }));
        const data = this.buildPeriodGroups(periods);
        this.periodCache = data;
        this.setData({ periodState: 'ready', periodYears: data.groups, yearOptions: data.years });
      })
      .catch(() => {
        if (requestId !== this.periodRequestId) {
          return;
        }
        this.setData({ periodState: 'error', periodYears: [], yearOptions: [] });
      });
  },

  // [{ month:'2026-11', status:'published' }, ...] → 按年份分组的月份按钮 + 可选年份列表
  // 客户端再过滤一次，避免新旧服务端交替期间展示未公开账期
  buildPeriodGroups(periods) {
    const groups = [];
    const index = {};
    (periods || []).forEach((item) => {
      const parts = String((item && item.month) || '').split('-');
      if (parts.length !== 2 || item.status !== 'published') {
        return;
      }
      const year = parts[0];
      if (index[year] == null) {
        index[year] = groups.length;
        groups.push({ year, months: [], published: 0 });
      }
      const group = groups[index[year]];
      group.months.push({
        month: item.month,
        label: `${parseInt(parts[1], 10)}月`,
        status: 'published',
      });
      group.published += 1;
    });
    return {
      groups,
      years: groups.filter((group) => group.published > 0).map((group) => ({ year: group.year })),
    };
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
  // 年度页：点开某个月份卡片，展开抽屉看该月收支明细（接口复用公开月度接口）
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
          detailItems: [],
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
    // 即使命中缓存也要作废旧请求，否则旧响应会覆盖刚切到的缓存月份
    const requestId = ++this.detailRequestId;
    const cache = this.detailCache || (this.detailCache = {});
    const cached = cache[month];
    if (cached) {
      this.setData(Object.assign({ detailState: 'ready' }, cached));
      return;
    }

    this.setData({
      detailState: 'loading',
      detailBill: null,
      detailItems: [],
      detailSub: '正在加载明细',
    });
    get('/api/public/finance/monthly', { venueId: this.data.venueId, month }, { loading: false })
      .then((res) => {
        const items = this.mapItems(res.items);
        const detail = {
          detailBill: this.buildBill(res.bill),
          detailItems: items,
          detailSub: items.length
            ? `共 ${items.length} 笔明细`
            : res.bill
              ? '该月无收支明细'
              : '该月暂无公开数据',
        };
        if (requestId !== this.detailRequestId) {
          return;
        }
        cache[month] = detail;
        this.setData(Object.assign({ detailState: 'ready' }, detail));
      })
      .catch(() => {
        if (requestId !== this.detailRequestId) {
          return;
        }
        this.setData({ detailState: 'error', detailBill: null, detailItems: [], detailSub: '明细加载失败' });
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

    // 月度页默认拉取最近一批已公开月份；年度页年份随后对齐到最新公开月份
    const currentYear = new Date().getFullYear();

    this.setData({ venueId, year: currentYear }, () => {
      this.loadVenueName();
      this.loadMonthStream(true);
    });
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
