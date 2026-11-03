export default defineEventHandler(async (event) => {
  await requirePermission(event, 'news:view')
  const list = await query(
    `SELECT c.id, c.name, c.sort_order AS sortOrder, c.created_at AS createdAt,
            (SELECT COUNT(*) FROM news_articles a WHERE a.category_id = c.id) AS articleCount
     FROM news_categories c
     ORDER BY c.sort_order ASC, c.id ASC`
  )
  return { list }
})
