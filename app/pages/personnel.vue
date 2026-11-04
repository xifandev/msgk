<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { reviewActionMessage } from '~~/shared/review'

interface Member {
  sort: number
  imageUrl: string | null
  name: string
  gender: string
  clergy: string
  position: string
  phone: string
}
const { venues, hasPerm } = useAdmin()
const venueId = ref<number | null>(null)
const loading = ref(false)
const saving = ref(false)
const record = ref<Record<string, any> | null>(null)
const members = ref<Member[]>([])
const dirty = ref(false)
let suppressDirty = false
const QUICK_POSITIONS = ['民主管理组织负责人', '民主管理组织成员', '财务管理组织出纳', '财务管理组织会计', '财务管理组织资产管理', '安全生产组织成员']
const editable = computed(() => !!record.value && ['draft', 'rejected'].includes(record.value.state))
const canEdit = computed(() => hasPerm('personnel:edit') && editable.value)

function markDirty() {
  if (!suppressDirty) dirty.value = true
}

function emptyMember(): Member {
  return { sort: members.value.length + 1, imageUrl: null, name: '', gender: '', clergy: '', position: '', phone: '' }
}

function addMember() {
  members.value.push(emptyMember())
  markDirty()
}

function quickPosition(index: number, value: string) {
  const member = members.value[index]
  if (!member || !value) return
  member.position = member.position ? `${member.position}\n${value}` : value
  markDirty()
}

async function load() {
  if (!venueId.value) return
  loading.value = true
  try {
    const response = await $fetch<Record<string, any>>(`/api/admin/personnel/${venueId.value}`)
    record.value = response
    suppressDirty = true
    members.value = (response.members ?? []).map((member: any, index: number) => ({
      sort: Number(member.sort) || index + 1,
      imageUrl: member.imageUrl ?? null,
      name: member.name ?? '',
      gender: member.gender ?? '',
      clergy: member.clergy ?? '',
      position: member.position ?? '',
      phone: member.phone ?? ''
    }))
    dirty.value = false
  } catch (error) {
    record.value = null
    ElMessage.error(errorMessage(error))
  } finally { loading.value = false; suppressDirty = false }
}

function move(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= members.value.length) return
  const [item] = members.value.splice(index, 1)
  members.value.splice(target, 0, item!)
  markDirty()
}

async function removeMember(index: number) {
  const member = members.value[index]
  if (member?.name) {
    try {
      await ElMessageBox.confirm(`是否要删除成员“${member.name}”？`, '警告', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
    } catch { return }
  }
  members.value.splice(index, 1)
  markDirty()
  ElMessage.info('已移除该成员，点击“保存名册”后生效')
}

async function save() {
  for (const [index, member] of members.value.entries()) {
    if (!member.name.trim()) {
      ElMessage.warning(`请填写第 ${index + 1} 位成员的姓名`)
      return
    }
    if (!member.position.trim()) {
      ElMessage.warning(`请填写第 ${index + 1} 位成员的职务`)
      return
    }
  }
  saving.value = true
  try {
    const payload = members.value.map((member, index) => ({ ...member, name: member.name.trim(), position: member.position.trim(), sort: index + 1 }))
    record.value = await $fetch<Record<string, any>>(`/api/admin/personnel/${venueId.value}`, { method: 'PUT', body: { members: payload } })
    ElMessage.success('人员名册已保存')
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { saving.value = false }
}

async function review(action: string, reason?: string) {
  try {
    record.value = await $fetch<Record<string, any>>(`/api/admin/personnel/${venueId.value}/review`, { method: 'POST', body: { action, reason } })
    ElMessage.success(reviewActionMessage(action))
  } catch (error) { ElMessage.error(errorMessage(error)) }
}

function validateSubmit() {
  if (dirty.value) return '名册有未保存的修改，请先点击“保存名册”'
  if (!members.value.length) return '请先添加人员，再提交审核'
  return null
}

async function publish(value: string | number | boolean) {
  const published = Boolean(value)
  try {
    record.value = await $fetch<Record<string, any>>(`/api/admin/personnel/${venueId.value}/publish`, { method: 'POST', body: { published } })
    ElMessage.success(published ? '已公开' : '已取消公开')
  } catch (error) { ElMessage.error(errorMessage(error)) }
}

watch(venueId, load)
onMounted(() => { if (!venueId.value && venues.value.length) venueId.value = venues.value[0]!.id })
</script>

<template>
  <div class="page">
    <div class="page-header"><div><h1>人员公开</h1><p>按场所维护教职与工作人员名册，审核通过后向公众公开。</p></div><VenueSelect v-model="venueId" style="min-width: 240px" /></div>
    <div v-if="record" v-loading="loading" class="detail-layout">
      <section class="panel">
        <div class="toolbar">
          <el-button v-if="canEdit" type="primary" @click="addMember">添加人员</el-button>
          <el-button v-if="canEdit" type="success" plain :loading="saving" @click="save">{{ dirty ? '保存名册（有未保存修改）' : '保存名册' }}</el-button>
          <span class="muted">共 {{ members.length }} 人</span>
        </div>
        <p v-if="canEdit" class="muted hint-text">人员信息编辑完成后，点击右侧“提交审核”即可。</p>
        <p v-if="!editable" class="muted">当前内容正在审核或已经通过，如需修改请先重新编辑。</p>
        <el-empty v-if="!members.length" description="尚未添加人员" />
        <div v-for="(member, index) in members" :key="index" class="member-card">
          <div class="member-head"><strong>第 {{ index + 1 }} 位成员</strong><div v-if="canEdit"><el-button text :disabled="index === 0" @click="move(index, -1)">上移</el-button><el-button text :disabled="index === members.length - 1" @click="move(index, 1)">下移</el-button><el-button text type="danger" @click="removeMember(index)">删除</el-button></div></div>
          <div class="member-body">
            <ImageUpload v-if="canEdit" v-model="member.imageUrl" :label="`${member.name || '成员'}照片`" />
            <el-image v-else-if="member.imageUrl" :src="member.imageUrl" :preview-src-list="[member.imageUrl]" fit="cover" class="photo-preview" :alt="`${member.name}照片`" />
            <span v-else class="muted">未上传照片</span>
            <el-form label-position="top" :disabled="!canEdit" class="member-form" @change="markDirty"><div class="member-grid">
              <el-form-item label="姓名" required><el-input v-model="member.name" maxlength="50" placeholder="请输入姓名" /></el-form-item>
              <el-form-item label="性别"><el-select v-model="member.gender" clearable><el-option label="男" value="男" /><el-option label="女" value="女" /></el-select></el-form-item>
              <el-form-item label="教职"><el-input v-model="member.clergy" maxlength="50" placeholder="如：法师、道长，没有可不填" /></el-form-item>
              <el-form-item label="联系电话"><el-input v-model="member.phone" maxlength="30" placeholder="请输入联系电话" /></el-form-item>
              <el-form-item label="职务" required class="span-2">
                <div class="position-row">
                  <el-input v-model="member.position" type="textarea" :rows="2" maxlength="100" placeholder="请输入职务" />
                  <el-select v-if="canEdit" placeholder="快速添加职务" clearable class="position-quick" @change="(value: string) => quickPosition(index, value)">
                    <el-option v-for="item in QUICK_POSITIONS" :key="item" :value="item" :label="item" />
                  </el-select>
                </div>
              </el-form-item>
            </div></el-form>
          </div>
        </div>
      </section>
      <aside class="panel review-side"><ReviewTimeline :record="record" /><el-switch v-if="hasPerm('personnel:publish')" :model-value="!!record.published" :disabled="record.state !== 'approved'" active-text="向公众公开" inactive-text="未公开" :aria-label="`${venueId}号场所人员名册公开状态`" @change="publish" /><ReviewActions :state="record.state" edit-permission="personnel:edit" review-permission="personnel:review" :submit-validator="validateSubmit" @action="review" /></aside>
    </div>
    <el-empty v-else-if="!loading" description="请选择要维护的场所" />
  </div>
</template>

<style scoped>
.detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 22px; align-items: start; }
.review-side { display: grid; gap: 20px; align-content: start; }
.member-card { border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-block-end: 16px; }
.member-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-block-end: 12px; }
.member-body { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 18px; align-items: start; }
.member-form { width: 100%; }
.member-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }
.member-grid .span-2 { grid-column: span 2; }
.member-grid .el-select { width: 100%; }
.position-row { display: grid; gap: 8px; width: 100%; }
.position-quick { max-width: 260px; }
.hint-text { margin-block-start: -6px; }
.photo-preview { width: 120px; height: 90px; border-radius: 10px; border: 1px solid var(--line); }
.muted { color: var(--muted); font-size: 13px; }
@media (max-width: 900px) { .detail-layout { grid-template-columns: 1fr; } .member-body { grid-template-columns: 1fr; } .member-grid { grid-template-columns: 1fr; } }
</style>
