import { PERMISSIONS } from '~~/shared/permissions'

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'system:roles')
  const body = await readBody(event)
  const name = text(body.name, '角色名称', 50)
  const permissions: string[] = Array.isArray(body.permissions) ? [...new Set<string>(body.permissions.map(String))] : []
  const allowed = new Set(PERMISSIONS.map((item) => item.code))
  if (permissions.some((code) => code !== '*' && !allowed.has(code))) throw createError({ statusCode: 400, message: '包含无效权限' })
  const result = await execute('INSERT INTO roles (code, name, permissions) VALUES (?, ?, ?)', [`custom-${crypto.randomUUID()}`, name, JSON.stringify(permissions)])
  await logAction(admin, '角色管理', name, '新增角色', event)
  return { id: result.insertId }
})
