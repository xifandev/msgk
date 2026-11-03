export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'news:delete')
  const id = positiveId(getRouterParam(event, 'id'), '新闻ID')
  const result = await execute('DELETE FROM news_articles WHERE id = ?', [id])
  if (!result.affectedRows) throw createError({ statusCode: 404, message: '新闻不存在' })
  await logAction(admin, 'news', `新闻#${id}`, '删除新闻', event)
  return { ok: true }
})
