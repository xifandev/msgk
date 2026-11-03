export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'system:admins')
  const id = positiveId(getRouterParam(event, 'id'), '管理员ID')
  if (id === admin.id) throw createError({ statusCode: 400, message: '不能删除当前登录账号' })
  const target = await queryOne<{ phone: string, role_id: number }>('SELECT phone, role_id FROM admins WHERE id = ?', [id])
  if (!target) throw createError({ statusCode: 404, message: '管理员不存在' })
  if (target.role_id === 999) throw createError({ statusCode: 403, message: '系统管理员账号不能删除' })
  await execute('DELETE FROM admins WHERE id = ?', [id])
  await logAction(admin, '管理员管理', target.phone, '删除管理员', event)
  return { ok: true }
})
