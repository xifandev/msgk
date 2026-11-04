<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { REVIEW_LABELS, REVIEW_TAG_TYPES, reviewActionMessage } from '~~/shared/review'

useHead({ title: '场所介绍审核 | 码上公开' })
const route = useRoute()
const { hasPerm } = useAdmin()
const list = ref<any[]>([])
const total = ref(0)
const queryInput = reactive({ page: 1, pageSize: 20, search: '', state: '' })
const visible = ref(false)
const current = ref<Record<string, any> | null>(null)

async function load() {
  try {
    const response = await $fetch<any>('/api/admin/venues', { query: { ...queryInput, state: undefined, profileState: queryInput.state || undefined } })
    list.value = queryInput.state ? response.list : response.list.filter((row: any) => row.profile_state)
    total.value = response.total
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
function search() {
  queryInput.page = 1
  load()
}
async function open(row: any) {
  try {
    current.value = await $fetch<Record<string, any>>(`/api/admin/profiles/${row.id}`)
    visible.value = true
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
async function review(action: string, reason?: string) {
  if (!current.value) return
  try {
    current.value = await $fetch<Record<string, any>>(`/api/admin/profiles/${current.value.venue_id}/review`, { method: 'POST', body: { action, reason } })
    ElMessage.success(reviewActionMessage(action))
    visible.value = false
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
async function publish(value: string | number | boolean) {
  if (!current.value) return
  const published = Boolean(value)
  try {
    current.value = await $fetch<Record<string, any>>(`/api/admin/profiles/${current.value.venue_id}/publish`, { method: 'POST', body: { published } })
    ElMessage.success(published ? '已公开' : '已取消公开')
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
watch(() => [queryInput.page, queryInput.pageSize], load)
onMounted(() => {
  const state = String(route.query.state ?? '')
  if (state && state in REVIEW_LABELS) queryInput.state = state
  load()
})
</script>

<template>
  <div class="page">
    <div class="page-header"><div><h1>场所介绍审核</h1><p>查看场所登记资料，完成镇级或县级审核。</p></div></div>
    <section class="panel">
      <div class="toolbar">
        <el-input v-model="queryInput.search" placeholder="搜索场所或乡镇" clearable @keyup.enter="search" @clear="search" />
        <el-select v-model="queryInput.state" clearable placeholder="全部状态" @change="search">
          <el-option v-for="(label, value) in REVIEW_LABELS" :key="value" :label="label" :value="value" />
        </el-select>
        <el-button @click="search">查询</el-button>
        <span class="muted">{{ total }}条数据</span>
      </div>
      <div class="table-region" tabindex="0" role="region" aria-label="场所介绍审核列表">
        <el-table :data="list">
          <el-table-column type="index" label="序号" width="64" />
          <el-table-column prop="name" label="场所名称" min-width="170" />
          <el-table-column prop="township" label="所在乡镇" width="130" />
          <el-table-column label="状态" width="140">
            <template #default="{ row }"><el-tag :type="REVIEW_TAG_TYPES[row.profile_state]">{{ REVIEW_LABELS[row.profile_state] }}</el-tag></template>
          </el-table-column>
          <el-table-column label="提交时间" width="180">
            <template #default="{ row }">{{ row.profile_submitted_at || row.updated_at }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }"><el-button text type="primary" @click="open(row)">查看审核</el-button></template>
          </el-table-column>
        </el-table>
      </div>
      <div class="pagination"><el-pagination v-model:current-page="queryInput.page" v-model:page-size="queryInput.pageSize" :total="total" :page-sizes="[5, 10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" /></div>
    </section>
    <el-drawer v-model="visible" title="场所介绍审核" size="min(820px, 96vw)">
      <template v-if="current">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="登记时间">{{ current.registration_date || '未填写' }}</el-descriptions-item>
          <el-descriptions-item label="教别">{{ current.religion || '未填写' }}</el-descriptions-item>
          <el-descriptions-item label="场所类别">{{ current.category || '未填写' }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{ current.manager || '未填写' }}</el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ current.phone || '未填写' }}</el-descriptions-item>
          <el-descriptions-item label="批准设立机构">{{ current.approval_authority || '未填写' }}</el-descriptions-item>
          <el-descriptions-item label="社会信用代码">{{ current.credit_code || '未填写' }}</el-descriptions-item>
          <el-descriptions-item label="场所地址">{{ current.address || '未填写' }}</el-descriptions-item>
        </el-descriptions>
        <h3>场所简介</h3>
        <div class="rich-content detail-content" v-html="current.summary || '<p>暂无简介</p>'" />
        <template v-if="Object.keys(current.extra ?? {}).length">
          <h3>附加介绍</h3>
          <el-descriptions :column="1" border>
            <el-descriptions-item v-for="(value, key) in current.extra" :key="key" :label="String(key)">{{ value }}</el-descriptions-item>
          </el-descriptions>
        </template>
        <div class="review-panel">
          <ReviewTimeline :record="current" />
          <el-switch v-if="hasPerm('venues:publish')" :model-value="!!current.published" :disabled="current.state !== 'approved'" active-text="公开" inactive-text="未公开" @change="publish" />
          <ReviewActions :state="current.state" edit-permission="venues:edit" review-permission="venues:review" @action="review" />
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.toolbar .el-input { min-width: 220px; }
.toolbar .el-select { min-width: 150px; }
.muted { color: var(--muted); font-size: 13px; }
.detail-content { padding: 16px; border: 1px solid var(--line); border-radius: 10px; }
.review-panel { display: grid; gap: 20px; margin-block-start: 24px; }
</style>
