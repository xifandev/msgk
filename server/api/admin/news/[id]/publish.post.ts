export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'news:publish')
  const id = positiveId(getRouterParam(event, 'id'), '新闻ID')
  const body = await readBody(event)
  if (typeof body?.published !== 'boolean') throw createError({ statusCode: 400, message: '请指定发布状态' })
  const published = body.published ? 1 : 0
  const result = await execute('UPDATE news_articles SET published = ?, updated_by = ? WHERE id = ?', [published, admin.id, id])
  if (!result.affectedRows) throw createError({ statusCode: 404, message: '新闻不存在' })
  await logAction(admin, 'news', `新闻#${id}`, published ? '发布新闻' : '取消发布新闻', event)
  return { id, published: body.published }
})
