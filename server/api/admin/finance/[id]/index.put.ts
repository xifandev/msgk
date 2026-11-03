export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'finance:edit')
  const id = positiveId(getRouterParam(event, 'id'), '账单ID')
  const body = await readBody(event)
  const previousBalance = money(body.previousBalance ?? 0)
  await withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT venue_id, state FROM bills WHERE id = ? FOR UPDATE', [id])
    const bill = (rows as { venue_id: number, state: string }[])[0]
    if (!bill) throw createError({ statusCode: 404, message: '账单不存在' })
    requireVenueScope(admin, bill.venue_id)
    if (!['draft', 'rejected'].includes(bill.state)) throw createError({ statusCode: 409, message: '当前状态不能编辑账单' })
    await conn.query('UPDATE bills SET previous_balance = ?, updated_by = ? WHERE id = ?', [previousBalance, admin.id, id])
    await recalculateBill(conn, id)
  })
  await logAction(admin, '财务公开', String(id), '保存账单汇总', event)
  return { ok: true }
})
