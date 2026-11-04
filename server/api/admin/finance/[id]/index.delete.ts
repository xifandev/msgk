export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'finance:delete')
  const id = positiveId(getRouterParam(event, 'id'), '账单ID')
  const bill = await queryOne<{ venue_id: number, bill_month: string, state: string }>('SELECT venue_id, bill_month, state FROM bills WHERE id = ?', [id])
  if (!bill) throw createError({ statusCode: 404, message: '账单不存在' })
  requireVenueScope(admin, bill.venue_id)
  if (bill.state !== 'draft') {
    throw createError({ statusCode: 409, message: '只有正在编辑的账单可以删除，请先“重新编辑”退回后再删除' })
  }
  await execute('DELETE FROM bills WHERE id = ?', [id])
  await logAction(admin, '财务公开', `${bill.venue_id}/${bill.bill_month}`, '删除账单及明细', event)
  return { ok: true }
})
