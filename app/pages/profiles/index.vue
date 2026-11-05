<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { REVIEW_LABELS, REVIEW_TAG_TYPES, myReviewState, reviewActionMessage } from '~~/shared/review'

interface ProfileRow {
  venue_id: number
  venue_name: string
  township: string
  category: string | null
  state: string
  published: number | boolean
  submitted_at: string | null
  town_note: string | null
  county_note: string | null
  updated_at: string | null
}

interface TabItem { value: string, label: string, count: number }

const route = useRoute()
const router = useRouter()
const { admin, hasPerm } = useAdmin()

const list = ref<ProfileRow[]>([])
const total = ref(0)
const counts = ref<Record<string, number>>({ all: 0 })
const query = reactive({ page: 1, pageSize: 10, search: '' })
const loading = ref(false)
let loadSequence = 0

const roleCode = computed(() => admin.value?.roleCode ?? '')
const isReviewer = computed(() => hasPerm('venues:review'))
const canEditVenue = computed(() => hasPerm('venues:edit'))
const myState = computed(() => myReviewState(roleCode.value))
const showMine = computed(() => isReviewer.value && !!myState.value)
// 状态筛选栏仅镇级、县级审核员可见，场所管理员直接看完整列表
const { activeTab, initTab, syncQuery: syncTabQuery } = useReviewStateTab(myState, isReviewer)
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
// 实际请求用的状态：由点击胶囊写入；工具栏查询会把它清空，但不改胶囊选中项
const requestState = ref('')
const stateParam = computed(() => (isReviewer.value ? requestState.value : '') || undefined)
const needsMyReview = (row: any) => showMine.value && row.state === myState.value
const noteOf = (row: any) => (row.state === 'rejected' ? row.county_note || row.town_note || '' : '')

function actionLabel(row: any) {
  if (needsMyReview(row)) return '开始审核'
  if (canEditVenue.value && ['draft', 'rejected'].includes(row.state)) return '填写介绍'
  return '查看介绍'
}

async function load() {
  const sequence = ++loadSequence
  loading.value = true
  try {
    const response = await $fetch<any>('/api/admin/profiles', {
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

// 胶囊选中项只服务于它自己的状态过滤，工具栏查询不读也不改它
function setTab(value: string) {
  activeTab.value = value
  requestState.value = value === 'mine' ? myState.value : value
  query.page = 1
  syncTabQuery(value)
  void load()
}

// 工具栏查询（场所/乡镇关键词）不参与状态筛选：请求不带 state，胶囊外观保持不动
function search() {
  requestState.value = ''
  query.page = 1
  void load()
}

// —— 详情（填报 / 审核） ——
const venueId = ref<number | null>(null)
const currentRow = ref<ProfileRow | null>(null)
const detailLoading = ref(false)
const saving = ref(false)
const profile = ref<Record<string, any> | null>(null)
const form = reactive({
  registration_date: '',
  religion: '',
  category: '',
  manager: '',
  phone: '',
  approval_authority: '',
  credit_code: '',
  address: '',
  summary: ''
})
const extraPairs = ref<{ key: string, value: string }[]>([])

const editable = computed(() => !!profile.value && ['draft', 'rejected'].includes(profile.value.state))
const canEdit = computed(() => canEditVenue.value && editable.value)

function toDateOnly(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function fillForm(row: Record<string, any>) {
  Object.assign(form, {
    registration_date: toDateOnly(row.registration_date),
    religion: row.religion ?? '',
    category: row.category ?? '',
    manager: row.manager ?? '',
    phone: row.phone ?? '',
    approval_authority: row.approval_authority ?? '',
    credit_code: row.credit_code ?? '',
    address: row.address ?? '',
    summary: row.summary ?? ''
  })
  extraPairs.value = Object.entries(row.extra ?? {}).map(([key, value]) => ({ key, value: String(value ?? '') }))
}

async function loadDetail() {
  if (!venueId.value) return
  detailLoading.value = true
  try {
    let response: Record<string, any>
    try {
      response = await $fetch<Record<string, any>>(`/api/admin/profiles/${venueId.value}`)
    } catch (error: any) {
      // 该场所还没有介绍：按空白的填报中记录处理，首次保存时由接口创建
      if (error?.statusCode !== 404) throw error
      response = { venue_id: venueId.value, state: 'draft', published: 0, extra: {} }
    }
    profile.value = response
    fillForm(response)
  } catch (error) {
    profile.value = null
    ElMessage.error(errorMessage(error))
  } finally { detailLoading.value = false }
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
  profile.value = null
  void router.replace({ query: { ...route.query, venue: undefined } })
  await load()
}

function buildExtra() {
  const extra: Record<string, string> = {}
  for (const pair of extraPairs.value) {
    const key = pair.key.trim()
    if (!key && !pair.value.trim()) continue
    if (!key) throw new Error('扩展信息存在未填写名称的条目')
    if (key in extra) throw new Error(`扩展信息名称“${key}”重复`)
    extra[key] = pair.value.trim()
  }
  return extra
}

async function save(options: { silent?: boolean } = {}) {
  try {
    const extra = buildExtra()
    saving.value = true
    const response = await $fetch<Record<string, any>>(`/api/admin/profiles/${venueId.value}`, {
      method: 'PUT',
      body: { ...form, registration_date: form.registration_date || null, extra }
    })
    profile.value = response
    fillForm(response)
    if (!options.silent) ElMessage.success('保存成功')
    return true
  } catch (error) { ElMessage.error(errorMessage(error)); return false } finally { saving.value = false }
}

async function submitReview() {
  if (!buildExtraSafe()) return
  try {
    await ElMessageBox.confirm('确定要提交审核吗？提交后将依次经过镇级、县级审核。', '提示', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
  } catch { return }
  const saved = await save({ silent: true })
  if (!saved) return
  try {
    const response = await $fetch<Record<string, any>>(`/api/admin/profiles/${venueId.value}/review`, { method: 'POST', body: { action: 'submit' } })
    profile.value = response
    fillForm(response)
    ElMessage.success('已提交审核')
  } catch (error) { ElMessage.error(errorMessage(error)) }
}

function buildExtraSafe() {
  try {
    buildExtra()
    return true
  } catch (error) {
    ElMessage.warning((error as Error).message)
    return false
  }
}

async function review(action: string, reason?: string) {
  try {
    const response = await $fetch<Record<string, any>>(`/api/admin/profiles/${venueId.value}/review`, { method: 'POST', body: { action, reason } })
    profile.value = response
    fillForm(response)
    ElMessage.success(reviewActionMessage(action))
  } catch (error) { ElMessage.error(errorMessage(error)) }
}

async function publish(value: string | number | boolean) {
  const published = Boolean(value)
  try {
    const response = await $fetch<Record<string, any>>(`/api/admin/profiles/${venueId.value}/publish`, { method: 'POST', body: { published } })
    profile.value = response
    ElMessage.success(published ? '已公开' : '已取消公开')
  } catch (error) { ElMessage.error(errorMessage(error)) }
}

watch(() => [query.page, query.pageSize], () => { void load() })

onMounted(async () => {
  mounted.value = true
  initTab()
  requestState.value = activeTab.value === 'mine' ? myState.value : activeTab.value
  await load()
  const initialVenue = Number(route.query.venue)
  if (Number.isSafeInteger(initialVenue) && initialVenue > 0) {
    venueId.value = initialVenue
    await loadDetail()
  }
})
</script>

<template>
  <div class="page">
    <template v-if="!venueId">
      <StateTabs v-if="mounted && isReviewer" :tabs="tabs" :model-value="activeTab" @update:model-value="setTab" />

      <section class="panel" aria-label="场所介绍列表">
        <div class="toolbar">
          <el-input v-model="query.search" placeholder="搜索场所或乡镇" clearable @keyup.enter="search" @clear="search" />
          <el-button type="primary" plain @click="search">查询</el-button>
          <div class="toolbar-actions">
            <span class="toolbar-note">共 {{ total }} 条</span>
            <el-button :loading="loading" @click="load">刷新</el-button>
          </div>
        </div>

        <div class="table-region" tabindex="0" role="region" aria-label="场所介绍列表">
          <el-table v-loading="loading" :data="list">
            <el-table-column prop="venue_name" label="场所名称" min-width="170" />
            <el-table-column prop="township" label="乡镇" width="110" />
            <el-table-column label="场所类别" width="120">
              <template #default="{ row }">{{ row.category || '—' }}</template>
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
              <template #default="{ row }">{{ row.submitted_at ? formatDateTime(row.submitted_at) : '尚未提交' }}</template>
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
      <div v-if="profile" v-loading="detailLoading" class="detail-layout">
        <section class="panel">
          <el-form label-position="top" :disabled="!canEdit" @submit.prevent="save">
            <div class="form-grid">
              <el-form-item label="登记时间"><el-date-picker v-model="form.registration_date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" /></el-form-item>
              <el-form-item label="教别"><el-input v-model="form.religion" maxlength="50" placeholder="请输入宗教，如：佛教、道教" /></el-form-item>
              <el-form-item label="场所类别"><el-input v-model="form.category" maxlength="50" placeholder="请输入场所类别" /></el-form-item>
              <el-form-item label="负责人"><el-input v-model="form.manager" maxlength="50" placeholder="请输入场所负责人" /></el-form-item>
              <el-form-item label="联系电话"><el-input v-model="form.phone" maxlength="30" placeholder="请输入联系电话" /></el-form-item>
              <el-form-item label="社会信用代码"><el-input v-model="form.credit_code" maxlength="50" placeholder="请输入社会信用代码" /></el-form-item>
              <el-form-item label="批准设立机构" class="span-2"><el-input v-model="form.approval_authority" maxlength="150" placeholder="请输入批准设立机构" /></el-form-item>
              <el-form-item label="场所地址" class="span-2"><el-input v-model="form.address" maxlength="255" placeholder="请输入场所地址" /></el-form-item>
            </div>
            <el-form-item label="场所简介">
              <RichTextEditor v-if="canEdit" v-model="form.summary" />
              <div v-else class="summary-view" v-html="form.summary || '<p class=muted>暂无简介</p>'" />
            </el-form-item>
            <el-form-item label="更多介绍">
              <div class="extra-list">
                <div v-for="(pair, index) in extraPairs" :key="index" class="extra-row">
                  <span class="muted extra-index">介绍{{ index + 1 }}</span>
                  <el-input v-model="pair.key" placeholder="名称" maxlength="50" aria-label="介绍名称" />
                  <el-input v-model="pair.value" placeholder="内容" maxlength="500" aria-label="介绍内容" />
                  <el-button v-if="canEdit" size="small" type="danger" plain aria-label="删除该介绍" @click="extraPairs.splice(index, 1)">删除</el-button>
                </div>
                <el-button v-if="canEdit" type="success" plain @click="extraPairs.push({ key: '', value: '' })">＋ 添加更多介绍</el-button>
                <p v-if="!extraPairs.length" class="muted">可添加“建筑面积”“始建年代”等自定义介绍条目。</p>
              </div>
            </el-form-item>
            <template v-if="canEdit">
              <div class="form-actions">
                <el-button type="primary" native-type="submit" :loading="saving">保存</el-button>
                <el-button type="success" :loading="saving" @click="submitReview">提交审核</el-button>
              </div>
              <p class="muted action-hint">场所介绍编辑完成后，点击“提交审核”按钮进行审核。</p>
            </template>
            <p v-else-if="canEditVenue && !editable" class="muted">当前状态为审核流程中，如需修改请先使用右侧“重新编辑”退回。</p>
          </el-form>
        </section>
        <aside class="panel review-side">
          <ReviewTimeline :record="profile" />
          <div v-if="hasPerm('venues:publish')" class="publish-box">
            <span>是否公开</span>
            <el-switch :model-value="!!profile.published" :disabled="profile.state !== 'approved'" :aria-label="`${currentRow?.venue_name ?? venueId}场所介绍是否公开`" @change="publish" />
          </div>
          <ReviewActions :state="profile.state" edit-permission="venues:edit" review-permission="venues:review" hide-submit @action="review" />
        </aside>
      </div>
      <el-empty v-else-if="!detailLoading" description="未找到该场所的介绍" />
    </template>
  </div>
</template>

<style scoped>
.toolbar .el-input { max-width: 300px; }
.note-danger { color: #b42318; }
.detail-venue { font-size: 16px; }
.town-chip { padding: 1px 8px; border-radius: 6px; background: #f2f4f7; color: var(--muted); font-size: 12px; }

.detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 22px; align-items: start; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }
.span-2 { grid-column: span 2; }
.review-side { display: grid; gap: 20px; align-content: start; }
.publish-box { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; }
.summary-view { border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; width: 100%; min-height: 120px; }
.extra-list { display: grid; gap: 10px; width: 100%; }
.extra-row { display: grid; grid-template-columns: auto minmax(110px, 200px) minmax(0, 1fr) auto; gap: 10px; align-items: center; }
.extra-index { white-space: nowrap; }
.form-actions { display: flex; gap: 12px; }
.action-hint { margin-block-start: 10px; }
.muted { color: var(--muted); font-size: 13px; }
@media (max-width: 900px) {
  .detail-layout { grid-template-columns: 1fr; }
  .form-grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: span 1; }
}
</style>
