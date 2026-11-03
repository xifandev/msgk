export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'dashboard:view')
  const body = await readBody(event)
  await execute('UPDATE admins SET notice_enabled = ? WHERE id = ?', [body.noticeEnabled ? 1 : 0, admin.id])
  return { ok: true }
})
