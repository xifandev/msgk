export default defineEventHandler(async (event) => {
  await requirePermission(event, 'notices:view')
  const id = positiveId(getRouterParam(event, 'id'), '公告ID')
  const row = await queryOne(
    `SELECT id, title, kind, cover_url AS coverUrl, content, author_name AS authorName, published,
            created_at AS createdAt, updated_at AS updatedAt
     FROM notices
     WHERE id = ?`,
    [id]
  )
  if (!row) throw createError({ statusCode: 404, message: '公告不存在' })
  return row
})
