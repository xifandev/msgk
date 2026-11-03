export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'finance:delete')
  const id = positiveId(getRouterParam(event, 'id'), '账单ID')
  const bill = await queryOne<{ venue_id: number, bill_month: string }>('SELECT venue_id, bill_month FROM bills WHERE id = ?', [id])
  if (!bill) throw createError({ statusCode: 404, message: '账单不存在' })
  requireVenueScope(admin, bill.venue_id)
  await execute('DELETE FROM bills WHERE id = ?', [id])
  await logAction(admin, '财务公开', `${bill.venue_id}/${bill.bill_month}`, '删除账单及明细', event)
  return { ok: true }
})
