<script setup lang="ts">
import { ElMessage } from 'element-plus'

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
const month = ref('')
const data = ref<Payload | null>(null)
const tableFilter = ref<'all' | PeriodState>('all')

const roleCode = computed(() => data.value?.roleCode ?? admin.value?.roleCode ?? '')
const venueMode = computed(() => roleCode.value === 'venue')
const monthly = computed(() => data.value?.monthly ?? [])
const months = computed(() => data.value?.months ?? [])
const rows = computed(() => data.value?.rows ?? [])
const matrix = computed(() => data.value?.matrix ?? { level: 'township' as const, rows: [] as MatrixRow[] })
const townshipMode = computed(() => matrix.value.level === 'township')
/** 已上报 = 应报 − 未上报（含审核中、未通过、填报中） */
const submittedOf = (bucket: { total: number, missing: number }) => Math.max(bucket.total - bucket.missing, 0)

const STATE_TEXT: Record<PeriodState, string> = {
  published: '已公开',
  approved: '待公开',
  pending: '审核中',
  rejected: '未通过',
  draft: '填报中',
  missing: '未上报'
}

// el-table 的行类型为 DefaultRow，这里按需读取字段
function stateText(row: any) {
  if (row.rawState === 'pending_town') return '镇级审核中'
  if (row.rawState === 'pending_county') return '县级审核中'
  return STATE_TEXT[row.state as PeriodState]
}

const pct = (value: number) => `${Math.round((Number.isFinite(value) ? value : 0) * 100)}%`

function monthLabelOf(value: string) {
  const [year, mon] = value.split('-')
  return `${year}年${Number(mon)}月`
}

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

function cellTip(label: string, point: MatrixCell) {
  const parts = [`应报 ${point.total}`, `已报 ${point.submitted}`]
  if (point.missing) parts.push(`未报 ${point.missing}`)
  if (point.pending) parts.push(`审核中 ${point.pending}`)
  if (point.rejected) parts.push(`未通过 ${point.rejected}`)
  if (point.draft) parts.push(`填报中 ${point.draft}`)
  if (point.approved) parts.push(`待公开 ${point.approved}`)
  if (point.published) parts.push(`已公开 ${point.published}`)
  return `${label} ${monthLabelOf(point.month)}：${parts.join('，')}`
}

/** 近 12 个月上报率走势与均值 */
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
    { key: 'missing' as const, label: '未上报', count: count('missing') },
    { key: 'pending' as const, label: '审核中', count: count('pending') },
    { key: 'rejected' as const, label: '未通过', count: count('rejected') },
    { key: 'published' as const, label: '已公开', count: count('published') }
  ]
})

const tableRows = computed(() => tableFilter.value === 'all'
  ? rows.value
  : rows.value.filter((row) => row.state === tableFilter.value))

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    const response = await $fetch<Payload>('/api/admin/dashboard', { query: month.value ? { month: month.value } : {} })
    data.value = response
    month.value = response.month
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

function gotoFinance(row: any) {
  return navigateTo(`/finance?venueId=${row.id}&month=${month.value}`)
}

onMounted(() => { void load() })
</script>

<template>
  <div class="page dash" v-loading="loading">
    <section class="banner" aria-label="平台名称">
      <NuxtLink v-if="data?.unread && admin?.roleCode !== 'county'" class="notice-link" to="/my-notices">{{ data.unread }} 条未读通知</NuxtLink>
      <div class="banner-copy">
        <p class="banner-ornament" aria-hidden="true"><i /><span /><i /></p>
        <p class="banner-title">沂水宗教码上公开</p>
        <p class="banner-sub-title"><span>宗教活动场所信息公开管理系统</span></p>
      </div>
    </section>

    <div class="split split-wide is-single">
      <section class="card heat-card" aria-labelledby="heat-title">
        <header class="card-head">
          <h2 id="heat-title">
            {{ venueMode ? '近 12 个月上报记录' : townshipMode ? '镇级上报情况' : '场所上报情况' }}
          </h2>
          <ul v-if="!venueMode" class="legend">
            <li><i class="cell-done" aria-hidden="true">✓</i>报齐已公开</li>
            <li><i class="cell-wait" aria-hidden="true">✓</i>报齐审核中</li>
            <li><i class="cell-miss" aria-hidden="true">✕</i>有未上报</li>
          </ul>
        </header>

        <div v-if="venueMode" class="timeline">
          <div
            v-for="point in data?.selfHistory ?? []"
            :key="point.month"
            class="timeline-item"
            :class="point.state"
          >
            <span class="timeline-month">{{ point.month.slice(0, 4) }}年{{ Number(point.month.slice(5)) }}月</span>
            <span class="timeline-state">{{ STATE_TEXT[point.state] }}</span>
          </div>
        </div>

        <div v-else class="heat-board">
          <div class="heat-scroll">
            <div
              class="heat-grid"
              :style="{ '--cols': months.length, '--label': townshipMode ? '104px' : '168px' }"
            >
              <div class="heat-row is-head">
                <div class="heat-name is-head">{{ townshipMode ? '镇级' : '场所' }}</div>
                <div v-for="point in months" :key="point" class="heat-month">
                  {{ Number(point.slice(5)) }}月
                </div>
              </div>

              <div v-for="row in matrix.rows" :key="row.key" class="heat-row">
                <div class="heat-name" :title="townshipMode ? `${row.label} · 应报 ${row.hint} 个场所` : row.label">
                  <span>{{ row.label }}</span><em v-if="row.hint">{{ row.hint }}</em>
                </div>
                <div
                  v-for="point in row.history"
                  :key="`${row.key}-${point.month}`"
                  class="heat-cell"
                  :class="cellClass(point)"
                  role="img"
                  :title="cellTip(row.label, point)"
                  :aria-label="`${row.label} ${monthLabelOf(point.month)}：${isMiss(point) ? '有场所未上报' : '已全部上报'}，应报 ${point.total} 个，已报 ${point.submitted} 个`"
                >{{ isMiss(point) ? '✕' : '✓' }}</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div class="split split-even" :class="{ 'is-single': venueMode }">
      <section v-if="!venueMode" class="card" aria-labelledby="trend-title">
        <header class="card-head">
          <h2 id="trend-title">上报率走势 · 近 12 个月</h2>
          <span class="avg-pill">均值 {{ pct(trend.average) }}</span>
        </header>
        <div class="trend" :style="{ '--avg-line': `${Math.min(1, trend.average) * 122}px` }">
          <div
            v-for="point in trend.points"
            :key="point.month"
            class="trend-col"
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

      <section class="card info-card" aria-labelledby="info-title">
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

/* ---------- 顶部品牌横幅 ---------- */
/* 汇报演示场景：大幅红色政务风背景 + 本地 DingTalk JinBuTi 标题字，截图时突出平台名称 */
@font-face {
  font-family: "DingTalk JinBuTi";
  src: url("/DingTalkJinBuTi.woff2") format("woff2");
  font-display: swap;
}
.banner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 208px;
  padding: 34px 38px;
  border-radius: 18px;
  overflow: hidden;
  background: linear-gradient(115deg, #d0715f 0%, #c7573f 46%, #bc4534 100%);
  box-shadow: 0 14px 30px rgb(188 69 52 / 20%);
}
/* 右侧长城图：收窄到右半幅并双向渐隐，作为居中标题的底纹衬托，不抢视觉 */
.banner::before {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 46%;
  background: url("/images/dashboard-banner.jpg") no-repeat right center / cover;
  filter: brightness(1.22) saturate(0.92);
  -webkit-mask-image: linear-gradient(90deg, transparent 8%, #000 78%);
  mask-image: linear-gradient(90deg, transparent 8%, #000 78%);
  pointer-events: none;
}
/* 整体罩层：从左侧底色平滑过渡到图片区，保证居中文字在任何屏宽下清晰 */
.banner::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgb(199 87 63 / 0%) 30%, rgb(199 87 63 / 30%) 55%, rgb(188 69 52 / 18%) 100%);
  pointer-events: none;
}
/* 文字整体略偏左，抵消右侧长城图的视觉重量，画面更平衡 */
.banner-copy { position: relative; z-index: 1; min-width: 0; margin-inline-end: 19%; text-align: center; }
.banner-title {
  margin: 0;
  color: #fff;
  font-family: "DingTalk JinBuTi", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 46px;
  line-height: 1.2;
  letter-spacing: 10px;
  text-indent: 10px;
  text-shadow: 0 2px 20px rgb(0 0 0 / 38%);
}
/* 标题与副标之间的装饰分割线：淡金菱形 + 两侧渐隐细线 */
.banner-ornament { display: flex; align-items: center; justify-content: center; width: min(400px, 78%); margin: 14px auto 12px; }
.banner-ornament i { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgb(255 255 255 / 55%)); }
.banner-ornament i:last-child { transform: scaleX(-1); }
.banner-ornament span { width: 7px; height: 7px; margin-inline: 10px; background: #ffe2ae; transform: rotate(45deg); box-shadow: 0 0 6px rgb(255 226 174 / 55%); }
.banner-sub-title {
  margin: 0;
  color: rgb(255 255 255 / 84%);
  font-size: 15px;
  letter-spacing: 7px;
  text-indent: 7px;
}
.notice-link {
  position: absolute;
  top: 18px;
  right: 20px;
  z-index: 1;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgb(255 255 255 / 16%);
  border: 1px solid rgb(255 255 255 / 40%);
  color: #fff;
  font-size: 12px;
}
.notice-link:hover { background: rgb(255 255 255 / 28%); }

/* ---------- 通用卡片 ---------- */
.split { display: grid; gap: 18px; align-items: start; }
.split-wide { grid-template-columns: minmax(0, 1.72fr) minmax(320px, 0.9fr); }
.split-even { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; }
.split-even.is-single { grid-template-columns: minmax(0, 1fr); }
.split-wide.is-single { grid-template-columns: minmax(0, 1fr); }

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

.legend { display: flex; align-items: center; gap: 12px; flex: none; margin: 0; padding: 0; list-style: none; color: #667085; font-size: 12px; }
.legend li { display: flex; align-items: center; gap: 5px; }
.legend i { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 5px; font-size: 11px; font-style: normal; font-weight: 700; }

/* ---------- 上报矩阵 ---------- */
/* 设计原则：大面积保持浅灰绿底，只有信息（✓/✕）有对比度；去渐变、去阴影、去悬浮放大，消除“按钮墙”感 */
.heat-board { display: block; }
.heat-scroll { overflow-x: auto; padding-block-end: 2px; }
.heat-grid {
  display: grid;
  row-gap: 3px;
  width: 100%;
  min-width: calc(var(--label, 104px) + var(--cols, 12) * 34px + (var(--cols, 12) - 1) * 7px);
}
.heat-row {
  display: grid;
  grid-template-columns: var(--label, 104px) repeat(var(--cols, 12), minmax(34px, 1fr));
  align-items: center;
  column-gap: 7px;
  padding-block: 2px;
  border-radius: 8px;
  transition: background-color .15s;
}
.heat-row.is-head { padding-block-end: 6px; }
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

.heat-month { color: #98a2b3; font-size: 12px; text-align: center; font-variant-numeric: tabular-nums; }

/* 纯展示单元格：不可点击，仅保留悬浮提示 */
.heat-cell {
  display: grid;
  place-items: center;
  height: 30px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
}

/* 已报齐：绿色 ✓；未报齐：弱化成浅灰 ✕，不再用红色块 */
.cell-done { background: #e6f3ec; color: #12805c; }
.cell-wait { background: #f0f7f3; color: #8bbfa3; }
.cell-miss { background: #f2f4f7; color: #c4cad3; }

/* ---------- 场所角色时间线 ---------- */
.timeline { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; }
.timeline-item { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid #e9edf3; border-radius: 10px; background: #fbfcfe; }
.timeline-month { color: #667085; font-size: 12px; font-variant-numeric: tabular-nums; }
.timeline-state { color: #344054; font-size: 13px; font-weight: 600; }
.timeline-item.published .timeline-state { color: #067647; }
.timeline-item.pending .timeline-state { color: #b54708; }
.timeline-item.rejected .timeline-state,
.timeline-item.missing .timeline-state { color: #b42318; }
.timeline-item.missing { background: #fdf7f6; }

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

/* ---------- 基础信息公开 ---------- */
/* 与左侧走势卡等高：卡片纵向 flex，列表 flex:1 只占标题以外的剩余空间，三行 1fr 自由拉伸填满 */
.info-card { display: flex; flex-direction: column; }
.info-list { display: grid; grid-template-rows: repeat(3, minmax(46px, 1fr)); gap: 2px; flex: 1; min-height: 0; margin: 0; padding: 0; list-style: none; }
.info-list a { display: grid; grid-template-columns: 76px minmax(0, 1fr) 52px 58px; align-items: center; gap: 12px; height: 100%; min-height: 46px; padding: 4px 8px; border-radius: 10px; transition: background-color .16s; }
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
  .split-wide { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 900px) {
  .split-even { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 720px) {
  .dash { --card-pad: 18px; gap: 12px; }
  .banner { min-height: 0; padding: 26px 20px; }
  .banner::before { width: 60%; }
  .banner-copy { margin-inline-end: 10%; }
  .banner-title { font-size: 28px; letter-spacing: 6px; text-indent: 6px; }
  .banner-ornament { margin-block: 10px 8px; }
  .banner-sub-title { font-size: 12.5px; letter-spacing: 4px; text-indent: 4px; }
  .notice-link { top: 12px; right: 12px; font-size: 11px; }
  .info-list a { grid-template-columns: 64px minmax(0, 1fr) 46px; }
  .info-pending { display: none; }
}
</style>
