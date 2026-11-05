<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
const { admin: currentAdmin, fetchMe } = useAdmin()
const list = ref<any[]>([])
const roles = ref<any[]>([])
const venues = ref<any[]>([])
const search = ref('')
const activeRole = ref(0)
const filteredList = computed(() => (activeRole.value ? list.value.filter((row) => row.role_id === activeRole.value) : list.value))
const roleCounts = computed(() => {
  const map: Record<number, number> = {}
  list.value.forEach((row) => { map[row.role_id] = (map[row.role_id] ?? 0) + 1 })
  return map
})
const visible = ref(false)
const saving = ref(false)
const form = reactive({ id: 0, phone: '', name: '', roleId: null as number | null, organization: '', note: '', status: 1, allVenues: 0, venueIds: [] as number[] })
async function load() { try { const response = await $fetch<any>('/api/admin/admins', { query: { search: search.value } }); list.value = response.list; roles.value = response.roles; venues.value = response.venues } catch (error) { ElMessage.error(errorMessage(error)) } }
const originalPhone = ref('')
function edit(row?: any) { Object.assign(form, row ? { id: row.id, phone: row.phone, name: row.name, roleId: row.role_id, organization: row.organization ?? '', note: row.note ?? '', status: row.status, allVenues: row.all_venues, venueIds: [...row.venue_ids] } : { id: 0, phone: '', name: '', roleId: null, organization: '', note: '', status: 1, allVenues: 0, venueIds: [] }); originalPhone.value = row ? row.phone : ''; visible.value = true }
async function save() {
  if (!form.name.trim()) { ElMessage.warning('真实姓名不允许为空！'); return }
  // 手机号仅在新增或改动时校验格式，便于维护测试账号等非标准号码
  if (form.phone.trim() !== originalPhone.value && !/^1[3-9]\d{9}$/.test(form.phone.trim())) { ElMessage.warning('手机号格式不正确！'); return }
  if (!form.roleId) { ElMessage.warning('请选择要担任的角色！'); return }
  if (!form.allVenues && !form.venueIds.length) { ElMessage.warning('请选择管辖场所！'); return }
  saving.value = true
  try { await $fetch(form.id ? `/api/admin/admins/${form.id}` : '/api/admin/admins', { method: form.id ? 'PUT' : 'POST', body: form }); visible.value = false; ElMessage.success('管理员已保存'); await load() } catch (error) { ElMessage.error(errorMessage(error)) } finally { saving.value = false }
}
async function toggleStatus(row: any) {
  const original = row.status
  try {
    await $fetch(`/api/admin/admins/${row.id}`, {
      method: 'PUT',
      body: { phone: row.phone, name: row.name, roleId: row.role_id, organization: row.organization ?? '', note: row.note ?? '', status: row.status, allVenues: row.all_venues, venueIds: row.venue_ids }
    })
    ElMessage.success(row.status ? '已启用' : '已停用')
  } catch (error) {
    row.status = original ? 0 : 1
    ElMessage.error(errorMessage(error))
  }
}
async function remove(row: any) { await ElMessageBox.confirm(`确定删除管理员“${row.name}”吗？`, '删除管理员', { type: 'warning' }); await $fetch(`/api/admin/admins/${row.id}`, { method: 'DELETE' }); await load() }
async function impersonate(row: any) {
  await ElMessageBox.confirm(`以“${row.name}”的身份登录并查看其系统视图？顶部会显示代登录横条，可随时切回自己的账号。`, '代登录', { type: 'warning', confirmButtonText: '切换登录' })
  try {
    await $fetch(`/api/admin/admins/${row.id}/impersonate`, { method: 'POST' })
    await fetchMe(true)
    ElMessage.success(`已切换为 ${row.name} 的身份`)
    await navigateTo('/dashboard')
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
function venueNames(ids: number[]) { return ids.map((id) => venues.value.find((item) => item.id === id)?.name).filter(Boolean) }
onMounted(load)
</script>

<template>
  <div class="page">
    <nav class="tabs" role="tablist" aria-label="按角色筛选管理员">
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ active: activeRole === 0 }"
        :aria-selected="activeRole === 0"
        @click="activeRole = 0"
      >全部<em>{{ list.length }}</em></button>
      <button
        v-for="role in roles"
        :key="role.id"
        type="button"
        role="tab"
        class="tab"
        :class="{ active: activeRole === role.id }"
        :aria-selected="activeRole === role.id"
        @click="activeRole = role.id"
      >{{ role.name }}<em>{{ roleCounts[role.id] ?? 0 }}</em></button>
    </nav>

    <section class="panel">
      <div class="toolbar">
        <el-input v-model="search" placeholder="输入姓名或手机号查询" clearable aria-label="搜索管理员" @keyup.enter="load" @clear="load" />
        <el-button plain @click="load">查询</el-button>
        <div class="toolbar-actions">
          <el-button type="primary" :icon="Plus" @click="edit()">新增管理员</el-button>
        </div>
      </div>
      <div class="table-region" tabindex="0" role="region" aria-label="管理员列表">
        <el-table :data="filteredList">
          <el-table-column type="index" label="序号" width="64" />
          <el-table-column prop="name" label="姓名" width="80" />
          <el-table-column prop="phone" label="登录手机号" width="130" />
          <el-table-column prop="role_name" label="担任角色" width="100" />
          <el-table-column prop="organization" label="所属单位" min-width="90" />
          <el-table-column label="管辖场所" min-width="190">
            <template #default="{ row }">
              <span v-if="row.all_venues">全部场所</span>
              <div v-else class="venue-list">
                <el-tag v-for="name in venueNames(row.venue_ids).slice(0, 5)" :key="name" class="venue-tag">{{ name }}</el-tag>
                <span v-if="venueNames(row.venue_ids).length > 5" class="venue-more">另有 {{ venueNames(row.venue_ids).length - 5 }} 处</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="note" label="备注" min-width="80" show-overflow-tooltip><template #default="{ row }">{{ row.note || '—' }}</template></el-table-column>
          <el-table-column prop="last_login_at" label="最近一次登录" width="150" />
          <el-table-column prop="last_action_at" label="最近一次操作" width="150"><template #default="{ row }">{{ row.last_action_at || '—' }}</template></el-table-column>
          <el-table-column label="可用状态" width="90">
            <template #default="{ row }">
              <el-switch v-model="row.status" :active-value="1" :inactive-value="0" :disabled="row.id === currentAdmin?.id || row.role_code === 'super'" :aria-label="`${row.name}账号状态`" @change="toggleStatus(row)" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right" align="right">
            <template #default="{ row }">
              <TableActions>
                <el-button size="small" type="primary" @click="edit(row)">编辑</el-button>
                <el-button v-if="currentAdmin?.roleCode === 'super' && row.status === 1 && row.id !== currentAdmin?.id && row.role_code !== 'super'" size="small" type="warning" plain @click="impersonate(row)">登录</el-button>
                <el-button v-if="row.id !== currentAdmin?.id && row.role_code !== 'super'" size="small" type="danger" plain @click="remove(row)">删除</el-button>
              </TableActions>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>

    <el-dialog v-model="visible" :title="form.id ? '编辑管理员' : '新增管理员'" width="min(680px, 95vw)">
      <el-form label-position="top" @submit.prevent="save">
        <div class="form-grid">
          <el-form-item label="姓名" required><el-input v-model="form.name" autocomplete="name" /></el-form-item>
          <el-form-item label="登录手机号" required><el-input v-model="form.phone" inputmode="numeric" autocomplete="tel" maxlength="11" /></el-form-item>
          <el-form-item label="担任角色" required>
            <el-select v-model="form.roleId"><el-option v-for="role in roles" :key="role.id" :value="role.id" :label="role.name" /></el-select>
          </el-form-item>
          <el-form-item label="所属单位"><el-input v-model="form.organization" /></el-form-item>
        </div>
        <el-form-item label="管辖全部场所"><el-switch v-model="form.allVenues" :active-value="1" :inactive-value="0" /></el-form-item>
        <el-form-item v-if="!form.allVenues" label="管辖场所（请点击选择）" required>
          <el-select v-model="form.venueIds" multiple filterable collapse-tags :max-collapse-tags="6">
            <el-option v-for="venue in venues" :key="venue.id" :value="venue.id" :label="`${venue.name}（${venue.township}）`" />
          </el-select>
        </el-form-item>
        <el-form-item label="账号状态">
          <el-radio-group v-model="form.status"><el-radio-button :value="1">启用</el-radio-button><el-radio-button :value="0">停用</el-radio-button></el-radio-group>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.note" type="textarea" maxlength="500" /></el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-actions">
          <el-button @click="visible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存管理员</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tabs { display: flex; flex-wrap: wrap; gap: 8px; padding-block: 2px; }
.tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: #475467;
  cursor: pointer;
  font-size: 13px;
  transition: border-color .15s, background-color .15s, color .15s;
}
.tab em { min-width: 22px; padding: 0 6px; border-radius: 999px; background: #eef1f5; color: var(--muted); font-style: normal; font-size: 11px; line-height: 20px; text-align: center; font-variant-numeric: tabular-nums; }
.tab:hover { border-color: var(--el-color-primary-light-5); color: var(--brand); }
.tab.active { border-color: var(--brand); background: var(--brand); color: #fff; }
.tab.active em { background: rgb(255 255 255 / 20%); color: #fff; }
.tab:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }

.venue-list { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding-block: 4px; }
.venue-tag { max-width: 100%; height: auto; margin: 0; padding-block: 1px; line-height: 1.5; white-space: normal; }
.venue-more { color: var(--muted); font-size: 12px; }
.muted { color: var(--muted); font-size: 13px; }
.el-select { width: 100%; }
</style>
