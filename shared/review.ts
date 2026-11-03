export const REVIEW_LABELS: Record<string, string> = {
  draft: '正在编辑',
  pending_town: '待镇级审核',
  pending_county: '待县级审核',
  approved: '审核通过',
  rejected: '审核失败'
}

export const REVIEW_TAG_TYPES: Record<string, 'info' | 'warning' | 'success' | 'danger'> = {
  draft: 'info',
  pending_town: 'warning',
  pending_county: 'warning',
  approved: 'success',
  rejected: 'danger'
}

export function reviewLabel(state: string) {
  return REVIEW_LABELS[state] ?? state
}
