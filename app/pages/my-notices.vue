<script setup lang="ts">
import { ElMessage } from 'element-plus'

useHead({ title: '我的通知 | 码上公开' })
const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const paging = reactive({ page: 1, pageSize: 10 })
const detailVisible = ref(false)
const current = ref<Record<string, any>>({})
const marking = ref(false)

async function load() {
  loading.value = true
  try {
    const response = await $fetch<{ list: any[], total: number }>('/api/admin/notices/my', { query: paging })
    list.value = response.list
    total.value = response.total
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { loading.value = false }
}
async function openNotice(row: any) {
  current.value = row
  detailVisible.value = true
  if (row.readAt || marking.value) return
  marking.value = true
  try {
    const response = await $fetch<{ readAt: string | null }>(`/api/admin/notices/${row.id}/read`, { method: 'POST' })
    row.readAt = response.readAt ?? new Date().toISOString()
    current.value = { ...row }
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { marking.value = false }
}
watch(() => [paging.page, paging.pageSize], load)
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div><h1>我的通知</h1><p>这里列出面向管理员的内部公告，打开详情后自动标记为已读。</p></div>
      <el-button @click="load">刷新</el-button>
    </div>
    <section class="panel">
      <div class="table-region" tabindex="0" role="region" aria-label="内部公告列表">
        <el-table v-loading="loading" :data="list">
          <el-table-column type="index" label="序号" width="64" :index="(index: number) => (paging.page - 1) * paging.pageSize + index + 1" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="row.readAt ? 'info' : 'danger'" effect="plain">{{ row.readAt ? '已读' : '未读' }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
          <el-table-column prop="authorName" label="发布人" width="110"><template #default="{ row }">{{ row.authorName || '—' }}</template></el-table-column>
          <el-table-column prop="createdAt" label="发布时间" width="170" />
          <el-table-column prop="readAt" label="阅读时间" width="170"><template #default="{ row }">{{ row.readAt || '—' }}</template></el-table-column>
          <el-table-column label="操作" width="110" fixed="right">
            <template #default="{ row }"><el-button text type="primary" @click="openNotice(row)">查看详情</el-button></template>
          </el-table-column>
        </el-table>
      </div>
      <p v-if="!loading && !list.length" class="empty-state">暂无内部公告</p>
      <div v-else class="pagination"><el-pagination v-model:current-page="paging.page" v-model:page-size="paging.pageSize" :total="total" :page-sizes="[5, 10, 20, 50]" layout="total, sizes, prev, pager, next" /></div>
    </section>

    <el-dialog v-model="detailVisible" :title="current.title ?? '公告详情'" width="min(720px, 94vw)">
      <el-descriptions :column="2" border class="detail-meta">
        <el-descriptions-item label="发布人">{{ current.authorName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="发布时间">{{ current.createdAt || '—' }}</el-descriptions-item>
      </el-descriptions>
      <el-image v-if="current.coverUrl" :src="current.coverUrl" fit="cover" class="detail-cover" alt="公告封面" />
      <article class="rich-content" v-html="current.content" />
    </el-dialog>
  </div>
</template>

<style scoped>
.empty-state { margin: 24px 0 8px; text-align: center; color: var(--muted); }
.detail-meta { margin-block-end: 16px; }
.detail-cover { width: 100%; max-height: 260px; border-radius: 10px; margin-block-end: 16px; }
.rich-content { line-height: 1.8; word-break: break-word; }
.rich-content :deep(img) { max-width: 100%; height: auto; }
</style>
