<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'

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

interface TownshipRow extends Bucket {
  township: string
  history: { month: string, published: number, pending: number, rejected: number, missing: number, coverage: number }[]
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
  townships: TownshipRow[]
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
const townships = computed(() => data.value?.townships ?? [])

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

/** 覆盖率配色：0 单独用告警色，其余为品牌蓝色阶 */
function tone(coverage: number) {
  if (coverage <= 0) return 'tone-0'
  if (coverage >= 1) return 'tone-5'
  if (coverage >= 0.8) return 'tone-4'
  if (coverage >= 0.6) return 'tone-3'
  if (coverage >= 0.3) return 'tone-2'
  return 'tone-1'
}

function cellTip(town: { township: string, total: number }, point: { month: string, published: number, pending: number, rejected: number, missing: number }) {
  const parts = [`已公开 ${point.published}/${town.total}`]
  if (point.pending) parts.push(`待审核 ${point.pending}`)
  if (point.rejected) parts.push(`未通过 ${point.rejected}`)
  if (point.missing) parts.push(`未报送 ${point.missing}`)
  return `${town.township} ${monthLabelOf(point.month)}：${parts.join('，')}`
}

function cellText(published: number, coverage: number) {
  if (published === 0) return '0'
  if (coverage >= 1) return '✓'
  return String(Math.round(coverage * 100))
}

const deltaText = computed(() => {
  const prev = data.value?.previous
  if (!prev) return '暂无上月对比'
  const diff = period.value.published - prev.published
  if (diff === 0) return `与上月持平（${prev.published} 个场所）`
  return `较上月${diff > 0 ? '增加' : '减少'} ${Math.abs(diff)} 个场所`
})

const townPending = computed(() => rows.value.filter((row) => row.rawState === 'pending_town').length)
const countyPending = computed(() => rows.value.filter((row) => row.rawState === 'pending_county').length)

const backlog = computed(() => {
  const rank: Record<PeriodState, number> = { missing: 0, rejected: 1, pending: 2, draft: 3, approved: 4, published: 5 }
  return rows.value
    .filter((row) => row.state !== 'published')
    .sort((a, b) => rank[a.state] - rank[b.state] || a.township.localeCompare(b.township, 'zh-Hans-CN') || a.name.localeCompare(b.name, 'zh-Hans-CN'))
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

/** 近 12 个月整体公开率走势与均值 */
const trend = computed(() => {
  const points = monthly.value
  const average = points.length ? points.reduce((sum, point) => sum + point.coverage, 0) / points.length : 0
  const best = points.reduce<Bucket | null>((top, point) => (!top || point.coverage > top.coverage ? point : top), null)
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
  const ratio = Math.max(0, Math.min(1, period.value.coverage))
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

onMounted(() => { void load() })
</script>

<template>
  <div class="page dash" v-loading="loading">
    <header class="head">
      <div class="head-copy">
        <p class="eyebrow">工作台 · 财务公开</p>
        <h1>公开报送总览</h1>
        <p class="head-sub">
          {{ venueMode ? '本场所' : `全县 ${data?.townshipTotal ?? 0} 个镇级 · ${data?.venueTotal ?? 0} 个场所` }}
          <span class="sep">·</span>
          统计月份 {{ monthLabel }}
          <NuxtLink v-if="data?.unread" class="notice-link" to="/my-notices">{{ data.unread }} 条未读通知</NuxtLink>
        </p>
      </div>
      <div class="head-actions">
        <label class="month-field">
          <span>统计月份</span>
          <el-date-picker
            :model-value="month"
            type="month"
            value-format="YYYY-MM"
            :clearable="false"
            :disabled-date="outsideRange"
            aria-label="统计月份"
            @update:model-value="changeMonth"
          />
        </label>
        <el-button :icon="Refresh" :loading="refreshing" @click="load()">刷新</el-button>
      </div>
    </header>

    <section class="kpis" aria-label="本期关键指标">
      <article class="kpi hero">
        <div class="ring">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle class="ring-track" cx="50" cy="50" r="42" />
            <circle class="ring-value" cx="50" cy="50" r="42" :stroke-dasharray="`${dash} ${CIRC}`" />
          </svg>
          <span class="ring-num">{{ pct(period.coverage) }}</span>
        </div>
        <div class="hero-copy">
          <p class="kpi-label">本期已公开</p>
          <p class="kpi-value">{{ period.published }}<small>/ {{ period.total }} 个场所</small></p>
          <p class="kpi-foot">{{ deltaText }}</p>
        </div>
      </article>

      <button type="button" class="kpi" @click="focusTable('missing')">
        <p class="kpi-label"><i class="dot dot-danger" aria-hidden="true" />未报送</p>
        <p class="kpi-value">{{ period.missing }}</p>
        <p class="kpi-foot">另有编辑中 {{ period.draft }} 个</p>
      </button>

      <button type="button" class="kpi" @click="focusTable('pending')">
        <p class="kpi-label"><i class="dot dot-warn" aria-hidden="true" />待审核</p>
        <p class="kpi-value">{{ period.pending }}</p>
        <p class="kpi-foot">镇级 {{ townPending }} · 县级 {{ countyPending }}</p>
      </button>

      <button type="button" class="kpi" @click="focusTable('rejected')">
        <p class="kpi-label"><i class="dot dot-danger" aria-hidden="true" />审核未通过</p>
        <p class="kpi-value">{{ period.rejected }}</p>
        <p class="kpi-foot">已通过待公开 {{ period.approved }} 个</p>
      </button>

      <div class="kpi">
        <p class="kpi-label"><i class="dot dot-brand" aria-hidden="true" />应报场所</p>
        <p class="kpi-value">{{ period.total }}</p>
        <p class="kpi-foot">涵盖 {{ data?.townshipTotal ?? 0 }} 个镇级</p>
      </div>
    </section>

    <div class="split split-wide">
      <section class="card heat-card" aria-labelledby="heat-title">
        <header class="card-head">
          <div class="card-title">
            <h2 id="heat-title">{{ venueMode ? '近 12 个月报送记录' : '镇级报送热力图' }}</h2>
            <p v-if="venueMode">每个月是否按时提交并完成公开</p>
            <p v-else>每格为该镇当月已公开场所占比，点击格子切换统计月份</p>
          </div>
          <ul v-if="!venueMode" class="legend" aria-hidden="true">
            <li><i class="tone-0" />0</li>
            <li><i class="tone-1" />低</li>
            <li><i class="tone-3" />中</li>
            <li><i class="tone-4" />高</li>
            <li><i class="tone-5" />全部</li>
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

        <div v-else class="heat-scroll">
          <div class="heat" :style="{ '--cols': months.length }">
            <div class="heat-head">镇级</div>
            <div v-for="point in months" :key="point" class="heat-month" :class="{ on: point === month, running: point === runningMonth }">
              {{ Number(point.slice(5)) }}月
            </div>

            <template v-for="town in townships" :key="town.township">
              <div class="heat-name" :title="`${town.township} · 应报 ${town.total} 个场所`">
                <span>{{ town.township }}</span><em>{{ town.total }}</em>
              </div>
              <button
                v-for="point in town.history"
                :key="point.month"
                type="button"
                class="heat-cell"
                :class="[tone(point.coverage), { on: point.month === month }]"
                :title="cellTip(town, point)"
                :aria-label="`${town.township} ${monthLabelOf(point.month)} 已公开 ${point.published} 个，应报 ${town.total} 个`"
                @click="changeMonth(point.month)"
              >
                {{ cellText(point.published, point.coverage) }}
              </button>
            </template>

            <div class="heat-name is-total">全辖区</div>
            <button
              v-for="point in monthly"
              :key="`total-${point.month}`"
              type="button"
              class="heat-cell is-total"
              :class="[tone(point.coverage), { on: point.month === month }]"
              :title="`全辖区 ${monthLabelOf(point.month)}：已公开 ${point.published} / ${point.total} 个场所`"
              @click="changeMonth(point.month)"
            >
              {{ cellText(point.published, point.coverage) }}
            </button>
          </div>
        </div>

        <p class="card-foot">
          <span v-if="!venueMode">单元格数值为公开率百分比（✓ 表示全部公开）。合计行的分母为全部 {{ data?.venueTotal ?? 0 }} 个场所；当月标注“进行中”，数据仍在报送。</span>
          <span v-else>统计范围：近 12 个月。灰色为未报送，橙色为审核中，红色为审核未通过。</span>
        </p>
      </section>

      <section class="card todo-card" aria-labelledby="todo-title">
        <header class="card-head">
          <div class="card-title">
            <h2 id="todo-title">本期待办</h2>
            <p>{{ monthLabel }} 尚未完成公开的场所</p>
          </div>
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
                    <small>
                      {{ row.township }}
                      <template v-if="row.submittedAt"> · {{ formatTime(row.submittedAt) }} 提交</template>
                    </small>
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
          <div class="card-title">
            <h2 id="trend-title">近 12 个月公开率走势</h2>
            <p>全辖区每月已公开场所占比</p>
          </div>
          <span class="avg-pill">均值 {{ pct(trend.average) }}</span>
        </header>
        <div class="trend" :style="{ '--avg-line': `${Math.min(1, trend.average) * 122}px` }">
          <div
            v-for="point in trend.points"
            :key="point.month"
            class="trend-col"
            :class="{ on: point.month === month }"
            :title="`${monthLabelOf(point.month)}：已公开 ${point.published} / ${point.total} 个场所`"
          >
            <span class="trend-val">{{ Math.round(point.coverage * 100) }}</span>
            <span class="trend-track">
              <i :class="{ zero: !point.published }" :style="{ height: `${Math.max(point.coverage * 100, point.published ? 4 : 0)}%` }" />
            </span>
            <span class="trend-month">{{ Number(point.month.slice(5)) }}月</span>
          </div>
        </div>
        <p class="card-foot">
          柱高为公开率，虚线为近 12 个月均值。
          <template v-if="trend.best">最高月份：{{ monthLabelOf(trend.best.month) }}（{{ pct(trend.best.coverage) }}）。</template>
        </p>
      </section>

      <section class="card" aria-labelledby="info-title">
        <header class="card-head">
          <div class="card-title">
            <h2 id="info-title">基础信息公开</h2>
            <p>场所介绍、人员信息与安全公开的发布进度</p>
          </div>
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
        <p class="card-foot">只统计已发布（公开）的场所信息，待审数据需在对应模块处理。</p>
      </section>
    </div>

    <section id="venue-detail" class="card" aria-labelledby="detail-title">
      <header class="card-head">
        <div class="card-title">
          <h2 id="detail-title">场所明细</h2>
          <p>{{ monthLabel }} · 共 {{ rows.length }} 个场所</p>
        </div>
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
.dash { --card-pad: 22px; display: grid; gap: 16px; min-width: 0; }
.dash > * { min-width: 0; }

.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap; padding-block-end: 2px; }
.eyebrow { margin: 0 0 6px; color: #8a94a6; font-size: 12px; letter-spacing: 1.6px; }
.head h1 { margin: 0; font-size: clamp(23px, 2vw, 28px); font-weight: 650; letter-spacing: 1px; color: #101828; }
.head-sub { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 8px 0 0; color: #667085; font-size: 13px; }
.sep { color: #d0d5dd; }
.notice-link { padding: 2px 9px; border-radius: 999px; background: #fffaeb; border: 1px solid #fedf89; color: #b54708; font-size: 12px; }
.notice-link:hover { background: #fef0c7; }
.head-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.month-field { display: inline-flex; align-items: center; gap: 8px; color: #667085; font-size: 13px; }
.month-field :deep(.el-date-editor) { width: 148px; }
.head-actions .el-button { margin: 0; }

.kpis { display: grid; grid-template-columns: 1.55fr repeat(4, minmax(0, 1fr)); gap: 14px; }
.kpi {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px 18px;
  border: 1px solid #e6eaf0;
  border-radius: 14px;
  background: #fff;
  text-align: start;
  font: inherit;
  cursor: default;
  transition: border-color .18s, box-shadow .18s, transform .18s;
}
button.kpi { cursor: pointer; }
button.kpi:hover, button.kpi:focus-visible { border-color: #b9cce1; box-shadow: 0 6px 18px rgb(16 24 40 / 7%); transform: translateY(-2px); }
.kpi-label { display: flex; align-items: center; gap: 6px; margin: 0; color: #667085; font-size: 13px; }
.kpi-value { margin: 4px 0 0; color: #101828; font-size: 30px; font-weight: 650; line-height: 1.15; font-variant-numeric: tabular-nums; }
.kpi-value small { margin-inline-start: 6px; color: #8a94a6; font-size: 13px; font-weight: 500; }
.kpi-foot { margin: 4px 0 0; color: #98a2b3; font-size: 12px; }
.dot { width: 7px; height: 7px; border-radius: 2px; flex: none; }
.dot-danger { background: #d92d20; }
.dot-warn { background: #dc6803; }
.dot-brand { background: #17549c; }

.kpi.hero {
  flex-direction: row;
  align-items: center;
  gap: 18px;
  border: 0;
  color: #fff;
  background: radial-gradient(120% 180% at 100% 0%, #2178c4 0%, #17549c 45%, #0d3f74 100%);
  box-shadow: 0 10px 26px rgb(13 63 116 / 22%);
}
.kpi.hero .kpi-label { color: rgb(255 255 255 / 76%); }
.kpi.hero .kpi-value { color: #fff; }
.kpi.hero .kpi-value small { color: rgb(255 255 255 / 66%); }
.kpi.hero .kpi-foot { color: rgb(255 255 255 / 64%); }
.hero-copy { min-width: 0; }
.ring { position: relative; flex: none; width: 86px; height: 86px; }
.ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.ring circle { fill: none; stroke-width: 8; }
.ring-track { stroke: rgb(255 255 255 / 18%); }
.ring-value { stroke: #fff; stroke-linecap: round; transition: stroke-dasharray .5s ease; }
.ring-num { position: absolute; inset: 0; display: grid; place-items: center; font-size: 20px; font-weight: 650; font-variant-numeric: tabular-nums; }

.split { display: grid; gap: 16px; align-items: start; }
.split-wide { grid-template-columns: minmax(0, 1.72fr) minmax(320px, 0.9fr); }
.split-even { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.split-even.is-single { grid-template-columns: minmax(0, 1fr); }

.card { padding: var(--card-pad); border: 1px solid #e6eaf0; border-radius: 16px; background: #fff; box-shadow: 0 2px 10px rgb(16 24 40 / 3%); }
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-block-end: 14px; flex-wrap: wrap; }
.card-title h2 { margin: 0; color: #101828; font-size: 15.5px; font-weight: 650; letter-spacing: .2px; }
.card-title p { margin: 4px 0 0; color: #8a94a6; font-size: 12px; }
.card-link { flex: none; color: #17549c; font-size: 12.5px; }
.card-link:hover { text-decoration: underline; }
.card-foot { margin: 12px 0 0; padding-block-start: 10px; border-block-start: 1px solid #f2f4f7; color: #98a2b3; font-size: 11.5px; line-height: 1.7; }
.count-pill { flex: none; min-width: 30px; padding: 2px 9px; border-radius: 999px; background: #fef3f2; color: #b42318; font-size: 12.5px; font-weight: 650; text-align: center; font-variant-numeric: tabular-nums; }

.legend { display: flex; align-items: center; gap: 10px; flex: none; margin: 0; padding: 0; list-style: none; color: #98a2b3; font-size: 11px; }
.legend li { display: flex; align-items: center; gap: 4px; }
.legend i { width: 12px; height: 12px; border-radius: 3px; }

.heat-scroll { min-width: 0; overflow-x: auto; padding-block-end: 2px; }
.heat {
  display: grid;
  grid-template-columns: 110px repeat(var(--cols, 12), minmax(44px, 1fr));
  gap: 5px;
  min-width: 660px;
  align-items: center;
}
.heat-head { color: #98a2b3; font-size: 11px; letter-spacing: .3px; }
.heat-month { padding-block-end: 2px; color: #8a94a6; font-size: 11.5px; text-align: center; font-variant-numeric: tabular-nums; }
.heat-month.running { color: #a6b0c0; }
.heat-month.on { color: #0d3f74; font-weight: 700; box-shadow: 0 2px 0 0 #17549c; }
.heat-name { display: flex; align-items: center; gap: 6px; min-width: 0; color: #344054; font-size: 12.5px; }
.heat-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.heat-name em { flex: none; padding-inline: 4px; border-radius: 4px; background: #f2f4f7; color: #8a94a6; font-size: 10.5px; font-style: normal; font-variant-numeric: tabular-nums; }
.heat-name.is-total { color: #101828; font-weight: 650; }

.heat-cell {
  height: 30px;
  border: 0;
  border-radius: 6px;
  background: #eef3f9;
  color: #2c4a68;
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: transform .14s, box-shadow .14s, filter .14s;
}
.heat-cell:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgb(16 24 40 / 16%); filter: brightness(1.04); }
.heat-cell:focus-visible { outline: 2px solid #17549c; outline-offset: 2px; }
.heat-cell.on { box-shadow: inset 0 0 0 1.5px #0b396c; }
.heat-cell.is-total { height: 32px; }
.heat-cell.total, .heat-cell.is-total { font-weight: 700; }

.tone-0 { background: #fdf1ef; color: #b42318; }
.tone-1 { background: #e7eefa; color: #3a5b7e; }
.tone-2 { background: #cbdef2; color: #2b4d6f; }
.tone-3 { background: #9dc3e5; color: #163a5c; }
.tone-4 { background: #4a86c8; color: #fff; }
.tone-5 { background: #17549c; color: #fff; }

.timeline { display: grid; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); gap: 8px; }
.timeline-item { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid #e6eaf0; border-radius: 10px; background: #fbfcfe; }
.timeline-item.on { border-color: #17549c; box-shadow: inset 0 0 0 1px #17549c; }
.timeline-month { color: #667085; font-size: 12px; font-variant-numeric: tabular-nums; }
.timeline-state { color: #344054; font-size: 13px; font-weight: 600; }
.timeline-item.published .timeline-state { color: #067647; }
.timeline-item.pending .timeline-state { color: #b54708; }
.timeline-item.rejected .timeline-state,
.timeline-item.missing .timeline-state { color: #b42318; }
.timeline-item.missing { background: #fdf7f6; }

.todo-scroll { max-height: 600px; overflow-y: auto; margin-inline-end: -6px; padding-inline-end: 6px; }
.todo-group + .todo-group { margin-block-start: 14px; }
.todo-group-title { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; color: #667085; font-size: 11.5px; font-weight: 600; letter-spacing: .4px; }
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
  min-height: 46px;
  padding: 8px 8px;
  border-radius: 9px;
  transition: background-color .16s;
}
.todo-item:hover { background: #f7fafd; }
.todo-item:focus-visible { outline: 2px solid #84adff; outline-offset: -2px; }
.todo-main { min-width: 0; }
.todo-main strong { display: block; color: #1f2937; font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-main small { display: block; color: #98a2b3; font-size: 11.5px; }
.todo-done { padding: 34px 12px; text-align: center; }
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

.avg-pill { flex: none; padding: 3px 10px; border-radius: 999px; background: #eef4fc; color: #17549c; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
.trend { position: relative; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 6px; margin-block-start: 4px; }
.trend::after { content: ""; position: absolute; inset-inline: 0; bottom: calc(20px + var(--avg-line, 0px)); border-block-start: 1px dashed #a9bdd4; pointer-events: none; }
.trend-col { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.trend-val { color: #98a2b3; font-size: 11px; font-variant-numeric: tabular-nums; }
.trend-track { display: flex; align-items: flex-end; width: 100%; height: 122px; padding-inline: 16%; border-block-end: 1px solid #e6eaf0; }
.trend-track i { width: 100%; border-radius: 4px 4px 0 0; background: linear-gradient(180deg, #4a86c8 0%, #17549c 100%); transition: height .4s ease; }
.trend-track i.zero { background: #dfe4ec; }
.trend-month { color: #98a2b3; font-size: 11px; font-variant-numeric: tabular-nums; }
.trend-col.on .trend-val { color: #17549c; font-weight: 700; }
.trend-col.on .trend-month { color: #17549c; font-weight: 600; }

.info-list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.info-list a { display: grid; grid-template-columns: 76px minmax(0, 1fr) 52px 58px; align-items: center; gap: 12px; min-height: 42px; padding: 4px 8px; border-radius: 9px; transition: background-color .16s; }
.info-list a:hover { background: #f7fafd; }
.info-list a:focus-visible { outline: 2px solid #84adff; outline-offset: -2px; }
.info-name { color: #344054; font-size: 13px; }
.info-bar { height: 7px; border-radius: 999px; background: #f0f3f8; overflow: hidden; }
.info-bar i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #3c7cc0, #17549c); }
.info-val { color: #475467; font-size: 12px; text-align: end; font-variant-numeric: tabular-nums; }
.info-pending { padding: 1px 7px; border-radius: 5px; background: #fffaeb; color: #b54708; font-size: 11px; text-align: center; }
.info-pending.zero { background: #f2f4f7; color: #98a2b3; }

.filters { display: flex; flex-wrap: wrap; gap: 6px; }
.filters button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border: 1px solid #e6eaf0;
  border-radius: 8px;
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
  .dash { --card-pad: 16px; gap: 12px; }
  .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .kpi { padding: 13px 14px; }
  .kpi.hero { grid-column: span 2; padding: 16px; }
  .kpi-value { font-size: 25px; }
  .head-actions { width: 100%; }
  .month-field { flex: 1; }
  .month-field :deep(.el-date-editor) { flex: 1; width: auto; }
  .info-list a { grid-template-columns: 64px minmax(0, 1fr) 46px; }
  .info-pending { display: none; }
}
</style>
