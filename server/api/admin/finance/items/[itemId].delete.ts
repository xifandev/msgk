export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'finance:edit')
  const itemId = positiveId(getRouterParam(event, 'itemId'), '明细ID')
  await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT i.id, b.id AS bill_id, b.venue_id, b.state FROM bill_items i
       JOIN bills b ON b.id = i.bill_id WHERE i.id = ? FOR UPDATE`,
      [itemId]
    )
    const item = (rows as { bill_id: number, venue_id: number, state: string }[])[0]
    if (!item) throw createError({ statusCode: 404, message: '明细不存在' })
    requireVenueScope(admin, item.venue_id)
    if (!['draft', 'rejected'].includes(item.state)) throw createError({ statusCode: 409, message: '当前状态不能删除明细' })
    await conn.query('DELETE FROM bill_items WHERE id = ?', [itemId])
    await recalculateBill(conn, item.bill_id)
  })
  await logAction(admin, '财务公开', String(itemId), '删除收支明细', event)
  return { ok: true }
})
