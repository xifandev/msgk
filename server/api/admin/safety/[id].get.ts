export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'safety:view')
  const id = positiveId(getRouterParam(event, 'id'), '文章ID')
  const article = await queryOne<{ id: number }>('SELECT id FROM safety_articles WHERE id = ?', [id])
  if (!article) throw createError({ statusCode: 404, message: '文章不存在' })
  if (!admin.allVenues) {
    const linked = await queryOne<{ venue_id: number }>(
      `SELECT venue_id FROM safety_article_venues WHERE article_id = ? AND venue_id IN (${admin.venueIds.map(() => '?').join(',') || 'NULL'}) LIMIT 1`,
      [id, ...admin.venueIds]
    )
    if (!linked) throw createError({ statusCode: 404, message: '文章不存在' })
  }
  return await queryOne(
    `SELECT a.id, a.title, a.content, a.author_name AS authorName, a.publish_unit AS publishUnit,
            a.published, a.created_at AS createdAt, a.updated_at AS updatedAt
     FROM safety_articles a
     WHERE a.id = ?`,
    [id]
  )
})
