<script setup lang="ts">
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { LegacyGridContainLabel } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'
import { Document, Message, OfficeBuilding, UserFilled, Wallet, Warning } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, LegacyGridContainLabel, CanvasRenderer])
const { admin } = useAdmin()
const loading = ref(true)
const stats = ref<Record<string, number>>({})
const months = ref<string[]>([])
const trends = ref<TrendRow[]>([])
const chartElement = ref<HTMLElement>()
const activeView = ref<'aggregate' | 'ranking'>('aggregate')
let chart: echarts.ECharts | undefined
let observer: ResizeObserver | undefined
const cards = computed(() => [
  { key: 'venues', label: '管辖场所', path: '/venues', icon: OfficeBuilding },
  { key: 'finance', label: '待审财务', path: '/finance', icon: Wallet },
  { key: 'profiles', label: '待审介绍', path: admin.value?.roleCode === 'venue' ? '/profiles' : '/profiles/review', icon: Document },
  { key: 'safety', label: '待审安全', path: '/safety', icon: Warning },
  { key: 'personnel', label: '待审人员', path: admin.value?.roleCode === 'venue' ? '/personnel' : '/personnel/review', icon: UserFilled },
  { key: 'unread', label: '未读通知', path: '/my-notices', icon: Message }
])

type TrendRow = {
  venue_id: number
  venue_name: string
  bill_month: string
  income: number | string | null
  expense: number | string | null
  current_balance: number | string | null
}

const COLORS = {
  income: '#1f66bd',
  expense: '#df8733',
  balance: '#0d3f6e',
  axis: '#98a2b3',
  text: '#475467',
  grid: '#edf0f5'
}

const venueMode = computed(() => admin.value?.roleCode === 'venue')
const canSwitch = computed(() => !venueMode.value && trends.value.length > 0)

const num = (value: number | string | null | undefined) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function fmtMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)} 亿元`
  if (abs >= 1e4) return `${(value / 1e4).toFixed(2)} 万元`
  return `${Math.round(value).toLocaleString('zh-CN')} 元`
}

/** 坐标轴使用紧凑金额，按数量级自动控制小数位 */
function fmtWan(value: number) {
  if (!value) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e8) return `${Number((value / 1e8).toFixed(2))}亿`
  if (abs >= 1e4) {
    const wan = value / 1e4
    const digits = Math.abs(wan) >= 100 ? 0 : Math.abs(wan) >= 10 ? 1 : 2
    return `${Number(wan.toFixed(digits))}万`
  }
  return String(Math.round(value))
}

/** 数据标签统一保留两位小数，保证同一组数值精度一致 */
function fmtWanLabel(value: number) {
  if (!value) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)}亿`
  if (abs >= 1e4) return `${(value / 1e4).toFixed(2)}万`
  return String(Math.round(value))
}

/** 表格内金额统一以元为单位，避免同列混排万/元 */
function fmtPlain(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—'
  return Math.round(value).toLocaleString('zh-CN')
}

const esc = (text: string) => String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] ?? char))

const monthPoints = computed(() => months.value.map((month) => ({
  key: month,
  full: `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`,
  short: `${Number(month.slice(5, 7))}月`
})))

const periodLabel = computed(() => {
  const points = monthPoints.value
  if (!points.length) return ''
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return ''
  return first.key.slice(0, 4) === last.key.slice(0, 4)
    ? `${first.key.slice(0, 4)}年${first.short} — ${last.short}`
    : `${first.full} — ${last.full}`
})

/** 按月份汇总：收支按月累加，结余为当月各场所结余合计 */
const aggregate = computed(() => months.value.map((month) => {
  const rows = trends.value.filter((row) => row.bill_month === month)
  if (!rows.length) return { month, income: null as number | null, expense: null as number | null, balance: null as number | null, venues: 0, net: null as number | null }
  let income = 0
  let expense = 0
  let balance = 0
  let withBalance = 0
  for (const row of rows) {
    income += num(row.income)
    expense += num(row.expense)
    if (row.current_balance !== null && row.current_balance !== undefined) {
      balance += num(row.current_balance)
      withBalance += 1
    }
  }
  return { month, income, expense, balance: withBalance ? balance : null, venues: rows.length, net: income - expense }
}))

const totals = computed(() => {
  const filled = aggregate.value.filter((item) => item.income !== null)
  const income = filled.reduce((sum, item) => sum + (item.income ?? 0), 0)
  const expense = filled.reduce((sum, item) => sum + (item.expense ?? 0), 0)
  const venueCount = new Set(trends.value.map((row) => row.venue_id)).size
  const coverage = stats.value.venues ? Math.min(venueCount / stats.value.venues, 1) : 0
  return {
    income,
    expense,
    net: income - expense,
    venueCount,
    coverage,
    expenseRatio: income > 0 ? expense / income * 100 : null,
    netRatio: income > 0 ? (income - expense) / income * 100 : null
  }
})

const pctText = (value: number | null) => value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`

/** 场所对比：按近六个月累计支出降序 */
const ranking = computed(() => {
  const map = new Map<number, { id: number, name: string, income: number, expense: number, balance: number, hasBalance: boolean }>()
  for (const row of trends.value) {
    const current = map.get(row.venue_id) ?? { id: row.venue_id, name: row.venue_name, income: 0, expense: 0, balance: 0, hasBalance: false }
    current.income += num(row.income)
    current.expense += num(row.expense)
    if (row.current_balance !== null && row.current_balance !== undefined) {
      current.balance += num(row.current_balance)
      current.hasBalance = true
    }
    map.set(row.venue_id, current)
  }
  return [...map.values()].sort((a, b) => b.expense - a.expense || b.income - a.income)
})

type BarRow = { name: string, income: number, expense: number, balance: number | null, isRest: boolean, count: number }

/** 图表自下而上绘制，因此把“其余场所”放在数组首位，渲染后位于底部 */
const rankingBars = computed<BarRow[]>(() => {
  const rows = ranking.value
  const top = rows.slice(0, 8).reverse()
  const bars: BarRow[] = top.map((row) => ({
    name: row.name,
    income: row.income,
    expense: row.expense,
    balance: row.hasBalance ? row.balance : null,
    isRest: false,
    count: 1
  }))
  const rest = rows.slice(8)
  if (rest.length) {
    bars.unshift({
      name: `其余 ${rest.length} 个场所`,
      income: rest.reduce((sum, row) => sum + row.income, 0),
      expense: rest.reduce((sum, row) => sum + row.expense, 0),
      balance: rest.every((row) => !row.hasBalance) ? null : rest.reduce((sum, row) => sum + (row.hasBalance ? row.balance : 0), 0),
      isRest: true,
      count: rest.length
    })
  }
  return bars
})

const rankingSummary = computed(() => {
  const top = ranking.value[0]
  if (!top) return ''
  const hidden = Math.max(ranking.value.length - 8, 0)
  return `按近六个月累计支出排序，支出最高：${top.name}（${fmtMoney(top.expense)}）${hidden ? `。其余 ${hidden} 个场所已合并为一项，完整数据见下方数据表。` : '。'}`
})

const tooltipBase = 'background:#fff;border:1px solid #e7e9ee;border-radius:10px;padding:10px 14px;box-shadow:0 8px 28px rgba(16,24,40,.12);'

function tooltipRow(dot: string, label: string, value: string, strong = false) {
  return `<div style="display:flex;align-items:center;gap:8px;margin-top:6px;min-width:196px">
    <span style="width:8px;height:8px;border-radius:2px;background:${dot};flex:none"></span>
    <span style="color:#667085;font-size:12px">${label}</span>
    <span style="margin-left:auto;font-variant-numeric:tabular-nums;font-weight:${strong ? 650 : 550};color:#1f2937;font-size:12px">${value}</span>
  </div>`
}

function aggregateTooltip(params: any[]) {
  const index = params?.[0]?.dataIndex ?? 0
  const point = aggregate.value[index]
  if (!point) return ''
  const totalVenues = stats.value.venues || point.venues
  const coverage = venueMode.value || !point.venues ? '' : `${point.venues} / ${totalVenues} 个场所报送`
  const rows = [
    tooltipRow(COLORS.income, '收入', fmtMoney(point.income)),
    tooltipRow(COLORS.expense, '支出', fmtMoney(point.expense)),
    tooltipRow(COLORS.balance, '账面结余', fmtMoney(point.balance)),
    tooltipRow('#98a2b3', '当月净收支', fmtMoney(point.net))
  ].join('')
  return `<div style="min-width:210px">
    <div style="font-weight:650;color:#1f2937;font-size:13px">${esc(monthPoints.value[index]?.full ?? '')}</div>
    <div style="color:#98a2b3;font-size:12px;margin-top:2px">${coverage || '当月汇总'}</div>
    ${rows}
  </div>`
}

function rankingTooltip(params: any[]) {
  const index = params?.[0]?.dataIndex ?? 0
  const row = rankingBars.value[index]
  if (!row) return ''
  const subtitle = row.isRest ? `末 ${row.count} 个场所合计` : '近六个月累计'
  return `<div style="min-width:210px">
    <div style="font-weight:650;color:#1f2937;font-size:13px">${esc(row.name)}</div>
    <div style="color:#98a2b3;font-size:12px;margin-top:2px">${subtitle}</div>
    ${tooltipRow(COLORS.income, '收入', fmtMoney(row.income))}
    ${tooltipRow(COLORS.expense, '支出', fmtMoney(row.expense))}
    ${tooltipRow(COLORS.balance, '期末结余', row.balance == null ? '无数据' : fmtMoney(row.balance))}
    ${tooltipRow('#98a2b3', '净收支', fmtMoney(row.income - row.expense))}
  </div>`
}

function baseOption() {
  return {
    animationDuration: 560,
    animationEasing: 'cubicOut',
    textStyle: { fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif' },
    legend: {
      top: 0,
      left: 'center',
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 22,
      textStyle: { color: COLORS.text, fontSize: 12 }
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: '#fff',
      borderColor: '#e7e9ee',
      padding: 0,
      textStyle: { color: '#1f2937', fontSize: 12 },
      extraCssText: tooltipBase,
      axisPointer: { type: 'shadow' as const, shadowStyle: { color: 'rgba(23,84,156,.06)' } }
    }
  }
}

/** 容器宽度决定标签密度，窄屏（手机）隐藏报送数、压缩柱宽 */
const narrow = ref(false)

function renderChart() {
  if (!chartElement.value || !trends.value.length) return
  narrow.value = chartElement.value.clientWidth < 620
  chart ??= echarts.init(chartElement.value, undefined, { renderer: 'canvas' })
  const option = canSwitch.value && activeView.value === 'ranking' ? rankingOption() : aggregateOption()
  chart.setOption(option, true)
  chart.resize()
}

function barWidthFor(slots: number) {
  const width = chartElement.value?.clientWidth ?? 900
  const usable = width - (narrow.value ? 96 : 140)
  return Math.max(10, Math.min(24, Math.round(usable / slots * 0.24)))
}

function aggregateOption(): any {
  const labels = monthPoints.value.map((point) => point.short)
  const barWidth = barWidthFor(labels.length)
  const values = aggregate.value
  const totalVenues = stats.value.venues || Math.max(...values.map((item) => item.venues), 1)
  const barRadius: [number, number, number, number] = [5, 5, 0, 0]
  return {
    ...baseOption(),
    grid: { left: 4, right: 10, top: 44, bottom: 2, containLabel: true },
    tooltip: { ...baseOption().tooltip, formatter: aggregateTooltip },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: true,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e7e9ee' } },
      axisLabel: {
        margin: 12,
        interval: 0,
        formatter: (value: string, index: number) => {
          if (venueMode.value || narrow.value) return `{m|${value}}`
          const point = values[index]
          return `{m|${value}}\n{c|${point?.venues ? `${point.venues}/${totalVenues} 所` : '未报送'}}`
        },
        rich: {
          m: { color: COLORS.text, fontSize: narrow.value ? 11 : 12, lineHeight: 20, align: 'center' },
          c: { color: '#a6b0c0', fontSize: 10.5, lineHeight: 15, align: 'center' }
        }
      }
    },
    yAxis: [
      {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: COLORS.axis, fontSize: 11, formatter: fmtWan },
        splitLine: { lineStyle: { color: COLORS.grid, type: [4, 4] } }
      },
      {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: COLORS.axis, fontSize: 11, formatter: fmtWan },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '收入',
        type: 'bar',
        barWidth,
        barGap: '26%',
        itemStyle: {
          borderRadius: barRadius,
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#4a8ad8' },
            { offset: 1, color: '#1f66bd' }
          ])
        },
        emphasis: { itemStyle: { color: '#17549c' } },
        data: values.map((item) => item.income)
      },
      {
        name: '支出',
        type: 'bar',
        barWidth,
        itemStyle: {
          borderRadius: barRadius,
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#f0ae6a' },
            { offset: 1, color: '#df8733' }
          ])
        },
        emphasis: { itemStyle: { color: '#c9741f' } },
        data: values.map((item) => item.expense)
      },
      {
        name: '结余（右轴）',
        type: 'line',
        yAxisIndex: 1,
        smooth: 0.25,
        symbol: 'circle',
        symbolSize: 7,
        showSymbol: true,
        connectNulls: false,
        lineStyle: { width: 2.4, color: COLORS.balance },
        itemStyle: { color: '#fff', borderColor: COLORS.balance, borderWidth: 2 },
        emphasis: { scale: 1.4 },
        data: values.map((item) => item.balance)
      }
    ]
  }
}

function rankingOption(): any {
  const bars = rankingBars.value
  return {
    ...baseOption(),
    grid: { left: 4, right: narrow.value ? 44 : 56, top: 44, bottom: 2, containLabel: true },
    legend: { ...baseOption().legend, left: 'right' },
    tooltip: { ...baseOption().tooltip, formatter: rankingTooltip },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: COLORS.axis, fontSize: 11, formatter: fmtWan },
      splitLine: { lineStyle: { color: COLORS.grid, type: [4, 4] } }
    },
    yAxis: {
      type: 'category',
      data: bars.map((row) => row.name),
      axisLine: { lineStyle: { color: '#e7e9ee' } },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: '#f4f6fa' } },
      axisLabel: {
        color: (value: string, index: number) => bars[index]?.isRest ? '#8a94a6' : COLORS.text,
        fontSize: narrow.value ? 11 : 12,
        width: narrow.value ? 96 : 148,
        overflow: 'truncate'
      }
    },
    series: [
      {
        name: '收入',
        type: 'bar',
        barWidth: narrow.value ? 7 : 10,
        barGap: '30%',
        itemStyle: { borderRadius: 3, color: '#2a74c9' },
        data: bars.map((row) => ({ value: row.income, itemStyle: { color: row.isRest ? '#b6c6d9' : '#2a74c9' } }))
      },
      {
        name: '支出',
        type: 'bar',
        barWidth: narrow.value ? 7 : 10,
        itemStyle: { borderRadius: 3, color: '#e08a3c' },
        label: {
          show: !narrow.value,
          position: 'right',
          distance: 6,
          color: COLORS.text,
          fontSize: 11,
          formatter: (params: any) => fmtWanLabel(params.value)
        },
        data: bars.map((row) => ({ value: row.expense, itemStyle: { color: row.isRest ? '#e6cbaa' : '#e08a3c' } }))
      }
    ]
  }
}

async function load() {
  loading.value = true
  try {
    const response = await $fetch<{ stats: Record<string, number>, months: string[], trends: TrendRow[] }>('/api/admin/dashboard')
    stats.value = response.stats
    months.value = response.months
    trends.value = response.trends ?? []
    activeView.value = 'aggregate'
    await nextTick()
    renderChart()
    observeChart()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

function observeChart() {
  if (!chartElement.value) return
  // 空数据切换回有数据时容器可能被重新创建，需要重新绑定
  observer?.disconnect()
  observer = new ResizeObserver(() => {
    const next = (chartElement.value?.clientWidth ?? 0) < 620
    if (next !== narrow.value) renderChart()
    else chart?.resize()
  })
  observer.observe(chartElement.value)
}

watch(activeView, () => { void nextTick().then(renderChart) })

onMounted(() => { void load() })
onUnmounted(() => {
  observer?.disconnect()
  observer = undefined
  chart?.dispose()
  chart = undefined
})
</script>

<template>
  <div class="page" v-loading="loading">
    <section class="banner" aria-label="系统标题">
      <div class="banner-copy">
        <p class="banner-eyebrow">信息公开 · 清晰可查</p>
        <h1>沂水宗教“码上公开”管理系统</h1>
        <p class="banner-sub">欢迎回来，{{ admin?.name }}。这里是你管辖范围内的公开事务概览。</p>
      </div>
      <el-button class="banner-action" @click="load">刷新数据</el-button>
    </section>

    <section class="stats-grid" aria-label="事务统计">
      <NuxtLink v-for="card in cards" :key="card.key" class="stat-card" :to="card.path">
        <span class="stat-icon" aria-hidden="true"><el-icon><component :is="card.icon" /></el-icon></span>
        <span class="stat-body">
          <span class="stat-label">{{ card.label }}</span>
          <strong>{{ stats[card.key] ?? 0 }}</strong>
        </span>
        <span class="stat-more" aria-hidden="true">详情 →</span>
      </NuxtLink>
    </section>

    <section class="panel chart-panel" aria-labelledby="trend-title">
      <header class="chart-head">
        <div class="chart-head-copy">
          <h2 id="trend-title">{{ venueMode ? '近六个月收支与结余' : '近六个月公开财务趋势' }}</h2>
          <p class="chart-sub">
            已审核并公开的月度账单<template v-if="periodLabel"> · {{ periodLabel }}</template>
          </p>
        </div>
        <div v-if="canSwitch" class="chart-switch" role="tablist" aria-label="图表视图切换">
          <button type="button" role="tab" :aria-selected="activeView === 'aggregate'" :class="{ active: activeView === 'aggregate' }" @click="activeView = 'aggregate'">辖区收支</button>
          <button type="button" role="tab" :aria-selected="activeView === 'ranking'" :class="{ active: activeView === 'ranking' }" @click="activeView = 'ranking'">场所对比</button>
        </div>
      </header>

      <template v-if="trends.length">
        <div class="metric-row">
          <div class="metric">
            <span class="metric-label"><i class="metric-dot dot-income" aria-hidden="true" />累计收入</span>
            <strong>{{ fmtMoney(totals.income) }}</strong>
            <span class="metric-hint">{{ venueMode ? '近六个月合计' : `近六个月 · ${totals.venueCount} 个场所报送` }}</span>
          </div>
          <div class="metric">
            <span class="metric-label"><i class="metric-dot dot-expense" aria-hidden="true" />累计支出</span>
            <strong>{{ fmtMoney(totals.expense) }}</strong>
            <span class="metric-hint">{{ venueMode ? '近六个月合计' : `支出占收入 ${pctText(totals.expenseRatio)}` }}</span>
          </div>
          <div class="metric">
            <span class="metric-label"><i class="metric-dot dot-balance" aria-hidden="true" />收支差额</span>
            <strong :class="{ 'is-negative': totals.net < 0 }">{{ fmtMoney(totals.net) }}</strong>
            <span class="metric-hint">累计收入 − 累计支出</span>
          </div>
        </div>

        <div ref="chartElement" class="chart" role="img" :aria-label="activeView === 'ranking' ? '各场所近六个月累计收入与支出对比图' : '近六个月收入、支出与结余趋势图'" />
        <p class="chart-footnote">
          {{ activeView === 'ranking'
            ? rankingSummary
            : venueMode
              ? '柱子为当月收支合计，折线为当月账面结余（右轴）。'
              : narrow
                ? '柱子为当月收支合计，折线为已报送场所的账面结余合计（右轴）。'
                : `柱子为当月收支合计，折线为已报送场所的账面结余合计（右轴）；横轴下方为当月报送场所数，共 ${stats.venues ?? 0} 个场所。` }}
        </p>
      </template>
      <div v-else class="empty-state">暂无已审核并公开的财务数据</div>

      <details v-if="trends.length">
        <summary>查看图表数据表</summary>
        <div class="table-region" tabindex="0" role="region" aria-label="财务趋势数据">
          <el-table :data="trends" max-height="360">
            <el-table-column prop="venue_name" label="场所" min-width="180" show-overflow-tooltip />
            <el-table-column prop="bill_month" label="月份" width="110" />
            <el-table-column label="收入（元）" width="140" align="right">
              <template #default="{ row }">{{ fmtPlain(num(row.income)) }}</template>
            </el-table-column>
            <el-table-column label="支出（元）" width="140" align="right">
              <template #default="{ row }">{{ fmtPlain(num(row.expense)) }}</template>
            </el-table-column>
            <el-table-column label="结余（元）" width="140" align="right">
              <template #default="{ row }">{{ fmtPlain(num(row.current_balance)) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </details>
    </section>
  </div>
</template>

<style scoped>
.banner {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-block-end: 22px;
  padding: 34px 36px 32px;
  border-radius: 18px;
  overflow: hidden;
  color: #fff;
  background: linear-gradient(120deg, #0b396c 0%, #17549c 58%, #1a63b0 100%);
}
.banner::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 84% 18%, rgb(255 255 255 / 16%), transparent 42%),
    linear-gradient(90deg, rgb(255 255 255 / 6%) 1px, transparent 1px),
    linear-gradient(0deg, rgb(255 255 255 / 6%) 1px, transparent 1px);
  background-size: auto, 44px 44px, 44px 44px;
  pointer-events: none;
}
.banner-copy { position: relative; }
.banner-eyebrow { margin: 0 0 10px; font-size: 13px; letter-spacing: 3px; color: rgb(255 255 255 / 74%); }
.banner h1 { margin: 0; font-size: clamp(24px, 2.6vw, 34px); font-weight: 600; letter-spacing: 4px; text-shadow: 0 2px 12px rgb(4 24 54 / 40%); }
.banner-sub { margin: 12px 0 0; max-width: 62ch; color: rgb(255 255 255 / 82%); }
.banner-action {
  position: relative;
  flex: none;
  color: #fff;
  background: rgb(255 255 255 / 14%);
  border-color: rgb(255 255 255 / 42%);
}
.banner-action:hover,
.banner-action:focus-visible { color: #0b396c; background: #fff; border-color: #fff; }

.stats-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; margin-block-end: 22px; }
.stat-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 18px 18px 16px;
  border: 1px solid #e2ecf8;
  border-radius: 14px;
  background: #f6faff;
  transition: transform .18s, background-color .18s, border-color .18s;
}
.stat-card:hover,
.stat-card:focus-visible { transform: translateY(-3px); background: #eef5fd; border-color: var(--brand); }
.stat-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: #e2eefc;
  color: var(--brand);
  font-size: 23px;
}
.stat-body { display: block; min-width: 0; }
.stat-label { display: block; color: var(--brand); font-size: 15px; font-weight: 600; }
.stat-body strong { display: block; margin-block-start: 2px; color: #1c2b45; font-size: 28px; line-height: 1.2; }
.stat-more { position: absolute; inset-block-start: 10px; inset-inline-end: 12px; color: var(--muted); font-size: 12px; opacity: 0; transition: opacity .18s; }
.stat-card:hover .stat-more,
.stat-card:focus-visible .stat-more { opacity: 1; }

.chart-panel { padding-block-start: 20px; }
.chart-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.chart-head-copy h2 { margin: 0; font-size: 19px; font-weight: 650; color: #101828; letter-spacing: .3px; }
.chart-sub { margin: 4px 0 0; color: var(--muted); font-size: 12.5px; }
.chart-switch {
  display: inline-flex;
  flex: none;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: #f1f4f9;
}
.chart-switch button {
  padding: 7px 16px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #52606f;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color .16s, color .16s, box-shadow .16s;
}
.chart-switch button:hover { color: var(--brand); }
.chart-switch button.active { background: #fff; color: var(--brand); font-weight: 650; box-shadow: 0 1px 3px rgb(16 24 40 / 12%); }
.chart-switch button:focus-visible { outline: 2px solid #84adff; outline-offset: 1px; }

.metric-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-block: 18px 6px; }
.metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 16px;
  border-radius: 12px;
  background: linear-gradient(180deg, #f8fafd 0%, #f4f7fb 100%);
  border: 1px solid #eef2f8;
}
.metric-label { display: flex; align-items: center; gap: 6px; color: #52606f; font-size: 12.5px; }
.metric-dot { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.dot-income { background: #1f66bd; }
.dot-expense { background: #df8733; }
.dot-balance { background: #0d3f6e; }
.metric strong { color: #101828; font-size: 21px; font-weight: 650; line-height: 1.35; font-variant-numeric: tabular-nums; }
.metric strong.is-negative { color: #b54708; }
.metric-hint { color: #8a94a6; font-size: 12px; }

.chart { width: 100%; height: 380px; margin-block-start: 4px; }
.chart-footnote { margin: 12px 0 4px; color: #8a94a6; font-size: 12px; line-height: 1.6; }
details { margin-block-start: 8px; border-block-start: 1px solid #f0f2f6; padding-block-start: 8px; }
summary { cursor: pointer; min-height: 40px; display: flex; align-items: center; color: var(--brand); font-size: 13px; }

@media (max-width: 1300px) {
  .stats-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .banner { flex-direction: column; align-items: flex-start; padding: 26px 24px; }
  .banner h1 { letter-spacing: 2px; }
  .metric-row { grid-template-columns: 1fr; gap: 8px; }
  .metric { padding: 10px 14px; }
  .chart-head { align-items: stretch; }
  .chart-switch { align-self: flex-start; }
}
@media (max-width: 600px) {
  .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .stat-card { padding: 14px; gap: 10px; }
  .stat-icon { width: 38px; height: 38px; font-size: 19px; }
  .stat-body strong { font-size: 24px; }
  .stat-more { display: none; }
  .chart { height: 340px; }
  .chart-switch { width: 100%; }
  .chart-switch button { flex: 1; }
  .metric { padding: 9px 14px; }
  .metric strong { font-size: 18px; }
  .metric-hint { font-size: 11.5px; }
}
</style>
