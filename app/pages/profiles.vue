<script setup lang="ts">
import { ElMessage } from 'element-plus'

useHead({ title: '场所介绍 | 码上公开' })
const { admin, venues, hasPerm } = useAdmin()
const venueId = ref<number | null>(null)
const loading = ref(false)
const saving = ref(false)
const profile = ref<Record<string, any> | null>(null)
const form = reactive({
  registration_date: '',
  religion: '',
  category: '',
  manager: '',
  phone: '',
  approval_authority: '',
  credit_code: '',
  address: '',
  summary: ''
})
const extraPairs = ref<{ key: string, value: string }[]>([])

const editable = computed(() => !!profile.value && ['draft', 'rejected'].includes(profile.value.state))
const canEdit = computed(() => hasPerm('venues:edit') && editable.value)

function toDateOnly(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function fillForm(row: Record<string, any>) {
  Object.assign(form, {
    registration_date: toDateOnly(row.registration_date),
    religion: row.religion ?? '',
    category: row.category ?? '',
    manager: row.manager ?? '',
    phone: row.phone ?? '',
    approval_authority: row.approval_authority ?? '',
    credit_code: row.credit_code ?? '',
    address: row.address ?? '',
    summary: row.summary ?? ''
  })
  extraPairs.value = Object.entries(row.extra ?? {}).map(([key, value]) => ({ key, value: String(value ?? '') }))
}

async function load() {
  if (!venueId.value) return
  loading.value = true
  try {
    const response = await $fetch<Record<string, any>>(`/api/admin/profiles/${venueId.value}`)
    profile.value = response
    fillForm(response)
  } catch (error) {
    profile.value = null
    ElMessage.error(errorMessage(error))
  } finally { loading.value = false }
}

function buildExtra() {
  const extra: Record<string, string> = {}
  for (const pair of extraPairs.value) {
    const key = pair.key.trim()
    if (!key && !pair.value.trim()) continue
    if (!key) throw new Error('扩展信息存在未填写名称的条目')
    if (key in extra) throw new Error(`扩展信息名称“${key}”重复`)
    extra[key] = pair.value.trim()
  }
  return extra
}

async function save() {
  try {
    const extra = buildExtra()
    saving.value = true
    const response = await $fetch<Record<string, any>>(`/api/admin/profiles/${venueId.value}`, {
      method: 'PUT',
      body: { ...form, registration_date: form.registration_date || null, extra }
    })
    profile.value = response
    fillForm(response)
    ElMessage.success('场所介绍已保存')
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { saving.value = false }
}

async function review(action: string, reason?: string) {
  try {
    const response = await $fetch<Record<string, any>>(`/api/admin/profiles/${venueId.value}/review`, { method: 'POST', body: { action, reason } })
    profile.value = response
    ElMessage.success('审核状态已更新')
  } catch (error) { ElMessage.error(errorMessage(error)) }
}

async function publish(value: string | number | boolean) {
  const published = Boolean(value)
  try {
    const response = await $fetch<Record<string, any>>(`/api/admin/profiles/${venueId.value}/publish`, { method: 'POST', body: { published } })
    profile.value = response
    ElMessage.success(published ? '已公开' : '已取消公开')
  } catch (error) { ElMessage.error(errorMessage(error)) }
}

watch(venueId, load)
onMounted(() => {
  if (!venueId.value && venues.value.length) venueId.value = venues.value[0]!.id
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div><h1>场所介绍</h1><p>按场所维护登记信息与简介，提交审核通过后可向公众公开。</p></div>
      <VenueSelect v-model="venueId" style="min-width: 240px" />
    </div>
    <div v-if="profile" v-loading="loading" class="detail-layout">
      <section class="panel">
        <el-form label-position="top" :disabled="!canEdit" @submit.prevent="save">
          <div class="form-grid">
            <el-form-item label="登记日期"><el-date-picker v-model="form.registration_date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" /></el-form-item>
            <el-form-item label="宗教类别"><el-input v-model="form.religion" maxlength="50" placeholder="如：佛教、道教" /></el-form-item>
            <el-form-item label="场所类别"><el-input v-model="form.category" maxlength="50" placeholder="如：寺观教堂、固定处所" /></el-form-item>
            <el-form-item label="负责人"><el-input v-model="form.manager" maxlength="50" /></el-form-item>
            <el-form-item label="联系电话"><el-input v-model="form.phone" maxlength="30" /></el-form-item>
            <el-form-item label="统一社会信用代码"><el-input v-model="form.credit_code" maxlength="50" /></el-form-item>
            <el-form-item label="批准登记机关" class="span-2"><el-input v-model="form.approval_authority" maxlength="150" /></el-form-item>
            <el-form-item label="地址" class="span-2"><el-input v-model="form.address" maxlength="255" /></el-form-item>
          </div>
          <el-form-item label="场所简介">
            <RichTextEditor v-if="canEdit" v-model="form.summary" />
            <div v-else class="summary-view" v-html="form.summary || '<p class=muted>暂无简介</p>'" />
          </el-form-item>
          <el-form-item label="扩展信息">
            <div class="extra-list">
              <div v-for="(pair, index) in extraPairs" :key="index" class="extra-row">
                <el-input v-model="pair.key" placeholder="名称，如：建筑面积" maxlength="50" aria-label="扩展信息名称" />
                <el-input v-model="pair.value" placeholder="内容" maxlength="500" aria-label="扩展信息内容" />
                <el-button v-if="canEdit" text type="danger" aria-label="删除该扩展信息" @click="extraPairs.splice(index, 1)">删除</el-button>
              </div>
              <el-button v-if="canEdit" plain @click="extraPairs.push({ key: '', value: '' })">添加扩展信息</el-button>
              <p v-if="!extraPairs.length" class="muted">暂无扩展信息，可添加“建筑面积”“始建年代”等自定义条目。</p>
            </div>
          </el-form-item>
          <el-button v-if="canEdit" type="primary" native-type="submit" :loading="saving">保存介绍</el-button>
          <p v-else-if="!editable" class="muted">当前状态为审核流程中，如需修改请先使用右侧“重新编辑”退回。</p>
        </el-form>
      </section>
      <aside class="panel review-side">
        <ReviewTimeline :record="profile" />
        <el-switch v-if="hasPerm('venues:publish')" :model-value="!!profile.published" :disabled="profile.state !== 'approved'" active-text="向公众公开" inactive-text="未公开" :aria-label="`${profile.venue_id}号场所介绍公开状态`" @change="publish" />
        <ReviewActions :state="profile.state" edit-permission="venues:edit" review-permission="venues:review" @action="review" />
      </aside>
    </div>
    <el-empty v-else-if="!loading" description="请选择要维护的场所" />
  </div>
</template>

<style scoped>
.detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 22px; align-items: start; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }
.span-2 { grid-column: span 2; }
.review-side { display: grid; gap: 20px; align-content: start; }
.summary-view { border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; width: 100%; min-height: 120px; }
.extra-list { display: grid; gap: 10px; width: 100%; }
.extra-row { display: grid; grid-template-columns: minmax(120px, 220px) minmax(0, 1fr) auto; gap: 10px; align-items: center; }
.muted { color: var(--muted); font-size: 13px; }
@media (max-width: 900px) {
  .detail-layout { grid-template-columns: 1fr; }
  .form-grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: span 1; }
}
</style>
