import { PERMISSIONS } from '~~/shared/permissions'

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'system:roles')
  const id = positiveId(getRouterParam(event, 'id'), '角色ID')
  const body = await readBody(event)
  const name = text(body.name, '角色名称', 50)
  const permissions: string[] = Array.isArray(body.permissions) ? [...new Set<string>(body.permissions.map(String))] : []
  const allowed = new Set(PERMISSIONS.map((item) => item.code))
  if (permissions.some((code) => code !== '*' && !allowed.has(code))) throw createError({ statusCode: 400, message: '包含无效权限' })
  const role = await queryOne<{ code: string }>('SELECT code FROM roles WHERE id = ?', [id])
  if (!role) throw createError({ statusCode: 404, message: '角色不存在' })
  if (role.code === 'super' && !permissions.includes('*')) throw createError({ statusCode: 400, message: '系统管理员必须保留全部权限' })
  await execute('UPDATE roles SET name = ?, permissions = ? WHERE id = ?', [name, JSON.stringify(permissions), id])
  await logAction(admin, '角色管理', name, '编辑角色', event)
  return { ok: true }
})
