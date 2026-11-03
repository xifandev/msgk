export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'safety:delete')
  const id = positiveId(getRouterParam(event, 'id'), '文章ID')
  const existing = await queryOne<{ id: number, title: string }>('SELECT id, title FROM safety_articles WHERE id = ?', [id])
  if (!existing) throw createError({ statusCode: 404, message: '文章不存在' })
  const venueIds = (await query<{ venue_id: number }>(
    'SELECT venue_id FROM safety_article_venues WHERE article_id = ?', [id]
  )).map((row) => row.venue_id)
  if (!admin.allVenues && (!venueIds.length || venueIds.some((venueId) => !admin.venueIds.includes(venueId)))) {
    throw createError({ statusCode: 403, message: '该文章关联的场所不在你的数据权限范围内' })
  }
  await execute('DELETE FROM safety_articles WHERE id = ?', [id])
  await logAction(admin, 'safety', `安全文章#${id}`, `删除安全文章《${existing.title}》`, event)
  return { ok: true }
})
