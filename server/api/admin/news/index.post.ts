export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'news:edit')
  const body = await readBody(event)
  const categoryId = positiveId(body?.categoryId, '分类')
  const category = await queryOne('SELECT id FROM news_categories WHERE id = ?', [categoryId])
  if (!category) throw createError({ statusCode: 400, message: '所选分类不存在' })
  const title = text(body?.title, '标题')
  const summary = text(body?.summary, '摘要', 500, false)
  const coverUrl = text(body?.coverUrl, '封面地址', 500, false)
  const authorName = text(body?.authorName, '作者', 50, false)
  const content = cleanRichText(body?.content)
  if (!content.trim()) throw createError({ statusCode: 400, message: '请填写正文内容' })
  const result = await execute(
    'INSERT INTO news_articles (category_id, title, summary, cover_url, content, author_name, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [categoryId, title, summary || null, coverUrl || null, content, authorName || null, admin.id, admin.id]
  )
  await logAction(admin, 'news', `新闻#${result.insertId}`, `新建新闻《${title}》`, event)
  return { id: result.insertId }
})
