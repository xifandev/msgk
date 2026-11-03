const REVIEW_ACTIONS: ReviewAction[] = ['submit', 'approve', 'reject', 'reopen']
const ACTION_TEXT: Record<ReviewAction, string> = {
  submit: '提交审核',
  approve: '审核通过',
  reject: '驳回',
  reopen: '撤回重新编辑'
}

export default defineEventHandler(async (event) => {
  const id = positiveId(getRouterParam(event, 'id'), '文章ID')
  const body = await readBody(event)
  const action = String(body?.action ?? '') as ReviewAction
  if (!REVIEW_ACTIONS.includes(action)) throw createError({ statusCode: 400, message: '不支持的审核操作' })
  const admin = await requirePermission(event, action === 'approve' || action === 'reject' ? 'safety:review' : 'safety:edit')
  const reason = text(body?.reason, '审核意见', 500, false)
  if (action === 'reject' && !reason) throw createError({ statusCode: 400, message: '驳回时必须填写审核意见' })
  const article = await queryOne<{ id: number, title: string, state: string }>(
    'SELECT id, title, state FROM safety_articles WHERE id = ?', [id]
  )
  if (!article) throw createError({ statusCode: 404, message: '文章不存在' })
  const venueIds = (await query<{ venue_id: number }>(
    'SELECT venue_id FROM safety_article_venues WHERE article_id = ?', [id]
  )).map((row) => row.venue_id)
  if (!admin.allVenues && (!venueIds.length || venueIds.some((venueId) => !admin.venueIds.includes(venueId)))) {
    throw createError({ statusCode: 403, message: '该文章关联的场所不在你的数据权限范围内' })
  }
  const nextState = nextReviewState(article.state, admin.roleCode, action)
  const data = reviewUpdate(action, nextState, reason, admin.roleCode, article.state)
  const keys = Object.keys(data)
  const result = await execute(
    `UPDATE safety_articles SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_by = ? WHERE id = ? AND state = ?`,
    [...keys.map((key) => data[key] ?? null), admin.id, id, article.state]
  )
  if (result.affectedRows !== 1) throw createError({ statusCode: 409, message: '文章状态已变化，请刷新后重试' })
  await logAction(admin, 'safety', `安全文章#${id}`, `${ACTION_TEXT[action]}《${article.title}》`, event)
  return { id, state: nextState }
})
