export default defineEventHandler(async (event) => {
  await requirePermission(event, 'news:view')
  const id = positiveId(getRouterParam(event, 'id'), '新闻ID')
  const row = await queryOne(
    `SELECT a.id, a.category_id AS categoryId, c.name AS categoryName, a.title, a.summary,
            a.cover_url AS coverUrl, a.content, a.author_name AS authorName, a.publish_unit AS publishUnit, a.published,
            a.created_at AS createdAt, a.updated_at AS updatedAt
     FROM news_articles a
     JOIN news_categories c ON c.id = a.category_id
     WHERE a.id = ?`,
    [id]
  )
  if (!row) throw createError({ statusCode: 404, message: '新闻不存在' })
  return row
})
