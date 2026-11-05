<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { REVIEW_LABELS, REVIEW_TAG_TYPES, reviewActionMessage } from '~~/shared/review'

type ReviewType = 'profiles' | 'personnel'

interface ReviewRow {
  type: ReviewType
  venue_id: number
  venue_name: string
  township: string
  state: string
  published: number | boolean
  submitted_at: string | null
  town_note: string | null
  town_reviewed_at: string | null
  county_note: string | null
  county_reviewed_at: string | null
  updated_at: string | null
  category?: string | null
  member_count?: number | null
  first_member?: string | null
}

interface TabItem { value: string, label: string, count: number }

const route = useRoute()
const router = useRouter()
const { admin, hasPerm } = useAdmin()
const activeTab = ref('all')
const list = ref<ReviewRow[]>([])
const total = ref(0)
const counts = ref<Record<string, number>>({ all: 0 })
const query = reactive({ page: 1, pageSize: 10, search: '' })
const loading = ref(false)
let loadSequence = 0

const current = ref<Record<string, any> | null>(null)
const currentRow = ref<ReviewRow | null>(null)
const detailType = ref<ReviewType>('profiles')
const visible = ref(false)

const roleCode = computed(() => admin.value?.roleCode ?? '')
const isReviewer = computed(() => hasPerm('venues:review') || hasPerm('personnel:review'))
const myState = computed(() => {
  if (roleCode.value === 'town') return 'pending_town'
  if (['county', 'super'].includes(roleCode.value)) return 'pending_county'
  return ''
})
const mineCount = computed(() => (myState.value ? counts.value[myState.value] ?? 0 : 0))
const townPending = computed(() => counts.value.pending_town ?? 0)
const members = computed<any[]>(() => current.value?.members ?? [])
const stateParam = computed(() => {
  if (activeTab.value === 'mine') return myState.value || undefined
  return activeTab.value === 'all' ? undefined : activeTab.value
})
const tabs = computed<TabItem[]>(() => {
  const items: TabItem[] = []
  if (isReviewer.value && myState.value) items.push({ value: 'mine', label: '待我审核', count: mineCount.value })
  if (isReviewer.value && myState.value !== 'pending_town') {
    items.push({ value: 'pending_town', label: '待镇级审核', count: counts.value.pending_town ?? 0 })
  }
  if (isReviewer.value && myState.value !== 'pending_county') {
    items.push({ value: 'pending_county', label: '待县级审核', count: counts.value.pending_county ?? 0 })
  }
  items.push({ value: 'approved', label: '已通过', count: counts.value.approved ?? 0 })
  items.push({ value: 'rejected', label: '未通过', count: counts.value.rejected ?? 0 })
  items.push({ value: 'all', label: '全部', count: counts.value.all ?? 0 })
  return items
})

const noteOf = (row: ReviewRow) => (row.state === 'rejected' ? row.county_note || row.town_note || '' : '')
const needsMyReview = (row: ReviewRow) => isReviewer.value && !!myState.value && row.state === myState.value
const typeLabel = (type: ReviewType) => (type === 'personnel' ? '人员名册' : '场所介绍')

function stateMark(state: string) {
  if (state === 'approved') return '✓'
  if (state === 'rejected') return '✕'
  if (state === 'draft') return '·'
  return '!'
}

function apiPath(type: ReviewType) {
  return `/api/admin/${type}`
}

async function load() {
  const sequence = ++loadSequence
  loading.value = true
  try {
    const response = await $fetch<any>('/api/admin/review', {
      query: {
        page: query.page,
        pageSize: query.pageSize,
        search: query.search || undefined,
        state: stateParam.value
      }
    })
    if (sequence !== loadSequence) return
    list.value = response.list
    total.value = response.total
    counts.value = response.counts ?? { all: response.total ?? 0 }
  } catch (error) {
    if (sequence === loadSequence) ElMessage.error(errorMessage(error))
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

function syncQuery() {
  void router.replace({
    query: {
      ...route.query,
      type: undefined,
      state: activeTab.value === 'all' ? undefined : activeTab.value
    }
  })
}

function setTab(value: string) {
  if (activeTab.value === value) return
  activeTab.value = value
  query.page = 1
  syncQuery()
  void load()
}

function search() {
  query.page = 1
  void load()
}

async function refresh() {
  await load()
}

async function open(row: ReviewRow) {
  try {
    detailType.value = row.type
    currentRow.value = row
    current.value = await $fetch<Record<string, any>>(`${apiPath(detailType.value)}/${row.venue_id}`)
    visible.value = true
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function review(action: string, reason?: string) {
  if (!current.value) return
  try {
    current.value = await $fetch<Record<string, any>>(`${apiPath(detailType.value)}/${current.value.venue_id}/review`, {
      method: 'POST',
      body: { action, reason }
    })
    ElMessage.success(reviewActionMessage(action))
    visible.value = false
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function publish(value: string | number | boolean) {
  if (!current.value) return
  const published = Boolean(value)
  try {
    current.value = await $fetch<Record<string, any>>(`${apiPath(detailType.value)}/${current.value.venue_id}/publish`, {
      method: 'POST',
      body: { published }
    })
    ElMessage.success(published ? '已公开' : '已取消公开')
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

watch(() => [query.page, query.pageSize], () => { void load() })

onMounted(async () => {
  // 列表已合并为统一队列，清理旧链接携带的类型参数
  if (route.query.type) void router.replace({ query: { ...route.query, type: undefined } })
  const initialState = String(route.query.state ?? '')
  const hasInitialState = ['mine', 'approved', 'rejected', 'pending_town', 'pending_county'].includes(initialState)
  if (hasInitialState) activeTab.value = initialState === myState.value ? 'mine' : initialState
  else activeTab.value = isReviewer.value && myState.value ? 'mine' : 'all'
  await load()
  if (!hasInitialState && myState.value === 'pending_county' && mineCount.value === 0 && townPending.value > 0) {
    setTab('pending_town')
  }
})
</script>

<template>
  <div class="page review-center">
    <nav class="tabs" role="tablist" aria-label="审核分类">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        role="tab"
        class="tab"
        :class="{ active: activeTab === tab.value }"
        :aria-selected="activeTab === tab.value"
        @click="setTab(tab.value)"
      >
        {{ tab.label }}<em>{{ tab.count }}</em>
      </button>
    </nav>

    <section class="panel review-panel" aria-label="审核队列">
      <div class="toolbar">
        <el-input v-model="query.search" placeholder="搜索场所或乡镇" clearable @keyup.enter="search" @clear="search" />
        <el-button type="primary" plain @click="search">查询</el-button>
        <div class="toolbar-actions">
          <span class="toolbar-note">共 {{ total }} 条</span>
          <el-button :loading="loading" @click="refresh">刷新</el-button>
        </div>
      </div>

      <div v-loading="loading" class="review-list">
        <ul v-if="list.length">
          <li v-for="row in list" :key="`${row.type}-${row.venue_id}`" class="review-row" :class="`state-${row.state}`">
            <span class="row-mark" aria-hidden="true">{{ stateMark(row.state) }}</span>
            <div class="row-main">
              <div class="row-title">
                <h3>{{ row.venue_name }}</h3>
                <el-tag class="row-type" :type="row.type === 'personnel' ? 'warning' : 'info'" effect="plain" size="small">
                  {{ typeLabel(row.type) }}
                </el-tag>
                <span class="town-chip">{{ row.township }}</span>
                <el-tag :type="REVIEW_TAG_TYPES[row.state] ?? 'info'" size="small">{{ REVIEW_LABELS[row.state] ?? row.state }}</el-tag>
                <el-tag v-if="row.state === 'approved'" :type="row.published ? 'success' : 'info'" effect="plain" size="small">
                  {{ row.published ? '已公开' : '未公开' }}
                </el-tag>
              </div>
              <p class="row-meta">
                <template v-if="row.type === 'personnel'">
                  <span>共 {{ row.member_count ?? 0 }} 人</span>
                  <span>负责人 {{ row.first_member || '—' }}</span>
                </template>
                <template v-else>
                  <span>{{ row.category || '场所登记资料与简介' }}</span>
                </template>
                <span>{{ row.submitted_at ? `提交于 ${formatDateTime(row.submitted_at)}` : '尚未提交审核' }}</span>
              </p>
              <p v-if="noteOf(row)" class="row-note">审核意见：{{ noteOf(row) }}</p>
            </div>
            <div class="row-action">
              <el-button :type="needsMyReview(row) ? 'primary' : 'default'" @click="open(row)">
                {{ needsMyReview(row) ? '开始审核' : row.type === 'personnel' ? '查看名册' : '查看介绍' }}
              </el-button>
            </div>
          </li>
        </ul>
        <div v-else-if="!loading" class="empty">
          <span class="empty-mark" aria-hidden="true">✓</span>
          <p>{{ activeTab === 'mine' ? '没有待你审核的记录' : '该分类下暂无记录' }}</p>
          <el-button v-if="activeTab === 'mine'" plain @click="setTab('all')">查看全部审核记录</el-button>
        </div>
      </div>

      <div v-if="total > query.pageSize" class="pagination">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
        />
      </div>
    </section>

    <el-drawer v-model="visible" class="review-drawer" size="min(960px, 96vw)" :with-header="false">
      <template v-if="current">
        <header class="drawer-head">
          <div>
            <span class="drawer-type">{{ typeLabel(detailType) }}</span>
            <h2>{{ currentRow?.venue_name ?? typeLabel(detailType) }}</h2>
            <p class="muted">
              {{ currentRow?.township ?? '' }}
              <template v-if="detailType === 'personnel'"> · 共 {{ members.length }} 人</template>
            </p>
          </div>
          <el-button text @click="visible = false">关闭</el-button>
        </header>

        <div v-if="detailType === 'profiles'" class="drawer-body profile-layout">
          <main class="profile-main">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="登记时间">{{ current.registration_date || '未填写' }}</el-descriptions-item>
              <el-descriptions-item label="教别">{{ current.religion || '未填写' }}</el-descriptions-item>
              <el-descriptions-item label="场所类别">{{ current.category || '未填写' }}</el-descriptions-item>
              <el-descriptions-item label="负责人">{{ current.manager || '未填写' }}</el-descriptions-item>
              <el-descriptions-item label="联系电话">{{ current.phone || '未填写' }}</el-descriptions-item>
              <el-descriptions-item label="批准设立机构">{{ current.approval_authority || '未填写' }}</el-descriptions-item>
              <el-descriptions-item label="社会信用代码">{{ current.credit_code || '未填写' }}</el-descriptions-item>
              <el-descriptions-item label="场所地址">{{ current.address || '未填写' }}</el-descriptions-item>
            </el-descriptions>
            <section class="profile-section">
              <h3>场所简介</h3>
              <div class="rich-content detail-content" v-html="current.summary || '<p>暂无简介</p>'" />
            </section>
            <section v-if="Object.keys(current.extra ?? {}).length" class="profile-section">
              <h3>附加介绍</h3>
              <el-descriptions :column="1" border>
                <el-descriptions-item v-for="(value, key) in current.extra" :key="key" :label="String(key)">{{ value }}</el-descriptions-item>
              </el-descriptions>
            </section>
          </main>
          <aside class="review-side">
            <ReviewTimeline :record="current" />
            <div v-if="hasPerm('venues:publish')" class="publish-box">
              <span>是否公开</span>
              <el-switch
                :model-value="!!current.published"
                :disabled="current.state !== 'approved'"
                :aria-label="`${currentRow?.venue_name ?? '场所'}介绍公开状态`"
                @change="publish"
              />
            </div>
          </aside>
        </div>

        <div v-else class="drawer-body">
          <section class="member-list" aria-label="人员名册">
            <el-empty v-if="!members.length" description="尚未添加人员" />
            <article v-for="(member, index) in members" :key="index" class="member-card">
              <div class="member-photo">
                <el-image
                  v-if="member.imageUrl"
                  :src="member.imageUrl"
                  :preview-src-list="[member.imageUrl]"
                  fit="contain"
                  :alt="`${member.name}照片`"
                  class="photo"
                />
                <span v-else class="photo-empty">暂无<br>照片</span>
              </div>
              <div class="member-info">
                <header class="member-head">
                  <h3>{{ member.name || '未填写姓名' }}</h3>
                  <span v-if="member.gender" class="gender">{{ member.gender }}</span>
                  <span class="member-index">第 {{ index + 1 }} 位</span>
                </header>
                <p class="member-clergy">{{ member.clergy || '教职未填写' }}</p>
                <dl class="member-fields">
                  <div><dt>职务</dt><dd class="pre">{{ member.position || '未填写' }}</dd></div>
                  <div><dt>联系电话</dt><dd>{{ member.phone || '未填写' }}</dd></div>
                </dl>
              </div>
            </article>
          </section>
          <aside class="review-side">
            <ReviewTimeline :record="current" />
            <div v-if="hasPerm('personnel:publish')" class="publish-box">
              <span>是否公开</span>
              <el-switch
                :model-value="!!current.published"
                :disabled="current.state !== 'approved'"
                :aria-label="`${currentRow?.venue_name ?? '场所'}人员名册公开状态`"
                @change="publish"
              />
            </div>
          </aside>
        </div>

        <footer class="drawer-foot">
          <ReviewActions
            :state="current.state"
            :edit-permission="detailType === 'profiles' ? 'venues:edit' : 'personnel:edit'"
            :review-permission="detailType === 'profiles' ? 'venues:review' : 'personnel:review'"
            @action="review"
          />
        </footer>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.review-center { container-type: inline-size; gap: 16px; }

.tabs { display: flex; flex-wrap: wrap; flex-wrap: balance; gap: 8px; padding-block: 2px; }
.tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: #475467;
  cursor: pointer;
  font-size: 13px;
  transition: border-color .15s, background-color .15s, color .15s;
}
.tab em { min-width: 22px; padding: 0 6px; border-radius: 999px; background: #eef1f5; color: var(--muted); font-style: normal; font-size: 11px; line-height: 20px; text-align: center; font-variant-numeric: tabular-nums; }
.tab:hover { border-color: var(--el-color-primary-light-5); color: var(--brand); }
.tab.active { border-color: var(--brand); background: var(--brand); color: #fff; }
.tab.active em { background: rgb(255 255 255 / 20%); color: #fff; }
.tab:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }

.review-panel { padding-block-start: 18px; }
.toolbar { margin-block-end: 18px; }
.toolbar .el-input { max-width: 300px; }
.review-list { min-height: 148px; }
.review-list ul { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.review-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  transition: border-color .15s, box-shadow .15s;
}
.review-row:hover { border-color: var(--el-color-primary-light-7); box-shadow: 0 6px 18px rgb(16 24 40 / 6%); }
.review-row.state-pending_town,
.review-row.state-pending_county { border-inline-start: 3px solid #e0a53c; background: #fffdf7; }
.row-mark { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: #eef1f5; color: var(--muted); font-size: 15px; font-weight: 700; }
.state-pending_town .row-mark,
.state-pending_county .row-mark { background: #fdf1d8; color: #b45309; }
.state-approved .row-mark { background: #e5f5ea; color: #157347; }
.state-rejected .row-mark { background: #fdecec; color: #b42318; }
.row-main { min-width: 0; }
.row-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.row-title h3 { margin: 0; color: #182230; font-size: 16px; line-height: 1.4; }
.row-type { flex: none; }
.town-chip { padding: 1px 8px; border-radius: 6px; background: #f2f4f7; color: var(--muted); font-size: 12px; }
.row-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 6px 0 0; color: var(--muted); font-size: 13px; }
.row-meta span + span::before { content: '·'; margin-inline-end: 10px; color: #c3c8d2; }
.row-note { margin: 6px 0 0; color: #b42318; font-size: 13px; }
.row-action { flex: none; }
.empty { display: grid; justify-items: center; padding: 42px 20px; color: var(--muted); text-align: center; }
.empty-mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; background: #eef7f1; color: #157347; font-size: 20px; }
.empty p { margin: 12px 0; }

.drawer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-block-end: 16px; border-block-end: 1px solid var(--line); }
.drawer-type { display: inline-block; margin-block-end: 5px; color: #17549c; font-size: 12px; font-weight: 650; letter-spacing: .5px; }
.drawer-head h2 { margin: 0; font-size: 21px; }
.drawer-head p { margin: 4px 0 0; font-size: 13px; }
.drawer-body { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 20px; padding-block: 18px 0; flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; align-content: start; }
.drawer-body > * { min-width: 0; }
:deep(.el-drawer__body) { display: flex; flex-direction: column; min-height: 0; overflow: hidden; container-type: inline-size; }
.profile-main { display: grid; gap: 20px; align-content: start; min-width: 0; }
.profile-section h3 { margin: 0 0 10px; font-size: 16px; }
.detail-content { padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: #fbfcfd; }
.member-list { display: grid; gap: 12px; align-content: start; }
.member-card { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 16px; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.member-photo { width: 104px; height: 136px; border: 1px solid var(--line); border-radius: 10px; overflow: clip; background: #f3f5f8; }
.member-photo .photo { display: block; width: 100%; height: 100%; background: #f3f5f8; }
.photo-empty { display: grid; place-items: center; width: 100%; height: 100%; color: var(--muted); font-size: 13px; line-height: 1.5; text-align: center; }
.member-info { min-width: 0; }
.member-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.member-head h3 { margin: 0; font-size: 18px; }
.gender { padding: 1px 8px; border-radius: 6px; background: #eef4fc; color: var(--brand); font-size: 12px; }
.member-index { margin-inline-start: auto; color: var(--muted); font-size: 12px; }
.member-clergy { margin: 6px 0 10px; color: var(--muted); font-size: 13px; }
.member-fields { display: grid; gap: 8px; margin: 0; }
.member-fields > div { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 10px; align-items: start; }
.member-fields dt { color: var(--muted); font-size: 13px; }
.member-fields dd { margin: 0; font-size: 14px; }
.pre { white-space: pre-line; }
.review-side { display: grid; gap: 16px; align-content: start; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: #fafbfc; }
.review-side :deep(.review-status > .el-tag) { justify-self: start; }
.publish-box { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-block-start: 14px; border-block-start: 1px solid var(--line); font-size: 14px; }
.drawer-foot { flex: none; margin-block-start: 14px; padding-block-start: 14px; border-block-start: 1px solid var(--line); background: var(--surface); }

@container (max-width: 720px) {
  .review-row { grid-template-columns: 28px minmax(0, 1fr); }
  .row-action { grid-column: 1 / -1; }
  .row-action .el-button { width: 100%; }
}

@container (max-width: 760px) {
  .drawer-body { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 560px) {
  .member-card { grid-template-columns: 76px minmax(0, 1fr); gap: 12px; padding: 12px; }
  .member-photo { width: 76px; height: 104px; }
  .member-index { flex-basis: 100%; margin-inline-start: 0; }
  .member-fields > div { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .drawer-foot :deep(.review-actions .el-button) { flex: 1 1 120px; }
}

@media (prefers-reduced-motion: reduce) {
  .tab, .review-row { transition: none; }
}
</style>
