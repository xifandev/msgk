<script setup lang="ts">
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, ToolboxComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { Document, Message, OfficeBuilding, UserFilled, Wallet, Warning } from '@element-plus/icons-vue'
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
  { key: 'venues', label: '管辖场所', path: '/venues', icon: OfficeBuilding },
  { key: 'finance', label: '待审财务', path: '/finance', icon: Wallet },
  { key: 'profiles', label: '待审介绍', path: admin.value?.roleCode === 'venue' ? '/profiles' : '/profiles/review', icon: Document },
  { key: 'safety', label: '待审安全', path: '/safety', icon: Warning },
  { key: 'personnel', label: '待审人员', path: admin.value?.roleCode === 'venue' ? '/personnel' : '/personnel/review', icon: UserFilled },
  { key: 'unread', label: '未读通知', path: '/my-notices', icon: Message }
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

.chart-panel h2 { margin-block-start: 0; font-size: 20px; }
.chart { width: 100%; height: 390px; }
details { margin-block-start: 12px; }
summary { cursor: pointer; min-height: 40px; }

@media (max-width: 1300px) {
  .stats-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .banner { flex-direction: column; align-items: flex-start; padding: 26px 24px; }
  .banner h1 { letter-spacing: 2px; }
}
@media (max-width: 600px) {
  .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .stat-card { padding: 14px; gap: 10px; }
  .stat-icon { width: 38px; height: 38px; font-size: 19px; }
  .stat-body strong { font-size: 24px; }
  .stat-more { display: none; }
  .chart { height: 320px; }
}
</style>
