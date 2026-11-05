<script setup lang="ts">
import { Check, Close } from '@element-plus/icons-vue'
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
const canReopen = computed(() => hasPerm(props.editPermission) && props.state !== 'draft')

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
    ElMessage.warning('请输入未通过原因')
    return
  }
  if (await confirmAction('确定审核不通过并退回吗？')) {
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
    <template v-if="canReview">
      <div class="review-field">
        <label class="review-field-label" for="review-reason">未通过原因</label>
        <el-input
          id="review-reason"
          v-model="reason"
          type="textarea"
          :rows="2"
          maxlength="500"
          resize="none"
          placeholder="仅审核不通过时填写，将随审核记录展示"
        />
      </div>
      <div class="review-buttons">
        <el-button type="primary" :icon="Check" @click="approve">通过审核</el-button>
        <el-button type="danger" plain :icon="Close" @click="reject">未通过审核</el-button>
      </div>
    </template>
    <div v-if="canSubmit || canReopen" class="review-secondary">
      <el-button v-if="canSubmit" type="primary" @click="submit">提交审核</el-button>
      <el-button v-if="canReopen" text @click="reopen">{{ reopenLabel ?? '重新编辑' }}</el-button>
    </div>
  </div>
</template>

<style scoped>
.review-actions { display: grid; gap: 14px; }
.review-field { display: grid; gap: 6px; }
.review-field-label { font-size: 12px; color: var(--muted); }
/* 主操作两枚按钮等分一行，任何侧栏宽度下都整齐 */
.review-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.review-buttons .el-button { margin: 0; width: 100%; }
/* 次级操作弱化为文字按钮，避免与审核主操作争夺注意力 */
.review-secondary { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding-block-start: 12px; border-block-start: 1px dashed var(--line); }
.review-secondary .el-button { margin: 0; }
.review-secondary .el-button:not(.el-button--primary) { color: var(--muted); }
.review-secondary .el-button:not(.el-button--primary):hover { color: var(--brand); }
</style>
