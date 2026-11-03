import { PERMISSIONS } from '~~/shared/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'system:roles')
  const roles = await query('SELECT * FROM roles ORDER BY id')
  return { list: roles.map((role) => ({ ...role, permissions: parseJson<string[]>(role.permissions, []) })), definitions: PERMISSIONS }
})
