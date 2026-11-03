export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'notices:delete')
  const id = positiveId(getRouterParam(event, 'id'), '公告ID')
  const result = await execute('DELETE FROM notices WHERE id = ?', [id])
  if (!result.affectedRows) throw createError({ statusCode: 404, message: '公告不存在' })
  await logAction(admin, 'notices', `公告#${id}`, '删除公告', event)
  return { ok: true }
})
