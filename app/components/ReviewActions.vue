<script setup lang="ts">
import { ElMessage } from 'element-plus'

const props = defineProps<{
  state: string
  editPermission: string
  reviewPermission: string
}>()
const emit = defineEmits<{ action: [action: 'submit' | 'approve' | 'reject' | 'reopen', reason?: string] }>()
const { admin, hasPerm } = useAdmin()
const reason = ref('')
const canSubmit = computed(() => hasPerm(props.editPermission) && ['draft', 'rejected'].includes(props.state))
const canReview = computed(() => {
  if (!hasPerm(props.reviewPermission)) return false
  if (admin.value?.roleCode === 'town') return props.state === 'pending_town'
  if (['county', 'super'].includes(admin.value?.roleCode ?? '')) return props.state === 'pending_county'
  return ['pending_town', 'pending_county'].includes(props.state)
})
function reject() {
  if (!reason.value.trim()) {
    ElMessage.warning('请填写驳回原因')
    return
  }
  emit('action', 'reject', reason.value.trim())
  reason.value = ''
}
</script>

<template>
  <div class="review-actions">
    <el-button v-if="canSubmit" type="primary" @click="emit('action', 'submit')">提交审核</el-button>
    <template v-if="canReview">
      <el-input v-model="reason" placeholder="驳回时必填原因" maxlength="500" />
      <el-button type="success" @click="emit('action', 'approve')">通过审核</el-button>
      <el-button type="danger" plain @click="reject">驳回</el-button>
    </template>
    <el-button v-if="hasPerm(editPermission) && state !== 'draft'" plain @click="emit('action', 'reopen')">重新编辑</el-button>
  </div>
</template>

<style scoped>
.review-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.review-actions .el-input { flex: 1 1 240px; }
</style>
