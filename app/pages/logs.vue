<script setup lang="ts">
import { ElMessage } from 'element-plus'
useHead({ title: '操作日志 | 码上公开' })
const list = ref<any[]>([])
const total = ref(0)
const queryInput = reactive({ page: 1, pageSize: 20, search: '' })
async function load() { try { const response = await $fetch<any>('/api/admin/logs', { query: queryInput }); list.value = response.list; total.value = response.total } catch (error) { ElMessage.error(errorMessage(error)) } }
watch(() => [queryInput.page, queryInput.pageSize], load)
onMounted(load)
</script>

<template>
  <div class="page"><div class="page-header"><div><h1>操作日志</h1><p>记录登录用户在后台执行的数据变更和审核操作。</p></div></div><section class="panel"><div class="toolbar"><el-input v-model="queryInput.search" placeholder="搜索模块、对象或操作人" clearable @keyup.enter="queryInput.page = 1; load()" /><el-button @click="queryInput.page = 1; load()">查询</el-button></div><div class="table-region" tabindex="0" role="region" aria-label="操作日志列表"><el-table :data="list"><el-table-column prop="module" label="模块" width="120" /><el-table-column prop="target" label="操作对象" min-width="150" /><el-table-column prop="action" label="操作内容" min-width="180" /><el-table-column prop="admin_name" label="操作人" width="110" /><el-table-column prop="ip" label="IP" width="140" /><el-table-column prop="created_at" label="操作时间" width="180" /></el-table></div><div class="pagination"><el-pagination v-model:current-page="queryInput.page" v-model:page-size="queryInput.pageSize" :total="total" layout="total, sizes, prev, pager, next" /></div></section></div>
</template>
