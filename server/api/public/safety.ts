interface SafetyRow {
  id: number
  title: string
  cover_url: string | null
  author_name: string | null
  created_at: string
}

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  const input = getQuery(event)
  const venueId = positiveId(input.venueId, '场所ID')
  const { page, pageSize, offset } = pageParams(event)

  const where = `a.state = 'approved' AND a.published = 1
    AND EXISTS (SELECT 1 FROM safety_article_venues sav WHERE sav.article_id = a.id AND sav.venue_id = ?)`
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM safety_articles a WHERE ${where}`,
    [venueId]
  )
  const total = Number(totalRow?.total ?? 0)
  const rows = total
    ? await query<SafetyRow>(
        `SELECT a.id, a.title, a.cover_url, a.author_name, a.created_at
         FROM safety_articles a WHERE ${where}
         ORDER BY a.created_at DESC, a.id DESC LIMIT ${pageSize} OFFSET ${offset}`,
        [venueId]
      )
    : []

  return {
    list: rows.map(row => ({
      id: row.id,
      title: row.title,
      coverUrl: row.cover_url,
      authorName: row.author_name,
      createdAt: row.created_at
    })),
    page,
    totalPages: Math.ceil(total / pageSize)
  }
})
