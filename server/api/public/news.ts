interface CategoryRow {
  id: number
  name: string
  sort_order: number
}

interface NewsRow {
  id: number
  category_id: number
  title: string
  summary: string | null
  cover_url: string | null
  author_name: string | null
  created_at: string
}

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  const input = getQuery(event)
  const categoryId = input.categoryId === undefined || input.categoryId === '' ? null : positiveId(input.categoryId, '分类ID')

  const categories = await query<CategoryRow>(
    'SELECT id, name, sort_order FROM news_categories ORDER BY sort_order ASC, id ASC'
  )
  const effectiveCategoryId = categoryId ?? categories[0]?.id ?? null
  const rows = effectiveCategoryId
    ? await query<NewsRow>(
        `SELECT id, category_id, title, summary, cover_url, author_name, created_at
         FROM news_articles WHERE published = 1 AND category_id = ?
         ORDER BY created_at DESC, id DESC LIMIT 100`,
        [effectiveCategoryId]
      )
    : []

  return {
    categories: categories.map(row => ({ id: row.id, name: row.name, sortOrder: row.sort_order })),
    list: rows.map(row => ({
      id: row.id,
      categoryId: row.category_id,
      title: row.title,
      summary: row.summary,
      coverUrl: row.cover_url,
      authorName: row.author_name,
      createdAt: row.created_at
    }))
  }
})
