<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, QuestionFilled, Rank, View, Clock } from '@element-plus/icons-vue'
import Sortable from 'sortablejs'
const { admin, hasPerm } = useAdmin()
const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const categories = ref<any[]>([])
const filters = reactive({ page: 1, pageSize: 10, search: '', categoryId: null as number | null, published: '' })
const editorVisible = ref(false)
const saving = ref(false)
const form = reactive({ id: 0, categoryId: null as number | null, title: '', summary: '', coverUrl: '', authorName: '', content: '' })
const previewDate = ref('')
const detailVisible = ref(false)
const detailLoading = ref(false)
const current = ref<Record<string, any>>({})
const isCounty = computed(() => admin.value?.roleCode === 'county')
const categoryVisible = ref(false)
const categoryForm = reactive({ id: 0, name: '' })
const categorySaving = ref(false)
const categoryOrderSaving = ref(false)
const categoryTableRef = ref<HTMLElement | null>(null)
let categorySortable: Sortable | null = null

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
async function openDetail(row: any) {
  detailLoading.value = true
  detailVisible.value = true
  try {
    const detail = await $fetch<any>(`/api/admin/news/${row.id}`)
    current.value = detail
  } catch (error) {
    ElMessage.error(errorMessage(error))
    detailVisible.value = false
  } finally { detailLoading.value = false }
}
function closeDetail() {
  detailVisible.value = false
}
function formatDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
async function editArticle(row?: any) {
  if (!row) {
    Object.assign(form, { id: 0, categoryId: null, title: '', summary: '', coverUrl: '', authorName: admin.value?.name ?? '', content: '' })
    previewDate.value = formatDate(new Date())
    editorVisible.value = true
    return
  }
  try {
    const detail = await $fetch<any>(`/api/admin/news/${row.id}`)
    Object.assign(form, {
      id: detail.id, categoryId: detail.categoryId, title: detail.title,
      summary: detail.summary ?? '', coverUrl: detail.coverUrl ?? '', authorName: detail.authorName ?? '', content: detail.content ?? ''
    })
    previewDate.value = String(detail.createdAt ?? '').slice(0, 10) || formatDate(new Date())
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
  Object.assign(categoryForm, row ? { id: row.id, name: row.name } : { id: 0, name: '' })
}
async function saveCategory() {
  if (!categoryForm.name.trim()) { ElMessage.warning('请填写分类名称'); return }
  categorySaving.value = true
  try {
    await $fetch(categoryForm.id ? `/api/admin/news/categories/${categoryForm.id}` : '/api/admin/news/categories', {
      method: categoryForm.id ? 'PUT' : 'POST',
      body: { name: categoryForm.name }
    })
    ElMessage.success('分类已保存')
    categoryForm.id = 0
    categoryForm.name = ''
    await loadCategories()
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { categorySaving.value = false }
}
function destroyCategorySortable() {
  categorySortable?.destroy()
  categorySortable = null
}
async function initCategorySortable() {
  await nextTick()
  destroyCategorySortable()
  const tbody = categoryTableRef.value?.querySelector('.el-table__body-wrapper tbody')
  if (!tbody) return
  categorySortable = Sortable.create(tbody as HTMLElement, {
    animation: 180,
    handle: '.drag-handle',
    draggable: '.el-table__row',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    fallbackOnBody: true,
    onEnd: reorderCategory
  })
}
async function reorderCategory(event: Sortable.SortableEvent) {
  if (event.oldIndex === undefined || event.newIndex === undefined || event.oldIndex === event.newIndex) return
  const previous = [...categories.value]
  const [moved] = categories.value.splice(event.oldIndex, 1)
  if (!moved) return
  categories.value.splice(event.newIndex, 0, moved)
  categoryOrderSaving.value = true
  categorySortable?.option('disabled', true)
  try {
    await $fetch('/api/admin/news/categories-reorder', {
      method: 'PUT',
      body: { ids: categories.value.map(category => category.id) }
    })
    categories.value.forEach((category, index) => { category.sortOrder = index + 1 })
    ElMessage.success('分类顺序已保存')
  } catch (error) {
    categories.value = previous
    ElMessage.error(errorMessage(error))
  } finally {
    categoryOrderSaving.value = false
    categorySortable?.option('disabled', false)
  }
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
onBeforeUnmount(() => { destroyCategorySortable() })
</script>

<template>
  <div class="page">
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
        <el-button plain @click="search">查询</el-button>
        <div class="toolbar-actions">
          <el-button v-if="hasPerm('news:edit')" @click="categoryVisible = true">管理分类</el-button>
          <el-button v-if="hasPerm('news:edit')" type="primary" :icon="Plus" @click="editArticle()">新建文章</el-button>
        </div>
      </div>
      <div class="table-region" tabindex="0" role="region" aria-label="政策文章列表">
        <el-table v-loading="loading" :data="list">
          <el-table-column type="index" label="序号" width="64" :index="rowIndex" />
          <el-table-column prop="categoryName" label="分类" width="160" />
          <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="authorName" label="发布人" width="110"><template #default="{ row }">{{ row.authorName || '—' }}</template></el-table-column>
          <el-table-column prop="createdAt" label="发布时间" width="170" />
          <el-table-column v-if="hasPerm('news:publish')" label="状态" width="100">
            <template #default="{ row }"><el-switch v-model="row.published" :active-value="1" :inactive-value="0" inline-prompt active-text="发布" inactive-text="隐藏" :aria-label="`《${row.title}》发布状态`" @change="publish(row)" /></template>
          </el-table-column>
          <el-table-column label="操作" :width="hasPerm('news:edit') || hasPerm('news:delete') ? 200 : 120" fixed="right" align="right">
            <template #default="{ row }">
              <TableActions>
                <el-button v-if="!isCounty" size="small" type="primary" plain :icon="View" :aria-label="`查看阅读《${row.title}》`" @click="openDetail(row)">查看阅读</el-button>
                <el-button v-if="hasPerm('news:edit')" size="small" type="primary" :aria-label="`编辑《${row.title}》`" @click="editArticle(row)">编辑</el-button>
                <el-button v-if="hasPerm('news:delete')" size="small" type="danger" plain :aria-label="`删除《${row.title}》`" @click="removeArticle(row)">删除</el-button>
              </TableActions>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="pagination"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" :total="total" :page-sizes="[5, 10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" /></div>
    </section>

    <el-dialog v-model="editorVisible" :title="form.id ? '编辑文章' : '新建文章'" width="min(1080px, 96vw)" destroy-on-close>
      <el-form label-position="top" @submit.prevent="saveArticle">
        <div class="editor-grid">
          <section class="editor-card editor-card-compact" aria-label="编写文章">
            <h3 class="editor-card-title">编写文章</h3>
            <el-form-item required>
              <template #label>
                文章分类
                <el-tooltip content="添加/修改分类请点击列表上方【管理分类】" placement="top">
                  <el-icon class="label-icon"><QuestionFilled /></el-icon>
                </el-tooltip>
              </template>
              <el-select v-model="form.categoryId" placeholder="请选择文章分类">
                <el-option v-for="category in categories" :key="category.id" :value="category.id" :label="category.name" />
              </el-select>
            </el-form-item>
            <el-form-item label="标题" required><el-input v-model="form.title" maxlength="200" show-word-limit placeholder="请输入文章标题" /></el-form-item>
            <el-form-item required>
              <template #label>
                封面摘要
                <el-tooltip content="8个字内的标题摘要，用作封面展示" placement="top">
                  <el-icon class="label-icon"><QuestionFilled /></el-icon>
                </el-tooltip>
              </template>
              <el-input v-model="form.summary" maxlength="8" show-word-limit placeholder="请输入标题摘要" />
            </el-form-item>
            <el-form-item label="发布人"><el-input v-model="form.authorName" maxlength="50" placeholder="请输入发布人" /></el-form-item>
          </section>

          <section class="editor-card" aria-label="实时预览">
            <h3 class="editor-card-title">实时预览</h3>
            <div class="news_box">
              <div class="book" aria-hidden="true">
                <div class="book-top">
                  <div class="book-title">
                    <span :class="{ 'book-title-placeholder': !form.summary }">{{ form.summary || '摘要' }}</span>
                  </div>
                </div>
                <div class="book-bottom">
                  <div class="book-tuxing">
                    <div class="book-fangkuai"></div>
                    <div class="book-fangkuai"></div>
                    <div class="book-fangkuai"></div>
                  </div>
                  <div class="book-hengtiao"></div>
                </div>
              </div>
              <div class="news_item">
                <div class="news_content">
                  <div class="news_title" :class="{ 'news-title-placeholder': !form.title }">{{ form.title || '文章标题' }}</div>
                  <div class="news_time"><span>发布日期：</span><span>{{ previewDate }}</span></div>
                </div>
              </div>
            </div>
            <p class="preview-hint">封面由系统自动绘制，无需上传图片，将同步展示在小程序与公众号文章列表。</p>
          </section>
        </div>
        <el-form-item label="正文内容" required><RichTextEditor v-model="form.content" /></el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-actions">
          <el-button @click="editorVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveArticle">保存文章</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="categoryVisible" title="管理文章分类" width="min(560px, 94vw)" @opened="initCategorySortable" @closed="destroyCategorySortable">
      <el-form class="category-form" @submit.prevent="saveCategory">
        <el-form-item label="分类名称" required><el-input v-model="categoryForm.name" maxlength="50" /></el-form-item>
      </el-form>
      <p class="muted sort-hint">拖动行首手柄调整分类顺序，松开即保存。</p>
      <div ref="categoryTableRef" class="table-region category-table">
        <el-table :data="categories" row-key="id" aria-label="文章分类列表">
          <el-table-column label="排序" width="64" align="center">
            <template #default="{ row }">
              <button type="button" class="drag-handle" :disabled="categoryOrderSaving" :aria-label="`拖动分类${row.name}`" title="拖动排序">
                <el-icon><Rank /></el-icon>
              </button>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="分类名称" min-width="140" />
          <el-table-column prop="articleCount" label="文章数" width="90" />
          <el-table-column label="操作" width="144" align="right">
            <template #default="{ row }">
              <TableActions>
                <el-button size="small" type="primary" :aria-label="`编辑分类${row.name}`" @click="editCategory(row)">编辑</el-button>
                <el-button v-if="hasPerm('news:delete')" size="small" type="danger" plain :disabled="row.articleCount > 0" :title="row.articleCount > 0 ? '分类下还有文章，不能删除' : ''" :aria-label="`删除分类${row.name}`" @click="removeCategory(row)">删除</el-button>
              </TableActions>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <div class="dialog-actions">
          <el-button v-if="categoryForm.id" @click="editCategory()">取消编辑</el-button>
          <el-button type="primary" :loading="categorySaving" @click="saveCategory">{{ categoryForm.id ? '保存分类' : '添加分类' }}</el-button>
        </div>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" class="policy-drawer" size="min(960px, 96vw)" :show-close="false" :before-close="closeDetail">
      <div v-loading="detailLoading" class="reader">
        <template v-if="current.id">
          <article class="reader-article">
            <header class="reader-header">
              <span class="tag-category">{{ current.categoryName }}</span>
              <h1 class="reader-title">{{ current.title }}</h1>
              <div class="reader-meta">
                <el-icon class="meta-icon"><Clock /></el-icon>
                <span>{{ current.createdAt || '—' }}</span>
              </div>
            </header>

            <div class="rich-content reader-content" v-html="current.content" />
          </article>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.label-icon { margin-inline-start: 4px; color: var(--muted); vertical-align: -2px; }
.toolbar .el-input { max-width: 260px; }
.toolbar .el-select { min-width: 160px; }
.editor-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; margin-block-end: 4px; }
.editor-card { border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px 2px; background: var(--surface); }
.editor-card-title { margin: 0 0 10px; font-size: 15px; font-weight: 600; color: var(--text-primary, #1f2937); }
.editor-card .el-select { width: 100%; }

/* 编写文章卡片：标签与输入框同行，压缩纵向空间，给正文留空间 */
.editor-card-compact .el-form-item { display: flex; align-items: center; margin-block-end: 10px; }
.editor-card-compact :deep(.el-form-item__label) {
  width: 76px; flex-shrink: 0; justify-content: flex-start;
  padding: 0 8px 0 0; margin: 0; height: auto; line-height: 1.4;
}
.editor-card-compact :deep(.el-form-item__content) { flex: 1; min-width: 0; margin-inline-start: 0 !important; }

/* 纯 CSS 自绘书本封面（与小程序端同款青蓝渐变） */
.news_box { display: flex; align-items: center; }
.book {
  width: 64px; height: 76px;
  display: flex; flex-wrap: wrap; align-content: space-between;
  color: #fff; padding: 16px;
  border-radius: 8px;
  background: linear-gradient(to bottom, #4dd9f4, #2db8e3);
  box-sizing: content-box; flex-shrink: 0;
  box-shadow: 0 4px 10px rgba(45, 184, 227, 0.25);
}
.book-top { width: 100%; }
.book-title {
  height: 52px; width: 100%;
  overflow: hidden; text-align: center;
  font-size: 15px; font-weight: bold;
  display: flex; justify-content: center; align-items: center;
  opacity: 0.9; word-break: break-all;
}
.book-title-placeholder { opacity: 0.7; }
.book-bottom { width: 100%; }
.book-tuxing { display: flex; justify-content: center; }
.book-fangkuai {
  width: 14px; height: 14px;
  background: rgba(255, 255, 255, 0.5);
  margin: 4px 0 4px 5px;
  transform: rotate(45deg);
}
.book-fangkuai:nth-of-type(1) { opacity: 0.3; }
.book-fangkuai:nth-of-type(2) { opacity: 0.5; }
.book-fangkuai:nth-of-type(3) { opacity: 1; }
.book-hengtiao { background-color: #fff; height: 8px; width: 90%; margin-inline-start: 3px; border-radius: 10px; }
.news_item { flex: 1; min-width: 0; display: flex; align-items: center; margin-inline-start: 14px; }
.news_content { display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.news_title {
  font-size: 15px; line-height: 1.5; color: #3b3a39;
  max-height: 68px; margin-block-end: 8px;
  overflow: hidden; word-break: break-all;
}
.news-title-placeholder { color: var(--muted); }
.news_time { color: #b9b9b9; font-size: 14px; }
.preview-hint { margin: 16px 0 0; padding-block-start: 12px; border-block-start: 1px dashed var(--line); font-size: 12px; color: var(--muted); line-height: 1.6; }
@media (max-width: 640px) {
  .editor-card { padding: 14px 14px 0; }
}
.category-form { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; margin-block-end: 16px; }
.category-form .el-form-item { margin-block-end: 0; }
.sort-hint { margin: -6px 0 12px; font-size: 13px; }
.category-table { overflow: visible; }

/* 政策学习抽屉 */
:global(.policy-drawer .el-drawer__header) { display: none; }
:global(.policy-drawer .el-drawer__body) { padding: 0; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.reader { flex: 1; min-height: 0; overflow-y: auto; padding: 32px 24px 60px; background: var(--surface); }
.reader-article { max-width: 760px; margin: 0 auto; }
.reader-header { margin-block-end: 22px; }
.tag-category {
  display: inline-flex; align-items: center;
  padding: 3px 10px; border-radius: 4px;
  background: var(--brand-soft); color: var(--brand);
  font-size: 12px; font-weight: 500; line-height: 18px;
  margin-block-end: 14px;
}
.reader-title {
  margin: 0 0 12px;
  font-size: 28px; line-height: 1.4; font-weight: 700;
  color: var(--text-primary, #1f2937); letter-spacing: -0.3px;
}
.reader-meta {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--muted);
}
.meta-icon { font-size: 13px; }
.reader-content { font-size: 16px; line-height: 1.85; color: var(--text-primary, #1f2937); }
.reader-content :deep(p) { margin: 0 0 14px; }
.reader-content :deep(h2) { margin: 28px 0 14px; font-size: 20px; font-weight: 700; }
.reader-content :deep(h3) { margin: 22px 0 12px; font-size: 17px; font-weight: 600; }
.reader-content :deep(ul),
.reader-content :deep(ol) { margin: 0 0 14px; padding-inline-start: 24px; }
.reader-content :deep(li) { margin-block-end: 6px; }
.reader-content :deep(blockquote) {
  margin: 14px 0; padding: 12px 16px;
  background: var(--surface-secondary, #f8fafc); border-inline-start: 3px solid var(--brand);
  color: var(--text-regular, #4b5563); border-radius: 6px;
}
.reader-content :deep(img) { max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; }
.reader-content :deep(a) { color: var(--brand); text-decoration: underline; }

@media (max-width: 760px) {
  .reader { padding: 24px 16px 40px; }
  .reader-title { font-size: 22px; }
  .reader-content { font-size: 15px; line-height: 1.8; }
}
</style>
