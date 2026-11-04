<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { CircleCloseFilled, Clock, OfficeBuilding, Refresh, WarningFilled } from '@element-plus/icons-vue'
import { townshipRank } from '~~/shared/townships'

type PeriodState = 'published' | 'approved' | 'pending' | 'rejected' | 'draft' | 'missing'

interface Bucket {
  month: string
  total: number
  published: number
  approved: number
  pending: number
  rejected: number
  draft: number
  missing: number
  coverage: number
}

interface MatrixCell {
  month: string
  total: number
  submitted: number
  published: number
  approved: number
  pending: number
  rejected: number
  draft: number
  missing: number
}

interface MatrixRow {
  key: string
  label: string
  hint: number
  history: MatrixCell[]
}

interface VenueRow {
  id: number
  name: string
  township: string
  state: PeriodState
  rawState: string | null
  submittedAt: string | null
}

interface ModuleInfo { published: number, pending: number, filled: number }

interface Payload {
  months: string[]
  month: string
  roleCode: string
  venueTotal: number
  townshipTotal: number
  period: Bucket
  previous: Bucket | null
  monthly: Bucket[]
  matrix: { level: 'township' | 'venue', rows: MatrixRow[] }
  rows: VenueRow[]
  selfHistory: { month: string, state: PeriodState }[] | null
  unread: number
  info: { profiles: ModuleInfo, personnel: ModuleInfo, safety: ModuleInfo }
}

const { admin } = useAdmin()
const loading = ref(true)
const refreshing = ref(false)
const month = ref('')
const data = ref<Payload | null>(null)
const tableFilter = ref<'all' | PeriodState>('all')

const EMPTY: Bucket = {
  month: '', total: 0, published: 0, approved: 0, pending: 0, rejected: 0, draft: 0, missing: 0, coverage: 0
}

const roleCode = computed(() => data.value?.roleCode ?? admin.value?.roleCode ?? '')
const venueMode = computed(() => roleCode.value === 'venue')
const period = computed(() => data.value?.period ?? EMPTY)
const monthly = computed(() => data.value?.monthly ?? [])
const months = computed(() => data.value?.months ?? [])
const rows = computed(() => data.value?.rows ?? [])
const matrix = computed(() => data.value?.matrix ?? { level: 'township' as const, rows: [] as MatrixRow[] })
const townshipMode = computed(() => matrix.value.level === 'township')
/** 已报送 = 应报 − 未报送（含审核中、未通过、编辑中） */
const submittedOf = (bucket: { total: number, missing: number }) => Math.max(bucket.total - bucket.missing, 0)
const submitted = computed(() => submittedOf(period.value))
const submitRate = computed(() => period.value.total ? submitted.value / period.value.total : 0)

const STATE_TEXT: Record<PeriodState, string> = {
  published: '已公开',
  approved: '待公开',
  pending: '待审核',
  rejected: '未通过',
  draft: '编辑中',
  missing: '未报送'
}

// el-table 的行类型为 DefaultRow，这里按需读取字段
function stateText(row: any) {
  if (row.rawState === 'pending_town') return '待镇级审核'
  if (row.rawState === 'pending_county') return '待县级审核'
  return STATE_TEXT[row.state as PeriodState]
}

const pct = (value: number) => `${Math.round((Number.isFinite(value) ? value : 0) * 100)}%`

function monthLabelOf(value: string) {
  const [year, mon] = value.split('-')
  return `${year}年${Number(mon)}月`
}

const runningMonth = computed(() => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
})

const monthLabel = computed(() => monthLabelOf(month.value || data.value?.month || '2026-11'))

function formatTime(value: string | null) {
  if (!value) return '—'
  const text = String(value).replace('T', ' ')
  return text.slice(5, 16)
}

/** 单元格符号：已报齐 = 绿色 ✓；未报齐 = 弱化的灰色 ✕，降低大面积红色带来的视觉压迫 */
function cellClass(point: { total: number, submitted: number, published: number }) {
  if (point.submitted < point.total) return 'cell-miss'
  return point.published >= point.total ? 'cell-done' : 'cell-wait'
}

function isMiss(point: { total: number, submitted: number }) {
  return point.submitted < point.total
}

/** 每行右侧一句话结论：缺几个月 / 已全部报齐 */
function rowSummary(history: MatrixCell[]) {
  const missMonths = history.filter(isMiss).length
  return { missMonths, text: missMonths ? `缺 ${missMonths} 月` : '齐全' }
}

const totalSummary = computed(() => rowSummary(
  monthly.value.map((point) => ({ ...point, submitted: submittedOf(point) }) as MatrixCell)
))

function cellTip(label: string, point: MatrixCell) {
  const parts = [`应报 ${point.total}`, `已报 ${point.submitted}`]
  if (point.missing) parts.push(`未报 ${point.missing}`)
  if (point.pending) parts.push(`待审核 ${point.pending}`)
  if (point.rejected) parts.push(`未通过 ${point.rejected}`)
  if (point.draft) parts.push(`编辑中 ${point.draft}`)
  if (point.approved) parts.push(`待公开 ${point.approved}`)
  if (point.published) parts.push(`已公开 ${point.published}`)
  return `${label} ${monthLabelOf(point.month)}：${parts.join('，')}`
}

const delta = computed(() => {
  const prev = data.value?.previous
  if (!prev) return null
  return submitted.value - submittedOf(prev)
})

const townPending = computed(() => rows.value.filter((row) => row.rawState === 'pending_town').length)
const countyPending = computed(() => rows.value.filter((row) => row.rawState === 'pending_county').length)

const backlog = computed(() => {
  const rank: Record<PeriodState, number> = { missing: 0, rejected: 1, pending: 2, draft: 3, approved: 4, published: 5 }
  return rows.value
    .filter((row) => row.state !== 'published')
    .sort((a, b) => rank[a.state] - rank[b.state] || townshipRank(a.township) - townshipRank(b.township) || a.name.localeCompare(b.name, 'zh-Hans-CN'))
})

/** 待办每组最多展示 8 条，剩余引导到明细表，避免单一分组把其它分组挤出可视区 */
const GROUP_LIMIT = 8

const todoGroups = computed(() => {
  const groups: { key: string, label: string, filter: 'all' | PeriodState, items: VenueRow[] }[] = [
    { key: 'missing', label: '未报送', filter: 'missing', items: backlog.value.filter((row) => row.state === 'missing') },
    { key: 'pending', label: '待审核', filter: 'pending', items: backlog.value.filter((row) => row.state === 'pending') },
    { key: 'rejected', label: '审核未通过', filter: 'rejected', items: backlog.value.filter((row) => row.state === 'rejected') },
    { key: 'active', label: '编辑中 / 待公开', filter: 'all', items: backlog.value.filter((row) => row.state === 'draft' || row.state === 'approved') }
  ]
  return groups
    .filter((group) => group.items.length)
    .map((group) => ({ ...group, shown: group.items.slice(0, GROUP_LIMIT), rest: Math.max(group.items.length - GROUP_LIMIT, 0) }))
})

/** 近 12 个月报送率走势与均值 */
const trend = computed(() => {
  const points = monthly.value.map((point) => ({
    ...point,
    rate: point.total ? submittedOf(point) / point.total : 0
  }))
  const average = points.length ? points.reduce((sum, point) => sum + point.rate, 0) / points.length : 0
  const best = points.reduce<(typeof points)[number] | null>((top, point) => (!top || point.rate > top.rate ? point : top), null)
  return { points, average, best }
})

const infoRows = computed(() => {
  const total = data.value?.venueTotal ?? 0
  const info = data.value?.info
  const rows = [
    { key: 'profiles', label: '场所介绍', to: '/profiles', ...(info?.profiles ?? { published: 0, pending: 0 }) },
    { key: 'personnel', label: '人员信息', to: '/personnel', ...(info?.personnel ?? { published: 0, pending: 0 }) },
    { key: 'safety', label: '安全公开', to: '/safety', ...(info?.safety ?? { published: 0, pending: 0 }) }
  ]
  return rows.map((row) => ({ ...row, total, ratio: total ? row.published / total : 0 }))
})

const tableFilters = computed(() => {
  const count = (state: PeriodState) => rows.value.filter((row) => row.state === state).length
  return [
    { key: 'all' as const, label: '全部', count: rows.value.length },
    { key: 'missing' as const, label: '未报送', count: count('missing') },
    { key: 'pending' as const, label: '待审核', count: count('pending') },
    { key: 'rejected' as const, label: '未通过', count: count('rejected') },
    { key: 'published' as const, label: '已公开', count: count('published') }
  ]
})

const tableRows = computed(() => tableFilter.value === 'all'
  ? rows.value
  : rows.value.filter((row) => row.state === tableFilter.value))

function focusTable(state: 'all' | PeriodState) {
  tableFilter.value = state
  void nextTick(() => document.getElementById('venue-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

const CIRC = 2 * Math.PI * 42
const dash = computed(() => {
  const ratio = Math.max(0, Math.min(1, submitRate.value))
  // 0% 时保留一个端点，避免进度环看起来像渲染失败
  return Math.max(ratio * CIRC, 2)
})

function outsideRange(date: Date) {
  if (!months.value.length) return false
  const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  return !months.value.includes(value)
}

async function load(silent = false) {
  if (silent) refreshing.value = true
  else loading.value = true
  try {
    const response = await $fetch<Payload>('/api/admin/dashboard', { query: month.value ? { month: month.value } : {} })
    data.value = response
    month.value = response.month
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function changeMonth(value: string | null) {
  if (!value || value === month.value) return
  month.value = value
  tableFilter.value = 'all'
  void load(true)
}

function gotoFinance(row: any) {
  return navigateTo(`/finance?venueId=${row.id}&month=${month.value}`)
}

const heatScroll = ref<HTMLElement>()

/** 窄屏时把统计月份滚到可视区域中间，避免默认停在最早月份 */
function scrollToMonth() {
  const box = heatScroll.value
  if (!box) return
  if (box.clientWidth > 520) { box.scrollLeft = 0; return }
  if (box.scrollWidth <= box.clientWidth + 4) return
  const target = box.querySelector<HTMLElement>(`[data-month="${month.value}"]`)
  if (!target) return
  box.scrollTo({ left: Math.max(target.offsetLeft - box.clientWidth / 2 + target.offsetWidth / 2, 0), behavior: 'smooth' })
}

onMounted(() => { void load() })
watch(() => [month.value, months.value.length], () => { void nextTick(() => scrollToMonth()) })
</script>

<template>
  <div class="page dash" v-loading="loading">
    <header class="head">
      <div class="head-copy">
        <h1>公开报送总览</h1>
        <p class="head-sub">
          {{ venueMode ? '本场所' : `${data?.townshipTotal ?? 0} 个镇级 · ${data?.venueTotal ?? 0} 个场所` }}
          <span class="sep">·</span>{{ monthLabel }}
          <NuxtLink v-if="data?.unread" class="notice-link" to="/my-notices">{{ data.unread }} 条未读通知</NuxtLink>
        </p>
      </div>
      <div class="head-actions">
        <el-date-picker
          :model-value="month"
          type="month"
          value-format="YYYY-MM"
          :clearable="false"
          :disabled-date="outsideRange"
          aria-label="统计月份"
          @update:model-value="changeMonth"
        />
        <el-button :icon="Refresh" :loading="refreshing" @click="load()">刷新</el-button>
      </div>
    </header>

    <section class="kpis" aria-label="本期关键指标">
      <article class="kpi hero">
        <div class="ring" role="img" :aria-label="`报送率 ${pct(submitRate)}`">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle class="ring-track" cx="50" cy="50" r="42" />
            <circle class="ring-value" cx="50" cy="50" r="42" :stroke-dasharray="`${dash} ${CIRC}`" />
          </svg>
          <span class="ring-num">{{ pct(submitRate) }}</span>
        </div>
        <div class="kpi-copy">
          <span class="kpi-label">本期已报送</span>
          <span class="kpi-line">
            <span class="kpi-value">{{ submitted }}<small>/ {{ period.total }}</small></span>
            <span v-if="delta !== null" class="delta-pill" :class="{ down: delta < 0, up: delta > 0 }">
              {{ delta === 0 ? '与上月持平' : `${delta > 0 ? '+' : ''}${delta} 家` }}
            </span>
          </span>
        </div>
      </article>

      <button type="button" class="kpi" @click="focusTable('missing')">
        <span class="kpi-icon is-red" aria-hidden="true"><el-icon><CircleCloseFilled /></el-icon></span>
        <span class="kpi-copy">
          <span class="kpi-label">未报送</span>
          <span class="kpi-line"><span class="kpi-value">{{ period.missing }}</span></span>
        </span>
      </button>

      <button type="button" class="kpi" @click="focusTable('pending')">
        <span class="kpi-icon is-amber" aria-hidden="true"><el-icon><Clock /></el-icon></span>
        <span class="kpi-copy">
          <span class="kpi-label">待审核</span>
          <span class="kpi-line">
            <span class="kpi-value">{{ period.pending }}</span>
            <span class="kpi-foot">镇 {{ townPending }} · 县 {{ countyPending }}</span>
          </span>
        </span>
      </button>

      <button type="button" class="kpi" @click="focusTable('rejected')">
        <span class="kpi-icon is-rose" aria-hidden="true"><el-icon><WarningFilled /></el-icon></span>
        <span class="kpi-copy">
          <span class="kpi-label">审核未通过</span>
          <span class="kpi-line"><span class="kpi-value">{{ period.rejected }}</span></span>
        </span>
      </button>

      <div class="kpi">
        <span class="kpi-icon is-blue" aria-hidden="true"><el-icon><OfficeBuilding /></el-icon></span>
        <span class="kpi-copy">
          <span class="kpi-label">应报场所</span>
          <span class="kpi-line"><span class="kpi-value">{{ period.total }}</span></span>
        </span>
      </div>
    </section>

    <div class="split split-wide">
      <section class="card heat-card" aria-labelledby="heat-title">
        <header class="card-head">
          <h2 id="heat-title">
            {{ venueMode ? '近 12 个月报送记录' : townshipMode ? '镇级报送情况' : '场所报送情况' }}
          </h2>
          <ul v-if="!venueMode" class="legend">
            <li><i class="cell-done" aria-hidden="true">✓</i>报齐已公开</li>
            <li><i class="cell-wait" aria-hidden="true">✓</i>报齐待审核</li>
            <li><i class="cell-miss" aria-hidden="true">✕</i>有未报送</li>
          </ul>
        </header>

        <div v-if="venueMode" class="timeline">
          <div
            v-for="point in data?.selfHistory ?? []"
            :key="point.month"
            class="timeline-item"
            :class="[point.state, { on: point.month === month }]"
          >
            <span class="timeline-month">{{ point.month.slice(0, 4) }}年{{ Number(point.month.slice(5)) }}月</span>
            <span class="timeline-state">{{ STATE_TEXT[point.state] }}</span>
          </div>
        </div>

        <div v-else class="heat-board">
          <div ref="heatScroll" class="heat-scroll">
            <div
              class="heat-grid"
              :style="{ '--cols': months.length, '--label': townshipMode ? '104px' : '168px' }"
            >
              <div class="heat-row is-head">
                <div class="heat-name is-head">{{ townshipMode ? '镇级' : '场所' }}</div>
                <div
                  v-for="point in months"
                  :key="point"
                  :data-month="point"
                  class="heat-month"
                  :class="{ on: point === month, running: point === runningMonth }"
                >
                  {{ Number(point.slice(5)) }}月
                </div>
                <div class="heat-sum is-head">缺报</div>
              </div>

              <div v-for="row in matrix.rows" :key="row.key" class="heat-row">
                <div class="heat-name" :title="townshipMode ? `${row.label} · 应报 ${row.hint} 个场所` : row.label">
                  <span>{{ row.label }}</span><em v-if="row.hint">{{ row.hint }}</em>
                </div>
                <button
                  v-for="point in row.history"
                  :key="`${row.key}-${point.month}`"
                  type="button"
                  class="heat-cell"
                  :class="cellClass(point)"
                  :title="cellTip(row.label, point)"
                  :aria-label="`${row.label} ${monthLabelOf(point.month)}：${isMiss(point) ? '有场所未报送' : '已全部报送'}，应报 ${point.total} 个，已报 ${point.submitted} 个`"
                  @click="changeMonth(point.month)"
                >{{ isMiss(point) ? '✕' : '✓' }}</button>
                <div class="heat-sum" :class="{ bad: rowSummary(row.history).missMonths }">
                  {{ rowSummary(row.history).text }}
                </div>
              </div>

              <div class="heat-row is-total">
                <div class="heat-name is-total">全辖区<small>当月未报</small></div>
                <button
                  v-for="point in monthly"
                  :key="`total-${point.month}`"
                  type="button"
                  class="heat-cell is-total"
                  :class="cellClass({ total: point.total, submitted: submittedOf(point), published: point.published })"
                  :title="`全辖区 ${monthLabelOf(point.month)}：应报 ${point.total}，已报 ${submittedOf(point)}，未报 ${point.missing}`"
                  @click="changeMonth(point.month)"
                >
                  <template v-if="point.missing">{{ point.missing }}</template>
                  <template v-else>—</template>
                </button>
                <div class="heat-sum is-total" :class="{ bad: totalSummary.missMonths }">
                  {{ totalSummary.text }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="card todo-card" aria-labelledby="todo-title">
        <header class="card-head">
          <h2 id="todo-title">本期待办</h2>
          <span class="count-pill">{{ backlog.length }}</span>
        </header>

        <div v-if="backlog.length" class="todo-scroll">
          <section v-for="group in todoGroups" :key="group.key" class="todo-group">
            <h3 class="todo-group-title">{{ group.label }}<em>{{ group.items.length }}</em></h3>
            <ul class="todo-list">
              <li v-for="row in group.shown" :key="row.id">
                <NuxtLink class="todo-item" :to="`/finance?venueId=${row.id}&month=${month}`">
                  <span class="todo-main">
                    <strong>{{ row.name }}</strong>
                    <small>{{ row.township }}<template v-if="row.submittedAt"> · {{ formatTime(row.submittedAt) }} 提交</template></small>
                  </span>
                  <span class="chip" :class="row.state">{{ stateText(row) }}</span>
                </NuxtLink>
              </li>
            </ul>
            <button v-if="group.rest" type="button" class="todo-more" @click="focusTable(group.filter)">
              查看其余 {{ group.rest }} 个场所 →
            </button>
          </section>
        </div>
        <div v-else class="todo-done">
          <strong>本期全部完成</strong>
          <p>{{ monthLabel }} 的 {{ period.total }} 个场所均已公开财务数据。</p>
        </div>
      </section>
    </div>

    <div class="split split-even" :class="{ 'is-single': venueMode }">
      <section v-if="!venueMode" class="card" aria-labelledby="trend-title">
        <header class="card-head">
          <h2 id="trend-title">报送率走势 · 近 12 个月</h2>
          <span class="avg-pill">均值 {{ pct(trend.average) }}</span>
        </header>
        <div class="trend" :style="{ '--avg-line': `${Math.min(1, trend.average) * 122}px` }">
          <div
            v-for="point in trend.points"
            :key="point.month"
            class="trend-col"
            :class="{ on: point.month === month }"
            :title="`${monthLabelOf(point.month)}：已报 ${submittedOf(point)} / ${point.total} 个场所，已公开 ${point.published} 个`"
          >
            <span class="trend-val">{{ Math.round(point.rate * 100) }}</span>
            <span class="trend-track">
              <i :class="{ zero: !submittedOf(point) }" :style="{ height: `${Math.max(point.rate * 100, submittedOf(point) ? 4 : 0)}%` }" />
            </span>
            <span class="trend-month">{{ Number(point.month.slice(5)) }}月</span>
          </div>
        </div>
      </section>

      <section class="card" aria-labelledby="info-title">
        <header class="card-head">
          <h2 id="info-title">基础信息公开</h2>
        </header>
        <ul class="info-list">
          <li v-for="item in infoRows" :key="item.key">
            <NuxtLink :to="item.to">
              <span class="info-name">{{ item.label }}</span>
              <span class="info-bar"><i :style="{ width: `${Math.max(item.ratio * 100, item.published ? 4 : 0)}%` }" /></span>
              <span class="info-val">{{ item.published }}/{{ item.total }}</span>
              <span class="info-pending" :class="{ zero: !item.pending }">{{ item.pending ? `${item.pending} 待审` : '已完成' }}</span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </div>

    <section id="venue-detail" class="card" aria-labelledby="detail-title">
      <header class="card-head">
        <h2 id="detail-title">场所明细 <small>{{ monthLabel }}</small></h2>
        <div class="filters" role="group" aria-label="按状态筛选">
          <button
            v-for="filter in tableFilters"
            :key="filter.key"
            type="button"
            :class="{ active: tableFilter === filter.key }"
            @click="tableFilter = filter.key"
          >
            {{ filter.label }}<em>{{ filter.count }}</em>
          </button>
        </div>
      </header>
      <div class="table-region table-scroll" tabindex="0" role="region" aria-label="场所本期公开状态">
        <el-table :data="tableRows" row-key="id">
          <el-table-column prop="name" label="场所" min-width="180" show-overflow-tooltip />
          <el-table-column prop="township" label="镇级" width="140" />
          <el-table-column label="本期状态" width="150">
            <template #default="{ row }"><span class="chip" :class="row.state">{{ stateText(row) }}</span></template>
          </el-table-column>
          <el-table-column label="提交时间" width="160">
            <template #default="{ row }">{{ row.submittedAt ? formatTime(row.submittedAt) : '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="130" align="right">
            <template #default="{ row }">
              <el-button size="small" plain @click="gotoFinance(row)">{{ row.state === 'missing' ? '去补录' : '查看账单' }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dash { --card-pad: 26px; display: grid; gap: 18px; min-width: 0; }
.dash > * { min-width: 0; }

/* ---------- 顶部 ---------- */
.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap; padding-block: 4px 2px; }
.head h1 { margin: 0; font-size: clamp(24px, 2vw, 29px); font-weight: 700; letter-spacing: 1.5px; color: #101828; }
.head-sub { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 7px 0 0; color: #98a2b3; font-size: 13px; }
.sep { color: #d0d5dd; }
.notice-link { padding: 2px 10px; border-radius: 999px; background: #fffaeb; border: 1px solid #fedf89; color: #b54708; font-size: 12px; }
.notice-link:hover { background: #fef0c7; }
.head-actions { display: flex; align-items: center; gap: 10px; }
.head-actions :deep(.el-date-editor) { width: 142px; }
.head-actions .el-button { margin: 0; }

/* ---------- KPI ---------- */
/* 横向排布：图标 | 标签+数值，整体高度压到 78px 左右 */
.kpis { display: grid; grid-template-columns: 1.7fr repeat(4, minmax(0, 1fr)); gap: 12px; }
.kpi {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  min-height: 78px;
  padding: 12px 16px;
  border: 1px solid #e9edf3;
  border-radius: 14px;
  background: #fff;
  text-align: start;
  font: inherit;
  cursor: default;
  box-shadow: 0 1px 4px rgb(16 24 40 / 3%);
  transition: border-color .18s, box-shadow .18s;
}
button.kpi { cursor: pointer; }
button.kpi:hover, button.kpi:focus-visible { border-color: #c2d3e8; box-shadow: 0 4px 14px rgb(16 24 40 / 8%); }
.kpi-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  font-size: 16px;
}
.kpi-icon.is-red { background: #fef1f0; color: #d92d20; }
.kpi-icon.is-amber { background: #fff4e2; color: #dc6803; }
.kpi-icon.is-rose { background: #fdeef4; color: #c0357b; }
.kpi-icon.is-blue { background: #eef4fc; color: #17549c; }
.kpi-copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.kpi-label { color: #667085; font-size: 12.5px; line-height: 1.3; }
.kpi-line { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
.kpi-value { color: #101828; font-size: 24px; font-weight: 700; line-height: 1.2; font-variant-numeric: tabular-nums; }
.kpi-value small { margin-inline-start: 3px; color: #98a2b3; font-size: 12.5px; font-weight: 500; }
.kpi-foot { color: #98a2b3; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.kpi.hero {
  gap: 14px;
  padding: 12px 18px;
  border: 0;
  color: #fff;
  background: radial-gradient(130% 190% at 100% 0%, #2178c4 0%, #17549c 48%, #0d3f74 100%);
  box-shadow: 0 10px 24px rgb(13 63 116 / 20%);
}
.kpi.hero .kpi-line { align-items: center; gap: 10px; }
.kpi.hero .kpi-label { color: rgb(255 255 255 / 72%); }
.kpi.hero .kpi-value { color: #fff; font-size: 26px; }
.kpi.hero .kpi-value small { color: rgb(255 255 255 / 62%); font-size: 13px; }
.delta-pill {
  display: inline-flex;
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgb(255 255 255 / 14%);
  color: rgb(255 255 255 / 86%);
  font-size: 11px;
  white-space: nowrap;
}
.delta-pill.up { background: rgb(134 239 172 / 22%); color: #bbf7d0; }
.delta-pill.down { background: rgb(254 202 202 / 22%); color: #fecaca; }
.ring { position: relative; flex: none; width: 54px; height: 54px; }
.ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.ring circle { fill: none; stroke-width: 9; }
.ring-track { stroke: rgb(255 255 255 / 18%); }
.ring-value { stroke: #fff; stroke-linecap: round; transition: stroke-dasharray .5s ease; }
.ring-num { position: absolute; inset: 0; display: grid; place-items: center; font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }

/* ---------- 通用卡片 ---------- */
.split { display: grid; gap: 18px; align-items: start; }
.split-wide { grid-template-columns: minmax(0, 1.72fr) minmax(320px, 0.9fr); }
.split-even { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.split-even.is-single { grid-template-columns: minmax(0, 1fr); }

.card {
  padding: var(--card-pad);
  border: 1px solid #e9edf3;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 1px 4px rgb(16 24 40 / 3%);
}
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-block-end: 18px; flex-wrap: wrap; }
.card-head h2 { margin: 0; color: #101828; font-size: 16.5px; font-weight: 700; letter-spacing: .4px; }
.card-head h2 small { margin-inline-start: 8px; color: #98a2b3; font-size: 12.5px; font-weight: 500; }
.count-pill { flex: none; min-width: 32px; padding: 3px 10px; border-radius: 999px; background: #fef1f0; color: #d92d20; font-size: 13px; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums; }

.legend { display: flex; align-items: center; gap: 12px; flex: none; margin: 0; padding: 0; list-style: none; color: #667085; font-size: 12px; }
.legend li { display: flex; align-items: center; gap: 5px; }
.legend i { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 5px; font-size: 11px; font-style: normal; font-weight: 700; }

/* ---------- 报送矩阵 ---------- */
/* 设计原则：大面积保持浅灰绿底，只有信息（✓/✕）有对比度；去渐变、去阴影、去悬浮放大，消除“按钮墙”感 */
.heat-board { display: block; }
.heat-scroll { overflow-x: auto; padding-block-end: 2px; }
.heat-grid {
  display: grid;
  row-gap: 3px;
  width: 100%;
  min-width: calc(var(--label, 104px) + var(--cols, 12) * 34px + (var(--cols, 12) - 1) * 7px + 66px);
}
.heat-row {
  display: grid;
  grid-template-columns: var(--label, 104px) repeat(var(--cols, 12), minmax(34px, 1fr)) 60px;
  align-items: center;
  column-gap: 7px;
  padding-block: 2px;
  border-radius: 8px;
  transition: background-color .15s;
}
.heat-row.is-head { padding-block-end: 6px; }
.heat-row.is-total { margin-block-start: 4px; padding-block-start: 6px; border-block-start: 1px solid #f0f2f6; border-radius: 0; }
.heat-row:not(.is-head):hover { background: #f7f9fc; }
.heat-row:not(.is-head):hover .heat-name { background: #f7f9fc; }

.heat-name {
  position: sticky;
  inset-inline-start: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 100%;
  padding-inline-end: 8px;
  background: #fff;
  color: #344054;
  font-size: 13px;
  font-weight: 500;
  transition: background-color .15s;
}
.heat-name.is-head { color: #98a2b3; font-size: 11.5px; letter-spacing: .3px; }
.heat-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.heat-name em { flex: none; padding-inline: 5px; border-radius: 5px; background: #f2f4f7; color: #98a2b3; font-size: 10.5px; font-style: normal; font-variant-numeric: tabular-nums; }
.heat-name.is-total { color: #101828; font-weight: 700; }
.heat-name.is-total small { margin-inline-start: 4px; color: #b6c0cd; font-size: 10.5px; font-weight: 500; }

.heat-month { color: #98a2b3; font-size: 12px; text-align: center; font-variant-numeric: tabular-nums; }
.heat-month.running { color: #b6c0cd; }
.heat-month.on { color: #0d3f74; font-weight: 700; box-shadow: 0 2.5px 0 0 #17549c; }

.heat-cell {
  height: 30px;
  border: 0;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: filter .15s ease;
}
.heat-cell:hover { filter: brightness(.965); }
.heat-cell:focus-visible { outline: 2px solid #17549c; outline-offset: 1px; }
.heat-cell.is-total { font-size: 12px; font-variant-numeric: tabular-nums; }

/* 已报齐：绿色 ✓；未报齐：弱化成浅灰 ✕，不再用红色块 */
.cell-done { background: #e6f3ec; color: #12805c; }
.cell-wait { background: #f0f7f3; color: #8bbfa3; }
.cell-miss { background: #f2f4f7; color: #c4cad3; }
/* 全辖区行保留“当月未报数”，用浅红文字提示数量，不占大面积色块 */
.heat-row.is-total .cell-miss { background: #fdf4f2; color: #c0564f; font-weight: 600; }

.heat-sum {
  padding-inline-end: 2px;
  color: #98a2b3;
  font-size: 11.5px;
  text-align: end;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.heat-sum.is-head { font-size: 11px; letter-spacing: .3px; }
.heat-sum.bad { color: #b42318; font-weight: 600; }

/* ---------- 场所角色时间线 ---------- */
.timeline { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; }
.timeline-item { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid #e9edf3; border-radius: 10px; background: #fbfcfe; }
.timeline-item.on { border-color: #17549c; box-shadow: inset 0 0 0 1px #17549c; }
.timeline-month { color: #667085; font-size: 12px; font-variant-numeric: tabular-nums; }
.timeline-state { color: #344054; font-size: 13px; font-weight: 600; }
.timeline-item.published .timeline-state { color: #067647; }
.timeline-item.pending .timeline-state { color: #b54708; }
.timeline-item.rejected .timeline-state,
.timeline-item.missing .timeline-state { color: #b42318; }
.timeline-item.missing { background: #fdf7f6; }

/* ---------- 本期待办 ---------- */
.todo-card { position: relative; }
.todo-card::after {
  content: "";
  position: absolute;
  inset-inline: 0;
  inset-block-end: 0;
  height: 56px;
  border-end-start-radius: 18px;
  border-end-end-radius: 18px;
  background: linear-gradient(180deg, rgb(255 255 255 / 0%) 0%, #fff 78%);
  pointer-events: none;
}
.todo-scroll { max-height: 604px; overflow-y: auto; margin-inline-end: -8px; padding-block-end: 36px; padding-inline-end: 8px; }
.todo-group + .todo-group { margin-block-start: 14px; }
.todo-group-title { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; color: #667085; font-size: 12px; font-weight: 600; letter-spacing: .4px; }
.todo-group-title em { padding: 0 5px; border-radius: 4px; background: #f2f4f7; color: #667085; font-style: normal; font-variant-numeric: tabular-nums; }
.todo-list { margin: 0; padding: 0; list-style: none; }
.todo-more { margin-block-start: 2px; padding: 4px 8px; border: 0; background: none; color: #17549c; font-size: 12px; cursor: pointer; }
.todo-more:hover { text-decoration: underline; }
.todo-more:focus-visible { outline: 2px solid #84adff; outline-offset: 1px; }
.todo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 48px;
  padding: 8px 10px;
  border-radius: 10px;
  transition: background-color .16s;
}
.todo-item:hover { background: #f6f9fd; }
.todo-item:focus-visible { outline: 2px solid #84adff; outline-offset: -2px; }
.todo-main { min-width: 0; }
.todo-main strong { display: block; color: #1f2937; font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-main small { display: block; color: #98a2b3; font-size: 11.5px; }
.todo-done { padding: 40px 12px; text-align: center; }
.todo-done strong { color: #067647; font-size: 14px; }
.todo-done p { margin: 6px 0 0; color: #98a2b3; font-size: 12.5px; }

.chip {
  display: inline-flex;
  align-items: center;
  flex: none;
  padding: 1px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.7;
  white-space: nowrap;
}
.chip.published { color: #05603a; background: #ecfdf3; border-color: #a6f4c5; }
.chip.approved { color: #175cd3; background: #eff8ff; border-color: #b2ddff; }
.chip.pending { color: #b54708; background: #fffaeb; border-color: #fedf89; }
.chip.rejected { color: #b42318; background: #fef3f2; border-color: #fecdca; }
.chip.draft { color: #475467; background: #f8f9fc; border-color: #e4e7ec; }
.chip.missing { color: #b42318; background: #fff; border-color: #fecdca; border-style: dashed; }

/* ---------- 走势 ---------- */
.avg-pill { flex: none; padding: 3px 10px; border-radius: 999px; background: #eef4fc; color: #17549c; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
.trend { position: relative; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 7px; }
.trend::after { content: ""; position: absolute; inset-inline: 0; bottom: calc(20px + var(--avg-line, 0px)); border-block-start: 1px dashed #a9bdd4; pointer-events: none; }
.trend-col { display: flex; flex-direction: column; align-items: center; gap: 7px; }
.trend-val { color: #98a2b3; font-size: 11px; font-variant-numeric: tabular-nums; }
.trend-track { display: flex; align-items: flex-end; width: 100%; height: 122px; padding-inline: 18%; border-block-end: 1px solid #e9edf3; }
.trend-track i { width: 100%; border-radius: 5px 5px 0 0; background: linear-gradient(180deg, #4a86c8 0%, #17549c 100%); transition: height .4s ease; }
.trend-track i.zero { background: #dfe4ec; }
.trend-month { color: #98a2b3; font-size: 11px; font-variant-numeric: tabular-nums; }
.trend-col.on .trend-val { color: #17549c; font-weight: 700; }
.trend-col.on .trend-month { color: #17549c; font-weight: 600; }

/* ---------- 基础信息公开 ---------- */
.info-list { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.info-list a { display: grid; grid-template-columns: 76px minmax(0, 1fr) 52px 58px; align-items: center; gap: 12px; min-height: 46px; padding: 4px 8px; border-radius: 10px; transition: background-color .16s; }
.info-list a:hover { background: #f6f9fd; }
.info-list a:focus-visible { outline: 2px solid #84adff; outline-offset: -2px; }
.info-name { color: #344054; font-size: 13px; font-weight: 500; }
.info-bar { height: 8px; border-radius: 999px; background: #f0f3f8; overflow: hidden; }
.info-bar i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #3c7cc0, #17549c); }
.info-val { color: #475467; font-size: 12px; text-align: end; font-variant-numeric: tabular-nums; }
.info-pending { padding: 2px 7px; border-radius: 6px; background: #fffaeb; color: #b54708; font-size: 11px; text-align: center; }
.info-pending.zero { background: #f2f4f7; color: #98a2b3; }

/* ---------- 明细 ---------- */
.filters { display: flex; flex-wrap: wrap; gap: 6px; }
.filters button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: 1px solid #e6eaf0;
  border-radius: 999px;
  background: #fff;
  color: #52606f;
  font-size: 12.5px;
  cursor: pointer;
  transition: border-color .16s, color .16s, background-color .16s;
}
.filters button:hover { border-color: #b9cce1; color: #17549c; }
.filters button.active { border-color: #17549c; background: #eef4fc; color: #17549c; font-weight: 650; }
.filters button em { padding: 0 4px; border-radius: 4px; background: #f2f4f7; color: #667085; font-style: normal; font-size: 11px; font-variant-numeric: tabular-nums; }
.filters button.active em { background: #dfeafa; color: #17549c; }
.filters button:focus-visible { outline: 2px solid #84adff; outline-offset: 1px; }

.table-scroll { max-height: 470px; overflow: auto; }
.table-region :deep(.el-table th.el-table__cell) { background: #f8fafc; color: #667085; font-weight: 600; }
.table-region :deep(.el-table td.el-table__cell) { color: #344054; }
.table-region :deep(.el-table .cell) { font-variant-numeric: tabular-nums; }

/* ---------- 响应式 ---------- */
@media (max-width: 1280px) {
  .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .kpi.hero { grid-column: span 2; }
  .split-wide { grid-template-columns: minmax(0, 1fr); }
  .todo-scroll { max-height: 420px; }
}
@media (max-width: 900px) {
  .split-even { grid-template-columns: minmax(0, 1fr); }
  .head { align-items: flex-start; }
}
@media (max-width: 720px) {
  .dash { --card-pad: 18px; gap: 12px; }
  .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .kpi { min-height: 68px; padding: 10px 12px; gap: 10px; }
  .kpi-icon { width: 28px; height: 28px; font-size: 15px; border-radius: 8px; }
  .kpi.hero { grid-column: span 2; padding: 12px 14px; }
  .kpi-value { font-size: 21px; }
  .kpi.hero .kpi-value { font-size: 22px; }
  .ring { width: 48px; height: 48px; }
  .ring-num { font-size: 12.5px; }
  .head-actions { width: 100%; }
  .head-actions :deep(.el-date-editor) { flex: 1; width: auto; }
  .info-list a { grid-template-columns: 64px minmax(0, 1fr) 46px; }
  .info-pending { display: none; }
}
</style>
