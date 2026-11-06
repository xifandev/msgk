<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Rank } from '@element-plus/icons-vue'
import Sortable from 'sortablejs'
import { REVIEW_LABELS, REVIEW_TAG_TYPES, myReviewState, reviewActionMessage } from '~~/shared/review'

interface PersonnelRow {
  venue_id: number
  venue_name: string
  township: string
  state: string
  published: number | boolean
  submitted_at: string | null
  town_note: string | null
  county_note: string | null
  updated_at: string | null
  member_count: number | null
  first_member: string | null
}

interface Member {
  key: number
  sort: number
  imageUrl: string | null
  name: string
  gender: string
  clergy: string
  position: string
  phone: string
}

interface TabItem { value: string, label: string, count: number }

const route = useRoute()
const router = useRouter()
const { admin, hasPerm } = useAdmin()

const list = ref<PersonnelRow[]>([])
const total = ref(0)
const counts = ref<Record<string, number>>({ all: 0 })
const query = reactive({ page: 1, pageSize: 10, search: '' })
const loading = ref(false)
let loadSequence = 0

const roleCode = computed(() => admin.value?.roleCode ?? '')
const isReviewer = computed(() => hasPerm('personnel:review'))
const canEditPersonnel = computed(() => hasPerm('personnel:edit'))
const myState = computed(() => myReviewState(roleCode.value))
const showMine = computed(() => isReviewer.value && !!myState.value)
const { activeTab, initTab, syncQuery: syncTabQuery, clearTab } = useReviewStateTab(myState, isReviewer)
const mounted = ref(false)
const tabs = computed<TabItem[]>(() => {
  const items: TabItem[] = []
  if (showMine.value) items.push({ value: 'mine', label: '待我审核', count: counts.value[myState.value] ?? 0 })
  if (!(showMine.value && myState.value === 'pending_town')) {
    items.push({ value: 'pending_town', label: '待镇级审核', count: counts.value.pending_town ?? 0 })
  }
  if (!(showMine.value && myState.value === 'pending_county')) {
    items.push({ value: 'pending_county', label: '待县级审核', count: counts.value.pending_county ?? 0 })
  }
  items.push({ value: 'draft', label: '正在填报', count: counts.value.draft ?? 0 })
  items.push({ value: 'approved', label: '审核通过', count: counts.value.approved ?? 0 })
  items.push({ value: 'rejected', label: '审核失败', count: counts.value.rejected ?? 0 })
  items.push({ value: '', label: '全部', count: counts.value.all ?? 0 })
  return items
})
// 两套查询完全独立：胶囊只管状态，工具栏只管关键词；最后使用哪一套，列表就按哪一套取数
const queryMode = ref<'tab' | 'toolbar'>('tab')
// 胶囊自己的状态取值（'mine' 映射为当前角色的待审状态）
const requestState = ref('')
const needsMyReview = (row: any) => showMine.value && row.state === myState.value
const noteOf = (row: any) => (row.state === 'rejected' ? row.county_note || row.town_note || '' : '')

function actionLabel(row: any) {
  if (needsMyReview(row)) return '开始审核'
  if (canEditPersonnel.value && ['draft', 'rejected'].includes(row.state)) return '填写名册'
  return '查看名册'
}

async function load() {
  const sequence = ++loadSequence
  loading.value = true
  try {
    // 胶囊模式只带状态；工具栏模式只带关键词，互不叠加
    const params = queryMode.value === 'tab'
      ? { page: query.page, pageSize: query.pageSize, state: (isReviewer.value ? requestState.value : '') || undefined }
      : { page: query.page, pageSize: query.pageSize, search: query.search || undefined }
    const response = await $fetch<any>('/api/admin/personnel', { query: params })
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

// 胶囊是一套独立查询：只按状态取数；点胶囊时彻底清空工具栏的关键词输入
function setTab(value: string) {
  activeTab.value = value
  requestState.value = value === 'mine' ? myState.value : value
  query.search = ''
  query.page = 1
  queryMode.value = 'tab'
  syncTabQuery(value)
  void load()
}

// 工具栏是另一套独立查询：只按关键词取数；查询时胶囊全部不选中
function search() {
  queryMode.value = 'toolbar'
  clearTab()
  query.page = 1
  void load()
}

// —— 详情（填报 / 审核） ——
const venueId = ref<number | null>(null)
const currentRow = ref<PersonnelRow | null>(null)
const detailLoading = ref(false)
const saving = ref(false)
const record = ref<Record<string, any> | null>(null)
const members = ref<Member[]>([])
const memberListRef = ref<HTMLElement | null>(null)
const dirty = ref(false)
let suppressDirty = false
let memberKey = 0
let memberSortable: Sortable | null = null
const QUICK_POSITIONS = ['民主管理组织负责人', '民主管理组织成员', '财务管理组织出纳', '财务管理组织会计', '财务管理组织资产管理', '安全生产组织成员']
const editable = computed(() => !!record.value && ['draft', 'rejected'].includes(record.value.state))
const canEdit = computed(() => canEditPersonnel.value && editable.value)

function markDirty() {
  if (!suppressDirty) dirty.value = true
}

function emptyMember(): Member {
  return { key: ++memberKey, sort: members.value.length + 1, imageUrl: null, name: '', gender: '', clergy: '', position: '', phone: '' }
}

function addMember() {
  members.value.push(emptyMember())
  markDirty()
}

function quickPosition(index: number, value: string) {
  const member = members.value[index]
  if (!member || !value) return
  member.position = member.position ? `${member.position}\n${value}` : value
  markDirty()
}

async function loadDetail() {
  if (!venueId.value) return
  detailLoading.value = true
  try {
    let response: Record<string, any>
    try {
      response = await $fetch<Record<string, any>>(`/api/admin/personnel/${venueId.value}`)
    } catch (error: any) {
      // 该场所还没有名册：按空白的填报中名册处理，首次保存时由接口创建
      if (error?.statusCode !== 404) throw error
      response = { venue_id: venueId.value, state: 'draft', published: 0, members: [] }
    }
    record.value = response
    suppressDirty = true
    members.value = (response.members ?? []).map((member: any, index: number) => ({
      key: ++memberKey,
      sort: Number(member.sort) || index + 1,
      imageUrl: member.imageUrl ?? null,
      name: member.name ?? '',
      gender: member.gender ?? '',
      clergy: member.clergy ?? '',
      position: member.position ?? '',
      phone: member.phone ?? ''
    }))
    dirty.value = false
  } catch (error) {
    record.value = null
    ElMessage.error(errorMessage(error))
  } finally { detailLoading.value = false; suppressDirty = false }
}

function open(row: any) {
  venueId.value = row.venue_id
  currentRow.value = row
  void router.replace({ query: { ...route.query, venue: String(row.venue_id) } })
  void loadDetail()
}

async function back() {
  venueId.value = null
  currentRow.value = null
  record.value = null
  members.value = []
  void router.replace({ query: { ...route.query, venue: undefined } })
  await load()
}

function destroyMemberSortable() {
  memberSortable?.destroy()
  memberSortable = null
}

async function initMemberSortable() {
  await nextTick()
  destroyMemberSortable()
  if (!memberListRef.value) return
  memberSortable = Sortable.create(memberListRef.value, {
    animation: 180,
    handle: '.drag-handle',
    draggable: '.member-card',
    disabled: !canEdit.value,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    fallbackOnBody: true,
    onEnd: reorderMember
  })
}

function reorderMember(event: Sortable.SortableEvent) {
  if (event.oldIndex === undefined || event.newIndex === undefined || event.oldIndex === event.newIndex) return
  const [member] = members.value.splice(event.oldIndex, 1)
  if (!member) return
  members.value.splice(event.newIndex, 0, member)
  markDirty()
}

async function removeMember(index: number) {
  const member = members.value[index]
  if (member?.name) {
    try {
      await ElMessageBox.confirm(`是否要删除成员“${member.name}”？`, '警告', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
    } catch { return }
  }
  members.value.splice(index, 1)
  markDirty()
  ElMessage.info('已移除该成员，点击“保存名册”后生效')
}

async function save() {
  for (const [index, member] of members.value.entries()) {
    if (!member.name.trim()) {
      ElMessage.warning(`请填写第 ${index + 1} 位成员的姓名`)
      return
    }
    if (!member.position.trim()) {
      ElMessage.warning(`请填写第 ${index + 1} 位成员的职务`)
      return
    }
  }
  saving.value = true
  try {
    const payload = members.value.map((member, index) => ({
      sort: index + 1,
      imageUrl: member.imageUrl,
      name: member.name.trim(),
      gender: member.gender,
      clergy: member.clergy,
      position: member.position.trim(),
      phone: member.phone
    }))
    record.value = await $fetch<Record<string, any>>(`/api/admin/personnel/${venueId.value}`, { method: 'PUT', body: { members: payload } })
    ElMessage.success('人员名册已保存')
    await loadDetail()
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { saving.value = false }
}

async function review(action: string, reason?: string) {
  try {
    record.value = await $fetch<Record<string, any>>(`/api/admin/personnel/${venueId.value}/review`, { method: 'POST', body: { action, reason } })
    ElMessage.success(reviewActionMessage(action))
  } catch (error) { ElMessage.error(errorMessage(error)) }
}

function validateSubmit() {
  if (dirty.value) return '名册有未保存的修改，请先点击“保存名册”'
  if (!members.value.length) return '请先添加人员，再提交审核'
  return null
}

async function publish(value: string | number | boolean) {
  const published = Boolean(value)
  try {
    record.value = await $fetch<Record<string, any>>(`/api/admin/personnel/${venueId.value}/publish`, { method: 'POST', body: { published } })
    ElMessage.success(published ? '已公开' : '已取消公开')
  } catch (error) { ElMessage.error(errorMessage(error)) }
}

watch(() => [query.page, query.pageSize], () => { void load() })
watch([memberListRef, canEdit], initMemberSortable, { flush: 'post' })

onMounted(async () => {
  mounted.value = true
  initTab()
  requestState.value = (activeTab.value === 'mine' ? myState.value : activeTab.value) ?? ''
  await load()
  const initialVenue = Number(route.query.venue)
  if (Number.isSafeInteger(initialVenue) && initialVenue > 0) {
    venueId.value = initialVenue
    await loadDetail()
  }
})
onBeforeUnmount(destroyMemberSortable)
</script>

<template>
  <div class="page">
    <template v-if="!venueId">
      <StateTabs v-if="mounted && isReviewer" :tabs="tabs" :model-value="activeTab" @update:model-value="setTab" />

      <section class="panel" aria-label="人员名册列表">
        <div class="toolbar">
          <el-input v-model="query.search" placeholder="搜索场所或乡镇" clearable @keyup.enter="search" @clear="search" />
          <el-button type="primary" plain @click="search">查询</el-button>
          <div class="toolbar-actions">
            <span class="toolbar-note">共 {{ total }} 条</span>
            <el-button :loading="loading" @click="load">刷新</el-button>
          </div>
        </div>

        <div class="table-region" tabindex="0" role="region" aria-label="人员名册列表">
          <el-table v-loading="loading" :data="list">
            <el-table-column prop="venue_name" label="场所名称" min-width="170" />
            <el-table-column prop="township" label="乡镇" width="110" />
            <el-table-column label="人数" width="80" align="right">
              <template #default="{ row }">{{ row.member_count ?? 0 }}</template>
            </el-table-column>
            <el-table-column label="首位成员" width="110">
              <template #default="{ row }">{{ row.first_member || '—' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><el-tag :type="REVIEW_TAG_TYPES[row.state] ?? 'info'">{{ REVIEW_LABELS[row.state] ?? row.state }}</el-tag></template>
            </el-table-column>
            <el-table-column label="公开" width="86">
              <template #default="{ row }">
                <el-tag v-if="row.state === 'approved'" :type="row.published ? 'success' : 'info'" effect="plain">{{ row.published ? '已公开' : '未公开' }}</el-tag>
                <span v-else class="muted" aria-hidden="true">—</span>
              </template>
            </el-table-column>
            <el-table-column label="提交时间" width="165">
              <template #default="{ row }">{{ row.submitted_at ? formatReviewTime(row.submitted_at) : '尚未提交' }}</template>
            </el-table-column>
            <el-table-column label="审核意见" min-width="140">
              <template #default="{ row }"><span :class="{ 'note-danger': noteOf(row) }">{{ noteOf(row) || '—' }}</span></template>
            </el-table-column>
            <el-table-column label="操作" width="110" fixed="right" align="right">
              <template #default="{ row }">
                <el-button type="primary" :plain="!needsMyReview(row)" size="small" :aria-label="`${actionLabel(row)}${row.venue_name}`" @click="open(row)">
                  {{ actionLabel(row) }}
                </el-button>
              </template>
            </el-table-column>
            <template #empty>{{ loading ? '加载中' : '该分类下暂无记录' }}</template>
          </el-table>
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
    </template>

    <template v-else>
      <div class="page-bar">
        <el-button plain @click="back">← 返回列表</el-button>
        <strong class="detail-venue">{{ currentRow?.venue_name ?? `${venueId} 号场所` }}</strong>
        <span v-if="currentRow?.township" class="town-chip">{{ currentRow.township }}</span>
      </div>
      <div v-if="record" v-loading="detailLoading" class="detail-layout">
        <section class="panel">
          <div class="toolbar">
            <span class="toolbar-note">共 {{ members.length }} 人</span>
            <div class="toolbar-actions">
              <el-button v-if="canEdit" type="primary" plain :loading="saving" @click="save">{{ dirty ? '保存名册（有未保存修改）' : '保存名册' }}</el-button>
              <el-button v-if="canEdit" type="primary" :icon="Plus" @click="addMember">添加人员</el-button>
            </div>
          </div>
          <p v-if="canEdit" class="muted hint-text">拖动成员卡片行首手柄调整顺序，保存名册后生效。</p>
          <p v-if="canEditPersonnel && !editable" class="muted">当前内容正在审核或已经通过，如需修改请先重新编辑。</p>
          <el-empty v-if="!members.length" description="尚未添加人员" />
          <div ref="memberListRef" class="member-list">
            <article v-for="(member, index) in members" :key="member.key" class="member-card" :class="{ 'is-editing': canEdit }">
              <template v-if="canEdit">
                <div class="member-head">
                  <button type="button" class="drag-handle member-handle" :aria-label="`拖动第${index + 1}位成员`" title="拖动排序">
                    <el-icon><Rank /></el-icon>
                  </button>
                  <span class="member-no" aria-hidden="true">{{ index + 1 }}</span>
                  <strong>第 {{ index + 1 }} 位成员</strong>
                  <span v-if="member.name" class="member-name">{{ member.name }}</span>
                  <div class="member-actions"><el-button size="small" type="danger" plain @click="removeMember(index)">删除</el-button></div>
                </div>
                <div class="member-body">
                  <ImageUpload v-model="member.imageUrl" :label="`${member.name || '成员'}照片`" />
                  <el-form label-position="top" class="member-form" @change="markDirty"><div class="member-grid">
                    <el-form-item label="姓名" required><el-input v-model="member.name" maxlength="50" placeholder="请输入姓名" /></el-form-item>
                    <el-form-item label="性别"><el-select v-model="member.gender" clearable><el-option label="男" value="男" /><el-option label="女" value="女" /></el-select></el-form-item>
                    <el-form-item label="教职"><el-input v-model="member.clergy" maxlength="50" placeholder="没有可不填" /></el-form-item>
                    <el-form-item label="联系电话"><el-input v-model="member.phone" maxlength="30" placeholder="请输入联系电话" /></el-form-item>
                    <el-form-item label="职务" required class="span-2">
                      <div class="position-row">
                        <el-input v-model="member.position" type="textarea" :rows="2" maxlength="100" placeholder="请输入职务" />
                        <el-select placeholder="快速添加职务" clearable class="position-quick" @change="(value: string) => quickPosition(index, value)">
                          <el-option v-for="item in QUICK_POSITIONS" :key="item" :value="item" :label="item" />
                        </el-select>
                      </div>
                    </el-form-item>
                  </div></el-form>
                </div>
              </template>
              <template v-else>
                <div class="member-photo">
                  <el-image v-if="member.imageUrl" :src="member.imageUrl" :preview-src-list="[member.imageUrl]" fit="contain" class="photo-preview" :alt="`${member.name}照片`" />
                  <span v-else class="photo-empty">暂无<br>照片</span>
                </div>
                <div class="member-info">
                  <header class="member-head">
                    <h3>{{ member.name || '未填写姓名' }}</h3>
                    <span v-if="member.gender" class="member-gender">{{ member.gender }}</span>
                    <span class="member-index">第 {{ index + 1 }} 位</span>
                  </header>
                  <p class="member-clergy">{{ member.clergy || '教职未填写' }}</p>
                  <dl class="member-fields">
                    <div><dt>职务</dt><dd class="pre">{{ member.position || '未填写' }}</dd></div>
                    <div><dt>联系电话</dt><dd>{{ member.phone || '未填写' }}</dd></div>
                  </dl>
                </div>
              </template>
            </article>
          </div>
        </section>
        <aside class="panel review-side"><ReviewTimeline :record="record" /><div v-if="hasPerm('personnel:publish')" class="publish-box"><span>是否公开</span><el-switch :model-value="!!record.published" :disabled="record.state !== 'approved'" :aria-label="`${currentRow?.venue_name ?? venueId}人员名册是否公开`" @change="publish" /></div><ReviewActions :state="record.state" edit-permission="personnel:edit" review-permission="personnel:review" :submit-validator="validateSubmit" @action="review" /></aside>
      </div>
      <el-empty v-else-if="!detailLoading" description="未找到该场所的人员名册" />
    </template>
  </div>
</template>

<style scoped>
.toolbar .el-input { max-width: 300px; }
.note-danger { color: #b42318; }
.detail-venue { font-size: 16px; }
.town-chip { padding: 1px 8px; border-radius: 6px; background: #f2f4f7; color: var(--muted); font-size: 12px; }

.detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 22px; align-items: start; }
.review-side { display: grid; gap: 20px; align-content: start; }
.publish-box { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; }
.review-side :deep(.review-status > .el-tag) { justify-self: start; }
.member-list { display: grid; gap: 12px; }
.member-card { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); transition: border-color 0.15s, box-shadow 0.15s; }
.member-card:hover { border-color: var(--el-color-primary-light-7); box-shadow: 0 6px 18px rgb(16 24 40 / 5%); }
.member-card:not(.is-editing) { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 16px; padding: 16px; }
.member-card.is-editing { padding: 16px; }
.member-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.is-editing .member-head { gap: 10px; margin-block-end: 12px; }
.member-head h3 { margin: 0; font-size: 18px; }
.member-handle { flex: none; margin-inline-start: -6px; }
.member-no { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--brand-soft); color: var(--brand); font-size: 13px; font-weight: 700; }
.member-name { padding: 1px 8px; border-radius: 6px; background: #f2f4f7; color: var(--muted); font-size: 12px; font-weight: 400; }
.member-actions { display: flex; gap: 8px; margin-inline-start: auto; }
.member-actions .el-button + .el-button { margin-inline-start: 0; }
.member-body { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 18px; align-items: start; }
.member-form { width: 100%; }
.member-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }
.member-grid .span-2 { grid-column: span 2; }
.member-grid .el-select { width: 100%; }
.position-row { display: grid; gap: 8px; width: 100%; }
.position-quick { max-width: 260px; }
.hint-text { margin-block-start: -6px; }
.member-photo { width: 104px; height: 136px; border: 1px solid var(--line); border-radius: 10px; overflow: clip; background: #f3f5f8; }
.photo-preview { display: block; width: 100%; height: 100%; background: #f3f5f8; }
.photo-empty { display: grid; place-items: center; width: 100%; height: 100%; color: var(--muted); font-size: 13px; line-height: 1.5; text-align: center; }
.member-info { min-width: 0; }
.member-gender { padding: 1px 8px; border-radius: 6px; background: #eef4fc; color: var(--brand); font-size: 12px; }
.member-index { margin-inline-start: auto; color: var(--muted); font-size: 12px; }
.member-clergy { margin: 6px 0 10px; color: var(--muted); font-size: 13px; }
.member-fields { display: grid; gap: 8px; margin: 0; }
.member-fields > div { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 10px; align-items: start; }
.member-fields dt { color: var(--muted); font-size: 13px; }
.member-fields dd { margin: 0; font-size: 14px; }
.pre { white-space: pre-line; }
.muted { color: var(--muted); font-size: 13px; }
@media (max-width: 900px) { .detail-layout { grid-template-columns: 1fr; } .member-body { grid-template-columns: 1fr; } .member-grid { grid-template-columns: 1fr; } }
@media (max-width: 560px) {
  .member-card:not(.is-editing) { grid-template-columns: 76px minmax(0, 1fr); gap: 12px; padding: 12px; }
  .member-photo { width: 76px; height: 104px; }
  .member-index { flex-basis: 100%; margin-inline-start: 0; }
  .member-fields > div { grid-template-columns: minmax(0, 1fr); gap: 2px; }
}
</style>
