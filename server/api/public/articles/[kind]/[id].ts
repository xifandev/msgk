interface ArticleRow {
  id: number
  title: string
  cover_url: string | null
  content: string
  author_name: string | null
  created_at: string
}

interface NewsRow extends ArticleRow {
  summary: string | null
  category_id: number
}

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  const kind = getRouterParam(event, 'kind')
  if (!['safety', 'notice', 'news'].includes(String(kind))) {
    throw createError({ statusCode: 400, message: '文章类型不正确' })
  }
  const id = positiveId(getRouterParam(event, 'id'), '文章ID')

  if (kind === 'safety') {
    const row = await queryOne<ArticleRow>(
      `SELECT id, title, cover_url, content, author_name, created_at
       FROM safety_articles WHERE id = ? AND state = 'approved' AND published = 1`,
      [id]
    )
    if (!row) throw createError({ statusCode: 404, message: '文章不存在或未公开' })
    return {
      kind: 'safety',
      id: row.id,
      title: row.title,
      coverUrl: row.cover_url,
      content: cleanRichText(row.content),
      authorName: row.author_name,
      createdAt: row.created_at
    }
  }

  if (kind === 'notice') {
    const row = await queryOne<ArticleRow>(
      `SELECT id, title, cover_url, content, author_name, created_at
       FROM notices WHERE id = ? AND kind = 'public' AND published = 1`,
      [id]
    )
    if (!row) throw createError({ statusCode: 404, message: '公告不存在或未公开' })
    return {
      kind: 'notice',
      id: row.id,
      title: row.title,
      coverUrl: row.cover_url,
      content: cleanRichText(row.content),
      authorName: row.author_name,
      createdAt: row.created_at
    }
  }

  const row = await queryOne<NewsRow>(
    `SELECT id, category_id, title, summary, cover_url, content, author_name, created_at
     FROM news_articles WHERE id = ? AND published = 1`,
    [id]
  )
  if (!row) throw createError({ statusCode: 404, message: '文章不存在或未公开' })
  return {
    kind: 'news',
    id: row.id,
    categoryId: row.category_id,
    title: row.title,
    summary: row.summary,
    coverUrl: row.cover_url,
    content: cleanRichText(row.content),
    authorName: row.author_name,
    createdAt: row.created_at
  }
})
