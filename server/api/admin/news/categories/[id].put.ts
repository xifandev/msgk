export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'news:edit')
  const id = positiveId(getRouterParam(event, 'id'), '分类ID')
  const existing = await queryOne('SELECT id FROM news_categories WHERE id = ?', [id])
  if (!existing) throw createError({ statusCode: 404, message: '分类不存在' })
  const body = await readBody(event)
  const name = text(body?.name, '分类名称', 50)
  const duplicate = await queryOne('SELECT id FROM news_categories WHERE name = ? AND id != ?', [name, id])
  if (duplicate) throw createError({ statusCode: 409, message: '分类名称已存在' })
  await execute('UPDATE news_categories SET name = ? WHERE id = ?', [name, id])
  await logAction(admin, 'news', `分类#${id}`, `修改分类「${name}」`, event)
  return { id }
})
