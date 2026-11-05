<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

const { admin } = useAdmin()
// 场所安全：仅县级可发布/编辑/删除/设置公开；镇级与场所仅阅读查看
const isCounty = computed(() => ['county', 'super'].includes(admin.value?.roleCode ?? ''))
const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const filters = reactive({ page: 1, pageSize: 10, search: '', published: '', venueId: null as number | null })
const editorVisible = ref(false)
const saving = ref(false)
const form = reactive({ id: 0, title: '', authorName: '', content: '' })
const { snapshot: snapshotForm, confirmClose: confirmCloseEditor } = useDirtyClose(form)
const detailVisible = ref(false)
const current = ref<Record<string, any>>({})

async function load() {
  loading.value = true
  try {
    const response = await $fetch<{ list: any[], total: number }>('/api/admin/safety', {
      query: { page: filters.page, pageSize: filters.pageSize, search: filters.search || undefined, published: filters.published || undefined, venueId: filters.venueId ?? undefined }
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
    Object.assign(form, { id: 0, title: '', authorName: '', content: '' })
    editorVisible.value = true
    snapshotForm()
    return
  }
  try {
    const detail = await $fetch<any>(`/api/admin/safety/${row.id}`)
    Object.assign(form, { id: detail.id, title: detail.title, authorName: detail.authorName ?? '', content: detail.content ?? '' })
    editorVisible.value = true
    snapshotForm()
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
  if (!hasTextContent(form.content)) { ElMessage.warning('请填写安全内容'); return }
  saving.value = true
  try {
    await $fetch(form.id ? `/api/admin/safety/${form.id}` : '/api/admin/safety', { method: form.id ? 'PUT' : 'POST', body: form })
    ElMessage.success(form.id ? '文章已保存' : '文章已发布')
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
async function publish(row: any) {
  try {
    await $fetch(`/api/admin/safety/${row.id}/publish`, { method: 'POST', body: { published: Boolean(row.published) } })
    ElMessage.success(row.published ? '文章已公开' : '文章已取消公开')
  } catch (error) { row.published = row.published ? 0 : 1; ElMessage.error(errorMessage(error)) }
}
watch(() => [filters.page, filters.pageSize, filters.published, filters.venueId], load)
onMounted(load)
</script>

<template>
  <div class="page">
    <section class="panel">
      <div class="toolbar">
        <VenueSelect v-model="filters.venueId" clearable style="width: 220px" />
        <el-input v-model="filters.search" placeholder="请输入安全标题" clearable aria-label="搜索文章标题" @keyup.enter="search" @clear="search" />
        <el-select v-if="isCounty" v-model="filters.published" clearable placeholder="公开状态" aria-label="按公开状态筛选">
          <el-option label="已公开" value="1" />
          <el-option label="未公开" value="0" />
        </el-select>
        <el-button plain @click="search">查询</el-button>
        <div class="toolbar-actions">
          <el-button v-if="isCounty" type="primary" :icon="Plus" @click="editArticle()">新建安全文章</el-button>
        </div>
      </div>
      <div class="table-region" tabindex="0" role="region" aria-label="安全文章列表">
        <el-table v-loading="loading" :data="list">
          <el-table-column type="index" label="序号" width="64" :index="rowIndex" />
          <el-table-column prop="title" label="安全标题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="authorName" label="发布人" width="100"><template #default="{ row }">{{ row.authorName || '—' }}</template></el-table-column>
          <el-table-column prop="publishUnit" label="发布单位" min-width="140" show-overflow-tooltip><template #default="{ row }">{{ row.publishUnit || '—' }}</template></el-table-column>
          <el-table-column prop="createdAt" label="发布时间" width="200"><template #default="{ row }"><span class="time-cell">{{ row.createdAt || '—' }}</span></template></el-table-column>
          <el-table-column v-if="isCounty" label="是否公开" width="100">
            <template #default="{ row }">
              <el-switch v-model="row.published" :active-value="1" :inactive-value="0" :aria-label="`《${row.title}》公开状态`" @change="publish(row)" />
            </template>
          </el-table-column>
          <el-table-column label="操作" :width="isCounty ? 216 : 120" fixed="right" align="right">
            <template #default="{ row }">
              <TableActions>
                <el-button size="small" type="primary" :aria-label="`${isCounty ? '查看并处理' : '阅读查看'}《${row.title}》`" @click="openDetail(row)">{{ isCounty ? '查看/处理' : '阅读查看' }}</el-button>
                <template v-if="isCounty">
                  <el-button size="small" type="primary" plain :aria-label="`编辑《${row.title}》`" @click="editArticle(row)">编辑</el-button>
                  <el-button size="small" type="danger" plain :aria-label="`删除《${row.title}》`" @click="removeArticle(row)">删除</el-button>
                </template>
              </TableActions>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="pagination"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" :total="total" :page-sizes="[5, 10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" /></div>
    </section>

    <el-dialog v-model="editorVisible" :title="form.id ? '编辑安全文章' : '新建安全文章'" width="min(960px, 94vw)" destroy-on-close :before-close="confirmCloseEditor">
      <el-form label-position="top" @submit.prevent="saveArticle">
        <el-form-item label="标题" required><el-input v-model="form.title" maxlength="200" show-word-limit /></el-form-item>
        <el-form-item label="发布人"><el-input v-model="form.authorName" maxlength="50" placeholder="默认为当前管理员姓名" /></el-form-item>
        <el-form-item label="正文内容" required><RichTextEditor v-model="form.content" /></el-form-item>
        <p class="muted">保存后自动发布到全部场所，无需选择关联场所。</p>
      </el-form>
      <template #footer>
        <div class="dialog-actions">
          <el-button @click="confirmCloseEditor(() => editorVisible = false)">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveArticle">保存文章</el-button>
        </div>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" class="safety-drawer" size="min(900px, 96vw)" :title="current.title ?? '文章详情'">
      <div class="detail-main">
        <el-descriptions :column="2" border class="detail-meta">
          <el-descriptions-item label="发布人">{{ current.authorName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="发布单位">{{ current.publishUnit || '—' }}</el-descriptions-item>
          <el-descriptions-item label="发布时间">{{ current.createdAt || '—' }}</el-descriptions-item>
          <el-descriptions-item v-if="isCounty" label="公开状态">{{ current.published ? '已公开' : '未公开' }}</el-descriptions-item>
        </el-descriptions>
        <article class="rich-content" v-html="current.content" />
        <el-button v-if="isCounty" class="detail-edit" @click="detailVisible = false; editArticle(current)">修改内容</el-button>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.muted { color: var(--muted); font-size: 13px; }
.time-cell { white-space: nowrap; }
.toolbar .el-input { max-width: 260px; }
.toolbar .el-select { min-width: 160px; }
:global(.safety-drawer .el-drawer__body) { container-type: inline-size; }
.detail-main { min-width: 0; }
.detail-meta { margin-block-end: 16px; }
.rich-content { line-height: 1.8; word-break: break-word; }
.rich-content :deep(img) { max-width: 100%; height: auto; }
.detail-edit { margin-block-start: 20px; }
</style>
