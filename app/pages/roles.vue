<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { PERMISSIONS, type PermissionDefinition } from '~~/shared/permissions'
const list = ref<any[]>([])
const visible = ref(false)
const form = reactive({ id: 0, code: '', name: '', permissions: [] as string[] })
const groups = computed(() => Object.groupBy(PERMISSIONS, (item: PermissionDefinition) => item.group))
async function load() { try { list.value = (await $fetch<{ list: any[] }>('/api/admin/roles')).list } catch (error) { ElMessage.error(errorMessage(error)) } }
function edit(row?: any) { Object.assign(form, row ? { id: row.id, code: row.code, name: row.name, permissions: [...row.permissions] } : { id: 0, code: '', name: '', permissions: [] }); visible.value = true }
function groupCodes(items?: PermissionDefinition[]) {
  return (items ?? []).map((item) => item.code)
}
function groupChecked(items?: PermissionDefinition[]) {
  return groupCodes(items).length > 0 && groupCodes(items).every((code) => form.permissions.includes(code))
}
function groupIndeterminate(items?: PermissionDefinition[]) {
  const codes = groupCodes(items)
  const count = codes.filter((code) => form.permissions.includes(code)).length
  return count > 0 && count < codes.length
}
function toggleGroup(checked: any, items?: PermissionDefinition[]) {
  const codes = groupCodes(items)
  const rest = form.permissions.filter((code) => !codes.includes(code))
  form.permissions = checked ? [...rest, ...codes] : rest
}
async function save() {
  if (!form.name.trim()) { ElMessage.warning('角色名不能为空！'); return }
  if (!form.permissions.length && form.code !== 'super') { ElMessage.warning('您还未分配权限！'); return }
  try { await $fetch(form.id ? `/api/admin/roles/${form.id}` : '/api/admin/roles', { method: form.id ? 'PUT' : 'POST', body: form }); visible.value = false; ElMessage.success('角色已保存'); await load() } catch (error) { ElMessage.error(errorMessage(error)) }
}
async function remove(row: any) {
  try {
    await ElMessageBox.confirm(`此操作将永久删除角色“${row.name}”，是否继续？`, '警告', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
  } catch { return }
  try {
    await $fetch(`/api/admin/roles/${row.id}`, { method: 'DELETE' })
    ElMessage.success('删除成功')
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div><h1>角色权限</h1><p>功能权限与场所数据范围分开管理，修改后实时生效。</p></div>
      <div class="header-actions">
        <el-button @click="load">刷新</el-button>
        <el-button type="primary" @click="edit()">新增角色</el-button>
      </div>
    </div>
    <section class="panel table-region" tabindex="0" role="region" aria-label="角色列表">
      <el-table :data="list"><el-table-column type="index" label="序号" width="64" /><el-table-column prop="name" label="角色名" width="180" /><el-table-column label="拥有权限"><template #default="{ row }"><el-tag v-for="code in row.permissions" :key="code" class="perm-tag" effect="plain">{{ code === '*' ? '全部权限' : PERMISSIONS.find((item) => item.code === code)?.name ?? code }}</el-tag></template></el-table-column><el-table-column label="操作" width="150"><template #default="{ row }"><el-button text bg type="primary" @click="edit(row)">编辑</el-button><el-button v-if="!['super','county','town','venue'].includes(row.code)" text type="danger" @click="remove(row)">删除</el-button></template></el-table-column></el-table>
    </section>
    <el-dialog v-model="visible" :title="form.id ? '编辑角色' : '新增角色'" width="min(720px, 95vw)">
      <el-form label-position="top" @submit.prevent="save">
        <el-form-item label="角色名称" required><el-input v-model="form.name" maxlength="50" placeholder="请输入角色名称" /></el-form-item>
        <el-form-item label="功能权限">
          <el-checkbox v-if="form.code === 'super'" model-value="true" disabled>全部权限</el-checkbox>
          <div v-for="(items, group) in groups" :key="group" class="permission-group">
            <div class="permission-group-head">
              <h3>{{ group }}</h3>
              <el-checkbox :model-value="groupChecked(items)" :indeterminate="groupIndeterminate(items)" @change="(checked: any) => toggleGroup(checked, items)">全选</el-checkbox>
            </div>
            <el-checkbox-group v-model="form.permissions">
              <el-checkbox v-for="item in items" :key="item.code" :value="item.code">{{ item.name }}</el-checkbox>
            </el-checkbox-group>
          </div>
        </el-form-item>
        <el-button type="primary" native-type="submit">提交保存</el-button>
      </el-form>
    </el-dialog>
  </div>
</template>

<style scoped>
.header-actions { display: flex; gap: 10px; }
.perm-tag { margin: 3px; }
.permission-group { padding-block: 8px; border-block-end: 1px solid var(--line); }
.permission-group-head { display: flex; align-items: center; gap: 14px; }
.permission-group-head h3 { margin: 4px 0 8px; font-size: 15px; }
</style>
