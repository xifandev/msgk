export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'finance:publish')
  const id = positiveId(getRouterParam(event, 'id'), '账单ID')
  const body = await readBody(event)
  const bill = await queryOne<{ venue_id: number, state: string }>('SELECT venue_id, state FROM bills WHERE id = ?', [id])
  if (!bill) throw createError({ statusCode: 404, message: '账单不存在' })
  requireVenueScope(admin, bill.venue_id)
  if (bill.state !== 'approved') throw createError({ statusCode: 409, message: '审核通过后才能公开' })
  await execute('UPDATE bills SET published = ?, updated_by = ? WHERE id = ?', [body.published ? 1 : 0, admin.id, id])
  await logAction(admin, '财务公开', String(id), body.published ? '公开账单' : '取消公开账单', event)
  return { ok: true }
})
