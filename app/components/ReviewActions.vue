<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps<{
  state: string
  editPermission: string
  reviewPermission: string
  /** 提交审核前的校验，返回错误文案则中止（返回 null/空串表示通过）。 */
  submitValidator?: () => string | null
  /** 页面已有自己的提交审核入口时，隐藏组件内的“提交审核”按钮。 */
  hideSubmit?: boolean
  /** 退回草稿按钮的文案，默认“重新编辑”，财务公开等场景可传“重新填报”。 */
  reopenLabel?: string
}>()
const emit = defineEmits<{ action: [action: 'submit' | 'approve' | 'reject' | 'reopen', reason?: string] }>()
const { admin, hasPerm } = useAdmin()
const reason = ref('')
const canSubmit = computed(() => !props.hideSubmit && hasPerm(props.editPermission) && ['draft', 'rejected'].includes(props.state))
const canReview = computed(() => {
  if (!hasPerm(props.reviewPermission)) return false
  if (admin.value?.roleCode === 'town') return props.state === 'pending_town'
  if (['county', 'super'].includes(admin.value?.roleCode ?? '')) return props.state === 'pending_county'
  return ['pending_town', 'pending_county'].includes(props.state)
})

async function confirmAction(message: string) {
  try {
    await ElMessageBox.confirm(message, '提示', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
    return true
  } catch {
    return false
  }
}

async function submit() {
  const invalid = props.submitValidator?.()
  if (invalid) {
    ElMessage.warning(invalid)
    return
  }
  if (await confirmAction('确定要提交审核吗？')) emit('action', 'submit')
}

async function approve() {
  if (await confirmAction('确定要通过审核吗？')) emit('action', 'approve')
}

async function reject() {
  if (!reason.value.trim()) {
    ElMessage.warning('请输入审核失败原因')
    return
  }
  if (await confirmAction('确定要拒绝这条审核吗？')) {
    emit('action', 'reject', reason.value.trim())
    reason.value = ''
  }
}

async function reopen() {
  if (await confirmAction(`确定要${props.reopenLabel ?? '重新编辑'}吗？操作后需重新审核，已公开的内容将被取消公开。`)) emit('action', 'reopen')
}
</script>

<template>
  <div class="review-actions">
    <el-button v-if="canSubmit" type="primary" @click="submit">提交审核</el-button>
    <template v-if="canReview">
      <el-input v-model="reason" placeholder="请输入未通过原因" maxlength="500" aria-label="未通过原因" />
      <el-button type="success" @click="approve">通过审核</el-button>
      <el-button type="danger" plain @click="reject">未通过审核</el-button>
    </template>
    <el-button v-if="hasPerm(editPermission) && state !== 'draft'" type="primary" plain @click="reopen">{{ reopenLabel ?? '重新编辑' }}</el-button>
  </div>
</template>

<style scoped>
.review-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.review-actions .el-input { flex: 1 1 240px; }
</style>
