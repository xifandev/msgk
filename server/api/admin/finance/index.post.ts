export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'finance:edit')
  const body = await readBody(event)
  const venueId = positiveId(body.venueId, '场所ID')
  const month = String(body.month ?? '')
  requireVenueScope(admin, venueId)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw createError({ statusCode: 400, message: '月份格式不正确' })
  const existing = await queryOne('SELECT id FROM bills WHERE venue_id = ? AND bill_month = ?', [venueId, month])
  if (existing) throw createError({ statusCode: 409, message: '该场所这个月份的账单已存在' })
  const result = await execute('INSERT INTO bills (venue_id, bill_month, created_by, updated_by) VALUES (?, ?, ?, ?)', [venueId, month, admin.id, admin.id])
  await logAction(admin, '财务公开', `${venueId}/${month}`, '新增月度账单', event)
  return { id: result.insertId }
})
