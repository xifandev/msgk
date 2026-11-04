<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
const { admin, hasPerm } = useAdmin()
const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const filters = reactive({ page: 1, pageSize: 10, search: '', kind: '', published: '' })
const editorVisible = ref(false)
const saving = ref(false)
const form = reactive({ id: 0, kind: '', title: '', coverUrl: '', authorName: '', content: '' })
const KIND_LABELS: Record<string, string> = { public: '小程序公告', internal: '内部公告' }

async function load() {
  loading.value = true
  try {
    const response = await $fetch<{ list: any[], total: number }>('/api/admin/notices', {
      query: { page: filters.page, pageSize: filters.pageSize, search: filters.search || undefined, kind: filters.kind || undefined, published: filters.published || undefined }
    })
    list.value = response.list
    total.value = response.total
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { loading.value = false }
}
function rowIndex(index: number) {
  return (filters.page - 1) * filters.pageSize + index + 1
}
function search() {
  filters.page = 1
  load()
}
async function editNotice(row?: any) {
  if (!row) {
    Object.assign(form, { id: 0, kind: '', title: '', coverUrl: '', authorName: admin.value?.name ?? '', content: '' })
    editorVisible.value = true
    return
  }
  try {
    const detail = await $fetch<any>(`/api/admin/notices/${row.id}`)
    Object.assign(form, {
      id: detail.id, kind: detail.kind, title: detail.title,
      coverUrl: detail.coverUrl ?? '', authorName: detail.authorName ?? '', content: detail.content ?? ''
    })
    editorVisible.value = true
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
async function saveNotice() {
  if (!form.kind) { ElMessage.warning('请选择公告类型'); return }
  if (!form.title.trim()) { ElMessage.warning('请填写文章标题'); return }
  if (!form.content.trim()) { ElMessage.warning('请填写文章内容'); return }
  saving.value = true
  try {
    await $fetch(form.id ? `/api/admin/notices/${form.id}` : '/api/admin/notices', { method: form.id ? 'PUT' : 'POST', body: form })
    ElMessage.success(form.id ? '公告已保存' : '公告已创建')
    editorVisible.value = false
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { saving.value = false }
}
async function removeNotice(row: any) {
  await ElMessageBox.confirm(`确定删除公告《${row.title}》吗？`, '删除公告', { type: 'warning' })
  try {
    await $fetch(`/api/admin/notices/${Number(row.id)}`, { method: 'DELETE' })
    ElMessage.success('公告已删除')
    await load()
  } catch (error) { if (error !== 'cancel') ElMessage.error(errorMessage(error)) }
}
async function publish(row: any) {
  try {
    await $fetch(`/api/admin/notices/${row.id}/publish`, { method: 'POST', body: { published: Boolean(row.published) } })
    ElMessage.success(row.published ? '公告已发布' : '公告已取消发布')
  } catch (error) { row.published = row.published ? 0 : 1; ElMessage.error(errorMessage(error)) }
}
watch(() => [filters.page, filters.pageSize, filters.kind, filters.published], load)
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div><h1>公告管理</h1><p>小程序公告面向公众展示，内部公告仅后台管理员可见。</p></div>
      <el-button v-if="hasPerm('notices:edit')" type="primary" @click="editNotice()">新建公告</el-button>
    </div>
    <section class="panel">
      <div class="toolbar">
        <el-input v-model="filters.search" placeholder="搜索公告标题" clearable aria-label="搜索公告标题" @keyup.enter="search" @clear="search" />
        <el-select v-model="filters.kind" clearable placeholder="公告类型" aria-label="按公告类型筛选">
          <el-option v-for="(label, value) in KIND_LABELS" :key="value" :label="label" :value="value" />
        </el-select>
        <el-select v-model="filters.published" clearable placeholder="发布状态" aria-label="按发布状态筛选">
          <el-option label="已发布" value="1" />
          <el-option label="未发布" value="0" />
        </el-select>
        <el-button @click="search">查询</el-button>
      </div>
      <div class="table-region" tabindex="0" role="region" aria-label="公告列表">
        <el-table v-loading="loading" :data="list">
          <el-table-column type="index" label="序号" width="64" :index="rowIndex" />
          <el-table-column label="公告分类" width="110">
            <template #default="{ row }"><el-tag :type="row.kind === 'internal' ? 'warning' : 'success'" effect="plain">{{ KIND_LABELS[row.kind] ?? row.kind }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="title" label="公告标题" min-width="200" show-overflow-tooltip />
          <el-table-column label="公告封面图" width="110">
            <template #default="{ row }">
              <el-image v-if="row.coverUrl" :src="row.coverUrl" :preview-src-list="[row.coverUrl]" fit="cover" preview-teleported class="cover-thumb" :alt="`${row.title}封面`" />
              <span v-else class="muted">未上传</span>
            </template>
          </el-table-column>
          <el-table-column prop="authorName" label="编辑" width="110"><template #default="{ row }">{{ row.authorName || '—' }}</template></el-table-column>
          <el-table-column prop="createdAt" label="发布时间" width="170" />
          <el-table-column v-if="hasPerm('notices:publish')" label="状态" width="100">
            <template #default="{ row }"><el-switch v-model="row.published" :active-value="1" :inactive-value="0" inline-prompt active-text="发布" inactive-text="隐藏" :aria-label="`《${row.title}》发布状态`" @change="publish(row)" /></template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right" align="right">
            <template #default="{ row }">
              <TableActions>
                <el-button v-if="hasPerm('notices:edit')" size="small" type="primary" :aria-label="`编辑《${row.title}》`" @click="editNotice(row)">编辑</el-button>
                <el-button v-if="hasPerm('notices:delete')" size="small" type="danger" plain :aria-label="`删除《${row.title}》`" @click="removeNotice(row)">删除</el-button>
              </TableActions>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="pagination"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" :total="total" :page-sizes="[5, 10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" /></div>
    </section>

    <el-dialog v-model="editorVisible" :title="form.id ? '编辑公告' : '新建公告'" width="min(880px, 96vw)" destroy-on-close>
      <el-form label-position="top" @submit.prevent="saveNotice">
        <div class="form-grid">
          <el-form-item label="选择公告分类" required>
            <el-radio-group v-model="form.kind">
              <el-radio-button value="public">小程序公告</el-radio-button>
              <el-radio-button value="internal">内部公告</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="作者"><el-input v-model="form.authorName" maxlength="50" /></el-form-item>
        </div>
        <el-form-item label="标题" required><el-input v-model="form.title" maxlength="200" show-word-limit /></el-form-item>
        <el-form-item label="封面图片"><ImageUpload v-model="form.coverUrl" label="公告封面" /></el-form-item>
        <el-form-item label="正文内容" required><RichTextEditor v-model="form.content" /></el-form-item>
        <el-button type="primary" native-type="submit" :loading="saving">保存公告</el-button>
      </el-form>
    </el-dialog>
  </div>
</template>

<style scoped>
.muted { color: var(--muted); font-size: 13px; }
.cover-thumb { width: 84px; height: 56px; border-radius: 6px; }
.toolbar .el-input { max-width: 260px; }
.toolbar .el-select { min-width: 150px; }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0 18px; }
</style>
