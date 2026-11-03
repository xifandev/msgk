<script setup lang="ts">
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, ToolboxComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { ElMessage } from 'element-plus'

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, ToolboxComponent, TooltipComponent, CanvasRenderer])
useHead({ title: '工作台 | 码上公开' })
const { admin } = useAdmin()
const loading = ref(true)
const stats = ref<Record<string, number>>({})
const months = ref<string[]>([])
const trends = ref<any[]>([])
const chartElement = ref<HTMLElement>()
let chart: echarts.ECharts | undefined
const cards = computed(() => [
  { key: 'venues', label: '管辖场所', path: '/venues' },
  { key: 'finance', label: '待审财务', path: '/finance' },
  { key: 'profiles', label: '待审介绍', path: admin.value?.roleCode === 'venue' ? '/profiles' : '/profiles/review' },
  { key: 'safety', label: '待审安全', path: '/safety' },
  { key: 'personnel', label: '待审人员', path: admin.value?.roleCode === 'venue' ? '/personnel' : '/personnel/review' },
  { key: 'unread', label: '未读通知', path: '/my-notices' }
])

function renderChart() {
  if (!chartElement.value) return
  chart ??= echarts.init(chartElement.value)
  const venueMode = admin.value?.roleCode === 'venue'
  const seriesNames: [string, string][] = venueMode ? [['income', '收入'], ['expense', '支出'], ['current_balance', '结余']] : [['current_balance', '结余']]
  const series: any[] = []
  if (venueMode) {
    for (const [key, name] of seriesNames) {
      series.push({ name, type: 'line', smooth: true, data: months.value.map((month) => trends.value.find((row) => row.bill_month === month)?.[key] ?? null) })
    }
  } else {
    const venueIds = [...new Set(trends.value.map((row) => row.venue_id))]
    for (const venueId of venueIds) {
      const rows = trends.value.filter((row) => row.venue_id === venueId)
      series.push({ name: rows[0]?.venue_name ?? String(venueId), type: 'line', smooth: true, data: months.value.map((month) => rows.find((row) => row.bill_month === month)?.current_balance ?? null) })
    }
  }
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { left: 20, right: 20, top: 30, bottom: 60, containLabel: true },
    xAxis: { type: 'category', data: months.value },
    yAxis: { type: 'value', name: '元' },
    series
  }, true)
}

async function load() {
  loading.value = true
  try {
    const response = await $fetch<{ stats: Record<string, number>, months: string[], trends: any[] }>('/api/admin/dashboard')
    stats.value = response.stats
    months.value = response.months
    trends.value = response.trends
    await nextTick()
    renderChart()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}
function resize() { chart?.resize() }
onMounted(() => { load(); window.addEventListener('resize', resize) })
onUnmounted(() => { window.removeEventListener('resize', resize); chart?.dispose() })
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="page-header">
      <div><h1>工作台</h1><p>欢迎回来，{{ admin?.name }}。这里是你管辖范围内的公开事务概览。</p></div>
      <el-button type="primary" @click="load">刷新数据</el-button>
    </div>
    <section class="stats-grid" aria-label="事务统计">
      <NuxtLink v-for="card in cards" :key="card.key" class="stat-card" :to="card.path">
        <span>{{ card.label }}</span><strong>{{ stats[card.key] ?? 0 }}</strong><small>查看详情 →</small>
      </NuxtLink>
    </section>
    <section class="panel chart-panel" aria-labelledby="trend-title">
      <h2 id="trend-title">近六个月公开财务趋势</h2>
      <div v-if="trends.length" ref="chartElement" class="chart" role="img" aria-label="近六个月收入、支出或结余趋势图" />
      <div v-else class="empty-state">暂无已审核并公开的财务数据</div>
      <details v-if="trends.length">
        <summary>查看图表数据表</summary>
        <div class="table-region" tabindex="0" role="region" aria-label="财务趋势数据">
          <el-table :data="trends">
            <el-table-column prop="venue_name" label="场所" />
            <el-table-column prop="bill_month" label="月份" />
            <el-table-column prop="income" label="收入" />
            <el-table-column prop="expense" label="支出" />
            <el-table-column prop="current_balance" label="结余" />
          </el-table>
        </div>
      </details>
    </section>
  </div>
</template>

<style scoped>
.stats-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; margin-block-end: 22px; }
.stat-card { padding: 20px; border: 1px solid var(--line); border-radius: 14px; background: white; transition: transform .18s, border-color .18s; }
.stat-card:hover { transform: translateY(-2px); border-color: var(--brand); }
.stat-card span, .stat-card small { display: block; color: var(--muted); }
.stat-card strong { display: block; margin-block: 8px; font-size: 30px; }
.chart-panel h2 { margin-block-start: 0; font-size: 20px; }
.chart { width: 100%; height: 390px; }
details { margin-block-start: 12px; }
summary { cursor: pointer; min-height: 40px; }
@media (max-width: 1300px) { .stats-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 600px) { .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; } .stat-card { padding: 14px; } .chart { height: 320px; } }
</style>
