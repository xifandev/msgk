export const REVIEW_LABELS: Record<string, string> = {
  draft: '正在填报',
  pending_town: '待镇级审核',
  pending_county: '待县级审核',
  approved: '审核通过',
  rejected: '审核失败'
}

export const REVIEW_TAG_TYPES: Record<string, 'primary' | 'info' | 'warning' | 'success' | 'danger'> = {
  draft: 'primary',
  pending_town: 'info',
  pending_county: 'warning',
  approved: 'success',
  rejected: 'danger'
}

export const REVIEW_ACTION_MESSAGES: Record<string, string> = {
  submit: '已提交审核',
  approve: '已通过审核',
  reject: '已驳回，请修改后重新提交',
  reopen: '已退回为编辑中，修改后需重新提交审核'
}

export function reviewActionMessage(action: string) {
  return REVIEW_ACTION_MESSAGES[action] ?? '审核状态已更新'
}

export function reviewLabel(state: string) {
  return REVIEW_LABELS[state] ?? state
}
