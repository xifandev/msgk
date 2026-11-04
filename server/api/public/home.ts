interface ItemRow {
  id: number
  title: string
  created_at: string
  category_name?: string | null
}

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  const input = getQuery(event)
  const venueId = input.venueId === undefined || input.venueId === '' ? null : positiveId(input.venueId, '场所ID')

  const safetySql = venueId
    ? `SELECT a.id, a.title, a.created_at FROM safety_articles a
       WHERE a.state = 'approved' AND a.published = 1
         AND EXISTS (SELECT 1 FROM safety_article_venues sav WHERE sav.article_id = a.id AND sav.venue_id = ?)
       ORDER BY a.created_at DESC, a.id DESC LIMIT 10`
    : `SELECT a.id, a.title, a.created_at FROM safety_articles a
       WHERE a.state = 'approved' AND a.published = 1
       ORDER BY a.created_at DESC, a.id DESC LIMIT 10`
  const safetyParams = venueId ? [venueId] : []

  const [safety, notices, news] = await Promise.all([
    query<ItemRow>(safetySql, safetyParams),
    query<ItemRow>(
      "SELECT id, title, created_at FROM notices WHERE kind = 'public' AND published = 1 ORDER BY created_at DESC, id DESC LIMIT 10"
    ),
    query<ItemRow>(
      `SELECT n.id, n.title, n.created_at, c.name AS category_name
       FROM news_articles n
       LEFT JOIN news_categories c ON c.id = n.category_id
       WHERE n.published = 1
       ORDER BY n.created_at DESC, n.id DESC LIMIT 10`
    )
  ])

  const items = [
    ...safety.map(row => ({ kind: 'safety' as const, id: row.id, title: row.title, createdAt: row.created_at })),
    ...notices.map(row => ({ kind: 'notice' as const, id: row.id, title: row.title, createdAt: row.created_at })),
    ...news.map(row => ({
      kind: 'news' as const,
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      category: row.category_name || null
    }))
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id))
    .slice(0, 10)

  return { items }
})
