export default defineEventHandler(async (event) => {
  const id = positiveId(getRouterParam(event, 'id'), '账单ID')
  const body = await readBody(event)
  const action = String(body.action ?? '') as ReviewAction
  if (!['submit', 'approve', 'reject', 'reopen'].includes(action)) throw createError({ statusCode: 400, message: '审核操作不正确' })
  const permission = ['submit', 'reopen'].includes(action) ? 'finance:edit' : 'finance:review'
  const admin = await requirePermission(event, permission)
  const bill = await queryOne<{ venue_id: number, state: string }>('SELECT venue_id, state FROM bills WHERE id = ?', [id])
  if (!bill) throw createError({ statusCode: 404, message: '账单不存在' })
  requireVenueScope(admin, bill.venue_id)
  if (action === 'submit') {
    const count = await queryOne<{ total: number | string }>('SELECT COUNT(*) AS total FROM bill_items WHERE bill_id = ?', [id])
    if (Number(count?.total ?? 0) === 0) throw createError({ statusCode: 409, message: '请先录入至少一条收支明细，再提交审核' })
  }
  const next = nextReviewState(bill.state, admin.roleCode, action)
  const reason = action === 'reject' ? text(body.reason, '驳回原因', 500) : ''
  const data = reviewUpdate(action, next, reason, admin.roleCode, bill.state)
  data.updated_by = admin.id
  const columns = Object.keys(data)
  const result = await execute(`UPDATE bills SET ${columns.map((key) => `${key} = ?`).join(', ')} WHERE id = ? AND state = ?`, [...Object.values(data), id, bill.state])
  if (result.affectedRows !== 1) throw createError({ statusCode: 409, message: '账单状态已被其他操作更新，请刷新后重试' })
  await logAction(admin, '财务公开', String(id), `审核操作：${action}`, event)
  return { state: next }
})
