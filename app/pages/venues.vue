<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { TOWNSHIPS } from '~~/shared/townships'
const { admin, hasPerm } = useAdmin()
const loading = ref(false)
const saving = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const filters = reactive({ page: 1, pageSize: 10, search: '' })
const editVisible = ref(false)
const editForm = reactive({
  id: 0,
  name: '',
  township: '',
  sort_order: 0,
  image_url: null as string | null,
  qr_code_url: null as string | null,
  safety_note: ''
})
const qrVisible = ref(false)
const qrRow = ref<Record<string, any> | null>(null)
const qrDownloading = ref(false)

async function load() {
  loading.value = true
  try {
    const response = await $fetch<{ list: any[], total: number }>('/api/admin/venues', { query: filters })
    list.value = response.list
    total.value = response.total
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { loading.value = false }
}
function rowIndex(index: number) {
  return (filters.page - 1) * filters.pageSize + index + 1
}
function editVenue(row?: any) {
  Object.assign(editForm, row
    ? {
        id: row.id,
        name: row.name,
        township: row.township,
        sort_order: row.sort_order,
        image_url: row.image_url,
        qr_code_url: row.qr_code_url,
        safety_note: row.safety_note ?? ''
      }
    : { id: 0, name: '', township: '', sort_order: 0, image_url: null, qr_code_url: null, safety_note: '' })
  editVisible.value = true
}
async function saveVenue() {
  if (!editForm.name.trim()) {
    ElMessage.warning('请填写场所名称')
    return
  }
  if (!editForm.township.trim()) {
    ElMessage.warning('请选择所在乡镇')
    return
  }
  saving.value = true
  try {
    const body = {
      name: editForm.name,
      township: editForm.township,
      sort_order: editForm.sort_order,
      image_url: editForm.image_url,
      qr_code_url: editForm.qr_code_url,
      safety_note: editForm.safety_note
    }
    if (editForm.id) {
      await $fetch(`/api/admin/venues/${editForm.id}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/admin/venues', { method: 'POST', body })
    }
    ElMessage.success('保存成功')
    editVisible.value = false
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { saving.value = false }
}
async function remove(row: any) {
  try {
    await ElMessageBox.confirm(`是否要删除场所“${row.name}”？删除后其介绍、人员名册将一并删除，且不可恢复。`, '警告', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
  } catch { return }
  try {
    await $fetch(`/api/admin/venues/${row.id}`, { method: 'DELETE' })
    ElMessage.success('删除成功')
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
function openQr(row: any) {
  qrRow.value = row
  qrVisible.value = true
}
async function downloadQr() {
  const row = qrRow.value
  if (!row?.qr_code_url) return
  qrDownloading.value = true
  try {
    const blob = await $fetch<Blob>(row.qr_code_url, { responseType: 'blob' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${row.name}-场所二维码.png`
    link.click()
    URL.revokeObjectURL(link.href)
  } catch {
    ElMessage.error('下载失败，可在图片上点击鼠标右键保存')
  } finally { qrDownloading.value = false }
}
function search() {
  filters.page = 1
  load()
}
watch(() => filters.page, load)
watch(() => filters.pageSize, () => { filters.page = 1; load() })
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div><h1>场所配置</h1><p>维护宗教活动场所的基础信息、图片与二维码，按乡镇和排序值排列。</p></div>
      <el-button v-if="hasPerm('venues:edit') && admin?.allVenues" type="primary" @click="editVenue()">添加场所</el-button>
    </div>
    <section class="panel">
      <div class="toolbar">
        <el-input v-model="filters.search" placeholder="搜索场所名称或乡镇" clearable style="max-width: 280px" aria-label="搜索场所" @keyup.enter="search" @clear="search" />
        <el-button type="primary" plain @click="search">搜索</el-button>
      </div>
      <div class="table-region" tabindex="0" role="region" aria-label="场所列表">
        <el-table v-loading="loading" :data="list">
          <el-table-column type="index" label="序号" width="64" :index="rowIndex" />
          <el-table-column prop="name" label="场所名称" min-width="150" />
          <el-table-column prop="township" label="所在乡镇" min-width="110" />
          <el-table-column prop="sort_order" label="排序值" width="80" />
          <el-table-column label="场所图片" width="100">
            <template #default="{ row }">
              <el-image v-if="row.image_url" :src="row.image_url" :preview-src-list="[row.image_url]" fit="cover" preview-teleported style="width: 56px; height: 40px; border-radius: 6px" :alt="`${row.name}场所图片`" />
              <span v-else class="muted">未上传</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="216" fixed="right" align="right">
            <template #default="{ row }">
              <TableActions>
                <el-button size="small" type="primary" plain :aria-label="`查看${row.name}的二维码`" @click="openQr(row)">二维码</el-button>
                <el-button v-if="hasPerm('venues:edit')" size="small" type="primary" :aria-label="`编辑${row.name}`" @click="editVenue(row)">编辑</el-button>
                <el-button v-if="hasPerm('venues:delete')" size="small" type="danger" plain :aria-label="`删除${row.name}`" @click="remove(row)">删除</el-button>
              </TableActions>
            </template>
          </el-table-column>
          <template #empty>
            <p class="muted">{{ filters.search ? '没有找到匹配的场所，换个关键词试试' : '暂无场所，点击右上角“添加场所”开始配置' }}</p>
          </template>
        </el-table>
      </div>
      <div class="pagination"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" :total="total" :page-sizes="[5, 10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" /></div>
    </section>

    <el-dialog v-model="editVisible" :title="editForm.id ? '修改场所' : '添加场所'" width="min(640px, 94vw)">
      <el-form label-position="top" @submit.prevent="saveVenue">
        <el-form-item label="场所名称" required><el-input v-model="editForm.name" maxlength="100" placeholder="请输入场所名称" /></el-form-item>
        <el-form-item label="所在乡镇" required>
          <el-select v-model="editForm.township" filterable allow-create default-first-option placeholder="选择所在乡镇">
            <el-option v-for="township in TOWNSHIPS" :key="township" :value="township" :label="township" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序值"><el-input-number v-model="editForm.sort_order" :min="0" :max="99999" /> <span class="muted">数值越小越靠前</span></el-form-item>
        <el-form-item label="场所图片">
          <div class="upload-row">
            <ImageUpload v-model="editForm.image_url" label="场所图片" />
            <el-button v-if="editForm.image_url" size="small" type="danger" plain @click="editForm.image_url = null">清除图片</el-button>
          </div>
        </el-form-item>
        <el-form-item label="场所二维码">
          <div class="upload-row">
            <ImageUpload v-model="editForm.qr_code_url" label="场所二维码" />
            <el-button v-if="editForm.qr_code_url" size="small" type="danger" plain @click="editForm.qr_code_url = null">清除二维码</el-button>
          </div>
          <p class="muted upload-hint">二维码用于打印张贴，信众扫码直达该场所公开页。</p>
        </el-form-item>
        <el-form-item label="安全提示"><el-input v-model="editForm.safety_note" type="textarea" :rows="4" maxlength="2000" show-word-limit placeholder="面向公众展示的安全注意事项" /></el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-actions">
          <el-button @click="editVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveVenue">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="qrVisible" :title="qrRow ? `${qrRow.name} · 场所二维码` : '场所二维码'" width="min(460px, 94vw)">
      <div v-if="qrRow" class="qr-body">
        <img v-if="qrRow.qr_code_url" :src="qrRow.qr_code_url" class="qr-image" :alt="`${qrRow.name}场所二维码`">
        <el-empty v-else description="尚未上传二维码，可点击列表“编辑”在弹窗中上传" :image-size="90" />
        <p v-if="qrRow.qr_code_url" class="qr-hint">鼠标右键可保存图片，打印张贴后信众扫码即可查看该场所公开信息。</p>
        <div v-if="qrRow.qr_code_url" class="qr-actions">
          <el-button type="primary" :loading="qrDownloading" @click="downloadQr">下载二维码</el-button>
        </div>
      </div>
      <template #footer>
        <div class="dialog-actions">
          <el-button @click="qrVisible = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar .el-input { min-width: 200px; }
.upload-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.upload-hint { margin: 6px 0 0; }
.el-select { width: 100%; }
.muted { color: var(--muted); font-size: 13px; }
.qr-body { display: grid; justify-items: center; gap: 14px; }
.qr-image { width: min(360px, 72vw); border: 1px solid var(--line); border-radius: 12px; }
.qr-hint { margin: 0; color: #1c88cf; font-size: 15px; text-align: center; }
.qr-actions { display: flex; gap: 10px; }
</style>
