export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'notices:publish')
  const id = positiveId(getRouterParam(event, 'id'), '公告ID')
  const body = await readBody(event)
  if (typeof body?.published !== 'boolean') throw createError({ statusCode: 400, message: '请指定发布状态' })
  const published = body.published ? 1 : 0
  const result = await execute('UPDATE notices SET published = ?, updated_by = ? WHERE id = ?', [published, admin.id, id])
  if (!result.affectedRows) throw createError({ statusCode: 404, message: '公告不存在' })
  await logAction(admin, 'notices', `公告#${id}`, published ? '发布公告' : '取消发布公告', event)
  return { id, published: body.published }
})
