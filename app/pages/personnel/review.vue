<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { REVIEW_LABELS, REVIEW_TAG_TYPES, reviewActionMessage } from '~~/shared/review'

interface ReviewRow {
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
  member_count: number
  first_member: string | null
}

interface TabItem { value: string, label: string, count: number }

const route = useRoute()
const { admin, hasPerm } = useAdmin()

const list = ref<ReviewRow[]>([])
const total = ref(0)
const counts = ref<Record<string, number>>({ all: 0 })
const loading = ref(false)
const activeTab = ref('all')
const query = reactive({ page: 1, pageSize: 10, search: '' })

const current = ref<Record<string, any> | null>(null)
const visible = ref(false)

const roleCode = computed(() => admin.value?.roleCode ?? '')
const isReviewer = computed(() => hasPerm('personnel:review'))
const myState = computed(() => {
  if (roleCode.value === 'town') return 'pending_town'
  if (['county', 'super'].includes(roleCode.value)) return 'pending_county'
  return ''
})
const mineCount = computed(() => (myState.value ? counts.value[myState.value] ?? 0 : 0))
const townPending = computed(() => counts.value.pending_town ?? 0)
/** 县级管理员在待办为空时，提示还有多少场所停在镇级环节。 */
const todoHint = computed(() => {
  if (mineCount.value) return '核对人员姓名、职务与照片后，在抽屉底部通过或驳回。'
  if (roleCode.value === 'super' || roleCode.value === 'county') {
    return townPending.value
      ? `暂无待县级审核的名册，另有 ${townPending.value} 个场所仍停在镇级审核环节。`
      : '当前没有需要你处理的人员名册，可切换到其他分类查看。'
  }
  return '当前没有需要你处理的人员名册，可切换到其他分类查看。'
})

const tabs = computed<TabItem[]>(() => {
  const items: TabItem[] = []
  if (isReviewer.value && myState.value) {
    items.push({ value: 'mine', label: '待我审核', count: mineCount.value })
  }
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

const stateParam = computed(() => (activeTab.value === 'mine' ? myState.value : activeTab.value))
const members = computed<any[]>(() => current.value?.members ?? [])
const currentVenue = computed(() => list.value.find((item) => item.venue_id === current.value?.venue_id))
const noteOf = (row: ReviewRow) => (row.state === 'rejected' ? row.county_note || row.town_note || '' : '')
const needsMyReview = (row: ReviewRow) => isReviewer.value && !!myState.value && row.state === myState.value

function stateMark(state: string) {
  if (state === 'approved') return '✓'
  if (state === 'rejected') return '✕'
  if (state === 'draft') return '·'
  return '!'
}

async function load() {
  loading.value = true
  try {
    const response = await $fetch<any>('/api/admin/personnel', {
      query: { page: query.page, pageSize: query.pageSize, search: query.search, state: stateParam.value }
    })
    list.value = response.list
    total.value = response.total
    counts.value = response.counts ?? {}
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

function setTab(value: string) {
  if (activeTab.value === value) return
  activeTab.value = value
  query.page = 1
  load()
}

function search() {
  query.page = 1
  load()
}

async function open(row: ReviewRow) {
  try {
    current.value = await $fetch<Record<string, any>>(`/api/admin/personnel/${row.venue_id}`)
    visible.value = true
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function review(action: string, reason?: string) {
  if (!current.value) return
  try {
    await $fetch(`/api/admin/personnel/${current.value.venue_id}/review`, { method: 'POST', body: { action, reason } })
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
    current.value = await $fetch<Record<string, any>>(`/api/admin/personnel/${current.value.venue_id}/publish`, {
      method: 'POST',
      body: { published }
    })
    ElMessage.success(published ? '已公开' : '已取消公开')
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

watch(() => [query.page, query.pageSize], load)

onMounted(async () => {
  const initial = String(route.query.state ?? '')
  if (initial && ['approved', 'rejected', 'pending_town', 'pending_county'].includes(initial)) {
    activeTab.value = initial === myState.value ? 'mine' : initial
    await load()
    return
  }
  activeTab.value = isReviewer.value && myState.value ? 'mine' : 'all'
  await load()
  // 县级待办为空但仍有场所停在镇级环节时，直接展示镇级待审列表，避免进来后无从下手
  if (myState.value === 'pending_county' && mineCount.value === 0 && townPending.value > 0) {
    activeTab.value = 'pending_town'
    await load()
  }
})
</script>

<template>
  <div class="page">
    <section v-if="isReviewer" class="todo-banner" :class="{ clear: !mineCount }">
      <div class="todo-count">
        <strong>{{ mineCount }}</strong>
        <span>个场所待你审核</span>
      </div>
      <p class="todo-hint">{{ todoHint }}</p>
      <el-button v-if="mineCount" type="primary" @click="setTab('mine')">只看待我审核</el-button>
    </section>

    <nav class="tabs" role="tablist" aria-label="人员审核分类">
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
        {{ tab.label }}
        <em>{{ tab.count }}</em>
      </button>
    </nav>

    <section class="panel">
      <div class="toolbar">
        <el-input v-model="query.search" placeholder="搜索场所或乡镇" clearable @keyup.enter="search" @clear="search" />
        <el-button plain @click="search">查询</el-button>
        <div class="toolbar-actions">
          <span class="toolbar-note">共 {{ total }} 条</span>
          <el-button :loading="loading" @click="load">刷新</el-button>
        </div>
      </div>

      <div v-loading="loading" class="review-list">
        <ul v-if="list.length">
          <li v-for="row in list" :key="row.venue_id" class="review-row" :class="`state-${row.state}`">
            <span class="row-mark" aria-hidden="true">{{ stateMark(row.state) }}</span>
            <div class="row-main">
              <div class="row-title">
                <h3>{{ row.venue_name }}</h3>
                <span class="town-chip">{{ row.township }}</span>
                <el-tag :type="REVIEW_TAG_TYPES[row.state] ?? 'info'" size="small">{{ REVIEW_LABELS[row.state] ?? row.state }}</el-tag>
                <el-tag v-if="row.state === 'approved'" :type="row.published ? 'success' : 'info'" effect="plain" size="small">
                  {{ row.published ? '已公开' : '未公开' }}
                </el-tag>
              </div>
              <p class="row-meta">
                <span>共 {{ row.member_count ?? 0 }} 人</span>
                <span>负责人 {{ row.first_member || '—' }}</span>
                <span>{{ row.submitted_at ? `提交于 ${formatDateTime(row.submitted_at)}` : '尚未提交审核' }}</span>
              </p>
              <p v-if="noteOf(row)" class="row-note">审核意见：{{ noteOf(row) }}</p>
            </div>
            <div class="row-action">
              <el-button :type="needsMyReview(row) ? 'primary' : 'default'" @click="open(row)">
                {{ needsMyReview(row) ? '开始审核' : '查看名册' }}
              </el-button>
            </div>
          </li>
        </ul>
        <div v-else-if="!loading" class="empty">
          <p>{{ activeTab === 'mine' ? '没有待你审核的人员名册' : '该分类下暂无记录' }}</p>
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

    <el-drawer v-model="visible" size="min(920px, 96vw)" :with-header="false">
      <template v-if="current">
        <header class="drawer-head">
          <div>
            <h2>{{ currentVenue?.venue_name ?? '人员名册' }}</h2>
            <p class="muted">
              {{ currentVenue?.township ?? '' }} · 共 {{ members.length }} 人
            </p>
          </div>
          <el-button text @click="visible = false">关闭</el-button>
        </header>

        <div class="drawer-body">
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
                  <div>
                    <dt>职务</dt>
                    <dd class="pre">{{ member.position || '未填写' }}</dd>
                  </div>
                  <div>
                    <dt>联系电话</dt>
                    <dd>{{ member.phone || '未填写' }}</dd>
                  </div>
                </dl>
              </div>
            </article>
          </section>

          <aside class="review-side">
            <ReviewTimeline :record="current" />
            <div v-if="hasPerm('personnel:publish')" class="publish-box">
              <span>向公众公开</span>
              <el-switch
                :model-value="!!current.published"
                :disabled="current.state !== 'approved'"
                :aria-label="`${current.venue_name}人员名册公开状态`"
                @change="publish"
              />
            </div>
          </aside>
        </div>

        <footer class="drawer-foot">
          <ReviewActions
            :state="current.state"
            edit-permission="personnel:edit"
            review-permission="personnel:review"
            @action="review"
          />
        </footer>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.todo-banner {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  padding: 18px 22px;
  border: 1px solid #f0d9a8;
  border-radius: 14px;
  background: #fffaf0;
}
.todo-banner.clear { border-color: #cfe3ce; background: #f4faf4; }
.todo-count { display: flex; align-items: baseline; gap: 8px; }
.todo-count strong { font-size: 34px; line-height: 1; color: #b45309; font-variant-numeric: tabular-nums; }
.todo-banner.clear .todo-count strong { color: #157347; }
.todo-count span { color: var(--ink); font-weight: 600; }
.todo-hint { flex: 1 1 320px; margin: 0; color: var(--muted); font-size: 14px; }

.tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  font-size: 14px;
}
.tab em {
  min-width: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: #eef1f5;
  color: var(--muted);
  font-style: normal;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.tab:hover { border-color: var(--el-color-primary-light-5); color: var(--brand); }
.tab.active { border-color: var(--brand); background: var(--brand); color: #fff; }
.tab.active em { background: rgb(255 255 255 / 22%); color: #fff; }

.toolbar .el-input { max-width: 280px; }
.toolbar .muted { font-size: 13px; }
.review-list { min-height: 120px; }
.review-list ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }

.review-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.review-row:hover { border-color: var(--el-color-primary-light-7); box-shadow: 0 6px 18px rgb(16 24 40 / 6%); }
.review-row.state-pending_town,
.review-row.state-pending_county { border-inline-start: 3px solid #e0a53c; background: #fffdf7; }

.row-mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 15px;
  font-weight: 700;
  background: #eef1f5;
  color: var(--muted);
}
.state-pending_town .row-mark,
.state-pending_county .row-mark { background: #fdf1d8; color: #b45309; }
.state-approved .row-mark { background: #e5f5ea; color: #157347; }
.state-rejected .row-mark { background: #fdecec; color: #b42318; }

.row-main { min-width: 0; }
.row-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.row-title h3 { margin: 0; font-size: 17px; line-height: 1.4; }
.town-chip {
  padding: 1px 8px;
  border-radius: 6px;
  background: #f2f4f7;
  color: var(--muted);
  font-size: 12px;
}
.row-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 6px 0 0; color: var(--muted); font-size: 13px; }
.row-meta span + span::before { content: '·'; margin-inline-end: 10px; color: #c3c8d2; }
.row-note { margin: 6px 0 0; color: #b42318; font-size: 13px; }
.row-action { flex: none; }

.empty { padding: 46px 20px; text-align: center; color: var(--muted); }
.empty p { margin: 0 0 12px; }

.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-block-end: 16px;
  border-block-end: 1px solid var(--line);
}
.drawer-head h2 { margin: 0; font-size: 20px; }
.drawer-head p { margin: 4px 0 0; font-size: 13px; }
.drawer-body { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 20px; padding-block: 18px 0; flex: 1 1 auto; min-height: 0; overflow: auto; align-content: start; }
:deep(.el-drawer__body) { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.member-list { display: grid; gap: 12px; align-content: start; }

.member-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}
.member-photo {
  width: 104px;
  height: 136px;
  border-radius: 10px;
  overflow: hidden;
  background: #f3f5f8;
  border: 1px solid var(--line);
  flex: none;
}
.member-photo .photo { width: 100%; height: 100%; display: block; background: #f3f5f8; }
.photo-empty {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
}
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
.drawer-foot {
  flex: none;
  margin-block-start: 14px;
  padding-block-start: 14px;
  border-block-start: 1px solid var(--line);
  background: var(--surface);
}

@media (max-width: 900px) {
  .page-header { align-items: flex-start; }
  .drawer-body { grid-template-columns: 1fr; }
  .review-row { grid-template-columns: 28px minmax(0, 1fr); }
  .row-action { grid-column: 1 / -1; }
  .row-action .el-button { width: 100%; }
}
</style>
