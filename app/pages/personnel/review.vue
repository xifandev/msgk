<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { REVIEW_LABELS, REVIEW_TAG_TYPES } from '~~/shared/review'

useHead({ title: '人员公开审核 | 码上公开' })
const { hasPerm } = useAdmin()
const list = ref<any[]>([])
const total = ref(0)
const queryInput = reactive({ page: 1, pageSize: 20, search: '', state: '' })
const visible = ref(false)
const current = ref<Record<string, any> | null>(null)
const members = computed(() => current.value?.members ?? [])
async function load() { try { const response = await $fetch<any>('/api/admin/personnel', { query: queryInput }); list.value = response.list; total.value = response.total } catch (error) { ElMessage.error(errorMessage(error)) } }
async function open(row: any) { try { current.value = await $fetch<Record<string, any>>(`/api/admin/personnel/${row.venue_id}`); visible.value = true } catch (error) { ElMessage.error(errorMessage(error)) } }
async function review(action: string, reason?: string) { if (!current.value) return; try { current.value = await $fetch<Record<string, any>>(`/api/admin/personnel/${current.value.venue_id}/review`, { method: 'POST', body: { action, reason } }); ElMessage.success('审核状态已更新'); await load() } catch (error) { ElMessage.error(errorMessage(error)) } }
async function publish(value: string | number | boolean) { if (!current.value) return; const published = Boolean(value); try { current.value = await $fetch<Record<string, any>>(`/api/admin/personnel/${current.value.venue_id}/publish`, { method: 'POST', body: { published } }); await load() } catch (error) { ElMessage.error(errorMessage(error)) } }
watch(() => [queryInput.page, queryInput.pageSize], load)
onMounted(load)
</script>

<template>
  <div class="page"><div class="page-header"><div><h1>人员公开审核</h1><p>核对场所人员名册，记录审核意见并控制公开状态。</p></div></div><section class="panel"><div class="toolbar"><el-input v-model="queryInput.search" placeholder="搜索场所或乡镇" clearable @keyup.enter="load" /><el-select v-model="queryInput.state" clearable placeholder="审核状态" @change="load"><el-option v-for="(label, value) in REVIEW_LABELS" :key="value" :label="label" :value="value" /></el-select><el-button @click="load">查询</el-button></div><div class="table-region" tabindex="0" role="region" aria-label="人员公开审核列表"><el-table :data="list"><el-table-column prop="venue_name" label="场所" min-width="170" /><el-table-column prop="township" label="乡镇" width="130" /><el-table-column prop="member_count" label="人数" width="80" /><el-table-column label="状态" width="140"><template #default="{ row }"><el-tag :type="REVIEW_TAG_TYPES[row.state]">{{ REVIEW_LABELS[row.state] }}</el-tag></template></el-table-column><el-table-column prop="submitted_at" label="提交时间" width="180" /><el-table-column label="操作" width="120"><template #default="{ row }"><el-button text type="primary" @click="open(row)">查看与审核</el-button></template></el-table-column></el-table></div><div class="pagination"><el-pagination v-model:current-page="queryInput.page" v-model:page-size="queryInput.pageSize" :total="total" layout="total, prev, pager, next" /></div></section>
    <el-drawer v-model="visible" title="人员名册详情" size="min(820px, 96vw)"><template v-if="current"><el-empty v-if="!members.length" description="尚未添加人员" /><article v-for="member in members" :key="member.sort" class="member-item"><el-image v-if="member.imageUrl" :src="member.imageUrl" :preview-src-list="[member.imageUrl]" fit="cover" class="member-photo" :alt="`${member.name}照片`" /><div><h3>{{ member.name }} <small>{{ member.gender }}</small></h3><p>{{ member.clergy || '未填写教职' }} · {{ member.position || '未填写职务' }}</p><p class="muted">{{ member.phone || '未填写电话' }}</p></div></article><div class="review-panel"><ReviewTimeline :record="current" /><el-switch v-if="hasPerm('personnel:publish')" :model-value="!!current.published" :disabled="current.state !== 'approved'" active-text="公开" inactive-text="未公开" @change="publish" /><ReviewActions :state="current.state" edit-permission="personnel:edit" review-permission="personnel:review" @action="review" /></div></template></el-drawer>
  </div>
</template>

<style scoped>
.member-item { display: flex; gap: 16px; align-items: center; padding: 14px 0; border-block-end: 1px solid var(--line); }
.member-photo { width: 84px; height: 84px; border-radius: 10px; flex: none; }
.member-item h3 { margin: 0; }
.member-item h3 small { color: var(--muted); font-weight: 400; }
.member-item p { margin: 5px 0; }
.review-panel { display: grid; gap: 20px; margin-block-start: 24px; }
</style>
