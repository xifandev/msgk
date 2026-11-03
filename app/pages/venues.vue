<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { REVIEW_LABELS, REVIEW_TAG_TYPES } from '~~/shared/review'

useHead({ title: '场所配置 | 码上公开' })
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

async function load() {
  loading.value = true
  try {
    const response = await $fetch<{ list: any[], total: number }>('/api/admin/venues', { query: filters })
    list.value = response.list
    total.value = response.total
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { loading.value = false }
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
  if (!editForm.name.trim() || !editForm.township.trim()) {
    ElMessage.warning('请填写场所名称和所属乡镇')
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
      ElMessage.success('场所信息已保存')
    } else {
      await $fetch('/api/admin/venues', { method: 'POST', body })
      ElMessage.success('场所已创建')
    }
    editVisible.value = false
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { saving.value = false }
}
async function remove(row: any) {
  await ElMessageBox.confirm(`确定删除场所“${row.name}”吗？其介绍、人员名册将一并删除。`, '删除场所', { type: 'warning' })
  try {
    await $fetch(`/api/admin/venues/${row.id}`, { method: 'DELETE' })
    ElMessage.success('场所已删除')
    await load()
  } catch (error) { if (error !== 'cancel') ElMessage.error(errorMessage(error)) }
}
function search() {
  filters.page = 1
  load()
}
watch(() => [filters.page, filters.pageSize], load)
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div><h1>场所配置</h1><p>维护宗教活动场所的基础信息、图片与二维码，按乡镇和排序值排列。</p></div>
      <el-button v-if="hasPerm('venues:edit') && admin?.allVenues" type="primary" @click="editVenue()">新增场所</el-button>
    </div>
    <section class="panel">
      <div class="toolbar">
        <el-input v-model="filters.search" placeholder="搜索场所名称或乡镇" clearable style="max-width: 280px" aria-label="搜索场所" @keyup.enter="search" @clear="search" />
        <el-button type="primary" plain @click="search">搜索</el-button>
      </div>
      <div class="table-region" tabindex="0" role="region" aria-label="场所列表">
        <el-table v-loading="loading" :data="list">
          <el-table-column prop="name" label="场所名称" min-width="150" />
          <el-table-column prop="township" label="所属乡镇" min-width="110" />
          <el-table-column prop="sort_order" label="排序值" width="80" />
          <el-table-column label="场所图片" width="100">
            <template #default="{ row }">
              <el-image v-if="row.image_url" :src="row.image_url" :preview-src-list="[row.image_url]" fit="cover" preview-teleported style="width: 56px; height: 40px; border-radius: 6px" :alt="`${row.name}场所图片`" />
              <span v-else class="muted">未上传</span>
            </template>
          </el-table-column>
          <el-table-column label="二维码" width="100">
            <template #default="{ row }">
              <el-image v-if="row.qr_code_url" :src="row.qr_code_url" :preview-src-list="[row.qr_code_url]" fit="cover" preview-teleported style="width: 40px; height: 40px; border-radius: 6px" :alt="`${row.name}二维码`" />
              <span v-else class="muted">未上传</span>
            </template>
          </el-table-column>
          <el-table-column label="介绍状态" width="110">
            <template #default="{ row }"><el-tag v-if="row.profile_state" :type="REVIEW_TAG_TYPES[row.profile_state]">{{ REVIEW_LABELS[row.profile_state] }}</el-tag><span v-else class="muted">未填写</span></template>
          </el-table-column>
          <el-table-column label="人员状态" width="110">
            <template #default="{ row }"><el-tag v-if="row.personnel_state" :type="REVIEW_TAG_TYPES[row.personnel_state]">{{ REVIEW_LABELS[row.personnel_state] }}</el-tag><span v-else class="muted">未填写</span></template>
          </el-table-column>
          <el-table-column prop="updated_at" label="更新时间" width="170" />
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button v-if="hasPerm('venues:edit')" text type="primary" @click="editVenue(row)">编辑</el-button>
              <el-button v-if="hasPerm('venues:delete')" text type="danger" @click="remove(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="pagination"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" :total="total" layout="total, sizes, prev, pager, next" /></div>
    </section>

    <el-dialog v-model="editVisible" :title="editForm.id ? '编辑场所' : '新增场所'" width="min(640px, 94vw)">
      <el-form label-position="top" @submit.prevent="saveVenue">
        <el-form-item label="场所名称" required><el-input v-model="editForm.name" maxlength="100" /></el-form-item>
        <el-form-item label="所属乡镇" required><el-input v-model="editForm.township" maxlength="50" placeholder="如：城关镇" /></el-form-item>
        <el-form-item label="排序值"><el-input-number v-model="editForm.sort_order" :min="0" :max="99999" /> <span class="muted">数值越小越靠前</span></el-form-item>
        <el-form-item label="场所图片">
          <div class="upload-row">
            <ImageUpload v-model="editForm.image_url" label="场所图片" />
            <el-button v-if="editForm.image_url" text type="danger" @click="editForm.image_url = null">清除图片</el-button>
          </div>
        </el-form-item>
        <el-form-item label="场所二维码">
          <div class="upload-row">
            <ImageUpload v-model="editForm.qr_code_url" label="场所二维码" />
            <el-button v-if="editForm.qr_code_url" text type="danger" @click="editForm.qr_code_url = null">清除二维码</el-button>
          </div>
        </el-form-item>
        <el-form-item label="安全提示"><el-input v-model="editForm.safety_note" type="textarea" :rows="4" maxlength="2000" show-word-limit placeholder="面向公众展示的安全注意事项" /></el-form-item>
        <el-button type="primary" native-type="submit" :loading="saving">保存场所</el-button>
      </el-form>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar .el-input { min-width: 200px; }
.upload-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.muted { color: var(--muted); font-size: 13px; }
</style>
