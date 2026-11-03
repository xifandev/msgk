export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'system:admins')
  const body = await readBody(event)
  const phone = text(body.phone, '手机号', 20)
  if (!/^1[3-9]\d{9}$/.test(phone)) throw createError({ statusCode: 400, message: '手机号格式不正确' })
  const name = text(body.name, '姓名', 50)
  const roleId = positiveId(body.roleId, '角色ID')
  if (!await queryOne('SELECT id FROM roles WHERE id = ?', [roleId])) throw createError({ statusCode: 400, message: '角色不存在' })
  if (await queryOne('SELECT id FROM admins WHERE phone = ?', [phone])) throw createError({ statusCode: 409, message: '手机号已存在' })
  const allVenues = body.allVenues ? 1 : 0
  const venueIds = Array.isArray(body.venueIds) ? [...new Set(body.venueIds.map((id: unknown) => positiveId(id, '场所ID')))] : []
  if (!allVenues && venueIds.length === 0) throw createError({ statusCode: 400, message: '请选择管辖场所或设为全部场所' })
  const result = await execute(
    'INSERT INTO admins (phone, name, role_id, organization, note, all_venues, venue_ids) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [phone, name, roleId, text(body.organization, '单位', 100, false), text(body.note, '备注', 500, false), allVenues, JSON.stringify(venueIds)]
  )
  await logAction(admin, '管理员管理', phone, '新增管理员', event)
  return { id: result.insertId }
})
