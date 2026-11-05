export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'system:admins')
  const id = positiveId(getRouterParam(event, 'id'), '管理员ID')
  const body = await readBody(event)
  const target = await queryOne<{ role_id: number, phone: string }>('SELECT role_id, phone FROM admins WHERE id = ?', [id])
  if (!target) throw createError({ statusCode: 404, message: '管理员不存在' })
  const protectedSuper = target.role_id === 999
  const phone = protectedSuper ? target.phone : text(body.phone, '手机号', 20)
  // 手机号仅在改动时校验格式，保留存量测试账号等非标准号码的可维护性
  if (phone !== target.phone && !/^1[3-9]\d{9}$/.test(phone)) throw createError({ statusCode: 400, message: '手机号格式不正确' })
  const duplicate = await queryOne('SELECT id FROM admins WHERE phone = ? AND id <> ?', [phone, id])
  if (duplicate) throw createError({ statusCode: 409, message: '手机号已被使用' })
  const roleId = protectedSuper ? target.role_id : positiveId(body.roleId, '角色ID')
  if (!await queryOne('SELECT id FROM roles WHERE id = ?', [roleId])) throw createError({ statusCode: 400, message: '角色不存在' })
  if (id === admin.id && roleId !== admin.roleId) throw createError({ statusCode: 400, message: '不能修改自己的角色' })
  const allVenues = protectedSuper ? 1 : (body.allVenues ? 1 : 0)
  const venueIds = Array.isArray(body.venueIds) ? [...new Set(body.venueIds.map((value: unknown) => positiveId(value, '场所ID')))] : []
  if (!allVenues && venueIds.length === 0) throw createError({ statusCode: 400, message: '请选择管辖场所或设为全部场所' })
  const status = protectedSuper || id === admin.id ? 1 : (body.status ? 1 : 0)
  await execute(
    `UPDATE admins SET phone = ?, name = ?, role_id = ?, organization = ?, note = ?, status = ?, all_venues = ?, venue_ids = ? WHERE id = ?`,
    [phone, text(body.name, '姓名', 50), roleId, text(body.organization, '单位', 100, false), text(body.note, '备注', 500, false), status, allVenues, JSON.stringify(venueIds), id]
  )
  await logAction(admin, '管理员管理', phone, '编辑管理员', event)
  return { ok: true }
})
