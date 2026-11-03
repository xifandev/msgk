export default defineEventHandler(async (event) => {
  await requirePermission(event, 'news:view')
  const { page, pageSize, offset, search } = pageParams(event)
  const input = getQuery(event)
  const where: string[] = []
  const params: unknown[] = []
  if (search) {
    where.push('a.title LIKE ?')
    params.push(`%${search}%`)
  }
  const categoryId = Number(input.categoryId)
  if (Number.isSafeInteger(categoryId) && categoryId > 0) {
    where.push('a.category_id = ?')
    params.push(categoryId)
  }
  if (input.published === '0' || input.published === '1') {
    where.push('a.published = ?')
    params.push(Number(input.published))
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM news_articles a ${whereSql}`, params)
  const list = await query(
    `SELECT a.id, a.category_id AS categoryId, c.name AS categoryName, a.title, a.summary,
            a.cover_url AS coverUrl, a.author_name AS authorName, a.published,
            a.created_at AS createdAt, a.updated_at AS updatedAt
     FROM news_articles a
     JOIN news_categories c ON c.id = a.category_id
     ${whereSql}
     ORDER BY a.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  )
  return { list, total: totalRow?.total ?? 0, page, pageSize }
})
