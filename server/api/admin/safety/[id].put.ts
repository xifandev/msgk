// 场所安全：仅县级可编辑，保存后保持已发布状态并重新关联全部场所。
export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'safety:edit')
  if (!['county', 'super'].includes(admin.roleCode)) {
    throw createError({ statusCode: 403, message: '仅县级可以编辑场所安全信息' })
  }
  const id = positiveId(getRouterParam(event, 'id'), '文章ID')
  const existing = await queryOne<{ id: number }>('SELECT id FROM safety_articles WHERE id = ?', [id])
  if (!existing) throw createError({ statusCode: 404, message: '文章不存在' })
  const body = await readBody(event)
  const title = text(body?.title, '标题')
  const content = cleanRichText(body?.content)
  if (!content.trim()) throw createError({ statusCode: 400, message: '请填写正文内容' })
  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE safety_articles SET title = ?, content = ?, author_name = ?, state = 'approved', updated_by = ? WHERE id = ?`,
      [title, content, admin.name, admin.id, id]
    )
    await conn.execute('DELETE FROM safety_article_venues WHERE article_id = ?', [id])
    await conn.execute('INSERT INTO safety_article_venues (article_id, venue_id) SELECT ?, id FROM venues', [id])
  })
  await logAction(admin, 'safety', `安全文章#${id}`, `修改安全文章《${title}》`, event)
  return { id }
})
