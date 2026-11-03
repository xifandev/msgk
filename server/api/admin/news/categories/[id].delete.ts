export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'news:delete')
  const id = positiveId(getRouterParam(event, 'id'), '分类ID')
  const category = await queryOne<{ id: number, name: string }>('SELECT id, name FROM news_categories WHERE id = ?', [id])
  if (!category) throw createError({ statusCode: 404, message: '分类不存在' })
  const used = await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM news_articles WHERE category_id = ?', [id])
  if ((used?.total ?? 0) > 0) throw createError({ statusCode: 409, message: '该分类下还有文章，不能删除' })
  await execute('DELETE FROM news_categories WHERE id = ?', [id])
  await logAction(admin, 'news', `分类#${id}`, `删除分类「${category.name}」`, event)
  return { ok: true }
})
