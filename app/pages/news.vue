<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
const { admin, hasPerm } = useAdmin()
const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const categories = ref<any[]>([])
const filters = reactive({ page: 1, pageSize: 10, search: '', categoryId: null as number | null, published: '' })
const editorVisible = ref(false)
const saving = ref(false)
const form = reactive({ id: 0, categoryId: null as number | null, title: '', summary: '', coverUrl: '', authorName: '', content: '' })
const categoryVisible = ref(false)
const categoryForm = reactive({ id: 0, name: '', sortOrder: 0 })
const categorySaving = ref(false)

async function load() {
  loading.value = true
  try {
    const response = await $fetch<{ list: any[], total: number }>('/api/admin/news', {
      query: { page: filters.page, pageSize: filters.pageSize, search: filters.search || undefined, categoryId: filters.categoryId ?? undefined, published: filters.published || undefined }
    })
    list.value = response.list
    total.value = response.total
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { loading.value = false }
}
async function loadCategories() {
  try {
    const response = await $fetch<{ list: any[] }>('/api/admin/news/categories')
    categories.value = response.list
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
function rowIndex(index: number) {
  return (filters.page - 1) * filters.pageSize + index + 1
}
function search() {
  filters.page = 1
  load()
}
async function editArticle(row?: any) {
  if (!row) {
    Object.assign(form, { id: 0, categoryId: null, title: '', summary: '', coverUrl: '', authorName: admin.value?.name ?? '', content: '' })
    editorVisible.value = true
    return
  }
  try {
    const detail = await $fetch<any>(`/api/admin/news/${row.id}`)
    Object.assign(form, {
      id: detail.id, categoryId: detail.categoryId, title: detail.title,
      summary: detail.summary ?? '', coverUrl: detail.coverUrl ?? '', authorName: detail.authorName ?? '', content: detail.content ?? ''
    })
    editorVisible.value = true
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
async function saveArticle() {
  if (!form.categoryId) { ElMessage.warning('请选择文章分类'); return }
  if (!form.title.trim()) { ElMessage.warning('请填写文章标题'); return }
  if (!form.summary.trim()) { ElMessage.warning('请填写标题摘要'); return }
  if (!form.content.trim()) { ElMessage.warning('请填写文章内容'); return }
  saving.value = true
  try {
    await $fetch(form.id ? `/api/admin/news/${form.id}` : '/api/admin/news', { method: form.id ? 'PUT' : 'POST', body: form })
    ElMessage.success(form.id ? '文章已保存' : '文章已创建')
    editorVisible.value = false
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { saving.value = false }
}
async function removeArticle(row: any) {
  await ElMessageBox.confirm(`确定删除文章《${row.title}》吗？`, '删除文章', { type: 'warning' })
  try {
    await $fetch(`/api/admin/news/${Number(row.id)}`, { method: 'DELETE' })
    ElMessage.success('文章已删除')
    await Promise.all([load(), loadCategories()])
  } catch (error) { if (error !== 'cancel') ElMessage.error(errorMessage(error)) }
}
async function publish(row: any) {
  try {
    await $fetch(`/api/admin/news/${row.id}/publish`, { method: 'POST', body: { published: Boolean(row.published) } })
    ElMessage.success(row.published ? '文章已发布' : '文章已取消发布')
  } catch (error) { row.published = row.published ? 0 : 1; ElMessage.error(errorMessage(error)) }
}
function editCategory(row?: any) {
  Object.assign(categoryForm, row ? { id: row.id, name: row.name, sortOrder: row.sortOrder } : { id: 0, name: '', sortOrder: 0 })
}
async function saveCategory() {
  if (!categoryForm.name.trim()) { ElMessage.warning('请填写分类名称'); return }
  categorySaving.value = true
  try {
    await $fetch(categoryForm.id ? `/api/admin/news/categories/${categoryForm.id}` : '/api/admin/news/categories', {
      method: categoryForm.id ? 'PUT' : 'POST',
      body: { name: categoryForm.name, sortOrder: categoryForm.sortOrder }
    })
    ElMessage.success('分类已保存')
    categoryForm.id = 0
    categoryForm.name = ''
    categoryForm.sortOrder = 0
    await loadCategories()
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { categorySaving.value = false }
}
async function removeCategory(row: any) {
  await ElMessageBox.confirm(`确定删除分类「${row.name}」吗？`, '删除分类', { type: 'warning' })
  try {
    await $fetch(`/api/admin/news/categories/${row.id}`, { method: 'DELETE' })
    ElMessage.success('分类已删除')
    if (filters.categoryId === row.id) filters.categoryId = null
    await loadCategories()
  } catch (error) { if (error !== 'cancel') ElMessage.error(errorMessage(error)) }
}
watch(() => [filters.page, filters.pageSize, filters.categoryId, filters.published], load)
onMounted(() => { load(); loadCategories() })
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div><h1>新闻与法规</h1><p>维护新闻与法规文章及分类，发布后向公众展示。</p></div>
      <div class="header-actions">
        <el-button v-if="hasPerm('news:edit')" @click="categoryVisible = true">管理分类</el-button>
        <el-button v-if="hasPerm('news:edit')" type="primary" @click="editArticle()">新建文章</el-button>
      </div>
    </div>
    <section class="panel">
      <div class="toolbar">
        <el-input v-model="filters.search" placeholder="搜索文章标题" clearable aria-label="搜索文章标题" @keyup.enter="search" @clear="search" />
        <el-select v-model="filters.categoryId" clearable placeholder="文章分类" aria-label="按分类筛选">
          <el-option v-for="category in categories" :key="category.id" :value="category.id" :label="category.name" />
        </el-select>
        <el-select v-model="filters.published" clearable placeholder="发布状态" aria-label="按发布状态筛选">
          <el-option label="已发布" value="1" />
          <el-option label="未发布" value="0" />
        </el-select>
        <el-button @click="search">查询</el-button>
      </div>
      <div class="table-region" tabindex="0" role="region" aria-label="新闻文章列表">
        <el-table v-loading="loading" :data="list">
          <el-table-column type="index" label="序号" width="64" :index="rowIndex" />
          <el-table-column prop="categoryName" label="分类" width="120" />
          <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="authorName" label="作者" width="110"><template #default="{ row }">{{ row.authorName || '—' }}</template></el-table-column>
          <el-table-column prop="createdAt" label="发布时间" width="170" />
          <el-table-column v-if="hasPerm('news:publish')" label="状态" width="100">
            <template #default="{ row }"><el-switch v-model="row.published" :active-value="1" :inactive-value="0" inline-prompt active-text="发布" inactive-text="隐藏" :aria-label="`《${row.title}》发布状态`" @change="publish(row)" /></template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right" align="right">
            <template #default="{ row }">
              <TableActions>
                <el-button v-if="hasPerm('news:edit')" size="small" type="primary" :aria-label="`编辑《${row.title}》`" @click="editArticle(row)">编辑</el-button>
                <el-button v-if="hasPerm('news:delete')" size="small" type="danger" plain :aria-label="`删除《${row.title}》`" @click="removeArticle(row)">删除</el-button>
              </TableActions>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="pagination"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" :total="total" :page-sizes="[5, 10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" /></div>
    </section>

    <el-dialog v-model="editorVisible" :title="form.id ? '编辑文章' : '新建文章'" width="min(960px, 94vw)" destroy-on-close>
      <el-form label-position="top" @submit.prevent="saveArticle">
        <div class="form-grid">
          <el-form-item required>
            <template #label>
              文章分类
              <el-tooltip content="添加/修改分类请点击列表页右上角【管理分类】" placement="top">
                <el-icon class="label-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </template>
            <el-select v-model="form.categoryId" placeholder="请选择文章分类">
              <el-option v-for="category in categories" :key="category.id" :value="category.id" :label="category.name" />
            </el-select>
          </el-form-item>
          <el-form-item label="作者"><el-input v-model="form.authorName" maxlength="50" placeholder="请输入作者" /></el-form-item>
        </div>
        <el-form-item label="标题" required><el-input v-model="form.title" maxlength="200" show-word-limit placeholder="请输入文章标题" /></el-form-item>
        <el-form-item required>
          <template #label>
            摘要
            <el-tooltip content="8个字内的标题摘要，用作封面展示" placement="top">
              <el-icon class="label-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </template>
          <el-input v-model="form.summary" maxlength="8" show-word-limit placeholder="请输入标题摘要" />
        </el-form-item>
        <el-form-item label="封面图片"><ImageUpload v-model="form.coverUrl" label="文章封面" /></el-form-item>
        <el-form-item label="正文内容" required><RichTextEditor v-model="form.content" /></el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-actions">
          <el-button @click="editorVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveArticle">保存文章</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="categoryVisible" title="管理文章分类" width="min(560px, 94vw)">
      <el-form class="category-form" @submit.prevent="saveCategory">
        <el-form-item label="分类名称" required><el-input v-model="categoryForm.name" maxlength="50" /></el-form-item>
        <el-form-item label="排序值"><el-input-number v-model="categoryForm.sortOrder" :min="0" :max="9999" /></el-form-item>
      </el-form>
      <el-table :data="categories" aria-label="文章分类列表">
        <el-table-column prop="name" label="分类名称" min-width="140" />
        <el-table-column prop="sortOrder" label="排序" width="80" />
        <el-table-column prop="articleCount" label="文章数" width="90" />
        <el-table-column label="操作" width="150" align="right">
          <template #default="{ row }">
            <TableActions>
              <el-button size="small" type="primary" :aria-label="`编辑分类${row.name}`" @click="editCategory(row)">编辑</el-button>
              <el-button v-if="hasPerm('news:delete')" size="small" type="danger" plain :disabled="row.articleCount > 0" :title="row.articleCount > 0 ? '分类下还有文章，不能删除' : ''" :aria-label="`删除分类${row.name}`" @click="removeCategory(row)">删除</el-button>
            </TableActions>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <div class="dialog-actions">
          <el-button v-if="categoryForm.id" @click="editCategory()">取消编辑</el-button>
          <el-button type="primary" :loading="categorySaving" @click="saveCategory">{{ categoryForm.id ? '保存分类' : '添加分类' }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.label-icon { margin-inline-start: 4px; color: var(--muted); vertical-align: -2px; }
.toolbar .el-input { max-width: 260px; }
.toolbar .el-select { min-width: 160px; }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0 18px; }
.form-grid .el-select { width: 100%; }
.category-form { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; margin-block-end: 16px; }
.category-form .el-form-item { margin-block-end: 0; }
</style>
