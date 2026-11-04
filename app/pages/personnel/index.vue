<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Rank } from '@element-plus/icons-vue'
import Sortable from 'sortablejs'
import { reviewActionMessage } from '~~/shared/review'

interface Member {
  key: number
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
const memberListRef = ref<HTMLElement | null>(null)
const dirty = ref(false)
let suppressDirty = false
let memberKey = 0
let memberSortable: Sortable | null = null
const QUICK_POSITIONS = ['民主管理组织负责人', '民主管理组织成员', '财务管理组织出纳', '财务管理组织会计', '财务管理组织资产管理', '安全生产组织成员']
const editable = computed(() => !!record.value && ['draft', 'rejected'].includes(record.value.state))
const canEdit = computed(() => hasPerm('personnel:edit') && editable.value)

function markDirty() {
  if (!suppressDirty) dirty.value = true
}

function emptyMember(): Member {
  return { key: ++memberKey, sort: members.value.length + 1, imageUrl: null, name: '', gender: '', clergy: '', position: '', phone: '' }
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
    let response: Record<string, any>
    try {
      response = await $fetch<Record<string, any>>(`/api/admin/personnel/${venueId.value}`)
    } catch (error: any) {
      // 该场所还没有名册：按空白的编辑中名册处理，首次保存时由接口创建
      if (error?.statusCode !== 404) throw error
      response = { venue_id: venueId.value, state: 'draft', published: 0, members: [] }
    }
    record.value = response
    suppressDirty = true
    members.value = (response.members ?? []).map((member: any, index: number) => ({
      key: ++memberKey,
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

function destroyMemberSortable() {
  memberSortable?.destroy()
  memberSortable = null
}

async function initMemberSortable() {
  await nextTick()
  destroyMemberSortable()
  if (!memberListRef.value) return
  memberSortable = Sortable.create(memberListRef.value, {
    animation: 180,
    handle: '.drag-handle',
    draggable: '.member-card',
    disabled: !canEdit.value,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    fallbackOnBody: true,
    onEnd: reorderMember
  })
}

function reorderMember(event: Sortable.SortableEvent) {
  if (event.oldIndex === undefined || event.newIndex === undefined || event.oldIndex === event.newIndex) return
  const [member] = members.value.splice(event.oldIndex, 1)
  if (!member) return
  members.value.splice(event.newIndex, 0, member)
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
    const payload = members.value.map((member, index) => ({
      sort: index + 1,
      imageUrl: member.imageUrl,
      name: member.name.trim(),
      gender: member.gender,
      clergy: member.clergy,
      position: member.position.trim(),
      phone: member.phone
    }))
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
watch([memberListRef, canEdit], initMemberSortable, { flush: 'post' })
onMounted(() => { if (!venueId.value && venues.value.length) venueId.value = venues.value[0]!.id })
onBeforeUnmount(destroyMemberSortable)
</script>

<template>
  <div class="page">
    <div class="page-bar">
      <span class="page-bar-label">当前场所</span>
      <VenueSelect v-model="venueId" style="width: 320px" />
    </div>
    <div v-if="record" v-loading="loading" class="detail-layout">
      <section class="panel">
        <div class="toolbar">
          <span class="toolbar-note">共 {{ members.length }} 人</span>
          <div class="toolbar-actions">
            <el-button v-if="canEdit" :loading="saving" @click="save">{{ dirty ? '保存名册（有未保存修改）' : '保存名册' }}</el-button>
            <el-button v-if="canEdit" type="primary" :icon="Plus" @click="addMember">添加人员</el-button>
          </div>
        </div>
        <p v-if="canEdit" class="muted hint-text">拖动成员卡片行首手柄调整顺序，保存名册后生效。</p>
        <p v-if="!editable" class="muted">当前内容正在审核或已经通过，如需修改请先重新编辑。</p>
        <el-empty v-if="!members.length" description="尚未添加人员" />
        <div ref="memberListRef" class="member-list">
          <article v-for="(member, index) in members" :key="member.key" class="member-card" :class="{ 'is-editing': canEdit }">
            <template v-if="canEdit">
              <div class="member-head">
                <button type="button" class="drag-handle member-handle" :aria-label="`拖动第${index + 1}位成员`" title="拖动排序">
                  <el-icon><Rank /></el-icon>
                </button>
                <span class="member-no" aria-hidden="true">{{ index + 1 }}</span>
                <strong>第 {{ index + 1 }} 位成员</strong>
                <span v-if="member.name" class="member-name">{{ member.name }}</span>
                <div class="member-actions"><el-button size="small" type="danger" plain @click="removeMember(index)">删除</el-button></div>
              </div>
              <div class="member-body">
                <ImageUpload v-model="member.imageUrl" :label="`${member.name || '成员'}照片`" />
                <el-form label-position="top" class="member-form" @change="markDirty"><div class="member-grid">
                  <el-form-item label="姓名" required><el-input v-model="member.name" maxlength="50" placeholder="请输入姓名" /></el-form-item>
                  <el-form-item label="性别"><el-select v-model="member.gender" clearable><el-option label="男" value="男" /><el-option label="女" value="女" /></el-select></el-form-item>
                  <el-form-item label="教职"><el-input v-model="member.clergy" maxlength="50" placeholder="没有可不填" /></el-form-item>
                  <el-form-item label="联系电话"><el-input v-model="member.phone" maxlength="30" placeholder="请输入联系电话" /></el-form-item>
                  <el-form-item label="职务" required class="span-2">
                    <div class="position-row">
                      <el-input v-model="member.position" type="textarea" :rows="2" maxlength="100" placeholder="请输入职务" />
                      <el-select placeholder="快速添加职务" clearable class="position-quick" @change="(value: string) => quickPosition(index, value)">
                        <el-option v-for="item in QUICK_POSITIONS" :key="item" :value="item" :label="item" />
                      </el-select>
                    </div>
                  </el-form-item>
                </div></el-form>
              </div>
            </template>
            <template v-else>
              <div class="member-photo">
                <el-image v-if="member.imageUrl" :src="member.imageUrl" :preview-src-list="[member.imageUrl]" fit="contain" class="photo-preview" :alt="`${member.name}照片`" />
                <span v-else class="photo-empty">暂无<br>照片</span>
              </div>
              <div class="member-info">
                <header class="member-head">
                  <h3>{{ member.name || '未填写姓名' }}</h3>
                  <span v-if="member.gender" class="member-gender">{{ member.gender }}</span>
                  <span class="member-index">第 {{ index + 1 }} 位</span>
                </header>
                <p class="member-clergy">{{ member.clergy || '教职未填写' }}</p>
                <dl class="member-fields">
                  <div><dt>职务</dt><dd class="pre">{{ member.position || '未填写' }}</dd></div>
                  <div><dt>联系电话</dt><dd>{{ member.phone || '未填写' }}</dd></div>
                </dl>
              </div>
            </template>
          </article>
        </div>
      </section>
      <aside class="panel review-side"><ReviewTimeline :record="record" /><div v-if="hasPerm('personnel:publish')" class="publish-box"><span>是否公开</span><el-switch :model-value="!!record.published" :disabled="record.state !== 'approved'" :aria-label="`${venueId}号场所人员名册是否公开`" @change="publish" /></div><ReviewActions :state="record.state" edit-permission="personnel:edit" review-permission="personnel:review" :submit-validator="validateSubmit" @action="review" /></aside>
    </div>
    <el-empty v-else-if="!loading" description="请选择要维护的场所" />
  </div>
</template>

<style scoped>
.detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 22px; align-items: start; }
.review-side { display: grid; gap: 20px; align-content: start; }
.publish-box { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; }
.review-side :deep(.review-status > .el-tag) { justify-self: start; }
.member-list { display: grid; gap: 12px; }
.member-card { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); transition: border-color 0.15s, box-shadow 0.15s; }
.member-card:hover { border-color: var(--el-color-primary-light-7); box-shadow: 0 6px 18px rgb(16 24 40 / 5%); }
.member-card:not(.is-editing) { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 16px; padding: 16px; }
.member-card.is-editing { padding: 16px; }
.member-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.is-editing .member-head { gap: 10px; margin-block-end: 12px; }
.member-head h3 { margin: 0; font-size: 18px; }
.member-handle { flex: none; margin-inline-start: -6px; }
.member-no { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--brand-soft); color: var(--brand); font-size: 13px; font-weight: 700; }
.member-name { padding: 1px 8px; border-radius: 6px; background: #f2f4f7; color: var(--muted); font-size: 12px; font-weight: 400; }
.member-actions { display: flex; gap: 8px; margin-inline-start: auto; }
.member-actions .el-button + .el-button { margin-inline-start: 0; }
.member-body { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 18px; align-items: start; }
.member-form { width: 100%; }
.member-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }
.member-grid .span-2 { grid-column: span 2; }
.member-grid .el-select { width: 100%; }
.position-row { display: grid; gap: 8px; width: 100%; }
.position-quick { max-width: 260px; }
.hint-text { margin-block-start: -6px; }
.member-photo { width: 104px; height: 136px; border: 1px solid var(--line); border-radius: 10px; overflow: clip; background: #f3f5f8; }
.photo-preview { display: block; width: 100%; height: 100%; background: #f3f5f8; }
.photo-empty { display: grid; place-items: center; width: 100%; height: 100%; color: var(--muted); font-size: 13px; line-height: 1.5; text-align: center; }
.member-info { min-width: 0; }
.member-gender { padding: 1px 8px; border-radius: 6px; background: #eef4fc; color: var(--brand); font-size: 12px; }
.member-index { margin-inline-start: auto; color: var(--muted); font-size: 12px; }
.member-clergy { margin: 6px 0 10px; color: var(--muted); font-size: 13px; }
.member-fields { display: grid; gap: 8px; margin: 0; }
.member-fields > div { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 10px; align-items: start; }
.member-fields dt { color: var(--muted); font-size: 13px; }
.member-fields dd { margin: 0; font-size: 14px; }
.pre { white-space: pre-line; }
.muted { color: var(--muted); font-size: 13px; }
@media (max-width: 900px) { .detail-layout { grid-template-columns: 1fr; } .member-body { grid-template-columns: 1fr; } .member-grid { grid-template-columns: 1fr; } }
@media (max-width: 560px) {
  .member-card:not(.is-editing) { grid-template-columns: 76px minmax(0, 1fr); gap: 12px; padding: 12px; }
  .member-photo { width: 76px; height: 104px; }
  .member-index { flex-basis: 100%; margin-inline-start: 0; }
  .member-fields > div { grid-template-columns: minmax(0, 1fr); gap: 2px; }
}
</style>
