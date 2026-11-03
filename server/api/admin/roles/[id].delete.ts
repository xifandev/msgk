export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'system:roles')
  const id = positiveId(getRouterParam(event, 'id'), '角色ID')
  const role = await queryOne<{ code: string, name: string }>('SELECT code, name FROM roles WHERE id = ?', [id])
  if (!role) throw createError({ statusCode: 404, message: '角色不存在' })
  if (['super', 'county', 'town', 'venue'].includes(role.code)) throw createError({ statusCode: 400, message: '系统内置角色不能删除' })
  const used = await queryOne('SELECT id FROM admins WHERE role_id = ? LIMIT 1', [id])
  if (used) throw createError({ statusCode: 409, message: '仍有管理员使用该角色，不能删除' })
  await execute('DELETE FROM roles WHERE id = ?', [id])
  await logAction(admin, '角色管理', role.name, '删除角色', event)
  return { ok: true }
})
