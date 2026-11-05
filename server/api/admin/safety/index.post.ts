import type { ResultSetHeader } from 'mysql2/promise'

// 场所安全：仅县级可发布，免审核直接公开，自动关联全部场所（无需勾选）。
export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'safety:edit')
  if (!['county', 'super'].includes(admin.roleCode)) {
    throw createError({ statusCode: 403, message: '仅县级可以发布场所安全信息' })
  }
  const body = await readBody(event)
  const title = text(body?.title, '标题')
  const content = cleanRichText(body?.content)
  if (!content.trim()) throw createError({ statusCode: 400, message: '请填写正文内容' })
  const publishUnit = (admin.organization ?? '').trim() || null
  const id = await withTransaction(async (conn) => {
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO safety_articles (title, content, author_name, author_role, publish_unit, state, published, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 'approved', 1, ?, ?)`,
      [title, content, admin.name, admin.roleCode, publishUnit, admin.id, admin.id]
    )
    const articleId = result.insertId
    await conn.execute('INSERT INTO safety_article_venues (article_id, venue_id) SELECT ?, id FROM venues', [articleId])
    return articleId
  })
  await logAction(admin, 'safety', `安全文章#${id}`, `发布安全文章《${title}》`, event)
  return { id }
})
