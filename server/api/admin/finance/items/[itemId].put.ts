export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'finance:edit')
  const itemId = positiveId(getRouterParam(event, 'itemId'), '明细ID')
  const body = await readBody(event)
  const kind = String(body.kind ?? '')
  if (!['income', 'expense'].includes(kind)) throw createError({ statusCode: 400, message: '收支类型不正确' })
  const occurredOn = String(body.occurredOn ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) throw createError({ statusCode: 400, message: '日期格式不正确' })
  const amount = money(body.amount)
  if (Number(amount) <= 0) throw createError({ statusCode: 400, message: '金额必须大于0' })
  const summary = text(body.summary, '摘要', 100)
  await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT i.id, b.id AS bill_id, b.venue_id, b.bill_month, b.state
       FROM bill_items i JOIN bills b ON b.id = i.bill_id WHERE i.id = ? FOR UPDATE`,
      [itemId]
    )
    const item = (rows as { bill_id: number, venue_id: number, bill_month: string, state: string }[])[0]
    if (!item) throw createError({ statusCode: 404, message: '明细不存在' })
    requireVenueScope(admin, item.venue_id)
    if (!['draft', 'rejected'].includes(item.state)) throw createError({ statusCode: 409, message: '当前状态不能编辑明细' })
    if (occurredOn.slice(0, 7) !== item.bill_month) throw createError({ statusCode: 400, message: '明细日期必须属于账单月份' })
    await conn.query('UPDATE bill_items SET occurred_on = ?, kind = ?, summary = ?, amount = ? WHERE id = ?', [occurredOn, kind, summary, amount, itemId])
  })
  await logAction(admin, '财务公开', String(itemId), '编辑收支明细', event)
  return { ok: true }
})
