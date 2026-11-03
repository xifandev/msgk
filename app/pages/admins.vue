<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

useHead({ title: '管理员管理 | 码上公开' })
const { admin: currentAdmin } = useAdmin()
const list = ref<any[]>([])
const roles = ref<any[]>([])
const venues = ref<any[]>([])
const search = ref('')
const visible = ref(false)
const form = reactive({ id: 0, phone: '', name: '', roleId: null as number | null, organization: '', note: '', status: 1, allVenues: 0, venueIds: [] as number[] })
async function load() { try { const response = await $fetch<any>('/api/admin/admins', { query: { search: search.value } }); list.value = response.list; roles.value = response.roles; venues.value = response.venues } catch (error) { ElMessage.error(errorMessage(error)) } }
function edit(row?: any) { Object.assign(form, row ? { id: row.id, phone: row.phone, name: row.name, roleId: row.role_id, organization: row.organization ?? '', note: row.note ?? '', status: row.status, allVenues: row.all_venues, venueIds: [...row.venue_ids] } : { id: 0, phone: '', name: '', roleId: null, organization: '', note: '', status: 1, allVenues: 0, venueIds: [] }); visible.value = true }
async function save() { try { await $fetch(form.id ? `/api/admin/admins/${form.id}` : '/api/admin/admins', { method: form.id ? 'PUT' : 'POST', body: form }); visible.value = false; ElMessage.success('管理员已保存'); await load() } catch (error) { ElMessage.error(errorMessage(error)) } }
async function remove(row: any) { await ElMessageBox.confirm(`确定删除管理员“${row.name}”吗？`, '删除管理员', { type: 'warning' }); await $fetch(`/api/admin/admins/${row.id}`, { method: 'DELETE' }); await load() }
function venueNames(ids: number[]) { return ids.map((id) => venues.value.find((item) => item.id === id)?.name).filter(Boolean) }
onMounted(load)
</script>

<template>
  <div class="page"><div class="page-header"><div><h1>管理员管理</h1><p>配置登录手机号、功能角色和可管理的场所。</p></div><el-button type="primary" @click="edit()">新增管理员</el-button></div>
    <section class="panel"><div class="toolbar"><el-input v-model="search" placeholder="搜索姓名或手机号" clearable @keyup.enter="load" /><el-button @click="load">查询</el-button></div><div class="table-region" tabindex="0" role="region" aria-label="管理员列表"><el-table :data="list"><el-table-column prop="name" label="姓名" width="120" /><el-table-column prop="phone" label="手机号" width="140" /><el-table-column prop="role_name" label="角色" width="130" /><el-table-column prop="organization" label="单位" min-width="130" /><el-table-column label="管辖场所" min-width="230"><template #default="{ row }"><span v-if="row.all_venues">全部场所</span><el-tag v-else v-for="name in venueNames(row.venue_ids)" :key="name" class="venue-tag">{{ name }}</el-tag></template></el-table-column><el-table-column prop="last_login_at" label="最近登录" width="170" /><el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status ? 'success' : 'info'">{{ row.status ? '启用' : '停用' }}</el-tag></template></el-table-column><el-table-column label="操作" width="150" fixed="right"><template #default="{ row }"><el-button text @click="edit(row)">编辑</el-button><el-button v-if="row.id !== currentAdmin?.id && row.role_code !== 'super'" text type="danger" @click="remove(row)">删除</el-button></template></el-table-column></el-table></div></section>
    <el-dialog v-model="visible" :title="form.id ? '编辑管理员' : '新增管理员'" width="min(680px, 95vw)"><el-form label-position="top" @submit.prevent="save"><div class="form-grid"><el-form-item label="姓名" required><el-input v-model="form.name" autocomplete="name" /></el-form-item><el-form-item label="登录手机号" required><el-input v-model="form.phone" inputmode="numeric" autocomplete="tel" maxlength="11" /></el-form-item><el-form-item label="担任角色" required><el-select v-model="form.roleId"><el-option v-for="role in roles" :key="role.id" :value="role.id" :label="role.name" /></el-select></el-form-item><el-form-item label="所属单位"><el-input v-model="form.organization" /></el-form-item></div><el-form-item label="管辖全部场所"><el-switch v-model="form.allVenues" :active-value="1" :inactive-value="0" /></el-form-item><el-form-item v-if="!form.allVenues" label="管辖场所" required><el-select v-model="form.venueIds" multiple filterable><el-option v-for="venue in venues" :key="venue.id" :value="venue.id" :label="`${venue.name}（${venue.township}）`" /></el-select></el-form-item><el-form-item label="账号状态"><el-radio-group v-model="form.status"><el-radio-button :value="1">启用</el-radio-button><el-radio-button :value="0">停用</el-radio-button></el-radio-group></el-form-item><el-form-item label="备注"><el-input v-model="form.note" type="textarea" maxlength="500" /></el-form-item><el-button type="primary" native-type="submit">保存管理员</el-button></el-form></el-dialog>
  </div>
</template>

<style scoped>
.venue-tag { margin: 3px; }
.el-select { width: 100%; }
</style>
