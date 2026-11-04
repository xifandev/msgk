<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { REVIEW_LABELS, REVIEW_TAG_TYPES, reviewActionMessage } from '~~/shared/review'
const route = useRoute()
const { hasPerm } = useAdmin()
const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const filters = reactive({ page: 1, pageSize: 10, search: '', state: '', published: '', venueId: null as number | null })
const editorVisible = ref(false)
const saving = ref(false)
const form = reactive({ id: 0, title: '', venueIds: [] as number[], coverUrl: '', authorName: '', authorRole: '', content: '' })
const detailVisible = ref(false)
const current = ref<Record<string, any>>({})
const timelineRecord = computed(() => ({
  ...current.value,
  submitted_at: current.value.submittedAt,
  town_reviewed_at: current.value.townReviewedAt,
  town_note: current.value.townNote,
  county_reviewed_at: current.value.countyReviewedAt,
  county_note: current.value.countyNote
}))

async function load() {
  loading.value = true
  try {
    const response = await $fetch<{ list: any[], total: number }>('/api/admin/safety', {
      query: { page: filters.page, pageSize: filters.pageSize, search: filters.search || undefined, state: filters.state || undefined, published: filters.published || undefined, venueId: filters.venueId ?? undefined }
    })
    list.value = response.list
    total.value = response.total
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { loading.value = false }
}
function search() {
  filters.page = 1
  load()
}
async function openDetail(row: any) {
  try {
    current.value = await $fetch<Record<string, any>>(`/api/admin/safety/${row.id}`)
    detailVisible.value = true
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
async function editArticle(row?: any) {
  if (!row) {
    Object.assign(form, { id: 0, title: '', venueIds: [], coverUrl: '', authorName: '', authorRole: '', content: '' })
    editorVisible.value = true
    return
  }
  try {
    const detail = await $fetch<any>(`/api/admin/safety/${row.id}`)
    Object.assign(form, {
      id: detail.id, title: detail.title, venueIds: [...detail.venueIds],
      coverUrl: detail.coverUrl ?? '', authorName: detail.authorName ?? '',
      authorRole: detail.authorRole ?? '', content: detail.content ?? ''
    })
    editorVisible.value = true
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
function rowIndex(index: number) {
  return (filters.page - 1) * filters.pageSize + index + 1
}
function hasTextContent(html: string) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0
}
async function saveArticle() {
  if (!form.title.trim()) { ElMessage.warning('请填写标题'); return }
  if (!form.venueIds.length) { ElMessage.warning('请选择关联场所'); return }
  if (!hasTextContent(form.content)) { ElMessage.warning('请填写安全内容'); return }
  saving.value = true
  try {
    await $fetch(form.id ? `/api/admin/safety/${form.id}` : '/api/admin/safety', { method: form.id ? 'PUT' : 'POST', body: form })
    ElMessage.success(form.id ? '文章已保存' : '文章已创建')
    editorVisible.value = false
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { saving.value = false }
}
async function removeArticle(row: any) {
  await ElMessageBox.confirm(`确定删除安全文章《${row.title}》吗？`, '删除文章', { type: 'warning' })
  try {
    await $fetch(`/api/admin/safety/${row.id}`, { method: 'DELETE' })
    ElMessage.success('文章已删除')
    await load()
  } catch (error) { if (error !== 'cancel') ElMessage.error(errorMessage(error)) }
}
async function review(action: string, reason?: string) {
  try {
    await $fetch(`/api/admin/safety/${current.value.id}/review`, { method: 'POST', body: { action, reason } })
    ElMessage.success(reviewActionMessage(action))
    await Promise.all([load(), openDetail(current.value)])
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
async function publish(row: any) {
  try {
    await $fetch(`/api/admin/safety/${row.id}/publish`, { method: 'POST', body: { published: Boolean(row.published) } })
    ElMessage.success(row.published ? '文章已公开' : '文章已取消公开')
  } catch (error) { row.published = row.published ? 0 : 1; ElMessage.error(errorMessage(error)) }
}
watch(() => [filters.page, filters.pageSize, filters.state, filters.published, filters.venueId], load)
onMounted(() => {
  const state = String(route.query.state ?? '')
  if (state && state in REVIEW_LABELS) filters.state = state
  load()
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div><h1>场所安全</h1><p>编写场所安全知识文章，关联场所并提交两级审核，审核通过后向公众公开。</p></div>
      <el-button v-if="hasPerm('safety:edit')" type="primary" @click="editArticle()">新建安全文章</el-button>
    </div>
    <section class="panel">
      <div class="toolbar">
        <VenueSelect v-model="filters.venueId" clearable />
        <el-input v-model="filters.search" placeholder="请输入安全标题" clearable aria-label="搜索文章标题" @keyup.enter="search" @clear="search" />
        <el-select v-model="filters.state" clearable placeholder="全部状态" aria-label="按审核状态筛选">
          <el-option v-for="(label, value) in REVIEW_LABELS" :key="value" :label="label" :value="value" />
        </el-select>
        <el-select v-model="filters.published" clearable placeholder="公开状态" aria-label="按公开状态筛选">
          <el-option label="已公开" value="1" />
          <el-option label="未公开" value="0" />
        </el-select>
        <el-button @click="search">查询</el-button>
        <span class="muted">{{ total }}条数据</span>
      </div>
      <div class="table-region" tabindex="0" role="region" aria-label="安全文章列表">
        <el-table v-loading="loading" :data="list">
          <el-table-column type="index" label="序号" width="64" :index="rowIndex" />
          <el-table-column prop="title" label="安全标题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="venueNames" label="场所名称" min-width="180" show-overflow-tooltip><template #default="{ row }">{{ row.venueNames || '—' }}</template></el-table-column>
          <el-table-column prop="authorName" label="编辑角色" width="110"><template #default="{ row }">{{ row.authorName || '—' }}</template></el-table-column>
          <el-table-column label="状态" width="130">
            <template #default="{ row }"><el-tag :type="REVIEW_TAG_TYPES[row.state]">{{ REVIEW_LABELS[row.state] }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="updatedAt" label="编辑时间" width="170"><template #default="{ row }">{{ row.updatedAt || '—' }}</template></el-table-column>
          <el-table-column v-if="hasPerm('safety:publish')" label="是否公开" width="100">
            <template #default="{ row }">
              <el-tooltip content="审核通过后才能公开" :disabled="row.state === 'approved'" placement="top">
                <el-switch v-model="row.published" :active-value="1" :inactive-value="0" :disabled="row.state !== 'approved'" :aria-label="`《${row.title}》公开状态`" @change="publish(row)" />
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <el-button text type="primary" @click="openDetail(row)">查看/处理</el-button>
              <el-button v-if="hasPerm('safety:edit') && ['draft', 'rejected'].includes(row.state)" text bg type="primary" @click="editArticle(row)">编辑</el-button>
              <el-button v-if="hasPerm('safety:delete') && ['draft', 'rejected'].includes(row.state)" text type="danger" @click="removeArticle(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="pagination"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" :total="total" :page-sizes="[5, 10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" /></div>
    </section>

    <el-dialog v-model="editorVisible" :title="form.id ? '编辑安全文章' : '新建安全文章'" width="min(880px, 96vw)" destroy-on-close>
      <el-form label-position="top" @submit.prevent="saveArticle">
        <el-form-item label="关联场所" required><VenueSelect v-model="form.venueIds" multiple /></el-form-item>
        <el-form-item label="标题" required><el-input v-model="form.title" maxlength="200" show-word-limit /></el-form-item>
        <div class="form-grid">
          <el-form-item label="作者"><el-input v-model="form.authorName" maxlength="50" /></el-form-item>
          <el-form-item label="作者身份"><el-input v-model="form.authorRole" maxlength="32" placeholder="如：安全员、场所负责人" /></el-form-item>
        </div>
        <el-form-item label="封面图片"><ImageUpload v-model="form.coverUrl" label="文章封面" /></el-form-item>
        <el-form-item label="正文内容" required><RichTextEditor v-model="form.content" /></el-form-item>
        <el-button type="primary" native-type="submit" :loading="saving">保存文章</el-button>
      </el-form>
    </el-dialog>

    <el-drawer v-model="detailVisible" size="min(900px, 96vw)" :title="current.title ?? '文章详情'">
      <div class="detail-layout">
        <section>
          <el-descriptions :column="2" border class="detail-meta">
            <el-descriptions-item label="关联场所" :span="2">{{ current.venueNames || '—' }}</el-descriptions-item>
            <el-descriptions-item label="作者">{{ current.authorName || '—' }}</el-descriptions-item>
            <el-descriptions-item label="作者身份">{{ current.authorRole || '—' }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{ current.updatedAt || '—' }}</el-descriptions-item>
            <el-descriptions-item label="公开状态">{{ current.published ? '已公开' : '未公开' }}</el-descriptions-item>
          </el-descriptions>
          <el-image v-if="current.coverUrl" :src="current.coverUrl" fit="cover" class="detail-cover" alt="文章封面" />
          <article class="rich-content" v-html="current.content" />
        </section>
        <aside class="review-side">
          <ReviewTimeline :record="timelineRecord" />
          <ReviewActions :state="current.state" edit-permission="safety:edit" review-permission="safety:review" @action="review" />
          <el-button v-if="hasPerm('safety:edit') && ['draft', 'rejected'].includes(current.state)" @click="detailVisible = false; editArticle(current)">修改内容</el-button>
        </aside>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.muted { color: var(--muted); font-size: 13px; }
.toolbar .el-input { max-width: 260px; }
.toolbar .el-select { min-width: 160px; }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0 18px; }
.detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 24px; }
.detail-meta { margin-block-end: 16px; }
.detail-cover { width: 100%; max-height: 260px; border-radius: 10px; margin-block-end: 16px; }
.rich-content { line-height: 1.8; word-break: break-word; }
.rich-content :deep(img) { max-width: 100%; height: auto; }
.review-side { display: grid; align-content: start; gap: 20px; }
@media (max-width: 760px) { .detail-layout { grid-template-columns: 1fr; } }
</style>
